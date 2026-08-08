import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import HomeInstallCard from '@/components/HomeInstallCard';
import HeroScene from './HeroScene';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { PublicPortfolioView } from '@/pages/Portfolio';
import { MemberAvatar } from '@/components/portfolio/MemberAvatar';
import gauravPhoto from '@/assets/gaurav-photo.png';
import swamiAnantVyasPhoto from '@/assets/swami-anant-vyas.png.asset.json';
import teamRcaPhoto from '@/assets/team-rca.jpg.asset.json';
import {
  ArrowRight, Scan, BookOpen, Shield, Bell, BarChart3, Bus,
  Sparkles, Zap, Brain, Smartphone, Users, Camera, Clock,
  DoorOpen, CalendarDays, UserCheck, ClipboardList, GraduationCap,
  Layers, Fingerprint, Award, Heart, AlertTriangle, MapPin,
  Lock, MessageSquare, Globe, FileText, Building2,
} from 'lucide-react';

/* ─── data arrays (mirroring original Index.tsx) ────────────────── */

const modules = [
  { icon: Scan, label: 'Attendance', tone: 'bg-blue-500/15 text-blue-400', to: '/attendance' },
  { icon: BookOpen, label: 'Timetable', tone: 'bg-purple-500/15 text-purple-400', to: '/admin?tab=timetable' },
  { icon: Shield, label: 'Security', tone: 'bg-amber-500/15 text-amber-400', to: '/gate' },
  { icon: Bell, label: 'Alerts', tone: 'bg-green-500/15 text-green-400', to: '/admin?tab=emergency' },
  { icon: BarChart3, label: 'Analytics', tone: 'bg-cyan-500/15 text-cyan-400', to: '/admin?tab=reports' },
  { icon: Bus, label: 'Transport', tone: 'bg-pink-500/15 text-pink-400', to: '/features' },
];

const stats = [
  { value: '99.8%', label: 'Attendance accuracy' },
  { value: '<1s', label: 'Face scan speed' },
  { value: '1000+', label: 'Bulk registrations' },
  { value: '24/7', label: 'Campus monitoring' },
];

const featureCategories = [
  {
    category: 'AI-Powered Attendance', icon: Scan,
    features: [
      { icon: Camera, title: 'Face Recognition', desc: 'Millisecond facial detection with high precision.' },
      { icon: Users, title: 'Multi-Face Scanning', desc: 'Recognize multiple students at once in live gate flow.' },
      { icon: DoorOpen, title: 'Gate Mode', desc: 'Kiosk-ready scanning with stranger detection.' },
      { icon: Clock, title: 'Auto Cutoff Alerts', desc: 'Absence notifications sent after daily cutoff.' },
    ],
  },
  {
    category: 'Timetable & Teachers', icon: BookOpen,
    features: [
      { icon: CalendarDays, title: 'Smart Timetable', desc: 'Structured timetable management for all classes.' },
      { icon: UserCheck, title: 'Auto Substitution', desc: 'Automatic replacement when a teacher is absent.' },
      { icon: ClipboardList, title: 'Teacher Permissions', desc: 'Granular class-section access controls.' },
      { icon: FileText, title: 'Substitution Reports', desc: 'Printable and shareable daily reports.' },
    ],
  },
  {
    category: 'Student Management', icon: GraduationCap,
    features: [
      { icon: Layers, title: 'Class Structure', desc: 'Organize students by classes and sections.' },
      { icon: Fingerprint, title: 'Bulk Registration', desc: 'Import and register students at scale.' },
      { icon: Award, title: 'Gamification', desc: 'Badges, points, and class leaderboards.' },
      { icon: Heart, title: 'Wellness Scores', desc: 'Track punctuality and behavioral trends.' },
    ],
  },
  {
    category: 'Safety & Security', icon: Shield,
    features: [
      { icon: AlertTriangle, title: 'Emergency Alerts', desc: 'Instant lockdown and fire alerts.' },
      { icon: UserCheck, title: 'Visitor Management', desc: 'Visitor face verification and QR pass flow.' },
      { icon: MapPin, title: 'Zone Monitoring', desc: 'Track restricted areas with alerts.' },
      { icon: Lock, title: 'Stranger Detection', desc: 'Unknown face detection at entry points.' },
    ],
  },
  {
    category: 'Parent & Communication', icon: MessageSquare,
    features: [
      { icon: Bell, title: 'Smart Notifications', desc: 'Targeted alerts through preferred channels.' },
      { icon: Globe, title: 'Parent Portal', desc: 'Attendance, circulars, and performance access.' },
      { icon: FileText, title: 'Digital Circulars', desc: 'Broadcast updates with acknowledgement trail.' },
      { icon: Bus, title: 'Bus Tracking', desc: 'Boarding and route notifications to guardians.' },
    ],
  },
  {
    category: 'Analytics & Reports', icon: BarChart3,
    features: [
      { icon: Brain, title: 'AI Insights', desc: 'Predictive analysis for attendance risk.' },
      { icon: BarChart3, title: 'Advanced Reports', desc: 'Class-level and student-level reporting.' },
      { icon: Building2, title: 'Principal Dashboard', desc: 'Real-time school-wide command center.' },
      { icon: CalendarDays, title: 'Holiday Calendar', desc: 'Academic calendar with schedule context.' },
    ],
  },
];

