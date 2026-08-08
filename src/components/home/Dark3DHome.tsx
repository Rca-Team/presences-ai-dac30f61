import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import HomeInstallCard from '@/components/HomeInstallCard';
import teamRcaPhoto from '@/assets/team-rca.jpg.asset.json';
import gauravPhoto from '@/assets/gaurav-photo.png';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { PublicPortfolioView } from '@/pages/Portfolio';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowRight,
  Scan,
  BookOpen,
  Shield,
  Bell,
  BarChart3,
  Bus,
  Sparkles,
  Zap,
  Brain,
  Smartphone,
  Users,
  Camera,
  Clock,
  DoorOpen,
  Fingerprint,
  Activity,
  ShieldCheck,
  Cpu,
  Layers,
  Lock,
} from 'lucide-react';

/**
 * Interactive 3D Canvas Particle Sphere & Neural Network Renderer (Optimized for 60FPS)
 */
const Interactive3DCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 500);

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 35 : 60;
    const particles: { x: number; y: number; z: number; ox: number; oy: number; oz: number }[] = [];
    const radius = Math.min(width, height) * 0.35;

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = Math.random() * Math.PI * 2;
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(theta);
      particles.push({ x, y, z, ox: x, oy: y, oz: z });
    }

    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;
    let rotX = 0;
    let rotY = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || 500;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left - width / 2) * 0.0006;
      mouseY = (e.clientY - rect.top - height / 2) * 0.0006;
    };

    // Pause rendering when canvas is out of viewport
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) render();
    }, { threshold: 0.1 });
    observer.observe(canvas);

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    let lastTime = performance.now();

    const render = () => {
      if (!isVisible || document.hidden) return;

      const now = performance.now();
      const delta = Math.min(32, now - lastTime);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      targetRotY += 0.004 + mouseX * (delta / 16);
      targetRotX += mouseY * (delta / 16);
      rotX += (targetRotX - rotX) * 0.05;
      rotY += (targetRotY - rotY) * 0.05;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const projectedPoints: { px: number; py: number; scale: number; alpha: number }[] = [];

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        let x1 = p.ox * cosY - p.oz * sinY;
        let z1 = p.ox * sinY + p.oz * cosY;
        let y1 = p.oy * cosX - z1 * sinX;
        let z2 = p.oy * sinX + z1 * cosX;

        const fov = 380;
        const scale = fov / (fov + z2 + 280);
        const px = width / 2 + x1 * scale;
        const py = height / 2 + y1 * scale;
        const alpha = Math.max(0.12, Math.min(0.9, (z2 + radius) / (radius * 2)));

        projectedPoints.push({ px, py, scale, alpha });

        ctx.beginPath();
        ctx.arc(px, py, 2 * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${alpha * 0.8})`;
        ctx.fill();
      }

      // Fast connection distance checks
      ctx.lineWidth = 0.75;
      for (let i = 0; i < particleCount; i++) {
        const p1 = projectedPoints[i];
        for (let j = i + 1; j < particleCount; j++) {
          const p2 = projectedPoints[j];
          const dx = p1.px - p2.px;
          const dy = p1.py - p2.py;
          const distSq = dx * dx + dy * dy;

          if (distSq < 3000) { // 54.7px cutoff squared
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / 55) * 0.3 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            ctx.strokeStyle = `rgba(168, 85, 247, ${lineAlpha})`;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />;
};

/**
 * 3D Interactive Card Component with Real-Time Motion Tilt
 */
interface Spatial3DCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const Interactive3DCard: React.FC<Spatial3DCardProps> = ({ children, className = '', onClick }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [12, -12]), { stiffness: 400, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-12, 12]), { stiffness: 400, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative cursor-pointer transition-shadow duration-300 ${className}`}
    >
      <div style={{ transform: 'translateZ(20px)' }}>{children}</div>
    </motion.div>
  );
};

