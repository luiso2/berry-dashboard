import { useState, useEffect, useCallback, useMemo } from 'react';
import { QRCode, generateGuestQRData } from './components/QRCode';

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
    default: return 'pending';
  }
};

const categoryToStatus = (category: GuestCategory): string => {
  switch (category) {
    case 'A': return 'approved';
    case 'B': return 'approved'; // B also maps to approved
    case 'C': return 'declined';
    default: return 'pending';
  }
};

type GuestCategory = 'pending' | 'A' | 'B' | 'C';
type GuestStatus = 'pending' | 'approved' | 'declined';
type ViewType = 'overview' | 'guests' | 'emails' | 'vip' | 'priority' | 'standard' | 'analytics' | 'activity' | 'automation' | 'checkin';
type ThemeMode = 'dark' | 'light';

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
  engagementScore?: number;
  attendanceHistory?: number;
  aiScore?: number;
}

interface QRModal {
  show: boolean;
  guest: Guest | null;
}

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  guestName?: string;
  timestamp: string;
  type: 'email' | 'category' | 'guest' | 'system';
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

// AI Score Calculator
const calculateAIScore = (guest: Guest): number => {
  let score = 50; // Base score

  // Instagram followers (0-30 points)
  const followers = guest.instagramFollowers || estimateFollowers(guest.instagram);
  if (followers > 100000) score += 30;
  else if (followers > 50000) score += 25;
  else if (followers > 10000) score += 20;
  else if (followers > 5000) score += 15;
  else if (followers > 1000) score += 10;
  else if (followers > 500) score += 5;

  // Party size (0-10 points)
  score += Math.min(guest.partySize * 2, 10);

  // Has Instagram (5 points)
  if (guest.instagram) score += 5;

  // Has phone (3 points)
  if (guest.phone) score += 3;

  // Category bonus
  if (guest.category === 'A') score += 10;
  else if (guest.category === 'B') score += 5;

  // Previous attendance (simulated)
  score += (guest.attendanceHistory || 0) * 5;

  return Math.min(Math.max(score, 0), 100);
};

