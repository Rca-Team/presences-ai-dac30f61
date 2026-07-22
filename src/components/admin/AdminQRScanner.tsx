import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsQR from 'jsqr';
import {
  QrCode,
  Zap,
  ZapOff,
  SwitchCamera,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Focus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  getAttendanceCutoffTime,
  isPastCutoffTime,
} from '@/services/attendance/AttendanceSettingsService';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { cn } from '@/lib/utils';

interface QRData {
  id: string;
  user_id?: string;
  student_id?: string;
  name: string;
  employee_id: string;
  category: string;
  timestamp: number;
}

interface RecentEntry {
  id: string;
  name: string;
  employeeId: string;
  status: 'present' | 'late';
  at: number;
}

const normalizeValue = (value: unknown) => String(value ?? '').trim();

const parseQRPayload = (rawValue: string): QRData | null => {
  const raw = normalizeValue(rawValue);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        id: normalizeValue((parsed as any).id || (parsed as any).user_id || (parsed as any).student_id),
        user_id: normalizeValue((parsed as any).user_id),
        student_id: normalizeValue((parsed as any).student_id),
        name: normalizeValue((parsed as any).name || 'Student'),
        employee_id: normalizeValue(
          (parsed as any).employee_id || (parsed as any).student_id || (parsed as any).id
        ),
        category: normalizeValue((parsed as any).category || 'General'),
        timestamp: Number((parsed as any).timestamp || Date.now()),
      };
    }
  } catch {
    return {
      id: raw,
      user_id: raw,
      student_id: raw,
      name: 'Student',
      employee_id: raw,
      category: 'General',
      timestamp: Date.now(),
    };
  }
  return null;
};

const looksLikeUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const SCAN_INTERVAL_MS = 20;
const DUPLICATE_COOLDOWN_MS = 8000;
const MAX_SCAN_WIDTH = 960;

