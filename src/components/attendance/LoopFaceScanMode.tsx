import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import { recognizeFace, recordAttendance } from '@/services/face-recognition/RecognitionService';
import * as faceapi from 'face-api.js';
import {
  Play, Pause, Send, Trash2, CheckCircle2, Loader2,
  Users, Sparkles, Repeat, X, WifiOff, AlertTriangle,
} from 'lucide-react';

interface CapturedFace {
  clientId: string;
  descriptor: number[];
  imageDataUrl: string;
  capturedAt: string;
  quality: number;
}

type ItemStatus = 'marked' | 'already' | 'late' | 'unmatched' | 'low_conf' | 'error';
interface ItemResult { clientId: string; status: ItemStatus; name?: string; confidence?: number }

const QUEUE_KEY = 'loop-mode-queue-v1';
const DETECT_MIN_SCORE = 0.55;
const QUALITY_COMMIT = 0.62;
const SAME_FACE_DIST = 0.42;
const CANDIDATE_MATCH_DIST = 0.45;
const MIN_HOLD_MS = 380;
const MAX_HOLD_MS = 1100;
const IDLE_COMMIT_MS = 180;
const POST_CAPTURE_COOLDOWN_MS = 650;

const AUTO_BATCH_SIZE = 5;
const AUTO_FLUSH_MS = 4000;
const LOCAL_MIN_CONFIDENCE = 0.65;

const euclid = (a: Float32Array | number[], b: Float32Array | number[]) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = (a as any)[i] - (b as any)[i]; s += d * d; }
  return Math.sqrt(s);
};

const computeQuality = (
  det: faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>,
  video: HTMLVideoElement,
): number => {
  const box = det.detection.box;
  const score = det.detection.score;
  const sizeRatio = Math.min(1, box.width / Math.max(140, video.videoWidth * 0.22));
  const lm = det.landmarks;
  const le = lm.getLeftEye(), re = lm.getRightEye(), nose = lm.getNose();
  const leCx = (le[0].x + le[3].x) / 2;
  const reCx = (re[0].x + re[3].x) / 2;
  const eyeMid = (leCx + reCx) / 2;
  const eyeDist = Math.max(1, Math.abs(reCx - leCx));
  const noseX = nose[3].x;
  const off = Math.abs(noseX - eyeMid) / eyeDist;
  const frontality = Math.max(0, 1 - off * 2.2);
  return score * (0.55 + 0.45 * sizeRatio) * (0.55 + 0.45 * frontality);
};

interface Candidate {
  descriptor: Float32Array;
  box: faceapi.Box;
  quality: number;
  firstSeen: number;
  lastSeen: number;
  imageDataUrl: string;
}

