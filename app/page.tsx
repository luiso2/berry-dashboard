'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../src/context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Zap, BarChart3, Globe, Shield, Play,
  Users, DollarSign, Calendar, TrendingUp, Search,
  FileText, CheckCircle2, X
} from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- UTILS ---
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// --- COMPONENTS ---

// 3D Tilt Card Component
const TiltCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = ({ currentTarget, clientX, clientY }: React.MouseEvent) => {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left - width / 2);
    mouseY.set(clientY - top - height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [5, -5]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-5, 5]), { stiffness: 150, damping: 20 });

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={cn("relative transition-all duration-200 ease-linear", className)}
    >
      {children}
    </motion.div>
  );
};

// Animated Number
const AnimatedNumber = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    // animate relative to difference
    const diff = value - displayValue;
    if (diff === 0) return;

    let start = 0;
    const duration = 2000;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = value / steps;

    const timer = setInterval(() => {
      start += 1;
      setDisplayValue(prev => {
        const next = prev + increment;
        if (start >= steps) {
          clearInterval(timer);
          return value;
        }
        return next;
      });
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <span>
      {prefix}{Math.floor(displayValue).toLocaleString()}{suffix}
    </span>
  );
};

// --- MAIN PAGE ---

export default function Landing() {
  const router = useRouter();
  const { user } = useAuth();
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: scrollRef });

  // Parallax effects
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const featuresY = useTransform(scrollYProgress, [0.1, 0.3], [100, 0]);

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <div ref={scrollRef} className="min-h-screen bg-black text-white selection:bg-amber-500/30 overflow-x-hidden font-sans">
      {/* Global Noise Texture */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 pointer-events-none z-[100] mix-blend-overlay"></div>

      {/* Ambient Background Lights */}
      <div className="fixed inset-0 z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-purple-900/10 rounded-full blur-[150px] animate-pulse" />
         <div className="absolute top-[20%] right-[-10%] w-[50vw] h-[50vw] bg-amber-600/5 rounded-full blur-[150px] animate-pulse delay-1000" />
         <div className="absolute bottom-[-20%] left-[20%] w-[40vw] h-[40vw] bg-blue-900/10 rounded-full blur-[150px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300 bg-black/50 backdrop-blur-xl border-b border-white/5 supports-[backdrop-filter]:bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20 ring-1 ring-white/20">
              <span className="text-black font-serif font-bold text-xl leading-none mt-1">B</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight hidden sm:block">Berry Bly</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => navigate('/login')}
              className="text-white/60 hover:text-white transition-colors px-4 py-2 text-sm font-medium"
            >
              Log In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="bg-white text-black px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-amber-400 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-amber-500/30"
            >
              Get Started
            </button>
          </motion.div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-20 px-6 min-h-[90vh] flex flex-col justify-center items-center z-10 perspective-[1000px]">
        <motion.div
           style={{ y: heroY, opacity: heroOpacity }}
           className="max-w-5xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full mb-8 border border-white/10 shadow-2xl hover:bg-white/10 transition-colors cursor-default"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-white/80 text-xs font-semibold tracking-widest uppercase">The OS for Elite Events</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, type: 'spring' }}
            className="text-5xl sm:text-7xl md:text-8xl font-bold text-white mb-8 leading-[0.9] tracking-tighter"
          >
            Articulate Vision. <br/>
            <span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-2xl">
              Automate Reality.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-lg md:text-2xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            A cohesive intelligence layer for high-stakes events.
            From customized guest journeys to real-time financial forecasting.
          </motion.p>

          <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.8, delay: 0.6 }}
             className="flex flex-col sm:flex-row gap-5 justify-center items-center"
          >
            <button
              onClick={() => navigate('/register')}
              className="group relative bg-white text-black px-10 py-4 rounded-full font-bold text-lg hover:shadow-[0_0_40px_-5px_rgba(255,255,255,0.4)] transition-all overflow-hidden"
            >
              <div className="relative z-10 flex items-center gap-2">
                Start Building <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-10 py-4 rounded-full font-semibold text-lg border border-white/10 hover:bg-white/5 transition-all text-white/80 hover:text-white flex items-center gap-2"
            >
              See Live Demo
            </button>
          </motion.div>
        </motion.div>

        {/* --- 3D INTERFACE PREVIEW --- */}
        <motion.div
           initial={{ opacity: 0, rotateX: 25, y: 150 }}
           animate={{ opacity: 1, rotateX: 10, y: 0 }}
           transition={{ duration: 1.2, delay: 0.5, type: 'spring' }}
           className="mt-20 w-full max-w-7xl mx-auto relative z-20 group"
           style={{ transformStyle: 'preserve-3d', perspective: '1200px' }}
        >
            {/* Glossy Reflection overlay */}
            <div className="absolute inset-x-0 -top-40 h-[400px] bg-gradient-to-b from-amber-500/10 to-transparent blur-[100px] rounded-full pointer-events-none" />

            <TiltCard className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black bg-[#0d0d0d] relative">

                {/* Mock UI Header */}
                <div className="h-16 border-b border-white/5 bg-zinc-900/50 backdrop-blur-md flex items-center px-6 justify-between">
                   <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/50" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                      <div className="w-3 h-3 rounded-full bg-green-500/50" />
                   </div>
                   <div className="h-2 w-64 bg-white/5 rounded-full" />
                   <div className="h-8 w-8 rounded-full bg-white/10" />
                </div>

                {/* Mock UI Body */}
                <div className="grid grid-cols-12 gap-0 h-[600px] overflow-hidden text-left bg-black/40">

                    {/* Sidebar */}
                    <div className="col-span-2 border-r border-white/5 p-6 flex flex-col gap-6 bg-zinc-900/20">
                       <div className="h-8 w-8 bg-amber-500 rounded-lg mb-8 opacity-80" />
                       {[1,2,3,4,5].map(i => (
                          <div key={i} className="h-2 w-full bg-white/5 rounded-full" />
                       ))}
                    </div>

                    {/* Dashboard Content */}
                    <div className="col-span-10 p-8 grid grid-cols-3 grid-rows-2 gap-6">
                        {/* Stat 1 */}
                        <div className="col-span-1 bg-gradient-to-br from-zinc-900 to-black border border-white/5 rounded-2xl p-6 relative overflow-hidden group/card hover:border-white/10 transition-colors">
                           <div className="absolute top-0 right-0 p-4 opacity-20"><DollarSign /></div>
                           <h4 className="text-white/40 text-sm font-medium mb-2">Total Revenue</h4>
                           <div className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                             $<AnimatedNumber value={2450000} />
                           </div>
                           <div className="mt-4 h-2 w-full bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full w-[85%] bg-green-500 rounded-full" />
                           </div>
                        </div>

                        {/* Stat 2 */}
                        <div className="col-span-1 bg-gradient-to-br from-zinc-900 to-black border border-white/5 rounded-2xl p-6 relative overflow-hidden group/card hover:border-white/10 transition-colors">
                            <div className="absolute top-0 right-0 p-4 opacity-20"><Users /></div>
                           <h4 className="text-white/40 text-sm font-medium mb-2">Total RSVP</h4>
                           <div className="text-4xl font-bold text-white">
                             <AnimatedNumber value={1402} />
                           </div>
                           <div className="text-green-400 text-sm mt-2 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> +12% this week
                           </div>
                        </div>

                         {/* AI Insight */}
                         <div className="col-span-1 bg-gradient-to-br from-amber-900/20 to-black border border-amber-500/20 rounded-2xl p-6 relative overflow-hidden">
                           <div className="flex items-center gap-2 mb-4">
                              <Zap className="w-4 h-4 text-amber-500" />
                              <span className="text-amber-500 font-bold text-xs uppercase tracking-wider">AI Insight</span>
                           </div>
                           <p className="text-white/80 text-sm leading-relaxed">
                              "Venue contract analysis complete. Force majeure clause detected in paragraph 4. Recommend review before signing."
                           </p>
                        </div>

                        {/* Chart Area */}
                        <div className="col-span-2 row-span-1 bg-zinc-900/30 border border-white/5 rounded-2xl p-6 flex flex-col justify-end relative">
                            <h4 className="absolute top-6 left-6 text-white/40 text-sm">Ticket Velocity</h4>
                             <div className="flex items-end gap-2 h-32 w-full">
                               {[30, 45, 60, 40, 70, 85, 60, 95, 50, 80, 100, 90].map((h, i) => (
                                 <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    whileInView={{ height: `${h}%` }}
                                    transition={{ delay: i * 0.05 + 1.5, duration: 0.5 }}
                                    className="flex-1 bg-gradient-to-t from-amber-600/50 to-amber-400/80 rounded-t-sm opacity-80 hover:opacity-100 transition-opacity"
                                  />
                               ))}
                             </div>
                        </div>

                         {/* Sponsor List */}
                         <div className="col-span-1 row-span-1 bg-zinc-900/30 border border-white/5 rounded-2xl p-6">
                            <h4 className="text-white/40 text-sm mb-4">Top Sponsors</h4>
                            <div className="space-y-3">
                               {[1,2,3].map(i => (
                                 <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                       <div className="w-8 h-8 rounded-full bg-white/10" />
                                       <div className="h-3 w-20 bg-white/10 rounded-full" />
                                    </div>
                                    <div className="h-3 w-10 bg-green-500/20 rounded-full" />
                                 </div>
                               ))}
                            </div>
                         </div>
                    </div>
                </div>
            </TiltCard>
        </motion.div>
      </section>

      {/* --- SOCIAL PROOF --- */}
      <div className="w-full bg-zinc-950/50 border-y border-white/5 overflow-hidden py-10 relative">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm z-10" />
        <div className="relative z-20 flex flex-col items-center">
             <p className="text-white/20 text-xs font-semibold uppercase tracking-[0.2em] mb-6">Trusted by the boldest</p>
            <div className="flex animate-scroll whitespace-nowrap gap-24 items-center justify-center min-w-full opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
                {["LVMH", "Vogue Events", "TechCrunch Disrupt", "Art Basel", "Sotheby's", "LVMH", "Vogue Events"].map((brand, i) => (
                    <span key={i} className="text-3xl font-serif italic text-white font-bold">{brand}</span>
                ))}
            </div>
        </div>
      </div>

      {/* --- BENTO GRID: ECOSYSTEM --- */}
      <section className="py-32 px-6 bg-black relative">
        <motion.div
           style={{ y: featuresY }}
            className="max-w-7xl mx-auto"
        >
            <div className="text-center mb-24">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">The <span className="text-amber-500">Trinity</span> of Event Management</h2>
              <p className="text-white/50 text-xl max-w-2xl mx-auto">
                  Connecting the three pillars of every successful event into one synchronized nervous system.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[500px]">

                {/* 1. Planners (Financials) */}
                <TiltCard className="md:col-span-2 row-span-1 bg-gradient-to-br from-zinc-900 to-black border border-white/10 rounded-3xl p-10 flex flex-col justify-between group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] group-hover:bg-amber-500/10 transition-colors" />

                    <div className="relative z-10">
                         <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-amber-500/10 rounded-xl"><BarChart3 className="w-6 h-6 text-amber-500" /></div>
                            <span className="text-amber-500 font-mono text-xs uppercase tracking-wider">For Planners</span>
                         </div>
                         <h3 className="text-3xl font-bold mb-4">Central Command</h3>
                         <p className="text-white/50 text-lg max-w-md">
                            Stop juggling spreadsheets. Get real-time cross-event analytics, automated Eventbrite syncing, and budget forecasting in one view.
                         </p>
                    </div>

                    {/* Mini Mockup */}
                    <div className="relative z-10 w-full bg-zinc-950/50 rounded-xl border border-white/5 p-6 backdrop-blur-md mt-6 translate-y-6 group-hover:translate-y-2 transition-transform duration-500">
                         <div className="flex justify-between items-end mb-4">
                             <div>
                                 <div className="text-white/40 text-xs uppercase">Net Profit</div>
                                 <div className="text-2xl font-bold text-white">$452,100</div>
                             </div>
                             <div className="text-green-400 text-sm bg-green-400/10 px-2 py-1 rounded">+24% vs Projection</div>
                         </div>
                         <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                             <div className="h-full w-[70%] bg-gradient-to-r from-amber-600 to-amber-400" />
                         </div>
                    </div>
                </TiltCard>

                {/* 2. Sponsors (Portal) */}
                <TiltCard className="md:col-span-1 row-span-1 bg-zinc-900 border border-white/10 rounded-3xl p-10 flex flex-col relative overflow-hidden group">
                     <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
                     <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-purple-900/20 to-transparent" />

                     <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-purple-500/10 rounded-xl"><DollarSign className="w-6 h-6 text-purple-400" /></div>
                             <span className="text-purple-400 font-mono text-xs uppercase tracking-wider">For Sponsors</span>
                         </div>

                        <h3 className="text-3xl font-bold mb-4">Automated ROI</h3>
                        <p className="text-white/50 mb-auto">Give sponsors a dedicated portal to view their impressions, click-throughs, and guest engagement.</p>

                        {/* Status Card */}
                        <div className="mt-8 bg-black/40 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-serif font-bold text-white">L</div>
                            <div>
                                <div className="text-white font-bold text-sm">LVMH Group</div>
                                <div className="text-amber-400 text-xs">Platinum Tier • Active</div>
                            </div>
                        </div>
                     </div>
                </TiltCard>

                 {/* 3. Guests (RSVP) */}
                 <TiltCard className="md:col-span-1 row-span-1 bg-zinc-900 border border-white/10 rounded-3xl p-8 flex flex-col group relative overflow-hidden">
                     <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl" />

                     <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-blue-500/10 rounded-xl"><Users className="w-6 h-6 text-blue-400" /></div>
                             <span className="text-blue-400 font-mono text-xs uppercase tracking-wider">For Guests</span>
                         </div>
                         <h3 className="text-2xl font-bold mb-2">Seamless RSVP</h3>
                         <p className="text-white/40 text-sm mb-6">Beautiful, mobile-first RSVP pages with custom branding.</p>

                         <div className="bg-white text-black p-4 rounded-xl shadow-lg transform rotate-2 group-hover:rotate-0 transition-transform duration-300">
                             <div className="flex justify-between items-center border-b border-black/10 pb-3 mb-3">
                                 <span className="font-bold text-sm">Gala 2026</span>
                                 <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded-full">VIP</span>
                             </div>
                             <div className="flex justify-between items-center">
                                 <div className="flex -space-x-2">
                                     {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-gray-300 border-2 border-white" />)}
                                 </div>
                                 <div className="text-xs font-bold">You're in!</div>
                             </div>
                         </div>
                     </div>
                 </TiltCard>

                 {/* 4. AI Security */}
                 <TiltCard className="md:col-span-2 row-span-1 bg-gradient-to-r from-zinc-900 to-zinc-950 border border-white/10 rounded-3xl p-8 flex flex-row items-center justify-between gap-8 group">
                     <div className="max-w-md">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-white/5 rounded-xl"><Shield className="w-6 h-6 text-white" /></div>
                            <span className="text-white/60 font-mono text-xs uppercase tracking-wider">Security & Compliance</span>
                         </div>
                         <h3 className="text-2xl font-bold mb-4">AI-Powered Risk Detection</h3>
                         <p className="text-white/40">Our AI scans vendor contracts for risks and monitors guest lists for compliance anomalies in real-time.</p>
                     </div>
                     <div className="hidden md:flex h-32 w-32 bg-amber-500/5 rounded-full border border-amber-500/20 items-center justify-center relative">
                         <div className="absolute inset-0 border border-amber-500/30 rounded-full animate-ping" />
                         <Shield className="w-12 h-12 text-amber-500" />
                     </div>
                 </TiltCard>
            </div>
        </motion.div>
      </section>

      {/* --- FUNNEL METHODOLOGY --- */}
      <section className="py-24 px-6 bg-zinc-950 border-t border-white/10 relative overflow-hidden">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

         <div className="max-w-5xl mx-auto relative z-10">
            <div className="text-center mb-16">
                 <h2 className="text-4xl font-bold mb-4">The <span className="text-amber-500 italic">"Funnel Machine"</span></h2>
                 <p className="text-white/50">How Berry Bly turns attendees into lifelong patrons.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 relative">
                 {/* Connector Line */}
                 <div className="absolute top-[60px] left-10 right-10 h-0.5 bg-gradient-to-r from-white/0 via-amber-500/30 to-white/0 hidden md:block" />

                 {[
                    { step: 1, title: 'Capture', desc: 'Auto-import guest details from Eventbrite & Social.', icon: Search },
                    { step: 2, title: 'Engage', desc: 'AI-personalized email sequences & invites.', icon: Zap },
                    { step: 3, title: 'Convert', desc: 'Upsell VIP packages and sponsorship tiers.', icon: DollarSign }
                 ].map((item, i) => (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.2 }}
                        viewport={{ once: true }}
                        key={i}
                        className="relative bg-black border border-white/10 p-8 rounded-2xl z-10 hover:border-amber-500/50 transition-colors text-center group"
                    >
                        <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-6 border border-white/10 group-hover:scale-110 transition-transform relative z-10 shadow-xl">
                            <item.icon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                        <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                    </motion.div>
                 ))}
            </div>
         </div>
      </section>

      {/* --- COMPARISON TABLE --- */}
      <section className="py-24 px-6 bg-black relative">
         <div className="max-w-4xl mx-auto">
             <h2 className="text-3xl font-bold text-center mb-16">The Evolution of Event Management</h2>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Old Way */}
                 <div className="bg-white/5 rounded-3xl p-8 border border-white/5 opacity-60 hover:opacity-100 transition-opacity">
                     <h3 className="text-xl font-bold mb-6 text-white/50">The Old Way</h3>
                     <ul className="space-y-4">
                         {['Disconnected Spreadsheets', 'Manual Vendor Payments', 'Guessing ROI', 'Chaotic Check-ins'].map((item, i) => (
                             <li key={i} className="flex items-center gap-3 text-white/60">
                                 <X className="w-5 h-5 text-red-500/50" /> {item}
                             </li>
                         ))}
                     </ul>
                 </div>

                 {/* New Way */}
                 <div className="bg-gradient-to-b from-zinc-900 to-black rounded-3xl p-8 border border-amber-500/30 shadow-2xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full" />
                     <h3 className="text-xl font-bold mb-6 text-amber-500">The Berry Bly Way</h3>
                     <ul className="space-y-4 relative z-10">
                         {['Unified Dashboard', 'Automated Contracts', 'Real-time Financials', 'QR & Facial Check-in'].map((item, i) => (
                             <li key={i} className="flex items-center gap-3 text-white">
                                 <CheckCircle2 className="w-5 h-5 text-amber-500" /> {item}
                             </li>
                         ))}
                     </ul>
                 </div>
             </div>
         </div>
      </section>

      {/* --- CTA SECTION --- */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black to-zinc-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
           <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900/50 backdrop-blur-3xl rounded-[3rem] p-12 md:p-24 border border-white/10 shadow-2xl relative overflow-hidden"
          >
            {/* Background Beams */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(217,119,6,0.15),transparent_70%)] pointer-events-none" />

            <h2 className="text-4xl md:text-7xl font-bold text-white mb-8 tracking-tight">
              Ready to <span className="text-amber-500">Upgrade?</span>
            </h2>
            <p className="text-white/60 mb-12 text-xl max-w-xl mx-auto">
              Replace chaos with intelligence. Join the platform powering the world's most exclusive events.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                onClick={() => navigate('/register')}
                className="bg-white text-black px-12 py-5 rounded-full font-bold text-xl hover:bg-amber-400 hover:scale-105 transition-all shadow-xl flex items-center justify-center gap-2"
                >
                Get Started <ArrowRight className="w-5 h-5" />
                </button>
            </div>
            <p className="mt-8 text-white/30 text-xs uppercase tracking-widest">Invites Only • Limited Availability</p>
          </motion.div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-12 px-6 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-700 rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white font-serif font-bold">B</span>
            </div>
            <span className="text-white/80 font-semibold tracking-wide">Berry Bly Productions</span>
          </div>
          <div className="flex gap-8 text-sm text-white/40">
            <a href="#" className="hover:text-amber-500 transition-colors">Privacy</a>
            <a href="#" className="hover:text-amber-500 transition-colors">Terms</a>
            <a href="#" className="hover:text-amber-500 transition-colors">Contact</a>
          </div>
          <div className="text-white/20 text-sm">
            © 2026 Berry Bly. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
