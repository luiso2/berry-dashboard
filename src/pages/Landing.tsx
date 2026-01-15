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
    <div className="min-h-screen bg-black">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center">
              <span className="text-black font-bold text-xl">B</span>
            </div>
            <span className="text-amber-400 font-bold text-xl">Berry Bly</span>
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
              className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black px-6 py-2 rounded-full font-medium hover:shadow-lg hover:shadow-amber-500/25 transition-all"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 backdrop-blur-sm px-4 py-2 rounded-full mb-8 border border-amber-500/20">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
            <span className="text-amber-200/80 text-sm">Trusted by 500+ Event Planners</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            The Ultimate
            <span className="bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent"> Event </span>
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
              className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black px-8 py-4 rounded-full font-semibold text-lg hover:shadow-xl hover:shadow-amber-500/30 transition-all transform hover:scale-105"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => navigate('/login')}
              className="bg-white/5 backdrop-blur-sm text-amber-400 px-8 py-4 rounded-full font-semibold text-lg border border-amber-500/30 hover:bg-amber-500/10 transition-all"
            >
              View Demo
            </button>
          </div>

          {/* Dashboard Preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-yellow-600/20 blur-3xl"></div>
            <div className="relative bg-zinc-900/80 backdrop-blur-xl rounded-2xl border border-amber-500/20 p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="bg-black/60 rounded-xl p-6">
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Total Events', value: '24', color: 'from-amber-400 to-yellow-500' },
                    { label: 'Guests', value: '1,847', color: 'from-amber-500 to-orange-500' },
                    { label: 'Revenue', value: '$89K', color: 'from-yellow-400 to-amber-500' },
                    { label: 'Sponsors', value: '12', color: 'from-orange-400 to-amber-500' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-amber-500/10">
                      <div className={`text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                        {stat.value}
                      </div>
                      <div className="text-white/40 text-sm">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {/* Revenue Chart */}
                  <div className="col-span-2 bg-zinc-800/50 rounded-xl p-4 border border-amber-500/10 h-40">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-white/60 text-sm font-medium">Revenue Trends</span>
                      <span className="text-amber-400 text-xs">+24% this month</span>
                    </div>
                    <div className="flex items-end gap-2 h-20">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-amber-500/60 to-amber-400/30 rounded-t"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Quick Stats */}
                  <div className="bg-zinc-800/50 rounded-xl p-4 border border-amber-500/10 h-40">
                    <span className="text-white/60 text-sm font-medium">Top Events</span>
                    <div className="mt-3 space-y-2">
                      {[
                        { name: 'VIP Gala', value: '324 guests' },
                        { name: 'Summer Fest', value: '512 guests' },
                        { name: 'Launch Party', value: '189 guests' },
                      ].map((event, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-white/80 text-xs">{event.name}</span>
                          <span className="text-amber-400/80 text-xs">{event.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
                className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-amber-500/10 hover:border-amber-500/40 transition-all group"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-amber-400 transition-colors">
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
          <div className="bg-gradient-to-r from-amber-500/10 to-yellow-600/10 backdrop-blur-xl rounded-3xl p-12 border border-amber-500/20">
            <h2 className="text-4xl font-bold text-white mb-4">
              Ready to Transform Your Events?
            </h2>
            <p className="text-white/60 mb-8 max-w-xl mx-auto">
              Join thousands of event planners who trust Berry Bly for their most important moments.
            </p>
            <button
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-amber-500 to-yellow-600 text-black px-10 py-4 rounded-full font-semibold text-lg hover:shadow-xl hover:shadow-amber-500/30 transition-all transform hover:scale-105"
            >
              Start Your Free Trial
            </button>
            <p className="text-amber-200/40 text-sm mt-4">No credit card required</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-amber-500/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg flex items-center justify-center">
              <span className="text-black font-bold">B</span>
            </div>
            <span className="text-amber-200/60">Berry Bly Productions</span>
          </div>
          <div className="text-white/40 text-sm">
            © 2025 Berry Bly Productions. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
