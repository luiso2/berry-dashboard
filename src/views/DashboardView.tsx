// DashboardView - Main analytics dashboard
import { useState, useMemo } from 'react';
import type {
  Guest,
  EventbriteMetrics,
  Sponsor,
  TableReservation,
  Ticket,
  BudgetCategory,
  BudgetItem,
  Event,
  ViewType,
} from '../types';
import { MetricCard, ChartBar } from '../components/common';

type DashboardTab = 'overview' | 'revenue' | 'eventbrite' | 'guests';

interface DashboardViewProps {
  // Guest data
  guests: Guest[];
  stats: {
    total: number;
    pending: number;
    vip: number;
    priority: number;
    standard: number;
    emailsSent: number;
    accepted: number;
    totalPartySize: number;
    conversionRate: number;
    emailRate: number;
    checkedIn: number;
    checkedInPartySize: number;
    checkInRate: number;
    featured: number;
  };
  // Business data
  eventbriteMetrics: EventbriteMetrics;
  sponsors: Sponsor[];
  sponsorStats: { total: number; pending: number; active: number; revenue: number };
  tables: TableReservation[];
  tableStats: { total: number; pending: number; confirmed: number; revenue: number };
  tickets: Ticket[];
  ticketStats: { total: number; valid: number; used: number; revenue: number };
  // Budget
  budgetCategories: BudgetCategory[];
  budgetItems: BudgetItem[];
  // Events
  selectedEvent: Event | null;
  // Actions
  onNavigate: (view: ViewType) => void;
  onSync: () => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
}

