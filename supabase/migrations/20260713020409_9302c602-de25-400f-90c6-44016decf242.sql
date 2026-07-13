-- Allow up to 2 profiles per telegram_user_id (was 1)
DROP INDEX IF EXISTS public.profiles_telegram_user_id_key;
CREATE INDEX IF NOT EXISTS profiles_telegram_user_id_idx
  ON public.profiles(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_telegram_username_lower_idx
  ON public.profiles(lower(telegram_username)) WHERE telegram_username IS NOT NULL;

-- Count linked profiles for a given Telegram user (used by bot to enforce max=2)
CREATE OR REPLACE FUNCTION public.count_linked_profiles(_tg_id bigint)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT count(*)::int FROM public.profiles WHERE telegram_user_id = _tg_id $$;
GRANT EXECUTE ON FUNCTION public.count_linked_profiles(bigint) TO service_role;

-- Login by Telegram username: server-side generates 6-digit code and resolves
-- the Telegram user id from a linked profile. Returns code + chat id so the
-- caller (server function) can DM the code via the bot.
CREATE OR REPLACE FUNCTION public.create_telegram_login_by_username(_username text)
RETURNS TABLE(code text, telegram_user_id bigint, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _tg_id bigint;
  _clean text;
BEGIN
  _clean := regexp_replace(lower(trim(coalesce(_username, ''))), '^@', '');
  IF _clean = '' OR length(_clean) < 3 THEN RAISE EXCEPTION 'invalid_username'; END IF;

  SELECT p.telegram_user_id INTO _tg_id
  FROM public.profiles p
  WHERE lower(p.telegram_username) = _clean AND p.telegram_user_id IS NOT NULL
  ORDER BY p.telegram_linked_at DESC NULLS LAST
  LIMIT 1;

  IF _tg_id IS NULL THEN RAISE EXCEPTION 'not_linked'; END IF;

  DELETE FROM public.telegram_auth_codes t WHERE t.expires_at < now();

  LOOP
    _code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    BEGIN
      INSERT INTO public.telegram_auth_codes
        (code, purpose, status, telegram_user_id, telegram_username, expires_at)
      VALUES
        (_code, 'login', 'pending', _tg_id, _clean, now() + interval '10 minutes');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- retry with a fresh code
    END;
  END LOOP;

  RETURN QUERY
    SELECT t.code, t.telegram_user_id, t.expires_at
    FROM public.telegram_auth_codes t
    WHERE t.code = _code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_telegram_login_by_username(text) TO service_role;

-- Verify a code entered by the user in the web app for username-based login.
-- Marks the code as confirmed (single use), then returns all profiles bound
-- to that Telegram user together with their email (for account picker).
CREATE OR REPLACE FUNCTION public.verify_telegram_login_code(_username text, _code text)
RETURNS TABLE(profile_id uuid, email text, linked_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean text;
  _tg_id bigint;
BEGIN
  _clean := regexp_replace(lower(trim(coalesce(_username, ''))), '^@', '');
  IF _code IS NULL OR _code !~ '^\d{6}$' THEN RAISE EXCEPTION 'invalid_code'; END IF;

  SELECT t.telegram_user_id INTO _tg_id
  FROM public.telegram_auth_codes t
  WHERE t.code = _code
    AND t.purpose = 'login'
    AND t.status = 'pending'
    AND lower(coalesce(t.telegram_username, '')) = _clean
    AND t.expires_at > now();

  IF _tg_id IS NULL THEN
    UPDATE public.telegram_auth_codes SET status = 'expired'
      WHERE code = _code AND status = 'pending' AND expires_at <= now();
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE public.telegram_auth_codes
    SET status = 'confirmed', confirmed_at = now()
    WHERE code = _code;

  RETURN QUERY
    SELECT p.id, u.email::text, p.telegram_linked_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.telegram_user_id = _tg_id
    ORDER BY p.telegram_linked_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_telegram_login_code(text, text) TO service_role;