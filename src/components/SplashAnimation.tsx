import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Scan, Sparkles, Activity, CheckCircle2, Cpu, Zap, Radio } from 'lucide-react';
import Logo from '@/components/Logo';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

/**
 * Interactive 3D Canvas Particle Sphere for Splash Animation
 */
const Splash3DCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const count = 90;
    const radius = Math.min(w, h) * 0.28;
    const particles: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      particles.push({
        x: radius * Math.sin(theta) * Math.cos(phi),
        y: radius * Math.sin(theta) * Math.sin(phi),
        z: radius * Math.cos(theta),
      });
    }

    let rotY = 0;
    let rotX = 0;

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      rotY += 0.008;
      rotX += 0.003;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      const points: { px: number; py: number; alpha: number }[] = [];

      for (let i = 0; i < count; i++) {
        const p = particles[i];
        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.x * sinY + p.z * cosY;
        let y1 = p.y * cosX - z1 * sinX;
        let z2 = p.y * sinX + z1 * cosX;

        const fov = 350;
        const scale = fov / (fov + z2 + 250);
        const px = w / 2 + x1 * scale;
        const py = h / 2 + y1 * scale;
        const alpha = Math.max(0.15, Math.min(1, (z2 + radius) / (radius * 2)));

        points.push({ px, py, alpha });

        ctx.beginPath();
        ctx.arc(px, py, 2.2 * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${alpha * 0.85})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f0ff';
        ctx.fill();
      }

      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const p1 = points[i];
          const p2 = points[j];
          const dx = p1.px - p2.px;
          const dy = p1.py - p2.py;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 55) {
            const lineAlpha = (1 - dist / 55) * 0.28 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.strokeStyle = `rgba(168, 85, 247, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />;
};

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2600,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = [
    { label: 'Initializing 3D Spatial Neural Matrix', icon: Cpu, badge: 'SPATIAL v4.8' },
    { label: 'Loading Facial Recognition Descriptors', icon: Scan, badge: 'FACIAL ID' },
    { label: 'Calibrating 3D Vision Neural Net', icon: Activity, badge: 'NEURAL 3D' },
    { label: 'Verifying Security & Edge Gateways', icon: ShieldCheck, badge: 'SECURE' },
    { label: 'System 3D Online — Welcome to Presence', icon: CheckCircle2, badge: 'ONLINE' },
  ];

  useEffect(() => {
    const stepInterval = duration / 100;
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        const next = prev + 2;
        if (next < 25) setStepIndex(0);
        else if (next < 50) setStepIndex(1);
        else if (next < 75) setStepIndex(2);
        else if (next < 92) setStepIndex(3);
        else setStepIndex(4);
        return next;
      });
    }, stepInterval);

    const exitTimer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 500);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearInterval(progressTimer);
    };
  }, [duration, onComplete]);

  const currentStep = steps[stepIndex];

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(14px)' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#030712] select-none font-sans text-cyan-400"
        >
          {/* Interactive 3D WebGL Particle Canvas Background */}
          <Splash3DCanvas />

          {/* Radial 3D Glow Backlight */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <motion.div
              animate={{
                scale: [0.85, 1.2, 0.9],
                opacity: [0.25, 0.45, 0.25],
              }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-[550px] h-[550px] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.22)_0%,rgba(168,85,247,0.14)_45%,transparent_70%)] blur-3xl"
            />
          </div>

          {/* Holographic HUD Grid */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0, 240, 255, 0.15) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0, 240, 255, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '44px 44px',
            }}
          />

          {/* Main 3D HUD Interface Container */}
          <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center">

            {/* 3D Arc Reactor Camera Iris Viewport */}
            <div className="relative flex items-center justify-center w-52 h-52 sm:w-60 sm:h-60 mb-8">
              
              {/* Outer 3D Segmented HUD Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-500/40 shadow-[0_0_30px_rgba(0,240,255,0.2)]"
              />

              {/* Middle 3D Rotating Vision Ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-4 rounded-full border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              />

              {/* Vertical Laser Scanning Beam */}
              <motion.div
                animate={{ y: ['-80px', '80px', '-80px'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-x-4 h-0.5 rounded-full z-20"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, #00f0ff 30%, #a855f7 70%, transparent 100%)',
                  boxShadow: '0 0 20px #00f0ff, 0 0 10px #a855f7',
                }}
              />

              {/* Target Corner Reticles */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />

              {/* Center 3D Glass Capsule with Logo */}
              <motion.div
                animate={{
                  scale: [0.96, 1.05, 0.96],
                  boxShadow: [
                    '0 0 35px rgba(0,240,255,0.4), inset 0 0 20px rgba(0,240,255,0.6)',
                    '0 0 65px rgba(0,240,255,0.7), inset 0 0 35px rgba(0,240,255,0.9)',
                    '0 0 35px rgba(0,240,255,0.4), inset 0 0 20px rgba(0,240,255,0.6)',
                  ],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-3xl border-2 border-cyan-300/80 bg-[#030712]/85 backdrop-blur-2xl flex items-center justify-center p-4 z-10"
              >
                <Logo size="lg" className="[&>div>span:last-child]:text-cyan-200 [&>div>span:last-child]:font-bold [&>div>span:last-child]:tracking-widest drop-shadow-[0_0_15px_#00f0ff]" />
              </motion.div>
            </div>

            {/* 3D Spatial Brand Header */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="space-y-2"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-[11px] font-mono tracking-widest text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <currentStep.icon className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="uppercase">{currentStep.badge}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-purple-300 drop-shadow-[0_0_20px_rgba(0,240,255,0.5)]">
                PRESENCES AI
              </h1>

              <p className="text-xs sm:text-sm text-cyan-400/80 font-mono tracking-widest uppercase">
                3D SPATIAL BIOMETRIC ATTENDANCE OS
              </p>
            </motion.div>

            {/* 3D Progress Tube */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-full mt-8 space-y-3"
            >
              <div className="relative h-2 overflow-hidden rounded-full border border-cyan-500/50 bg-black/60 shadow-[0_0_15px_rgba(0,240,255,0.25)]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-purple-400 to-white shadow-[0_0_20px_#00f0ff]"
                  style={{ width: `${progress}%` }}
                />
                <motion.div
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-cyan-300/90 font-mono tracking-wider px-1">
                <span className="truncate max-w-[260px] text-left">
                  {currentStep.label}
                </span>
                <span className="font-bold text-cyan-300 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  {Math.round(progress)}%
                </span>
              </div>
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
