
-- ============= App role enum + has_role helper =============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','principal','teacher','user','staff','parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= profiles =============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  display_name text,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  role text,
  class text,
  section text,
  category text,
  employee_id text,
  roll_number text,
  admission_number text,
  father_name text,
  mother_name text,
  parent_name text,
  parent_email text,
  parent_phone text,
  address text,
  date_of_birth date,
  gender text,
  blood_group text,
  house text,
  bus_route text,
  photo_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_auth_all" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= user_roles =============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_write_auth" ON public.user_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============= attendance_records =============
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text,
  category text,
  class text,
  section text,
  subject text,
  period_key text,
  image_url text,
  device_info jsonb DEFAULT '{}'::jsonb,
  confidence real,
  method text,
  location text,
  notes text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT (now())::date,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON public.attendance_records(date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_records_auth_all" ON public.attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= face_descriptors =============
CREATE TABLE IF NOT EXISTS public.face_descriptors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  descriptor jsonb,
  descriptors jsonb,
  image_url text,
  quality real,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_user_id ON public.face_descriptors(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.face_descriptors TO authenticated;
GRANT ALL ON public.face_descriptors TO service_role;
ALTER TABLE public.face_descriptors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "face_descriptors_auth_all" ON public.face_descriptors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_face_descriptors_updated_at BEFORE UPDATE ON public.face_descriptors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= notifications =============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  title text,
  message text,
  type text,
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_auth_all" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= notification_log =============
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel text,
  status text,
  subject text,
  message text,
  recipient text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_log_auth_all" ON public.notification_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= period_timings =============
CREATE TABLE IF NOT EXISTS public.period_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_number integer,
  period_name text,
  period_key text,
  start_time text,
  end_time text,
  category text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_timings TO authenticated;
GRANT ALL ON public.period_timings TO service_role;
ALTER TABLE public.period_timings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "period_timings_auth_all" ON public.period_timings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= subjects =============
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  class text,
  section text,
  category text,
  teacher_id uuid,
  color text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_auth_all" ON public.subjects FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= timetable =============
CREATE TABLE IF NOT EXISTS public.timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class text,
  section text,
  category text,
  day_of_week text,
  day_key text,
  period_number integer,
  period_key text,
  subject_id uuid,
  subject text,
  teacher_id uuid,
  teacher_name text,
  room text,
  start_time text,
  end_time text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable TO authenticated;
GRANT ALL ON public.timetable TO service_role;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timetable_auth_all" ON public.timetable FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= class_teachers =============
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class text,
  section text,
  category text,
  teacher_id uuid,
  teacher_name text,
  teacher_email text,
  role text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_teachers_auth_all" ON public.class_teachers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= substitutions =============
CREATE TABLE IF NOT EXISTS public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date,
  class text,
  section text,
  period_key text,
  subject text,
  original_teacher_id uuid,
  substitute_teacher_id uuid,
  status text DEFAULT 'pending',
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.substitutions TO authenticated;
GRANT ALL ON public.substitutions TO service_role;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "substitutions_auth_all" ON public.substitutions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= teacher_permissions =============
CREATE TABLE IF NOT EXISTS public.teacher_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid,
  user_id uuid,
  class text,
  section text,
  category text,
  can_edit_timetable boolean DEFAULT true,
  can_take_attendance boolean DEFAULT true,
  can_export_reports boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_permissions TO authenticated;
GRANT ALL ON public.teacher_permissions TO service_role;
ALTER TABLE public.teacher_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_permissions_auth_all" ON public.teacher_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= school_gates =============
CREATE TABLE IF NOT EXISTS public.school_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  gate_type text,
  is_active boolean DEFAULT true,
  detection_box jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_gates TO authenticated;
GRANT ALL ON public.school_gates TO service_role;
ALTER TABLE public.school_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_gates_auth_all" ON public.school_gates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= gate_sessions =============
CREATE TABLE IF NOT EXISTS public.gate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name text,
  started_by uuid,
  ended_at timestamptz,
  device_info jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_sessions TO authenticated;
GRANT ALL ON public.gate_sessions TO service_role;
ALTER TABLE public.gate_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gate_sessions_auth_all" ON public.gate_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= gate_entries =============
CREATE TABLE IF NOT EXISTS public.gate_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_session_id uuid,
  gate_name text,
  student_id text,
  student_name text,
  class text,
  section text,
  is_recognized boolean DEFAULT false,
  confidence_score real,
  snapshot_url text,
  entry_time timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gate_entries_session ON public.gate_entries(gate_session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gate_entries TO authenticated;
GRANT ALL ON public.gate_entries TO service_role;
ALTER TABLE public.gate_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gate_entries_auth_all" ON public.gate_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= late_entries =============
CREATE TABLE IF NOT EXISTS public.late_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text,
  student_name text,
  reason text,
  reason_detail text,
  entry_time timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.late_entries TO authenticated;
GRANT ALL ON public.late_entries TO service_role;
ALTER TABLE public.late_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "late_entries_auth_all" ON public.late_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= emergency_events =============
CREATE TABLE IF NOT EXISTS public.emergency_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  status text DEFAULT 'active',
  title text,
  description text,
  severity text,
  triggered_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_events TO authenticated;
GRANT ALL ON public.emergency_events TO service_role;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_events_auth_all" ON public.emergency_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE public.emergency_events REPLICA IDENTITY FULL;

-- ============= emotion_events =============
CREATE TABLE IF NOT EXISTS public.emotion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  emotion text,
  confidence real,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_events TO authenticated;
GRANT ALL ON public.emotion_events TO service_role;
ALTER TABLE public.emotion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emotion_events_auth_all" ON public.emotion_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= ai_insights =============
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  insight_type text,
  title text,
  content text,
  score real,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_insights_auth_all" ON public.ai_insights FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= attendance_predictions =============
CREATE TABLE IF NOT EXISTS public.attendance_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  risk_level text,
  probability real,
  notification_sent boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_predictions TO authenticated;
GRANT ALL ON public.attendance_predictions TO service_role;
ALTER TABLE public.attendance_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_predictions_auth_all" ON public.attendance_predictions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= buses =============
CREATE TABLE IF NOT EXISTS public.buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_name text,
  bus_number text,
  driver_name text,
  driver_phone text,
  capacity integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buses_auth_all" ON public.buses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= bus_events =============
CREATE TABLE IF NOT EXISTS public.bus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid,
  event_type text,
  location text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bus_events TO authenticated;
GRANT ALL ON public.bus_events TO service_role;
ALTER TABLE public.bus_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bus_events_auth_all" ON public.bus_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= circulars =============
CREATE TABLE IF NOT EXISTS public.circulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  content text,
  circular_type text,
  is_urgent boolean DEFAULT false,
  created_by uuid,
  sent_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circulars TO authenticated;
GRANT ALL ON public.circulars TO service_role;
ALTER TABLE public.circulars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circulars_auth_all" ON public.circulars FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= school_holidays =============
CREATE TABLE IF NOT EXISTS public.school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  name_hindi text,
  holiday_date date,
  holiday_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_holidays TO authenticated;
GRANT ALL ON public.school_holidays TO service_role;
ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_holidays_auth_all" ON public.school_holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= visitors =============
CREATE TABLE IF NOT EXISTS public.visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  purpose text,
  host_name text,
  photo_url text,
  check_in_time timestamptz DEFAULT now(),
  check_out_time timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitors TO authenticated;
GRANT ALL ON public.visitors TO service_role;
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visitors_auth_all" ON public.visitors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= campus_zones =============
CREATE TABLE IF NOT EXISTS public.campus_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  zone_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campus_zones TO authenticated;
GRANT ALL ON public.campus_zones TO service_role;
ALTER TABLE public.campus_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campus_zones_auth_all" ON public.campus_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= zone_entries =============
CREATE TABLE IF NOT EXISTS public.zone_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid,
  user_id uuid,
  entry_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zone_entries TO authenticated;
GRANT ALL ON public.zone_entries TO service_role;
ALTER TABLE public.zone_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_entries_auth_all" ON public.zone_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= attendance_points =============
CREATE TABLE IF NOT EXISTS public.attendance_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  points integer DEFAULT 0,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_points TO authenticated;
GRANT ALL ON public.attendance_points TO service_role;
ALTER TABLE public.attendance_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_points_auth_all" ON public.attendance_points FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= badges =============
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  description text,
  icon text,
  criteria jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_auth_all" ON public.badges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= student_badges =============
CREATE TABLE IF NOT EXISTS public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  badge_id uuid,
  month_year text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_badges_auth_all" ON public.student_badges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= class_leaderboard =============
CREATE TABLE IF NOT EXISTS public.class_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class text,
  section text,
  total_points integer DEFAULT 0,
  month_year text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_leaderboard TO authenticated;
GRANT ALL ON public.class_leaderboard TO service_role;
ALTER TABLE public.class_leaderboard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_leaderboard_auth_all" ON public.class_leaderboard FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= wellness_scores =============
CREATE TABLE IF NOT EXISTS public.wellness_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  score real,
  factors jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_scores TO authenticated;
GRANT ALL ON public.wellness_scores TO service_role;
ALTER TABLE public.wellness_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wellness_scores_auth_all" ON public.wellness_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= Auto-create profile + default 'user' role on signup =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name')
  ) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