// Estimate followers from Instagram username (simulated)
const estimateFollowers = (instagram: string): number => {
  if (!instagram) return 0;
  // Simulated based on username length and common patterns
  const hash = instagram.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return Math.floor((hash % 50000) + 100);
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

  * {
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

  @media (max-width: 1024px) {
    .hide-tablet {
      display: none !important;
    }
  }

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

    .stats-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }

    .category-grid {
      grid-template-columns: 1fr !important;
    }

    .chart-grid {
      grid-template-columns: 1fr !important;
    }

    .filter-row {
      flex-direction: column !important;
    }
  }

  @media (max-width: 480px) {
    .stats-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;

function App() {
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
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
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

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const addActivity = (action: string, details: string, guestName?: string, type: ActivityLog['type'] = 'system') => {
    const newActivity: ActivityLog = {
      id: Date.now().toString(),
      action,
      details,
      guestName,
      timestamp: new Date().toISOString(),
      type,
    };
    setActivityLog((prev) => [newActivity, ...prev].slice(0, 100)); // Keep last 100
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
    addActivity('Session Started', 'Dashboard loaded', undefined, 'system');
    const interval = autoRefresh ? setInterval(() => {
      fetchGuests();
      setLastRefresh(new Date());
    }, 10000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [fetchGuests, autoRefresh]);

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
        addActivity('Guest Checked In', `${guest.name} (Party of ${guest.partySize})`, guest.name, 'guest');
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

    return {
      total, pending, vip, priority, standard, emailsSent, accepted,
      avgScore, highScoreGuests, totalPartySize, conversionRate, emailRate,
      checkedIn, checkedInPartySize, checkInRate,
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
      g.aiScore || 0,
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
    addActivity('Export CSV', `${filteredGuests.length} guests exported`, undefined, 'system');
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
          addActivity('Email Sent', `Invitation sent to ${guest.email}`, guest.name, 'email');
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
        addActivity('Category Changed', `Moved to ${catLabel(confirmation.category)}`, guest.name, 'category');
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
      addActivity('Guest Removed', `${guest?.name} was removed from the list`, guest?.name, 'guest');
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
      addActivity('Guest Added', `${newGuest.name} was added to the list`, newGuest.name, 'guest');
    } catch (e) {
      addToast('Failed to add guest', 'error');
    }
  };

  const catLabel = (c: GuestCategory | null) => ({ A: 'VIP', B: 'Priority', C: 'Standard', pending: 'Pending' }[c || 'pending']);

  const getViewTitle = () => {
    switch (activeView) {
      case 'overview': return 'Overview';
      case 'emails': return 'Emails Sent';
      case 'vip': return 'VIP Guests';
      case 'priority': return 'Priority Guests';
      case 'standard': return 'Standard Guests';
      case 'analytics': return 'Analytics';
      case 'activity': return 'Activity Log';
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
      case 'activity': return `${activityLog.length} recent actions`;
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
            style={{ display: 'none', background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer', padding: 4 }}
          >
            ×
          </button>
        </div>

        <nav style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, paddingLeft: 12 }}>Main</div>
          <NavItem label="Overview" active={activeView === 'overview'} icon="◈" onClick={() => navigateTo('overview')} />
          <NavItem label="Guests" active={activeView === 'guests'} icon="◉" count={stats.total} onClick={() => navigateTo('guests')} />
          <NavItem label="Emails Sent" active={activeView === 'emails'} icon="✉" count={stats.emailsSent} onClick={() => navigateTo('emails')} />

          <div style={{ fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: '1px', margin: '24px 0 8px', paddingLeft: 12 }}>Intelligence</div>
          <NavItem label="Analytics" active={activeView === 'analytics'} icon="◐" onClick={() => navigateTo('analytics')} />
          <NavItem label="Activity Log" active={activeView === 'activity'} icon="◷" count={activityLog.length} onClick={() => navigateTo('activity')} />
          <NavItem label="Automation" active={activeView === 'automation'} icon="⚡" count={scheduledEmails.filter(e => e.status === 'pending').length} onClick={() => navigateTo('automation')} />

          <div style={{ fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: '1px', margin: '24px 0 8px', paddingLeft: 12 }}>Event Day</div>
          <NavItem label="Check-In" active={activeView === 'checkin'} icon="✓" count={stats.checkedIn} onClick={() => navigateTo('checkin')} />
        </nav>

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
              style={{ display: 'none', background: '#1a1a1a', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, flexShrink: 0 }}
            >
              ☰
            </button>
            <div style={{ animation: 'fadeIn 0.3s ease', minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.4px' }}>{getViewTitle()}</h1>
              <p style={{ fontSize: 15, color: '#666', margin: '4px 0 0' }}>{getViewSubtitle()}</p>
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
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#666', padding: '4px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              title="Keyboard shortcuts"
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
                  ↓ Export
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
          <div style={{ padding: '16px 32px', borderBottom: '1px solid #1a1a1a', background: '#050505' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
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
                      <div style={{ fontSize: 13, color: '#666' }}>@{guest.instagram || 'no-ig'}</div>
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

            {/* Recent Activity */}
            {activityLog.length > 0 && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#888' }}>Recent Activity</h3>
                <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
                  {activityLog.slice(0, 5).map((activity, idx) => (
                    <div key={activity.id} style={{ padding: '14px 16px', borderBottom: idx < 4 ? '1px solid #1a1a1a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: activity.type === 'email' ? '#3b82f615' : activity.type === 'category' ? '#a78bfa15' : activity.type === 'guest' ? '#22c55e15' : '#1a1a1a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          color: activity.type === 'email' ? '#3b82f6' : activity.type === 'category' ? '#a78bfa' : activity.type === 'guest' ? '#22c55e' : '#666',
                        }}>
                          {activity.type === 'email' ? '✉' : activity.type === 'category' ? '→' : activity.type === 'guest' ? '◉' : '◷'}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{activity.action}</div>
                          <div style={{ fontSize: 13, color: '#666' }}>{activity.details}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: '#444' }}>{formatDate(activity.timestamp)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
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
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', padding: 24 }}>
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
          </div>
        )}

        {/* Activity Log Page */}
        {activeView === 'activity' && (
          <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              {activityLog.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ color: '#333', fontSize: 48, marginBottom: 16 }}>◷</div>
                  <div style={{ color: '#666', fontSize: 16 }}>No activity yet</div>
                  <div style={{ color: '#444', fontSize: 14, marginTop: 8 }}>Actions will appear here as you use the dashboard</div>
                </div>
              ) : (
                activityLog.map((activity, idx) => (
                  <div key={activity.id} style={{ padding: '16px 20px', borderBottom: idx < activityLog.length - 1 ? '1px solid #1a1a1a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: `fadeIn 0.3s ease ${idx * 0.02}s both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: activity.type === 'email' ? '#3b82f615' : activity.type === 'category' ? '#a78bfa15' : activity.type === 'guest' ? '#22c55e15' : '#1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        color: activity.type === 'email' ? '#3b82f6' : activity.type === 'category' ? '#a78bfa' : activity.type === 'guest' ? '#22c55e' : '#666',
                      }}>
                        {activity.type === 'email' ? '✉' : activity.type === 'category' ? '→' : activity.type === 'guest' ? '◉' : '◷'}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{activity.action}</div>
                        <div style={{ fontSize: 14, color: '#666' }}>{activity.details}</div>
                        {activity.guestName && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Guest: {activity.guestName}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, color: '#888' }}>{formatDate(activity.timestamp)}</div>
                      <div style={{
                        fontSize: 12,
                        color: activity.type === 'email' ? '#3b82f6' : activity.type === 'category' ? '#a78bfa' : activity.type === 'guest' ? '#22c55e' : '#666',
                        marginTop: 4,
                        textTransform: 'uppercase',
                      }}>
                        {activity.type}
                      </div>
                    </div>
                  </div>
                ))
              )}
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
                    addActivity('Emails Scheduled', `${noEmail.length} reminder emails scheduled for tomorrow`, undefined, 'system');
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

            {/* Quick Check-In Search */}
            <div style={{ marginBottom: 24 }}>
              <input
                type="text"
                placeholder="Search guest name to check in..."
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
            </div>

            {/* Approved Guests List for Check-In */}
            <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Approved Guests</span>
                <span style={{ fontSize: 14, color: '#666' }}>{guests.filter(g => g.category !== 'pending').length} guests</span>
              </div>
              {guests
                .filter(g => g.category !== 'pending')
                .filter(g => !filters.search || g.name.toLowerCase().includes(filters.search.toLowerCase()))
                .sort((a, b) => {
                  // Sort: not checked in first, then by name
                  if (a.checkedInAt && !b.checkedInAt) return 1;
                  if (!a.checkedInAt && b.checkedInAt) return -1;
                  return a.name.localeCompare(b.name);
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
                          {guest.checkedInAt && (
                            <span style={{ fontSize: 12, color: '#22c55e' }}>
                              Checked in {formatDate(guest.checkedInAt)}
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
                  <span style={{ color: '#888', fontSize: 14 }}>@{guest.instagram.replace('@', '')}</span>
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
                {guest.instagram && <span>@{guest.instagram.replace('@', '')}</span>}
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
