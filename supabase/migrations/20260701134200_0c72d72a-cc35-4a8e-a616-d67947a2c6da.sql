
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Storage policies for the 'complaints' bucket
DROP POLICY IF EXISTS "complaints_upload_own" ON storage.objects;
CREATE POLICY "complaints_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complaints' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "complaints_read_own_or_admin" ON storage.objects;
CREATE POLICY "complaints_read_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaints' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "complaints_delete_own_or_admin" ON storage.objects;
CREATE POLICY "complaints_delete_own_or_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'complaints' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin(auth.uid())
    )
  );

-- Admin: issue a fresh config for a user (reset cooldown, then re-apply)
CREATE OR REPLACE FUNCTION public.admin_issue_config_for(_target uuid, _direction_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link TEXT;
  _name TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT url INTO _link FROM public.vless_links
    WHERE direction_id = _direction_id AND is_active = true
    ORDER BY random() LIMIT 1;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

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
END $$;
