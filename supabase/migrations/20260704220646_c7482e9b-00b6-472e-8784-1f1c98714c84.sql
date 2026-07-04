
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS website text;

CREATE OR REPLACE FUNCTION public.admin_send_broadcast(
  _message text,
  _title text DEFAULT NULL,
  _link text DEFAULT NULL,
  _email text DEFAULT NULL,
  _website text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  INSERT INTO public.broadcasts (message, title, link, email, website, created_by)
    VALUES (
      trim(_message),
      NULLIF(trim(COALESCE(_title, '')), ''),
      NULLIF(trim(COALESCE(_link, '')), ''),
      NULLIF(trim(COALESCE(_email, '')), ''),
      NULLIF(trim(COALESCE(_website, '')), ''),
      auth.uid()
    )
    RETURNING id INTO _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_send', NULL, jsonb_build_object('id', _id));
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_update_broadcast(
  _id uuid,
  _message text,
  _title text DEFAULT NULL,
  _link text DEFAULT NULL,
  _email text DEFAULT NULL,
  _website text DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  UPDATE public.broadcasts
    SET message = trim(_message),
        title = NULLIF(trim(COALESCE(_title, '')), ''),
        link = NULLIF(trim(COALESCE(_link, '')), ''),
        email = NULLIF(trim(COALESCE(_email, '')), ''),
        website = NULLIF(trim(COALESCE(_website, '')), '')
    WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  DELETE FROM public.broadcast_reads WHERE broadcast_id = _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_update', NULL, jsonb_build_object('id', _id));
END $function$;
