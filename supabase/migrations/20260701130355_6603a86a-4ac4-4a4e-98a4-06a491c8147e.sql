
-- 1. Extend directions with country code
ALTER TABLE public.directions ADD COLUMN IF NOT EXISTS country_code TEXT;

-- 2. Complaints
CREATE TYPE public.complaint_status AS ENUM ('new', 'in_progress', 'resolved', 'rejected');

CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  video_url TEXT,
  status public.complaint_status NOT NULL DEFAULT 'new',
  admin_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own complaints select" ON public.complaints FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "own complaints insert" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin complaints update" ON public.complaints FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "admin complaints delete" ON public.complaints FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 3. Push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own push select" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "own push insert" ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own push delete" ON public.push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 4. Login history
CREATE TABLE public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own login select" ON public.login_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "own login insert" ON public.login_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. Admin logs
CREATE TABLE public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin logs select" ON public.admin_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "admin logs insert" ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- 6. System settings defaults
INSERT INTO public.system_settings (key, value) VALUES
  ('config_name', '"NetSpas"'::jsonb),
  ('vapid_public_key', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 7. Rewrite issue_vpn_config to substitute remark + tag with configured name
CREATE OR REPLACE FUNCTION public.issue_vpn_config(_direction_id uuid)
RETURNS TABLE(vless_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _link TEXT;
  _profile RECORD;
  _cooldown_hours INT := 144;
  _name TEXT;
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

  SELECT COALESCE(value #>> '{}', 'NetSpas') INTO _name FROM public.system_settings WHERE key = 'config_name';
  IF _name IS NULL OR _name = '' THEN _name := 'NetSpas'; END IF;

  -- Strip existing #tag
  _link := regexp_replace(_link, '#.*$', '');
  -- Replace remark=... in the query string (before # if present)
  _link := regexp_replace(_link, '(remark=)[^&]*', '\1' || _name, 'gi');
  -- Append tag
  _link := _link || '#' || _name;

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url)
    VALUES (_uid, _direction_id, _link);

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_until = COALESCE(GREATEST(subscription_until, now()), now()) + interval '30 days',
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _link;
END $$;

-- 8. Admin: reply to complaint / change status
CREATE OR REPLACE FUNCTION public.admin_update_complaint(
  _id UUID, _status public.complaint_status, _reply TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _target UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.complaints
    SET status = _status, admin_reply = COALESCE(_reply, admin_reply), updated_at = now()
    WHERE id = _id
    RETURNING user_id INTO _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'complaint_update', _target, jsonb_build_object('id', _id, 'status', _status));
END $$;

-- 9. Admin: reset cooldown + immediately issue new key
CREATE OR REPLACE FUNCTION public.admin_reset_cooldown_for(_target UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET cooldown_until = NULL WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'reset_cooldown', _target, '{}'::jsonb);
END $$;

-- 10. Helpers: log admin action wrapper (callable via RPC from client for existing admin ops)
CREATE OR REPLACE FUNCTION public.log_admin_action(_action TEXT, _target UUID, _details JSONB)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), _action, _target, COALESCE(_details, '{}'::jsonb));
END $$;

-- 11. Wrap existing admin_toggle_block / admin_reset_cooldown with logging
CREATE OR REPLACE FUNCTION public.admin_toggle_block(_target uuid, _block boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_blocked = _block WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END, _target, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_reset_cooldown(_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET cooldown_until = NULL WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'reset_cooldown', _target, '{}'::jsonb);
END $$;
