
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.amnesty_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  blocked_reason TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_reply TEXT,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amnesty_requests TO authenticated;
GRANT ALL ON public.amnesty_requests TO service_role;

ALTER TABLE public.amnesty_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_read_own_amnesty" ON public.amnesty_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admin_read_all_amnesty" ON public.amnesty_requests
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_update_amnesty" ON public.amnesty_requests
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_amnesty_updated_at
  BEFORE UPDATE ON public.amnesty_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.submit_amnesty(_message TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _profile RECORD;
  _email TEXT;
  _pending INT;
  _id UUID;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _message IS NULL OR length(trim(_message)) < 5 THEN RAISE EXCEPTION 'message_too_short'; END IF;
  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF NOT FOUND OR NOT _profile.is_blocked THEN RAISE EXCEPTION 'not_blocked'; END IF;
  SELECT COUNT(*) INTO _pending FROM public.amnesty_requests WHERE user_id = _uid AND status = 'pending';
  IF _pending >= 1 THEN RAISE EXCEPTION 'already_pending'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.amnesty_requests (user_id, email, blocked_reason, message)
    VALUES (_uid, _email, _profile.blocked_reason, trim(_message))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_amnesty(_id UUID, _approve BOOLEAN, _reply TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _target UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.amnesty_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        admin_reply = NULLIF(trim(COALESCE(_reply, '')), ''),
        admin_id = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    WHERE id = _id AND status = 'pending'
    RETURNING user_id INTO _target;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _approve THEN
    UPDATE public.profiles
      SET is_blocked = false, blocked_until = NULL, blocked_reason = NULL, updated_at = now()
      WHERE id = _target;
  END IF;
  INSERT INTO public.admin_logs (admin_id, action, target_user_id, details)
    VALUES (auth.uid(), CASE WHEN _approve THEN 'amnesty_approve' ELSE 'amnesty_reject' END, _target,
            jsonb_build_object('id', _id));
END $$;

ALTER TABLE public.amnesty_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.amnesty_requests;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
