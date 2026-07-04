
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS title text;

CREATE OR REPLACE FUNCTION public.admin_send_broadcast(_message text, _title text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _message IS NULL OR length(trim(_message)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  INSERT INTO public.broadcasts (message, title, created_by)
    VALUES (trim(_message), NULLIF(trim(COALESCE(_title, '')), ''), auth.uid())
    RETURNING id INTO _id;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), 'broadcast_send', NULL, jsonb_build_object('id', _id));
  RETURN _id;
END $function$;
