
CREATE TABLE public.password_recovery_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  contact_method TEXT NOT NULL CHECK (contact_method IN ('telegram','email','phone','other')),
  contact_value TEXT NOT NULL,
  description TEXT NOT NULL,
  approximate_registration TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved','rejected')),
  admin_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at TIMESTAMPTZ
);

GRANT SELECT, UPDATE ON public.password_recovery_requests TO authenticated;
GRANT INSERT ON public.password_recovery_requests TO anon, authenticated;
GRANT ALL ON public.password_recovery_requests TO service_role;

ALTER TABLE public.password_recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a recovery request"
  ON public.password_recovery_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(email) BETWEEN 3 AND 200
    AND length(contact_value) BETWEEN 2 AND 200
    AND length(description) BETWEEN 5 AND 2000
  );

CREATE POLICY "Admins can view all recovery requests"
  ON public.password_recovery_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update recovery requests"
  ON public.password_recovery_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX password_recovery_requests_status_created_idx
  ON public.password_recovery_requests (status, created_at DESC);
