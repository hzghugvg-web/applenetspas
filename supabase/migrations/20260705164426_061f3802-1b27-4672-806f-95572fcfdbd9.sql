CREATE OR REPLACE FUNCTION public.issue_vpn_config(_direction_id uuid)
 RETURNS TABLE(vless_url text, upstream_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _link_id UUID;
  _link TEXT;
  _link_expires TIMESTAMPTZ;
  _profile RECORD;
  _cooldown_hours INT := 144;
  _count INT;
  _sub_until TIMESTAMPTZ;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  PERFORM public.cleanup_expired_vless_links();

  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF _profile.is_blocked THEN RAISE EXCEPTION 'blocked'; END IF;

  IF _profile.subscription_until IS NOT NULL AND _profile.subscription_until > now() THEN
    RAISE EXCEPTION 'subscription_active';
  END IF;

  IF _profile.cooldown_until IS NOT NULL AND _profile.cooldown_until > now() THEN
    RAISE EXCEPTION 'cooldown';
  END IF;

  SELECT COUNT(*) INTO _count FROM public.issued_configs WHERE user_id = _uid;
  IF _count >= 1 THEN RAISE EXCEPTION 'limit_reached'; END IF;

  SELECT id, url, expires_at INTO _link_id, _link, _link_expires
    FROM public.vless_links
    WHERE direction_id = _direction_id
      AND is_active = true
      AND (available_from IS NULL OR available_from <= now())
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  UPDATE public.vless_links SET is_active = false WHERE id = _link_id;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_uid, _direction_id, _link, _link, NULL);

  _sub_until := COALESCE(_link_expires, now() + interval '30 days');

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_from = now(),
        subscription_until = _sub_until,
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _link, _link;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_issue_config_for(_target uuid, _direction_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _link_id UUID;
  _link TEXT;
  _link_expires TIMESTAMPTZ;
  _sub_until TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM public.cleanup_expired_vless_links();

  SELECT id, url, expires_at INTO _link_id, _link, _link_expires FROM public.vless_links
    WHERE direction_id = _direction_id
      AND is_active = true
      AND (available_from IS NULL OR available_from <= now())
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  UPDATE public.vless_links SET is_active = false WHERE id = _link_id;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_target, _direction_id, _link, _link, NULL);

  _sub_until := COALESCE(_link_expires, now() + interval '30 days');

  UPDATE public.profiles
    SET cooldown_until = NULL,
        subscription_from = now(),
        subscription_until = _sub_until,
        updated_at = now()
    WHERE id = _target;

  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'issue_config', _target, jsonb_build_object('direction_id', _direction_id));

  RETURN _link;
END
$function$;

UPDATE public.issued_configs
SET vless_url = upstream_url,
    sub_token = NULL
WHERE vless_url ILIKE 'https://%/api/public/sub/%'
  AND upstream_url IS NOT NULL;