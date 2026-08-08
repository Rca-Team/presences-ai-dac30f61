import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Scan, Sparkles, Activity, CheckCircle2, Lock, Cpu } from 'lucide-react';
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
  const [stepIndex, setStepIndex] = useState(0);

  const steps = [
    { label: 'Initializing Presence AI Engine', icon: Cpu, badge: 'CORE v4.2' },
    { label: 'Loading Facial Recognition Descriptors', icon: Scan, badge: 'BIOMETRICS' },
    { label: 'Calibrating Neural Vision Matrix', icon: Activity, badge: 'VISION AI' },
    { label: 'Verifying Security & Edge Gateways', icon: ShieldCheck, badge: 'ENCRYPTED' },
    { label: 'System Ready — Welcome to Presence', icon: CheckCircle2, badge: 'ONLINE' },
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
      }, 480);
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
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
          transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background select-none font-sans"
        >
          {/* Ambient Glowing Orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.18, 0.32, 0.18],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[120px]"
              style={{ background: 'hsl(var(--ios-blue) / 0.3)' }}
            />
            <motion.div
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.15, 0.28, 0.15],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-32 -left-32 w-[520px] h-[520px] rounded-full blur-[120px]"
              style={{ background: 'hsl(var(--ios-purple) / 0.25)' }}
            />
            <motion.div
              animate={{
                scale: [0.9, 1.15, 0.9],
                opacity: [0.12, 0.22, 0.12],
              }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px]"
              style={{ background: 'hsl(var(--ios-pink) / 0.18)' }}
            />
          </div>

          {/* Subtext Grid Pattern Overlay */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none dark:opacity-[0.07]"
            style={{
              backgroundImage: `
                linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
                linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
            }}
          />

          {/* Main Card Container */}
          <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center">

            {/* AI Facial Recognition Camera Iris Viewport */}
            <div className="relative flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56 mb-8">
              
              {/* Outer Rotating HUD Aperture Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-dashed border-primary/30"
              />

              {/* Inner Pulsing Vision Ring */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-3 rounded-full border border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.2)]"
              />

              {/* Vertical Facial Scanning Beam Line */}
              <motion.div
                animate={{ y: ['-70px', '70px', '-70px'] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-x-4 h-0.5 rounded-full z-20"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, hsl(var(--ios-blue)) 30%, hsl(var(--ios-purple)) 70%, transparent 100%)',
                  boxShadow: '0 0 15px hsl(var(--ios-blue)), 0 0 8px hsl(var(--ios-purple))',
                }}
              />

              {/* Biometric Target Corner Brackets */}
              <div className="absolute top-1 left-1 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl-md" />
              <div className="absolute top-1 right-1 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr-md" />
              <div className="absolute bottom-1 left-1 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl-md" />
              <div className="absolute bottom-1 right-1 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br-md" />

              {/* Center Glass Capsule with Brand Logo */}
              <motion.div
                animate={{
                  scale: [0.96, 1.04, 0.96],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-3xl border border-white/20 dark:border-white/10 bg-card/75 backdrop-blur-2xl flex items-center justify-center p-4 shadow-[0_20px_50px_-15px_hsl(var(--primary)/0.3)] z-10"
              >
                <Logo size="lg" className="[&>div>span:last-child]:text-foreground [&>div>span:last-child]:font-bold [&>div>span:last-child]:tracking-wide" />
              </motion.div>
            </div>

            {/* App Brand Header */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="space-y-2"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary shadow-sm">
                <currentStep.icon className="w-3.5 h-3.5 animate-pulse" />
                <span className="tracking-wide uppercase text-[10px]">{currentStep.badge}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                Presence
              </h1>

              <p className="text-xs sm:text-sm text-muted-foreground font-medium max-w-xs mx-auto">
                AI Facial Recognition & Attendance System
              </p>
            </motion.div>

            {/* Dynamic Status Progress Component */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-full mt-8 space-y-3"
            >
              {/* Progress Bar Container */}
              <div className="relative h-2 overflow-hidden rounded-full border border-border/60 bg-muted/50 p-0.5 shadow-inner">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, hsl(var(--ios-blue)) 0%, hsl(var(--ios-purple)) 50%, hsl(var(--ios-pink)) 100%)',
                    boxShadow: '0 0 12px hsl(var(--ios-blue) / 0.5)',
                  }}
                />
              </div>

              {/* Step Status Text & Percentage */}
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-1">
                <span className="truncate max-w-[260px] text-left text-foreground/90 font-semibold">
                  {currentStep.label}
                </span>
                <span className="tabular-nums font-bold text-primary">
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
