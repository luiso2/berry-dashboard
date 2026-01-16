// App.tsx - Refactored main application component
// Reduced from ~8500 lines to ~600 lines using hooks and extracted components

import { useEffect, useMemo } from 'react';
import { useAuth } from './context/AuthContext';

// Hooks
import { useAppState, useAppActions } from './hooks';

// Components
import { DashboardLayout } from './components/layout';
import { GuestImportModal } from './components/guests';
import { AddGuestModal, SMSModal } from './components/modals';
import { StatCard, MetricCard } from './components/common';

// Views
import {
  SMSView,
  MonitoringView,
  ChatGPTView,
  IntegrationsView,
  ClientPortalView,
  EventsView,
  TicketsView,
  SponsorsView,
  PromotersView,
} from './views';

// Eventbrite Components
import {
  AlertsManager,
  OrdersFeed,
  ReportsExport,
  EventCreator,
  PromoCodesManager,
  CheckInScanner,
  EmailComposer,
  SMSComposer,
  EventComparisonView,
  RefundManager,
} from './components/eventbrite';

// Styles
import './styles/index.css';

// Types
import type { ViewType, GuestCategory } from './types';

function App() {
  // Check if we're on a client portal URL
  const clientMatch = window.location.pathname.match(/^\/client\/([a-zA-Z0-9]+)$/);
  if (clientMatch) {
    return <ClientPortalView token={clientMatch[1]} />;
  }

  const { user, token } = useAuth();
  const state = useAppState();
  const actions = useAppActions(state, token ?? undefined, user?.id);

  // Initial data fetch
  useEffect(() => {
    actions.fetchGuests();
    actions.fetchIntegrations();
    actions.fetchEvents();

    const interval = setInterval(() => {
      actions.fetchGuests();
      state.setLastRefresh(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const guests = state.guests;
    const pending = guests.filter(g => g.category === 'pending').length;
    const categoryA = guests.filter(g => g.category === 'A').length;
    const categoryB = guests.filter(g => g.category === 'B').length;
    const categoryC = guests.filter(g => g.category === 'C').length;
    const rejected = guests.filter(g => g.category === 'rejected').length;

    return {
      total: guests.length,
      pending,
      vip: categoryA,
      priority: categoryB,
      standard: categoryC,
      rejected,
      checkedIn: guests.filter(g => g.checkedInAt).length,
      emailsSent: guests.filter(g => g.emailSent).length,
      totalPartySize: guests.reduce((sum, g) => sum + (g.partySize || 1), 0),
      avgScore: Math.round(guests.reduce((sum, g) => sum + (g.aiScore || 0), 0) / guests.length) || 0,
    };
  }, [state.guests]);

  // Filtered guests
  const filteredGuests = useMemo(() => {
    return state.guests.filter((guest) => {
      const { search, category, emailStatus, dateFrom, dateTo, scoreMin, scoreMax } = state.filters;

      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          guest.name?.toLowerCase().includes(searchLower) ||
          guest.email?.toLowerCase().includes(searchLower) ||
          guest.instagram?.toLowerCase().includes(searchLower) ||
          guest.phone?.includes(search);
        if (!matchesSearch) return false;
      }

      if (category !== 'all' && guest.category !== category) return false;
      if (emailStatus === 'sent' && !guest.emailSent) return false;
      if (emailStatus === 'not_sent' && guest.emailSent) return false;

      if (dateFrom && guest.eventDate && new Date(guest.eventDate) < new Date(dateFrom)) return false;
      if (dateTo && guest.eventDate && new Date(guest.eventDate) > new Date(dateTo)) return false;

      const score = guest.aiScore || 0;
      if (score < scoreMin || score > scoreMax) return false;

      return true;
    });
  }, [state.guests, state.filters]);

  // View helpers
  const getViewTitle = (): string => {
    const titles: Record<ViewType, string> = {
      overview: 'Overview',
      analytics: 'Dashboard',
      guests: 'Guest Lists',
      emails: 'Email Communications',
      events: 'Events',
      models: 'Models',
      tables: 'Table Reservations',
      tickets: 'Tickets & Orders',
      sponsors: 'Sponsors',
      promoters: 'Promoters',
      staff: 'Staff Management',
      budget: 'Budget',
      vendors: 'Vendors',
      integrations: 'Integrations',
      monitoring: 'System Monitoring',
      chatgpt: 'ChatGPT Assistant',
      sms: 'SMS AI Conversations',
      eventbrite: 'Eventbrite Analytics',
      automation: 'Automation',
      checkin: 'Check-In',
    };
    return titles[state.activeView] || 'Dashboard';
  };

  const getViewSubtitle = (): string => {
    const subtitles: Record<ViewType, string> = {
      overview: 'Event overview',
      analytics: 'Overview of your event metrics',
      guests: `${stats.total} guests • ${stats.pending} pending`,
      emails: `${stats.emailsSent} emails sent`,
      events: `${state.eventStats.total} events`,
      models: `${state.modelStats.total} models`,
      tables: `${state.tableStats.total} reservations`,
      tickets: `${state.ticketStats.total} tickets`,
      sponsors: `${state.sponsorStats.total} sponsors`,
      promoters: `${state.promoterStats.total} promoters`,
      staff: `${state.staffStats.total} staff members`,
      budget: 'Manage event finances',
      vendors: `${state.vendors.length} vendors`,
      integrations: `${state.integrations.filter(i => i.status === 'connected').length} connected`,
      monitoring: 'System health & status',
      chatgpt: 'AI-powered assistance',
      sms: `${state.smsStats.unread_messages} unread messages`,
      eventbrite: 'Ticket sales & analytics',
      automation: 'Workflow automation',
      checkin: 'Guest check-in',
    };
    return subtitles[state.activeView] || '';
  };

  // Helper functions
  const formatPhone = (phone: string | undefined | null): string => {
    if (!phone) return '-';
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  };

  const getCategoryColor = (category: GuestCategory): string => {
    const colors: Record<GuestCategory, string> = {
      pending: '#f59e0b',
      A: '#22c55e',
      B: '#3b82f6',
      C: '#6b7280',
      rejected: '#ef4444',
    };
    return colors[category] || '#666';
  };

  // Loading state
  if (state.loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666', fontSize: 16 }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Inline Tab Button component
  const TabBtn = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1a1a1a' : 'transparent',
        border: 'none',
        padding: '8px 14px',
        borderRadius: 8,
        color: active ? '#fff' : '#666',
        fontSize: 15,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  // Render view content
  const renderViewContent = () => {
    switch (state.activeView) {
      case 'analytics':
      case 'overview':
        return (
          <div>
            {/* Stats Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
              <StatCard label="Total Guests" value={stats.total} icon="👥" />
              <StatCard label="Pending" value={stats.pending} icon="⏳" color="#f59e0b" />
              <StatCard label="VIP (A)" value={stats.vip} icon="⭐" color="#22c55e" />
              <StatCard label="Priority (B)" value={stats.priority} icon="🎯" color="#3b82f6" />
              <StatCard label="Standard (C)" value={stats.standard} icon="👤" color="#6b7280" />
              <StatCard label="Checked In" value={stats.checkedIn} icon="📍" color="#8b5cf6" />
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <button
                onClick={() => state.setShowForm(true)}
                style={{ background: '#fff', color: '#000', border: 'none', padding: '12px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Guest
              </button>
              <button
                onClick={() => state.setShowImportModal(true)}
                style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '12px 20px', borderRadius: 8, cursor: 'pointer' }}
              >
                📤 Import CSV
              </button>
              <button
                onClick={() => { actions.fetchGuests(); actions.addToast('Data refreshed', 'success'); }}
                style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '12px 20px', borderRadius: 8, cursor: 'pointer' }}
              >
                🔄 Refresh
              </button>
            </div>

            {/* Recent Guests Preview */}
            <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Recent Guests</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Party Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuests.slice(0, 5).map((guest) => (
                      <tr key={guest.id} style={{ borderBottom: '1px solid #111' }}>
                        <td style={{ padding: '12px 16px' }}>{guest.name}</td>
                        <td style={{ padding: '12px 16px', color: '#888' }}>{guest.email}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: getCategoryColor(guest.category),
                            padding: '4px 10px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 500
                          }}>
                            {guest.category}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{guest.partySize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'guests':
        return (
          <div>
            {/* Filters */}
            {state.showFilters && (
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <input
                    type="text"
                    placeholder="Search by name, email, phone..."
                    value={state.filters.search}
                    onChange={(e) => state.setFilters(prev => ({ ...prev, search: e.target.value }))}
                    style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
                  />
                  <select
                    value={state.filters.category}
                    onChange={(e) => state.setFilters(prev => ({ ...prev, category: e.target.value as GuestCategory | 'all' }))}
                    style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
                  >
                    <option value="all">All Categories</option>
                    <option value="pending">Pending</option>
                    <option value="A">VIP (A)</option>
                    <option value="B">Priority (B)</option>
                    <option value="C">Standard (C)</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select
                    value={state.filters.emailStatus}
                    onChange={(e) => state.setFilters(prev => ({ ...prev, emailStatus: e.target.value as 'all' | 'sent' | 'not_sent' }))}
                    style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
                  >
                    <option value="all">All Email Status</option>
                    <option value="sent">Email Sent</option>
                    <option value="not_sent">Email Not Sent</option>
                  </select>
                </div>
              </div>
            )}

            {/* Guest List Table */}
            <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Phone</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Instagram</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Party</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuests.map((guest) => (
                      <tr key={guest.id} style={{ borderBottom: '1px solid #111' }}>
                        <td style={{ padding: '12px 16px' }}>{guest.name}</td>
                        <td style={{ padding: '12px 16px', color: '#888' }}>{guest.email}</td>
                        <td style={{ padding: '12px 16px', color: '#888' }}>{formatPhone(guest.phone)}</td>
                        <td style={{ padding: '12px 16px', color: '#888' }}>{guest.instagram || '-'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: getCategoryColor(guest.category),
                            padding: '4px 10px',
                            borderRadius: 4,
                            fontSize: 12
                          }}>
                            {guest.category}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{guest.partySize}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {guest.emailSent ? '✓ Sent' : '○ Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredGuests.length === 0 && (
                <p style={{ textAlign: 'center', color: '#666', padding: 40 }}>No guests found</p>
              )}
            </div>
          </div>
        );

      case 'integrations':
        return (
          <IntegrationsView
            userId={user?.id?.toString()}
            onToast={actions.addToast}
            onOpenSmsModal={() => state.setShowSmsModal(true)}
            onRefreshTickets={actions.fetchTickets}
            onRefreshEvents={actions.fetchEvents}
          />
        );

      case 'chatgpt':
        return <ChatGPTView />;

      case 'sms':
        return <SMSView onToast={actions.addToast} />;

      case 'monitoring':
        return <MonitoringView onToast={actions.addToast} />;

      case 'eventbrite':
        return (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              <TabBtn active={state.eventbriteSubTab === 'analytics'} onClick={() => state.setEventbriteSubTab('analytics')} label="Analytics" />
              <TabBtn active={state.eventbriteSubTab === 'orders'} onClick={() => state.setEventbriteSubTab('orders')} label="Orders" />
              <TabBtn active={state.eventbriteSubTab === 'alerts'} onClick={() => state.setEventbriteSubTab('alerts')} label="Alerts" />
              <TabBtn active={state.eventbriteSubTab === 'create'} onClick={() => state.setEventbriteSubTab('create')} label="Create Event" />
              <TabBtn active={state.eventbriteSubTab === 'promos'} onClick={() => state.setEventbriteSubTab('promos')} label="Promo Codes" />
              <TabBtn active={state.eventbriteSubTab === 'checkin'} onClick={() => state.setEventbriteSubTab('checkin')} label="Check-In" />
              <TabBtn active={state.eventbriteSubTab === 'email'} onClick={() => state.setEventbriteSubTab('email')} label="Email" />
              <TabBtn active={state.eventbriteSubTab === 'sms'} onClick={() => state.setEventbriteSubTab('sms')} label="SMS" />
              <TabBtn active={state.eventbriteSubTab === 'compare'} onClick={() => state.setEventbriteSubTab('compare')} label="Compare" />
              <TabBtn active={state.eventbriteSubTab === 'refunds'} onClick={() => state.setEventbriteSubTab('refunds')} label="Refunds" />
              <TabBtn active={state.eventbriteSubTab === 'reports'} onClick={() => state.setEventbriteSubTab('reports')} label="Reports" />
            </div>

            {state.eventbriteSubTab === 'analytics' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <MetricCard label="Total Revenue" value={`$${state.eventbriteMetrics.totalRevenue.toLocaleString()}`} />
                <MetricCard label="Tickets Sold" value={state.eventbriteMetrics.totalTicketsSold} />
                <MetricCard label="Active Events" value={state.eventbriteMetrics.activeEvents} />
                <MetricCard label="Check-Ins" value={state.eventbriteMetrics.checkedIn} />
              </div>
            )}
            {state.eventbriteSubTab === 'orders' && <OrdersFeed events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'alerts' && <AlertsManager events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'create' && <EventCreator />}
            {state.eventbriteSubTab === 'promos' && <PromoCodesManager events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'checkin' && <CheckInScanner events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'email' && <EmailComposer events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'sms' && <SMSComposer events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'compare' && <EventComparisonView events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'refunds' && <RefundManager events={state.eventbriteMetrics.events} />}
            {state.eventbriteSubTab === 'reports' && <ReportsExport events={state.eventbriteMetrics.events} />}
          </div>
        );

      case 'events':
        return <EventsView onToast={actions.addToast} />;

      case 'tickets':
        return <TicketsView onToast={actions.addToast} />;

      case 'sponsors':
        return <SponsorsView onToast={actions.addToast} />;

      case 'promoters':
        return <PromotersView onToast={actions.addToast} />;

      // Placeholder views for modules not yet extracted
      case 'emails':
      case 'models':
      case 'tables':
      case 'staff':
      case 'budget':
      case 'vendors':
      case 'automation':
      case 'checkin':
        return (
          <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>🚧</p>
            <p style={{ fontSize: 18, marginBottom: 8 }}>{getViewTitle()}</p>
            <p>This view is being refactored. Coming soon!</p>
          </div>
        );

      default:
        return (
          <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>📋</p>
            <p>Select a view from the sidebar</p>
          </div>
        );
    }
  };

  return (
    <DashboardLayout
      activeView={state.activeView}
      onViewChange={state.setActiveView}
      sidebarOpen={state.sidebarOpen}
      onSidebarToggle={state.setSidebarOpen}
      toasts={state.toasts}
      lastRefresh={state.lastRefresh}
      onAddToast={actions.addToast}
      title={getViewTitle()}
      subtitle={getViewSubtitle()}
      stats={{
        total: stats.total,
        emailsSent: stats.emailsSent,
        eventStats: state.eventStats,
        ticketStats: state.ticketStats,
        tableStats: state.tableStats,
        sponsorStats: state.sponsorStats,
        staffStats: state.staffStats,
        smsStats: state.smsStats,
        eventbriteMetrics: state.eventbriteMetrics,
        integrations: state.integrations,
      }}
      headerActions={
        <>
          {state.activeView === 'guests' && (
            <button
              onClick={() => state.setShowFilters(!state.showFilters)}
              style={{
                background: state.showFilters ? '#1a1a1a' : 'transparent',
                color: '#888',
                border: '1px solid #333',
                padding: '10px 16px',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              ⚙ Filters
            </button>
          )}
          <button
            onClick={() => state.setShowForm(true)}
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 8,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            + Add Guest
          </button>
        </>
      }
    >
      {renderViewContent()}

      {/* Modals */}
      <AddGuestModal
        show={state.showForm}
        onClose={() => state.setShowForm(false)}
        formData={state.formData}
        onFormChange={state.setFormData}
        onSubmit={async () => {
          state.setShowForm(false);
          actions.addToast('Guest added successfully', 'success');
          actions.fetchGuests();
        }}
      />

      <SMSModal
        show={state.showSmsModal}
        onClose={() => state.setShowSmsModal(false)}
        formData={state.smsFormData}
        onFormChange={state.setSmsFormData}
        onSend={async () => {
          state.setSmsSending(true);
          state.setSmsSending(false);
          state.setShowSmsModal(false);
          actions.addToast('SMS sent!', 'success');
        }}
        sending={state.smsSending}
      />

      {state.showImportModal && (
        <GuestImportModal
          onClose={() => state.setShowImportModal(false)}
          onSuccess={() => {
            state.setShowImportModal(false);
            actions.fetchGuests();
          }}
          eventId={state.selectedEvent?.id?.toString()}
        />
      )}
    </DashboardLayout>
  );
}

export default App;
