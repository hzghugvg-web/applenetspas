
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE OR REPLACE FUNCTION public.admin_block_user(_target uuid, _until timestamptz, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
    SET is_blocked = true,
        blocked_until = _until,
        blocked_reason = NULLIF(trim(COALESCE(_reason, '')), ''),
        updated_at = now()
    WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'block_user', _target, jsonb_build_object('until', _until, 'reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.admin_unblock_user(_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
    SET is_blocked = false,
        blocked_until = NULL,
        blocked_reason = NULL,
        updated_at = now()
    WHERE id = _target;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'unblock_user', _target, '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.admin_block_user(uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unblock_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_user(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(uuid) TO authenticated;
