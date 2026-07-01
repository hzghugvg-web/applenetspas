DROP FUNCTION IF EXISTS public.issue_vpn_config(uuid);

CREATE OR REPLACE FUNCTION public.issue_vpn_config(_direction_id uuid)
 RETURNS TABLE(vless_url text, upstream_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _link TEXT;
  _profile RECORD;
  _cooldown_hours INT := 144;
  _token TEXT;
  _base TEXT;
  _proxy TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF _profile.is_blocked THEN RAISE EXCEPTION 'blocked'; END IF;
  IF _profile.cooldown_until IS NOT NULL AND _profile.cooldown_until > now() THEN
    RAISE EXCEPTION 'cooldown';
  END IF;

  SELECT url INTO _link FROM public.vless_links
    WHERE direction_id = _direction_id AND is_active = true
    ORDER BY random() LIMIT 1;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  SELECT COALESCE(value #>> '{}', 'https://applenetspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://applenetspas.lovable.app'; END IF;

  _token := encode(gen_random_bytes(18), 'hex');
  _proxy := _base || '/api/public/sub/' || _token;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_uid, _direction_id, _proxy, _link, _token);

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_until = COALESCE(GREATEST(subscription_until, now()), now()) + interval '30 days',
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _proxy, _link;
END $function$;