export function DashboardView({
  guests,
  stats,
  eventbriteMetrics,
  sponsors: _sponsors,
  sponsorStats,
  tables: _tables,
  tableStats,
  ticketStats,
  budgetCategories,
  budgetItems,
  selectedEvent,
  onNavigate,
  onSync,
  isSyncing,
  lastSyncTime,
}: DashboardViewProps) {
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('overview');

  // Calculate health score
  const healthScore = useMemo(() => {
    return Math.round(
      ((stats.conversionRate || 0) * 0.3) +
      ((eventbriteMetrics.totalTicketsSold > 0
        ? Math.min((eventbriteMetrics.totalTicketsSold / (eventbriteMetrics.events[0]?.capacity || 500)) * 100, 100)
        : 50) * 0.3) +
      ((sponsorStats.active > 0 ? 100 : 0) * 0.2) +
      ((stats.checkedIn / (stats.total || 1)) * 100 * 0.2)
    );
  }, [stats, eventbriteMetrics, sponsorStats]);

  const healthColor = healthScore >= 75 ? '#22c55e' : healthScore >= 50 ? '#fbbf24' : '#ef4444';

  // Calculate total revenue
  const totalRevenue = (eventbriteMetrics.totalNetRevenue || 0) + (sponsorStats.revenue || 0) + (tableStats.revenue || 0);

  // Calculate profit margin
  const totalExpenses = budgetCategories
    .filter(c => !c.isIncome)
    .reduce((sum, c) => sum + (budgetItems.filter(i => i.categoryId === c.id).reduce((s, i) => s + (i.estimatedAmount || 0), 0)), 0);
  const profitMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalExpenses) / totalRevenue) * 100) : 0;

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      {/* Dashboard Tabs & Sync Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        padding: '16px 0',
        borderBottom: '1px solid #1a1a1a'
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#0a0a0a', borderRadius: 10, padding: 4 }}>
          {[
            { key: 'overview', label: 'Overview', icon: '📊' },
            { key: 'revenue', label: 'Revenue', icon: '💰' },
            { key: 'eventbrite', label: 'Eventbrite', icon: '🎫' },
            { key: 'guests', label: 'Guests', icon: '👥' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDashboardTab(tab.key as DashboardTab)}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: dashboardTab === tab.key ? '#d4af37' : 'transparent',
                color: dashboardTab === tab.key ? '#000' : '#888',
                fontWeight: dashboardTab === tab.key ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s ease'
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sync All Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {lastSyncTime && (
            <div style={{ fontSize: 12, color: '#666' }}>
              Last sync: {lastSyncTime.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={onSync}
            disabled={isSyncing}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid #d4af37',
              background: isSyncing ? '#1a1a1a' : 'transparent',
              color: '#d4af37',
              fontWeight: 600,
              fontSize: 14,
              cursor: isSyncing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{
              display: 'inline-block',
              animation: isSyncing ? 'spin 1s linear infinite' : 'none'
            }}>🔄</span>
            {isSyncing ? 'Syncing...' : 'Sync All'}
          </button>
        </div>
      </div>

      {/* OVERVIEW TAB */}
      {dashboardTab === 'overview' && (
        <div style={{
          background: 'linear-gradient(135deg, #0f0d0a 0%, #1a1714 50%, #0f0d0a 100%)',
          borderRadius: 20,
          border: '2px solid #d4af37',
          padding: 32,
          marginBottom: 32,
          boxShadow: '0 0 60px rgba(212, 175, 55, 0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid rgba(212,175,55,0.2)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48,
                  background: 'linear-gradient(135deg, #d4af37, #f5d87a)',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(212,175,55,0.3)'
                }}>
                  <span style={{ fontSize: 24 }}>👑</span>
                </div>
                <div>
                  <h2 style={{ fontSize: 26, fontWeight: 800, color: '#d4af37', margin: 0, letterSpacing: '-0.5px' }}>
                    Executive Dashboard
                  </h2>
                  <p style={{ color: '#888', fontSize: 13, margin: '4px 0 0', fontWeight: 500 }}>
                    Real-time event intelligence for {selectedEvent?.name || 'All Events'}
                  </p>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 14,
                color: '#888',
                background: '#111',
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #222'
              }}>
                Last updated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>

          {/* Health Score & Key Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, marginBottom: 28 }}>
            {/* Event Health Score */}
            <div style={{
              background: 'radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)',
              borderRadius: 16,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              border: '1px solid #222'
            }}>
              <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Event Health</div>
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#1a1a1a" strokeWidth="12" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke={healthColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(healthScore / 100) * 327} 327`}
                    transform="rotate(-90 60 60)"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: healthColor }}>
                    {healthScore}
                  </span>
                  <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>/ 100</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 8, textAlign: 'center' }}>
                {healthScore >= 75 ? 'Excellent Performance' : healthScore >= 50 ? 'On Track' : 'Needs Attention'}
              </div>
            </div>

            {/* Key Performance Indicators */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Revenue</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                  ${totalRevenue.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>All streams combined</div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 11, color: '#f05537', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tickets Sold</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                  {eventbriteMetrics.totalTicketsSold || ticketStats.total || 0}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                  {eventbriteMetrics.conversionRate > 0 ? `${eventbriteMetrics.conversionRate}% conversion` : 'Connect Eventbrite'}
                </div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 11, color: '#d4af37', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>VIP Guests</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                  {stats.vip + stats.priority}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                  {stats.total > 0 ? `${Math.round(((stats.vip + stats.priority) / stats.total) * 100)}% of total` : 'No guests yet'}
                </div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sponsors</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                  {sponsorStats.active}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                  ${sponsorStats.revenue.toLocaleString()} revenue
                </div>
              </div>
            </div>
          </div>

          {/* Insights & Alerts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Key Insights */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#d4af37', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                ✨ Key Insights
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {eventbriteMetrics.salesTrend === 'up' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: '#22c55e', fontSize: 16 }}>↗</span>
                    <span style={{ color: '#ccc' }}>Sales trending <strong style={{ color: '#22c55e' }}>up</strong> - {eventbriteMetrics.avgDailySales.toFixed(1)} tickets/day</span>
                  </div>
                )}
                {stats.conversionRate >= 70 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
                    <span style={{ color: '#ccc' }}>Strong guest list approval rate: <strong style={{ color: '#22c55e' }}>{stats.conversionRate}%</strong></span>
                  </div>
                )}
                {guests.filter(g => g.phone).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: '#fbbf24', fontSize: 16 }}>📱</span>
                    <span style={{ color: '#ccc' }}><strong style={{ color: '#fbbf24' }}>{guests.filter(g => g.phone).length}</strong> guests with phone numbers</span>
                  </div>
                )}
                {sponsorStats.active > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: '#a78bfa', fontSize: 16 }}>◆</span>
                    <span style={{ color: '#ccc' }}><strong style={{ color: '#a78bfa' }}>{sponsorStats.active}</strong> active sponsors contributing ${sponsorStats.revenue.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Items */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#f05537', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚡ Action Items
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.pending > 5 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#fbbf24' }} />
                    <span style={{ color: '#ccc' }}><strong style={{ color: '#fbbf24' }}>{stats.pending}</strong> guests pending review</span>
                  </div>
                )}
                {stats.total - stats.emailsSent > 10 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#3b82f6' }} />
                    <span style={{ color: '#ccc' }}><strong style={{ color: '#3b82f6' }}>{stats.total - stats.emailsSent}</strong> invitations pending send</span>
                  </div>
                )}
                {!eventbriteMetrics.connected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#888' }} />
                    <span style={{ color: '#888' }}>Go to Integrations → Connect Eventbrite</span>
                  </div>
                )}
                {stats.pending === 0 && stats.emailsSent === stats.total && stats.total > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>
                    <span style={{ color: '#22c55e' }}>All caught up! No pending actions.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GUESTS TAB */}
      {dashboardTab === 'guests' && (
        <>
          {/* Key Metrics */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            <MetricCard label="Conversion Rate" value={`${stats.conversionRate}%`} subtitle="Accepted / Total" color="#22c55e" />
            <MetricCard label="Email Rate" value={`${stats.emailRate}%`} subtitle="Emails Sent / Total" color="#3b82f6" />
            <MetricCard label="With Phone" value={guests.filter(g => g.phone).length} subtitle="Contact available" color="#fbbf24" />
          </div>

          {/* Charts */}
          <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 32 }}>
            {/* Category Distribution */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Category Distribution</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 200, paddingBottom: 40 }}>
                <ChartBar value={stats.pending} max={stats.total} label="Pending" color="#fbbf24" delay={0} />
                <ChartBar value={stats.vip} max={stats.total} label="VIP" color="#a78bfa" delay={0.1} />
                <ChartBar value={stats.priority} max={stats.total} label="Priority" color="#60a5fa" delay={0.2} />
                <ChartBar value={stats.standard} max={stats.total} label="Standard" color="#6b7280" delay={0.3} />
              </div>
            </div>

            {/* Email Status */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Email Status</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <div style={{ position: 'relative', width: 160, height: 160 }}>
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#1a1a1a" strokeWidth="20" />
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="20"
                      strokeDasharray={`${stats.total > 0 ? (stats.emailsSent / stats.total) * 440 : 0} 440`}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                      style={{
                        transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)',
                        filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))'
                      }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{stats.emailsSent}</span>
                    <span style={{ fontSize: 13, color: '#666' }}>of {stats.total}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#22c55e' }} />
                  <span style={{ fontSize: 14, color: '#888' }}>Sent ({stats.emailsSent})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: '#1a1a1a' }} />
                  <span style={{ fontSize: 14, color: '#888' }}>Not Sent ({stats.total - stats.emailsSent})</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* REVENUE TAB */}
      {dashboardTab === 'revenue' && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#d4af37' }}>Business Metrics</h2>

          {/* Revenue Overview */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <MetricCard label="Sponsor Revenue" value={`$${sponsorStats.revenue.toLocaleString()}`} subtitle="From active sponsors" color="#d4af37" />
            <MetricCard label="Ticket Revenue" value={`$${ticketStats.revenue.toLocaleString()}`} subtitle="Total ticket sales" color="#22c55e" />
            <MetricCard label="Total Guests" value={stats.totalPartySize} subtitle="Expected party size" color="#a78bfa" />
            <MetricCard label="Check-in Rate" value={`${stats.checkInRate}%`} subtitle={`${stats.checkedIn} checked in`} color="#3b82f6" />
          </div>

          {/* Revenue Dashboard */}
          <div style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #111 100%)', borderRadius: 16, border: '1px solid #d4af37', padding: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#d4af37', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  💰 Total Revenue Dashboard
                </h2>
                <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>All revenue streams consolidated</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>
                  ${totalRevenue.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>Total Net Revenue</div>
              </div>
            </div>

            {/* Revenue Breakdown Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 12, color: '#f05537', fontWeight: 600, marginBottom: 8 }}>🎫 TICKET SALES</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
                  ${(eventbriteMetrics.totalGrossRevenue || ticketStats.revenue || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {eventbriteMetrics.totalTicketsSold || ticketStats.total || 0} tickets sold
                </div>
              </div>

              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, marginBottom: 8 }}>🪑 TABLE RESERVATIONS</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>${(tableStats.revenue || 0).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{tableStats.confirmed || 0} tables confirmed</div>
              </div>

              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 12, color: '#d4af37', fontWeight: 600, marginBottom: 8 }}>💎 SPONSORSHIPS</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>${(sponsorStats.revenue || 0).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{sponsorStats.active || 0} sponsors confirmed</div>
              </div>

              <div style={{ background: 'linear-gradient(135deg, #1a3a1a 0%, #0a2a0a 100%)', borderRadius: 12, padding: 20, border: '1px solid #22c55e' }}>
                <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 8 }}>📊 PROFIT MARGIN</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{profitMargin}%</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>After all expenses</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* EVENTBRITE TAB */}
      {dashboardTab === 'eventbrite' && (
        <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 32 }}>🎫</span>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Eventbrite Analytics</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
                {eventbriteMetrics.connected ? 'Live data from your Eventbrite account' : 'Connect Eventbrite to see analytics'}
              </p>
            </div>
          </div>

          {eventbriteMetrics.connected ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #222' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>TOTAL EVENTS</div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{eventbriteMetrics.totalEvents}</div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #222' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>TICKETS SOLD</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e' }}>{eventbriteMetrics.totalTicketsSold}</div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #222' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>NET REVENUE</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#d4af37' }}>${eventbriteMetrics.totalNetRevenue.toLocaleString()}</div>
              </div>
              <div style={{ background: '#111', borderRadius: 12, padding: 20, border: '1px solid #222' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>CHECKED IN</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>{eventbriteMetrics.checkedIn}</div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              <p>Connect your Eventbrite account in Integrations to see analytics here.</p>
              <button
                onClick={() => onNavigate('integrations')}
                style={{
                  marginTop: 16,
                  padding: '12px 24px',
                  background: '#d4af37',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Go to Integrations
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
