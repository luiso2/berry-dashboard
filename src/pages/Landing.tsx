import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-xl">B</span>
            </div>
            <span className="text-white font-bold text-xl">Berry Bly</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="text-white/80 hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-full font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-white/80 text-sm">Trusted by 500+ Event Planners</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            The Ultimate
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"> Event </span>
            <br />
            Management Platform
          </h1>

          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10">
            Manage guests, vendors, budgets, and sponsors all in one place.
            Real-time analytics and AI-powered insights for unforgettable events.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-full font-semibold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all transform hover:scale-105"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => navigate('/login')}
              className="bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-full font-semibold text-lg border border-white/20 hover:bg-white/20 transition-all"
            >
              View Demo
            </button>
          </div>

          {/* Dashboard Preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/30 to-pink-500/30 blur-3xl"></div>
            <div className="relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="bg-slate-900/80 rounded-xl p-6">
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Total Events', value: '24', color: 'from-blue-500 to-cyan-500' },
                    { label: 'Guests', value: '1,847', color: 'from-purple-500 to-pink-500' },
                    { label: 'Revenue', value: '$89K', color: 'from-green-500 to-emerald-500' },
                    { label: 'Sponsors', value: '12', color: 'from-orange-500 to-red-500' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                      <div className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                        {stat.value}
                      </div>
                      <div className="text-white/40 text-sm">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 bg-slate-800/50 rounded-xl p-4 border border-white/5 h-32"></div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5 h-32"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Everything You Need</h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Powerful tools to manage every aspect of your events
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '👥',
                title: 'Guest Management',
                description: 'Track RSVPs, send invitations, manage check-ins, and categorize VIP guests with ease.'
              },
              {
                icon: '💰',
                title: 'Budget Tracking',
                description: 'Monitor expenses, track payments, and stay within budget with real-time financial insights.'
              },
              {
                icon: '🤝',
                title: 'Vendor & Sponsor CRM',
                description: 'Manage relationships with vendors and sponsors. Track contracts and communications.'
              },
              {
                icon: '📊',
                title: 'Analytics Dashboard',
                description: 'Get AI-powered insights, attendance predictions, and performance metrics.'
              },
              {
                icon: '🎟️',
                title: 'Ticketing & Tables',
                description: 'Sell tickets, manage table reservations, and handle VIP seating arrangements.'
              },
              {
                icon: '⚡',
                title: 'Real-time Updates',
                description: 'WebSocket notifications keep your team in sync with instant updates.'
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition-all group"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-white/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-xl rounded-3xl p-12 border border-white/10">
            <h2 className="text-4xl font-bold text-white mb-4">
              Ready to Transform Your Events?
            </h2>
            <p className="text-white/60 mb-8 max-w-xl mx-auto">
              Join thousands of event planners who trust Berry Bly for their most important moments.
            </p>
            <button
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-10 py-4 rounded-full font-semibold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all transform hover:scale-105"
            >
              Start Your Free Trial
            </button>
            <p className="text-white/40 text-sm mt-4">No credit card required</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="text-white/60">Berry Bly Productions</span>
          </div>
          <div className="text-white/40 text-sm">
            © 2025 Berry Bly Productions. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
