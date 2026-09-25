CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL CHECK (char_length(username) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dragon_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dragon_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount <> 0),
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('topup', 'seed_purchase', 'harvest', 'gift_redemption', 'seed_exchange')
  ),
  reference text,
  idempotency_key uuid,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX dragon_wallet_transactions_user_created_idx
  ON public.dragon_wallet_transactions (user_id, created_at DESC);

CREATE TABLE public.learning_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  completed_lessons integer NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),
  source_reference text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.seed_catalog (
  seed_key text PRIMARY KEY,
  display_name text NOT NULL,
  price_xu integer NOT NULL CHECK (price_xu > 0),
  growth_seconds integer NOT NULL CHECK (growth_seconds > 0),
  reward_min integer NOT NULL CHECK (reward_min >= 0),
  reward_max integer NOT NULL CHECK (reward_max >= reward_min),
  bottom_row_only boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO public.seed_catalog
  (seed_key, display_name, price_xu, growth_seconds, reward_min, reward_max, bottom_row_only)
VALUES
  ('red-rose', 'Hồng Đỏ', 5, 7200, 9, 11, false),
  ('purple-flower', 'Hoa Tím', 8, 21600, 12, 16, false),
  ('yellow-rose', 'Hồng Vàng', 12, 43200, 17, 22, false),
  ('apple', 'Táo', 15, 86400, 26, 33, true),
  ('pear', 'Lê', 20, 172800, 44, 54, true),
  ('purple-rose', 'Hồng Tím', 25, 172800, 52, 62, true),
  ('orchid', 'Phong Lan', 30, 172800, 60, 72, true);

CREATE TABLE public.garden_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index BETWEEN 1 AND 12),
  seed_key text REFERENCES public.seed_catalog (seed_key),
  status text NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'growing', 'harvestable')),
  planted_at timestamptz,
  ready_at timestamptz,
  snail_attacked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_index),
  CHECK (
    (status = 'empty' AND seed_key IS NULL AND planted_at IS NULL AND ready_at IS NULL AND snail_attacked = false)
    OR
    (status <> 'empty' AND seed_key IS NOT NULL AND planted_at IS NOT NULL AND ready_at IS NOT NULL)
  )
);

CREATE TABLE public.seed_inventory (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  seed_key text NOT NULL REFERENCES public.seed_catalog (seed_key),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seed_key)
);

CREATE TABLE public.game_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_xu integer NOT NULL CHECK (price_xu > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gift_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.game_gifts (id),
  price_xu integer NOT NULL CHECK (price_xu > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gift_redemptions_user_created_idx
  ON public.gift_redemptions (user_id, created_at DESC);

CREATE FUNCTION public.initialize_dragon_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_name text;
BEGIN
  profile_name := coalesce(
    nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Dragon user'
  );

  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, profile_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.dragon_wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.learning_progress (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.garden_slots (user_id, slot_index)
  SELECT NEW.id, slot_index
  FROM generate_series(1, 12) AS slot_index
  ON CONFLICT (user_id, slot_index) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_initialize_dragon
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.initialize_dragon_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dragon_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dragon_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_own ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY wallets_read_own ON public.dragon_wallets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY wallet_transactions_read_own ON public.dragon_wallet_transactions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY learning_progress_read_own ON public.learning_progress
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY garden_slots_read_own ON public.garden_slots
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY seed_inventory_read_own ON public.seed_inventory
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY seed_catalog_read_authenticated ON public.seed_catalog
  FOR SELECT TO authenticated USING (active);
CREATE POLICY game_gifts_read_authenticated ON public.game_gifts
  FOR SELECT TO authenticated USING (active);
CREATE POLICY gift_redemptions_read_own ON public.gift_redemptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.dragon_wallets TO authenticated;
GRANT SELECT ON public.dragon_wallet_transactions TO authenticated;
GRANT SELECT ON public.learning_progress TO authenticated;
GRANT SELECT ON public.garden_slots TO authenticated;
GRANT SELECT ON public.seed_inventory TO authenticated;
GRANT SELECT ON public.seed_catalog, public.game_gifts TO authenticated;
GRANT SELECT ON public.gift_redemptions TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
