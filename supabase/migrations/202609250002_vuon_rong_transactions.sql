CREATE TABLE public.game_action_requests (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action_type text NOT NULL,
  idempotency_key uuid NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_type, idempotency_key)
);

ALTER TABLE public.game_action_requests ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public._claim_game_action(p_action_type text, p_idempotency_key uuid)
RETURNS TABLE (is_new boolean, prior_result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  inserted_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.game_action_requests (user_id, action_type, idempotency_key)
  VALUES (actor_id, p_action_type, p_idempotency_key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 1 THEN
    RETURN QUERY SELECT true, NULL::jsonb;
  ELSE
    RETURN QUERY
    SELECT false, action.result
    FROM public.game_action_requests AS action
    WHERE action.user_id = actor_id
      AND action.action_type = p_action_type
      AND action.idempotency_key = p_idempotency_key;
  END IF;
END;
$$;

CREATE FUNCTION public._finish_game_action(
  p_action_type text,
  p_idempotency_key uuid,
  p_result jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.game_action_requests
  SET result = p_result
  WHERE user_id = auth.uid()
    AND action_type = p_action_type
    AND idempotency_key = p_idempotency_key;
$$;

CREATE FUNCTION public.purchase_seed(
  p_seed_key text,
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
  seed public.seed_catalog%ROWTYPE;
  wallet public.dragon_wallets%ROWTYPE;
  total_price integer;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('purchase_seed', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO seed FROM public.seed_catalog WHERE seed_key = p_seed_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seed_unavailable' USING ERRCODE = '22023'; END IF;
  total_price := seed.price_xu * p_quantity;

  SELECT * INTO wallet FROM public.dragon_wallets WHERE user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF wallet.balance < total_price THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.dragon_wallets
  SET balance = balance - total_price, updated_at = now()
  WHERE user_id = actor_id
  RETURNING * INTO wallet;
  INSERT INTO public.seed_inventory (user_id, seed_key, quantity)
  VALUES (actor_id, p_seed_key, p_quantity)
  ON CONFLICT (user_id, seed_key) DO UPDATE
  SET quantity = public.seed_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
  INSERT INTO public.dragon_wallet_transactions
    (user_id, amount, transaction_type, reference, idempotency_key, balance_after)
  VALUES (actor_id, -total_price, 'seed_purchase', p_seed_key, p_idempotency_key, wallet.balance);

  SELECT jsonb_build_object(
    'balance', wallet.balance,
    'seed_key', p_seed_key,
    'quantity', inventory.quantity,
    'purchased', p_quantity,
    'total_price', total_price
  ) INTO result
  FROM public.seed_inventory AS inventory
  WHERE inventory.user_id = actor_id AND inventory.seed_key = p_seed_key;
  PERFORM public._finish_game_action('purchase_seed', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.plant_crop(
  p_slot_index integer,
  p_seed_key text,
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
  seed public.seed_catalog%ROWTYPE;
  remaining integer;
  attacked boolean;
  v_planted_at timestamptz := clock_timestamp();
  v_ready_at timestamptz;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('plant_crop', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  IF p_slot_index IS NULL OR p_slot_index NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO seed FROM public.seed_catalog WHERE seed_key = p_seed_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seed_unavailable' USING ERRCODE = '22023'; END IF;
  IF seed.bottom_row_only AND p_slot_index < 9 THEN
    RAISE EXCEPTION 'bottom row only' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO slot
  FROM public.garden_slots
  WHERE user_id = actor_id AND slot_index = p_slot_index
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'slot_not_found' USING ERRCODE = 'P0002'; END IF;
  IF slot.status <> 'empty' THEN RAISE EXCEPTION 'slot_not_empty' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.seed_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = actor_id AND seed_key = p_seed_key AND quantity > 0
  RETURNING quantity INTO remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'seed_not_in_inventory' USING ERRCODE = 'P0001'; END IF;

  attacked := random() < 0.05;
  v_ready_at := v_planted_at + make_interval(secs => seed.growth_seconds * (1.0 + CASE WHEN attacked THEN 0.1 ELSE 0 END));
  UPDATE public.garden_slots
  SET seed_key = p_seed_key,
      status = 'growing',
      planted_at = v_planted_at,
      ready_at = v_ready_at,
      snail_attacked = attacked,
      updated_at = now()
  WHERE id = slot.id;
  result := jsonb_build_object(
    'slot_index', p_slot_index,
    'seed_key', p_seed_key,
    'planted_at', v_planted_at,
    'ready_at', v_ready_at,
    'snail_attacked', attacked,
    'inventory_remaining', remaining
  );
  PERFORM public._finish_game_action('plant_crop', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.plant_crops(
  p_slot_indices integer[],
  p_seed_key text,
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
  seed public.seed_catalog%ROWTYPE;
  slot record;
  eligible_indices integer[] := ARRAY[]::integer[];
  v_slot_index integer;
  available integer;
  used integer := 0;
  v_planted_at timestamptz;
  v_ready_at timestamptz;
  attacked boolean;
  planted jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('plant_crops', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  SELECT * INTO seed FROM public.seed_catalog WHERE seed_key = p_seed_key AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'seed_unavailable' USING ERRCODE = '22023'; END IF;
  FOR slot IN
    SELECT garden.slot_index
    FROM public.garden_slots AS garden
    WHERE garden.user_id = actor_id
      AND garden.slot_index = ANY(coalesce(p_slot_indices, ARRAY[]::integer[]))
      AND garden.status = 'empty'
      AND (NOT seed.bottom_row_only OR garden.slot_index >= 9)
    ORDER BY garden.slot_index
    FOR UPDATE
  LOOP
    eligible_indices := array_append(eligible_indices, slot.slot_index);
  END LOOP;

  SELECT coalesce(quantity, 0) INTO available
  FROM public.seed_inventory
  WHERE user_id = actor_id AND seed_key = p_seed_key
  FOR UPDATE;
  IF NOT FOUND THEN available := 0; END IF;

  FOREACH v_slot_index IN ARRAY eligible_indices
  LOOP
    EXIT WHEN used >= available;
    v_planted_at := clock_timestamp();
    attacked := random() < 0.05;
    v_ready_at := v_planted_at + make_interval(secs => seed.growth_seconds * (1.0 + CASE WHEN attacked THEN 0.1 ELSE 0 END));
    UPDATE public.garden_slots
    SET seed_key = p_seed_key,
        status = 'growing',
        planted_at = v_planted_at,
        ready_at = v_ready_at,
        snail_attacked = attacked,
        updated_at = now()
    WHERE user_id = actor_id AND slot_index = v_slot_index;
    planted := planted || jsonb_build_array(jsonb_build_object(
      'slot_index', v_slot_index,
      'seed_key', p_seed_key,
      'planted_at', v_planted_at,
      'ready_at', v_ready_at,
      'snail_attacked', attacked
    ));
    used := used + 1;
  END LOOP;

  IF used > 0 THEN
    UPDATE public.seed_inventory
    SET quantity = quantity - used, updated_at = now()
    WHERE user_id = actor_id AND seed_key = p_seed_key;
  END IF;
  SELECT jsonb_build_object(
    'planted', planted,
    'consumed', used,
    'inventory_remaining', greatest(coalesce(available, 0) - used, 0)
  ) INTO result;
  PERFORM public._finish_game_action('plant_crops', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public._harvest_slots(p_user_id uuid, p_slot_indices integer[])
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
      WHEN lessons >= 50 THEN 22
      WHEN lessons >= 40 THEN 18
      WHEN lessons >= 24 THEN 15
      WHEN lessons >= 18 THEN 13
      WHEN lessons >= 10 THEN 10
      WHEN lessons >= 4 THEN 8
      ELSE 5
    END;
    base_reward := crop.reward_min + floor(random() * (crop.reward_max - crop.reward_min + 1))::integer;
    final_reward := floor(base_reward * (100 + bonus_percent) / 100.0)::integer;
    total := total + final_reward;
    UPDATE public.garden_slots
    SET seed_key = NULL,
        status = 'empty',
        planted_at = NULL,
        ready_at = NULL,
        snail_attacked = false,
        updated_at = now()
    WHERE id = slot.id;
    results := results || jsonb_build_array(jsonb_build_object(
      'slot_index', slot.slot_index,
      'success', true,
      'seed_key', slot.seed_key,
      'base_reward', base_reward,
      'bonus_percent', bonus_percent,
      'reward', final_reward
    ));
  END LOOP;
  RETURN QUERY SELECT results, total;
END;
$$;

CREATE FUNCTION public._harvest_operation(
  p_action_type text,
  p_slot_indices integer[],
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
  harvest record;
  wallet public.dragon_wallets%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action(p_action_type, p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  SELECT * INTO harvest FROM public._harvest_slots(actor_id, p_slot_indices);
  SELECT * INTO wallet FROM public.dragon_wallets WHERE user_id = actor_id FOR UPDATE;
  IF harvest.total_reward > 0 THEN
    UPDATE public.dragon_wallets
    SET balance = balance + harvest.total_reward, updated_at = now()
    WHERE user_id = actor_id
    RETURNING * INTO wallet;
    INSERT INTO public.dragon_wallet_transactions
      (user_id, amount, transaction_type, reference, idempotency_key, balance_after)
    VALUES (
      actor_id,
      harvest.total_reward,
      'harvest',
      p_action_type,
      p_idempotency_key,
      wallet.balance
    );
  END IF;
  result := jsonb_build_object(
    'results', harvest.slot_results,
    'reward_total', harvest.total_reward,
    'balance', wallet.balance
  );
  PERFORM public._finish_game_action(p_action_type, p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.harvest_crop(p_slot_index integer, p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._harvest_operation('harvest_crop', ARRAY[p_slot_index], p_idempotency_key);
$$;

CREATE FUNCTION public.harvest_crops(p_slot_indices integer[], p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._harvest_operation('harvest_crops', p_slot_indices, p_idempotency_key);
$$;

CREATE FUNCTION public.exchange_seed(
  p_from_seed text,
  p_to_seed text,
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
  from_crop public.seed_catalog%ROWTYPE;
  to_crop public.seed_catalog%ROWTYPE;
  wallet public.dragon_wallets%ROWTYPE;
  quantity_left integer;
  wallet_delta integer;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('exchange_seed', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  IF p_from_seed = p_to_seed THEN RAISE EXCEPTION 'same_seed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO from_crop FROM public.seed_catalog WHERE seed_key = p_from_seed AND active FOR SHARE;
  SELECT * INTO to_crop FROM public.seed_catalog WHERE seed_key = p_to_seed AND active FOR SHARE;
  IF from_crop.seed_key IS NULL OR to_crop.seed_key IS NULL THEN
    RAISE EXCEPTION 'seed_unavailable' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO wallet FROM public.dragon_wallets WHERE user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF wallet.balance < greatest(to_crop.price_xu - from_crop.price_xu, 0) THEN
    RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.seed_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = actor_id AND seed_key = p_from_seed AND quantity > 0
  RETURNING quantity INTO quantity_left;
  IF NOT FOUND THEN RAISE EXCEPTION 'seed_not_in_inventory' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.seed_inventory (user_id, seed_key, quantity)
  VALUES (actor_id, p_to_seed, 1)
  ON CONFLICT (user_id, seed_key) DO UPDATE
  SET quantity = public.seed_inventory.quantity + 1, updated_at = now();

  wallet_delta := from_crop.price_xu - to_crop.price_xu;
  IF wallet_delta <> 0 THEN
    UPDATE public.dragon_wallets
    SET balance = balance + wallet_delta, updated_at = now()
    WHERE user_id = actor_id
    RETURNING * INTO wallet;
    INSERT INTO public.dragon_wallet_transactions
      (user_id, amount, transaction_type, reference, idempotency_key, balance_after)
    VALUES (actor_id, wallet_delta, 'seed_exchange', p_from_seed || '->' || p_to_seed, p_idempotency_key, wallet.balance);
  END IF;
  result := jsonb_build_object(
    'balance', wallet.balance,
    'from_seed', p_from_seed,
    'to_seed', p_to_seed,
    'wallet_delta', wallet_delta,
    'from_quantity', quantity_left
  );
  PERFORM public._finish_game_action('exchange_seed', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.redeem_game_gift(p_gift_id uuid, p_idempotency_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  action record;
  gift public.game_gifts%ROWTYPE;
  wallet public.dragon_wallets%ROWTYPE;
  redemption public.gift_redemptions%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO action FROM public._claim_game_action('redeem_game_gift', p_idempotency_key);
  IF NOT action.is_new THEN RETURN action.prior_result; END IF;
  SELECT * INTO gift FROM public.game_gifts WHERE id = p_gift_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_unavailable' USING ERRCODE = '22023'; END IF;
  SELECT * INTO wallet FROM public.dragon_wallets WHERE user_id = actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF wallet.balance < gift.price_xu THEN RAISE EXCEPTION 'insufficient_balance' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.dragon_wallets
  SET balance = balance - gift.price_xu, updated_at = now()
  WHERE user_id = actor_id
  RETURNING * INTO wallet;
  INSERT INTO public.gift_redemptions (user_id, gift_id, price_xu)
  VALUES (actor_id, gift.id, gift.price_xu)
  RETURNING * INTO redemption;
  INSERT INTO public.dragon_wallet_transactions
    (user_id, amount, transaction_type, reference, idempotency_key, balance_after)
  VALUES (actor_id, -gift.price_xu, 'gift_redemption', gift.gift_key, p_idempotency_key, wallet.balance);

  result := jsonb_build_object(
    'balance', wallet.balance,
    'redemption_id', redemption.id,
    'gift_id', gift.id,
    'price_xu', gift.price_xu
  );
  PERFORM public._finish_game_action('redeem_game_gift', p_idempotency_key, result);
  RETURN result;
END;
$$;

CREATE FUNCTION public.sync_learning_progress(
  p_user_id uuid,
  p_completed_lessons integer,
  p_source_reference text
)
RETURNS public.learning_progress
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  progress public.learning_progress%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_completed_lessons IS NULL OR p_completed_lessons < 0 THEN
    RAISE EXCEPTION 'invalid_learning_progress' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_source_reference), '') IS NULL THEN
    RAISE EXCEPTION 'lesson_source_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.learning_progress (user_id, completed_lessons, source_reference)
  VALUES (p_user_id, p_completed_lessons, p_source_reference)
  ON CONFLICT (user_id) DO UPDATE
  SET completed_lessons = greatest(public.learning_progress.completed_lessons, EXCLUDED.completed_lessons),
      source_reference = EXCLUDED.source_reference,
      updated_at = now()
  RETURNING * INTO progress;
  RETURN progress;
END;
$$;

REVOKE ALL ON FUNCTION public._claim_game_action(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._finish_game_action(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._harvest_slots(uuid, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._harvest_operation(text, integer[], uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.purchase_seed(text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plant_crop(integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plant_crops(integer[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.harvest_crop(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.harvest_crops(integer[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exchange_seed(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_game_gift(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_learning_progress(uuid, integer, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purchase_seed(text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plant_crop(integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plant_crops(integer[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.harvest_crop(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.harvest_crops(integer[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_seed(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_game_gift(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_learning_progress(uuid, integer, text) TO service_role;
