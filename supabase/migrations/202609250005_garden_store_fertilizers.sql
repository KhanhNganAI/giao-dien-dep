-- Add a user inventory for fertilizers and secure purchase/application RPCs.
ALTER TABLE public.dragon_wallet_transactions
  DROP CONSTRAINT IF EXISTS dragon_wallet_transactions_transaction_type_check;
ALTER TABLE public.dragon_wallet_transactions
  ADD CONSTRAINT dragon_wallet_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'topup', 'seed_purchase', 'fertilizer_purchase', 'harvest',
    'gift_redemption', 'seed_exchange', 'admin_adjustment'
  ));

ALTER TABLE public.garden_slots
  ADD COLUMN fertilizer_uses integer NOT NULL DEFAULT 0,
  ADD COLUMN bloom_bonus_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT garden_slots_fertilizer_uses_check CHECK (fertilizer_uses BETWEEN 0 AND 3),
  ADD CONSTRAINT garden_slots_bloom_bonus_count_check CHECK (bloom_bonus_count BETWEEN 0 AND 3);

CREATE TABLE public.fertilizer_inventory (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fertilizer_type text NOT NULL CHECK (fertilizer_type IN ('growth', 'bloom')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fertilizer_type)
);

ALTER TABLE public.fertilizer_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY fertilizer_inventory_read_own ON public.fertilizer_inventory
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.fertilizer_inventory TO authenticated;
GRANT ALL ON public.fertilizer_inventory TO service_role;

CREATE FUNCTION public._reset_garden_fertilizers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.status = 'empty' AND NEW.status <> 'empty') OR NEW.status = 'empty' THEN
    NEW.fertilizer_uses := 0;
    NEW.bloom_bonus_count := 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reset_garden_fertilizers_on_crop_change
BEFORE UPDATE OF status ON public.garden_slots
FOR EACH ROW EXECUTE FUNCTION public._reset_garden_fertilizers();

