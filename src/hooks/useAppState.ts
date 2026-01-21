// App State Hook - Centralized state management
import { useState, useRef } from 'react';
import type {
  Guest,
  QRModal,
  ScheduledEmail,
  ConfirmationModal,
  Toast,
  Filters,
  Model,
  TableReservation,
  Ticket,
  Order,
  OrderStats,
  Sponsor,
  Promoter,
  Event,
  ViewType,
  Integration,
  EventbriteMetrics,
  BudgetCategory,
  BudgetItem,
  Vendor,
  Staff,
  ClientAccess,
  SMSStats,
} from '../types';

// Initial Eventbrite Metrics
const initialEventbriteMetrics: EventbriteMetrics = {
  connected: false,
  totalEvents: 0,
  activeEvents: 0,
  totalTicketsSold: 0,
  totalRevenue: 0,
  totalAttendees: 0,
  checkedIn: 0,
  conversionRate: 0,
  events: [],
  totalPageViews: 0,
  totalUniqueVisitors: 0,
  totalGrossRevenue: 0,
  totalFees: 0,
  totalRefunds: 0,
  totalNetRevenue: 0,
  avgDailySales: 0,
  salesTrend: 'stable',
};

// Initial Filters
const initialFilters: Filters = {
  search: '',
  category: 'all',
  emailStatus: 'all',
  dateFrom: '',
  dateTo: '',
  scoreMin: 0,
  scoreMax: 100,
};

