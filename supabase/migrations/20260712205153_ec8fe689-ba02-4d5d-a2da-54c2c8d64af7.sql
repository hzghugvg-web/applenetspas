CREATE TABLE public.telegram_issued_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  direction_id uuid,
  direction_name text,
  direction_flag text,
  vless_url text NOT NULL,
  vless_link_id uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_issued_keys TO service_role;

ALTER TABLE public.telegram_issued_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tg_issued_keys_user ON public.telegram_issued_keys (telegram_user_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tg_issued_keys_updated_at
BEFORE UPDATE ON public.telegram_issued_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();