-- Apply each learner's current Dragon pot growth bonus when planting crops.
CREATE OR REPLACE FUNCTION public._garden_adjusted_growth_seconds(
  p_user_id uuid,
  p_growth_seconds integer,
  p_snail_attacked boolean
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  lessons integer;
  bonus_percent integer;
BEGIN
  SELECT coalesce(max(progress.completed_lessons), 0) INTO lessons
  FROM public.learning_progress AS progress
  WHERE progress.user_id = p_user_id;

  bonus_percent := CASE
    WHEN lessons >= 50 THEN 22
    WHEN lessons >= 40 THEN 20
    WHEN lessons >= 32 THEN 18
    WHEN lessons >= 24 THEN 15
    WHEN lessons >= 18 THEN 13
    WHEN lessons >= 10 THEN 10
    WHEN lessons >= 4 THEN 8
    ELSE 5
  END;

  RETURN ceil(
    p_growth_seconds * (1.0 + CASE WHEN p_snail_attacked THEN 0.1 ELSE 0 END)
    / (1.0 + bonus_percent / 100.0)
  )::integer;
END;
$$;

REVOKE ALL ON FUNCTION public._garden_adjusted_growth_seconds(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.plant_crop(
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
  IF seed.bottom_row_only AND p_slot_index < 7 THEN
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
  v_ready_at := v_planted_at + make_interval(secs => public._garden_adjusted_growth_seconds(actor_id, seed.growth_seconds, attacked));
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

CREATE OR REPLACE FUNCTION public.plant_crops(
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
      AND (NOT seed.bottom_row_only OR garden.slot_index >= 7)
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
    v_ready_at := v_planted_at + make_interval(secs => public._garden_adjusted_growth_seconds(actor_id, seed.growth_seconds, attacked));
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
