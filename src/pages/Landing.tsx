import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue } from 'framer-motion';
import { ArrowRight, Zap, BarChart3, Globe, Shield, Play } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

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

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [7, -7]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-7, 7]), { stiffness: 150, damping: 20 });

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

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: scrollRef });

  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div ref={scrollRef} className="min-h-screen bg-black text-white selection:bg-amber-500/30 overflow-x-hidden font-sans">
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none z-[100]"></div>

      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-amber-600/10 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-xl border-b border-white/5 supports-[backdrop-filter]:bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-black font-bold text-xl">B</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">Berry Bly</span>
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
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="bg-white text-black px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-amber-400 hover:scale-105 transition-all shadow-lg shadow-white/10"
            >
              Get Started
            </button>
          </motion.div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 min-h-[90vh] flex flex-col justify-center items-center z-10 perspective-[1000px]">
        <motion.div
           style={{ y, opacity }}
           className="max-w-5xl mx-auto text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full mb-8 border border-white/10 shadow-xl"
          >
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_rgb(74,222,128)]"></span>
            <span className="text-white/80 text-xs font-medium tracking-wide uppercase">AI-Powered Event Intelligence</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, type: 'spring' }}
            className="text-6xl md:text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 mb-8 leading-[1.1] tracking-tight"
          >
            Events, <br/>
            <span className="bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-600 bg-clip-text text-transparent">Reimagined.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-white/40 max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            The world's most advanced funnel for luxury events.
            Analyze, plan, and monetize with military-grade precision.
          </motion.p>

          <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.8, delay: 0.6 }}
             className="flex flex-col sm:flex-row gap-5 justify-center items-center"
          >
            <button
              onClick={() => navigate('/register')}
              className="group relative bg-white text-black px-10 py-5 rounded-full font-bold text-lg hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all overflow-hidden"
            >
              <div className="relative z-10 flex items-center gap-2">
                Start Free Trial <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="bg-white/5 backdrop-blur-sm text-white px-10 py-5 rounded-full font-semibold text-lg border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2 group"
            >
              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" /> Watch Demo
            </button>
          </motion.div>
        </motion.div>

        {/* Hero 3D Mockup */}
        <motion.div
           initial={{ opacity: 0, rotateX: 20, y: 100 }}
           animate={{ opacity: 1, rotateX: 0, y: 0 }}
           transition={{ duration: 1, delay: 0.5 }}
           className="mt-20 w-full max-w-6xl mx-auto relative z-20"
           style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
        >
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-30 h-full w-full pointer-events-none" />
            <TiltCard className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-amber-900/20 bg-zinc-900/50 backdrop-blur-sm">
                <div className="aspect-[16/9] w-full bg-zinc-900 flex items-center justify-center relative overflow-hidden">
                     {/* Abstract UI Representation */}
                     <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-purple-500/5" />
                     <div className="grid grid-cols-4 gap-4 p-8 w-full h-full opacity-50">
                        <div className="col-span-1 bg-white/5 rounded-xl h-full border border-white/5" />
                        <div className="col-span-3 grid grid-rows-3 gap-4">
                            <div className="row-span-1 bg-white/5 rounded-xl border border-white/5 flex items-center px-6">
                                <div className="w-1/3 h-4 bg-white/10 rounded-full" />
                            </div>
                            <div className="row-span-2 bg-white/5 rounded-xl border border-white/5 grid grid-cols-2 gap-4 p-4">
                                <div className="bg-white/5 rounded-lg" />
                                <div className="bg-white/5 rounded-lg" />
                            </div>
                        </div>
                     </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/60 p-8 rounded-3xl backdrop-blur-xl border border-white/10">
                        <BarChart3 className="w-16 h-16 text-amber-500 mb-4 mx-auto" />
                        <div className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-yellow-600 bg-clip-text text-transparent">Real-time Analytics</div>
                    </div>
                </div>
            </TiltCard>
        </motion.div>
      </section>

      {/* Social Proof Scroller */}
      <div className="w-full bg-white/5 border-y border-white/5 overflow-hidden py-10">
        <div className="flex animate-scroll whitespace-nowrap gap-20 items-center justify-center min-w-full">
             {["Vogue", "Forbes", "TechCrunch", "Wired", "Vanity Fair", "Vogue", "Forbes"].map((brand, i) => (
               <span key={i} className="text-2xl font-serif italic text-white/20 font-bold">{brand}</span>
             ))}
        </div>
      </div>

      {/* Bento Grid Features */}
      <section className="py-32 px-6 bg-black relative">
        <div className="max-w-7xl mx-auto">
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               className="text-center mb-24"
            >
              <h2 className="text-5xl font-bold mb-6">Designed for <span className="text-amber-500">Excellence</span></h2>
              <p className="text-white/50 text-xl max-w-2xl mx-auto">
                  Every pixel, every interaction, every analytic is crafted to maximize your event's potential.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 auto-rows-[400px]">
                {/* Large Card */}
                <TiltCard className="md:col-span-2 row-span-1 bg-zinc-900/30 border border-white/10 rounded-3xl p-10 flex flex-col justify-between group overflow-hidden">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-br from-amber-500/20 to-purple-500/20 blur-[100px] rounded-full group-hover:scale-150 transition-transform duration-700" />
                    <div className="relative z-10">
                         <div className="p-3 bg-amber-500/10 w-fit rounded-xl mb-6"><BarChart3 className="w-8 h-8 text-amber-500" /></div>
                         <h3 className="text-3xl font-bold mb-4">Financial Command Center</h3>
                         <p className="text-white/50 text-lg max-w-md">Track every penny. ROI prediction, real-time budget forecasting, and automated vendor payments in one dashboard.</p>
                    </div>
                    <div className="relative z-10 w-full h-40 bg-zinc-900/80 rounded-xl border border-white/5 mt-8 overflow-hidden p-6 flex items-end gap-2">
                        {[40, 70, 50, 90, 60, 80, 50, 95].map((h, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                whileInView={{ height: `${h}%` }}
                                transition={{ delay: i * 0.05 }}
                                className="flex-1 bg-gradient-to-t from-amber-500 to-amber-300/50 rounded-t-sm"
                            />
                        ))}
                    </div>
                </TiltCard>

                {/* Tall Card */}
                <TiltCard className="md:col-span-1 row-span-1 md:row-span-2 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-white/10 rounded-3xl p-10 flex flex-col relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
                     <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-amber-900/20 to-transparent" />

                     <div className="relative z-10">
                        <Globe className="w-10 h-10 text-white mb-6" />
                        <h3 className="text-3xl font-bold mb-4">Global Reach</h3>
                        <p className="text-white/50 mb-8">Multi-currency, multi-language support for international galas.</p>

                        <div className="space-y-4">
                            {['New York', 'Paris', 'Dubai', 'Tokyo'].map((city, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                                    <span className="font-medium">{city}</span>
                                    <span className="text-xs text-green-400 flex items-center gap-1">● Active</span>
                                </div>
                            ))}
                        </div>
                     </div>
                </TiltCard>

                 {/* Small Card 1 */}
                 <TiltCard className="bg-zinc-900/30 border border-white/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center group hover:bg-zinc-800/50 transition-colors">
                     <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                         <Shield className="w-8 h-8" />
                     </div>
                     <h3 className="text-xl font-bold mb-2">Military-Grade Security</h3>
                     <p className="text-white/40 text-sm">End-to-end encryption for VIP guest lists.</p>
                 </TiltCard>

                 {/* Small Card 2 */}
                 <TiltCard className="bg-zinc-900/30 border border-white/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center group hover:bg-zinc-800/50 transition-colors">
                     <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 text-purple-400 group-hover:scale-110 transition-transform">
                         <Zap className="w-8 h-8" />
                     </div>
                     <h3 className="text-xl font-bold mb-2">Instant Sync</h3>
                     <p className="text-white/40 text-sm">Real-time updates across all devices.</p>
                 </TiltCard>
            </div>
        </div>
      </section>

      {/* Funnel Section */}
      <section className="py-24 px-6 bg-zinc-950 border-t border-white/10 relative overflow-hidden">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

         <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-12">The <span className="text-amber-500 italic">"Funnel Machine"</span> Methodology</h2>

            <div className="grid md:grid-cols-3 gap-6 relative">
                 <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent -translate-y-1/2 hidden md:block" />

                 {[
                    { step: 1, title: 'Capture', desc: 'Auto-import guest details from any source.' },
                    { step: 2, title: 'Engage', desc: 'AI-personalized invites & reminders.' },
                    { step: 3, title: 'Convert', desc: 'Seamless ticketing & upsell flows.' }
                 ].map((item, i) => (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.2 }}
                        viewport={{ once: true }}
                        key={i}
                        className="relative bg-black border border-white/10 p-8 rounded-2xl z-10 hover:border-amber-500/50 transition-colors"
                    >
                        <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-black font-bold text-xl mx-auto mb-4 border-4 border-black box-content relative z-10">
                            {item.step}
                        </div>
                        <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                        <p className="text-white/50 text-sm">{item.desc}</p>
                    </motion.div>
                 ))}
            </div>
         </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black to-zinc-900" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
                       <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900/50 backdrop-blur-3xl rounded-[3rem] p-16 border border-white/10 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none" />

            <h2 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tight">
              Ready to <span className="text-amber-500">Dominate?</span>
            </h2>
            <p className="text-white/60 mb-12 text-xl max-w-xl mx-auto">
              Join the elite circle of event planners who have replaced chaos with Berry Bly.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                onClick={() => navigate('/register')}
                className="bg-white text-black px-12 py-5 rounded-full font-bold text-xl hover:bg-amber-400 hover:scale-105 transition-all shadow-xl"
                >
                Start Free Trial
                </button>
            </div>
            <p className="mt-8 text-white/30 text-sm">No credit card required • Cancel anytime</p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="text-white/60">Berry Bly Productions</span>
          </div>
          <div className="flex gap-8 text-sm text-white/40">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="text-white/20 text-sm">
            © 2026 Berry Bly.
          </div>
        </div>
      </footer>
    </div>
  );
}
