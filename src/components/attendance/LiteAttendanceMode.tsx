import React from 'react';
import QRCodeScanner from './QRCodeScanner';
import { Zap, WifiOff } from 'lucide-react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

/**
 * LiteAttendanceMode
 * ------------------
 * A minimal, low-graphics attendance surface for slow networks / weak devices.
 * - No blur, no animations, no live sidebar, no heavy face-recognition models.
 * - QR-first (works offline against locally cached students, tiny CPU cost).
 * - Non-stop kiosk feel: scanner autostart, one-tap retake.
 */
const LiteAttendanceMode: React.FC = () => {
  const { signals, preference, setPreference } = usePerformanceMode();

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-semibold text-foreground">Lite Mode active</div>
          <div className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
            {signals.slowNetwork && (
              <span className="inline-flex items-center gap-1"><WifiOff className="w-3 h-3" />Slow network ({signals.effectiveType})</span>
            )}
            {signals.saveData && <span>· Data-saver on</span>}
            {signals.lowMemory && <span>· Low memory</span>}
            {signals.lowCPU && <span>· Limited CPU</span>}
            {!signals.slowNetwork && !signals.saveData && !signals.lowMemory && !signals.lowCPU && (
              <span>Optimized for smooth, non-stop attendance.</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setPreference(preference === 'on' ? 'auto' : 'off')}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          Turn off
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-semibold text-foreground">QR Attendance</div>
          <div className="text-xs text-muted-foreground">Fastest &amp; lightest — point camera at ID card</div>
        </div>
        <div className="p-2 sm:p-4">
          <QRCodeScanner autoStart hideManualControls={false} />
        </div>
      </div>
    </div>
  );
};

export default LiteAttendanceMode;
