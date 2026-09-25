CREATE TABLE public.wallet_topup_bundles (
  bundle_id text PRIMARY KEY,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  xu_amount integer NOT NULL CHECK (xu_amount > 0),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.wallet_topup_bundles (bundle_id, amount_vnd, xu_amount)
VALUES
  ('xu-10000', 100000, 10000),
  ('xu-30000', 300000, 30000),
  ('xu-50000', 500000, 50000);

CREATE TABLE public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  bundle_id text NOT NULL REFERENCES public.wallet_topup_bundles (bundle_id),
  payment_code text NOT NULL UNIQUE,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  xu_amount integer NOT NULL CHECK (xu_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'review')),
  expires_at timestamptz NOT NULL,
  provider_transaction_id bigint UNIQUE,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX wallet_topups_user_created_idx ON public.wallet_topups (user_id, created_at DESC);

CREATE TABLE public.sepay_webhook_events (
  transaction_id bigint PRIMARY KEY CHECK (transaction_id > 0),
  payment_code text,
  transfer_type text NOT NULL CHECK (transfer_type IN ('in', 'out')),
  transfer_amount bigint NOT NULL CHECK (transfer_amount > 0),
  receiving_account text NOT NULL,
  provider_reference text,
  outcome text NOT NULL,
  topup_id uuid REFERENCES public.wallet_topups (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_topup_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sepay_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_topups_read_own ON public.wallet_topups
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topup_bundles, public.wallet_topups, public.sepay_webhook_events TO service_role;

CREATE UNIQUE INDEX dragon_wallet_topup_provider_reference_uq
  ON public.dragon_wallet_transactions (reference)
  WHERE transaction_type = 'topup' AND reference IS NOT NULL;

CREATE FUNCTION public.create_wallet_topup(p_bundle_id text, p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  action record;
  bundle public.wallet_topup_bundles%ROWTYPE;
  topup public.wallet_topups%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('create_wallet_topup', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  SELECT * INTO bundle
  FROM public.wallet_topup_bundles
  WHERE bundle_id = p_bundle_id AND active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'topup_bundle_unavailable' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.wallet_topups
    (user_id, bundle_id, payment_code, amount_vnd, xu_amount, expires_at)
  VALUES (
    actor_id,
    bundle.bundle_id,
    'DRAGON' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    bundle.amount_vnd,
    bundle.xu_amount,
    now() + interval '30 minutes'
  )
  RETURNING * INTO topup;
  result := jsonb_build_object(
    'topup_id', topup.id,
    'payment_code', topup.payment_code,
    'amount_vnd', topup.amount_vnd,
    'xu_amount', topup.xu_amount,
    'expires_at', topup.expires_at,
    'status', topup.status
  );
  PERFORM public._finish_game_action('create_wallet_topup', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.process_sepay_topup(
  p_transaction_id bigint,
  p_payment_code text,
  p_transfer_type text,
  p_transfer_amount bigint,
  p_provider_reference text,
  p_receiving_account text,
  p_expected_receiving_account text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  event_inserted integer;
  topup public.wallet_topups%ROWTYPE;
  wallet public.dragon_wallets%ROWTYPE;
  new_outcome text;
BEGIN
  IF p_transaction_id IS NULL OR p_transaction_id <= 0
     OR p_transfer_amount IS NULL OR p_transfer_amount <= 0
     OR p_transfer_type IS NULL OR p_transfer_type NOT IN ('in', 'out')
     OR nullif(btrim(p_receiving_account), '') IS NULL
     OR nullif(btrim(p_expected_receiving_account), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_sepay_transaction' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sepay_webhook_events
    (transaction_id, payment_code, transfer_type, transfer_amount, receiving_account, provider_reference, outcome)
  VALUES (
    p_transaction_id,
    nullif(btrim(p_payment_code), ''),
    p_transfer_type,
    p_transfer_amount,
    btrim(p_receiving_account),
    nullif(btrim(p_provider_reference), ''),
    'received'
  )
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS event_inserted = ROW_COUNT;
  IF event_inserted = 0 THEN
    RETURN jsonb_build_object('status', 'duplicate', 'duplicate', true, 'credited', false);
  END IF;

  IF p_transfer_type = 'out' THEN
    UPDATE public.sepay_webhook_events SET outcome = 'ignored_outgoing' WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'ignored_outgoing', 'duplicate', false, 'credited', false);
  END IF;
  IF btrim(p_receiving_account) <> btrim(p_expected_receiving_account) THEN
    SELECT id INTO topup.id FROM public.wallet_topups WHERE payment_code = nullif(btrim(p_payment_code), '');
    UPDATE public.sepay_webhook_events
    SET outcome = 'review_receiving_account_mismatch', topup_id = topup.id
    WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'review_receiving_account_mismatch', 'duplicate', false, 'credited', false);
  END IF;
  IF nullif(btrim(p_payment_code), '') IS NULL THEN
    UPDATE public.sepay_webhook_events SET outcome = 'review_missing_code' WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'review_missing_code', 'duplicate', false, 'credited', false);
  END IF;

  SELECT * INTO topup
  FROM public.wallet_topups
  WHERE payment_code = btrim(p_payment_code)
  FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.sepay_webhook_events SET outcome = 'review_unknown_code' WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'review_unknown_code', 'duplicate', false, 'credited', false);
  END IF;
  IF topup.status <> 'pending' THEN
    UPDATE public.sepay_webhook_events
    SET outcome = 'review_order_not_pending', topup_id = topup.id
    WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'review_order_not_pending', 'duplicate', false, 'credited', false);
  END IF;
  IF topup.expires_at <= now() THEN
    UPDATE public.wallet_topups SET status = 'expired' WHERE id = topup.id;
    UPDATE public.sepay_webhook_events SET outcome = 'expired', topup_id = topup.id WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'expired', 'duplicate', false, 'credited', false);
  END IF;
  IF topup.amount_vnd <> p_transfer_amount THEN
    UPDATE public.wallet_topups SET status = 'review' WHERE id = topup.id;
    UPDATE public.sepay_webhook_events SET outcome = 'review_amount_mismatch', topup_id = topup.id WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('status', 'review_amount_mismatch', 'duplicate', false, 'credited', false);
  END IF;

  SELECT * INTO wallet
  FROM public.dragon_wallets
  WHERE user_id = topup.user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.dragon_wallets
  SET balance = balance + topup.xu_amount, updated_at = now()
  WHERE user_id = topup.user_id
  RETURNING * INTO wallet;
  UPDATE public.wallet_topups
  SET status = 'paid',
      provider_transaction_id = p_transaction_id,
      provider_reference = nullif(btrim(p_provider_reference), ''),
      paid_at = now()
  WHERE id = topup.id;
  INSERT INTO public.dragon_wallet_transactions
    (user_id, amount, transaction_type, reference, balance_after)
  VALUES (
    topup.user_id,
    topup.xu_amount,
    'topup',
    'sepay:' || p_transaction_id::text,
    wallet.balance
  );
  UPDATE public.sepay_webhook_events
  SET outcome = 'credited', topup_id = topup.id
  WHERE transaction_id = p_transaction_id;
  RETURN jsonb_build_object(
    'status', 'credited',
    'duplicate', false,
    'credited', true,
    'topup_id', topup.id,
    'xu_amount', topup.xu_amount,
    'balance', wallet.balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_wallet_topup(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_sepay_topup(bigint, text, text, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet_topup(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sepay_topup(bigint, text, text, bigint, text, text, text) TO service_role;
