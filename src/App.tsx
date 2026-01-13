import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { QRCode, generateGuestQRData } from './components/QRCode';
import * as XLSX from 'xlsx';
import * as htmlToImage from 'html-to-image';

// API Configuration - connects to berry-bly-productions backend
// Production API: https://berry.merktop.com/api/v1
const LOCAL_API = 'http://localhost:3001/api/v1';
const API_URL = import.meta.env.VITE_API_URL || LOCAL_API;

// API Endpoints - berry-bly-productions format
const ENDPOINTS = {
  guests: '/guest-lists',
  stats: '/guest-lists/stats',
};

// Status to Category mapping (backend uses status, dashboard uses category)
const statusToCategory = (status: string): GuestCategory => {
  switch (status) {
    case 'approved': return 'A';
    case 'declined': return 'C';
    case 'rejected': return 'rejected';
    default: return 'pending';
  }
};

const categoryToStatus = (category: GuestCategory): string => {
  switch (category) {
    case 'A': return 'approved';
    case 'B': return 'approved'; // B also maps to approved
    case 'C': return 'declined';
    case 'rejected': return 'rejected';
    default: return 'pending';
  }
};

type GuestCategory = 'pending' | 'A' | 'B' | 'C' | 'rejected';
type GuestStatus = 'pending' | 'approved' | 'declined' | 'rejected';
type ViewType = 'overview' | 'guests' | 'emails' | 'vip' | 'priority' | 'standard' | 'analytics' | 'automation' | 'checkin' | 'models' | 'tables' | 'tickets' | 'sponsors' | 'events' | 'budget' | 'vendors' | 'staff' | 'client-portal' | 'monitoring' | 'integrations';
type ThemeMode = 'dark' | 'light';

interface Purchase {
  id: string;
  eventId: string;
  eventName: string;
  ticketType: string;
  amount: number;
  currency: string;
  purchaseDate: string;
  status: 'completed' | 'pending' | 'refunded';
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  partySize: number;
  eventDate: string;
  notes?: string;
  category: GuestCategory;
  status?: GuestStatus; // For production API
  emailSent?: boolean;
  emailSentAt?: string;
  createdAt: string;
  checkedInAt?: string; // For check-in feature
  eventId?: number; // For multi-event support
  // AI Scoring fields
  instagramFollowers?: number;
  instagramFollowing?: number;
  engagementScore?: number;
  attendanceHistory?: number;
  aiScore?: number;
  // Purchase history
  purchaseHistory?: Purchase[];
  totalSpent?: number;
  isRecurring?: boolean;
  // Featured/Hot classification
  isFeatured?: boolean;
  rating?: number;
}

interface QRModal {
  show: boolean;
  guest: Guest | null;
}

interface ScheduledEmail {
  id: string;
  guestId: string;
  guestName: string;
  scheduledFor: string;
  type: 'reminder' | 'followup' | 'invitation';
  status: 'pending' | 'sent' | 'cancelled';
}

interface ConfirmationModal {
  show: boolean;
  guests: Guest[];
  category: GuestCategory | null;
  emailOnly?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Filters {
  search: string;
  category: GuestCategory | 'all';
  emailStatus: 'all' | 'sent' | 'not_sent';
  dateFrom: string;
  dateTo: string;
  scoreMin: number;
  scoreMax: number;
}

// New Module Interfaces
interface Model {
  id: string;
  eventId?: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  photos: string[];
  height?: string;
  experienceLevel: 'beginner' | 'intermediate' | 'professional';
  availability?: { weekdays?: boolean; weekends?: boolean; specificDates?: string[] };
  notes?: string;
  status: 'pending' | 'approved' | 'declined' | 'rejected' | 'assigned';
  aiScore?: number;
  eventsAssigned?: { eventId: string; eventName: string; date: string; role?: string }[];
  createdAt: string;
  updatedAt?: string;
}

interface TableReservation {
  id: string;
  tableId: string;
  tableName: string;
  zone: 'VIP' | 'Premium' | 'Standard' | 'Lounge';
  eventId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  partySize: number;
  specialRequests?: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed';
  depositPaid: boolean;
  depositAmount: number;
  minimumSpend: number;
  capacity: number;
  createdAt: string;
}

interface Ticket {
  id: string;
  eventId: string;
  externalId?: string;
  ticketType: string;
  holderName?: string;
  holderEmail?: string;
  qrCode?: string;
  status: 'valid' | 'used' | 'cancelled' | 'transferred';
  checkInTime?: string;
  price: number;
  source: 'eventbrite' | 'manual' | 'import';
  createdAt: string;
}

interface Sponsor {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  logoUrl?: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'title';
  tierPrice: number;
  message?: string;
  status: 'pending' | 'contacted' | 'negotiating' | 'approved' | 'declined' | 'active';
  contractSigned: boolean;
  paymentStatus: 'pending' | 'partial' | 'complete';
  benefits: string[];
  createdAt: string;
}

// Event Management Interfaces
interface Event {
  id: number;
  name: string;
  slug: string;
  description?: string;
  eventType: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCapacity?: number;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  doorsOpen?: string;
  status: 'planning' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  coverImage?: string;
  theme?: string;
  dressCode?: string;
  ageRestriction?: string;
  ticketLink?: string;
  isPublic: boolean;
  isFeatured: boolean;
  expectedAttendance?: number;
  actualAttendance?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  guestsCount?: number;
  ticketsCount?: number;
  sponsorsCount?: number;
  totalBudget?: number;
}

// EventTimeline and EventChecklist interfaces will be added when
// timeline and checklist features are implemented in the UI

// Integration Interface for external service connections
interface Integration {
  provider: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  fields: string[];
  status: 'connected' | 'disconnected' | 'pending' | 'error';
  lastSync?: string;
  lastError?: string;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  extraConfig?: Record<string, string>;
}

// Budget Interfaces
interface BudgetCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
  isIncome: boolean;
  sortOrder: number;
}

interface BudgetItem {
  id: number;
  budgetId: number;
  categoryId: number;
  categoryName?: string;
  icon?: string;
  color?: string;
  isIncome?: boolean;
  description: string;
  vendorName?: string;
  estimatedAmount: number;
  actualAmount?: number;
  isPaid: boolean;
  paidDate?: string;
  paymentMethod?: string;
  receiptUrl?: string;
  notes?: string;
  status: string;
  dueDate?: string;
}

interface Vendor {
  id: number;
  name: string;
  category?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  rating: number;
  notes?: string;
  isPreferred: boolean;
  totalSpent: number;
  eventsCount: number;
  createdAt: string;
}

// Staff Management Interfaces
interface Staff {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  secondaryRole?: string;
  photoUrl?: string;
  instagram?: string;
  hourlyRate?: number;
  dayRate?: number;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  skills?: string[];
  notes?: string;
  status: 'active' | 'inactive' | 'unavailable';
  rating: number;
  totalEvents: number;
  totalEarned: number;
  availability?: { weekdays: boolean; weekends: boolean };
  emergencyContact?: string;
  emergencyPhone?: string;
  createdAt: string;
  assignmentsCount?: number;
  upcomingEvents?: number;
}

// Client Access Interface
interface ClientAccess {
  id: number;
  eventId: number;
  clientName: string;
  clientEmail: string;
  accessToken?: string;
  permissions: {
    viewBudget: boolean;
    viewTimeline: boolean;
    viewStaff: boolean;
    viewVendors: boolean;
  };
  lastAccessed?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
  portalUrl?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  timestamp: string;
  uptime: number;
  responseTime: number;
  components: {
    database: { status: string; responseTime?: number; message?: string; error?: string };
    tables: { status: string; total: number; existing: number; missing: string[] };
    data: { status: string; counts: Record<string, number | string> };
    memory: { status: string; heapUsed: string; heapTotal: string; percentage: number };
    email: { status: string; from: string; adminEmail: string };
    environment: { status: string; nodeEnv: string; port: number; missingVariables: string[] };
  };
  issues: string[];
}

interface ServerStatus {
  status: string;
  lastCheck: string | null;
  server: {
    nodeVersion: string;
    platform: string;
    pid: number;
    uptime: { days: number; hours: number; minutes: number; seconds: number };
    uptimeSeconds: number;
  };
  memory: { heapUsed: string; heapTotal: string; external: string; rss: string };
  database: { totalConnections: number; idleConnections: number; waitingClients: number };
  config: { port: number; environment: string; emailConfigured: boolean; databaseConfigured: boolean };
}

// Client Portal Data Interface (for public client view)
interface ClientPortalData {
  client: { name: string; email: string };
  event: {
    id: number;
    name: string;
    date: string;
    venue: string;
    city: string;
    status: string;
    expectedAttendance: number;
    theme?: string;
    dressCode?: string;
  };
  permissions: {
    viewBudget: boolean;
    viewTimeline: boolean;
    viewStaff: boolean;
    viewVendors: boolean;
  };
  budget?: {
    items: Array<{
      category: string;
      icon: string;
      description: string;
      estimatedAmount: number;
      actualAmount: number;
      isPaid: boolean;
      isIncome: boolean;
    }>;
    summary: {
      total_estimated_expenses: number;
      total_actual_expenses: number;
      total_estimated_income: number;
      total_actual_income: number;
      paid_count: number;
      pending_count: number;
    };
  };
  timeline?: Array<{
    time: string;
    title: string;
    description: string;
    location: string;
    is_critical: boolean;
    status: string;
  }>;
  checklist?: {
    items: Array<{ category: string; item: string; is_completed: boolean; priority: string }>;
    completed: number;
    total: number;
  };
  staff?: Array<{
    name: string;
    role: string;
    photo_url: string;
    shift_start: string;
    shift_end: string;
    status: string;
  }>;
  vendors?: Array<{
    name: string;
    category: string;
    contract_title: string;
    status: string;
  }>;
}

// Instagram-based AI Score Calculator
const calculateAIScore = (guest: Guest): number => {
  const followers = guest.instagramFollowers || estimateFollowers(guest.instagram);
  const following = guest.instagramFollowing || Math.round(followers * 0.5);

  // Base score from followers (logarithmic scale)
  // 10 = 10pts, 100 = 20pts, 1K = 30pts, 10K = 40pts, 100K = 50pts, 1M = 60pts
  let baseScore = followers >= 10 ? Math.log10(followers) * 10 : 0;

  // Ratio bonus: more followers than following = more influential
  let ratioBonus = 0;
  if (following > 0 && followers > following) {
    const ratio = followers / following;
    ratioBonus = Math.min(30, ratio * 5); // Cap at 30 bonus points
  }

  // Party size bonus (0-10 points)
  const partyBonus = Math.min(guest.partySize * 2, 10);

  // Calculate final score (0-100)
  const rawScore = baseScore + ratioBonus + partyBonus;
  return Math.min(100, Math.max(1, Math.round(rawScore)));
};

// Intelligent follower estimation based on username patterns
const estimateFollowers = (instagram: string): number => {
  if (!instagram) return 0;
  const username = instagram.replace('@', '');

  // Username characteristics analysis
  const usernameLength = username.length;
  const hasNumbers = /\d/.test(username);
  const hasUnderscore = username.includes('_');
  const hasDot = username.includes('.');

  // Shorter usernames = older/more established (harder to get)
  let baseEstimate = Math.max(100, 10000 - (usernameLength * 500));

  // Accounts with numbers are typically newer
  if (hasNumbers) baseEstimate *= 0.5;

  // Underscores = often personal/newer accounts
  if (hasUnderscore) baseEstimate *= 0.7;

  // Dots often indicate professional accounts
  if (hasDot) baseEstimate *= 1.2;

  // Add deterministic variation based on username
  const hash = username.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const multiplier = 0.5 + (hash % 100) / 100;

  return Math.round(baseEstimate * multiplier);
};


const generateAIMessage = (guest: Guest, category: GuestCategory): string => {
  const firstName = guest.name.split(' ')[0];
  const messages: Record<string, string[]> = {
    A: [
      `${firstName}, you've been selected for VIP access. An extraordinary experience awaits.`,
      `Welcome to the inner circle, ${firstName}. Your VIP invitation is confirmed.`,
    ],
    B: [
      `${firstName}, your priority access has been confirmed. We look forward to hosting you.`,
      `Great news, ${firstName}. Your priority reservation is set.`,
    ],
    C: [
      `${firstName}, your reservation is confirmed. We can't wait to see you.`,
      `Thank you for joining us, ${firstName}. Your spot is secured.`,
    ],
    pending: [`${firstName}, thank you for your interest. We're reviewing your request.`],
  };
  const list = messages[category] || messages.C;
  return list[Math.floor(Math.random() * list.length)];
};

// CSS Animations & Responsive Styles
const styles = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(100%); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes grow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  .btn-hover:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .btn-hover:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .row-hover:hover {
    background: #0a0a0a !important;
  }

  .nav-hover:hover {
    background: #1a1a1a !important;
  }

  .stat-hover:hover {
    background: #1a1a1a !important;
    cursor: pointer;
  }

  .input-focus:focus {
    border-color: #333 !important;
    box-shadow: 0 0 0 3px rgba(255,255,255,0.05);
  }

  .checkbox-custom {
    appearance: none;
    width: 18px;
    height: 18px;
    border: 2px solid #333;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    flex-shrink: 0;
  }

  .checkbox-custom:hover {
    border-color: #555;
  }

  .checkbox-custom:checked {
    background: #fff;
    border-color: #fff;
  }

  .checkbox-custom:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #000;
    font-size: 14px;
    font-weight: bold;
  }

  /* Transitions only on interactive elements - not global * selector */
  button, a, input, select, textarea, .btn-hover, .nav-hover, .stat-hover, .row-hover {
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }

  .sidebar-overlay {
    display: none;
  }

  .sidebar-overlay.active {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 149;
  }

  .mobile-menu-btn {
    display: none;
  }

  .table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .hide-mobile {
    display: table-cell;
  }

  .mobile-card {
    display: none;
  }

  .chart-bar {
    transform-origin: bottom;
    animation: grow 0.5s ease forwards;
  }

  /* Responsive padding using CSS custom properties */
  :root {
    --page-padding: clamp(16px, 4vw, 32px);
    --header-padding: clamp(12px, 3vw, 32px);
    --content-gap: clamp(12px, 2vw, 16px);
  }

  .page-content {
    padding: var(--page-padding) !important;
  }

  .header-content {
    padding: 16px var(--header-padding) !important;
  }

  /* Large tablets / small laptops */
  @media (max-width: 1024px) {
    .hide-tablet {
      display: none !important;
    }

    .stats-grid {
      grid-template-columns: repeat(3, 1fr) !important;
    }
  }

  /* Tablets */
  @media (max-width: 900px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }

    .chart-grid {
      grid-template-columns: 1fr !important;
    }
  }

  /* Mobile landscape / small tablets */
  @media (max-width: 768px) {
    .mobile-menu-btn {
      display: flex !important;
    }

    .sidebar {
      transform: translateX(-100%);
      z-index: 150;
    }

    .sidebar.open {
      transform: translateX(0);
      animation: slideIn 0.3s ease;
    }

    .main-content {
      margin-left: 0 !important;
    }

    .hide-mobile {
      display: none !important;
    }

    .mobile-card {
      display: block !important;
    }

    .desktop-table {
      display: none !important;
    }

    .category-grid {
      grid-template-columns: 1fr !important;
    }

    .filter-row {
      flex-direction: column !important;
    }

    /* Header buttons responsive */
    .header-content > div:last-child {
      flex-wrap: wrap;
      gap: 8px !important;
    }
  }

  /* Mobile portrait */
  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: 1fr !important;
    }

    .category-grid {
      gap: 12px !important;
    }
  }

  /* Very small screens */
  @media (max-width: 320px) {
    :root {
      --page-padding: 12px;
      --header-padding: 12px;
    }
  }
