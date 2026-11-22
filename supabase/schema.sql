-- ============================================================================
-- EcoBanco Bolivia - Esquema Supabase Consolidado (100% Idempotente)
-- Stellar Testnet · Multiusuario por cookie HttpOnly · Sin duplicados
-- Mantiene intacta la cuenta real de Doña Eliana (mer-eliana-01 / 73540555)
-- ============================================================================

-- 1. TABLA: users
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'merchant', 'rider')),
  name TEXT NOT NULL,
  store_name TEXT,
  store_description TEXT DEFAULT '',
  address TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  schedule TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  profile_completed BOOLEAN DEFAULT FALSE,
  phone TEXT UNIQUE,
  password TEXT,
  bank_qr_url TEXT DEFAULT '',
  email TEXT,
  is_prosumer BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  fiat_wallet_enabled BOOLEAN DEFAULT FALSE,
  motes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  qr_enabled BOOLEAN DEFAULT FALSE,
  motes_balance NUMERIC NOT NULL DEFAULT 0,
  fiat_balance_bs NUMERIC NOT NULL DEFAULT 0,
  free_deliveries_remaining INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT,
  invited_count INTEGER NOT NULL DEFAULT 0,
  motes_earned NUMERIC NOT NULL DEFAULT 0,
  free_deliveries_earned INTEGER NOT NULL DEFAULT 0,
  ci_number TEXT DEFAULT '',
  selfie_url TEXT DEFAULT '',
  ci_photo_url TEXT DEFAULT '',
  rider_verified BOOLEAN NOT NULL DEFAULT FALSE,
  rider_invite_code TEXT UNIQUE,
  pollar_user_id TEXT,
  stellar_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migración idempotente de columnas y constraints en bases ya existentes
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS delivery_address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motes_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ci_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS selfie_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ci_photo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS rider_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rider_invite_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS pollar_user_id TEXT,
  ADD COLUMN IF NOT EXISTS stellar_address TEXT,
  DROP COLUMN IF EXISTS is_logged_in,
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('buyer', 'merchant', 'rider'));

-- 2. TABLA: products
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  seller_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  seller_name TEXT NOT NULL,
  seller_phone TEXT,
  seller_avatar_url TEXT DEFAULT '',
  seller_address TEXT DEFAULT '',
  seller_schedule TEXT DEFAULT '',
  name TEXT NOT NULL,
  category TEXT,
  price_motes NUMERIC NOT NULL CHECK (price_motes > 0),
  image_url TEXT NOT NULL,
  description TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA: orders
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  contract_id TEXT UNIQUE NOT NULL,
  engagement_id TEXT,
  fund_tx_hash TEXT,
  release_tx_hash TEXT,
  product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  seller_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  seller_name TEXT NOT NULL,
  buyer_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('buyer', 'merchant')),
  amount_motes NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOCKED_IN_ESCROW',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS contract_id TEXT,
  ADD COLUMN IF NOT EXISTS engagement_id TEXT,
  ADD COLUMN IF NOT EXISTS fund_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS release_tx_hash TEXT;

-- 4. TABLA: deliveries
CREATE TABLE IF NOT EXISTS public.deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
  contract_id TEXT,
  buyer_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  seller_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  pickup_address TEXT DEFAULT '',
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  used_free_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  subsidized_by_reserve BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_type TEXT NOT NULL DEFAULT 'EcoDohmi Eléctrico',
  pickup_pin TEXT,
  delivery_pin TEXT,
  delivery_fee_motes NUMERIC NOT NULL DEFAULT 5,
  delivery_fee_usdc NUMERIC NOT NULL DEFAULT 0.5,
  rider_id TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  release_tx_hash TEXT,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS contract_id TEXT,
  ADD COLUMN IF NOT EXISTS pickup_pin TEXT,
  ADD COLUMN IF NOT EXISTS delivery_pin TEXT,
  ADD COLUMN IF NOT EXISTS subsidized_by_reserve BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_fee_motes NUMERIC NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS delivery_fee_usdc NUMERIC NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS rider_id TEXT,
  ADD COLUMN IF NOT EXISTS rider_name TEXT,
  ADD COLUMN IF NOT EXISTS rider_phone TEXT,
  ADD COLUMN IF NOT EXISTS release_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- 5. TABLA: ramp_transactions (Auditoría e idempotencia de recargas RampWidget)
CREATE TABLE IF NOT EXISTS public.ramp_transactions (
  id TEXT PRIMARY KEY,
  pollar_order_id TEXT UNIQUE NOT NULL,
  onchain_tx_hash TEXT UNIQUE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'merchant', 'rider')),
  purpose TEXT NOT NULL CHECK (purpose IN ('fiat_topup', 'prosumer_subscription', 'merchant_premium')),
  amount_bs NUMERIC NOT NULL CHECK (amount_bs > 0),
  fiat_currency TEXT NOT NULL DEFAULT 'BOB',
  asset_code TEXT NOT NULL DEFAULT 'USDC',
  crypto_amount NUMERIC,
  pollar_user_id TEXT,
  stellar_address TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_pollar_user_id ON public.users(pollar_user_id);
CREATE INDEX IF NOT EXISTS idx_users_stellar_address ON public.users(stellar_address);
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON public.products(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_ramp_tx_user_id ON public.ramp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ramp_tx_pollar_order_id ON public.ramp_transactions(pollar_order_id);

-- 6. SEED ÚNICO: Cuenta real de Doña Eliana (sin usuarios ni productos ficticios)
INSERT INTO public.users (
  id, role, name, store_name, phone, password,
  motes_enabled, referral_code
)
VALUES (
  'mer-eliana-01', 'merchant', 'Eliana Rivero Espinoza', 'Doña Eliana',
  '73540555', '73540555', TRUE, 'ECO-DONAEL55'
)
ON CONFLICT (id) DO NOTHING;

-- 7. SUPABASE STORAGE BUCKETS Y POLÍTICAS
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', TRUE),
  ('product-images', 'product-images', TRUE),
  ('qr-bancarios', 'qr-bancarios', TRUE),
  ('rider-verifications', 'rider-verifications', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "EcoBanco Public Read Storage" ON storage.objects;
CREATE POLICY "EcoBanco Public Read Storage"
ON storage.objects FOR SELECT
USING (bucket_id IN ('avatars', 'product-images', 'qr-bancarios', 'rider-verifications'));

DROP POLICY IF EXISTS "EcoBanco Upload Storage" ON storage.objects;
CREATE POLICY "EcoBanco Upload Storage"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id IN ('avatars', 'product-images', 'qr-bancarios', 'rider-verifications'));

DROP POLICY IF EXISTS "EcoBanco Update Storage" ON storage.objects;
CREATE POLICY "EcoBanco Update Storage"
ON storage.objects FOR UPDATE
USING (bucket_id IN ('avatars', 'product-images', 'qr-bancarios', 'rider-verifications'));

DROP POLICY IF EXISTS "EcoBanco Delete Storage" ON storage.objects;
CREATE POLICY "EcoBanco Delete Storage"
ON storage.objects FOR DELETE
USING (bucket_id IN ('avatars', 'product-images', 'qr-bancarios', 'rider-verifications'));

-- 8. Recargar caché de esquema de PostgREST
NOTIFY pgrst, 'reload schema';
