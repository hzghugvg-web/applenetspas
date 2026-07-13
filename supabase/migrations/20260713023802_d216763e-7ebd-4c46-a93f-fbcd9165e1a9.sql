CREATE OR REPLACE FUNCTION public.get_confirmed_telegram_login_accounts(_username text, _code text)
RETURNS TABLE(profile_id uuid, email text, linked_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _clean text;
  _tg_id bigint;
BEGIN
  _clean := regexp_replace(lower(trim(coalesce(_username, ''))), '^@', '');
  IF _clean = '' OR length(_clean) < 3 THEN RAISE EXCEPTION 'invalid_username'; END IF;
  IF _code IS NULL OR _code !~ '^\d{6}$' THEN RAISE EXCEPTION 'invalid_code'; END IF;

  UPDATE public.telegram_auth_codes
    SET status = 'expired'
    WHERE code = _code AND status = 'pending' AND expires_at <= now();

  SELECT t.telegram_user_id INTO _tg_id
  FROM public.telegram_auth_codes t
  WHERE t.code = _code
    AND t.purpose = 'login'
    AND t.status = 'confirmed'
    AND lower(coalesce(t.telegram_username, '')) = _clean
    AND t.expires_at > now();

  IF _tg_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, u.email::text, p.telegram_linked_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.telegram_user_id = _tg_id
    ORDER BY p.telegram_linked_at DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_confirmed_telegram_login_accounts(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_confirmed_telegram_login_accounts(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confirmed_telegram_login_accounts(text, text) TO service_role;