const AdminQRScanner: React.FC = () => {
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);
  const inFlightRef = useRef(false);
  const processingRef = useRef(false);
  const lastFrameAtRef = useRef(0);
  const recentScanRef = useRef<Map<string, number>>(new Map());
  const barcodeDetectorRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lastResult, setLastResult] = useState<RecentEntry | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [scanCount, setScanCount] = useState(0);

  const playBeep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioContextRef.current) audioContextRef.current = new Ctx();
      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1040, now);
      osc.frequency.exponentialRampToValueAtTime(1520, now + 0.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {}
  }, []);

  const vibrate = useCallback(() => {
    try {
      if ('vibrate' in navigator) navigator.vibrate([30, 20, 30]);
    } catch {}
  }, []);

  // Start / restart camera
  const startCamera = useCallback(async (mode: 'user' | 'environment') => {
    setCameraError(null);
    setCameraReady(false);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        await video.play().catch(() => undefined);
      }
      // Torch capability
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.() || {};
      setTorchSupported(!!caps.torch);
      // Continuous autofocus
      try {
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        }
      } catch {}
      setCameraReady(true);
    } catch (err: any) {
      console.error('Camera start failed', err);
      setCameraError(err?.message || 'Unable to access camera. Please grant permission.');
    }
  }, []);

  // Toggle torch
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      toast({ title: 'Flash unavailable', description: 'This camera does not expose flash control.' });
    }
  }, [torchOn, toast]);

  const switchCamera = useCallback(() => {
    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Resolve to a real user_id when the QR carries only a student/employee id
  const resolveAttendanceTargetId = async (qr: QRData) => {
    const preferred = normalizeValue(qr.user_id || qr.id);
    if (preferred && looksLikeUuid(preferred)) return preferred;
    const studentKey = normalizeValue(qr.student_id || qr.employee_id || qr.id);
    if (!studentKey) return preferred || null;
    const [descRes, attRes] = await Promise.all([
      supabase
        .from('face_descriptors')
        .select('user_id')
        .eq('student_id', studentKey)
        .not('user_id', 'is', null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('attendance_records')
        .select('user_id')
        .eq('student_id', studentKey)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return (
      normalizeValue(descRes.data?.user_id) ||
      normalizeValue(attRes.data?.user_id) ||
      preferred ||
      studentKey ||
      null
    );
  };

  const processQR = useCallback(
    async (raw: string) => {
      if (processingRef.current) return;
      const qr = parseQRPayload(raw);
      if (!qr) return;
      const identity = String(qr.user_id || qr.id || qr.employee_id || qr.name || '')
        .trim()
        .toLowerCase();
      if (!identity) return;

      // Duplicate cooldown
      const now = Date.now();
      const last = recentScanRef.current.get(identity);
      if (last && now - last < DUPLICATE_COOLDOWN_MS) return;
      recentScanRef.current.set(identity, now);
      // GC old entries
      for (const [k, t] of recentScanRef.current.entries()) {
        if (now - t > DUPLICATE_COOLDOWN_MS * 3) recentScanRef.current.delete(k);
      }

      processingRef.current = true;
      try {
        const targetId = await resolveAttendanceTargetId(qr);
        if (!targetId) throw new Error('Unrecognized QR');

        const cutoff = await getAttendanceCutoffTime();
        const status: 'present' | 'late' = isPastCutoffTime(cutoff) ? 'late' : 'present';

        await recordAttendance(
          targetId,
          status,
          1,
          {
            source: 'admin-qr-scanner',
            type: 'qr_code',
            scanned_at: new Date().toISOString(),
            metadata: {
              name: qr.name,
              employee_id: qr.employee_id,
              category: qr.category,
            },
          },
          undefined,
          'qr-scan'
        );

        const entry: RecentEntry = {
          id: targetId,
          name: qr.name || 'Student',
          employeeId: qr.employee_id || '—',
          status,
          at: Date.now(),
        };

        setLastResult(entry);
        setRecent((prev) => [entry, ...prev].slice(0, 6));
        setScanCount((c) => c + 1);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 220);

        playBeep();
        vibrate();

        sendAutoParentNotification(targetId, entry.name, status).catch(() => undefined);

        // Clear the big banner after a moment; camera keeps scanning.
        window.setTimeout(() => {
          setLastResult((current) => (current && current.at === entry.at ? null : current));
        }, 1600);
      } catch (err) {
        console.error('QR scan error', err);
        toast({
          title: 'Scan failed',
          description: 'Could not verify this QR right now.',
          variant: 'destructive',
        });
      } finally {
        processingRef.current = false;
      }
    },
    [playBeep, vibrate, toast]
  );

  const detectFrame = useCallback(async () => {
    if (inFlightRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState !== 4) return;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
    if (!ctx) return;

    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (!sw || !sh) return;
    const scale = sw > MAX_SCAN_WIDTH ? MAX_SCAN_WIDTH / sw : 1;
    const tw = Math.max(320, Math.round(sw * scale));
    const th = Math.max(240, Math.round(sh * scale));
    if (lastSizeRef.current.w !== tw || lastSizeRef.current.h !== th) {
      canvas.width = tw;
      canvas.height = th;
      lastSizeRef.current = { w: tw, h: th };
    }
    ctx.drawImage(video, 0, 0, tw, th);

    inFlightRef.current = true;
    try {
      let value: string | null = null;
      if ('BarcodeDetector' in window) {
        if (!barcodeDetectorRef.current) {
          barcodeDetectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        }
        try {
          const codes = await barcodeDetectorRef.current.detect(canvas);
          if (codes?.[0]?.rawValue) value = String(codes[0].rawValue);
        } catch {}
      }
      if (!value) {
        const img = ctx.getImageData(0, 0, tw, th);
        const decoded = jsQR(img.data, tw, th, { inversionAttempts: 'attemptBoth' });
        if (decoded?.data) value = decoded.data;
      }
      if (value) await processQR(value);
    } finally {
      inFlightRef.current = false;
    }
  }, [processQR]);

  // Continuous scan loop
  useEffect(() => {
    if (!cameraReady) return;
    loopActiveRef.current = true;
    const loop = async (ts: number) => {
      if (!loopActiveRef.current) return;
      if (ts - lastFrameAtRef.current >= SCAN_INTERVAL_MS) {
        lastFrameAtRef.current = ts;
        await detectFrame();
      }
      if (loopActiveRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      loopActiveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cameraReady, detectFrame]);

  // Autostart & react to camera switch
  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Scanner */}
      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden rounded-3xl border border-border/60 bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]',
          isFullscreen ? 'w-screen h-screen rounded-none' : 'aspect-[4/3] sm:aspect-video lg:aspect-[4/3]'
        )}
      >
        {/* Video */}
        <video
          ref={videoRef}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            cameraReady ? 'opacity-100' : 'opacity-0'
          )}
          playsInline
          muted
        />

        {/* Loader */}
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Starting camera…</p>
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
            <QrCode className="w-10 h-10 opacity-80" />
            <p className="text-sm max-w-sm">{cameraError}</p>
            <Button size="sm" onClick={() => startCamera(facingMode)}>
              Retry
            </Button>
          </div>
        )}

        {/* Dim mask around scan area */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

        {/* Scan window */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[70%] max-w-[420px] aspect-square">
            {/* Corners */}
            {[
              'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
              'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
              'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
              'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
            ].map((cls, i) => (
              <span
                key={i}
                className={cn('absolute w-10 h-10 border-primary', cls)}
                style={{ boxShadow: '0 0 24px hsl(var(--primary) / 0.55)' }}
              />
            ))}
            {/* Moving scan line */}
            <motion.div
              initial={{ y: '0%' }}
              animate={{ y: ['0%', '100%', '0%'] }}
              transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
              className="absolute left-2 right-2 h-[3px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
              style={{ boxShadow: '0 0 18px hsl(var(--primary) / 0.85)' }}
            />
            {/* Subtle grid */}
            <div className="absolute inset-2 rounded-2xl border border-white/10" />
          </div>
        </div>

        {/* Top status bar */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <Badge
            variant="secondary"
            className="bg-white/10 backdrop-blur-md text-white border-white/20 gap-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Scanning
          </Badge>
          <Badge
            variant="secondary"
            className="bg-white/10 backdrop-blur-md text-white border-white/20 gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {scanCount} today
          </Badge>
        </div>

        {/* Controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 px-2 py-2">
          {torchSupported && (
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTorch}
              className="h-10 w-10 rounded-full text-white hover:bg-white/10"
              title="Toggle flash"
            >
              {torchOn ? <Zap className="w-5 h-5 text-yellow-300" /> : <ZapOff className="w-5 h-5" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={switchCamera}
            className="h-10 w-10 rounded-full text-white hover:bg-white/10"
            title="Switch camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleFullscreen}
            className="h-10 w-10 rounded-full text-white hover:bg-white/10"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </Button>
        </div>

        {/* Success flash */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-green-400/25 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Success banner */}
        <AnimatePresence>
          {lastResult && (
            <motion.div
              initial={{ y: -30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -30, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 min-w-[260px] max-w-[86%] rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl border border-white/40 px-4 py-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{lastResult.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  ID {lastResult.employeeId} · Marked{' '}
                  <span
                    className={cn(
                      lastResult.status === 'late' ? 'text-orange-500' : 'text-green-600 dark:text-green-400',
                      'font-medium'
                    )}
                  >
                    {lastResult.status}
                  </span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Side panel */}
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Focus className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Live Scanner</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Point a student ID QR at the camera. Attendance is marked instantly and scanning continues
            automatically.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/60 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Session scans</p>
              <p className="text-lg font-bold tabular-nums">{scanCount}</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Camera</p>
              <p className="text-sm font-medium truncate">
                {facingMode === 'environment' ? 'Back' : 'Front'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex-1 min-h-[220px]">
          <h3 className="text-sm font-semibold mb-2">Recent scans</h3>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">No scans yet — waiting for a QR code.</p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {recent.map((r) => (
                  <motion.li
                    key={`${r.id}-${r.at}`}
                    layout
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        r.status === 'late' ? 'bg-orange-500' : 'bg-green-500'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">ID {r.employeeId}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminQRScanner;