export function useAppState() {
  // Core Data
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // UI State
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('analytics');
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'revenue' | 'eventbrite' | 'guests'>('overview');
  const [eventbriteSubTab, setEventbriteSubTab] = useState<'analytics' | 'orders' | 'alerts' | 'create' | 'promos' | 'checkin' | 'email' | 'sms' | 'compare' | 'refunds' | 'reports'>('analytics');
  const [guestTab, setGuestTab] = useState<'pending' | 'all'>('pending');

  // Selection & Filters
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [confirmation, setConfirmation] = useState<ConfirmationModal>({ show: false, guests: [], category: null, emailOnly: false });
  const [qrModal, setQRModal] = useState<QRModal>({ show: false, guest: null });
  const [reminderModal, setReminderModal] = useState<{ show: boolean; guests: Guest[] }>({ show: false, guests: [] });
  const [showSmsModal, setShowSmsModal] = useState(false);

  // Forms
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', instagram: '', partySize: 1, eventDate: '', notes: '', gender: ''
  });
  const [customMessage, setCustomMessage] = useState('');
  const [reminderData, setReminderData] = useState({
    eventName: '', eventDate: '', eventTime: '', eventVenue: '', customMessage: ''
  });
  const [smsFormData, setSmsFormData] = useState({ to: '', message: '' });

  // Loading/Sending States
  const [sending, setSending] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingEventbrite, setSyncingEventbrite] = useState(false);
  const [loadingEventbriteMetrics, setLoadingEventbriteMetrics] = useState(false);

  // Timestamps
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Scheduled Emails
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);

  // Models
  const [models, setModels] = useState<Model[]>([]);
  const [modelStats, setModelStats] = useState({ total: 0, pending: 0, approved: 0, assigned: 0, declined: 0, avgScore: 0 });
  const [modelTab, setModelTab] = useState<'pending' | 'approved' | 'assigned' | 'all'>('pending');

  // Tables
  const [tables, setTables] = useState<TableReservation[]>([]);
  const [tableStats, setTableStats] = useState({ total: 0, pending: 0, confirmed: 0, revenue: 0 });
  const [tableZone, setTableZone] = useState<'all' | 'VIP' | 'Premium' | 'Standard' | 'Lounge'>('all');

  // Tickets & Orders
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketStats, setTicketStats] = useState({ total: 0, valid: 0, used: 0, revenue: 0 });
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats>({
    total_orders: 0, total_tickets: 0, total_revenue: 0, active_orders: 0, refunded_orders: 0
  });
  const [ticketView, setTicketView] = useState<'tickets' | 'orders'>('orders');
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [ticketFormData, setTicketFormData] = useState({
    holderName: '', holderEmail: '', ticketType: 'General', price: '0', eventId: ''
  });

  // Sponsors
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorStats, setSponsorStats] = useState({ total: 0, pending: 0, active: 0, revenue: 0 });
  const [selectedSponsor, setSelectedSponsor] = useState<Sponsor | null>(null);
  const [showFlyerGenerator, setShowFlyerGenerator] = useState(false);

  // Promoters
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [promoterStats, setPromoterStats] = useState({ total: 0, active: 0, totalSales: 0, totalCommission: 0 });
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [showPromoterForm, setShowPromoterForm] = useState(false);
  const [promoterFormData, setPromoterFormData] = useState({
    name: '', email: '', phone: '', commissionRate: '10', commissionType: 'percentage',
    bio: '', socialInstagram: '', socialTiktok: '', socialTwitter: ''
  });
  const [promoterLeaderboard, setPromoterLeaderboard] = useState<Promoter[]>([]);

  // Events
  const [events, setEvents] = useState<Event[]>([]);
  const [eventStats, setEventStats] = useState({
    total: 0, planning: 0, confirmed: 0, completed: 0, upcoming: 0, thisMonth: 0
  });
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [creatorTab, setCreatorTab] = useState<'basic' | 'design' | 'details' | 'rsvp' | 'visibility'>('basic');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [eventActionMenu, setEventActionMenu] = useState<number | null>(null);
  const [eventFormData, setEventFormData] = useState({
    name: '', eventDate: '', eventTime: '', endTime: '', eventType: 'party', description: '',
    venueName: '', venueAddress: '', venueCity: '',
    template: 'elegant-dark', coverImage: '', accentColor: '#d4af37',
    expectedAttendance: '', dressCode: '', theme: '', ageRestriction: '',
    rsvpEnabled: true, showGuestList: false, showGuestCount: true, allowPlusOne: true,
    maxPlusOne: 1, requireApproval: false,
    isPublic: false, slug: '', ticketLink: '', notes: '',
  });
  const [uploadingCover, setUploadingCover] = useState(false);

  // Budget
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetSummary, setBudgetSummary] = useState({
    totalBudget: 0, totalEstimatedExpenses: 0, totalActualExpenses: 0,
    totalEstimatedIncome: 0, totalActualIncome: 0, estimatedProfit: 0,
    actualProfit: 0, budgetRemaining: 0, paidCount: 0, pendingCount: 0
  });
  const [showBudgetItemForm, setShowBudgetItemForm] = useState(false);
  const [budgetItemFormData, setBudgetItemFormData] = useState({
    categoryId: '', description: '', vendorName: '', estimatedAmount: '',
    actualAmount: '', isPaid: false, dueDate: '', notes: ''
  });

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [vendorFormData, setVendorFormData] = useState({
    name: '', category: '', contactName: '', email: '', phone: '',
    website: '', city: '', notes: '', isPreferred: false
  });

  // Staff
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [staffStats, setStaffStats] = useState({ active: 0, inactive: 0, total: 0, avgRating: 0 });
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffFormData, setStaffFormData] = useState({
    name: '', email: '', phone: '', role: '', secondaryRole: '', photoUrl: '', instagram: '',
    hourlyRate: '', dayRate: '', experienceLevel: 'intermediate', skills: '', notes: '',
    emergencyContact: '', emergencyPhone: ''
  });
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Integrations
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [eventbriteMetrics, setEventbriteMetrics] = useState<EventbriteMetrics>(initialEventbriteMetrics);

  // Client Portal
  const [clientAccesses, setClientAccesses] = useState<ClientAccess[]>([]);
  const [showClientAccessForm, setShowClientAccessForm] = useState(false);
  const [clientAccessFormData, setClientAccessFormData] = useState({
    clientName: '', clientEmail: '', expiresInDays: '30',
    viewBudget: true, viewTimeline: true, viewStaff: false, viewVendors: false
  });

  // SMS Stats
  const [smsStats, setSmsStats] = useState<SMSStats>({
    total_conversations: 0, total_messages: 0, unread_messages: 0,
    human_takeover_count: 0, messages_today: 0
  });

  return {
    // Core
    guests, setGuests,
    loading, setLoading,
    toasts, setToasts,

    // UI
    showForm, setShowForm,
    showImportModal, setShowImportModal,
    sidebarOpen, setSidebarOpen,
    activeView, setActiveView,
    dashboardTab, setDashboardTab,
    eventbriteSubTab, setEventbriteSubTab,
    guestTab, setGuestTab,

    // Selection & Filters
    selectedGuests, setSelectedGuests,
    filters, setFilters,
    showFilters, setShowFilters,

    // Modals
    confirmation, setConfirmation,
    qrModal, setQRModal,
    reminderModal, setReminderModal,
    showSmsModal, setShowSmsModal,

    // Forms
    formData, setFormData,
    customMessage, setCustomMessage,
    reminderData, setReminderData,
    smsFormData, setSmsFormData,

    // Loading States
    sending, setSending,
    smsSending, setSmsSending,
    isSyncing, setIsSyncing,
    syncingEventbrite, setSyncingEventbrite,
    loadingEventbriteMetrics, setLoadingEventbriteMetrics,

    // Timestamps
    lastSyncTime, setLastSyncTime,
    lastRefresh, setLastRefresh,

    // Scheduled Emails
    scheduledEmails, setScheduledEmails,

    // Models
    models, setModels,
    modelStats, setModelStats,
    modelTab, setModelTab,

    // Tables
    tables, setTables,
    tableStats, setTableStats,
    tableZone, setTableZone,

    // Tickets & Orders
    tickets, setTickets,
    ticketStats, setTicketStats,
    orders, setOrders,
    orderStats, setOrderStats,
    ticketView, setTicketView,
    showTicketForm, setShowTicketForm,
    showTicketPreview, setShowTicketPreview,
    ticketFormData, setTicketFormData,

    // Sponsors
    sponsors, setSponsors,
    sponsorStats, setSponsorStats,
    selectedSponsor, setSelectedSponsor,
    showFlyerGenerator, setShowFlyerGenerator,

    // Promoters
    promoters, setPromoters,
    promoterStats, setPromoterStats,
    selectedPromoter, setSelectedPromoter,
    showPromoterForm, setShowPromoterForm,
    promoterFormData, setPromoterFormData,
    promoterLeaderboard, setPromoterLeaderboard,

    // Events
    events, setEvents,
    eventStats, setEventStats,
    selectedEvent, setSelectedEvent,
    showEventForm, setShowEventForm,
    creatorTab, setCreatorTab,
    coverInputRef,
    eventActionMenu, setEventActionMenu,
    eventFormData, setEventFormData,
    uploadingCover, setUploadingCover,

    // Budget
    budgetCategories, setBudgetCategories,
    budgetItems, setBudgetItems,
    budgetSummary, setBudgetSummary,
    showBudgetItemForm, setShowBudgetItemForm,
    budgetItemFormData, setBudgetItemFormData,

    // Vendors
    vendors, setVendors,
    showVendorForm, setShowVendorForm,
    vendorFormData, setVendorFormData,

    // Staff
    staffMembers, setStaffMembers,
    staffStats, setStaffStats,
    showStaffForm, setShowStaffForm,
    staffFormData, setStaffFormData,
    selectedStaff, setSelectedStaff,

    // Integrations
    integrations, setIntegrations,
    eventbriteMetrics, setEventbriteMetrics,

    // Client Portal
    clientAccesses, setClientAccesses,
    showClientAccessForm, setShowClientAccessForm,
    clientAccessFormData, setClientAccessFormData,

    // SMS
    smsStats, setSmsStats,
  };
}

export type AppState = ReturnType<typeof useAppState>;
