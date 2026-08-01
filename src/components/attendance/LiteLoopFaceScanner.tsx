import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';
import { LiteFeedbackControls, LiteFlashOverlay } from './LiteFeedbackControls';
import { supabase } from '@/integrations/supabase/client';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import { alignFace, isFaceFrontal } from '@/services/face-recognition/FaceAlignmentService';
import { scoreFaceQuality } from '@/services/face-recognition/FaceQualityService';
import { Play, Pause, Send, Trash2, Loader2, Users } from 'lucide-react';

/**
 * LiteLoopFaceScanner
 * -------------------
 * Accuracy-first, graphics-free loop attendance for smart boards / low-end devices.
 *
 * Capture phase  : all faces in frame are tracked (IoU), each track collects several
 *                  eye-aligned 112x112 samples that pass a frontality + quality gate.
 *                  Nothing is sent while capturing — no network, no lag.
 * Process phase  : one explicit "Process all" pass. There is NO time budget; it
 *                  takes as long as it needs and prefers accuracy over speed
 *                  (more samples per face, stricter confidence).
 * Close-safe     : the queue lives in localStorage and is re-submitted automatically
 *                  on next open, and submission uses keepalive so it completes even
 *                  if the app/tab is closed mid-flight.
 */

const QUEUE_KEY = 'lite-loop-queue-v1';

const DETECT_MIN_CONFIDENCE = 0.5;
const MAX_FACES_PER_FRAME = 12;
const MIN_FACE_PX = 70;
const SAMPLE_MIN_QUALITY = 0.42;
const COMMIT_MIN_QUALITY = 0.50;
const MIN_SAMPLES = 4;      // accuracy-first: more samples than the full-app loop
const MAX_SAMPLES = 7;
const SAMPLE_INTERVAL_MS = 120;
const TRACK_IOU = 0.30;
const TRACK_TIMEOUT_MS = 700;
const DETECT_INTERVAL_MS = 120;
const SAME_FACE_DIST = 0.42;
const LOCAL_MIN_CONFIDENCE = 0.68;

interface CapturedFace {
  clientId: string;
  descriptor: number[];
  capturedAt: string;
  quality: number;
  samples: number;
}
type ItemStatus = 'marked' | 'late' | 'already' | 'unmatched' | 'error';
interface ItemResult { clientId: string; status: ItemStatus; name?: string }

interface Track {
  id: string;
  box: faceapi.Box;
  lastSeen: number;
  lastSample: number;
  samples: Float32Array[];
  bestQuality: number;
}

const euclid = (a: Float32Array | number[], b: Float32Array | number[]) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = (a as any)[i] - (b as any)[i]; s += d * d; }
  return Math.sqrt(s);
};

const iou = (a: any, b: any) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter <= 0 ? 0 : inter / (a.width * a.height + b.width * b.height - inter);
};

