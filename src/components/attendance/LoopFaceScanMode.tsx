import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { loadModels, areModelsLoaded } from '@/services/face-recognition/ModelService';
import * as faceapi from 'face-api.js';
import {
  Camera, Play, Pause, Send, Trash2, CheckCircle2, Loader2,
  Users, Sparkles, Repeat, X,
} from 'lucide-react';

interface CapturedFace {
  clientId: string;
  descriptor: number[];
  imageDataUrl: string;
  capturedAt: string;
  quality: number;
}

const QUEUE_KEY = 'loop-mode-queue-v1';
const DETECT_MIN_SCORE = 0.55;         // baseline detector confidence
const QUALITY_COMMIT = 0.62;           // combined quality required to commit
const SAME_FACE_DIST = 0.42;           // dedupe within same session queue
const CANDIDATE_MATCH_DIST = 0.45;     // same-face across frames while tracking
const MIN_HOLD_MS = 380;               // must observe a face at least this long
const MAX_HOLD_MS = 1100;              // commit even if still improving
const IDLE_COMMIT_MS = 180;            // commit if we lose the face for this long
const POST_CAPTURE_COOLDOWN_MS = 650;  // gap between commits to avoid spam

const euclid = (a: Float32Array | number[], b: Float32Array | number[]) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = (a as any)[i] - (b as any)[i]; s += d * d; }
  return Math.sqrt(s);
};

// Combined quality: detector score × size × frontality (nose centered between eyes)
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
  const frontality = Math.max(0, 1 - off * 2.2); // 0..1
  return score * (0.55 + 0.45 * sizeRatio) * (0.55 + 0.45 * frontality);
};

interface Candidate {
  descriptor: Float32Array;
  box: faceapi.Box;
  quality: number;      // combined quality of best frame so far
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

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [tracking, setTracking] = useState(false); // UI: currently accumulating a shot

  // keep ref in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // load persisted queue
  useEffect(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) setQueue(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
  }, [queue]);

  // load models
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

  const commitCandidate = useCallback(() => {
    const cand = candidateRef.current;
    candidateRef.current = null;
    setTracking(false);
    if (!cand) return;
    if (cand.quality < QUALITY_COMMIT) return;

    // dedupe against already-queued faces (unique per session)
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

        // skip immediately if this face is already in queue
        const alreadyQueued = queueRef.current.some(item => euclid(det.descriptor, item.descriptor) < SAME_FACE_DIST);
        if (alreadyQueued) {
          candidateRef.current = null;
          setTracking(false);
        } else {
          const isSame = cand && euclid(det.descriptor, cand.descriptor) < CANDIDATE_MATCH_DIST;

          if (!cand || !isSame) {
            // new candidate — reset accumulator
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
              // commit if we've held long enough OR quality is already excellent
              if (held >= MAX_HOLD_MS || cand.quality >= 0.85) {
                commitCandidate();
              }
            }
          }
        }
      } else if (cand) {
        // no face this frame — if we lost it for a bit, commit if good enough
        if (now - cand.lastSeen >= IDLE_COMMIT_MS) {
          if (cand.quality >= QUALITY_COMMIT && now - cand.firstSeen >= MIN_HOLD_MS) {
            commitCandidate();
          } else {
            // discard weak candidate
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

  useEffect(() => () => { runningRef.current = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const removeItem = (id: string) => setQueue(q => q.filter(x => x.clientId !== id));
  const clearAll = () => setQueue([]);

  const submit = async () => {
    if (!queue.length) return;
    setSubmitting(true);
    // pause capture during submit (server continues even if we close)
    const wasRunning = runningRef.current;
    stop();
    try {
      const items = queue.map(q => ({
        clientId: q.clientId,
        descriptor: q.descriptor,
        capturedAt: q.capturedAt,
      }));
      const { data, error } = await supabase.functions.invoke('batch-face-attendance', {
        body: { items },
      });
      if (error) throw error;
      setLastResult(data);
      toast({
        title: 'Batch processed',
        description: `${data?.summary?.marked ?? 0} marked · ${data?.summary?.alreadyMarked ?? 0} already · ${data?.summary?.unrecognized ?? 0} unmatched`,
      });
      setQueue([]);
    } catch (e: any) {
      toast({ title: 'Submit failed', description: e?.message || 'Backend error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      if (wasRunning) start();
    }
  };

  // fire-and-forget: user closes tab; server keeps processing
  const submitDetached = async () => {
    if (!queue.length) return;
    const items = queue.map(q => ({ clientId: q.clientId, descriptor: q.descriptor, capturedAt: q.capturedAt }));
    // send WITHOUT awaiting — edge function runs independently of the tab
    supabase.functions.invoke('batch-face-attendance', { body: { items } }).catch(() => {});
    toast({ title: 'Sent to backend', description: 'Processing will continue even if you close the app.' });
    setQueue([]);
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
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

        {/* Face frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ scale: running ? [1, 1.03, 1] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-56 h-72 sm:w-64 sm:h-80 rounded-[42%] border-2"
            style={{ borderColor: running ? 'hsl(var(--ios-green))' : 'rgba(255,255,255,0.35)' }}
          />
        </div>

        {/* Flash overlay */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-white"
            />
          )}
        </AnimatePresence>

        {/* Top status */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
            <Repeat className="w-3 h-3 mr-1" /> Loop Mode
          </Badge>
          <Badge className="bg-black/60 text-white border-white/20 backdrop-blur">
            <Users className="w-3 h-3 mr-1" /> {queue.length} captured
          </Badge>
        </div>

        {/* Bottom cue */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
          <div className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs backdrop-blur">
            {running
              ? 'Point at students one by one — auto-captures best shot'
              : 'Tap Start to begin capturing'}
          </div>
        </div>
      </div>

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
          onClick={submit}
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
          title="Send to backend and safely close the app; processing continues on the server"
        >
          <Sparkles className="w-4 h-4 mr-1" /> Send & Close-Safe
        </Button>
        {queue.length > 0 && (
          <Button onClick={clearAll} size="lg" variant="ghost" className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Queue grid */}
      {queue.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-muted-foreground mb-2 px-1">
            Captured queue · saved locally, will be processed on server
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {queue.map(item => (
              <motion.div
                key={item.clientId}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="relative aspect-square rounded-xl overflow-hidden bg-muted border border-border/60"
              >
                <img src={item.imageDataUrl} alt="captured" className="w-full h-full object-cover" />
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
          </div>
        </div>
      )}

      {/* Last result summary */}
      {lastResult?.summary && (
        <div className="max-w-2xl mx-auto rounded-xl border border-border/60 bg-card/70 backdrop-blur p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Last batch
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
