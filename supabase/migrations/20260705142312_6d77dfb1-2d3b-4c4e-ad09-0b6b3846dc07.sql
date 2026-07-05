
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS delivery_style TEXT NOT NULL DEFAULT 'imessage'
  CHECK (delivery_style IN ('top', 'imessage'));

CREATE OR REPLACE FUNCTION public.admin_send_broadcast(
  _message text,
  _title text DEFAULT NULL,
  _link text DEFAULT NULL,
  _email text DEFAULT NULL,
  _website text DEFAULT NULL,
  _delivery_style text DEFAULT 'imessage'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id UUID; _style TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  _style := COALESCE(NULLIF(trim(COALESCE(_delivery_style, '')), ''), 'imessage');
  IF _style NOT IN ('top', 'imessage') THEN _style := 'imessage'; END IF;
  INSERT INTO public.broadcasts (message, title, link, email, website, delivery_style, created_by)
    VALUES (
      trim(_message),
      NULLIF(trim(COALESCE(_title, '')), ''),
      NULLIF(trim(COALESCE(_link, '')), ''),
      NULLIF(trim(COALESCE(_email, '')), ''),
      NULLIF(trim(COALESCE(_website, '')), ''),
      _style,
      auth.uid()
    )
    RETURNING id INTO _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_send', NULL, jsonb_build_object('id', _id, 'style', _style));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_broadcast(
  _id uuid,
  _message text,
  _title text DEFAULT NULL,
  _link text DEFAULT NULL,
  _email text DEFAULT NULL,
  _website text DEFAULT NULL,
  _delivery_style text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _style TEXT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  _style := NULLIF(trim(COALESCE(_delivery_style, '')), '');
  IF _style IS NOT NULL AND _style NOT IN ('top', 'imessage') THEN _style := NULL; END IF;
  UPDATE public.broadcasts
    SET message = trim(_message),
        title = NULLIF(trim(COALESCE(_title, '')), ''),
        link = NULLIF(trim(COALESCE(_link, '')), ''),
        email = NULLIF(trim(COALESCE(_email, '')), ''),
        website = NULLIF(trim(COALESCE(_website, '')), ''),
        delivery_style = COALESCE(_style, delivery_style)
    WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.broadcast_reads WHERE broadcast_id = _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_update', NULL, jsonb_build_object('id', _id));
END $$;
