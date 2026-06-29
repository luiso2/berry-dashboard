// Dashboard Layout - Sidebar + Header + Main content area
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NavItem } from '../common';
import type { ViewType, Toast } from '../../types';

interface DashboardLayoutProps {
  children: ReactNode;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  sidebarOpen: boolean;
  onSidebarToggle: (open: boolean) => void;
  toasts: Toast[];
  lastRefresh: Date;
  onAddToast: (message: string, type: 'success' | 'error' | 'info') => void;
  stats: {
    total: number;
    emailsSent: number;
    eventStats: { total: number };
    ticketStats: { total: number };
    tableStats: { total: number };
    sponsorStats: { total: number };
    staffStats: { total: number };
    smsStats: { unread_messages: number };
    eventbriteMetrics: { totalTicketsSold: number };
    integrations: { status: string }[];
  };
  headerActions?: ReactNode;
  title: string;
  subtitle: string;
}

export function DashboardLayout({
  children,
  activeView,
  onViewChange,
  sidebarOpen,
  onSidebarToggle,
  toasts,
  lastRefresh,
  onAddToast,
  stats,
  headerActions,
  title,
  subtitle,
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => onSidebarToggle(false);

  const navigateTo = (view: ViewType) => {
    onViewChange(view);
    closeSidebar();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Toast Notifications */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'calc(100vw - 40px)' }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              background: toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              animation: 'toast-in 0.3s ease',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ fontSize: 18 }}>
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
            </span>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={closeSidebar} />

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarOpen ? 'open' : ''}`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: 260,
          borderRight: '1px solid #1a1a1a',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          background: '#000',
          zIndex: 150,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)', borderRadius: 8 }} />
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px' }}>Event Manager</span>
          </div>
          <button
            className="mobile-menu-btn"
            onClick={closeSidebar}
            aria-label="Close menu"
            style={{ display: 'none', background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer', padding: '10px', minWidth: 44, minHeight: 44 }}
          >
            ×
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <div style={{ padding: '0 12px' }}>
            {/* Main Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              Main
            </div>
            <NavItem label="Dashboard" active={activeView === 'analytics'} icon="📊" onClick={() => navigateTo('analytics')} />
            <NavItem label="Events" active={activeView === 'events'} icon="📅" count={stats.eventStats.total} onClick={() => navigateTo('events')} />
            <NavItem label="Guest Lists" active={activeView === 'guests'} icon="👥" count={stats.total} onClick={() => navigateTo('guests')} />

            {/* Revenue Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              Revenue
            </div>
            <NavItem label="Tickets" active={activeView === 'tickets'} icon="🎫" count={stats.ticketStats.total} onClick={() => navigateTo('tickets')} />
            <NavItem label="Tables" active={activeView === 'tables'} icon="🪑" count={stats.tableStats.total} onClick={() => navigateTo('tables')} />
            <NavItem label="Sponsors" active={activeView === 'sponsors'} icon="💎" count={stats.sponsorStats.total} onClick={() => navigateTo('sponsors')} />

            {/* Eventbrite Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              Eventbrite
            </div>
            <NavItem label="Eventbrite" active={activeView === 'eventbrite'} icon="🎫" count={stats.eventbriteMetrics.totalTicketsSold} onClick={() => navigateTo('eventbrite')} />

            {/* Operations Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              Operations
            </div>
            <NavItem label="Emails" active={activeView === 'emails'} icon="✉" count={stats.emailsSent} onClick={() => navigateTo('emails')} />
            <NavItem label="Staff" active={activeView === 'staff'} icon="🧑‍💼" count={stats.staffStats.total} onClick={() => navigateTo('staff')} />

            {/* Settings Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              Settings
            </div>
            <NavItem label="Integrations" active={activeView === 'integrations'} icon="🔌" count={stats.integrations.filter(i => i.status === 'connected').length} onClick={() => navigateTo('integrations')} />

            {/* AI & Automation Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              AI & Automation
            </div>
            <NavItem label="Automation" active={activeView === 'automation'} icon="⚡" onClick={() => navigateTo('automation')} />
            <NavItem label="ChatGPT" active={activeView === 'chatgpt'} icon="🤖" onClick={() => navigateTo('chatgpt')} />
            <NavItem label="SMS AI" active={activeView === 'sms'} icon="💬" count={stats.smsStats.unread_messages} onClick={() => navigateTo('sms')} />

            {/* PeptideConnect Section */}
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '16px 8px 8px', marginTop: 8 }}>
              PeptideConnect
            </div>
            <NavItem label="PeptideConnect" active={activeView === 'peptideconnect'} icon="🧬" onClick={() => navigateTo('peptideconnect')} />
          </div>
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 12px', marginTop: 'auto' }}>
          {user && (
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#666',
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#000', fontWeight: 600 }}>
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
              <span style={{ fontSize: 16, opacity: 0.5 }}>↩</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content" style={{ marginLeft: 260, minHeight: '100vh' }}>
        {/* Header */}
        <header className="header-content" style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1a1a1a', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => onSidebarToggle(true)}
              aria-label="Open menu"
              style={{ display: 'none', background: '#1a1a1a', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '12px 14px', borderRadius: 8, flexShrink: 0, minWidth: 44, minHeight: 44 }}
            >
              ☰
            </button>
            <div style={{ animation: 'fadeIn 0.3s ease', minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 600, margin: 0, letterSpacing: '-0.4px' }}>{title}</h1>
              <p style={{ fontSize: 'clamp(13px, 2vw, 15px)', color: '#666', margin: '4px 0 0' }}>{subtitle}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}>
              <span style={{ color: '#22c55e' }}>●</span>
              <span>Updated {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s ago</span>
            </div>
            <button
              onClick={() => onAddToast('Shortcuts: N=New, R=Refresh, T=Theme, Esc=Close, G+O/G/E/A/C=Navigate', 'info')}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#666', padding: '8px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', minHeight: 36 }}
              title="Keyboard shortcuts"
            >
              ⌘K
            </button>
          </div>
          {headerActions && <div style={{ display: 'flex', gap: 8 }}>{headerActions}</div>}
        </header>

        {/* Page Content */}
        <div style={{ padding: '24px 32px' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