/* ─── animation helpers ────────────────── */

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
});

const fadeInView = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
});

/* ─── component ────────────────── */

const DarkModeHome3D: React.FC = () => {
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolioData();

  const [activeProfile, setActiveProfile] = useState<null | {
    name: string;
    role: string;
    image?: string;
    bio: string;
    details?: string;
  }>(null);

  const fallbackImages: Record<string, string> = {
    Gaurav: gauravPhoto,
    'Gaurav Raj': gauravPhoto,
    'Swami Anant Vyas': swamiAnantVyasPhoto.url,
  };

  const creatorMembers = useMemo(
    () =>
      (portfolio.members.length > 0 ? portfolio.members : []).map((m) => ({
        name: m.name,
        role: m.role,
        image: m.image || fallbackImages[m.name] || '',
        bio: m.bio,
        details: m.details,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio.members],
  );

  return (
    <PageTransition>
      <PageLayout className="overflow-hidden has-bottom-nav md:pb-0">

        {/* ──────── HERO ──────── */}
        <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden -mx-4 md:-mx-6 lg:-mx-8">
          {/* 3-D canvas background */}
          <HeroScene className="absolute inset-0 z-0" />

          {/* radial vignette on top of canvas */}
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_35%,#080818_80%)]" />

          <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-5xl mx-auto">
            {/* badge */}
            <motion.div {...fadeUp(0)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 backdrop-blur-xl mb-8"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-100/80">Neural Recognition Engine</span>
            </motion.div>

            {/* title */}
            <motion.h1 {...fadeUp(0.1)}
              className="text-5xl sm:text-6xl md:text-8xl font-extrabold leading-[1.05] mb-6"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              Your School,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400">
                Fully Automated
              </span>
            </motion.h1>

            {/* subtitle */}
            <motion.p {...fadeUp(0.2)}
              className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mb-10 leading-relaxed"
            >
              Face-recognition attendance, timetable, gate security, parent portal & AI analytics — one platform.
            </motion.p>

            {/* CTAs */}
            <motion.div {...fadeUp(0.3)} className="flex flex-wrap items-center justify-center gap-4 mb-12">
              <Link to="/signup">
                <Button className="h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 px-8 text-base font-bold text-white border-0 shadow-[0_0_28px_rgba(56,189,248,0.25)]">
                  Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/parent">
                <Button variant="outline" className="h-14 rounded-2xl border-white/10 bg-white/[0.04] backdrop-blur-xl px-8 text-base font-bold text-white hover:bg-white/[0.08]">
                  Parent Portal
                </Button>
              </Link>
              <ThemeToggle className="h-14 w-14 rounded-2xl border-white/10 bg-white/[0.04] backdrop-blur-xl hover:bg-white/[0.08]" />
            </motion.div>

            {/* stat pills */}
            <motion.div {...fadeUp(0.5)} className="flex flex-wrap justify-center gap-3">
              {[
                { icon: Zap, text: '<1s Recognition', c: 'text-amber-400' },
                { icon: Brain, text: '99.8% Accuracy', c: 'text-purple-400' },
                { icon: Shield, text: 'AES-256 Secure', c: 'text-emerald-400' },
              ].map((p) => (
                <div key={p.text} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-white/70 backdrop-blur-xl">
                  <p.icon className={`h-3 w-3 ${p.c}`} /> {p.text}
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ──────── MODULES ──────── */}
        <section className="py-20 sm:py-24">
          <motion.div {...fadeInView()} className="flex items-center justify-center gap-3 mb-10">
            <div className="rounded-2xl bg-blue-500/15 p-3"><Layers className="h-5 w-5 text-blue-400" /></div>
            <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>System Modules</h2>
          </motion.div>

          <div className="grid grid-cols-3 gap-3 sm:gap-5 md:grid-cols-6">
            {modules.map((mod, i) => (
              <motion.button
                key={mod.label}
                type="button"
                onClick={() => navigate(mod.to)}
                aria-label={`Open ${mod.label}`}
                {...fadeInView(i * 0.06)}
                whileHover={{ y: -5 }}
                whileTap={{ scale: 0.97 }}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-4 sm:p-6 text-center transition-colors hover:border-blue-500/40 hover:bg-white/[0.06] group"
              >
                <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${mod.tone} transition-transform group-hover:scale-110`}>
                  <mod.icon className="h-5 w-5" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-tight text-white/60 group-hover:text-white/90">{mod.label}</p>
              </motion.button>
            ))}
          </div>

          <motion.div {...fadeInView(0.3)} className="mt-10 flex justify-center">
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 tracking-wider">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              ALL SYSTEMS OPERATIONAL
            </div>
          </motion.div>
        </section>

        {/* ──────── STATS ──────── */}
        <section className="pb-20">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {stats.map((s, i) => (
              <motion.div key={s.label} {...fadeInView(i * 0.08)}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 sm:p-8 text-center"
              >
                <p className="text-3xl sm:text-5xl font-black bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent" style={{ fontFamily: 'Sora, sans-serif' }}>{s.value}</p>
                <p className="mt-2 text-xs sm:text-sm font-medium text-white/50">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ──────── FEATURE CATEGORIES ──────── */}
        {featureCategories.map((cat) => (
          <section key={cat.category} className="pb-20">
            <motion.div {...fadeInView()} className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 border border-white/10 p-3">
                <cat.icon className="h-5 w-5 text-blue-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>{cat.category}</h2>
            </motion.div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
              {cat.features.map((f, i) => (
                <motion.div key={f.title} {...fadeInView(i * 0.06)}
                  whileHover={{ y: -4 }}
                  className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 group"
                >
                  <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-blue-500/60 via-cyan-400/40 to-purple-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="mb-3 inline-flex rounded-xl bg-blue-500/10 p-2.5 text-blue-400 group-hover:text-cyan-400 transition-colors">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/40">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {/* ──────── INSTALL ──────── */}
        <HomeInstallCard />

        {/* ──────── DEVELOPER PORTFOLIO ──────── */}
        <section id="developer-portfolio" className="py-16 min-w-0">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400">
                <Sparkles className="h-3 w-3" /> Meet the Developer
              </p>
              <h2 className="mt-2 text-3xl font-black text-foreground md:text-4xl" style={{ fontFamily: 'Sora, sans-serif' }}>
                {portfolio.name || 'Gaurav Raj'}
              </h2>
              <p className="mt-1 text-sm text-white/50 md:text-base">
                {portfolio.role || 'Developer & Team Leader'}
              </p>
            </div>
          </div>
          <PublicPortfolioView data={portfolio} onUnlock={() => navigate('/portfolio')} />
        </section>

        {/* ──────── TEAM RCA CARD ──────── */}
        <section className="pb-16">
          <motion.div {...fadeInView()}
            className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]"
          >
            {/* team photo */}
            <button
              type="button"
              onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
              className="relative block w-full text-left"
              aria-label="Open Team RCA portfolio"
            >
              <div className="relative aspect-[21/9] w-full overflow-hidden">
                <img
                  src={teamRcaPhoto.url}
                  alt="Team RCA — Presences AI creators"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%)]" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#080818] via-[#080818]/60 to-transparent" />

                <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-cyan-300/30 bg-black/50 px-3 py-1.5 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">Team RCA</span>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-200/80">Presences · AI</p>
                  <p className="mt-1 bg-gradient-to-r from-cyan-200 via-blue-300 to-purple-400 bg-clip-text text-3xl font-black leading-none text-transparent" style={{ fontFamily: 'Sora, sans-serif' }}>
                    Built by Team RCA
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                    Together in mind · United in purpose
                  </p>
                </div>
              </div>
            </button>

            {/* members strip */}
            <div className="space-y-2 bg-white/[0.02] p-4 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => creatorMembers[0] && setActiveProfile(creatorMembers[0])}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent px-3 py-2.5 text-left transition-colors hover:border-cyan-400/50"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={portfolio.profileImage || creatorMembers[0]?.image || gauravPhoto}
                    alt={creatorMembers[0]?.name || 'Gaurav'}
                    className="h-9 w-9 rounded-full border border-cyan-400/30 object-cover"
                    loading="lazy"
                  />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-400/80">Lead · Creator</p>
                    <p className="text-sm font-bold text-foreground">{creatorMembers[0]?.name || 'Gaurav'}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-cyan-400/60" />
              </button>

              {creatorMembers.slice(1).map((member) => (
                <button
                  key={member.name}
                  type="button"
                  onClick={() => setActiveProfile(member)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-cyan-400/30"
                  aria-label={`Open ${member.name} profile`}
                >
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={member.name}
                      image={member.image}
                      className="h-8 w-8 rounded-full border border-white/10"
                      fallbackClassName="text-[10px]"
                    />
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Team Member</p>
                      <p className="text-sm font-semibold text-foreground">{member.name}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/30" />
                </button>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ──────── CTA FOOTER ──────── */}
        <section className="pb-10">
          <motion.div {...fadeInView()}
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-blue-600/15 via-purple-600/8 to-cyan-600/15 p-8 sm:p-14 backdrop-blur-xl"
          >
            <div className="relative z-10 text-center">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
                <Smartphone className="h-4 w-4" /> Smart School Platform
              </p>
              <h2 className="text-3xl font-black text-foreground md:text-5xl" style={{ fontFamily: 'Sora, sans-serif' }}>Ready to Automate Your School?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-white/50 md:text-lg">
                Attendance, timetable, security, communication and analytics in one bright, powerful system.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/signup">
                  <Button className="h-14 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 px-8 text-base font-bold text-white border-0 shadow-[0_0_28px_rgba(56,189,248,0.25)]">
                    Get Started — It's Free <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" className="h-14 rounded-2xl border-white/10 bg-white/[0.04] backdrop-blur-xl px-8 text-base font-bold text-foreground hover:bg-white/[0.08]">
                    Contact Us
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ──────── PROFILE DIALOG ──────── */}
        <Dialog open={Boolean(activeProfile)} onOpenChange={(open) => !open && setActiveProfile(null)}>
          <DialogContent className="max-w-md rounded-2xl border-white/10 bg-[#0c0c1e]/95 p-0 backdrop-blur-xl">
            {activeProfile && (
              <div className="p-6">
                <DialogHeader className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <MemberAvatar
                      name={activeProfile.name}
                      image={activeProfile.image}
                      className="h-16 w-16 rounded-xl border border-white/10"
                      fallbackClassName="text-lg"
                    />
                    <div>
                      <DialogTitle className="text-xl text-foreground">{activeProfile.name}</DialogTitle>
                      <p className="text-sm text-white/50">{activeProfile.role}</p>
                    </div>
                  </div>
                  <DialogDescription className="text-sm leading-relaxed text-white/50">
                    {activeProfile.bio}
                  </DialogDescription>
                  {activeProfile.details ? (
                    <p className="text-xs leading-relaxed text-white/40">{activeProfile.details}</p>
                  ) : null}
                  {activeProfile.name === 'Gaurav' ? (
                    <Link
                      to="/portfolio"
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.08]"
                    >
                      Open secure portfolio
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </DialogHeader>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageLayout>
    </PageTransition>
  );
};

export default DarkModeHome3D;
