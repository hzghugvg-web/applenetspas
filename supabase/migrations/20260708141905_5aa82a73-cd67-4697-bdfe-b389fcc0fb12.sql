INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('public_base_url', to_jsonb('https://netspas.lovable.app'::text), now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

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
  _profile RECORD;
  _cooldown_hours INT := 144;
  _token TEXT;
  _base TEXT;
  _proxy TEXT;
  _count INT;
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

  SELECT id, url INTO _link_id, _link
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

  SELECT COALESCE(value #>> '{}', 'https://netspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://netspas.lovable.app'; END IF;

  _token := encode(extensions.gen_random_bytes(18), 'hex');
  _proxy := _base || '/api/public/sub/' || _token;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_uid, _direction_id, _proxy, _link, _token);

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_from = now(),
        subscription_until = now() + interval '30 days',
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _proxy, _link;
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
  _token TEXT;
  _base TEXT;
  _proxy TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM public.cleanup_expired_vless_links();

  SELECT id, url INTO _link_id, _link FROM public.vless_links
    WHERE direction_id = _direction_id
      AND is_active = true
      AND (available_from IS NULL OR available_from <= now())
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  UPDATE public.vless_links SET is_active = false WHERE id = _link_id;

  SELECT COALESCE(value #>> '{}', 'https://netspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://netspas.lovable.app'; END IF;

  _token := encode(extensions.gen_random_bytes(18), 'hex');
  _proxy := _base || '/api/public/sub/' || _token;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_target, _direction_id, _proxy, _link, _token);

  UPDATE public.profiles
    SET cooldown_until = NULL,
        subscription_from = now(),
        subscription_until = now() + interval '30 days',
        updated_at = now()
    WHERE id = _target;

  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'issue_config', _target, jsonb_build_object('direction_id', _direction_id));

  RETURN _proxy;
END
$function$;