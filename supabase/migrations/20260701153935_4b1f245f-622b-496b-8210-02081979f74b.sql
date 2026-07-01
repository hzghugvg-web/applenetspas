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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF _profile.is_blocked THEN RAISE EXCEPTION 'blocked'; END IF;
  IF _profile.cooldown_until IS NOT NULL AND _profile.cooldown_until > now() THEN
    RAISE EXCEPTION 'cooldown';
  END IF;

  -- Atomically claim one free link so no two users can grab the same one
  SELECT id, url INTO _link_id, _link
    FROM public.vless_links
    WHERE direction_id = _direction_id AND is_active = true
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  UPDATE public.vless_links SET is_active = false WHERE id = _link_id;

  SELECT COALESCE(value #>> '{}', 'https://applenetspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://applenetspas.lovable.app'; END IF;

  _token := encode(extensions.gen_random_bytes(18), 'hex');
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

CREATE OR REPLACE FUNCTION public.admin_issue_config_for(_target uuid, _direction_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _link_id UUID;
  _link TEXT;
  _name TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT id, url INTO _link_id, _link FROM public.vless_links
    WHERE direction_id = _direction_id AND is_active = true
    ORDER BY random()
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  UPDATE public.vless_links SET is_active = false WHERE id = _link_id;

  SELECT COALESCE(value #>> '{}', 'NetSpas') INTO _name FROM public.system_settings WHERE key = 'config_name';
  IF _name IS NULL OR _name = '' THEN _name := 'NetSpas'; END IF;

  _link := regexp_replace(_link, '#.*$', '');
  _link := regexp_replace(_link, '(remark=)[^&]*', '\1' || _name, 'gi');
  _link := _link || '#' || _name;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url)
    VALUES (_target, _direction_id, _link);

  UPDATE public.profiles
    SET cooldown_until = NULL,
        subscription_until = COALESCE(GREATEST(subscription_until, now()), now()) + interval '30 days',
        updated_at = now()
    WHERE id = _target;

  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'issue_config', _target, jsonb_build_object('direction_id', _direction_id));

  RETURN _link;
END $function$;