
CREATE TABLE public.complaint_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX complaint_messages_complaint_idx ON public.complaint_messages(complaint_id, created_at);

GRANT SELECT, INSERT ON public.complaint_messages TO authenticated;
GRANT ALL ON public.complaint_messages TO service_role;

ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or admin" ON public.complaint_messages FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.user_id = auth.uid())
  );

CREATE POLICY "insert own or admin" ON public.complaint_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.complaints c
        WHERE c.id = complaint_id AND c.user_id = auth.uid()
          AND c.status NOT IN ('resolved','rejected')
      )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.complaint_messages;
ALTER TABLE public.complaint_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
ALTER TABLE public.complaints REPLICA IDENTITY FULL;

-- Allow user to close their own complaint (only status change to resolved)
CREATE OR REPLACE FUNCTION public.close_own_complaint(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.complaints
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END $$;
