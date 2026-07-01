
DO $$ BEGIN
  CREATE TYPE public.complaint_category AS ENUM ('question', 'problem');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS category public.complaint_category NOT NULL DEFAULT 'question',
  ADD COLUMN IF NOT EXISTS phone text;
