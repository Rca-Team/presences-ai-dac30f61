import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, ShieldCheck, Zap, Radio, Sparkles, Activity, Eye, Terminal } from 'lucide-react';
import Logo from '@/components/Logo';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2600,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [telemetryIndex, setTelemetryIndex] = useState(0);

  const telemetryLogs = [
    'INITIALIZING ARC CORE // STARK OS v4.8',
    'CALIBRATING NEURAL VISION & BIOMETRICS',
    'ENGAGING QUANTUM ENCRYPTION PROTOCOLS',
    'SYNCHRONIZING PRESENCES AI DATABASE',
    'WELCOME BACK, SIR. SYSTEM ONLINE.',
  ];

  useEffect(() => {
    const stepTime = duration / 100;
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        const next = prev + 2;
        if (next < 25) setTelemetryIndex(0);
        else if (next < 50) setTelemetryIndex(1);
        else if (next < 75) setTelemetryIndex(2);
        else if (next < 95) setTelemetryIndex(3);
        else setTelemetryIndex(4);
        return next;
      });
    }, stepTime);

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 500);
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.12, filter: 'blur(12px)' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] overflow-hidden bg-[#030712] font-mono text-cyan-400 select-none"
        >
          {/* JARVIS Background Grid & Hologram Glow */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0, 240, 255, 0.15) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0, 240, 255, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Radial Arc Reactor Backlight */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                scale: [0.8, 1.25, 0.95, 1.1, 1],
                opacity: [0.2, 0.45, 0.3, 0.5, 0.35],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(0,240,255,0.25)_0%,rgba(14,165,233,0.1)_45%,transparent_70%)] blur-3xl"
            />
          </div>

          {/* Holographic Scanline Overlay */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.1) 0px, transparent 2px, transparent 4px)',
            }}
          />

          {/* HUD Corner Brackets */}
          {/* Top-Left Corner */}
          <div className="absolute top-6 left-6 p-4 border-t-2 border-l-2 border-cyan-500/60 rounded-tl-lg flex flex-col gap-1 text-[10px] tracking-wider text-cyan-400/80">
            <div className="flex items-center gap-2 font-bold text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span>J.A.R.V.I.S // PRESENCES OS</span>
            </div>
            <span>LOC_REF: 0x7E9A_STARK</span>
            <span>SYS_TEMP: 36.8°C // NOMINAL</span>
          </div>

          {/* Top-Right Corner */}
          <div className="absolute top-6 right-6 p-4 border-t-2 border-r-2 border-cyan-500/60 rounded-tr-lg flex flex-col items-end gap-1 text-[10px] tracking-wider text-cyan-400/80">
            <div className="flex items-center gap-2 font-bold text-cyan-300">
              <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span>MARK-85 HUD CORE</span>
            </div>
            <span>BIOMETRICS: ACTIVE</span>
            <span>ENCRYPTION: AES-256</span>
          </div>

          {/* Bottom-Left Corner */}
          <div className="absolute bottom-6 left-6 p-4 border-b-2 border-l-2 border-cyan-500/60 rounded-bl-lg flex flex-col gap-1 text-[10px] tracking-wider text-cyan-400/80">
            <div className="flex items-center gap-2 font-semibold text-cyan-300">
              <Terminal className="w-3.5 h-3.5" />
              <span>SYSTEM DIAGNOSTICS</span>
            </div>
            <span className="text-cyan-400/90">{telemetryLogs[telemetryIndex]}</span>
          </div>

          {/* Bottom-Right Corner - Frequency Waveform Bars */}
          <div className="absolute bottom-6 right-6 p-4 border-b-2 border-r-2 border-cyan-500/60 rounded-br-lg flex flex-col items-end gap-2 text-[10px] tracking-wider text-cyan-400/80">
            <div className="flex items-end gap-1 h-6">
              {[40, 75, 30, 90, 60, 100, 45, 80, 50, 95].map((h, idx) => (
                <motion.div
                  key={idx}
                  className="w-1 bg-cyan-400/80 rounded-t"
                  animate={{ height: [`${h * 0.3}%`, `${h}%`, `${h * 0.5}%`] }}
                  transition={{ duration: 0.8 + (idx % 3) * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <span>FREQUENCY: 432.8 MHz</span>
          </div>

          {/* Floating HUD Energy Particles */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-cyan-300 shadow-[0_0_12px_#00f0ff]"
              style={{
                width: i % 2 === 0 ? 4 : 2,
                height: i % 2 === 0 ? 4 : 2,
                left: `${15 + (i * 7) % 70}%`,
                top: `${20 + (i * 11) % 60}%`,
              }}
              animate={{
                y: [-20, -120],
                opacity: [0, 0.9, 0],
                scale: [0.8, 1.5, 0.5],
              }}
              transition={{
                duration: 2 + (i % 4) * 0.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Center Arc Reactor & JARVIS Core */}
          <div className="relative h-full w-full flex flex-col items-center justify-center">
            
            {/* ARC REACTOR HUD RINGS CONTAINER */}
            <div className="relative flex items-center justify-center w-72 h-72 sm:w-96 sm:h-96">
              
              {/* Ring 1: Outer Segmented HUD Ring (Clockwise) */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-500/40 shadow-[0_0_30px_rgba(0,240,255,0.15)]"
              />

              {/* Ring 2: Arc Reactor Notch Ring (Counter-Clockwise) */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-4 rounded-full border border-cyan-400/60"
                style={{
                  boxShadow: '0 0 25px rgba(0, 240, 255, 0.3)',
                  backgroundImage: 'radial-gradient(circle, transparent 60%, rgba(0,240,255,0.08) 100%)',
                }}
              >
                {/* Arc Notches */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <div
                    key={deg}
                    className="absolute w-2 h-4 bg-cyan-400/80 rounded-sm left-1/2 top-0 -translate-x-1/2 shadow-[0_0_8px_#00f0ff]"
                    style={{ transformOrigin: '0 160px', transform: `rotate(${deg}deg)` }}
                  />
                ))}
              </motion.div>

              {/* Ring 3: Inner Target Reticle (Clockwise Fast) */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-12 rounded-full border-2 border-cyan-300/80 border-t-transparent border-b-transparent shadow-[0_0_20px_rgba(0,240,255,0.5)]"
              />

              {/* Center Arc Glow Core */}
              <motion.div
                animate={{
                  scale: [0.95, 1.1, 0.95],
                  boxShadow: [
                    '0 0 40px rgba(0, 240, 255, 0.6), inset 0 0 30px rgba(0, 240, 255, 0.8)',
                    '0 0 80px rgba(0, 240, 255, 0.9), inset 0 0 50px rgba(0, 240, 255, 1)',
                    '0 0 40px rgba(0, 240, 255, 0.6), inset 0 0 30px rgba(0, 240, 255, 0.8)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-cyan-200 bg-[#030712]/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-10"
              >
                {/* Brand Logo inside Reactor Core */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6 }}
                  className="flex flex-col items-center justify-center"
                >
                  <Logo size="md" className="[&>div>span:last-child]:text-cyan-200 [&>div>span:last-child]:tracking-widest drop-shadow-[0_0_15px_#00f0ff]" />
                </motion.div>
              </motion.div>

              {/* Holographic Target Brackets framing center */}
              <div className="absolute -top-3 -left-3 w-8 h-8 border-t-2 border-l-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -top-3 -right-3 w-8 h-8 border-t-2 border-r-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -bottom-3 -left-3 w-8 h-8 border-b-2 border-l-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
              <div className="absolute -bottom-3 -right-3 w-8 h-8 border-b-2 border-r-2 border-cyan-300 shadow-[0_0_10px_#00f0ff]" />
            </div>

            {/* STARK TECH TITLE & SYSTEM STATUS */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-8 text-center px-4 max-w-lg"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-[11px] tracking-[0.25em] text-cyan-300 mb-2 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>NEURAL ENGINE ACTIVE</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-cyan-400 tracking-wider drop-shadow-[0_0_20px_rgba(0,240,255,0.5)]">
                PRESENCES AI
              </h1>
              <p className="text-xs text-cyan-400/75 tracking-[0.2em] uppercase mt-1">
                STARK INTELLIGENT AUTOMATION ARCHITECTURE
              </p>

              {/* Progress HUD Bar */}
              <div className="mt-6 w-72 sm:w-96 mx-auto">
                <div className="relative h-2 overflow-hidden rounded-full border border-cyan-500/50 bg-black/60 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 via-cyan-300 to-white shadow-[0_0_20px_#00f0ff]"
                    style={{ width: `${progress}%` }}
                  />
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-cyan-400/90 tracking-widest">
                  <span className="flex items-center gap-1 font-bold text-cyan-300">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    <span>{Math.round(progress)}%</span>
                  </span>
                  <span className="uppercase text-cyan-400/70">
                    {progress === 100 ? 'ONLINE' : 'CHARGING CORE'}
                  </span>
                </div>
              </div>
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
