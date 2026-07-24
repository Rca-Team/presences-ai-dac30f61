// Gate Mode 2.0 vision ingest.
// Bridges post detected tracks + events here. We validate the shared bridge
// secret, upsert tracks, insert events, and update per-class session state.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INGEST_SECRET = Deno.env.get('GV_INGEST_SECRET') ?? '';
const CONCURRENT_EXIT_WINDOW_S = 60;
const CONCURRENT_EXIT_THRESHOLD = 3;

interface TrackPayload {
  local_track_id: string;
  subject_type?: 'student' | 'teacher' | 'unknown';
  subject_id?: string | null;
  subject_name?: string | null;
  confidence?: number;
  appearance_sig?: unknown;
  last_zone?: string | null;
  ended?: boolean;
}

interface EventPayload {
  local_track_id?: string;
  class_key?: string | null;
  period_key?: string | null;
  subject_type?: 'student' | 'teacher' | 'unknown';
  subject_id?: string | null;
  subject_name?: string | null;
  event_type: 'enter' | 'exit' | 'sit' | 'stand' | 'zone_change' | 'face_confirm';
  zone?: string | null;
  meta?: Record<string, unknown> | null;
  occurred_at?: string;
}

interface IngestBody {
  camera_id: string;
  tracks?: TrackPayload[];
  events?: EventPayload[];
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('x-bridge-secret') ?? '';
  if (!INGEST_SECRET || auth !== INGEST_SECRET) {
    return json(401, { error: 'unauthorized' });
  }

  let payload: IngestBody;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!payload?.camera_id) return json(400, { error: 'camera_id_required' });

  const cameraId = payload.camera_id;
  const dayKey = new Date().toISOString().slice(0, 10);

  // Refresh camera heartbeat
  await sb
    .from('gv_cameras')
    .update({ status: 'online', last_seen_at: new Date().toISOString() })
    .eq('id', cameraId);

  // Load camera row so we know its class_key
  const { data: cam } = await sb
    .from('gv_cameras')
    .select('class_key,location_kind')
    .eq('id', cameraId)
    .maybeSingle();
  const classKey = cam?.class_key ?? null;

  const trackIdByLocal = new Map<string, string>();

  // Upsert tracks
  for (const t of payload.tracks ?? []) {
    const upsert = {
      camera_id: cameraId,
      local_track_id: t.local_track_id,
      day_key: dayKey,
      subject_type: t.subject_type ?? 'unknown',
      subject_id: t.subject_id ?? null,
      subject_name: t.subject_name ?? null,
      confidence: t.confidence ?? 0,
      appearance_sig: t.appearance_sig ?? null,
      last_zone: t.last_zone ?? null,
      ended_at: t.ended ? new Date().toISOString() : null,
    };
    const { data, error } = await sb
      .from('gv_tracks')
      .upsert(upsert, { onConflict: 'camera_id,local_track_id,day_key' })
      .select('id')
      .maybeSingle();
    if (!error && data) trackIdByLocal.set(t.local_track_id, data.id);
  }

  // Insert events
  const eventsIn = payload.events ?? [];
  const eventRows = eventsIn.map((e) => ({
    camera_id: cameraId,
    track_id: e.local_track_id ? trackIdByLocal.get(e.local_track_id) ?? null : null,
    class_key: e.class_key ?? classKey,
    period_key: e.period_key ?? null,
    subject_type: e.subject_type ?? 'unknown',
    subject_id: e.subject_id ?? null,
    subject_name: e.subject_name ?? null,
    event_type: e.event_type,
    zone: e.zone ?? null,
    meta: e.meta ?? null,
    occurred_at: e.occurred_at ?? new Date().toISOString(),
  }));
  if (eventRows.length) await sb.from('gv_events').insert(eventRows);

  // Update per-class session aggregates
  const sessionsTouched = new Set<string>();
  for (const e of eventRows) {
    if (!e.class_key || !e.period_key) continue;
    const key = `${e.class_key}::${e.period_key}`;
    sessionsTouched.add(key);

    // Ensure row exists
    await sb.from('gv_class_sessions').upsert(
      {
        class_key: e.class_key,
        period_key: e.period_key,
        day_key: dayKey,
      },
      { onConflict: 'class_key,period_key,day_key' },
    );

    if (e.subject_type === 'teacher' && (e.event_type === 'enter' || e.event_type === 'face_confirm')) {
      await sb
        .from('gv_class_sessions')
        .update({
          teacher_confirmed: true,
          teacher_entered_at: e.occurred_at,
          teacher_scheduled: e.subject_name ?? e.subject_id ?? null,
        })
        .eq('class_key', e.class_key)
        .eq('period_key', e.period_key)
        .eq('day_key', dayKey)
        .is('teacher_entered_at', null);
    }
    if (e.subject_type === 'teacher' && e.event_type === 'exit') {
      await sb
        .from('gv_class_sessions')
        .update({ teacher_exited_at: e.occurred_at })
        .eq('class_key', e.class_key)
        .eq('period_key', e.period_key)
        .eq('day_key', dayKey);
    }
    if (e.subject_type === 'student' && e.event_type === 'exit') {
      const { data: sess } = await sb
        .from('gv_class_sessions')
        .select('teacher_entered_at, teacher_exited_at, students_left_during, students_left_after')
        .eq('class_key', e.class_key)
        .eq('period_key', e.period_key)
        .eq('day_key', dayKey)
        .maybeSingle();
      if (sess) {
        const inClass = sess.teacher_entered_at && !sess.teacher_exited_at;
        const patch = inClass
          ? { students_left_during: (sess.students_left_during ?? 0) + 1 }
          : { students_left_after: (sess.students_left_after ?? 0) + 1 };
        await sb
          .from('gv_class_sessions')
          .update(patch)
          .eq('class_key', e.class_key)
          .eq('period_key', e.period_key)
          .eq('day_key', dayKey);
      }
    }
  }

  // Concurrent-exit alerts (per class, sliding window)
  for (const key of sessionsTouched) {
    const [classKeyLocal] = key.split('::');
    const since = new Date(Date.now() - CONCURRENT_EXIT_WINDOW_S * 1000).toISOString();
    const { count } = await sb
      .from('gv_events')
      .select('id', { count: 'exact', head: true })
      .eq('class_key', classKeyLocal)
      .eq('event_type', 'exit')
      .eq('subject_type', 'student')
      .gte('occurred_at', since);
    if ((count ?? 0) >= CONCURRENT_EXIT_THRESHOLD) {
      // Debounce: only insert if none in the last window
      const { count: recentAlerts } = await sb
        .from('gv_events')
        .select('id', { count: 'exact', head: true })
        .eq('class_key', classKeyLocal)
        .eq('event_type', 'concurrent_exit_alert')
        .gte('occurred_at', since);
      if ((recentAlerts ?? 0) === 0) {
        await sb.from('gv_events').insert({
          camera_id: cameraId,
          class_key: classKeyLocal,
          event_type: 'concurrent_exit_alert',
          subject_type: 'unknown',
          meta: { count, window_s: CONCURRENT_EXIT_WINDOW_S },
        });
      }
    }
  }

  return json(200, { ok: true });
});