export const Dark3DHome: React.FC = () => {
  const navigate = useNavigate();
  const { portfolio, creatorMembers } = usePortfolioData();
  const [activeProfile, setActiveProfile] = useState<null | {
    name: string;
    role: string;
    image?: string;
    bio: string;
    details?: string;
  }>(null);

  const modules = [
    { icon: Scan, label: 'Attendance', tone: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40', to: '/attendance' },
    { icon: BookOpen, label: 'Timetable', tone: 'bg-purple-500/20 text-purple-400 border-purple-500/40', to: '/admin?tab=timetable' },
    { icon: Shield, label: 'Security', tone: 'bg-amber-500/20 text-amber-400 border-amber-500/40', to: '/gate' },
    { icon: Bell, label: 'Alerts', tone: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', to: '/admin?tab=emergency' },
    { icon: BarChart3, label: 'Analytics', tone: 'bg-blue-500/20 text-blue-400 border-blue-500/40', to: '/admin?tab=reports' },
    { icon: Bus, label: 'Transport', tone: 'bg-pink-500/20 text-pink-400 border-pink-500/40', to: '/features' },
  ];

  const stats = [
    { value: '99.8%', label: 'AI Accuracy Rating', glow: 'from-cyan-500 to-blue-600' },
    { value: '<1s', label: 'Face Ingest Speed', glow: 'from-purple-500 to-pink-600' },
    { value: '1000+', label: 'Concurrent Users', glow: 'from-emerald-500 to-teal-600' },
    { value: '24/7', label: 'Surveillance Gate', glow: 'from-amber-500 to-orange-600' },
  ];

  const featureCategories = [
    {
      category: '3D Neural Biometric Engine',
      icon: Scan,
      gradient: 'from-cyan-500 to-purple-600',
      features: [
        { icon: Camera, title: 'Real-Time Face ID', desc: 'Sub-millisecond facial feature descriptor extraction.' },
        { icon: Users, title: 'Multi-Subject Ingest', desc: 'Batch recognition of multiple students in live entryway flow.' },
        { icon: DoorOpen, title: 'Gate Vision Mode', desc: 'Surveillance kiosk feed with stranger detection alerts.' },
        { icon: Clock, title: 'Automated Cutoffs', desc: 'Instant absence notifications sent upon daily cutoff.' },
      ],
    },
    {
      category: 'Timetable & Staff Management',
      icon: BookOpen,
      gradient: 'from-purple-500 to-pink-600',
      features: [
        { icon: Brain, title: 'AI OCR Timetable', desc: 'Auto-extract timetable photos directly into database schedules.' },
        { icon: Users, title: 'Substitute Dispatch', desc: 'Automated alert routing for absent teacher substitution.' },
        { icon: Smartphone, title: 'Parent Portal', desc: 'Real-time arrival & departure updates sent directly to parents.' },
        { icon: Shield, title: 'Enterprise RLS', desc: 'Row-level security protecting student biometrics and records.' },
      ],
    },
  ];

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-[#030712] text-foreground overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
        
        {/* Ambient 3D Neon Backlight Gradients */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-cyan-600/20 blur-[140px]" />
          <div className="absolute top-1/3 -right-32 h-[550px] w-[550px] rounded-full bg-purple-600/20 blur-[150px]" />
          <div className="absolute -bottom-32 left-1/3 h-[600px] w-[600px] rounded-full bg-pink-600/15 blur-[160px]" />
        </div>

        {/* 3D Hero Section */}
        <section className="relative pt-6 pb-12 sm:pb-16 min-h-[85vh] flex items-center">
          
          {/* Interactive 3D Canvas Mesh Background */}
          <Interactive3DCanvas />

          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-12 gap-6 items-center">
              
              {/* Left Column: 3D Hero Text & CTA */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="col-span-12 lg:col-span-7 space-y-6"
              >
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 backdrop-blur-xl text-xs font-mono tracking-widest text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
                  <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>3D NEURAL SCHOOL OS v4.8</span>
                </div>

                <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold leading-[1.05] tracking-tight font-sans">
                  Your School,
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-400 drop-shadow-[0_0_35px_rgba(0,240,255,0.4)]">
                    3D Automated
                  </span>
                </h1>

                <p className="text-base sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
                  Real-time facial recognition attendance, gate surveillance, timetable AI & analytics in an immersive 3D spatial interface.
                </p>

                <div className="flex flex-wrap gap-4 pt-2">
                  <Link to="/signup">
                    <Button className="h-14 px-8 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-bold text-base shadow-[0_10px_30px_rgba(0,240,255,0.35)] hover:shadow-[0_15px_40px_rgba(0,240,255,0.5)] transition-all">
                      Get Started Free <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </Link>

                  <Link to="/parent">
                    <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/20 bg-card/60 backdrop-blur-xl text-base font-bold hover:bg-card/80">
                      Parent Portal
                    </Button>
                  </Link>

                  <ThemeToggle className="h-14 w-14 rounded-2xl border-white/20 bg-card/60 backdrop-blur-xl hover:bg-card/80" />
                </div>
              </motion.div>

              {/* Right Column: 3D Holographic Core Orb */}
              <div className="col-span-12 lg:col-span-5 relative flex justify-center">
                <Interactive3DCard className="w-full max-w-md">
                  <div className="relative rounded-3xl border border-cyan-500/30 bg-card/50 backdrop-blur-2xl p-6 shadow-[0_28px_80px_-24px_rgba(0,240,255,0.3)] overflow-hidden">
                    <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-cyan-400/90 mb-4">
                      NEURAL CORE 3D VISUALIZER
                    </p>

                    {/* Concentric Rotating 3D Rings */}
                    <div className="relative mx-auto flex h-60 w-60 items-center justify-center">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/40"
                      />
                      <motion.span
                        animate={{ rotate: -360 }}
                        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-4 rounded-full border border-purple-500/50"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.05, 1], rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                        className="relative h-36 w-36 rounded-full"
                        style={{
                          background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #00f0ff 30%, #a855f7 70%, #030712 100%)',
                          boxShadow: '0 0 60px rgba(0,240,255,0.6), inset 0 0 30px rgba(255,255,255,0.8)',
                        }}
                      />
                    </div>

                    {/* Floating 3D Telemetry Badges */}
                    <div className="mt-6 grid grid-cols-3 gap-2">
                      {[
                        { v: '99.8%', l: 'Accuracy' },
                        { v: '120ms', l: 'Latency' },
                        { v: '24/7', l: 'Live Gate' },
                      ].map((s) => (
                        <div key={s.l} className="rounded-2xl border border-cyan-500/20 bg-background/50 p-2.5 text-center">
                          <p className="text-sm font-bold text-cyan-400 font-mono">{s.v}</p>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Interactive3DCard>
              </div>

            </div>
          </div>
        </section>

        {/* 3D System Modules Grid */}
        <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-cyan-400 uppercase tracking-widest">SPATIAL SYSTEM MODULES</p>
              <h2 className="text-3xl font-extrabold tracking-tight">Interactive Modules</h2>
            </div>
            <div className="flex gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
              <span className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {modules.map((mod) => (
              <Interactive3DCard key={mod.label} onClick={() => navigate(mod.to)}>
                <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-4 text-center hover:border-cyan-500/50 transition-colors">
                  <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border ${mod.tone}`}>
                    <mod.icon className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground">{mod.label}</p>
                </div>
              </Interactive3DCard>
            ))}
          </div>
        </section>

        {/* 3D Metric Stats Bar */}
        <section className="py-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat) => (
              <Interactive3DCard key={stat.label}>
                <div className="rounded-2xl border border-white/10 bg-card/50 backdrop-blur-xl p-6 text-center shadow-lg">
                  <p className={`text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r ${stat.glow} font-mono`}>
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                </div>
              </Interactive3DCard>
            ))}
          </div>
        </section>

        {/* 3D Feature Categories */}
        {featureCategories.map((cat) => (
          <section key={cat.category} className="py-8 max-w-7xl mx-auto px-4 sm:px-6">
            <div className="mb-6 flex items-center gap-3">
              <div className={`p-3 rounded-2xl bg-gradient-to-r ${cat.gradient} text-white shadow-lg`}>
                <cat.icon className="w-6 h-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{cat.category}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {cat.features.map((feature) => (
                <Interactive3DCard key={feature.title}>
                  <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl p-5 h-full relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${cat.gradient}`} />
                    <div className="mb-4 inline-flex p-3 rounded-2xl bg-white/5 border border-white/10 text-cyan-400">
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{feature.desc}</p>
                  </div>
                </Interactive3DCard>
              ))}
            </div>
          </section>
        ))}

        <HomeInstallCard />

        {/* Developer Portfolio 3D Section */}
        <section id="developer-portfolio" className="py-12 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs text-cyan-400 uppercase tracking-widest">MEET THE ARCHITECTS</p>
              <h2 className="text-3xl font-extrabold">{portfolio.name || 'Gaurav Raj'}</h2>
            </div>
          </div>
          <PublicPortfolioView data={portfolio} onUnlock={() => navigate('/portfolio')} />
        </section>

        {/* Dialog for Profile Details */}
        <Dialog open={Boolean(activeProfile)} onOpenChange={(open) => !open && setActiveProfile(null)}>
          <DialogContent className="max-w-md rounded-2xl border-white/20 bg-card/95 p-0 backdrop-blur-2xl text-foreground">
            {activeProfile && (
              <div className="p-6">
                <DialogHeader className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={activeProfile.name}
                      image={activeProfile.image}
                      className="h-16 w-16 rounded-xl border border-white/20"
                      fallbackClassName="text-lg"
                    />
                    <div>
                      <DialogTitle className="text-xl">{activeProfile.name}</DialogTitle>
                      <p className="text-sm text-muted-foreground">{activeProfile.role}</p>
                    </div>
                  </div>
                  <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                    {activeProfile.bio}
                  </DialogDescription>
                </DialogHeader>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </PageLayout>
    </PageTransition>
  );
};

export default Dark3DHome;
