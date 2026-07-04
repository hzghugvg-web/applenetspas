
-- 1. Fix bootstrap: no auto-admin
CREATE OR REPLACE FUNCTION public.bootstrap_user()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  INSERT INTO public.profiles (id, email) VALUES (_uid, _email)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'user')
    ON CONFLICT DO NOTHING;

  IF _email = 'halifbargisev@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
      ON CONFLICT DO NOTHING;
  END IF;
END $function$;

-- Revoke admin from anyone who is not the allowed email
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id NOT IN (SELECT id FROM auth.users WHERE email = 'halifbargisev@gmail.com');

-- 2. Sync subscription_until with link expires_at on issue
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
  _token TEXT;
  _base TEXT;
  _proxy TEXT;
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

  SELECT COALESCE(value #>> '{}', 'https://applenetspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://applenetspas.lovable.app'; END IF;

  _token := encode(extensions.gen_random_bytes(18), 'hex');
  _proxy := _base || '/api/public/sub/' || _token;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_uid, _direction_id, _proxy, _link, _token);

  _sub_until := COALESCE(_link_expires, now() + interval '30 days');

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_from = now(),
        subscription_until = _sub_until,
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
  _link_expires TIMESTAMPTZ;
  _name TEXT;
  _token TEXT;
  _base TEXT;
  _proxy TEXT;
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

  SELECT COALESCE(value #>> '{}', 'https://applenetspas.lovable.app') INTO _base FROM public.system_settings WHERE key = 'public_base_url';
  IF _base IS NULL OR _base = '' THEN _base := 'https://applenetspas.lovable.app'; END IF;

  SELECT COALESCE(value #>> '{}', 'NetSpas') INTO _name FROM public.system_settings WHERE key = 'config_name';
  IF _name IS NULL OR _name = '' THEN _name := 'NetSpas'; END IF;

  _token := encode(extensions.gen_random_bytes(18), 'hex');
  _proxy := _base || '/api/public/sub/' || _token;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url, upstream_url, sub_token)
    VALUES (_target, _direction_id, _proxy, _link, _token);

  _sub_until := COALESCE(_link_expires, now() + interval '30 days');

  UPDATE public.profiles
    SET cooldown_until = NULL,
        subscription_from = now(),
        subscription_until = _sub_until,
        updated_at = now()
    WHERE id = _target;

  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'issue_config', _target, jsonb_build_object('direction_id', _direction_id));

  RETURN _proxy;
END
$function$;

-- 3. Broadcasts
CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read broadcasts" ON public.broadcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage broadcasts" ON public.broadcasts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.broadcast_reads (
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (broadcast_id, user_id)
);
GRANT SELECT, INSERT ON public.broadcast_reads TO authenticated;
GRANT ALL ON public.broadcast_reads TO service_role;
ALTER TABLE public.broadcast_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reads select" ON public.broadcast_reads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own reads insert" ON public.broadcast_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.admin_send_broadcast(_message TEXT)
 RETURNS UUID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  INSERT INTO public.broadcasts (message, created_by) VALUES (trim(_message), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_send', NULL, jsonb_build_object('id', _id));
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_broadcast(_id UUID)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.broadcasts WHERE id = _id;
END $function$;
