import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { recordAttendance } from '@/services/face-recognition/RecognitionService';
import { getAttendanceCutoffTime, isPastCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { sendAutoParentNotification } from '@/services/notification/AutoNotificationService';
import { QrCode, Camera, CameraOff, RefreshCw } from 'lucide-react';

/**
 * LiteQRScanner
 * -------------
 * Bare-metal QR attendance for smart boards / low-end Android.
 * - Raw <video> + getUserMedia (no react-webcam, no framer-motion, no blur)
 * - Native BarcodeDetector when available (GPU accelerated, handles motion),
 *   jsQR loaded lazily ONLY as a fallback so slow devices never pay for it.
 * - requestVideoFrameCallback driven: decodes exactly one frame per new frame,
 *   so a moving card is picked up immediately without stacking work.
 */

interface QRData {
  id: string;
  user_id?: string;
  student_id?: string;
  name: string;
  employee_id: string;
  category: string;
}

const COOLDOWN_MS = 12_000;
const MAX_SCAN_WIDTH = 640;

const normalize = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');
const looksLikeUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

function parsePayload(raw: string): QRData | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return {
        id: String(parsed.id ?? parsed.user_id ?? parsed.student_id ?? ''),
        user_id: parsed.user_id,
        student_id: parsed.student_id,
        name: parsed.name ?? 'Student',
        employee_id: parsed.employee_id ?? parsed.student_id ?? '',
        category: parsed.category ?? 'General',
      };
    }
  } catch {
    /* plain-text card */
  }
  return { id: value, user_id: value, student_id: value, name: 'Student', employee_id: value, category: 'General' };
}

const LiteQRScanner: React.FC<{ autoStart?: boolean }> = ({ autoStart = true }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jsqrRef = useRef<any>(null);
  const detectorRef = useRef<any>(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const seenRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<{ name: string; id: string; status: string; time: number }[]>([]);

  const beep = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1040;
      gain.gain.value = 0.12;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
      setTimeout(() => ctx.close().catch(() => undefined), 300);
    } catch { /* ignore */ }
  };

  const resolveTarget = async (qr: QRData) => {
    const preferred = normalize(qr.user_id || qr.id);
    if (preferred && looksLikeUuid(preferred)) return preferred;
    const key = normalize(qr.student_id || qr.employee_id || qr.id);
    if (!key) return preferred || null;
    const [d, a] = await Promise.all([
      supabase.from('face_descriptors').select('user_id').eq('student_id', key).not('user_id', 'is', null).limit(1).maybeSingle(),
      supabase.from('attendance_records').select('user_id').eq('student_id', key).not('user_id', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return normalize(d.data?.user_id) || normalize(a.data?.user_id) || preferred || key || null;
  };

  const handleValue = useCallback(async (raw: string) => {
    const now = Date.now();
    const last = seenRef.current.get(raw);
    if (last && now - last < COOLDOWN_MS) return;
    seenRef.current.set(raw, now);
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const qr = parsePayload(raw);
      if (!qr) return;
      const target = await resolveTarget(qr);
      if (!target) return;
      const cutoff = await getAttendanceCutoffTime();
      const st = isPastCutoffTime(cutoff) ? 'late' : 'present';
      await recordAttendance(target, st, 1, {
        source: 'lite-qr-scanner',
        type: 'qr_code',
        scanned_at: new Date().toISOString(),
        metadata: { name: qr.name, employee_id: qr.employee_id },
      }, undefined, 'qr-scan');
      beep();
      try { navigator.vibrate?.(40); } catch { /* ignore */ }
      setScans(prev => [{ name: qr.name, id: qr.employee_id || target.slice(0, 8), status: st, time: now }, ...prev].slice(0, 12));
      setStatus(`${qr.name} · ${st}`);
      sendAutoParentNotification(target, qr.name, st).catch(() => undefined);
    } catch (e: any) {
      setStatus('Scan failed — try again');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!runningRef.current || !video || video.readyState < 2) return;

    // 1) Native detector (fastest, handles motion blur best)
    if (detectorRef.current) {
      try {
        const codes = await detectorRef.current.detect(video);
        if (codes?.length) {
          for (const c of codes) if (c.rawValue) void handleValue(c.rawValue);
          return;
        }
      } catch { /* fall through to jsQR */ }
    }

    // 2) jsQR fallback on a downscaled centre crop
    if (!jsqrRef.current) return;
    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const scale = vw > MAX_SCAN_WIDTH ? MAX_SCAN_WIDTH / vw : 1;
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const res = jsqrRef.current(data.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (res?.data) void handleValue(res.data);
  }, [handleValue]);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    const video = videoRef.current as any;
    const step = () => { void decodeFrame().finally(() => loop()); };
    if (video?.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(() => step());
    } else {
      rafRef.current = window.setTimeout(step, 60) as unknown as number;
    }
  }, [decodeFrame]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);
    setStatus('Starting camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // Continuous autofocus where supported (keeps moving cards sharp)
      try {
        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() || {};
        const advanced: any = {};
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) advanced.focusMode = 'continuous';
        if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) advanced.exposureMode = 'continuous';
        if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] } as any);
      } catch { /* ignore */ }

      if ('BarcodeDetector' in window) {
        try { detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] }); } catch { detectorRef.current = null; }
      }
      if (!detectorRef.current && !jsqrRef.current) {
        const mod = await import('jsqr');
        jsqrRef.current = mod.default;
      }

      runningRef.current = true;
      setActive(true);
      setStatus('Point camera at the ID card QR');
      loop();
    } catch (e: any) {
      setError(e?.message || 'Camera unavailable');
      setStatus('Camera blocked');
    }
  }, [loop]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setActive(false);
    setStatus('Stopped');
    if (rafRef.current) { window.clearTimeout(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (autoStart) void start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] max-w-xl mx-auto">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[58%] aspect-square border-2 border-white/70 rounded-md" />
        </div>
        <div className="absolute top-2 left-2 text-[11px] text-white bg-black/60 px-2 py-1 rounded">
          {active ? 'Scanning' : 'Paused'}
        </div>
      </div>

      <div className="text-center text-sm text-foreground">{status}</div>
      {error && <div className="text-center text-xs text-destructive">{error}</div>}

      <div className="flex gap-2 justify-center">
        {active ? (
          <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm">
            <CameraOff className="w-4 h-4" /> Stop
          </button>
        ) : (
          <button onClick={() => void start()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            <Camera className="w-4 h-4" /> Start scanner
          </button>
        )}
        <button
          onClick={() => { seenRef.current.clear(); setScans([]); setStatus('Cleared'); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
      </div>

      {scans.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border max-w-xl mx-auto">
          {scans.map(s => (
            <div key={`${s.id}-${s.time}`} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <QrCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{s.name}</span>
              </span>
              <span className={s.status === 'late' ? 'text-amber-600 text-xs' : 'text-emerald-600 text-xs'}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiteQRScanner;
