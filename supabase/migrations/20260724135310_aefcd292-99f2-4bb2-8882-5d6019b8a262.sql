-- Gate Mode 2.0 vision tables

CREATE TABLE public.gv_cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_kind text NOT NULL DEFAULT 'classroom', -- gate|classroom|corridor|common
  class_key text,
  status text NOT NULL DEFAULT 'idle', -- idle|online|offline
  last_seen_at timestamptz,
  bridge_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gv_cameras TO authenticated;
GRANT ALL ON public.gv_cameras TO service_role;
ALTER TABLE public.gv_cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY gv_cameras_auth_all ON public.gv_cameras FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.gv_camera_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES public.gv_cameras(id) ON DELETE CASCADE,
  zone_key text NOT NULL, -- seat_front|seat_middle|seat_back|doorway
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gv_camera_zones TO authenticated;
GRANT ALL ON public.gv_camera_zones TO service_role;
ALTER TABLE public.gv_camera_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY gv_zones_auth_all ON public.gv_camera_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.gv_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES public.gv_cameras(id) ON DELETE CASCADE,
  local_track_id text NOT NULL,
  day_key date NOT NULL DEFAULT (now()::date),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  subject_type text NOT NULL DEFAULT 'unknown', -- student|teacher|unknown
  subject_id text,
  subject_name text,
  confidence real DEFAULT 0,
  appearance_sig jsonb,
  last_zone text,
  UNIQUE(camera_id, local_track_id, day_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gv_tracks TO authenticated;
GRANT ALL ON public.gv_tracks TO service_role;
ALTER TABLE public.gv_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY gv_tracks_auth_all ON public.gv_tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX gv_tracks_day_cam_idx ON public.gv_tracks(day_key, camera_id);

CREATE TABLE public.gv_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES public.gv_cameras(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.gv_tracks(id) ON DELETE SET NULL,
  class_key text,
  period_key text,
  subject_type text NOT NULL DEFAULT 'unknown',
  subject_id text,
  subject_name text,
  event_type text NOT NULL, -- enter|exit|sit|stand|zone_change|concurrent_exit_alert|face_confirm
  zone text,
  meta jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gv_events TO authenticated;
GRANT ALL ON public.gv_events TO service_role;
ALTER TABLE public.gv_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY gv_events_auth_all ON public.gv_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX gv_events_time_idx ON public.gv_events(occurred_at DESC);
CREATE INDEX gv_events_class_idx ON public.gv_events(class_key, occurred_at DESC);

CREATE TABLE public.gv_class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_key text NOT NULL,
  period_key text NOT NULL,
  day_key date NOT NULL DEFAULT (now()::date),
  teacher_scheduled text,
  teacher_confirmed boolean NOT NULL DEFAULT false,
  teacher_entered_at timestamptz,
  teacher_exited_at timestamptz,
  student_count_peak integer NOT NULL DEFAULT 0,
  students_left_during integer NOT NULL DEFAULT 0,
  students_left_after integer NOT NULL DEFAULT 0,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(class_key, period_key, day_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gv_class_sessions TO authenticated;
GRANT ALL ON public.gv_class_sessions TO service_role;
ALTER TABLE public.gv_class_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY gv_sessions_auth_all ON public.gv_class_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER gv_cameras_updated BEFORE UPDATE ON public.gv_cameras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER gv_sessions_updated BEFORE UPDATE ON public.gv_class_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gv_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gv_tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gv_class_sessions;