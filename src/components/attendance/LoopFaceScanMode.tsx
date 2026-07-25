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
const QUALITY_MIN = 0.72;              // detector confidence
const SAME_FACE_DIST = 0.42;           // dedupe within same session
const CAPTURE_COOLDOWN_MS = 900;       // gap after a capture before allowing next

const euclid = (a: Float32Array, b: number[]) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
};

const LoopFaceScanMode: React.FC = () => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastCaptureRef = useRef<number>(0);
  const runningRef = useRef(false);

  const [modelsReady, setModelsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<CapturedFace[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

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
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const captureFrom = useCallback(async (video: HTMLVideoElement, box: faceapi.Box) => {
    // draw crop of face with padding
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
    return c.toDataURL('image/jpeg', 0.82);
  }, []);

  const detectLoop = useCallback(async () => {
    if (!runningRef.current) return;
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;
    if (!video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      const now = Date.now();
      if (det && det.detection.score >= QUALITY_MIN && now - lastCaptureRef.current > CAPTURE_COOLDOWN_MS) {
        const descArr = Array.from(det.descriptor);
        // dedupe within session
        const dup = queue.some(q => euclid(det.descriptor, q.descriptor) < SAME_FACE_DIST);
        if (!dup) {
          const image = await captureFrom(video, det.detection.box);
          const item: CapturedFace = {
            clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            descriptor: descArr,
            imageDataUrl: image,
            capturedAt: new Date().toISOString(),
            quality: det.detection.score,
          };
          setQueue(prev => [item, ...prev]);
          lastCaptureRef.current = now;
          setFlash(true);
          setTimeout(() => setFlash(false), 220);
          try { (navigator as any).vibrate?.(35); } catch {}
        }
      }
    } catch {}

    rafRef.current = requestAnimationFrame(detectLoop);
  }, [queue, captureFrom]);

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
