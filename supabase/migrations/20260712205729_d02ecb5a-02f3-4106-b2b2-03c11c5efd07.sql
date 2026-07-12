-- Add telegram identity fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_user_id_key
  ON public.profiles (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- One-time codes used to link an account or sign in via Telegram
CREATE TABLE public.telegram_auth_codes (
  code TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('link', 'login')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  action_link TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'consumed', 'expired', 'rejected')),
  error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telegram_auth_codes TO authenticated;
GRANT ALL ON public.telegram_auth_codes TO service_role;

ALTER TABLE public.telegram_auth_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own link codes"
  ON public.telegram_auth_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_tg_auth_codes_expires ON public.telegram_auth_codes (expires_at);

CREATE TRIGGER update_telegram_auth_codes_updated_at
BEFORE UPDATE ON public.telegram_auth_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();