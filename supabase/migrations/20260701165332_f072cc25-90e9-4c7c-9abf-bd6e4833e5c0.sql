
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_from TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.admin_delete_issued_config(_config_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _upstream TEXT; _target UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT upstream_url, user_id INTO _upstream, _target FROM public.issued_configs WHERE id = _config_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.issued_configs WHERE id = _config_id;
  IF _upstream IS NOT NULL THEN
    UPDATE public.vless_links SET is_active = true WHERE url = _upstream;
  END IF;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'delete_config', _target, jsonb_build_object('config_id', _config_id));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_dates(_target uuid, _from timestamptz, _until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
    SET subscription_from = _from, subscription_until = _until, updated_at = now()
    WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'set_subscription', _target, jsonb_build_object('from', _from, 'until', _until));
END $$;
