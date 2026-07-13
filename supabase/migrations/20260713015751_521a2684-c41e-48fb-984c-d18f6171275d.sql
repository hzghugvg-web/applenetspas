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

  DELETE FROM public.telegram_auth_codes t WHERE t.expires_at < now();

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