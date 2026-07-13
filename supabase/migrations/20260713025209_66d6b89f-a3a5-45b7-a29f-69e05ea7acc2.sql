
-- 1) Update issue_vpn_config to enforce unified 1-key limit across site + TG
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
  _tg_count INT;
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

  -- Unified limit: if this profile is linked to a Telegram account and that
  -- Telegram already has an issued key, refuse here too.
  IF _profile.telegram_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _tg_count
      FROM public.telegram_issued_keys
      WHERE telegram_user_id = _profile.telegram_user_id;
    IF _tg_count >= 1 THEN RAISE EXCEPTION 'limit_reached'; END IF;
  END IF;

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

  -- Mirror to telegram_issued_keys if TG is linked, so bot's "My VPN" shows it too.
  IF _profile.telegram_user_id IS NOT NULL THEN
    INSERT INTO public.telegram_issued_keys
      (telegram_user_id, chat_id, direction_id, direction_name, direction_flag, vless_url, vless_link_id)
    SELECT _profile.telegram_user_id,
           _profile.telegram_user_id,
           _direction_id,
           d.name,
           d.flag,
           _link,
           _link_id
    FROM public.directions d
    WHERE d.id = _direction_id;
  END IF;

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_from = now(),
        subscription_until = now() + interval '30 days',
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _proxy, _link;
END
$function$;

-- 2) Atomic Telegram-side issuance with unified 1-key limit
CREATE OR REPLACE FUNCTION public.tg_issue_vpn_config(
  _tg_user_id bigint,
  _tg_username text,
  _chat_id bigint,
  _direction_id uuid
)
 RETURNS TABLE(vless_url text, direction_name text, direction_flag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _link_id UUID;
  _link TEXT;
  _dir RECORD;
  _profile RECORD;
  _tg_count INT;
  _cfg_count INT;
BEGIN
  IF _tg_user_id IS NULL THEN RAISE EXCEPTION 'invalid_user'; END IF;

  PERFORM public.cleanup_expired_vless_links();

  -- Unified 1-key limit: any existing TG-issued key blocks new issuance.
  SELECT COUNT(*) INTO _tg_count
    FROM public.telegram_issued_keys
    WHERE telegram_user_id = _tg_user_id;
  IF _tg_count >= 1 THEN RAISE EXCEPTION 'limit_reached'; END IF;

  -- If the Telegram account is linked to a profile, block when that profile
  -- already has an issued_configs row (site-side key).
  SELECT id, is_blocked, subscription_until, cooldown_until, telegram_user_id
    INTO _profile
    FROM public.profiles
    WHERE telegram_user_id = _tg_user_id
    ORDER BY telegram_linked_at DESC NULLS LAST
    LIMIT 1;

  IF _profile.id IS NOT NULL THEN
    IF _profile.is_blocked THEN RAISE EXCEPTION 'blocked'; END IF;

    SELECT COUNT(*) INTO _cfg_count FROM public.issued_configs WHERE user_id = _profile.id;
    IF _cfg_count >= 1 THEN RAISE EXCEPTION 'limit_reached'; END IF;
  END IF;

  SELECT name, flag INTO _dir FROM public.directions WHERE id = _direction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_direction'; END IF;

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

  INSERT INTO public.telegram_issued_keys
    (telegram_user_id, chat_id, direction_id, direction_name, direction_flag, vless_url, vless_link_id)
  VALUES
    (_tg_user_id, _chat_id, _direction_id, _dir.name, _dir.flag, _link, _link_id);

  IF _profile.id IS NOT NULL THEN
    INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url)
      VALUES (_profile.id, _direction_id, _link, _link);

    UPDATE public.profiles
      SET cooldown_until = now() + interval '144 hours',
          subscription_from = now(),
          subscription_until = now() + interval '30 days',
          updated_at = now()
      WHERE id = _profile.id;
  END IF;

  RETURN QUERY SELECT _link, _dir.name, _dir.flag;
END
$function$;

-- 3) Combined "My VPN" list for signed-in users (site side)
CREATE OR REPLACE FUNCTION public.get_my_all_vpn_configs()
 RETURNS TABLE(
   source text,
   id text,
   vless_url text,
   upstream_url text,
   direction_id uuid,
   direction_name text,
   direction_flag text,
   issued_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tg_id bigint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT telegram_user_id INTO _tg_id FROM public.profiles WHERE id = _uid;

  RETURN QUERY
    SELECT 'site'::text AS source,
           c.id::text AS id,
           c.vless_url,
           c.upstream_url,
           c.direction_id,
           d.name AS direction_name,
           d.flag AS direction_flag,
           c.issued_at
      FROM public.issued_configs c
      LEFT JOIN public.directions d ON d.id = c.direction_id
      WHERE c.user_id = _uid

    UNION ALL

    SELECT 'tg'::text AS source,
           k.id::text AS id,
           k.vless_url,
           k.vless_url AS upstream_url,
           k.direction_id,
           k.direction_name,
           k.direction_flag,
           k.issued_at
      FROM public.telegram_issued_keys k
      WHERE _tg_id IS NOT NULL
        AND k.telegram_user_id = _tg_id
        -- avoid duplicates when a key exists in both tables (site-issued mirrored to TG)
        AND NOT EXISTS (
          SELECT 1 FROM public.issued_configs c2
          WHERE c2.user_id = _uid AND c2.vless_url = k.vless_url
        );
END
$function$;

GRANT EXECUTE ON FUNCTION public.tg_issue_vpn_config(bigint, text, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_all_vpn_configs() TO authenticated;
