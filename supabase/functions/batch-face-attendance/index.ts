import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MATCH_THRESHOLD = 0.45;
const AMBIGUITY_RATIO = 0.82;
const MIN_ATTENDANCE_CONFIDENCE = 0.65;

function euclidean(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

function distanceToConfidence(dist: number): number {
  const k = 14;
  return 1 / (1 + Math.exp(k * (dist - MATCH_THRESHOLD)));
}

function parseStoredDescriptor(raw: unknown): Float32Array | null {
  try {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Float32Array(arr);
    }
    if (Array.isArray(raw)) return new Float32Array(raw as number[]);
    return null;
  } catch { return null; }
}

interface CapturedItem {
  clientId: string;
  descriptor: number[];
  imageDataUrl?: string;
  capturedAt: string;
}

async function processBatch(supabase: any, items: CapturedItem[]) {
  // Load all descriptors once
  const { data: rows, error } = await supabase
    .from('face_descriptors')
    .select('user_id, descriptor, student_name, student_id');
  if (error) throw new Error(`Failed to load face descriptors: ${error.message}`);

  // Group per-user
  const perUser = new Map<string, { userName: string; studentId: string | null; descs: Float32Array[] }>();
  for (const r of rows || []) {
    const d = parseStoredDescriptor(r.descriptor);
    if (!d) continue;
    const key = r.user_id;
    if (!perUser.has(key)) {
      perUser.set(key, { userName: r.student_name || 'Unknown', studentId: r.student_id || null, descs: [] });
    }
    perUser.get(key)!.descs.push(d);
  }

  const results: any[] = [];
  const now = new Date();
  const cutoff = new Date(); cutoff.setHours(9, 0, 0, 0);
  const isLate = now > cutoff;

  for (const item of items) {
    const query = new Float32Array(item.descriptor);
    // find best per name (dedupe multiple user_ids for same person)
    const perName = new Map<string, { userId: string; userName: string; studentId: string | null; dist: number }>();
    for (const [uid, info] of perUser) {
      let best = Infinity;
      for (const d of info.descs) {
        if (d.length !== query.length) continue;
        const dist = euclidean(query, d);
        if (dist < best) best = dist;
      }
      if (!Number.isFinite(best)) continue;
      const key = info.userName.trim().toLowerCase();
      const prev = perName.get(key);
      if (!prev || best < prev.dist) {
        perName.set(key, { userId: uid, userName: info.userName, studentId: info.studentId, dist: best });
      }
    }
    const ranked = Array.from(perName.values()).sort((a, b) => a.dist - b.dist);
    const best = ranked[0];
    const second = ranked[1];

    if (!best || best.dist > MATCH_THRESHOLD) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'no_match' });
      continue;
    }
    if (second && best.dist / second.dist > AMBIGUITY_RATIO) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'ambiguous' });
      continue;
    }
    const confidence = Math.max(0, Math.min(1, distanceToConfidence(best.dist)));
    if (confidence < MIN_ATTENDANCE_CONFIDENCE) {
      results.push({ clientId: item.clientId, recognized: false, reason: 'low_confidence', confidence });
      continue;
    }

    // Skip if already marked today
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id, status')
      .eq('user_id', best.userId)
      .in('status', ['present', 'late'])
      .gte('timestamp', dayStart.toISOString())
      .limit(1)
      .maybeSingle();
    if (existing) {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, alreadyMarked: true, confidence });
      continue;
    }

    const status = isLate ? 'late' : 'present';
    const { error: insErr } = await supabase.from('attendance_records').insert({
      user_id: best.userId,
      student_id: best.studentId,
      student_name: best.userName,
      status,
      timestamp: item.capturedAt || new Date().toISOString(),
      face_descriptor: JSON.stringify(item.descriptor),
      device_info: {
        source: 'loop-mode',
        capture_mode: 'ai-scan',
        confidence,
        metadata: { name: best.userName, employee_id: best.studentId },
      },
    });
    if (insErr) {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, error: insErr.message });
    } else {
      results.push({ clientId: item.clientId, recognized: true, name: best.userName, status, confidence });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const items: CapturedItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return new Response(JSON.stringify({ error: 'No items' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = await processBatch(admin, items);
    const summary = {
      total: items.length,
      recognized: results.filter(r => r.recognized).length,
      marked: results.filter(r => r.status).length,
      alreadyMarked: results.filter(r => r.alreadyMarked).length,
      unrecognized: results.filter(r => !r.recognized).length,
    };
    return new Response(JSON.stringify({ ok: true, summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('batch-face-attendance error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
