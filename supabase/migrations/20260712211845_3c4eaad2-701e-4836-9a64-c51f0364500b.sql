CREATE OR REPLACE FUNCTION public.create_telegram_auth_code(_purpose text)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _uid uuid := auth.uid();
BEGIN
  IF _purpose NOT IN ('link', 'login') THEN
    RAISE EXCEPTION 'invalid_purpose';
  END IF;

  IF _purpose = 'link' AND _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  DELETE FROM public.telegram_auth_codes WHERE expires_at < now();

  LOOP
    _code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    BEGIN
      INSERT INTO public.telegram_auth_codes (code, purpose, user_id, status, expires_at)
      VALUES (_code, _purpose, CASE WHEN _purpose = 'link' THEN _uid ELSE NULL END, 'pending', now() + interval '10 minutes');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- try another code
    END;
  END LOOP;

  RETURN QUERY
    SELECT t.code, t.expires_at
    FROM public.telegram_auth_codes t
    WHERE t.code = _code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_telegram_auth_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_telegram_login_status(_code text)
RETURNS TABLE(status text, user_id uuid, action_link text, expires_at timestamptz, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _code !~ '^\d{6}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT t.status, t.user_id, t.action_link, t.expires_at, t.error
    FROM public.telegram_auth_codes t
    WHERE t.code = _code AND t.purpose = 'login';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_telegram_login_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_telegram_link_status(_code text)
RETURNS TABLE(status text, telegram_username text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _code !~ '^\d{6}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT t.status, t.telegram_username, t.expires_at
    FROM public.telegram_auth_codes t
    WHERE t.code = _code AND t.purpose = 'link' AND t.user_id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_telegram_link_status(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_telegram_binding()
RETURNS TABLE(linked boolean, telegram_username text, telegram_linked_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
    SELECT (p.telegram_user_id IS NOT NULL), p.telegram_username, p.telegram_linked_at
    FROM public.profiles p
    WHERE p.id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_telegram_binding() TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_my_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.profiles
  SET telegram_user_id = NULL,
      telegram_username = NULL,
      telegram_linked_at = NULL,
      updated_at = now()
  WHERE id = _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_my_telegram() TO authenticated;