const LoopFaceScanMode: React.FC = () => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const rafRef = useRef<number | null>(null);
  const lastCaptureRef = useRef<number>(0);
  const runningRef = useRef(false);
  const candidateRef = useRef<Candidate | null>(null);
  const queueRef = useRef<CapturedFace[]>([]);
  const submittingRef = useRef(false);
  const autoFlushTimerRef = useRef<number | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [tracking, setTracking] = useState(false);
  const [autoProcess, setAutoProcess] = useState(true);
  const [serverDown, setServerDown] = useState(false);
  const [itemResults, setItemResults] = useState<Record<string, ItemResult>>({});

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) setQueue(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
  }, [queue]);

  useEffect(() => {
    (async () => {
      if (!areModelsLoaded()) await loadModels();
      setModelsReady(true);
    })().catch(() => toast({ title: 'Models failed', description: 'Reload page', variant: 'destructive' }));
  }, [toast]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setTracking(false);
    candidateRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const captureFrom = useCallback((video: HTMLVideoElement, box: faceapi.Box) => {
    const pad = 0.35;
    const w = video.videoWidth, h = video.videoHeight;
    const cw = Math.min(w, box.width * (1 + pad * 2));
    const ch = Math.min(h, box.height * (1 + pad * 2));
    const cx = Math.max(0, box.x - box.width * pad);
    const cy = Math.max(0, box.y - box.height * pad);
    const c = document.createElement('canvas');
    c.width = 320; c.height = 320;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, cx, cy, cw, ch, 0, 0, 320, 320);
    return c.toDataURL('image/jpeg', 0.85);
  }, []);

  // ─── Local (client-side) fallback recognizer ───────────────────────────────
  const processLocally = useCallback(async (items: CapturedFace[]) => {
    const results: any[] = [];
    let marked = 0, alreadyMarked = 0, unrecognized = 0, lowConf = 0;

    for (const item of items) {
      try {
        const desc = new Float32Array(item.descriptor);
        const rec = await recognizeFace(desc);
        if (!rec.recognized || !rec.employee) {
          unrecognized++;
          results.push({ clientId: item.clientId, recognized: false, reason: 'no_match' });
          continue;
        }
        const conf = rec.confidence ?? 0;
        if (conf < LOCAL_MIN_CONFIDENCE) {
          lowConf++;
          unrecognized++;
          results.push({ clientId: item.clientId, recognized: false, reason: 'low_confidence', confidence: conf });
          continue;
        }
        const outcome = await recordAttendance(
          rec.employee.id,
          'present',
          conf,
          { source: 'loop-mode-local', metadata: { name: rec.employee.name } },
          item.imageDataUrl,
          'ai-scan',
        );
        if (outcome?.skipped) {
          if (outcome.reason === 'already_marked') {
            alreadyMarked++;
            results.push({ clientId: item.clientId, recognized: true, alreadyMarked: true, name: rec.employee.name, confidence: conf });
          } else {
            lowConf++;
            results.push({ clientId: item.clientId, recognized: false, reason: outcome.reason, confidence: conf });
          }
        } else {
          marked++;
          const status = outcome?.status || 'present';
          results.push({ clientId: item.clientId, recognized: true, name: rec.employee.name, status, confidence: conf });
        }
      } catch (e: any) {
        results.push({ clientId: item.clientId, recognized: false, reason: 'error', error: e?.message });
      }
    }
    return {
      ok: true,
      summary: { total: items.length, marked, alreadyMarked, unrecognized, lowConf },
      results,
      via: 'local' as const,
    };
  }, []);

  const applyResults = useCallback((results: any[]) => {
    const map: Record<string, ItemResult> = {};
    const toRemove = new Set<string>();
    for (const r of results) {
      let status: ItemStatus = 'error';
      if (r.recognized && r.alreadyMarked) status = 'already';
      else if (r.recognized && r.status === 'late') status = 'late';
      else if (r.recognized) status = 'marked';
      else if (r.reason === 'low_confidence') status = 'low_conf';
      else if (r.reason === 'ambiguous' || r.reason === 'no_match') status = 'unmatched';
      map[r.clientId] = { clientId: r.clientId, status, name: r.name, confidence: r.confidence };
      if (status === 'marked' || status === 'already' || status === 'late') toRemove.add(r.clientId);
    }
    setItemResults(prev => ({ ...prev, ...map }));
    // Remove successfully-processed items after a short delay so user sees the pill
    setTimeout(() => {
      setQueue(prev => prev.filter(q => !toRemove.has(q.clientId)));
      setItemResults(prev => {
        const next = { ...prev };
        for (const id of toRemove) delete next[id];
        return next;
      });
    }, 900);
  }, []);

  const submit = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (submittingRef.current) return;
    const items = queueRef.current;
    if (!items.length) return;
    setSubmitting(true);
    const wasRunning = runningRef.current;
    try {
      const payload = items.map(q => ({
        clientId: q.clientId,
        descriptor: q.descriptor,
        capturedAt: q.capturedAt,
      }));

      let data: any = null;
      let usedLocal = false;
      try {
        const { data: srvData, error } = await supabase.functions.invoke('batch-face-attendance', { body: { items: payload } });
        if (error) throw error;
        if (!srvData?.summary) throw new Error('Malformed server response');
        data = srvData;
        setServerDown(false);
      } catch (edgeErr: any) {
        console.warn('Edge function unavailable, falling back to local recognition:', edgeErr?.message || edgeErr);
        setServerDown(true);
        data = await processLocally(items);
        usedLocal = true;
      }

      setLastResult(data);
      if (Array.isArray(data?.results)) applyResults(data.results);

      if (!opts.silent) {
        const s = data.summary || {};
        toast({
          title: usedLocal ? 'Processed on-device' : 'Batch processed',
          description: `${s.marked ?? 0} marked · ${s.alreadyMarked ?? 0} already · ${s.unrecognized ?? 0} unmatched${usedLocal ? ' (offline mode)' : ''}`,
        });
      }
    } catch (e: any) {
      toast({ title: 'Process failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      if (wasRunning && !runningRef.current) {
        // scanner was paused externally — leave it
      }
    }
  }, [applyResults, processLocally, toast]);

  const scheduleAutoFlush = useCallback(() => {
    if (!autoProcess) return;
    if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
    autoFlushTimerRef.current = window.setTimeout(() => {
      if (!submittingRef.current && queueRef.current.length > 0) submit({ silent: true });
    }, AUTO_FLUSH_MS);
  }, [autoProcess, submit]);

  // Auto-batch trigger when queue reaches threshold
  useEffect(() => {
    if (!autoProcess) return;
    if (submitting) return;
    if (queue.length >= AUTO_BATCH_SIZE) {
      submit({ silent: true });
    } else if (queue.length > 0) {
      scheduleAutoFlush();
    }
    return () => {
      if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
    };
  }, [queue.length, autoProcess, submitting, submit, scheduleAutoFlush]);

  const commitCandidate = useCallback(() => {
    const cand = candidateRef.current;
    candidateRef.current = null;
    setTracking(false);
    if (!cand) return;
    if (cand.quality < QUALITY_COMMIT) return;

    const dup = queueRef.current.some(q => euclid(cand.descriptor, q.descriptor) < SAME_FACE_DIST);
    if (dup) return;

    const item: CapturedFace = {
      clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      descriptor: Array.from(cand.descriptor),
      imageDataUrl: cand.imageDataUrl,
      capturedAt: new Date().toISOString(),
      quality: cand.quality,
    };
    setQueue(prev => [item, ...prev]);
    lastCaptureRef.current = Date.now();
    setFlash(true);
    setTimeout(() => setFlash(false), 200);
    try { (navigator as any).vibrate?.(30); } catch {}
  }, []);

  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const now = Date.now();
    const inCooldown = now - lastCaptureRef.current < POST_CAPTURE_COOLDOWN_MS;

    try {
      const det = inCooldown
        ? null
        : await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: DETECT_MIN_SCORE }))
            .withFaceLandmarks()
            .withFaceDescriptor();

      const cand = candidateRef.current;

      if (det && det.detection.score >= DETECT_MIN_SCORE) {
        const q = computeQuality(det, video);
        const alreadyQueued = queueRef.current.some(item => euclid(det.descriptor, item.descriptor) < SAME_FACE_DIST);
        if (alreadyQueued) {
          candidateRef.current = null;
          setTracking(false);
        } else {
          const isSame = cand && euclid(det.descriptor, cand.descriptor) < CANDIDATE_MATCH_DIST;
          if (!cand || !isSame) {
            candidateRef.current = {
              descriptor: det.descriptor,
              box: det.detection.box,
              quality: q,
              firstSeen: now,
              lastSeen: now,
              imageDataUrl: captureFrom(video, det.detection.box),
            };
            setTracking(true);
          } else {
            cand.lastSeen = now;
            if (q > cand.quality) {
              cand.quality = q;
              cand.descriptor = det.descriptor;
              cand.box = det.detection.box;
              cand.imageDataUrl = captureFrom(video, det.detection.box);
            }
            const held = now - cand.firstSeen;
            if (held >= MIN_HOLD_MS && cand.quality >= QUALITY_COMMIT) {
              if (held >= MAX_HOLD_MS || cand.quality >= 0.85) commitCandidate();
            }
          }
        }
      } else if (cand) {
        if (now - cand.lastSeen >= IDLE_COMMIT_MS) {
          if (cand.quality >= QUALITY_COMMIT && now - cand.firstSeen >= MIN_HOLD_MS) {
            commitCandidate();
          } else {
            candidateRef.current = null;
            setTracking(false);
          }
        }
      }
    } catch {}

    rafRef.current = requestAnimationFrame(detectLoop);
  }, [captureFrom, commitCandidate]);

  const start = useCallback(() => {
    if (!modelsReady) {
      toast({ title: 'Loading models…', description: 'Try again in a moment' });
      return;
    }
    runningRef.current = true;
    setRunning(true);
    lastCaptureRef.current = 0;
    rafRef.current = requestAnimationFrame(detectLoop);
  }, [detectLoop, modelsReady, toast]);

  useEffect(() => () => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (autoFlushTimerRef.current) window.clearTimeout(autoFlushTimerRef.current);
  }, []);

  const removeItem = (id: string) => setQueue(q => q.filter(x => x.clientId !== id));
  const clearAll = () => { setQueue([]); setItemResults({}); };

  const submitDetached = async () => {
    if (!queue.length) return;
    const snapshot = [...queue];
    const ids = new Set(snapshot.map(s => s.clientId));
    const payload = snapshot.map(q => ({ clientId: q.clientId, descriptor: q.descriptor, capturedAt: q.capturedAt }));

    const runLocalFallback = async () => {
      toast({ title: 'Server unavailable — processing on device…', description: 'Keeping this screen open finishes attendance faster.' });
      try {
        const data = await processLocally(snapshot);
        setLastResult(data);
        applyResults(data.results);
        setQueue(q => q.filter(x => !ids.has(x.clientId)));
        setServerDown(true);
        toast({ title: 'Processed on-device', description: 'Attendance marked locally.' });
      } catch {
        toast({
          title: 'Submission failed',
          description: 'Kept your captures — please retry when connection is stable.',
          variant: 'destructive' as any,
        });
      }
    };

    // Try keepalive fetch first so the request survives tab close. We do NOT
    // clear the queue until we get a successful reply — this prevents silent
    // data loss on non-2xx responses. If the user closes the tab before the
    // reply arrives, the queue persists in localStorage and can be retried
    // (server-side mark is idempotent via already-marked status).
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    const anonKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    try {
      if (supabaseUrl && anonKey) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token ?? anonKey;
        const body = JSON.stringify({ items: payload });
        if (new Blob([body]).size < 60_000) {
          toast({ title: 'Sending…', description: 'Safe to close — will finish in background if online.' });
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/batch-face-attendance`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: anonKey,
                Authorization: `Bearer ${accessToken}`,
              },
              body,
              keepalive: true,
            });
            if (r.ok) {
              const data = await r.json().catch(() => null);
              setServerDown(false);
              if (data?.results) {
                applyResults(data.results);
                setLastResult(data);
              }
              // Only now safe to clear.
              setQueue(q => q.filter(x => !ids.has(x.clientId)));
              toast({ title: 'Attendance submitted', description: 'Server confirmed your captures.' });
              return;
            }
            // Non-2xx: preserve queue, fall back locally.
            setServerDown(true);
            await runLocalFallback();
            return;
          } catch {
            // Network error: preserve queue, fall back locally.
            setServerDown(true);
            await runLocalFallback();
            return;
          }
        }
      }
    } catch { /* fall through */ }

    // No env / oversized body — go straight to local fallback.
    await runLocalFallback();
  };


  const statusBadge = (r?: ItemResult) => {
    if (!r) return null;
    const styles: Record<ItemStatus, string> = {
      marked: 'bg-emerald-500 text-white',
      late: 'bg-amber-500 text-white',
      already: 'bg-slate-500 text-white',
      unmatched: 'bg-rose-500 text-white',
      low_conf: 'bg-orange-500 text-white',
      error: 'bg-rose-600 text-white',
    };
    const label: Record<ItemStatus, string> = {
      marked: '✓ Marked', late: '✓ Late', already: '• Already', unmatched: '✗ No match', low_conf: '⚠ Low', error: '! Error',
    };
    return (
      <div className={`absolute top-1 left-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${styles[r.status]}`}>
        {label[r.status]}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Camera */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] max-w-2xl mx-auto shadow-lg">
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }}
          className="w-full h-full object-cover"
        />

        {tracking && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0.4 }}
              animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="w-60 h-76 sm:w-72 sm:h-88 rounded-[42%] border-[3px]"
              style={{ borderColor: 'hsl(var(--ios-green))' }}
            />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: running ? [1, 1.03, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-56 h-72 sm:w-64 sm:h-80 rounded-[42%] border-2"
            style={{ borderColor: running ? 'hsl(var(--ios-green))' : 'rgba(255,255,255,0.35)' }}
          />
        </div>

        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-white"
            />
          )}
        </AnimatePresence>

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
            <Repeat className="w-3 h-3 mr-1" /> Loop Mode
          </Badge>
          <div className="flex items-center gap-2">
            {submitting && (
              <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing
              </Badge>
            )}
            <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
              <Users className="w-3 h-3 mr-1" /> {queue.length} queued
            </Badge>
          </div>
        </div>

        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
          <div className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs backdrop-blur">
            {running
              ? (autoProcess ? 'Auto-marking as students appear — just point the camera' : 'Point at students — press Process when done')
              : 'Tap Start to begin capturing'}
          </div>
        </div>
      </div>

      {serverDown && (
        <div className="max-w-2xl mx-auto flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-xs">
          <WifiOff className="w-4 h-4" />
          Server unavailable — using on-device recognition. Attendance is still being marked.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
        {!running ? (
          <Button onClick={start} disabled={!modelsReady} size="lg" className="min-w-[140px]">
            <Play className="w-4 h-4 mr-1" /> Start
          </Button>
        ) : (
          <Button onClick={stop} size="lg" variant="secondary" className="min-w-[140px]">
            <Pause className="w-4 h-4 mr-1" /> Pause
          </Button>
        )}
        <Button
          onClick={() => submit()}
          disabled={!queue.length || submitting}
          size="lg"
          className="min-w-[160px] bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Process {queue.length ? `(${queue.length})` : ''}
        </Button>
        <Button
          onClick={submitDetached}
          disabled={!queue.length || submitting}
          size="lg"
          variant="outline"
          title="Send in background — falls back to on-device if server is offline"
        >
          <Sparkles className="w-4 h-4 mr-1" /> Send & Close-Safe
        </Button>
        {queue.length > 0 && (
          <Button onClick={clearAll} size="lg" variant="ghost" className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-card/60">
          <Switch id="auto-proc" checked={autoProcess} onCheckedChange={setAutoProcess} />
          <Label htmlFor="auto-proc" className="text-xs cursor-pointer">Auto process</Label>
        </div>
      </div>

      {/* Queue grid */}
      {queue.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1">
            {autoProcess ? (
              <><Sparkles className="w-3 h-3" /> Auto-processing enabled — marks attendance as faces are captured</>
            ) : (
              <><AlertTriangle className="w-3 h-3" /> Manual mode — press Process to mark attendance</>
            )}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <AnimatePresence>
              {queue.map(item => (
                <motion.div
                  key={item.clientId}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="relative aspect-square rounded-xl overflow-hidden bg-muted border border-border/60"
                >
                  <img src={item.imageDataUrl} alt="captured" className="w-full h-full object-cover" />
                  {statusBadge(itemResults[item.clientId])}
                  <button
                    onClick={() => removeItem(item.clientId)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 text-center">
                    {(item.quality * 100).toFixed(0)}%
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {lastResult?.summary && (
        <div className="max-w-2xl mx-auto rounded-xl border border-border/60 bg-card/70 backdrop-blur p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Last batch
            {lastResult.via === 'local' && <span className="text-xs text-amber-500">(on-device)</span>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Total {lastResult.summary.total} · Marked {lastResult.summary.marked} · Already {lastResult.summary.alreadyMarked} · Unmatched {lastResult.summary.unrecognized}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoopFaceScanMode;
