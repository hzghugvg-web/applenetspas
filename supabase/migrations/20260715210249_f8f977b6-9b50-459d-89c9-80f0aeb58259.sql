
CREATE TABLE IF NOT EXISTS public.telegram_bot_admins (
  telegram_user_id BIGINT PRIMARY KEY,
  added_by BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_bot_admins TO service_role;

ALTER TABLE public.telegram_bot_admins ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: table is server-only (accessed via service role).

INSERT INTO public.telegram_bot_admins (telegram_user_id, note)
  VALUES (8619586495, 'bootstrap owner')
  ON CONFLICT (telegram_user_id) DO NOTHING;