`;

// Client Portal View Component - Public view for clients
function ClientPortalView({ token }: { token: string }) {
  const [data, setData] = useState<ClientPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortalData = async () => {
      try {
        const res = await fetch(`${API_URL}/client-portal/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Invalid or expired access');
        }
        const portalData = await res.json();
        setData(portalData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load portal');
      } finally {
        setLoading(false);
      }
    };
    fetchPortalData();
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, border: '3px solid #333', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
          <p style={{ color: '#888', fontSize: 16 }}>Loading your event portal...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 60, marginBottom: 20 }}>🔒</div>
          <h1 style={{ color: '#fff', fontSize: 24, marginBottom: 12 }}>Access Denied</h1>
          <p style={{ color: '#888', fontSize: 16, marginBottom: 24 }}>{error || 'This link is invalid or has expired.'}</p>
          <p style={{ color: '#666', fontSize: 14 }}>Please contact the event organizer for a new link.</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formatCurrency = (amount: number) => '$' + (amount || 0).toLocaleString();
  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    try { return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return timeStr; }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <header style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(212,175,55,0.2)', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, background: 'linear-gradient(135deg, #d4af37, #f4e4bc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {data.event.name}
            </h1>
            <p style={{ color: '#888', fontSize: 14, margin: '4px 0 0' }}>Client Portal</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#d4af37', fontSize: 14, margin: 0 }}>Welcome, {data.client.name}</p>
            <p style={{ color: '#666', fontSize: 12, margin: '2px 0 0' }}>{data.client.email}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {/* Event Info Card */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
            <div>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' }}>Date</p>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>📅 {formatDate(data.event.date)}</p>
            </div>
            <div>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' }}>Venue</p>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>📍 {data.event.venue}{data.event.city ? `, ${data.event.city}` : ''}</p>
            </div>
            {data.event.expectedAttendance > 0 && (
              <div>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' }}>Expected Guests</p>
                <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>👥 {data.event.expectedAttendance.toLocaleString()}</p>
              </div>
            )}
            {data.event.dressCode && (
              <div>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' }}>Dress Code</p>
                <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>👔 {data.event.dressCode}</p>
              </div>
            )}
          </div>
          {data.event.theme && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 4, textTransform: 'uppercase' }}>Theme</p>
              <p style={{ fontSize: 16, margin: 0, color: '#d4af37' }}>✨ {data.event.theme}</p>
            </div>
          )}
        </div>

        {/* Budget Section */}
        {data.permissions.viewBudget && data.budget && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>💰 Budget Overview</h2>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Expected Income</p>
                <p style={{ color: '#22c55e', fontSize: 20, fontWeight: 700, margin: 0 }}>{formatCurrency(data.budget.summary?.total_estimated_income || 0)}</p>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Expected Expenses</p>
                <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 700, margin: 0 }}>{formatCurrency(data.budget.summary?.total_estimated_expenses || 0)}</p>
              </div>
              <div style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Paid</p>
                <p style={{ color: '#60a5fa', fontSize: 20, fontWeight: 700, margin: 0 }}>{data.budget.summary?.paid_count || 0} items</p>
              </div>
            </div>

            {/* Budget Items */}
            {data.budget.items.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888', fontWeight: 500 }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888', fontWeight: 500 }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888', fontWeight: 500 }}>Estimated</th>
                      <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888', fontWeight: 500 }}>Actual</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#888', fontWeight: 500 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.budget.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 8px' }}>{item.icon} {item.category}</td>
                        <td style={{ padding: '12px 8px', color: '#ccc' }}>{item.description}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: item.isIncome ? '#22c55e' : '#ef4444' }}>{formatCurrency(item.estimatedAmount)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: item.isIncome ? '#22c55e' : '#ef4444' }}>{formatCurrency(item.actualAmount)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <span style={{ padding: '4px 8px', borderRadius: 4, fontSize: 12, background: item.isPaid ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)', color: item.isPaid ? '#22c55e' : '#fbbf24' }}>
                            {item.isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Timeline Section */}
        {data.permissions.viewTimeline && data.timeline && data.timeline.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>📋 Event Timeline</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.timeline.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, padding: 16, background: item.is_critical ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)', borderRadius: 12, border: item.is_critical ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent' }}>
                  <div style={{ minWidth: 80, color: '#d4af37', fontWeight: 600 }}>{formatTime(item.time)}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>{item.title} {item.is_critical && <span style={{ color: '#ef4444' }}>⚠️</span>}</p>
                    {item.description && <p style={{ color: '#888', fontSize: 14, margin: '4px 0 0' }}>{item.description}</p>}
                    {item.location && <p style={{ color: '#666', fontSize: 12, margin: '4px 0 0' }}>📍 {item.location}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist Section */}
        {data.permissions.viewTimeline && data.checklist && data.checklist.items.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>✅ Planning Checklist</h2>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>{data.checklist.completed} of {data.checklist.total} tasks completed</p>
            <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 20 }}>
              <div style={{ width: `${(data.checklist.completed / data.checklist.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 4 }} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {data.checklist.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                  <span style={{ color: item.is_completed ? '#22c55e' : '#666' }}>{item.is_completed ? '✓' : '○'}</span>
                  <span style={{ flex: 1, color: item.is_completed ? '#888' : '#fff', textDecoration: item.is_completed ? 'line-through' : 'none' }}>{item.item}</span>
                  <span style={{ fontSize: 12, color: '#666' }}>{item.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff Section */}
        {data.permissions.viewStaff && data.staff && data.staff.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>👥 Event Staff</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {data.staff.map((member, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #d4af37, #b8860b)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, overflow: 'hidden' }}>
                    {member.photo_url ? <img src={member.photo_url} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : member.name.charAt(0)}
                  </div>
                  <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{member.name}</p>
                  <p style={{ color: '#d4af37', fontSize: 14, margin: 0 }}>{member.role}</p>
                  {member.shift_start && <p style={{ color: '#666', fontSize: 12, marginTop: 8 }}>{formatTime(member.shift_start)} - {formatTime(member.shift_end)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vendors Section */}
        {data.permissions.viewVendors && data.vendors && data.vendors.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>🏢 Vendors & Contractors</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {data.vendors.map((vendor, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>{vendor.name}</p>
                    <p style={{ color: '#888', fontSize: 14, margin: '4px 0 0' }}>{vendor.category} • {vendor.contract_title}</p>
                  </div>
                  <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, background: vendor.status === 'signed' ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)', color: vendor.status === 'signed' ? '#22c55e' : '#fbbf24' }}>
                    {vendor.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 40 }}>
        <p style={{ color: '#666', fontSize: 14, margin: 0 }}>Powered by <span style={{ color: '#d4af37' }}>Berry Bly Productions</span></p>
        <p style={{ color: '#444', fontSize: 12, marginTop: 8 }}>This portal is secure and only accessible with your unique link</p>
      </footer>
    </div>
  );
}

function App() {
  // Check if we're on a client portal URL
  const clientMatch = window.location.pathname.match(/^\/client\/([a-zA-Z0-9]+)$/);
  if (clientMatch) {
    return <ClientPortalView token={clientMatch[1]} />;
  }

  // Auth hooks
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<ConfirmationModal>({ show: false, guests: [], category: null, emailOnly: false });
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('overview');
  const [guestTab, setGuestTab] = useState<'pending' | 'all'>('pending');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', instagram: '', partySize: 1, eventDate: '', notes: '' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // New state for enhanced features
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    category: 'all',
    emailStatus: 'all',
    dateFrom: '',
    dateTo: '',
    scoreMin: 0,
    scoreMax: 100,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Pro features state
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [qrModal, setQRModal] = useState<QRModal>({ show: false, guest: null });
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // New modules state
  const [models, setModels] = useState<Model[]>([]);
  const [modelStats, setModelStats] = useState({ total: 0, pending: 0, approved: 0, assigned: 0, declined: 0, avgScore: 0 });
  const [modelTab, setModelTab] = useState<'pending' | 'approved' | 'assigned' | 'all'>('pending');
  const [tables, setTables] = useState<TableReservation[]>([]);
  const [tableStats, setTableStats] = useState({ total: 0, pending: 0, confirmed: 0, revenue: 0 });
  const [tableZone, setTableZone] = useState<'all' | 'VIP' | 'Premium' | 'Standard' | 'Lounge'>('all');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketStats, setTicketStats] = useState({ total: 0, valid: 0, used: 0, revenue: 0 });
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorStats, setSponsorStats] = useState({ total: 0, pending: 0, active: 0, revenue: 0 });
  const [selectedSponsor, setSelectedSponsor] = useState<Sponsor | null>(null);
  const [showFlyerGenerator, setShowFlyerGenerator] = useState(false);

  // Events state
  const [events, setEvents] = useState<Event[]>([]);
  const [eventStats, setEventStats] = useState({ total: 0, planning: 0, confirmed: 0, completed: 0, upcoming: 0, thisMonth: 0 });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormData, setEventFormData] = useState({ name: '', eventDate: '', eventType: 'party', venueName: '', venueCity: '', expectedAttendance: '', dressCode: '', theme: '', notes: '' });

  // Budget state
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetSummary, setBudgetSummary] = useState({ totalBudget: 0, totalEstimatedExpenses: 0, totalActualExpenses: 0, totalEstimatedIncome: 0, totalActualIncome: 0, estimatedProfit: 0, actualProfit: 0, budgetRemaining: 0, paidCount: 0, pendingCount: 0 });
  const [showBudgetItemForm, setShowBudgetItemForm] = useState(false);
  const [budgetItemFormData, setBudgetItemFormData] = useState({ categoryId: '', description: '', vendorName: '', estimatedAmount: '', actualAmount: '', isPaid: false, dueDate: '', notes: '' });

  // Vendors state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [vendorFormData, setVendorFormData] = useState({ name: '', category: '', contactName: '', email: '', phone: '', website: '', city: '', notes: '', isPreferred: false });

  // Staff state
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [staffStats, setStaffStats] = useState({ active: 0, inactive: 0, total: 0, avgRating: 0 });
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffFormData, setStaffFormData] = useState({
    name: '', email: '', phone: '', role: '', secondaryRole: '', photoUrl: '', instagram: '',
    hourlyRate: '', dayRate: '', experienceLevel: 'intermediate', skills: '', notes: '',
    emergencyContact: '', emergencyPhone: ''
  });
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Integrations state
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [integrationFormData, setIntegrationFormData] = useState({ apiKey: '', apiSecret: '', serverPrefix: '' });
  const [integrationLoading, setIntegrationLoading] = useState<string | null>(null);
  const [mailchimpAudiences, setMailchimpAudiences] = useState<{id: string, name: string, memberCount: number}[]>([]);

  // Client Portal state
  const [clientAccesses, setClientAccesses] = useState<ClientAccess[]>([]);
  const [showClientAccessForm, setShowClientAccessForm] = useState(false);
  const [clientAccessFormData, setClientAccessFormData] = useState({
    clientName: '', clientEmail: '', expiresInDays: '30',
    viewBudget: true, viewTimeline: true, viewStaff: false, viewVendors: false
  });

  // Monitoring state
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<string | null>(null);

  // Collapsible menu state
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['main', 'intelligence']));
  const toggleMenu = (menu: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(menu)) next.delete(menu);
      else next.add(menu);
      return next;
    });
  };

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}`);
      const responseData = await res.json();

      // Handle berry-bly API response format: { entries: [...], total, limit, offset }
      const data = responseData.entries || responseData.data || responseData;

      // Transform berry-bly API data to Dashboard Guest format
      const transformedData = Array.isArray(data) ? data.map((g: any) => ({
        id: String(g.id),
        name: g.name || '',
        email: g.email || '',
        phone: g.phone || '',
        instagram: g.instagram || '',
        partySize: g.numberOfGuests || g.partySize || g.number_of_guests || 1,
        eventDate: g.eventDate || g.event_date || new Date().toISOString(),
        notes: g.notes || g.vipPreferences || '',
        category: g.category || statusToCategory(g.status),
        status: g.status,
        emailSent: g.emailSent || g.email_sent || false,
        emailSentAt: g.emailSentAt || g.email_sent_at,
        createdAt: g.createdAt || g.created_at || new Date().toISOString(),
        checkedInAt: g.checkedInAt || g.checked_in_at,
        eventId: g.eventId || g.event_id,
      })) : [];

      // Calculate AI scores for all guests
      const guestsWithScores = transformedData.map((g: Guest) => ({
        ...g,
        aiScore: calculateAIScore(g),
      }));
      setGuests(guestsWithScores);
    } catch (error) {
      console.error('Error fetching guests:', error);
      addToast('Error loading guests', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuests();
    const interval = autoRefresh ? setInterval(() => {
      fetchGuests();
      setLastRefresh(new Date());
    }, 10000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [fetchGuests, autoRefresh]);

  // Fetch Models
  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/models`),
        fetch(`${API_URL}/models/stats`)
      ]);
      const modelsData = await modelsRes.json();
      const statsData = await statsRes.json();
      setModels(modelsData.models || []);
      setModelStats(statsData);
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  }, []);

  // Fetch Tables
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/table-reservations`);
      const data = await res.json();
      const reservations = (data.reservations || data || []).map((r: any) => ({
        ...r,
        zone: r.zone || 'Standard',
        tableName: r.tableName || `Table ${r.tableId}`,
      }));
      setTables(reservations);
      setTableStats({
        total: reservations.length,
        pending: reservations.filter((r: TableReservation) => r.status === 'pending').length,
        confirmed: reservations.filter((r: TableReservation) => r.status === 'confirmed').length,
        revenue: reservations.filter((r: TableReservation) => r.status === 'confirmed').reduce((sum: number, r: TableReservation) => sum + (r.minimumSpend || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  }, []);

  // Fetch Tickets
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tickets`);
      const data = await res.json();
      const ticketList = data.tickets || data || [];
      setTickets(ticketList);
      setTicketStats({
        total: ticketList.length,
        valid: ticketList.filter((t: Ticket) => t.status === 'valid').length,
        used: ticketList.filter((t: Ticket) => t.status === 'used').length,
        revenue: ticketList.reduce((sum: number, t: Ticket) => sum + (t.price || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, []);

  // Fetch Integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations`);
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  }, []);

  // Save Integration Config
  const saveIntegrationConfig = async (provider: string) => {
    setIntegrationLoading(provider);
    try {
      const extraConfig: Record<string, string> = {};
      if (provider === 'mailchimp' && integrationFormData.serverPrefix) {
        extraConfig.server_prefix = integrationFormData.serverPrefix;
      }

      const res = await fetch(`${API_URL}/integrations/${provider}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: integrationFormData.apiKey,
          apiSecret: integrationFormData.apiSecret || undefined,
          extraConfig
        })
      });

      const data = await res.json();
      if (data.success) {
        addToast('Configuration saved! Click Test Connection to verify.', 'success');
        fetchIntegrations();
        setIntegrationFormData({ apiKey: '', apiSecret: '', serverPrefix: '' });
      } else {
        addToast(data.error || 'Failed to save', 'error');
      }
    } catch (error) {
      addToast('Failed to save configuration', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  };

  // Test Integration Connection
  const testIntegration = async (provider: string) => {
    setIntegrationLoading(provider);
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}/test`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || 'Connected successfully!', 'success');
      } else {
        addToast(data.message || 'Connection failed', 'error');
      }
      fetchIntegrations();
    } catch (error) {
      addToast('Connection test failed', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  };

  // Sync with Integration
  const syncIntegration = async (provider: string, options?: Record<string, string>) => {
    setIntegrationLoading(provider);
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || 'Sync completed!', 'success');
        // Refresh relevant data
        if (provider === 'eventbrite') {
          fetchTickets();
          fetchEvents();
        }
      } else {
        addToast(data.error || 'Sync failed', 'error');
      }
    } catch (error) {
      addToast('Sync failed', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  };

  // Disconnect Integration
  const disconnectIntegration = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) return;

    setIntegrationLoading(provider);
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        addToast(`${provider} disconnected`, 'success');
        fetchIntegrations();
        setSelectedIntegration(null);
      } else {
        addToast(data.error || 'Failed to disconnect', 'error');
      }
    } catch (error) {
      addToast('Failed to disconnect', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  };

  // Fetch Mailchimp Audiences
  const fetchMailchimpAudiences = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/mailchimp/audiences`);
      const data = await res.json();
      setMailchimpAudiences(data.audiences || []);
    } catch (error) {
      console.error('Error fetching audiences:', error);
    }
  };

  // Fetch Sponsors
  const fetchSponsors = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sponsors`);
      const data = await res.json();
      const sponsorList = data.submissions || data || [];
      setSponsors(sponsorList);
      setSponsorStats({
        total: sponsorList.length,
        pending: sponsorList.filter((s: Sponsor) => s.status === 'pending').length,
        active: sponsorList.filter((s: Sponsor) => s.status === 'active').length,
        revenue: sponsorList.filter((s: Sponsor) => s.status === 'active').reduce((sum: number, s: Sponsor) => sum + (s.tierPrice || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching sponsors:', error);
    }
  }, []);

  // Delete Sponsor
  const deleteSponsor = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this sponsor?')) return;
    try {
      const res = await fetch(`${API_URL}/sponsors/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchSponsors();
        addToast('Sponsor deleted successfully', 'success');
      } else {
        console.error('Error deleting sponsor');
        addToast('Failed to delete sponsor', 'error');
      }
    } catch (error) {
      console.error('Error deleting sponsor:', error);
      addToast('Failed to delete sponsor', 'error');
    }
  }, [fetchSponsors]);

  // Update Sponsor (approve, logo, etc.)
  const updateSponsor = useCallback(async (id: string, updates: { status?: string; logoUrl?: string; notes?: string }) => {
    try {
      const res = await fetch(`${API_URL}/sponsors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setSponsors(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
        if (updates.status === 'approved') {
          addToast(`Sponsor approved! Email sent to ${updated.email}`, 'success');
        } else if (updates.logoUrl) {
          addToast('Logo uploaded successfully', 'success');
        } else {
          addToast('Sponsor updated', 'success');
        }
        fetchSponsors();
        return updated;
      } else {
        addToast('Failed to update sponsor', 'error');
      }
    } catch (error) {
      console.error('Error updating sponsor:', error);
      addToast('Failed to update sponsor', 'error');
    }
  }, [fetchSponsors]);

  // Handle logo upload (converts to base64)
  const handleLogoUpload = useCallback(async (sponsorId: string, file: File) => {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const logoUrl = e.target?.result as string;
        await updateSponsor(sponsorId, { logoUrl });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }, [updateSponsor]);

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/events`),
        fetch(`${API_URL}/events/stats`)
      ]);
      const eventsData = await eventsRes.json();
      const statsData = await statsRes.json();
      setEvents(eventsData.events || []);
      setEventStats({
        total: parseInt(statsData.total) || 0,
        planning: parseInt(statsData.planning) || 0,
        confirmed: parseInt(statsData.confirmed) || 0,
        completed: parseInt(statsData.completed) || 0,
        upcoming: parseInt(statsData.upcoming) || 0,
        thisMonth: parseInt(statsData.thisMonth) || 0,
      });
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, []);

  // Create Event
  const createEvent = useCallback(async () => {
    if (!eventFormData.name || !eventFormData.eventDate) {
      addToast('Name and date are required', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventFormData.name,
          eventDate: eventFormData.eventDate,
          eventType: eventFormData.eventType,
          venueName: eventFormData.venueName,
          venueCity: eventFormData.venueCity,
          expectedAttendance: eventFormData.expectedAttendance ? parseInt(eventFormData.expectedAttendance) : null,
          dressCode: eventFormData.dressCode,
          theme: eventFormData.theme,
          notes: eventFormData.notes,
        }),
      });
      if (res.ok) {
        const newEvent = await res.json();
        setEvents(prev => [newEvent, ...prev]);
        setShowEventForm(false);
        setEventFormData({ name: '', eventDate: '', eventType: 'party', venueName: '', venueCity: '', expectedAttendance: '', dressCode: '', theme: '', notes: '' });
        addToast('Event created successfully!', 'success');
        fetchEvents();
      }
    } catch (error) {
      console.error('Error creating event:', error);
      addToast('Failed to create event', 'error');
    }
  }, [eventFormData, fetchEvents]);

  // Update Event Status
  const updateEventStatus = useCallback(async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchEvents();
        addToast(`Event ${status}`, 'success');
      }
    } catch (error) {
      console.error('Error updating event:', error);
    }
  }, [fetchEvents]);

  // Fetch Budget for Event
  const fetchBudget = useCallback(async (eventId: number) => {
    try {
      const [budgetRes, categoriesRes] = await Promise.all([
        fetch(`${API_URL}/events/${eventId}/budget`),
        fetch(`${API_URL}/budget-categories`)
      ]);
      const budgetData = await budgetRes.json();
      const categoriesData = await categoriesRes.json();
      setBudgetItems(budgetData.items || []);
      setBudgetSummary({
        totalBudget: budgetData.summary?.totalBudget || 0,
        totalEstimatedExpenses: budgetData.summary?.totalEstimatedExpenses || 0,
        totalActualExpenses: budgetData.summary?.totalActualExpenses || 0,
        totalEstimatedIncome: budgetData.summary?.totalEstimatedIncome || 0,
        totalActualIncome: budgetData.summary?.totalActualIncome || 0,
        estimatedProfit: budgetData.summary?.estimatedProfit || 0,
        actualProfit: budgetData.summary?.actualProfit || 0,
        budgetRemaining: budgetData.summary?.budgetRemaining || 0,
        paidCount: budgetData.summary?.paidCount || 0,
        pendingCount: budgetData.summary?.pendingCount || 0,
      });
      setBudgetCategories(categoriesData.categories || []);
    } catch (error) {
      console.error('Error fetching budget:', error);
    }
  }, []);

  // Add Budget Item
  const addBudgetItem = useCallback(async () => {
    if (!selectedEvent || !budgetItemFormData.description) {
      addToast('Description is required', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/events/${selectedEvent.id}/budget/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: budgetItemFormData.categoryId ? parseInt(budgetItemFormData.categoryId) : null,
          description: budgetItemFormData.description,
          vendorName: budgetItemFormData.vendorName,
          estimatedAmount: budgetItemFormData.estimatedAmount ? parseFloat(budgetItemFormData.estimatedAmount) : 0,
          actualAmount: budgetItemFormData.actualAmount ? parseFloat(budgetItemFormData.actualAmount) : null,
          isPaid: budgetItemFormData.isPaid,
          dueDate: budgetItemFormData.dueDate || null,
          notes: budgetItemFormData.notes,
        }),
      });
      if (res.ok) {
        fetchBudget(selectedEvent.id);
        setShowBudgetItemForm(false);
        setBudgetItemFormData({ categoryId: '', description: '', vendorName: '', estimatedAmount: '', actualAmount: '', isPaid: false, dueDate: '', notes: '' });
        addToast('Budget item added!', 'success');
      }
    } catch (error) {
      console.error('Error adding budget item:', error);
      addToast('Failed to add budget item', 'error');
    }
  }, [selectedEvent, budgetItemFormData, fetchBudget]);

  // Toggle Budget Item Paid
  const toggleBudgetItemPaid = useCallback(async (itemId: number, isPaid: boolean) => {
    try {
      await fetch(`${API_URL}/budget/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid, paidDate: isPaid ? new Date().toISOString().split('T')[0] : null }),
      });
      if (selectedEvent) fetchBudget(selectedEvent.id);
    } catch (error) {
      console.error('Error updating budget item:', error);
    }
  }, [selectedEvent, fetchBudget]);

  // Fetch Vendors
  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vendors`);
      const data = await res.json();
      setVendors(data.vendors || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  }, []);

  // Create Vendor
  const createVendor = useCallback(async () => {
    if (!vendorFormData.name) {
      addToast('Vendor name is required', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendorFormData),
      });
      if (res.ok) {
        fetchVendors();
        setShowVendorForm(false);
        setVendorFormData({ name: '', category: '', contactName: '', email: '', phone: '', website: '', city: '', notes: '', isPreferred: false });
        addToast('Vendor added!', 'success');
      }
    } catch (error) {
      console.error('Error creating vendor:', error);
      addToast('Failed to add vendor', 'error');
    }
  }, [vendorFormData, fetchVendors]);

  // Delete Vendor
  const deleteVendor = useCallback(async (vendorId: string | number) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;
    try {
      const res = await fetch(`${API_URL}/vendors/${vendorId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchVendors();
        addToast('Vendor deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting vendor:', error);
      addToast('Failed to delete vendor', 'error');
    }
  }, [fetchVendors]);

  // Fetch Staff
  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/staff`);
      const data = await res.json();
      setStaffMembers(data.staff || []);
      setStaffStats({
        active: parseInt(data.stats?.active) || 0,
        inactive: parseInt(data.stats?.inactive) || 0,
        total: parseInt(data.stats?.total) || 0,
        avgRating: parseFloat(data.stats?.avg_rating) || 0
      });
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }, []);

  // Create Staff
  const createStaff = useCallback(async () => {
    if (!staffFormData.name || !staffFormData.role) {
      addToast('Staff name and role are required', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...staffFormData,
          hourlyRate: staffFormData.hourlyRate ? parseFloat(staffFormData.hourlyRate) : null,
          dayRate: staffFormData.dayRate ? parseFloat(staffFormData.dayRate) : null,
          skills: staffFormData.skills ? staffFormData.skills.split(',').map(s => s.trim()) : []
        }),
      });
      if (res.ok) {
        fetchStaff();
        setShowStaffForm(false);
        setStaffFormData({
          name: '', email: '', phone: '', role: '', secondaryRole: '', photoUrl: '', instagram: '',
          hourlyRate: '', dayRate: '', experienceLevel: 'intermediate', skills: '', notes: '',
          emergencyContact: '', emergencyPhone: ''
        });
        addToast('Staff member added!', 'success');
      }
    } catch (error) {
      console.error('Error creating staff:', error);
      addToast('Failed to add staff member', 'error');
    }
  }, [staffFormData, fetchStaff]);

  // Delete Staff
  const deleteStaff = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const res = await fetch(`${API_URL}/staff/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchStaff();
        setSelectedStaff(null);
        addToast('Staff member deleted', 'success');
      }
    } catch (error) {
      console.error('Error deleting staff:', error);
      addToast('Failed to delete staff member', 'error');
    }
  }, [fetchStaff]);

  // Fetch Client Accesses for an event
  const fetchClientAccesses = useCallback(async (eventId: number) => {
    try {
      const res = await fetch(`${API_URL}/events/${eventId}/client-access`);
      const data = await res.json();
      setClientAccesses(data.clients || []);
    } catch (error) {
      console.error('Error fetching client accesses:', error);
    }
  }, []);

  // Create Client Access
  const createClientAccess = useCallback(async () => {
    if (!selectedEvent || !clientAccessFormData.clientName || !clientAccessFormData.clientEmail) {
      addToast('Client name and email are required', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/events/${selectedEvent.id}/client-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientAccessFormData.clientName,
          clientEmail: clientAccessFormData.clientEmail,
          expiresInDays: parseInt(clientAccessFormData.expiresInDays) || null,
          permissions: {
            viewBudget: clientAccessFormData.viewBudget,
            viewTimeline: clientAccessFormData.viewTimeline,
            viewStaff: clientAccessFormData.viewStaff,
            viewVendors: clientAccessFormData.viewVendors
          }
        }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchClientAccesses(selectedEvent.id);
        setShowClientAccessForm(false);
        setClientAccessFormData({
          clientName: '', clientEmail: '', expiresInDays: '30',
          viewBudget: true, viewTimeline: true, viewStaff: false, viewVendors: false
        });
        // Copy URL to clipboard
        if (data.portalUrl) {
          navigator.clipboard.writeText(data.portalUrl);
          addToast('Client portal created! URL copied to clipboard', 'success');
        } else {
          addToast('Client portal access created!', 'success');
        }
      }
    } catch (error) {
      console.error('Error creating client access:', error);
      addToast('Failed to create client access', 'error');
    }
  }, [selectedEvent, clientAccessFormData, fetchClientAccesses]);

  // Revoke Client Access
  const revokeClientAccess = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to revoke this client access?')) return;
    try {
      const res = await fetch(`${API_URL}/client-access/${id}`, { method: 'DELETE' });
      if (res.ok && selectedEvent) {
        fetchClientAccesses(selectedEvent.id);
        addToast('Client access revoked', 'success');
      }
    } catch (error) {
      console.error('Error revoking client access:', error);
      addToast('Failed to revoke access', 'error');
    }
  }, [selectedEvent, fetchClientAccesses]);

  // Fetch Health Status
  const fetchHealthStatus = useCallback(async () => {
    setIsLoadingHealth(true);
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/health/deep`),
        fetch(`${API_URL}/health/status`)
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealthStatus(healthData);
        setLastHealthCheck(new Date().toISOString());
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setServerStatus(statusData);
      }
    } catch (error) {
      console.error('Error fetching health status:', error);
      setHealthStatus({
        status: 'critical',
        timestamp: new Date().toISOString(),
        uptime: 0,
        responseTime: 0,
        components: {
          database: { status: 'error', error: 'Unable to connect' },
          tables: { status: 'unknown', total: 0, existing: 0, missing: [] },
          data: { status: 'unknown', counts: {} },
          memory: { status: 'unknown', heapUsed: '0 MB', heapTotal: '0 MB', percentage: 0 },
          email: { status: 'unknown', from: '', adminEmail: '' },
          environment: { status: 'unknown', nodeEnv: '', port: 0, missingVariables: [] }
        },
        issues: ['Backend server is unreachable']
      });
    } finally {
      setIsLoadingHealth(false);
    }
  }, []);

  // Send Test Alert
  const sendTestAlert = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/health/test-alert`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast('Test alert sent to admin email!', 'success');
      } else {
        addToast('Failed to send test alert', 'error');
      }
    } catch (error) {
      console.error('Error sending test alert:', error);
      addToast('Failed to send test alert', 'error');
    }
  }, []);

  // Flyer ref for html-to-image
  const flyerRef = useRef<HTMLDivElement>(null);

  // Generate and download flyer
  const downloadFlyer = useCallback(async () => {
    if (!flyerRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(flyerRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#000',
      });
      const link = document.createElement('a');
      link.download = `berry-bly-event-flyer-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      addToast('Flyer downloaded!', 'success');
    } catch (error) {
      console.error('Error generating flyer:', error);
      addToast('Failed to generate flyer', 'error');
    }
  }, []);

  // Fetch new modules when view changes
  useEffect(() => {
    if (activeView === 'models') fetchModels();
    if (activeView === 'tables') fetchTables();
    if (activeView === 'tickets') fetchTickets();
    if (activeView === 'sponsors') fetchSponsors();
    if (activeView === 'events') fetchEvents();
    if (activeView === 'vendors') fetchVendors();
    if (activeView === 'staff') fetchStaff();
    if (activeView === 'budget' && selectedEvent) fetchBudget(selectedEvent.id);
    if (activeView === 'monitoring') fetchHealthStatus();
    if (activeView === 'integrations') fetchIntegrations();
  }, [activeView, fetchModels, fetchTables, fetchTickets, fetchSponsors, fetchEvents, fetchVendors, fetchStaff, fetchBudget, fetchHealthStatus, fetchIntegrations, selectedEvent]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Cmd/Ctrl + K: Search focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowFilters(true);
      }
      // G then O: Go to Overview
      if (e.key === 'g') {
        const handleSecondKey = (e2: KeyboardEvent) => {
          if (e2.key === 'o') navigateTo('overview');
          if (e2.key === 'g') navigateTo('guests');
          if (e2.key === 'e') navigateTo('emails');
          if (e2.key === 'a') navigateTo('analytics');
          if (e2.key === 'c') navigateTo('checkin');
          document.removeEventListener('keydown', handleSecondKey);
        };
        document.addEventListener('keydown', handleSecondKey, { once: true });
        setTimeout(() => document.removeEventListener('keydown', handleSecondKey), 500);
      }
      // N: New guest
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        setShowForm(true);
      }
      // Escape: Close modals
      if (e.key === 'Escape') {
        setShowForm(false);
        setShowFilters(false);
        setQRModal({ show: false, guest: null });
        setConfirmation({ show: false, guests: [], category: null, emailOnly: false });
      }
      // R: Refresh
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        fetchGuests();
        setLastRefresh(new Date());
        addToast('Data refreshed', 'info');
      }
      // T: Toggle theme
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fetchGuests]);

  // Check-in guest function
  const checkInGuest = async (guest: Guest) => {
    try {
      const checkedInAt = new Date().toISOString();
      // berry-bly uses PATCH - mark as approved and add check-in note
      const response = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          notes: `Checked in at ${new Date().toLocaleString()}`
        }),
      });
      if (response.ok) {
        setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, checkedInAt, category: 'A' } : g));
        addToast(`${guest.name} checked in!`, 'success');
      }
    } catch (error) {
      addToast('Check-in failed', 'error');
    }
  };

  // Show QR code for guest
  const showGuestQR = (guest: Guest) => {
    setQRModal({ show: true, guest });
  };

  const closeSidebar = () => setSidebarOpen(false);

  const navigateTo = (view: ViewType) => {
    setActiveView(view);
    setSelectedGuests(new Set());
    setSidebarOpen(false);
  };

  // Enhanced Stats with more metrics
  const stats = useMemo(() => {
    const total = guests.length;
    const pending = guests.filter((g) => g.category === 'pending').length;
    const vip = guests.filter((g) => g.category === 'A').length;
    const priority = guests.filter((g) => g.category === 'B').length;
    const standard = guests.filter((g) => g.category === 'C').length;
    const emailsSent = guests.filter((g) => g.emailSent).length;
    const accepted = vip + priority + standard;
    const avgScore = guests.length > 0 ? Math.round(guests.reduce((sum, g) => sum + (g.aiScore || 0), 0) / guests.length) : 0;
    const highScoreGuests = guests.filter((g) => (g.aiScore || 0) >= 70).length;
    const totalPartySize = guests.reduce((sum, g) => sum + g.partySize, 0);
    const conversionRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    const emailRate = total > 0 ? Math.round((emailsSent / total) * 100) : 0;
    // Check-in stats
    const checkedIn = guests.filter((g) => g.checkedInAt).length;
    const checkedInPartySize = guests.filter(g => g.checkedInAt).reduce((sum, g) => sum + g.partySize, 0);
    const checkInRate = accepted > 0 ? Math.round((checkedIn / accepted) * 100) : 0;
    // Featured/Hot stats
    const featured = guests.filter((g) => g.isFeatured).length;

    return {
      total, pending, vip, priority, standard, emailsSent, accepted,
      avgScore, highScoreGuests, totalPartySize, conversionRate, emailRate,
      checkedIn, checkedInPartySize, checkInRate, featured,
    };
  }, [guests]);

  // Filtered guests based on search and filters
  const filteredGuests = useMemo(() => {
    let result = [...guests];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter((g) =>
        g.name.toLowerCase().includes(search) ||
        g.email.toLowerCase().includes(search) ||
        g.instagram.toLowerCase().includes(search) ||
        g.phone.includes(search)
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      result = result.filter((g) => g.category === filters.category);
    }

    // Email status filter
    if (filters.emailStatus === 'sent') {
      result = result.filter((g) => g.emailSent);
    } else if (filters.emailStatus === 'not_sent') {
      result = result.filter((g) => !g.emailSent);
    }

    // Date filters
    if (filters.dateFrom) {
      result = result.filter((g) => new Date(g.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      result = result.filter((g) => new Date(g.createdAt) <= new Date(filters.dateTo));
    }

    // Score filter
    result = result.filter((g) => {
      const score = g.aiScore || 0;
      return score >= filters.scoreMin && score <= filters.scoreMax;
    });

    return result;
  }, [guests, filters]);

  // Get guests for current view
  const getFilteredGuests = (): Guest[] => {
    let baseList = filteredGuests;

    switch (activeView) {
      case 'emails':
        return baseList.filter((g) => g.emailSent);
      case 'vip':
        return baseList.filter((g) => g.category === 'A');
      case 'priority':
        return baseList.filter((g) => g.category === 'B');
      case 'standard':
        return baseList.filter((g) => g.category === 'C');
      case 'guests':
        return guestTab === 'pending'
          ? baseList.filter((g) => g.category === 'pending')
          : baseList.filter((g) => g.category !== 'pending');
      default:
        return baseList;
    }
  };

  const currentList = getFilteredGuests();

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Instagram', 'Party Size', 'Category', 'AI Score', 'Email Sent', 'Created At'];
    const rows = filteredGuests.map((g) => [
      g.name,
      g.email,
      g.phone,
      g.instagram,
      g.partySize,
      g.category === 'A' ? 'VIP' : g.category === 'B' ? 'Priority' : g.category === 'C' ? 'Standard' : 'Pending',
      g.aiScore || calculateAIScore(g),
      g.emailSent ? 'Yes' : 'No',
      new Date(g.createdAt).toLocaleDateString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `berry-guests-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported ${filteredGuests.length} guests to CSV`, 'success');
  };

  // Export to Excel with full data
  const exportToExcel = () => {
    const data = filteredGuests.map((g) => ({
      'Name': g.name,
      'Email': g.email,
      'Phone': g.phone,
      'Instagram': g.instagram,
      'Instagram Followers (Est.)': estimateFollowers(g.instagram),
      'Party Size': g.partySize,
      'Category': g.category === 'A' ? 'VIP' : g.category === 'B' ? 'Priority' : g.category === 'C' ? 'Standard' : g.category === 'rejected' ? 'Rejected' : 'Pending',
      'AI Score': g.aiScore || calculateAIScore(g),
      'Email Sent': g.emailSent ? 'Yes' : 'No',
      'Checked In': g.checkedInAt ? 'Yes' : 'No',
      'Checked In At': g.checkedInAt ? new Date(g.checkedInAt).toLocaleString() : '',
      'Created At': new Date(g.createdAt).toLocaleString(),
      'Notes': g.notes || '',
      'Total Purchases': g.purchaseHistory?.length || 0,
      'Total Spent': g.purchaseHistory?.reduce((sum, p) => sum + p.amount, 0) || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Guests');

    // Auto-fit columns
    const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `berry-guests-${new Date().toISOString().split('T')[0]}.xlsx`);
    addToast(`Exported ${filteredGuests.length} guests to Excel`, 'success');
  };

  const toggleSelect = (id: string) => {
    setSelectedGuests((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedGuests.size === currentList.length) {
      setSelectedGuests(new Set());
    } else {
      setSelectedGuests(new Set(currentList.map((g) => g.id)));
      addToast(`Selected ${currentList.length} guests`, 'info');
    }
  };

  const openModal = (guestList: Guest[], category: GuestCategory | null, emailOnly = false) => {
    if (!guestList.length) return;
    const msg = emailOnly
      ? `${guestList[0].name.split(' ')[0]}, thank you for your interest in Berry Bly. We'll be in touch soon with more details.`
      : generateAIMessage(guestList[0], category || 'C');
    setCustomMessage(msg);
    setConfirmation({ show: true, guests: guestList, category, emailOnly });
  };

  const handleBulkAction = (category: GuestCategory | null, emailOnly = false) => {
    const list = guests.filter((g) => selectedGuests.has(g.id));
    openModal(list, category, emailOnly);
  };

  const sendInvitations = async () => {
    if (!confirmation.guests.length) return;
    setSending(true);

    const successfulGuests: Guest[] = [];
    const failedGuests: string[] = [];

    try {
      for (const guest of confirmation.guests) {
        const cat = confirmation.emailOnly ? guest.category : confirmation.category;
        const msg = confirmation.guests.length === 1 ? customMessage : generateAIMessage(guest, cat || 'C');

        const response = await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}/send-invitation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, customMessage: msg, emailOnly: confirmation.emailOnly }),
        });

        if (response.ok) {
          const data = await response.json();
          successfulGuests.push(data.guest || guest);
        } else {
          failedGuests.push(guest.name);
        }
      }

      if (successfulGuests.length > 0) {
        const successIds = successfulGuests.map(g => g.id);
        if (!confirmation.emailOnly) {
          setGuests((prev) => prev.map((g) =>
            successIds.includes(g.id)
              ? { ...g, category: confirmation.category!, emailSent: true, emailSentAt: new Date().toISOString() }
              : g
          ));
        } else {
          setGuests((prev) => prev.map((g) =>
            successIds.includes(g.id)
              ? { ...g, emailSent: true, emailSentAt: new Date().toISOString() }
              : g
          ));
        }
      }

      setSelectedGuests(new Set());
      setConfirmation({ show: false, guests: [], category: null, emailOnly: false });

      if (successfulGuests.length > 0 && failedGuests.length === 0) {
        addToast(`${successfulGuests.length} invitation${successfulGuests.length > 1 ? 's' : ''} sent successfully!`, 'success');
      } else if (successfulGuests.length > 0 && failedGuests.length > 0) {
        addToast(`${successfulGuests.length} sent, ${failedGuests.length} failed.`, 'info');
      } else {
        addToast(`Failed to send emails. Resend test mode only allows sending to your own email.`, 'error');
      }

      fetchGuests();
    } catch (e) {
      console.error(e);
      addToast('Failed to send invitations', 'error');
    } finally {
      setSending(false);
    }
  };

  const moveOnly = async () => {
    if (!confirmation.guests.length || !confirmation.category) return;
    try {
      for (const guest of confirmation.guests) {
        // berry-bly uses PATCH with status
        await fetch(`${API_URL}${ENDPOINTS.guests}/${guest.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: categoryToStatus(confirmation.category) }),
        });
      }
      setGuests((prev) => prev.map((g) => (confirmation.guests.find((cg) => cg.id === g.id) ? { ...g, category: confirmation.category! } : g)));
      setSelectedGuests(new Set());
      setConfirmation({ show: false, guests: [], category: null, emailOnly: false });
      addToast(`Moved ${confirmation.guests.length} guest${confirmation.guests.length > 1 ? 's' : ''} to ${catLabel(confirmation.category)}`, 'success');
    } catch (e) {
      addToast('Failed to move guests', 'error');
    }
  };

  const removeGuest = async (id: string) => {
    const guest = guests.find((g) => g.id === id);
    try {
      await fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, { method: 'DELETE' });
      setGuests((prev) => prev.filter((g) => g.id !== id));
      addToast(`Removed ${guest?.name || 'guest'}`, 'info');
    } catch (e) {
      addToast('Failed to remove guest', 'error');
    }
  };

  const addGuest = async () => {
    if (!formData.name || !formData.email) {
      addToast('Name and email are required', 'error');
      return;
    }
    try {
      // Transform to berry-bly API format
      const berryBlyData = {
        eventId: formData.eventDate || 'default-event', // berry-bly requires eventId
        name: formData.name,
        email: formData.email,
        phone: formData.phone || '0000000000',
        instagram: formData.instagram || '@guest',
        numberOfGuests: formData.partySize || 1,
        vipPreferences: formData.notes || '',
      };

      const res = await fetch(`${API_URL}${ENDPOINTS.guests}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(berryBlyData),
      });
      const responseData = await res.json();

      // Transform berry-bly response to Dashboard Guest format
      const entry = responseData.entry || responseData;
      const newGuest: Guest = {
        id: String(entry.id),
        name: entry.name || formData.name,
        email: entry.email || formData.email,
        phone: entry.phone || formData.phone || '',
        instagram: entry.instagram || formData.instagram || '',
        partySize: entry.numberOfGuests || entry.number_of_guests || formData.partySize || 1,
        eventDate: entry.eventDate || entry.event_date || new Date().toISOString(),
        notes: entry.vipPreferences || entry.notes || formData.notes || '',
        category: statusToCategory(entry.status),
        createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
        aiScore: 0,
      };

      newGuest.aiScore = calculateAIScore(newGuest);
      setGuests((prev) => [newGuest, ...prev]);
      setFormData({ name: '', email: '', phone: '', instagram: '', partySize: 1, eventDate: '', notes: '' });
      setShowForm(false);
      addToast(`Added ${newGuest.name} to guest list`, 'success');
    } catch (e) {
      addToast('Failed to add guest', 'error');
    }
  };

  const catLabel = (c: GuestCategory | null) => ({ A: 'VIP', B: 'Priority', C: 'Standard', rejected: 'Rejected', pending: 'Pending' }[c || 'pending']);

  const getViewTitle = () => {
    switch (activeView) {
      case 'overview': return 'Overview';
      case 'emails': return 'Emails Sent';
      case 'vip': return 'VIP Guests';
      case 'priority': return 'Priority Guests';
      case 'standard': return 'Standard Guests';
      case 'analytics': return 'Analytics';
      case 'automation': return 'Automation';
      case 'checkin': return 'Check-In';
      default: return 'Guests';
    }
  };

  const getViewSubtitle = () => {
    switch (activeView) {
      case 'overview': return `${stats.total} total guests`;
      case 'emails': return `${stats.emailsSent} emails sent`;
      case 'vip': return `${stats.vip} VIP guests`;
      case 'priority': return `${stats.priority} priority guests`;
      case 'standard': return `${stats.standard} standard guests`;
      case 'analytics': return 'Performance metrics';
      case 'automation': return `${scheduledEmails.filter(e => e.status === 'pending').length} scheduled`;
      case 'checkin': return `${stats.checkedIn}/${stats.accepted} checked in (${stats.checkedInPartySize} people)`;
      default: return `${stats.pending} pending review`;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#60a5fa';
    if (score >= 40) return '#fbbf24';
    return '#ef4444';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{styles}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666', fontSize: 16 }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{styles}</style>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #fff 0%, #999 100%)', borderRadius: 8 }} />
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>Berry Bly</span>
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

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <CollapsibleMenu
            title="Main"
            expanded={expandedMenus.has('main')}
            onToggle={() => toggleMenu('main')}
            count={stats.total + stats.emailsSent}
          >
            <NavItem label="Overview" active={activeView === 'overview'} icon="◈" onClick={() => navigateTo('overview')} />
            <NavItem label="Guests" active={activeView === 'guests'} icon="◉" count={stats.total} onClick={() => navigateTo('guests')} />
            <NavItem label="Emails Sent" active={activeView === 'emails'} icon="✉" count={stats.emailsSent} onClick={() => navigateTo('emails')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Intelligence"
            expanded={expandedMenus.has('intelligence')}
            onToggle={() => toggleMenu('intelligence')}
            count={scheduledEmails.filter(e => e.status === 'pending').length}
          >
            <NavItem label="Analytics" active={activeView === 'analytics'} icon="◐" onClick={() => navigateTo('analytics')} />
            <NavItem label="Automation" active={activeView === 'automation'} icon="⚡" count={scheduledEmails.filter(e => e.status === 'pending').length} onClick={() => navigateTo('automation')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Event Day"
            expanded={expandedMenus.has('eventday')}
            onToggle={() => toggleMenu('eventday')}
            count={stats.checkedIn}
          >
            <NavItem label="Check-In" active={activeView === 'checkin'} icon="✓" count={stats.checkedIn} onClick={() => navigateTo('checkin')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Talent"
            expanded={expandedMenus.has('talent')}
            onToggle={() => toggleMenu('talent')}
            count={stats.featured}
          >
            <NavItem label="Hot/Featured" active={activeView === 'models'} icon="🔥" count={stats.featured} onClick={() => navigateTo('models')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Reservations"
            expanded={expandedMenus.has('reservations')}
            onToggle={() => toggleMenu('reservations')}
            count={tableStats.total + ticketStats.total}
          >
            <NavItem label="Tables" active={activeView === 'tables'} icon="▣" count={tableStats.total} onClick={() => navigateTo('tables')} />
            <NavItem label="Tickets" active={activeView === 'tickets'} icon="🎫" count={ticketStats.total} onClick={() => navigateTo('tickets')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Business"
            expanded={expandedMenus.has('business')}
            onToggle={() => toggleMenu('business')}
            count={sponsorStats.total}
          >
            <NavItem label="Sponsors" active={activeView === 'sponsors'} icon="◆" count={sponsorStats.total} onClick={() => navigateTo('sponsors')} />
          </CollapsibleMenu>

          <CollapsibleMenu
            title="Event Management"
            expanded={expandedMenus.has('eventmgmt')}
            onToggle={() => toggleMenu('eventmgmt')}
            count={eventStats.upcoming}
          >
            <NavItem label="All Events" active={activeView === 'events'} icon="📅" count={eventStats.total} onClick={() => navigateTo('events')} />
            <NavItem label="Budget" active={activeView === 'budget'} icon="💰" onClick={() => navigateTo('budget')} />
            <NavItem label="Vendors" active={activeView === 'vendors'} icon="🏢" count={vendors.length} onClick={() => navigateTo('vendors')} />
            <NavItem label="Staff" active={activeView === 'staff'} icon="👥" count={staffStats.total} onClick={() => navigateTo('staff')} />
          </CollapsibleMenu>

          {/* System Menu */}
          <CollapsibleMenu title="SYSTEM" expanded={expandedMenus.has('system')} onToggle={() => toggleMenu('system')}>
            <NavItem label="Monitoring" active={activeView === 'monitoring'} icon="📊" onClick={() => navigateTo('monitoring')} />
            <NavItem label="Integrations" active={activeView === 'integrations'} icon="🔌" count={integrations.filter(i => i.status === 'connected').length} onClick={() => navigateTo('integrations')} />
          </CollapsibleMenu>
        </nav>

        {/* User Info & Logout */}
        {user && (
          <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{user.email}</div>
            <div style={{ fontSize: 14, color: '#d4af37', fontWeight: 500 }}>{user.name}</div>
          </div>
        )}

        {/* Settings Row */}
        <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {theme === 'dark' ? '☀' : '◐'} {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button
            onClick={() => setAutoRefresh(prev => !prev)}
            style={{ background: autoRefresh ? '#22c55e20' : 'transparent', border: 'none', color: autoRefresh ? '#22c55e' : '#666', cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 4 }}
          >
            {autoRefresh ? '● Live' : '○ Paused'}
          </button>
        </div>

        {/* Logout Button */}
        <div style={{ padding: '12px', borderTop: '1px solid #1a1a1a' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              padding: '10px 16px',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
          >
            <span>↩</span> Logout
          </button>
        </div>

        <div style={{ padding: '16px 0', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 13, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Quick Stats</div>
          <div style={{ display: 'grid', gap: 2 }}>
            <StatRow label="VIP" value={stats.vip} color="#a78bfa" active={activeView === 'vip'} onClick={() => navigateTo('vip')} />
            <StatRow label="Priority" value={stats.priority} color="#60a5fa" active={activeView === 'priority'} onClick={() => navigateTo('priority')} />
            <StatRow label="Standard" value={stats.standard} color="#6b7280" active={activeView === 'standard'} onClick={() => navigateTo('standard')} />
          </div>
        </div>

        <div style={{ padding: '12px', background: '#0a0a0a', borderRadius: 10, border: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Avg AI Score</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: getScoreColor(stats.avgScore) }}>{stats.avgScore}</div>
          <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${stats.avgScore}%`, background: getScoreColor(stats.avgScore), borderRadius: 2 }} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content" style={{ marginLeft: 260, minHeight: '100vh' }}>
        {/* Header */}
        <header className="header-content" style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1a1a1a', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{ display: 'none', background: '#1a1a1a', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '12px 14px', borderRadius: 8, flexShrink: 0, minWidth: 44, minHeight: 44 }}
            >
              ☰
            </button>
            <div style={{ animation: 'fadeIn 0.3s ease', minWidth: 0 }}>
              <h1 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 600, margin: 0, letterSpacing: '-0.4px' }}>{getViewTitle()}</h1>
              <p style={{ fontSize: 'clamp(13px, 2vw, 15px)', color: '#666', margin: '4px 0 0' }}>{getViewSubtitle()}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Refresh indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}>
              <span style={{ color: autoRefresh ? '#22c55e' : '#666' }}>{autoRefresh ? '●' : '○'}</span>
              <span>Updated {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s ago</span>
            </div>
            {/* Keyboard shortcuts hint */}
            <button
              onClick={() => addToast('Shortcuts: N=New, R=Refresh, T=Theme, Esc=Close, G+O/G/E/A/C=Navigate', 'info')}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#666', padding: '8px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', minHeight: 36 }}
              title="Keyboard shortcuts"
              aria-label="Show keyboard shortcuts"
            >
              ⌘K
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(activeView === 'guests' || activeView === 'vip' || activeView === 'priority' || activeView === 'standard') && (
              <>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="btn-hover"
                  style={{
                    background: showFilters ? '#1a1a1a' : 'transparent',
                    color: '#888',
                    border: '1px solid #333',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ⚙ Filters
                </button>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={exportToExcel}
                    className="btn-hover"
                    style={{
                      background: '#22c55e15',
                      color: '#22c55e',
                      border: '1px solid #22c55e30',
                      padding: '10px 16px',
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    📊 Excel
                  </button>
                </div>
                <button
                  onClick={exportToCSV}
                  className="btn-hover"
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: '1px solid #333',
                    padding: '10px 16px',
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  ↓ CSV
                </button>
              </>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="btn-hover"
              style={{
                background: '#fff',
                color: '#000',
                border: 'none',
                padding: '10px 18px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
              <span className="hide-mobile">Add Guest</span>
            </button>
          </div>
        </header>

        {/* Search & Filters Bar */}
        {(activeView === 'guests' || activeView === 'vip' || activeView === 'priority' || activeView === 'standard' || activeView === 'emails') && (
          <div className="header-content" style={{ borderBottom: '1px solid #1a1a1a', background: '#050505' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 'min(200px, 100%)' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#666', fontSize: 16 }}>⌕</span>
                <input
                  type="text"
                  placeholder="Search guests..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="input-focus"
                  style={{
                    width: '100%',
                    background: '#111',
                    border: '1px solid #222',
                    borderRadius: 10,
                    padding: '12px 12px 12px 40px',
                    color: '#fff',
                    fontSize: 15,
                    outline: 'none',
                  }}
                />
              </div>
              <select
                value={filters.emailStatus}
                onChange={(e) => setFilters({ ...filters, emailStatus: e.target.value as Filters['emailStatus'] })}
                style={{
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: 8,
                  padding: '12px 16px',
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Emails</option>
                <option value="sent">Email Sent</option>
                <option value="not_sent">Not Sent</option>
              </select>
            </div>

            {showFilters && (
              <div className="filter-row" style={{ display: 'flex', gap: 12, marginTop: 16, animation: 'slideDown 0.2s ease', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6 }}>From Date</label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '10px', color: '#fff', fontSize: 14 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6 }}>To Date</label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '10px', color: '#fff', fontSize: 14 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6 }}>Min Score: {filters.scoreMin}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.scoreMin}
                    onChange={(e) => setFilters({ ...filters, scoreMin: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6 }}>Max Score: {filters.scoreMax}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.scoreMax}
                    onChange={(e) => setFilters({ ...filters, scoreMax: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </div>
                <button
                  onClick={() => setFilters({ search: '', category: 'all', emailStatus: 'all', dateFrom: '', dateTo: '', scoreMin: 0, scoreMax: 100 })}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    padding: '10px 16px',
                    color: '#888',
                    fontSize: 14,
                    cursor: 'pointer',
                    alignSelf: 'flex-end',
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Overview Page */}
        {activeView === 'overview' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <StatCard label="Total Guests" value={stats.total} icon="◉" onClick={() => navigateTo('guests')} />
              <StatCard label="Conversion Rate" value={`${stats.conversionRate}%`} icon="↗" color="#22c55e" onClick={() => navigateTo('analytics')} />
              <StatCard label="Emails Sent" value={stats.emailsSent} icon="✉" color="#3b82f6" onClick={() => navigateTo('emails')} />
              <StatCard label="Total Party Size" value={stats.totalPartySize} icon="◎" color="#a78bfa" onClick={() => navigateTo('guests')} />
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#888' }}>Guest Breakdown</h3>
            <div className="category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
              <CategoryCard label="VIP" value={stats.vip} color="#a78bfa" onClick={() => navigateTo('vip')} />
              <CategoryCard label="Priority" value={stats.priority} color="#60a5fa" onClick={() => navigateTo('priority')} />
              <CategoryCard label="Standard" value={stats.standard} color="#6b7280" onClick={() => navigateTo('standard')} />
            </div>

            {/* Top Scored Guests */}
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#888' }}>Top AI-Scored Guests</h3>
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden', marginBottom: 32 }}>
              {guests.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)).slice(0, 5).map((guest, idx) => (
                <div key={guest.id} style={{ padding: '14px 16px', borderBottom: idx < 4 ? '1px solid #1a1a1a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#666' }}>
                      {idx + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{guest.name}</div>
                      {guest.instagram ? (
                        <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#d4af37', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>@{guest.instagram.replace('@', '')}</a>
                      ) : (
                        <div style={{ fontSize: 13, color: '#666' }}>no-ig</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <StatusBadge category={guest.category} />
                    <div style={{ width: 50, textAlign: 'right' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: getScoreColor(guest.aiScore || 0) }}>{guest.aiScore || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* Analytics Page */}
        {activeView === 'analytics' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Key Metrics */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <MetricCard label="Conversion Rate" value={`${stats.conversionRate}%`} subtitle="Accepted / Total" color="#22c55e" />
              <MetricCard label="Email Rate" value={`${stats.emailRate}%`} subtitle="Emails Sent / Total" color="#3b82f6" />
              <MetricCard label="Avg AI Score" value={stats.avgScore} subtitle="Guest intelligence score" color="#a78bfa" />
              <MetricCard label="High-Value Guests" value={stats.highScoreGuests} subtitle="Score >= 70" color="#fbbf24" />
            </div>

            {/* Charts */}
            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 32 }}>
              {/* Category Distribution */}
              <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Category Distribution</h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 200, paddingBottom: 40 }}>
                  <ChartBar value={stats.pending} max={stats.total} label="Pending" color="#fbbf24" />
                  <ChartBar value={stats.vip} max={stats.total} label="VIP" color="#a78bfa" />
                  <ChartBar value={stats.priority} max={stats.total} label="Priority" color="#60a5fa" />
                  <ChartBar value={stats.standard} max={stats.total} label="Standard" color="#6b7280" />
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
                        strokeDasharray={`${(stats.emailsSent / stats.total) * 440} 440`}
                        transform="rotate(-90 80 80)"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
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

            {/* Score Distribution */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>AI Score Distribution</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingBottom: 40 }}>
                {[
                  { range: '0-20', count: guests.filter(g => (g.aiScore || 0) <= 20).length, color: '#ef4444' },
                  { range: '21-40', count: guests.filter(g => (g.aiScore || 0) > 20 && (g.aiScore || 0) <= 40).length, color: '#f97316' },
                  { range: '41-60', count: guests.filter(g => (g.aiScore || 0) > 40 && (g.aiScore || 0) <= 60).length, color: '#fbbf24' },
                  { range: '61-80', count: guests.filter(g => (g.aiScore || 0) > 60 && (g.aiScore || 0) <= 80).length, color: '#60a5fa' },
                  { range: '81-100', count: guests.filter(g => (g.aiScore || 0) > 80).length, color: '#22c55e' },
                ].map((item, idx) => (
                  <ChartBar key={idx} value={item.count} max={stats.total || 1} label={item.range} color={item.color} />
                ))}
              </div>
            </div>

            {/* Business Metrics Row */}
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#d4af37' }}>Business Metrics</h2>
            <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 24 }}>
              {/* Sponsors by Tier */}
              <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Sponsors by Tier</h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 160, paddingBottom: 40 }}>
                  <ChartBar value={sponsors.filter(s => s.tier === 'platinum').length} max={sponsorStats.total || 1} label="Platinum" color="#e5e4e2" />
                  <ChartBar value={sponsors.filter(s => s.tier === 'gold').length} max={sponsorStats.total || 1} label="Gold" color="#d4af37" />
                  <ChartBar value={sponsors.filter(s => s.tier === 'silver').length} max={sponsorStats.total || 1} label="Silver" color="#c0c0c0" />
                  <ChartBar value={sponsors.filter(s => s.tier === 'bronze').length} max={sponsorStats.total || 1} label="Bronze" color="#cd7f32" />
                </div>
              </div>

              {/* Tickets Status */}
              <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Tickets Status</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
                  <div style={{ position: 'relative', width: 140, height: 140 }}>
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      <circle cx="70" cy="70" r="60" fill="none" stroke="#1a1a1a" strokeWidth="16" />
                      <circle
                        cx="70"
                        cy="70"
                        r="60"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="16"
                        strokeDasharray={`${ticketStats.total > 0 ? (ticketStats.used / ticketStats.total) * 377 : 0} 377`}
                        transform="rotate(-90 70 70)"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{ticketStats.used}</span>
                      <span style={{ fontSize: 12, color: '#666' }}>checked in</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} />
                    <span style={{ color: '#888' }}>Used ({ticketStats.used})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a1a1a' }} />
                    <span style={{ color: '#888' }}>Valid ({ticketStats.valid})</span>
                  </div>
                </div>
              </div>

              {/* Tables by Zone */}
              <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Tables by Zone</h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 160, paddingBottom: 40 }}>
                  <ChartBar value={tables.filter(t => t.zone === 'VIP').length} max={tableStats.total || 1} label="VIP" color="#a78bfa" />
                  <ChartBar value={tables.filter(t => t.zone === 'Premium').length} max={tableStats.total || 1} label="Premium" color="#60a5fa" />
                  <ChartBar value={tables.filter(t => t.zone === 'Standard').length} max={tableStats.total || 1} label="Standard" color="#6b7280" />
                  <ChartBar value={tables.filter(t => t.zone === 'Lounge').length} max={tableStats.total || 1} label="Lounge" color="#f97316" />
                </div>
              </div>
            </div>

            {/* Revenue Overview */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <MetricCard label="Sponsor Revenue" value={`$${sponsorStats.revenue.toLocaleString()}`} subtitle="From active sponsors" color="#d4af37" />
              <MetricCard label="Ticket Revenue" value={`$${ticketStats.revenue.toLocaleString()}`} subtitle="Total ticket sales" color="#22c55e" />
              <MetricCard label="Total Guests" value={stats.totalPartySize} subtitle="Expected party size" color="#a78bfa" />
              <MetricCard label="Check-in Rate" value={`${stats.checkInRate}%`} subtitle={`${stats.checkedIn} checked in`} color="#3b82f6" />
            </div>

            {/* Pipeline Status */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, color: '#fff' }}>Guest Pipeline</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Pending', count: stats.pending, color: '#fbbf24', pct: stats.total > 0 ? (stats.pending / stats.total) * 100 : 0 },
                  { label: 'VIP', count: stats.vip, color: '#a78bfa', pct: stats.total > 0 ? (stats.vip / stats.total) * 100 : 0 },
                  { label: 'Priority', count: stats.priority, color: '#60a5fa', pct: stats.total > 0 ? (stats.priority / stats.total) * 100 : 0 },
                  { label: 'Standard', count: stats.standard, color: '#6b7280', pct: stats.total > 0 ? (stats.standard / stats.total) * 100 : 0 },
                ].map((stage, idx) => (
                  <div key={idx} style={{ flex: stage.pct || 1, height: 32, background: stage.color, borderRadius: idx === 0 ? '6px 0 0 6px' : idx === 3 ? '0 6px 6px 0' : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: stage.count > 0 ? 60 : 0, transition: 'flex 0.5s ease' }}>
                    {stage.count > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#000' }}>{stage.count}</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {[
                  { label: 'Pending', color: '#fbbf24' },
                  { label: 'VIP', color: '#a78bfa' },
                  { label: 'Priority', color: '#60a5fa' },
                  { label: 'Standard', color: '#6b7280' },
                ].map((stage, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: stage.color }} />
                    <span style={{ fontSize: 12, color: '#888' }}>{stage.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Automation Page */}
        {activeView === 'automation' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Scheduled Emails</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6' }}>{scheduledEmails.filter(e => e.status === 'pending').length}</div>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Sent Today</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>
                  {guests.filter(g => g.emailSentAt && new Date(g.emailSentAt).toDateString() === new Date().toDateString()).length}
                </div>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>Pending Followups</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{guests.filter(g => g.emailSent && !g.category.match(/A|B|C/)).length}</div>
              </div>
            </div>

            {/* Quick Actions */}
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#888' }}>Quick Automation Actions</h3>
            <div className="category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <button
                onClick={() => {
                  const pending = guests.filter(g => g.category === 'pending' && !g.emailSent);
                  if (pending.length > 0) {
                    openModal(pending, null, true);
                  } else {
                    addToast('No pending guests without emails', 'info');
                  }
                }}
                className="btn-hover"
                style={{ background: '#3b82f615', border: '1px solid #3b82f630', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontSize: 24, marginBottom: 12 }}>✉</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>Send to All Pending</div>
                <div style={{ fontSize: 13, color: '#666' }}>Email {guests.filter(g => g.category === 'pending' && !g.emailSent).length} pending guests</div>
              </button>
              <button
                onClick={() => {
                  const highScore = guests.filter(g => (g.aiScore || 0) >= 70 && g.category === 'pending');
                  if (highScore.length > 0) {
                    openModal(highScore, 'A');
                  } else {
                    addToast('No high-score pending guests', 'info');
                  }
                }}
                className="btn-hover"
                style={{ background: '#a78bfa15', border: '1px solid #a78bfa30', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontSize: 24, marginBottom: 12 }}>⭐</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}>Auto-VIP High Scores</div>
                <div style={{ fontSize: 13, color: '#666' }}>Move {guests.filter(g => (g.aiScore || 0) >= 70 && g.category === 'pending').length} guests to VIP</div>
              </button>
              <button
                onClick={() => {
                  const needFollowup = guests.filter(g => g.emailSent && new Date(g.emailSentAt!).getTime() < Date.now() - 3 * 24 * 60 * 60 * 1000);
                  if (needFollowup.length > 0) {
                    openModal(needFollowup, null, true);
                  } else {
                    addToast('No guests need follow-up', 'info');
                  }
                }}
                className="btn-hover"
                style={{ background: '#fbbf2415', border: '1px solid #fbbf2430', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontSize: 24, marginBottom: 12 }}>↻</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>Send Follow-ups</div>
                <div style={{ fontSize: 13, color: '#666' }}>Re-email guests from 3+ days ago</div>
              </button>
              <button
                onClick={() => {
                  const noEmail = guests.filter(g => !g.emailSent);
                  if (noEmail.length > 0) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(10, 0, 0, 0);
                    const newScheduled = noEmail.map(g => ({
                      id: `${Date.now()}-${g.id}`,
                      guestId: g.id,
                      guestName: g.name,
                      scheduledFor: tomorrow.toISOString(),
                      type: 'reminder' as const,
                      status: 'pending' as const,
                    }));
                    setScheduledEmails(prev => [...prev, ...newScheduled]);
                    addToast(`Scheduled ${noEmail.length} emails for tomorrow`, 'success');
                  } else {
                    addToast('All guests have received emails', 'info');
                  }
                }}
                className="btn-hover"
                style={{ background: '#06b6d415', border: '1px solid #06b6d430', borderRadius: 12, padding: 20, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ fontSize: 24, marginBottom: 12 }}>⏱</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#06b6d4', marginBottom: 4 }}>Schedule for Tomorrow</div>
                <div style={{ fontSize: 13, color: '#666' }}>Queue {guests.filter(g => !g.emailSent).length} emails for 10am</div>
              </button>
            </div>

            {/* Scheduled Emails */}
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#888' }}>Scheduled Emails</h3>
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              {scheduledEmails.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 40, marginBottom: 12 }}>⚡</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No scheduled emails</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Schedule emails from guest actions</div>
                </div>
              ) : (
                scheduledEmails.map((email, idx) => (
                  <div key={email.id} style={{ padding: '14px 16px', borderBottom: idx < scheduledEmails.length - 1 ? '1px solid #1a1a1a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: email.status === 'pending' ? '#3b82f615' : '#22c55e15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {email.status === 'pending' ? '⏱' : '✓'}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{email.guestName}</div>
                        <div style={{ fontSize: 13, color: '#666' }}>{email.type} email</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: '#888' }}>{formatDate(email.scheduledFor)}</div>
                      <div style={{ fontSize: 12, color: email.status === 'pending' ? '#3b82f6' : '#22c55e', textTransform: 'uppercase' }}>{email.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Guests Page with Tabs */}
        {activeView === 'guests' && (
          <>
            <div className="tab-container" style={{ padding: '20px 32px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4, background: '#111', padding: 4, borderRadius: 10 }}>
                <TabButton active={guestTab === 'pending'} onClick={() => { setGuestTab('pending'); setSelectedGuests(new Set()); }} label="Pending" count={stats.pending} />
                <TabButton active={guestTab === 'all'} onClick={() => { setGuestTab('all'); setSelectedGuests(new Set()); }} label="Accepted" count={stats.accepted} />
              </div>

              {selectedGuests.size > 0 && (
                <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown 0.2s ease' }}>
                  <span style={{ fontSize: 15, color: '#888', background: '#1a1a1a', padding: '6px 12px', borderRadius: 6 }}>
                    {selectedGuests.size} selected
                  </span>
                  <ActionBtn onClick={() => handleBulkAction(null, true)} color="#22c55e" label="✉" />
                  <ActionBtn onClick={() => handleBulkAction('A')} color="#a78bfa" label="VIP" />
                  <ActionBtn onClick={() => handleBulkAction('B')} color="#60a5fa" label="Pri" />
                  <ActionBtn onClick={() => handleBulkAction('C')} color="#6b7280" label="Std" />
                </div>
              )}
            </div>
            <GuestList
              guests={currentList}
              selectedGuests={selectedGuests}
              toggleSelect={toggleSelect}
              selectAll={selectAll}
              openModal={openModal}
              removeGuest={removeGuest}
              showActions={guestTab === 'pending'}
              setShowForm={setShowForm}
              getScoreColor={getScoreColor}
            />
          </>
        )}

        {/* Emails Sent Page */}
        {activeView === 'emails' && (
          <>
            <div className="tab-container" style={{ padding: '20px 32px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, color: '#888' }}>
                {currentList.length} guests received emails
              </div>
              {selectedGuests.size > 0 && (
                <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown 0.2s ease' }}>
                  <span style={{ fontSize: 15, color: '#888', background: '#1a1a1a', padding: '6px 12px', borderRadius: 6 }}>
                    {selectedGuests.size} selected
                  </span>
                  <ActionBtn onClick={() => handleBulkAction(null, true)} color="#22c55e" label="↻ Resend" />
                </div>
              )}
            </div>
            <EmailsList
              guests={currentList}
              selectedGuests={selectedGuests}
              toggleSelect={toggleSelect}
              selectAll={selectAll}
              removeGuest={removeGuest}
              openModal={openModal}
              formatDate={formatDate}
              getScoreColor={getScoreColor}
            />
          </>
        )}

        {/* Category Views */}
        {(activeView === 'vip' || activeView === 'priority' || activeView === 'standard') && (
          <>
            <div className="tab-container" style={{ padding: '20px 32px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  background: activeView === 'vip' ? '#a78bfa' : activeView === 'priority' ? '#60a5fa' : '#6b7280'
                }} />
                <span style={{ fontSize: 15, color: '#888' }}>
                  {currentList.length} {activeView === 'vip' ? 'VIP' : activeView === 'priority' ? 'Priority' : 'Standard'} guests
                </span>
              </div>
              {selectedGuests.size > 0 && (
                <div className="bulk-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'slideDown 0.2s ease' }}>
                  <span style={{ fontSize: 15, color: '#888', background: '#1a1a1a', padding: '6px 12px', borderRadius: 6 }}>
                    {selectedGuests.size} selected
                  </span>
                  <ActionBtn onClick={() => handleBulkAction(null, true)} color="#22c55e" label="✉" />
                  {activeView !== 'vip' && <ActionBtn onClick={() => handleBulkAction('A')} color="#a78bfa" label="VIP" />}
                  {activeView !== 'priority' && <ActionBtn onClick={() => handleBulkAction('B')} color="#60a5fa" label="Pri" />}
                  {activeView !== 'standard' && <ActionBtn onClick={() => handleBulkAction('C')} color="#6b7280" label="Std" />}
                </div>
              )}
            </div>
            <GuestList
              guests={currentList}
              selectedGuests={selectedGuests}
              toggleSelect={toggleSelect}
              selectAll={selectAll}
              openModal={openModal}
              removeGuest={removeGuest}
              showActions={true}
              setShowForm={setShowForm}
              categoryView={activeView}
              getScoreColor={getScoreColor}
            />
          </>
        )}

        {/* Check-In Page */}
        {activeView === 'checkin' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Check-In Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <div style={{ background: '#22c55e15', border: '1px solid #22c55e30', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#22c55e', marginBottom: 8 }}>Checked In</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#22c55e' }}>{stats.checkedIn}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{stats.checkInRate}% of accepted</div>
              </div>
              <div style={{ background: '#3b82f615', border: '1px solid #3b82f630', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#3b82f6', marginBottom: 8 }}>People Inside</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#3b82f6' }}>{stats.checkedInPartySize}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Total party size</div>
              </div>
              <div style={{ background: '#fbbf2415', border: '1px solid #fbbf2430', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#fbbf24', marginBottom: 8 }}>Waiting</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#fbbf24' }}>{stats.accepted - stats.checkedIn}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Not yet arrived</div>
              </div>
              <div style={{ background: '#a78bfa15', border: '1px solid #a78bfa30', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 14, color: '#a78bfa', marginBottom: 8 }}>Expected Total</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#a78bfa' }}>{stats.totalPartySize}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>All party sizes</div>
              </div>
            </div>

            {/* AI Assistant Panel */}
            <div style={{ background: 'linear-gradient(135deg, #d4af3710 0%, #a78bfa10 100%)', border: '1px solid #d4af3730', borderRadius: 16, padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#d4af37' }}>AI Check-In Assistant</div>
                  <div style={{ fontSize: 13, color: '#888' }}>Smart suggestions based on guest score and status</div>
                </div>
              </div>

              {/* VIP Waiting Alert */}
              {guests.filter(g => g.category === 'A' && !g.checkedInAt).length > 0 && (
                <div style={{ background: '#a78bfa15', border: '1px solid #a78bfa30', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#a78bfa', marginBottom: 8 }}>⭐ VIP Guests Waiting ({guests.filter(g => g.category === 'A' && !g.checkedInAt).length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {guests.filter(g => g.category === 'A' && !g.checkedInAt).slice(0, 5).map(vip => (
                      <button
                        key={vip.id}
                        onClick={() => checkInGuest(vip)}
                        className="btn-hover"
                        style={{ background: '#a78bfa20', border: '1px solid #a78bfa40', color: '#a78bfa', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <span>{vip.name}</span>
                        <span style={{ background: '#a78bfa', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{vip.aiScore || calculateAIScore(vip)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* High Score Guests Not Checked In */}
              {guests.filter(g => (g.aiScore || calculateAIScore(g)) >= 50 && !g.checkedInAt && g.category !== 'pending').length > 0 && (
                <div style={{ background: '#22c55e10', border: '1px solid #22c55e30', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>🎯 High-Value Guests Waiting ({guests.filter(g => (g.aiScore || calculateAIScore(g)) >= 50 && !g.checkedInAt && g.category !== 'pending').length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {guests
                      .filter(g => (g.aiScore || calculateAIScore(g)) >= 50 && !g.checkedInAt && g.category !== 'pending')
                      .sort((a, b) => (b.aiScore || calculateAIScore(b)) - (a.aiScore || calculateAIScore(a)))
                      .slice(0, 8)
                      .map(guest => (
                        <button
                          key={guest.id}
                          onClick={() => checkInGuest(guest)}
                          className="btn-hover"
                          style={{ background: '#22c55e15', border: '1px solid #22c55e30', color: '#22c55e', padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span>{guest.name}</span>
                          <span style={{ background: '#22c55e', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{guest.aiScore || calculateAIScore(guest)}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Check-In Search */}
            <div style={{ marginBottom: 24, position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 Search by name, @instagram, email, or phone..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="input-focus"
                style={{
                  width: '100%',
                  background: '#111',
                  border: '2px solid #22c55e30',
                  borderRadius: 12,
                  padding: '16px 20px',
                  color: '#fff',
                  fontSize: 18,
                  outline: 'none',
                }}
              />
              {filters.search && (
                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#666', fontSize: 14 }}>
                    {guests.filter(g =>
                      g.category !== 'pending' && (
                        g.name.toLowerCase().includes(filters.search.toLowerCase()) ||
                        g.instagram.toLowerCase().includes(filters.search.toLowerCase()) ||
                        g.email.toLowerCase().includes(filters.search.toLowerCase()) ||
                        g.phone.includes(filters.search)
                      )
                    ).length} results
                  </span>
                  <button onClick={() => setFilters({ ...filters, search: '' })} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              )}
            </div>

            {/* Approved Guests List for Check-In */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Approved Guests</span>
                <span style={{ fontSize: 14, color: '#666' }}>{guests.filter(g => g.category !== 'pending').length} guests</span>
              </div>
              {guests
                .filter(g => g.category !== 'pending')
                .filter(g => !filters.search ||
                  g.name.toLowerCase().includes(filters.search.toLowerCase()) ||
                  g.instagram.toLowerCase().includes(filters.search.toLowerCase()) ||
                  g.email.toLowerCase().includes(filters.search.toLowerCase()) ||
                  g.phone.includes(filters.search)
                )
                .sort((a, b) => {
                  // Sort: not checked in first, then by AI score (high to low)
                  if (a.checkedInAt && !b.checkedInAt) return 1;
                  if (!a.checkedInAt && b.checkedInAt) return -1;
                  const scoreA = a.aiScore || calculateAIScore(a);
                  const scoreB = b.aiScore || calculateAIScore(b);
                  return scoreB - scoreA;
                })
                .map((guest, idx) => (
                  <div
                    key={guest.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: idx < guests.filter(g => g.category !== 'pending').length - 1 ? '1px solid #1a1a1a' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: guest.checkedInAt ? '#22c55e08' : 'transparent',
                      animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: guest.checkedInAt ? '#22c55e20' : '#1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        color: guest.checkedInAt ? '#22c55e' : '#666',
                      }}>
                        {guest.checkedInAt ? '✓' : guest.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2, color: guest.checkedInAt ? '#22c55e' : '#fff' }}>
                          {guest.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 14, color: '#888' }}>Party of {guest.partySize}</span>
                          <StatusBadge category={guest.category} />
                          <span style={{ background: getScoreColor(guest.aiScore || calculateAIScore(guest)) + '20', color: getScoreColor(guest.aiScore || calculateAIScore(guest)), padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                            Score: {guest.aiScore || calculateAIScore(guest)}
                          </span>
                          {guest.instagram && (
                            <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', fontSize: 13, textDecoration: 'none' }}>@{guest.instagram.replace('@', '')}</a>
                          )}
                          {guest.checkedInAt && (
                            <span style={{ fontSize: 12, color: '#22c55e' }}>
                              ✓ {formatDate(guest.checkedInAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => showGuestQR(guest)}
                        className="btn-hover"
                        style={{
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          color: '#fff',
                          padding: '10px 14px',
                          borderRadius: 8,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        QR
                      </button>
                      {!guest.checkedInAt ? (
                        <button
                          onClick={() => checkInGuest(guest)}
                          className="btn-hover"
                          style={{
                            background: '#22c55e',
                            border: 'none',
                            color: '#000',
                            padding: '10px 20px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Check In
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, checkedInAt: undefined } : g));
                            addToast(`${guest.name} check-in reversed`, 'info');
                          }}
                          className="btn-hover"
                          style={{
                            background: '#fbbf2420',
                            border: '1px solid #fbbf2440',
                            color: '#fbbf24',
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontSize: 14,
                            cursor: 'pointer',
                          }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {guests.filter(g => g.category !== 'pending').length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>✓</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No approved guests yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Approve guests from the Guests page first</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Models/Hot Girls Page */}
        {activeView === 'models' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Models Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Applications</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{modelStats.total}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #fbbf2440', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 4 }}>Pending Review</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{modelStats.pending}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Approved</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{modelStats.approved}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #d4af3740', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 4 }}>Assigned to Events</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>{modelStats.assigned}</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {(['pending', 'approved', 'assigned', 'all'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setModelTab(tab)}
                  style={{
                    background: modelTab === tab ? '#d4af37' : '#1a1a1a',
                    border: modelTab === tab ? 'none' : '1px solid #333',
                    color: modelTab === tab ? '#000' : '#fff',
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {tab === 'all' ? 'All Applications' : tab}
                </button>
              ))}
            </div>

            {/* Models List */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Model Applications</span>
                <span style={{ fontSize: 14, color: '#666' }}>{models.filter(m => modelTab === 'all' || m.status === modelTab).length} models</span>
              </div>
              {models
                .filter(m => modelTab === 'all' || m.status === modelTab)
                .map((model, idx) => (
                  <div
                    key={model.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        background: model.photos?.[0] ? `url(${model.photos[0]}) center/cover` : '#1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 24,
                        color: '#666',
                        border: model.status === 'approved' ? '2px solid #22c55e' : model.status === 'assigned' ? '2px solid #d4af37' : '2px solid transparent'
                      }}>
                        {!model.photos?.[0] && model.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{model.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <a href={`https://instagram.com/${model.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', fontSize: 13, textDecoration: 'none' }}>
                            @{model.instagram.replace('@', '')}
                          </a>
                          {model.height && <span style={{ fontSize: 13, color: '#666' }}>{model.height}</span>}
                          <span style={{
                            background: model.experienceLevel === 'professional' ? '#22c55e20' : model.experienceLevel === 'intermediate' ? '#fbbf2420' : '#66666620',
                            color: model.experienceLevel === 'professional' ? '#22c55e' : model.experienceLevel === 'intermediate' ? '#fbbf24' : '#888',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            textTransform: 'capitalize'
                          }}>
                            {model.experienceLevel}
                          </span>
                          {model.aiScore && (
                            <span style={{ background: getScoreColor(model.aiScore) + '20', color: getScoreColor(model.aiScore), padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                              Score: {model.aiScore}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>{model.email} • {model.phone}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {model.status === 'pending' && (
                        <>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`${API_URL}/models/${model.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'approved' })
                                });
                                if (res.ok) {
                                  setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'approved' } : m));
                                  setModelStats(prev => ({ ...prev, pending: prev.pending - 1, approved: prev.approved + 1 }));
                                  addToast(`${model.name} approved!`, 'success');
                                }
                              } catch (e) { addToast('Error updating model', 'error'); }
                            }}
                            className="btn-hover"
                            style={{ background: '#22c55e', border: 'none', color: '#000', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`${API_URL}/models/${model.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'declined' })
                                });
                                if (res.ok) {
                                  setModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'declined' } : m));
                                  setModelStats(prev => ({ ...prev, pending: prev.pending - 1, declined: prev.declined + 1 }));
                                  addToast(`${model.name} declined`, 'info');
                                }
                              } catch (e) { addToast('Error updating model', 'error'); }
                            }}
                            className="btn-hover"
                            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {model.status === 'approved' && (
                        <button
                          onClick={() => addToast('Event assignment coming soon!', 'info')}
                          className="btn-hover"
                          style={{ background: '#d4af37', border: 'none', color: '#000', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Assign to Event
                        </button>
                      )}
                      {model.status === 'assigned' && model.eventsAssigned && (
                        <div style={{ fontSize: 13, color: '#d4af37' }}>
                          {model.eventsAssigned.length} event{model.eventsAssigned.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {models.filter(m => modelTab === 'all' || m.status === modelTab).length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>★</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No {modelTab === 'all' ? '' : modelTab} applications yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Model applications will appear here</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tables Page */}
        {activeView === 'tables' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Tables Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Reservations</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{tableStats.total}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #fbbf2440', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 4 }}>Pending</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{tableStats.pending}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Confirmed</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{tableStats.confirmed}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #d4af3740', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 4 }}>Revenue</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>${tableStats.revenue.toLocaleString()}</div>
              </div>
            </div>

            {/* Zone Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {(['all', 'VIP', 'Premium', 'Standard', 'Lounge'] as const).map(zone => (
                <button
                  key={zone}
                  onClick={() => setTableZone(zone)}
                  style={{
                    background: tableZone === zone ? '#d4af37' : '#1a1a1a',
                    border: tableZone === zone ? 'none' : '1px solid #333',
                    color: tableZone === zone ? '#000' : '#fff',
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: zone === 'all' ? 'capitalize' : 'none'
                  }}
                >
                  {zone === 'all' ? 'All Zones' : zone}
                </button>
              ))}
            </div>

            {/* Tables List */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Table Reservations</span>
                <span style={{ fontSize: 14, color: '#666' }}>{tables.filter(t => tableZone === 'all' || t.zone === tableZone).length} reservations</span>
              </div>
              {tables
                .filter(t => tableZone === 'all' || t.zone === tableZone)
                .map((table, idx) => (
                  <div
                    key={table.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: table.zone === 'VIP' ? '#d4af3720' : '#1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        color: table.zone === 'VIP' ? '#d4af37' : '#666',
                      }}>
                        ▣
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{table.customerName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 14, color: '#888' }}>{table.tableName}</span>
                          <span style={{
                            background: table.zone === 'VIP' ? '#d4af3720' : table.zone === 'Premium' ? '#22c55e20' : '#66666620',
                            color: table.zone === 'VIP' ? '#d4af37' : table.zone === 'Premium' ? '#22c55e' : '#888',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                          }}>
                            {table.zone}
                          </span>
                          <span style={{ fontSize: 13, color: '#666' }}>Party of {table.partySize}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        background: table.status === 'confirmed' ? '#22c55e20' : '#fbbf2420',
                        color: table.status === 'confirmed' ? '#22c55e' : '#fbbf24',
                        padding: '4px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        textTransform: 'capitalize'
                      }}>
                        {table.status}
                      </span>
                    </div>
                  </div>
                ))}
              {tables.filter(t => tableZone === 'all' || t.zone === tableZone).length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>▣</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No {tableZone === 'all' ? '' : tableZone} reservations yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Table reservations will appear here</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tickets Page */}
        {activeView === 'tickets' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Tickets Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Tickets</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{ticketStats.total}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Valid</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{ticketStats.valid}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #fbbf2440', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 4 }}>Used</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{ticketStats.used}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #d4af3740', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 4 }}>Revenue</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>${ticketStats.revenue.toLocaleString()}</div>
              </div>
            </div>

            {/* Import Button */}
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={() => addToast('CSV import coming soon!', 'info')}
                style={{
                  background: '#d4af37',
                  border: 'none',
                  color: '#000',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Import Tickets (CSV)
              </button>
            </div>

            {/* Tickets List */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Tickets</span>
                <span style={{ fontSize: 14, color: '#666' }}>{tickets.length} tickets</span>
              </div>
              {tickets.map((ticket, idx) => (
                <div
                  key={ticket.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: ticket.status === 'used' ? '#22c55e20' : '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      color: ticket.status === 'used' ? '#22c55e' : '#666',
                    }}>
                      🎫
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{ticket.holderName || 'No Name'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 14, color: '#888' }}>{ticket.ticketType}</span>
                        <span style={{ fontSize: 13, color: '#666' }}>{ticket.holderEmail}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      background: ticket.status === 'used' ? '#22c55e20' : ticket.status === 'valid' ? '#fbbf2420' : '#ef444420',
                      color: ticket.status === 'used' ? '#22c55e' : ticket.status === 'valid' ? '#fbbf24' : '#ef4444',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      textTransform: 'capitalize'
                    }}>
                      {ticket.status}
                    </span>
                  </div>
                </div>
              ))}
              {tickets.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>🎫</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No tickets imported yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Import tickets from Eventbrite, DICE, or CSV to track check-ins</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sponsors Page */}
        {activeView === 'sponsors' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            {/* Sponsors Stats */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Sponsors</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{sponsorStats.total}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #fbbf2440', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 4 }}>Pending</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{sponsorStats.pending}</div>
              </div>
              <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Active</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{sponsorStats.active}</div>
              </div>
            </div>

            {/* Sponsor Tiers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { tier: 'Platinum', color: '#e5e4e2' },
                { tier: 'Gold', color: '#d4af37' },
                { tier: 'Silver', color: '#c0c0c0' },
                { tier: 'Bronze', color: '#cd7f32' }
              ].map(t => (
                <div key={t.tier} style={{ background: '#0a0a0a', border: `1px solid ${t.color}40`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8, color: t.color }}>◆</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: t.color }}>{t.tier}</div>
                </div>
              ))}
            </div>

            {/* Sponsors List */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Sponsors</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setShowFlyerGenerator(true)}
                    style={{
                      background: '#a78bfa20',
                      border: '1px solid #a78bfa40',
                      color: '#a78bfa',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Generate Flyer
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/sponsor-application`);
                      addToast('Sponsor portal link copied!', 'success');
                    }}
                    style={{
                      background: '#d4af37',
                      border: 'none',
                      color: '#000',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Copy Application Link
                  </button>
                </div>
              </div>
              {sponsors.map((sponsor, idx) => (
                <div
                  key={sponsor.id}
                  onClick={() => setSelectedSponsor(sponsor)}
                  className="nav-hover"
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: sponsor.logoUrl ? `url(${sponsor.logoUrl}) center/cover` : '#1a1a1a',
                      backgroundSize: 'cover',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      color: sponsor.tier === 'platinum' ? '#e5e4e2' : sponsor.tier === 'gold' ? '#d4af37' : '#666',
                    }}>
                      {!sponsor.logoUrl && '◆'}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{sponsor.companyName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 14, color: '#888' }}>{sponsor.contactName}</span>
                        <span style={{
                          background: sponsor.tier === 'platinum' ? '#e5e4e220' : sponsor.tier === 'gold' ? '#d4af3720' : sponsor.tier === 'silver' ? '#c0c0c020' : '#cd7f3220',
                          color: sponsor.tier === 'platinum' ? '#e5e4e2' : sponsor.tier === 'gold' ? '#d4af37' : sponsor.tier === 'silver' ? '#c0c0c0' : '#cd7f32',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                        }}>
                          {sponsor.tier}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sponsor.status === 'pending' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSponsor(sponsor.id, { status: 'approved' });
                        }}
                        style={{
                          background: '#22c55e20',
                          border: 'none',
                          color: '#22c55e',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Approve
                      </button>
                    )}
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#3b82f620',
                        border: 'none',
                        color: '#3b82f6',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {sponsor.logoUrl ? '✓ Logo' : '+ Logo'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(sponsor.id, file);
                        }}
                      />
                    </label>
                    <span style={{
                      background: sponsor.status === 'approved' || sponsor.status === 'active' ? '#22c55e20' : sponsor.status === 'pending' ? '#fbbf2420' : '#66666620',
                      color: sponsor.status === 'approved' || sponsor.status === 'active' ? '#22c55e' : sponsor.status === 'pending' ? '#fbbf24' : '#888',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      textTransform: 'capitalize'
                    }}>
                      {sponsor.status}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSponsor(sponsor.id);
                      }}
                      style={{
                        background: '#ef444420',
                        border: 'none',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title="Delete sponsor"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {sponsors.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>◆</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No sponsors yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Sponsor applications will appear here</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== EVENTS VIEW ========== */}
        {activeView === 'events' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            {/* Stats Row */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Events', value: eventStats.total, color: '#fff' },
                { label: 'Upcoming', value: eventStats.upcoming, color: '#22c55e' },
                { label: 'This Month', value: eventStats.thisMonth, color: '#3b82f6' },
                { label: 'Planning', value: eventStats.planning, color: '#f59e0b' },
                { label: 'Confirmed', value: eventStats.confirmed, color: '#a78bfa' },
                { label: 'Completed', value: eventStats.completed, color: '#6b7280' },
              ].map((stat, i) => (
                <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{stat.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>All Events</h2>
              <button
                onClick={() => setShowEventForm(true)}
                className="btn-hover"
                style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                + New Event
              </button>
            </div>

            {/* Events Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {events.map(event => (
                <div
                  key={event.id}
                  onClick={() => { setSelectedEvent(event); navigateTo('budget'); }}
                  className="row-hover"
                  style={{
                    background: '#0a0a0a',
                    border: `1px solid ${event.status === 'confirmed' ? '#22c55e40' : event.status === 'planning' ? '#f59e0b40' : '#1a1a1a'}`,
                    borderRadius: 12,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{event.name}</h3>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{event.venueName || 'Venue TBD'} {event.venueCity && `• ${event.venueCity}`}</div>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: event.status === 'confirmed' ? '#22c55e20' : event.status === 'planning' ? '#f59e0b20' : event.status === 'completed' ? '#6b728020' : '#ef444420',
                      color: event.status === 'confirmed' ? '#22c55e' : event.status === 'planning' ? '#f59e0b' : event.status === 'completed' ? '#9ca3af' : '#ef4444',
                    }}>
                      {event.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#888' }}>
                    <span>📅 {new Date(event.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {event.startTime && <span>🕐 {event.startTime}</span>}
                    {event.expectedAttendance && <span>👥 {event.expectedAttendance}</span>}
                  </div>
                  {event.theme && <div style={{ marginTop: 10, fontSize: 12, color: '#d4af37' }}>Theme: {event.theme}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateEventStatus(event.id, 'confirmed'); }}
                      style={{ flex: 1, padding: '8px', background: '#22c55e20', border: 'none', borderRadius: 6, color: '#22c55e', fontSize: 12, cursor: 'pointer' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); navigateTo('budget'); }}
                      style={{ flex: 1, padding: '8px', background: '#d4af3720', border: 'none', borderRadius: 6, color: '#d4af37', fontSize: 12, cursor: 'pointer' }}
                    >
                      Budget
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); fetchClientAccesses(event.id); setShowClientAccessForm(true); }}
                      style={{ flex: 1, padding: '8px', background: '#3b82f620', border: 'none', borderRadius: 6, color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}
                    >
                      Share
                    </button>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No events yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Create your first event to get started</div>
                </div>
              )}
            </div>

            {/* Create Event Modal */}
            {showEventForm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowEventForm(false)}>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 500, animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px' }}>Create New Event</h2>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <input placeholder="Event Name *" value={eventFormData.name} onChange={e => setEventFormData(p => ({ ...p, name: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input type="date" value={eventFormData.eventDate} onChange={e => setEventFormData(p => ({ ...p, eventDate: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <select value={eventFormData.eventType} onChange={e => setEventFormData(p => ({ ...p, eventType: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                        <option value="party">Party</option>
                        <option value="corporate">Corporate</option>
                        <option value="concert">Concert</option>
                        <option value="festival">Festival</option>
                        <option value="private">Private</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input placeholder="Venue Name" value={eventFormData.venueName} onChange={e => setEventFormData(p => ({ ...p, venueName: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="City" value={eventFormData.venueCity} onChange={e => setEventFormData(p => ({ ...p, venueCity: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input placeholder="Expected Attendance" type="number" value={eventFormData.expectedAttendance} onChange={e => setEventFormData(p => ({ ...p, expectedAttendance: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="Dress Code" value={eventFormData.dressCode} onChange={e => setEventFormData(p => ({ ...p, dressCode: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    </div>
                    <input placeholder="Theme (optional)" value={eventFormData.theme} onChange={e => setEventFormData(p => ({ ...p, theme: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <textarea placeholder="Notes" value={eventFormData.notes} onChange={e => setEventFormData(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => setShowEventForm(false)} style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={createEvent} style={{ flex: 1, padding: '12px', background: '#d4af37', border: 'none', borderRadius: 8, color: '#000', fontWeight: 600, cursor: 'pointer' }}>Create Event</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Client Access Modal */}
            {showClientAccessForm && selectedEvent && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowClientAccessForm(false)}>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Share with Client</h2>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{selectedEvent.name}</div>
                    </div>
                    <button onClick={() => setShowClientAccessForm(false)} style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}>×</button>
                  </div>

                  {/* Existing Client Accesses */}
                  {clientAccesses.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 14, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Active Portal Links</h3>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {clientAccesses.map(access => (
                          <div key={access.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 500 }}>{access.clientName}</div>
                              <div style={{ fontSize: 12, color: '#666' }}>{access.clientEmail}</div>
                              <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                                {access.permissions.viewBudget && <span style={{ marginRight: 8 }}>💰 Budget</span>}
                                {access.permissions.viewTimeline && <span style={{ marginRight: 8 }}>📅 Timeline</span>}
                                {access.permissions.viewStaff && <span style={{ marginRight: 8 }}>👥 Staff</span>}
                                {access.permissions.viewVendors && <span>🏢 Vendors</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {access.portalUrl && (
                                <button
                                  onClick={() => { navigator.clipboard.writeText(access.portalUrl || ''); }}
                                  style={{ padding: '6px 12px', background: '#3b82f620', border: 'none', borderRadius: 6, color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}
                                >
                                  Copy Link
                                </button>
                              )}
                              <button
                                onClick={() => revokeClientAccess(access.id)}
                                style={{ padding: '6px 12px', background: '#ef444420', border: 'none', borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Create New Access Form */}
                  <div>
                    <h3 style={{ fontSize: 14, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Create New Portal Link</h3>
                    <div style={{ display: 'grid', gap: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <input
                          placeholder="Client Name *"
                          value={clientAccessFormData.clientName}
                          onChange={e => setClientAccessFormData(p => ({ ...p, clientName: e.target.value }))}
                          style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}
                        />
                        <input
                          placeholder="Client Email *"
                          type="email"
                          value={clientAccessFormData.clientEmail}
                          onChange={e => setClientAccessFormData(p => ({ ...p, clientEmail: e.target.value }))}
                          style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#666', marginBottom: 8, display: 'block' }}>Link expires in (days, leave empty for no expiration)</label>
                        <input
                          placeholder="30"
                          type="number"
                          value={clientAccessFormData.expiresInDays}
                          onChange={e => setClientAccessFormData(p => ({ ...p, expiresInDays: e.target.value }))}
                          style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, width: 100 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#666', marginBottom: 8, display: 'block' }}>Client can view:</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={clientAccessFormData.viewBudget}
                              onChange={e => setClientAccessFormData(p => ({ ...p, viewBudget: e.target.checked }))}
                            />
                            💰 Budget
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={clientAccessFormData.viewTimeline}
                              onChange={e => setClientAccessFormData(p => ({ ...p, viewTimeline: e.target.checked }))}
                            />
                            📅 Timeline
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={clientAccessFormData.viewStaff}
                              onChange={e => setClientAccessFormData(p => ({ ...p, viewStaff: e.target.checked }))}
                            />
                            👥 Staff
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={clientAccessFormData.viewVendors}
                              onChange={e => setClientAccessFormData(p => ({ ...p, viewVendors: e.target.checked }))}
                            />
                            🏢 Vendors
                          </label>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button
                          onClick={() => setShowClientAccessForm(false)}
                          style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={createClientAccess}
                          style={{ flex: 1, padding: '12px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Create Portal Link
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== BUDGET VIEW ========== */}
        {activeView === 'budget' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            {selectedEvent ? (
              <>
                {/* Event Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <button onClick={() => { setSelectedEvent(null); navigateTo('events'); }} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>← Back to Events</button>
                    <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{selectedEvent.name}</h2>
                    <div style={{ color: '#666', marginTop: 4 }}>{new Date(selectedEvent.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  </div>
                  <button onClick={() => setShowBudgetItemForm(true)} className="btn-hover" style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>+ Add Item</button>
                </div>

                {/* Budget Summary Cards */}
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Total Budget</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>${budgetSummary.totalBudget.toLocaleString()}</div>
                  </div>
                  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Expenses (Est / Actual)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>
                      ${budgetSummary.totalEstimatedExpenses.toLocaleString()} / ${budgetSummary.totalActualExpenses.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Income (Est / Actual)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>
                      ${budgetSummary.totalEstimatedIncome.toLocaleString()} / ${budgetSummary.totalActualIncome.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Projected Profit</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: budgetSummary.estimatedProfit >= 0 ? '#22c55e' : '#ef4444' }}>
                      ${budgetSummary.estimatedProfit.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Budget Items Table */}
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Budget Items</h3>
                    <div style={{ fontSize: 13, color: '#666' }}>{budgetSummary.paidCount} paid • {budgetSummary.pendingCount} pending</div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#111' }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Category</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Description</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Vendor</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Estimated</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Actual</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px', fontSize: 12, color: '#666', fontWeight: 500 }}>Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetItems.map(item => (
                        <tr key={item.id} className="row-hover" style={{ borderBottom: '1px solid #1a1a1a' }}>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: `${item.color}20`, borderRadius: 20, fontSize: 12, color: item.color }}>
                              {item.categoryName || 'Other'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: '#fff' }}>{item.description}</td>
                          <td style={{ padding: '14px 16px', color: '#888' }}>{item.vendorName || '-'}</td>
                          <td style={{ padding: '14px 16px', textAlign: 'right', color: item.isIncome ? '#22c55e' : '#fff' }}>
                            {item.isIncome ? '+' : ''}${(item.estimatedAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right', color: item.actualAmount ? (item.isIncome ? '#22c55e' : '#fff') : '#444' }}>
                            {item.actualAmount ? `${item.isIncome ? '+' : ''}$${(item.actualAmount || 0).toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={item.isPaid}
                              onChange={() => toggleBudgetItemPaid(item.id, !item.isPaid)}
                              className="checkbox-custom"
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {budgetItems.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
                      <div style={{ color: '#666' }}>No budget items yet</div>
                    </div>
                  )}
                </div>

                {/* Add Budget Item Modal */}
                {showBudgetItemForm && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowBudgetItemForm(false)}>
                    <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 450, animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px' }}>Add Budget Item</h2>
                      <div style={{ display: 'grid', gap: 16 }}>
                        <select value={budgetItemFormData.categoryId} onChange={e => setBudgetItemFormData(p => ({ ...p, categoryId: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                          <option value="">Select Category</option>
                          {budgetCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.isIncome ? '💵 ' : ''}{c.name}</option>
                          ))}
                        </select>
                        <input placeholder="Description *" value={budgetItemFormData.description} onChange={e => setBudgetItemFormData(p => ({ ...p, description: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                        <input placeholder="Vendor Name" value={budgetItemFormData.vendorName} onChange={e => setBudgetItemFormData(p => ({ ...p, vendorName: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <input placeholder="Estimated Amount" type="number" value={budgetItemFormData.estimatedAmount} onChange={e => setBudgetItemFormData(p => ({ ...p, estimatedAmount: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                          <input placeholder="Actual Amount" type="number" value={budgetItemFormData.actualAmount} onChange={e => setBudgetItemFormData(p => ({ ...p, actualAmount: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                        </div>
                        <input type="date" placeholder="Due Date" value={budgetItemFormData.dueDate} onChange={e => setBudgetItemFormData(p => ({ ...p, dueDate: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888' }}>
                          <input type="checkbox" checked={budgetItemFormData.isPaid} onChange={e => setBudgetItemFormData(p => ({ ...p, isPaid: e.target.checked }))} /> Mark as Paid
                        </label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button onClick={() => setShowBudgetItemForm(false)} style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Cancel</button>
                          <button onClick={addBudgetItem} style={{ flex: 1, padding: '12px', background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Item</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>Select an Event</h2>
                <p style={{ color: '#666', marginBottom: 24 }}>Choose an event to manage its budget</p>
                <button onClick={() => navigateTo('events')} style={{ background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>View Events</button>
              </div>
            )}
          </div>
        )}

        {/* ========== VENDORS VIEW ========== */}
        {activeView === 'vendors' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Vendors & Providers</h2>
              <button onClick={() => setShowVendorForm(true)} className="btn-hover" style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>+ Add Vendor</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {vendors.map(vendor => (
                <div key={vendor.id} style={{ background: '#0a0a0a', border: `1px solid ${vendor.isPreferred ? '#d4af3740' : '#1a1a1a'}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{vendor.name}</h3>
                        {vendor.isPreferred && <span style={{ fontSize: 10, padding: '2px 6px', background: '#d4af3720', color: '#d4af37', borderRadius: 4 }}>PREFERRED</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#d4af37', marginTop: 2 }}>{vendor.category || 'General'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <span key={star} style={{ color: star <= vendor.rating ? '#d4af37' : '#333' }}>★</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
                    {vendor.contactName && <div>👤 {vendor.contactName}</div>}
                    {vendor.email && <div>✉ {vendor.email}</div>}
                    {vendor.phone && <div>📱 {vendor.phone}</div>}
                    {vendor.city && <div>📍 {vendor.city}</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #1a1a1a' }}>
                    <span style={{ fontSize: 12, color: '#666' }}>{vendor.eventsCount || 0} events</span>
                    <span style={{ fontSize: 12, color: '#22c55e' }}>${(vendor.totalSpent || 0).toLocaleString()} total</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => deleteVendor(vendor.id)}
                      className="btn-hover"
                      style={{ flex: 1, padding: '8px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {vendors.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No vendors yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Add your first vendor to track partnerships</div>
                </div>
              )}
            </div>

            {/* Add Vendor Modal */}
            {showVendorForm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowVendorForm(false)}>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 450, animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px' }}>Add Vendor</h2>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <input placeholder="Vendor Name *" value={vendorFormData.name} onChange={e => setVendorFormData(p => ({ ...p, name: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <select value={vendorFormData.category} onChange={e => setVendorFormData(p => ({ ...p, category: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                      <option value="">Select Category</option>
                      <option value="Venue">Venue</option>
                      <option value="Catering">Catering</option>
                      <option value="DJ/Entertainment">DJ/Entertainment</option>
                      <option value="Decor">Decor</option>
                      <option value="Photography">Photography</option>
                      <option value="Security">Security</option>
                      <option value="Staffing">Staffing</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Other">Other</option>
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input placeholder="Contact Name" value={vendorFormData.contactName} onChange={e => setVendorFormData(p => ({ ...p, contactName: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="City" value={vendorFormData.city} onChange={e => setVendorFormData(p => ({ ...p, city: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    </div>
                    <input placeholder="Email" type="email" value={vendorFormData.email} onChange={e => setVendorFormData(p => ({ ...p, email: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <input placeholder="Phone" value={vendorFormData.phone} onChange={e => setVendorFormData(p => ({ ...p, phone: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <input placeholder="Website" value={vendorFormData.website} onChange={e => setVendorFormData(p => ({ ...p, website: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888' }}>
                      <input type="checkbox" checked={vendorFormData.isPreferred} onChange={e => setVendorFormData(p => ({ ...p, isPreferred: e.target.checked }))} /> Mark as Preferred Vendor
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => setShowVendorForm(false)} style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={createVendor} style={{ flex: 1, padding: '12px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Vendor</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STAFF VIEW */}
        {/* ============================================ */}
        {activeView === 'staff' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Staff Management</h2>
                <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>{staffStats.active} active • {staffStats.total} total staff members</p>
              </div>
              <button onClick={() => setShowStaffForm(true)} className="btn-hover" style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>+ Add Staff</button>
            </div>

            {/* Staff Stats Cards */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Total Staff</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{staffStats.total}</div>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Active</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{staffStats.active}</div>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Inactive</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#666' }}>{staffStats.inactive}</div>
              </div>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Avg Rating</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>⭐ {staffStats.avgRating.toFixed(1)}</div>
              </div>
            </div>

            {/* Staff Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {staffMembers.map(staff => (
                <div
                  key={staff.id}
                  style={{
                    background: '#0a0a0a',
                    border: `1px solid ${staff.status === 'active' ? '#8b5cf640' : '#1a1a1a'}`,
                    borderRadius: 12,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setSelectedStaff(staff)}
                  className="btn-hover"
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 60, height: 60, borderRadius: 12,
                      background: staff.photoUrl ? `url(${staff.photoUrl}) center/cover` : '#8b5cf620',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, color: '#8b5cf6', flexShrink: 0
                    }}>
                      {!staff.photoUrl && staff.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{staff.name}</h3>
                          <div style={{ fontSize: 13, color: '#8b5cf6', marginTop: 2 }}>{staff.role}</div>
                          {staff.secondaryRole && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Also: {staff.secondaryRole}</div>}
                        </div>
                        <span style={{
                          fontSize: 10, padding: '3px 8px', borderRadius: 4,
                          background: staff.status === 'active' ? '#22c55e20' : '#66666620',
                          color: staff.status === 'active' ? '#22c55e' : '#666'
                        }}>
                          {staff.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: '#888' }}>
                        {staff.phone && <span>📱 {staff.phone}</span>}
                        {staff.instagram && <span>📷 @{staff.instagram.replace('@', '')}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid #1a1a1a' }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <span key={star} style={{ fontSize: 12, color: star <= staff.rating ? '#d4af37' : '#333' }}>★</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: '#666' }}>{staff.totalEvents || 0} events</span>
                      <span style={{ color: '#22c55e', marginLeft: 12 }}>${(staff.totalEarned || 0).toLocaleString()} earned</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: '#666' }}>
                    <span>{staff.experienceLevel} level</span>
                    <span>${staff.hourlyRate || 0}/hr • ${staff.dayRate || 0}/day</span>
                  </div>
                </div>
              ))}
              {staffMembers.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
                  <div style={{ color: '#666', fontSize: 15 }}>No staff members yet</div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Add your first staff member to start scheduling</div>
                </div>
              )}
            </div>

            {/* Add Staff Modal */}
            {showStaffForm && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowStaffForm(false)}>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 550, maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 24px' }}>Add Staff Member</h2>
                  <div style={{ display: 'grid', gap: 16 }}>
                    <input placeholder="Full Name *" value={staffFormData.name} onChange={e => setStaffFormData(p => ({ ...p, name: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <select value={staffFormData.role} onChange={e => setStaffFormData(p => ({ ...p, role: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                        <option value="">Primary Role *</option>
                        <option value="Model">Model</option>
                        <option value="Hostess">Hostess</option>
                        <option value="Bartender">Bartender</option>
                        <option value="Waiter">Waiter</option>
                        <option value="Security">Security</option>
                        <option value="DJ">DJ</option>
                        <option value="Photographer">Photographer</option>
                        <option value="Videographer">Videographer</option>
                        <option value="Coordinator">Coordinator</option>
                        <option value="Manager">Manager</option>
                        <option value="Other">Other</option>
                      </select>
                      <select value={staffFormData.secondaryRole} onChange={e => setStaffFormData(p => ({ ...p, secondaryRole: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                        <option value="">Secondary Role</option>
                        <option value="Model">Model</option>
                        <option value="Hostess">Hostess</option>
                        <option value="Bartender">Bartender</option>
                        <option value="Waiter">Waiter</option>
                        <option value="Security">Security</option>
                        <option value="DJ">DJ</option>
                        <option value="Photographer">Photographer</option>
                        <option value="Coordinator">Coordinator</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input placeholder="Email" type="email" value={staffFormData.email} onChange={e => setStaffFormData(p => ({ ...p, email: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="Phone" value={staffFormData.phone} onChange={e => setStaffFormData(p => ({ ...p, phone: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    </div>
                    <input placeholder="Instagram Handle" value={staffFormData.instagram} onChange={e => setStaffFormData(p => ({ ...p, instagram: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <input placeholder="Hourly Rate ($)" type="number" value={staffFormData.hourlyRate} onChange={e => setStaffFormData(p => ({ ...p, hourlyRate: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="Day Rate ($)" type="number" value={staffFormData.dayRate} onChange={e => setStaffFormData(p => ({ ...p, dayRate: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <select value={staffFormData.experienceLevel} onChange={e => setStaffFormData(p => ({ ...p, experienceLevel: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="expert">Expert</option>
                      </select>
                    </div>
                    <input placeholder="Skills (comma-separated: bartending, hosting, bilingual)" value={staffFormData.skills} onChange={e => setStaffFormData(p => ({ ...p, skills: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <input placeholder="Emergency Contact Name" value={staffFormData.emergencyContact} onChange={e => setStaffFormData(p => ({ ...p, emergencyContact: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                      <input placeholder="Emergency Phone" value={staffFormData.emergencyPhone} onChange={e => setStaffFormData(p => ({ ...p, emergencyPhone: e.target.value }))} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }} />
                    </div>
                    <textarea placeholder="Notes" value={staffFormData.notes} onChange={e => setStaffFormData(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => setShowStaffForm(false)} style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={createStaff} style={{ flex: 1, padding: '12px', background: '#8b5cf6', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Add Staff</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Staff Detail Modal */}
            {selectedStaff && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setSelectedStaff(null)}>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 500, animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: 16,
                      background: selectedStaff.photoUrl ? `url(${selectedStaff.photoUrl}) center/cover` : '#8b5cf620',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 32, color: '#8b5cf6', flexShrink: 0
                    }}>
                      {!selectedStaff.photoUrl && selectedStaff.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{selectedStaff.name}</h2>
                      <div style={{ fontSize: 15, color: '#8b5cf6', marginTop: 4 }}>{selectedStaff.role}</div>
                      {selectedStaff.secondaryRole && <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Also: {selectedStaff.secondaryRole}</div>}
                      <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <span key={star} style={{ fontSize: 16, color: star <= selectedStaff.rating ? '#d4af37' : '#333' }}>★</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: '#111', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, color: '#666' }}>Total Events</div>
                      <div style={{ fontSize: 24, fontWeight: 600 }}>{selectedStaff.totalEvents || 0}</div>
                    </div>
                    <div style={{ background: '#111', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 12, color: '#666' }}>Total Earned</div>
                      <div style={{ fontSize: 24, fontWeight: 600, color: '#22c55e' }}>${(selectedStaff.totalEarned || 0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
                    {selectedStaff.email && <div style={{ marginBottom: 8 }}>📧 {selectedStaff.email}</div>}
                    {selectedStaff.phone && <div style={{ marginBottom: 8 }}>📱 {selectedStaff.phone}</div>}
                    {selectedStaff.instagram && <div style={{ marginBottom: 8 }}>📷 @{selectedStaff.instagram.replace('@', '')}</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #1a1a1a', fontSize: 14 }}>
                    <span style={{ color: '#666' }}>Rates</span>
                    <span>${selectedStaff.hourlyRate || 0}/hr • ${selectedStaff.dayRate || 0}/day</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #1a1a1a', fontSize: 14 }}>
                    <span style={{ color: '#666' }}>Experience</span>
                    <span style={{ textTransform: 'capitalize' }}>{selectedStaff.experienceLevel}</span>
                  </div>
                  {selectedStaff.skills && selectedStaff.skills.length > 0 && (
                    <div style={{ padding: '12px 0', borderTop: '1px solid #1a1a1a' }}>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Skills</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {selectedStaff.skills.map((skill, idx) => (
                          <span key={idx} style={{ fontSize: 12, padding: '4px 10px', background: '#8b5cf620', color: '#8b5cf6', borderRadius: 4 }}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button onClick={() => deleteStaff(selectedStaff.id)} style={{ padding: '12px', background: '#ef444420', border: 'none', borderRadius: 8, color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                    <button onClick={() => setSelectedStaff(null)} style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* MONITORING VIEW */}
        {/* ============================================ */}
        {activeView === 'monitoring' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>System Monitoring</h2>
                <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
                  {lastHealthCheck ? `Last check: ${new Date(lastHealthCheck).toLocaleTimeString()}` : 'No health check yet'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={fetchHealthStatus}
                  disabled={isLoadingHealth}
                  className="btn-hover"
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: isLoadingHealth ? 0.6 : 1 }}
                >
                  {isLoadingHealth ? 'Checking...' : 'Refresh Status'}
                </button>
                <button
                  onClick={sendTestAlert}
                  className="btn-hover"
                  style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  Send Test Alert
                </button>
              </div>
            </div>

            {/* Overall Status */}
            <div style={{
              background: healthStatus?.status === 'healthy' ? '#22c55e20' : healthStatus?.status === 'degraded' ? '#f59e0b20' : '#ef444420',
              border: `1px solid ${healthStatus?.status === 'healthy' ? '#22c55e40' : healthStatus?.status === 'degraded' ? '#f59e0b40' : '#ef444440'}`,
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}>
              <div style={{
                fontSize: 48,
                width: 80, height: 80,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0a0a0a',
                borderRadius: 12
              }}>
                {healthStatus?.status === 'healthy' ? '✅' : healthStatus?.status === 'degraded' ? '⚠️' : '❌'}
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, textTransform: 'capitalize', color: healthStatus?.status === 'healthy' ? '#22c55e' : healthStatus?.status === 'degraded' ? '#f59e0b' : '#ef4444' }}>
                  {healthStatus?.status || 'Unknown'}
                </div>
                <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
                  {healthStatus ? `Response time: ${healthStatus.responseTime}ms • Uptime: ${Math.floor(healthStatus.uptime / 60)} minutes` : 'Click "Refresh Status" to check system health'}
                </div>
              </div>
            </div>

            {/* Issues Alert */}
            {healthStatus?.issues && healthStatus.issues.length > 0 && (
              <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ef4444', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠️</span> Issues Detected ({healthStatus.issues.length})
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#fca5a5' }}>
                  {healthStatus.issues.map((issue, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Component Status Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* Database */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Database</span>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    background: healthStatus?.components?.database?.status === 'healthy' ? '#22c55e20' : '#ef444420',
                    color: healthStatus?.components?.database?.status === 'healthy' ? '#22c55e' : '#ef4444'
                  }}>
                    {healthStatus?.components?.database?.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {healthStatus?.components?.database?.responseTime ? `${healthStatus.components.database.responseTime}ms` : '--'}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {healthStatus?.components?.database?.message || healthStatus?.components?.database?.error || 'No data'}
                </div>
              </div>

              {/* Tables */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Tables</span>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    background: healthStatus?.components?.tables?.status === 'healthy' ? '#22c55e20' : '#f59e0b20',
                    color: healthStatus?.components?.tables?.status === 'healthy' ? '#22c55e' : '#f59e0b'
                  }}>
                    {healthStatus?.components?.tables?.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {healthStatus?.components?.tables?.existing || 0} / {healthStatus?.components?.tables?.total || 0}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {healthStatus?.components?.tables?.missing?.length ? `Missing: ${healthStatus.components.tables.missing.join(', ')}` : 'All tables present'}
                </div>
              </div>

              {/* Memory */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Memory</span>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 4,
                    background: healthStatus?.components?.memory?.status === 'healthy' ? '#22c55e20' : '#f59e0b20',
                    color: healthStatus?.components?.memory?.status === 'healthy' ? '#22c55e' : '#f59e0b'
                  }}>
                    {healthStatus?.components?.memory?.percentage || 0}%
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {healthStatus?.components?.memory?.heapUsed || '--'}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  of {healthStatus?.components?.memory?.heapTotal || '--'} total
                </div>
              </div>
            </div>

            {/* Server Info & Data Counts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Server Info */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Server Info</h3>
                {serverStatus ? (
                  <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Node Version</span>
                      <span>{serverStatus.server?.nodeVersion || '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Platform</span>
                      <span>{serverStatus.server?.platform || '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Uptime</span>
                      <span>
                        {serverStatus.server?.uptime ?
                          `${serverStatus.server.uptime.days}d ${serverStatus.server.uptime.hours}h ${serverStatus.server.uptime.minutes}m` :
                          '--'
                        }
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Environment</span>
                      <span style={{ textTransform: 'capitalize' }}>{serverStatus.config?.environment || '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Port</span>
                      <span>{serverStatus.config?.port || '--'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>Email Service</span>
                      <span style={{ color: serverStatus.config?.emailConfigured ? '#22c55e' : '#ef4444' }}>
                        {serverStatus.config?.emailConfigured ? 'Configured' : 'Not Configured'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#666' }}>DB Connections</span>
                      <span>{serverStatus.database?.totalConnections || 0} total, {serverStatus.database?.idleConnections || 0} idle</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>Click "Refresh Status" to load server info</div>
                )}
              </div>

              {/* Data Counts */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Data Counts</h3>
                {healthStatus?.components?.data?.counts ? (
                  <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                    {Object.entries(healthStatus.components.data.counts).map(([table, count]) => (
                      <div key={table} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666', textTransform: 'capitalize' }}>{table}</span>
                        <span style={{ fontWeight: 600 }}>{count === 'error' ? <span style={{ color: '#ef4444' }}>Error</span> : count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>No data available</div>
                )}
              </div>
            </div>

            {/* API Endpoints Info */}
            <div style={{ marginTop: 24, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Health Endpoints</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/deep</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Full health check with all components</div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/status</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Server status and configuration</div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/live</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Liveness probe for load balancers</div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/ready</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Readiness probe (DB connected)</div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#3b82f6' }}>POST</span> <span style={{ color: '#888' }}>/api/v1/health/test-alert</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Send test alert to admin email</div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: '#888' }}>/api/v1/health/test-apis</span>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Test all API endpoints</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integrations Page */}
        {activeView === 'integrations' && (
          <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Integrations</h2>
              <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
                Connect external services to sync tickets, guests, and send campaigns
              </p>
            </div>

            {/* Integration Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
              {integrations.map((integration) => (
                <div
                  key={integration.provider}
                  style={{
                    background: '#0a0a0a',
                    border: `1px solid ${integration.status === 'connected' ? integration.color + '40' : '#1a1a1a'}`,
                    borderRadius: 12,
                    padding: 20,
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 28 }}>{integration.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{integration.name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{integration.description}</div>
                      </div>
                    </div>
                    <span style={{
                      background: integration.status === 'connected' ? '#22c55e20' :
                                  integration.status === 'pending' ? '#f59e0b20' :
                                  integration.status === 'error' ? '#ef444420' : '#1a1a1a',
                      color: integration.status === 'connected' ? '#22c55e' :
                             integration.status === 'pending' ? '#f59e0b' :
                             integration.status === 'error' ? '#ef4444' : '#666',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {integration.status}
                    </span>
                  </div>

                  {/* Last Sync Info */}
                  {integration.lastSync && (
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                      Last synced: {new Date(integration.lastSync).toLocaleString()}
                    </div>
                  )}

                  {/* Error Message */}
                  {integration.lastError && integration.status === 'error' && (
                    <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: '#fca5a5' }}>
                      {integration.lastError}
                    </div>
                  )}

                  {/* Configuration Form - Show when not connected or when editing */}
                  {(integration.status === 'disconnected' || integration.status === 'error' || selectedIntegration?.provider === integration.provider) && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                          {integration.provider === 'twilio' ? 'Account SID' : 'API Key'}
                        </label>
                        <input
                          type="password"
                          placeholder={integration.hasApiKey ? '••••••••' : 'Enter your API key'}
                          value={selectedIntegration?.provider === integration.provider ? integrationFormData.apiKey : ''}
                          onChange={(e) => {
                            setSelectedIntegration(integration);
                            setIntegrationFormData(prev => ({ ...prev, apiKey: e.target.value }));
                          }}
                          onFocus={() => setSelectedIntegration(integration)}
                          style={{
                            width: '100%',
                            background: '#111',
                            border: '1px solid #333',
                            borderRadius: 8,
                            padding: '10px 12px',
                            fontSize: 14,
                            color: '#fff'
                          }}
                        />
                      </div>

                      {/* Additional fields for specific providers */}
                      {integration.provider === 'mailchimp' && (
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Server Prefix (e.g., us21)</label>
                          <input
                            type="text"
                            placeholder="us21"
                            value={selectedIntegration?.provider === integration.provider ? integrationFormData.serverPrefix : (integration.extraConfig?.server_prefix || '')}
                            onChange={(e) => setIntegrationFormData(prev => ({ ...prev, serverPrefix: e.target.value }))}
                            style={{
                              width: '100%',
                              background: '#111',
                              border: '1px solid #333',
                              borderRadius: 8,
                              padding: '10px 12px',
                              fontSize: 14,
                              color: '#fff'
                            }}
                          />
                        </div>
                      )}

                      {(integration.provider === 'twilio' || integration.provider === 'ticketmaster') && (
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                            {integration.provider === 'twilio' ? 'Auth Token' : 'API Secret'}
                          </label>
                          <input
                            type="password"
                            placeholder="Enter secret"
                            value={selectedIntegration?.provider === integration.provider ? integrationFormData.apiSecret : ''}
                            onChange={(e) => setIntegrationFormData(prev => ({ ...prev, apiSecret: e.target.value }))}
                            style={{
                              width: '100%',
                              background: '#111',
                              border: '1px solid #333',
                              borderRadius: 8,
                              padding: '10px 12px',
                              fontSize: 14,
                              color: '#fff'
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* Save button - only show if form is being edited */}
                    {selectedIntegration?.provider === integration.provider && integrationFormData.apiKey && (
                      <button
                        onClick={() => saveIntegrationConfig(integration.provider)}
                        disabled={integrationLoading === integration.provider}
                        style={{
                          background: integration.color,
                          color: '#000',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: integrationLoading === integration.provider ? 0.6 : 1
                        }}
                      >
                        {integrationLoading === integration.provider ? 'Saving...' : 'Save'}
                      </button>
                    )}

                    {/* Test Connection */}
                    {integration.hasApiKey && (
                      <button
                        onClick={() => testIntegration(integration.provider)}
                        disabled={integrationLoading === integration.provider}
                        style={{
                          background: '#1a1a1a',
                          color: '#fff',
                          border: '1px solid #333',
                          padding: '8px 16px',
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: 'pointer',
                          opacity: integrationLoading === integration.provider ? 0.6 : 1
                        }}
                      >
                        {integrationLoading === integration.provider ? 'Testing...' : 'Test Connection'}
                      </button>
                    )}

                    {/* Sync button - only for connected integrations */}
                    {integration.status === 'connected' && (integration.provider === 'eventbrite' || integration.provider === 'mailchimp') && (
                      <button
                        onClick={() => {
                          if (integration.provider === 'mailchimp') {
                            fetchMailchimpAudiences();
                            addToast('Select an audience to sync guests', 'info');
                          } else {
                            syncIntegration(integration.provider);
                          }
                        }}
                        disabled={integrationLoading === integration.provider}
                        style={{
                          background: '#22c55e20',
                          color: '#22c55e',
                          border: '1px solid #22c55e40',
                          padding: '8px 16px',
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: 'pointer',
                          opacity: integrationLoading === integration.provider ? 0.6 : 1
                        }}
                      >
                        {integrationLoading === integration.provider ? 'Syncing...' :
                         integration.provider === 'eventbrite' ? 'Sync Events & Tickets' : 'Sync to Mailchimp'}
                      </button>
                    )}

                    {/* Disconnect button */}
                    {integration.status === 'connected' && (
                      <button
                        onClick={() => disconnectIntegration(integration.provider)}
                        style={{
                          background: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #ef444440',
                          padding: '8px 16px',
                          borderRadius: 6,
                          fontSize: 13,
                          cursor: 'pointer'
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>

                  {/* Mailchimp Audiences Selector */}
                  {integration.provider === 'mailchimp' && integration.status === 'connected' && mailchimpAudiences.length > 0 && (
                    <div style={{ marginTop: 16, padding: 12, background: '#111', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Select audience to sync guests:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {mailchimpAudiences.map(audience => (
                          <button
                            key={audience.id}
                            onClick={() => syncIntegration('mailchimp', { audienceId: audience.id, guestFilter: 'all' })}
                            style={{
                              background: '#1a1a1a',
                              border: '1px solid #333',
                              color: '#fff',
                              padding: '10px 12px',
                              borderRadius: 6,
                              fontSize: 13,
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              justifyContent: 'space-between'
                            }}
                          >
                            <span>{audience.name}</span>
                            <span style={{ color: '#666' }}>{audience.memberCount} members</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Masked API Key display */}
                  {integration.hasApiKey && integration.apiKeyMasked && integration.status !== 'disconnected' && (
                    <div style={{ marginTop: 12, fontSize: 11, color: '#444' }}>
                      API Key: {integration.apiKeyMasked}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Help Section */}
            <div style={{ marginTop: 32, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>How to get API Keys</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>🎪 Eventbrite</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Go to <a href="https://www.eventbrite.com/platform/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#F6682F' }}>Eventbrite API Keys</a> → Create a Private Token
                  </div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>📧 Mailchimp</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Go to Account → Extras → <a href="https://admin.mailchimp.com/account/api/" target="_blank" rel="noopener noreferrer" style={{ color: '#FFE01B' }}>API Keys</a> → Create a Key
                  </div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>🎫 Ticketmaster</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Register at <a href="https://developer.ticketmaster.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#0068B3' }}>Ticketmaster Developer</a> → Get your API key
                  </div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>✉️ SendGrid</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Go to <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" style={{ color: '#1A82E2' }}>SendGrid API Keys</a> → Create API Key
                  </div>
                </div>
                <div style={{ padding: 12, background: '#111', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>📱 Twilio</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    Go to <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#F22F46' }}>Twilio Console</a> → Copy Account SID & Auth Token
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {qrModal.show && qrModal.guest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setQRModal({ show: false, guest: null })}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              padding: 32,
              animation: 'slideUp 0.3s ease',
              textAlign: 'center',
              minWidth: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>{qrModal.guest.name}</h3>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#666' }}>
              Party of {qrModal.guest.partySize} • {qrModal.guest.category === 'A' ? 'VIP' : qrModal.guest.category === 'B' ? 'Priority' : 'Standard'}
            </p>
            <QRCode data={generateGuestQRData(qrModal.guest)} size={200} />
            <p style={{ margin: '24px 0 0', fontSize: 12, color: '#444' }}>
              Scan to check in at the door
            </p>
            <button
              onClick={() => setQRModal({ show: false, guest: null })}
              style={{
                marginTop: 20,
                background: '#1a1a1a',
                border: 'none',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sponsor Detail Modal */}
      {selectedSponsor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setSelectedSponsor(null)}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              width: '100%',
              maxWidth: 600,
              padding: 32,
              animation: 'slideUp 0.3s ease',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: 16,
                  background: selectedSponsor.logoUrl ? `url(${selectedSponsor.logoUrl}) center/cover` : '#1a1a1a',
                  backgroundSize: 'cover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 32,
                  color: selectedSponsor.tier === 'platinum' ? '#e5e4e2' : selectedSponsor.tier === 'gold' ? '#d4af37' : '#666',
                }}>
                  {!selectedSponsor.logoUrl && '◆'}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{selectedSponsor.companyName}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#888' }}>{selectedSponsor.contactName} • {selectedSponsor.email}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span style={{
                      background: selectedSponsor.tier === 'platinum' ? '#e5e4e220' : selectedSponsor.tier === 'gold' ? '#d4af3720' : '#66666620',
                      color: selectedSponsor.tier === 'platinum' ? '#e5e4e2' : selectedSponsor.tier === 'gold' ? '#d4af37' : '#666',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {selectedSponsor.tier}
                    </span>
                    <span style={{
                      background: selectedSponsor.status === 'approved' || selectedSponsor.status === 'active' ? '#22c55e20' : selectedSponsor.status === 'pending' ? '#fbbf2420' : '#66666620',
                      color: selectedSponsor.status === 'approved' || selectedSponsor.status === 'active' ? '#22c55e' : selectedSponsor.status === 'pending' ? '#fbbf24' : '#888',
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {selectedSponsor.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSponsor(null)}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#666' }}>Message</h4>
              <p style={{ margin: 0, fontSize: 15, color: '#ccc', background: '#111', padding: 16, borderRadius: 8 }}>
                {selectedSponsor.message || 'No message provided'}
              </p>
            </div>

            {selectedSponsor.website && (
              <div style={{ background: '#111', padding: 16, borderRadius: 8, marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Website</div>
                <a href={selectedSponsor.website} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: '#3b82f6' }}>
                  {selectedSponsor.website}
                </a>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#666' }}>Upload Logo</h4>
              <label style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                border: '2px dashed #333',
                borderRadius: 12,
                cursor: 'pointer',
                background: '#0f0f0f',
              }}>
                <span style={{ fontSize: 32, marginBottom: 8 }}>📁</span>
                <span style={{ fontSize: 14, color: '#888' }}>{selectedSponsor.logoUrl ? 'Change logo' : 'Click to upload logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleLogoUpload(selectedSponsor.id, file);
                      setSelectedSponsor({ ...selectedSponsor, logoUrl: URL.createObjectURL(file) });
                    }
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              {selectedSponsor.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      updateSponsor(selectedSponsor.id, { status: 'approved' });
                      setSelectedSponsor({ ...selectedSponsor, status: 'approved' });
                    }}
                    style={{
                      flex: 1,
                      background: '#22c55e',
                      border: 'none',
                      color: '#000',
                      padding: '12px 24px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Approve Sponsor
                  </button>
                  <button
                    onClick={() => {
                      updateSponsor(selectedSponsor.id, { status: 'declined' });
                      setSelectedSponsor({ ...selectedSponsor, status: 'declined' });
                    }}
                    style={{
                      flex: 1,
                      background: '#ef444420',
                      border: '1px solid #ef444440',
                      color: '#ef4444',
                      padding: '12px 24px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Decline
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedSponsor(null)}
                style={{
                  flex: selectedSponsor.status !== 'pending' ? 1 : 0,
                  minWidth: selectedSponsor.status !== 'pending' ? 'auto' : 100,
                  background: '#1a1a1a',
                  border: 'none',
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flyer Generator Modal */}
      {showFlyerGenerator && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setShowFlyerGenerator(false)}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              padding: 24,
              animation: 'slideUp 0.3s ease',
              maxHeight: '95vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Event Flyer Generator</h2>
              <button
                onClick={() => setShowFlyerGenerator(false)}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* Flyer Preview */}
            <div
              ref={flyerRef}
              style={{
                width: 600,
                height: 800,
                background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)',
                borderRadius: 16,
                padding: 40,
                position: 'relative',
                overflow: 'hidden',
                marginBottom: 20,
              }}
            >
              {/* Gold border effect */}
              <div style={{ position: 'absolute', inset: 0, border: '2px solid #d4af37', borderRadius: 16, opacity: 0.5 }} />

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <h1 style={{ fontSize: 48, fontWeight: 700, color: '#d4af37', margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>BERRY BLY</h1>
                <p style={{ fontSize: 14, color: '#666', letterSpacing: 4, textTransform: 'uppercase', margin: 0 }}>Luxury Events</p>
              </div>

              {/* Event Info */}
              <div style={{ textAlign: 'center', marginBottom: 60 }}>
                <h2 style={{ fontSize: 32, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>EXCLUSIVE EVENT</h2>
                <p style={{ fontSize: 18, color: '#888', margin: 0 }}>An Unforgettable Night</p>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 60 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#d4af37' }}>{stats.total}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>Guests</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#a78bfa' }}>{stats.vip}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>VIP</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#22c55e' }}>{sponsorStats.active}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>Sponsors</div>
                </div>
              </div>

              {/* Sponsor Logos */}
              {sponsors.filter(s => s.status === 'approved' || s.status === 'active').length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <p style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2 }}>Sponsored By</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                    {sponsors.filter(s => s.status === 'approved' || s.status === 'active').slice(0, 6).map(sponsor => (
                      <div
                        key={sponsor.id}
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 12,
                          background: sponsor.logoUrl ? `url(${sponsor.logoUrl}) center/contain no-repeat` : '#1a1a1a',
                          backgroundSize: 'contain',
                          border: '1px solid #333',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          color: '#666',
                          padding: 8,
                          textAlign: 'center',
                        }}
                      >
                        {!sponsor.logoUrl && sponsor.companyName.substring(0, 10)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ position: 'absolute', bottom: 40, left: 40, right: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#d4af37', marginBottom: 8 }}>berrybly.com</div>
                <div style={{ fontSize: 11, color: '#444' }}>Follow @berrybly on Instagram</div>
              </div>
            </div>

            <button
              onClick={downloadFlyer}
              style={{
                width: '100%',
                background: '#d4af37',
                border: 'none',
                color: '#000',
                padding: '14px 24px',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download Flyer (PNG)
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmation.show && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setConfirmation({ show: false, guests: [], category: null, emailOnly: false })}
        >
          <div
            className="modal-content"
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              animation: 'slideUp 0.3s ease',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                  {confirmation.emailOnly ? '✉ Send Email' : '→ Confirm Action'}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 15, color: '#666' }}>
                  {confirmation.guests.length === 1 ? confirmation.guests[0].name : `${confirmation.guests.length} guests selected`}
                </p>
              </div>
              <button
                onClick={() => setConfirmation({ show: false, guests: [], category: null, emailOnly: false })}
                style={{
                  background: '#1a1a1a',
                  border: 'none',
                  color: '#888',
                  fontSize: 18,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ background: '#111', borderRadius: 10, padding: 4, marginBottom: 16, maxHeight: 120, overflow: 'auto' }}>
              {confirmation.guests.map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 8,
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      color: '#666',
                      flexShrink: 0,
                    }}>
                      {g.name.charAt(0)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, display: 'block' }}>{g.name}</span>
                      <div style={{ fontSize: 13, color: '#666' }}>{g.email}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 13,
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontWeight: 500,
                    flexShrink: 0,
                    background: confirmation.emailOnly ? '#22c55e15' : confirmation.category === 'A' ? '#a78bfa15' : confirmation.category === 'B' ? '#60a5fa15' : '#33333340',
                    color: confirmation.emailOnly ? '#22c55e' : confirmation.category === 'A' ? '#a78bfa' : confirmation.category === 'B' ? '#60a5fa' : '#888',
                  }}>
                    {confirmation.emailOnly ? 'Email' : catLabel(confirmation.category)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, color: '#666', marginBottom: 8, fontWeight: 500 }}>Message</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="input-focus"
                style={{
                  width: '100%',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: 10,
                  padding: 12,
                  color: '#fff',
                  fontSize: 15,
                  resize: 'none',
                  height: 80,
                  outline: 'none',
                  lineHeight: 1.5,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={sendInvitations}
                disabled={sending}
                className="btn-hover"
                style={{
                  background: '#fff',
                  color: '#000',
                  border: 'none',
                  padding: '14px 20px',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  opacity: sending ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                {sending ? (
                  <>
                    <div style={{ width: 18, height: 18, border: '2px solid #888', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Sending...
                  </>
                ) : (
                  confirmation.emailOnly
                    ? `Send ${confirmation.guests.length > 1 ? confirmation.guests.length + ' Emails' : 'Email'}`
                    : `Accept & Send ${confirmation.guests.length > 1 ? confirmation.guests.length : ''} Invitation${confirmation.guests.length > 1 ? 's' : ''}`
                )}
              </button>
              {!confirmation.emailOnly && (
                <button
                  onClick={moveOnly}
                  style={{
                    background: 'transparent',
                    color: '#888',
                    border: '1px solid #222',
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  Move without email
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Guest Modal */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="modal-content"
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              width: '100%',
              maxWidth: 420,
              padding: 24,
              animation: 'slideUp 0.3s ease',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>+ Add Guest</h2>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: '#1a1a1a',
                  border: 'none',
                  color: '#888',
                  fontSize: 18,
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input label="Full Name" placeholder="John Doe" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} required />
              <Input label="Email" placeholder="john@example.com" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} type="email" required />
              <Input label="Phone" placeholder="+1 (555) 000-0000" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
              <Input label="Instagram" placeholder="johndoe" value={formData.instagram} onChange={(v) => setFormData({ ...formData, instagram: v })} prefix="@" />
              <div className="form-row" style={{ display: 'flex', gap: 12 }}>
                <Input label="Party Size" placeholder="2" value={String(formData.partySize)} onChange={(v) => setFormData({ ...formData, partySize: parseInt(v) || 1 })} type="number" />
                <Input label="Event Date" value={formData.eventDate} onChange={(v) => setFormData({ ...formData, eventDate: v })} type="date" />
              </div>
              <button
                onClick={addGuest}
                className="btn-hover"
                style={{
                  background: '#fff',
                  color: '#000',
                  border: 'none',
                  padding: '14px 20px',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: 8,
                }}
              >
                Add Guest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Components
const CollapsibleMenu = ({
  title,
  expanded,
  onToggle,
  children,
  count
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}) => (
  <div style={{ marginBottom: 4 }}>
    <div
      onClick={onToggle}
      className="nav-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 12,
          color: '#666',
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>▶</span>
        <span style={{
          fontSize: 12,
          color: expanded ? '#888' : '#555',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 600,
        }}>{title}</span>
      </div>
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 11,
          color: '#555',
          background: '#1a1a1a',
          padding: '2px 6px',
          borderRadius: 4,
        }}>
          {count}
        </span>
      )}
    </div>
    <div style={{
      overflow: 'hidden',
      maxHeight: expanded ? '500px' : '0',
      transition: 'max-height 0.3s ease-in-out',
      paddingLeft: 8,
    }}>
      {children}
    </div>
  </div>
);

const NavItem = ({ label, active, icon, count, onClick }: { label: string; active: boolean; icon: string; count?: number; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="nav-hover"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: 8,
      background: active ? '#1a1a1a' : 'transparent',
      marginBottom: 4,
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, opacity: active ? 1 : 0.4 }}>{icon}</span>
      <span style={{ fontSize: 15, color: active ? '#fff' : '#888' }}>{label}</span>
    </div>
    {count !== undefined && (
      <span style={{
        fontSize: 13,
        color: '#666',
        background: active ? '#333' : '#1a1a1a',
        padding: '3px 8px',
        borderRadius: 5,
        fontWeight: 500,
      }}>
        {count}
      </span>
    )}
  </div>
);

const StatRow = ({ label, value, color, active, onClick }: { label: string; value: number; color: string; active?: boolean; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="stat-hover"
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 12px',
      borderRadius: 8,
      background: active ? '#1a1a1a' : 'transparent',
      marginLeft: -12,
      marginRight: -12,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 14, color: active ? '#fff' : '#888' }}>{label}</span>
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{value}</span>
  </div>
);

const StatCard = ({ label, value, icon, color, onClick }: { label: string; value: number | string; icon: string; color?: string; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="btn-hover"
    style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 12,
      padding: '16px 20px',
      cursor: 'pointer',
    }}
  >
    <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.6 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: color || '#fff', marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 14, color: '#666' }}>{label}</div>
  </div>
);

const MetricCard = ({ label, value, subtitle, color }: { label: string; value: number | string; subtitle: string; color: string }) => (
  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '20px' }}>
    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 36, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 13, color: '#444' }}>{subtitle}</div>
  </div>
);

const ChartBar = ({ value, max, label, color }: { value: number; max: number; label: string; color: string }) => {
  const height = max > 0 ? Math.max((value / max) * 140, 4) : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>{value}</div>
      <div
        className="chart-bar"
        style={{
          width: 40,
          height,
          background: color,
          borderRadius: 4,
        }}
      />
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
    </div>
  );
};

const CategoryCard = ({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="btn-hover"
    style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '16px 20px',
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 14, color: '#888' }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
  </div>
);

const TabButton = ({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) => (
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
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    {label}
    <span style={{
      background: active ? '#333' : '#1a1a1a',
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 13,
    }}>
      {count}
    </span>
  </button>
);

const ActionBtn = ({ onClick, color, label }: { onClick: () => void; color: string; label: string }) => (
  <button
    onClick={onClick}
    className="btn-hover"
    style={{
      background: `${color}15`,
      color,
      border: `1px solid ${color}30`,
      padding: '6px 12px',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);

const SmallBtn = ({ onClick, label, title, danger, color }: { onClick: () => void; label: string; title: string; danger?: boolean; color?: string }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: danger ? '#ef444415' : color ? `${color}15` : '#1a1a1a',
      color: danger ? '#ef4444' : color || '#888',
      border: danger ? '1px solid #ef444430' : color ? `1px solid ${color}30` : '1px solid #222',
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);

const StatusBadge = ({ category }: { category: GuestCategory }) => {
  const badgeStyles: Record<GuestCategory, { bg: string; color: string; label: string }> = {
    pending: { bg: '#fbbf2415', color: '#fbbf24', label: 'Pending' },
    A: { bg: '#a78bfa15', color: '#a78bfa', label: 'VIP' },
    B: { bg: '#60a5fa15', color: '#60a5fa', label: 'Priority' },
    C: { bg: '#6b728015', color: '#9ca3af', label: 'Standard' },
    rejected: { bg: '#ef444415', color: '#ef4444', label: 'Rejected' },
  };
  const s = badgeStyles[category];
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      padding: '4px 10px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 600,
      border: `1px solid ${s.color}25`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
};

const ScoreBadge = ({ score, getScoreColor }: { score: number; getScoreColor: (s: number) => string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 40, height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: getScoreColor(score), borderRadius: 3 }} />
    </div>
    <span style={{ fontSize: 13, fontWeight: 600, color: getScoreColor(score), minWidth: 24 }}>{score}</span>
  </div>
);

const Input = ({ label, placeholder, value, onChange, type = 'text', prefix, required }: {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  required?: boolean;
}) => (
  <div style={{ position: 'relative', flex: 1 }}>
    {label && (
      <label style={{ display: 'block', fontSize: 14, color: '#888', marginBottom: 6, fontWeight: 500 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
    )}
    <div style={{ position: 'relative' }}>
      {prefix && (
        <span style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#666',
          fontSize: 15,
        }}>
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-focus"
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #222',
          borderRadius: 10,
          padding: prefix ? '11px 12px 11px 28px' : '11px 12px',
          color: '#fff',
          fontSize: 15,
          outline: 'none',
        }}
      />
    </div>
  </div>
);

// Guest List Component
const GuestList = ({ guests, selectedGuests, toggleSelect, selectAll, openModal, removeGuest, showActions, setShowForm, categoryView, getScoreColor }: {
  guests: Guest[];
  selectedGuests: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  openModal: (guests: Guest[], category: GuestCategory | null, emailOnly?: boolean) => void;
  removeGuest: (id: string) => void;
  showActions: boolean;
  setShowForm: (show: boolean) => void;
  categoryView?: ViewType;
  getScoreColor: (score: number) => string;
}) => (
  <div className="page-content" style={{ padding: '0 32px 32px', animation: 'fadeIn 0.3s ease' }}>
    {/* Desktop Table */}
    <div className="table-wrapper desktop-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
            <th style={{ ...thStyle, width: 50 }}>
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={selectedGuests.size === guests.length && guests.length > 0}
                onChange={selectAll}
              />
            </th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={{ ...thStyle }} className="hide-tablet">Instagram</th>
            <th style={{ ...thStyle, width: 80 }}>AI Score</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, width: 180 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest, idx) => (
            <tr
              key={guest.id}
              className="row-hover"
              style={{
                borderBottom: '1px solid #111',
                animation: `fadeIn 0.3s ease ${idx * 0.02}s both`,
              }}
            >
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  className="checkbox-custom"
                  checked={selectedGuests.has(guest.id)}
                  onChange={() => toggleSelect(guest.id)}
                />
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#666',
                    flexShrink: 0,
                  }}>
                    {guest.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{guest.name}</div>
                    {guest.emailSent && (
                      <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Email sent</span>
                    )}
                  </div>
                </div>
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>{guest.email}</td>
              <td style={tdStyle} className="hide-tablet">
                {guest.instagram ? (
                  <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', fontSize: 14, textDecoration: 'none' }}>@{guest.instagram.replace('@', '')}</a>
                ) : (
                  <span style={{ color: '#333' }}>—</span>
                )}
              </td>
              <td style={tdStyle}>
                <ScoreBadge score={guest.aiScore || 0} getScoreColor={getScoreColor} />
              </td>
              <td style={tdStyle}>
                <StatusBadge category={guest.category} />
              </td>
              <td style={tdStyle}>
                <div className="action-buttons" style={{ display: 'flex', gap: 4 }}>
                  {showActions && !categoryView && (
                    <>
                      <SmallBtn onClick={() => openModal([guest], null, true)} label="✉" title="Send Email" color="#22c55e" />
                      <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />
                      <SmallBtn onClick={() => openModal([guest], 'B')} label="Pri" title="Move to Priority" color="#60a5fa" />
                      <SmallBtn onClick={() => openModal([guest], 'C')} label="Std" title="Move to Standard" />
                    </>
                  )}
                  {categoryView && (
                    <>
                      <SmallBtn onClick={() => openModal([guest], null, true)} label="✉" title="Send Email" color="#22c55e" />
                      {categoryView !== 'vip' && <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />}
                      {categoryView !== 'priority' && <SmallBtn onClick={() => openModal([guest], 'B')} label="Pri" title="Move to Priority" color="#60a5fa" />}
                      {categoryView !== 'standard' && <SmallBtn onClick={() => openModal([guest], 'C')} label="Std" title="Move to Standard" />}
                    </>
                  )}
                  <SmallBtn onClick={() => removeGuest(guest.id)} label="×" title="Remove" danger />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile Cards */}
    <div className="mobile-card" style={{ display: 'none' }}>
      {guests.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 12 }}>
          <input
            type="checkbox"
            className="checkbox-custom"
            checked={selectedGuests.size === guests.length && guests.length > 0}
            onChange={selectAll}
          />
          <span style={{ fontSize: 15, color: '#888' }}>Select all ({guests.length})</span>
        </div>
      )}

      {guests.map((guest, idx) => (
        <div
          key={guest.id}
          style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={selectedGuests.has(guest.id)}
              onChange={() => toggleSelect(guest.id)}
              style={{ marginTop: 4 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#666',
                  flexShrink: 0,
                }}>
                  {guest.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{guest.name}</div>
                  <div style={{ fontSize: 14, color: '#666' }}>{guest.email}</div>
                </div>
                <StatusBadge category={guest.category} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#666', marginBottom: 8 }}>
                {guest.instagram && <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', textDecoration: 'none' }}>@{guest.instagram.replace('@', '')}</a>}
                <span>Party: {guest.partySize}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#666' }}>AI Score:</span>
                <ScoreBadge score={guest.aiScore || 0} getScoreColor={getScoreColor} />
              </div>

              <div className="action-buttons" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showActions && !categoryView && (
                  <>
                    <SmallBtn onClick={() => openModal([guest], null, true)} label="✉ Email" title="Send Email" color="#22c55e" />
                    <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />
                    <SmallBtn onClick={() => openModal([guest], 'B')} label="Priority" title="Move to Priority" color="#60a5fa" />
                    <SmallBtn onClick={() => openModal([guest], 'C')} label="Standard" title="Move to Standard" />
                  </>
                )}
                {categoryView && (
                  <>
                    <SmallBtn onClick={() => openModal([guest], null, true)} label="✉ Email" title="Send Email" color="#22c55e" />
                    {categoryView !== 'vip' && <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />}
                    {categoryView !== 'priority' && <SmallBtn onClick={() => openModal([guest], 'B')} label="Priority" title="Move to Priority" color="#60a5fa" />}
                    {categoryView !== 'standard' && <SmallBtn onClick={() => openModal([guest], 'C')} label="Standard" title="Move to Standard" />}
                  </>
                )}
                <SmallBtn onClick={() => removeGuest(guest.id)} label="Remove" title="Remove" danger />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Empty State */}
    {guests.length === 0 && (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: 48, marginBottom: 16 }}>◈</div>
        <div style={{ color: '#666', fontSize: 16, marginBottom: 16 }}>No guests found</div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: '#111',
            color: '#888',
            border: '1px solid #222',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          + Add your first guest
        </button>
      </div>
    )}
  </div>
);

// Emails List Component
const EmailsList = ({ guests, selectedGuests, toggleSelect, selectAll, removeGuest, openModal, formatDate, getScoreColor }: {
  guests: Guest[];
  selectedGuests: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  removeGuest: (id: string) => void;
  openModal: (guests: Guest[], category: GuestCategory | null, emailOnly?: boolean) => void;
  formatDate: (date: string) => string;
  getScoreColor: (score: number) => string;
}) => (
  <div className="page-content" style={{ padding: '0 32px 32px', animation: 'fadeIn 0.3s ease' }}>
    {/* Desktop Table */}
    <div className="table-wrapper desktop-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
            <th style={{ ...thStyle, width: 50 }}>
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={selectedGuests.size === guests.length && guests.length > 0}
                onChange={selectAll}
              />
            </th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Category</th>
            <th style={{ ...thStyle, width: 80 }}>Score</th>
            <th style={thStyle}>Sent At</th>
            <th style={{ ...thStyle, width: 100 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest, idx) => (
            <tr
              key={guest.id}
              className="row-hover"
              style={{
                borderBottom: '1px solid #111',
                animation: `fadeIn 0.3s ease ${idx * 0.02}s both`,
              }}
            >
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  className="checkbox-custom"
                  checked={selectedGuests.has(guest.id)}
                  onChange={() => toggleSelect(guest.id)}
                />
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#22c55e15',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: '#22c55e',
                    flexShrink: 0,
                  }}>
                    ✓
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{guest.name}</span>
                </div>
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>{guest.email}</td>
              <td style={tdStyle}>
                <StatusBadge category={guest.category} />
              </td>
              <td style={tdStyle}>
                <ScoreBadge score={guest.aiScore || 0} getScoreColor={getScoreColor} />
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>
                {guest.emailSentAt ? formatDate(guest.emailSentAt) : '—'}
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <SmallBtn onClick={() => openModal([guest], null, true)} label="↻" title="Resend Email" color="#22c55e" />
                  <SmallBtn onClick={() => removeGuest(guest.id)} label="×" title="Remove" danger />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile Cards */}
    <div className="mobile-card" style={{ display: 'none' }}>
      {guests.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 12 }}>
          <input
            type="checkbox"
            className="checkbox-custom"
            checked={selectedGuests.size === guests.length && guests.length > 0}
            onChange={selectAll}
          />
          <span style={{ fontSize: 15, color: '#888' }}>Select all ({guests.length})</span>
        </div>
      )}

      {guests.map((guest, idx) => (
        <div
          key={guest.id}
          style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={selectedGuests.has(guest.id)}
              onChange={() => toggleSelect(guest.id)}
              style={{ marginTop: 4 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: '#22c55e15',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color: '#22c55e',
                  flexShrink: 0,
                }}>
                  ✓
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{guest.name}</div>
                  <div style={{ fontSize: 14, color: '#666' }}>{guest.email}</div>
                </div>
                <StatusBadge category={guest.category} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#666' }}>AI Score:</span>
                <ScoreBadge score={guest.aiScore || 0} getScoreColor={getScoreColor} />
              </div>

              {guest.emailSentAt && (
                <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
                  Sent: {formatDate(guest.emailSentAt)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <SmallBtn onClick={() => openModal([guest], null, true)} label="↻ Resend" title="Resend Email" color="#22c55e" />
                <SmallBtn onClick={() => removeGuest(guest.id)} label="Remove" title="Remove" danger />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Empty State */}
    {guests.length === 0 && (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: 48, marginBottom: 16 }}>✉</div>
        <div style={{ color: '#666', fontSize: 16 }}>No emails sent yet</div>
        <div style={{ color: '#444', fontSize: 14, marginTop: 8 }}>Send invitations from the Guests page</div>
      </div>
    )}
  </div>
);

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 16px',
  fontSize: 13,
  fontWeight: 600,
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  verticalAlign: 'middle',
};

export default App;
