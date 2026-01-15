// Integration & Eventbrite Types

export interface Integration {
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
  connectedUser?: {
    name: string;
    email: string;
  };
}

export interface EventbriteMetrics {
  connected: boolean;
  organizationName?: string;
  totalEvents: number;
  activeEvents: number;
  totalTicketsSold: number;
  totalRevenue: number;
  totalAttendees: number;
  checkedIn: number;
  conversionRate: number;
  events: EventbriteEventMetrics[];
  lastSync?: string;
  // Funnel metrics (aggregated)
  totalPageViews: number;
  totalUniqueVisitors: number;
  // Financial breakdown
  totalGrossRevenue: number;
  totalFees: number;
  totalRefunds: number;
  totalNetRevenue: number;
  // Sales velocity for prediction
  avgDailySales: number;
  salesTrend: 'up' | 'down' | 'stable';
}

export interface EventbriteEventMetrics {
  id: string;
  name: string;
  status: 'draft' | 'live' | 'started' | 'ended' | 'completed' | 'canceled';
  startDate: string;
  endDate?: string;
  venue?: string;
  url: string;
  capacity: number;
  ticketsSold: number;
  ticketsRemaining: number;
  grossRevenue: number;
  netRevenue: number;
  fees: number;
  refunds: number;
  pageViews: number;
  uniqueVisitors: number;
  conversionRate: number;
  attendees: {
    registered: number;
    checkedIn: number;
    noShow: number;
  };
  ticketTypes: {
    name: string;
    price: number;
    sold: number;
    remaining: number;
    revenue: number;
  }[];
  salesByDay: {
    date: string;
    tickets: number;
    revenue: number;
  }[];
}