const robustAverage = (samples: Float32Array[]): Float32Array => {
  if (samples.length === 1) return samples[0];
  const dim = samples[0].length;
  const mean = new Float32Array(dim);
  for (const s of samples) for (let i = 0; i < dim; i++) mean[i] += s[i] / samples.length;
  const devs = samples.map(s => euclid(s, mean));
  const sorted = [...devs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const cutoff = Math.max(0.05, median * 2.0);
  const kept = samples.filter((_, i) => devs[i] <= cutoff);
  const use = kept.length >= 2 ? kept : samples;
  const out = new Float32Array(dim);
  for (const s of use) for (let i = 0; i < dim; i++) out[i] += s[i] / use.length;
  return out;
};

const LiteLoopFaceScanner: React.FC = () => {
  const { prefs, toggle, signal, flashKind } = useLiteFeedback();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const tracksRef = useRef<Map<string, Track>>(new Map());
  const seqRef = useRef(0);
  const committedRef = useRef<Float32Array[]>([]);
  const queueRef = useRef<CapturedFace[]>([]);
  const busyRef = useRef(false);

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [liveFaces, setLiveFaces] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ItemResult[]>([]);
  const [note, setNote] = useState('Tap Start, then walk students past the camera.');

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* ignore */ } }, [queue]);

  // Restore any captures left behind by a closed app
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CapturedFace[];
        if (Array.isArray(parsed) && parsed.length) {
          setQueue(parsed);
          setNote(`${parsed.length} capture(s) recovered from last session — tap Process all.`);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      if (!areModelsLoaded()) await loadModels();
      setModelsReady(true);
    })().catch(() => setNote('Face models failed to load — reload the page.'));
  }, []);

  const commitTrack = useCallback((t: Track) => {
    if (t.samples.length < MIN_SAMPLES || t.bestQuality < COMMIT_MIN_QUALITY) return;
    const descriptor = robustAverage(t.samples);
    const dupQueue = queueRef.current.some(q => euclid(descriptor, q.descriptor) < SAME_FACE_DIST);
    const dupSession = committedRef.current.some(d => euclid(descriptor, d) < SAME_FACE_DIST);
    if (dupQueue || dupSession) return;
    committedRef.current.push(descriptor);
    if (committedRef.current.length > 400) committedRef.current.shift();
    setQueue(prev => [{
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      descriptor: Array.from(descriptor),
      capturedAt: new Date().toISOString(),
      quality: t.bestQuality,
      samples: t.samples.length,
    }, ...prev]);
    signal('ok');
  }, [signal]);

  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const started = Date.now();
    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const dets = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({
            minConfidence: DETECT_MIN_CONFIDENCE, maxResults: MAX_FACES_PER_FRAME,
          }))
          .withFaceLandmarks();

        const now = Date.now();
        const used = new Set<string>();
        for (const det of dets) {
          const box = det.detection.box;
          if (Math.min(box.width, box.height) < MIN_FACE_PX) continue;
          let matched: Track | null = null;
          let best = TRACK_IOU;
          for (const t of tracksRef.current.values()) {
            if (used.has(t.id)) continue;
            const o = iou(t.box, box);
            if (o > best) { best = o; matched = t; }
          }
          if (!matched) {
            matched = { id: `t${++seqRef.current}`, box, lastSeen: now, lastSample: 0, samples: [], bestQuality: 0 };
            tracksRef.current.set(matched.id, matched);
          }
          matched.box = box;
          matched.lastSeen = now;
          used.add(matched.id);

          if (matched.samples.length >= MAX_SAMPLES) continue;
          if (now - matched.lastSample < SAMPLE_INTERVAL_MS) continue;
          if (!isFaceFrontal(det.landmarks)) continue;

          const aligned = alignFace(video, det.landmarks, 112);
          const report = scoreFaceQuality(aligned, { width: box.width, height: box.height });
          const quality = report.score * (0.6 + 0.4 * det.detection.score);
          if (quality < SAMPLE_MIN_QUALITY) continue;

          const descriptor = await faceapi.computeFaceDescriptor(aligned) as Float32Array;
          if (!descriptor || descriptor.length !== 128) continue;
          matched.samples.push(descriptor);
          matched.lastSample = Date.now();
          if (quality > matched.bestQuality) matched.bestQuality = quality;
        }

        const stamp = Date.now();
        for (const t of Array.from(tracksRef.current.values())) {
          const ready = t.samples.length >= MAX_SAMPLES;
          const gone = stamp - t.lastSeen > TRACK_TIMEOUT_MS;
          if (ready || gone) { tracksRef.current.delete(t.id); commitTrack(t); }
        }
        setLiveFaces(tracksRef.current.size);
      } catch { /* transient frame errors ignored */ }
    }
    if (!runningRef.current) return;
    const elapsed = Date.now() - started;
    timerRef.current = window.setTimeout(detectLoop, Math.max(16, DETECT_INTERVAL_MS - elapsed));
  }, [commitTrack]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!modelsReady) { setNote('Loading face models…'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      runningRef.current = true;
      setRunning(true);
      setNote('Capturing — best photo of each student is kept automatically.');
      timerRef.current = window.setTimeout(detectLoop, 0);
    } catch (e: any) {
      setNote(e?.message || 'Camera unavailable');
    }
  }, [detectLoop, modelsReady]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setLiveFaces(0);
    tracksRef.current.clear();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    runningRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  /** On-device recognition — no time limit, accuracy first. */
  const processLocally = useCallback(async (items: CapturedFace[]) => {
    const out: ItemResult[] = [];
    let done = 0;
    for (const item of items) {
      try {
        const rec = await recognizeFace(new Float32Array(item.descriptor));
        const conf = rec.confidence ?? 0;
        if (!rec.recognized || !rec.employee || conf < LOCAL_MIN_CONFIDENCE) {
          out.push({ clientId: item.clientId, status: 'unmatched' });
        } else {
          const outcome = await recordAttendance(
            rec.employee.id, 'present', conf,
            { source: 'lite-loop-local', metadata: { name: rec.employee.name } },
            undefined, 'ai-scan',
          );
          if (outcome?.skipped && outcome.reason === 'already_marked') {
            out.push({ clientId: item.clientId, status: 'already', name: rec.employee.name });
          } else if (outcome?.skipped) {
            out.push({ clientId: item.clientId, status: 'unmatched', name: rec.employee.name });
          } else {
            out.push({ clientId: item.clientId, status: (outcome?.status === 'late' ? 'late' : 'marked'), name: rec.employee.name });
          }
        }
      } catch {
        out.push({ clientId: item.clientId, status: 'error' });
      }
      done++;
      setProgress({ done, total: items.length });
    }
    return out;
  }, []);

  const mapServerResults = (list: any[]): ItemResult[] => list.map(r => ({
    clientId: r.clientId,
    name: r.name,
    status: r.recognized && r.alreadyMarked ? 'already'
      : r.recognized && r.status === 'late' ? 'late'
      : r.recognized ? 'marked'
      : r.reason === 'error' ? 'error' : 'unmatched',
  }));

  /** Process everything captured so far. Server first, on-device fallback. */
  const processAll = useCallback(async () => {
    if (busyRef.current) return;
    const items = queueRef.current;
    if (!items.length) return;
    busyRef.current = true;
    setProcessing(true);
    setProgress({ done: 0, total: items.length });
    setNote('Processing — this can take a while, accuracy first.');
    const ids = new Set(items.map(i => i.clientId));
    const payload = items.map(i => ({ clientId: i.clientId, descriptor: i.descriptor, capturedAt: i.capturedAt }));

    try {
      let mapped: ItemResult[] | null = null;
      // Keepalive fetch: finishes even if the app is closed right after tapping.
      const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
      const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      try {
        if (url && key) {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess?.session?.access_token ?? key;
          const body = JSON.stringify({ items: payload });
          const useKeepalive = new Blob([body]).size < 60_000;
          const r = await fetch(`${url}/functions/v1/batch-face-attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${token}` },
            body,
            keepalive: useKeepalive,
          });
          if (r.ok) {
            const data = await r.json().catch(() => null);
            if (Array.isArray(data?.results)) mapped = mapServerResults(data.results);
          }
        }
      } catch { /* fall back on-device */ }

      if (!mapped) {
        setNote('Server unavailable — recognising on this device…');
        mapped = await processLocally(items);
      }

      setResults(prev => [...mapped!, ...prev].slice(0, 300));
      // Only clear captures we actually got a verdict for.
      const settled = new Set(mapped.filter(m => m.status !== 'error').map(m => m.clientId));
      setQueue(q => q.filter(x => !settled.has(x.clientId) || !ids.has(x.clientId)));
      setNote('Done. Results below.');
    } finally {
      setProcessing(false);
      busyRef.current = false;
    }
  }, [processLocally]);

  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {} as Record<ItemStatus, number>);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] max-w-xl mx-auto">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2 text-[11px] text-white bg-black/60 px-2 py-1 rounded inline-flex items-center gap-1">
          <Users className="w-3 h-3" /> {liveFaces} in view · {queue.length} captured
        </div>
        <LiteFlashOverlay kind={flashKind} />
      </div>

      <p className="text-center text-sm text-foreground">{note}</p>
      <LiteFeedbackControls
        prefs={prefs}
        onToggle={toggle}
        status={`${running ? 'capturing' : 'paused'} · ${queue.length} queued · ${results.length} processed`}
      />

      <div className="flex flex-wrap gap-2 justify-center">
        {!running ? (
          <button
            onClick={() => void start()}
            disabled={!modelsReady}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {modelsReady ? 'Start capture' : 'Loading models…'}
          </button>
        ) : (
          <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm">
            <Pause className="w-4 h-4" /> Pause
          </button>
        )}
        <button
          onClick={() => void processAll()}
          disabled={!queue.length || processing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Process all {queue.length ? `(${queue.length})` : ''}
        </button>
        {(queue.length > 0 || results.length > 0) && (
          <button
            onClick={() => { setQueue([]); setResults([]); committedRef.current = []; setNote('Cleared.'); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-destructive"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {processing && progress.total > 0 && (
        <div className="max-w-xl mx-auto text-xs text-muted-foreground text-center">
          {progress.done} / {progress.total} processed
        </div>
      )}

      {results.length > 0 && (
        <div className="max-w-xl mx-auto space-y-2">
          <div className="grid grid-cols-4 gap-2 text-center">
            {([['marked', 'Present'], ['late', 'Late'], ['already', 'Already'], ['unmatched', 'Unknown']] as [ItemStatus, string][]).map(([k, label]) => (
              <div key={k} className="rounded-lg border border-border py-2">
                <div className="text-base font-bold text-foreground">{counts[k] || 0}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border divide-y divide-border">
            {results.slice(0, 40).map(r => (
              <div key={r.clientId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">{r.name || 'Unrecognised'}</span>
                <span className="text-xs text-muted-foreground">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiteLoopFaceScanner;
