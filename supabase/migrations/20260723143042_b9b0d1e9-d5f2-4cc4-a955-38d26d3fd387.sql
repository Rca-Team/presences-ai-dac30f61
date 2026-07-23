
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_settings TO authenticated;
GRANT ALL ON public.attendance_settings TO service_role;

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_public_read" ON public.attendance_settings;
DROP POLICY IF EXISTS "portfolio_public_insert" ON public.attendance_settings;
DROP POLICY IF EXISTS "portfolio_public_update" ON public.attendance_settings;

CREATE POLICY "portfolio_public_read"
ON public.attendance_settings
FOR SELECT
TO anon, authenticated
USING (key = 'gaurav_portfolio');

CREATE POLICY "portfolio_public_insert"
ON public.attendance_settings
FOR INSERT
TO anon, authenticated
WITH CHECK (key = 'gaurav_portfolio');

CREATE POLICY "portfolio_public_update"
ON public.attendance_settings
FOR UPDATE
TO anon, authenticated
USING (key = 'gaurav_portfolio')
WITH CHECK (key = 'gaurav_portfolio');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_attendance_settings_updated_at ON public.attendance_settings;
CREATE TRIGGER update_attendance_settings_updated_at
BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_settings;