CREATE FUNCTION public.purchase_fertilizer(
  p_fertilizer_type text,
  p_quantity integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  action record;
  wallet public.dragon_wallets%ROWTYPE;
  inventory public.fertilizer_inventory%ROWTYPE;
  unit_price integer;
  total_price integer;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('purchase_fertilizer', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  IF p_fertilizer_type IS NULL OR p_fertilizer_type NOT IN ('growth', 'bloom') THEN
    RAISE EXCEPTION 'fertilizer_unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;
  unit_price := CASE p_fertilizer_type WHEN 'growth' THEN 6 ELSE 3 END;
  total_price := unit_price * p_quantity;
  SELECT * INTO wallet FROM public.dragon_wallets WHERE user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF wallet.balance < total_price THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.dragon_wallets
  SET balance = balance - total_price, updated_at = now()
  WHERE user_id = actor_id RETURNING * INTO wallet;
  INSERT INTO public.fertilizer_inventory (user_id, fertilizer_type, quantity)
  VALUES (actor_id, p_fertilizer_type, p_quantity)
  ON CONFLICT (user_id, fertilizer_type) DO UPDATE
  SET quantity = public.fertilizer_inventory.quantity + EXCLUDED.quantity,
      updated_at = now()
  RETURNING * INTO inventory;
  INSERT INTO public.dragon_wallet_transactions
    (user_id, amount, transaction_type, reference, idempotency_key, balance_after)
  VALUES (
    actor_id, -total_price, 'fertilizer_purchase', p_fertilizer_type,
    p_idempotency_key, wallet.balance
  );
  result := jsonb_build_object(
    'balance', wallet.balance,
    'fertilizer_type', p_fertilizer_type,
    'quantity', inventory.quantity,
    'purchased', p_quantity,
    'total_price', total_price
  );
  PERFORM public._finish_game_action('purchase_fertilizer', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.apply_fertilizer(
  p_slot_index integer,
  p_fertilizer_type text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  action record;
  slot public.garden_slots%ROWTYPE;
  remaining integer;
  updated_slot public.garden_slots%ROWTYPE;
  result jsonb;
  now_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO action FROM public._claim_game_action('apply_fertilizer', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  IF p_slot_index IS NULL OR p_slot_index NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END IF;
  IF p_fertilizer_type IS NULL OR p_fertilizer_type NOT IN ('growth', 'bloom') THEN
    RAISE EXCEPTION 'fertilizer_unavailable' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO slot FROM public.garden_slots
  WHERE user_id = actor_id AND slot_index = p_slot_index FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_found' USING ERRCODE = 'P0002'; END IF;
  IF slot.status <> 'growing' OR slot.ready_at <= now_at THEN
    RAISE EXCEPTION 'crop_not_growing' USING ERRCODE = 'P0001';
  END IF;
  IF slot.fertilizer_uses >= 3 THEN
    RAISE EXCEPTION 'fertilizer_limit' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.fertilizer_inventory (user_id, fertilizer_type, quantity)
  VALUES (actor_id, p_fertilizer_type, 0)
  ON CONFLICT (user_id, fertilizer_type) DO NOTHING;
  UPDATE public.fertilizer_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = actor_id AND fertilizer_type = p_fertilizer_type AND quantity > 0
  RETURNING quantity INTO remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'fertilizer_not_in_inventory' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.garden_slots
  SET ready_at = CASE
        WHEN p_fertilizer_type = 'growth'
        THEN now_at + ((ready_at - now_at) * 0.9)
        ELSE ready_at
      END,
      fertilizer_uses = fertilizer_uses + 1,
      bloom_bonus_count = bloom_bonus_count + CASE WHEN p_fertilizer_type = 'bloom' THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE id = slot.id
  RETURNING * INTO updated_slot;
  result := jsonb_build_object(
    'slot_index', p_slot_index,
    'fertilizer_type', p_fertilizer_type,
    'fertilizer_uses', updated_slot.fertilizer_uses,
    'bloom_bonus_count', updated_slot.bloom_bonus_count,
    'ready_at', updated_slot.ready_at,
    'inventory_remaining', remaining
  );
  PERFORM public._finish_game_action('apply_fertilizer', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public._harvest_slots(p_user_id uuid, p_slot_indices integer[])
RETURNS TABLE (slot_results jsonb, total_reward integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  slot record;
  crop public.seed_catalog%ROWTYPE;
  lessons integer;
  bonus_percent integer;
  fertilizer_bonus_percent integer;
  base_reward integer;
  final_reward integer;
  results jsonb := '[]'::jsonb;
  total integer := 0;
  now_at timestamptz := clock_timestamp();
BEGIN
  FOR slot IN
    SELECT garden.*
    FROM public.garden_slots AS garden
    WHERE garden.user_id = p_user_id
      AND garden.slot_index = ANY(coalesce(p_slot_indices, ARRAY[]::integer[]))
    ORDER BY garden.slot_index
    FOR UPDATE
  LOOP
    IF slot.status = 'empty' THEN
      results := results || jsonb_build_array(jsonb_build_object('slot_index', slot.slot_index, 'success', false, 'error', 'empty'));
      CONTINUE;
    END IF;
    IF slot.status = 'growing' AND slot.ready_at > now_at THEN
      results := results || jsonb_build_array(jsonb_build_object('slot_index', slot.slot_index, 'success', false, 'error', 'not_ready'));
      CONTINUE;
    END IF;
    SELECT * INTO crop FROM public.seed_catalog WHERE seed_key = slot.seed_key FOR SHARE;
    SELECT coalesce(progress.completed_lessons, 0) INTO lessons
    FROM public.learning_progress AS progress
    WHERE progress.user_id = p_user_id;
    bonus_percent := CASE
      WHEN lessons >= 50 THEN 22 WHEN lessons >= 40 THEN 18 WHEN lessons >= 24 THEN 15
      WHEN lessons >= 18 THEN 13 WHEN lessons >= 10 THEN 10 WHEN lessons >= 4 THEN 8 ELSE 5
    END;
    fertilizer_bonus_percent := slot.bloom_bonus_count * 2;
    base_reward := crop.reward_min + floor(random() * (crop.reward_max - crop.reward_min + 1))::integer;
    final_reward := floor(base_reward * (100 + bonus_percent + fertilizer_bonus_percent) / 100.0)::integer;
    total := total + final_reward;
    UPDATE public.garden_slots
    SET seed_key = NULL, status = 'empty', planted_at = NULL, ready_at = NULL,
        snail_attacked = false, updated_at = now()
    WHERE id = slot.id;
    results := results || jsonb_build_array(jsonb_build_object(
      'slot_index', slot.slot_index, 'success', true, 'seed_key', slot.seed_key,
      'base_reward', base_reward, 'bonus_percent', bonus_percent,
      'fertilizer_bonus_percent', fertilizer_bonus_percent, 'reward', final_reward
    ));
  END LOOP;
  RETURN QUERY SELECT results, total;
END;
$$;

REVOKE ALL ON FUNCTION public._reset_garden_fertilizers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_fertilizer(text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_fertilizer(integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_fertilizer(text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fertilizer(integer, text, uuid) TO authenticated;
