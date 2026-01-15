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

// Feature 1: Alertas Inteligentes
export interface EventbriteAlert {
  id: number;
  user_id: number;
  event_id?: string;
  event_name?: string;
  alert_type: 'sales_threshold' | 'low_inventory' | 'refund_spike' | 'check_in_rate' | 'revenue_goal' | 'daily_sales' | 'conversion_drop';
  threshold_value: number;
  threshold_operator: 'gte' | 'lte' | 'eq' | 'gt' | 'lt';
  is_active: boolean;
  notification_channels: ('dashboard' | 'email' | 'sms')[];
  last_triggered_at?: string;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface EventbriteAlertNotification {
  id: number;
  alert_id: number;
  user_id: number;
  event_id?: string;
  alert_type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// Feature 2: Órdenes en Tiempo Real
export interface EventbriteOrder {
  id: string;
  user_id: number;
  event_id: string;
  event_name?: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string;
  status: 'placed' | 'refunded' | 'cancelled' | 'pending';
  costs?: {
    base_price: number;
    fees: number;
    tax: number;
  };
  gross_amount: number;
  fees: number;
  net_amount: number;
  ticket_count: number;
  attendees?: EventbriteAttendee[];
  promo_code?: string;
  order_date: string;
  created_at: string;
  updated_at: string;
}

export interface OrderDailyStats {
  date: string;
  total_orders: number;
  total_tickets: number;
  total_revenue: number;
}

// Feature 6: Promo Codes
export interface EventbritePromoCode {
  id: string;
  user_id: number;
  event_id?: string;
  event_name?: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  quantity_available?: number;
  quantity_sold: number;
  start_date?: string;
  end_date?: string;
  ticket_class_ids?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Feature 7: Attendees & Check-in
export interface EventbriteAttendee {
  id: string;
  user_id: number;
  event_id: string;
  event_name?: string;
  order_id?: string;
  ticket_class_id?: string;
  ticket_class_name?: string;
  name: string;
  email: string;
  phone?: string;
  status: 'attending' | 'not_attending' | 'cancelled';
  checked_in: boolean;
  checked_in_at?: string;
  checked_in_by?: string;
  barcode?: string;
  qr_code_url?: string;
  answers?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Feature 10: Refunds
export interface EventbriteRefund {
  id: number;
  user_id: number;
  order_id: string;
  event_id?: string;
  event_name?: string;
  attendee_ids?: string[];
  reason?: string;
  amount?: number;
  status: 'pending' | 'processed' | 'failed' | 'cancelled';
  eventbrite_refund_id?: string;
  processed_at?: string;
  processed_by?: string;
  created_at: string;
}

// Feature 9: Event Comparison
export interface EventComparison {
  events: {
    id: string;
    name: string;
    status: string;
    start_date: string;
    venue?: string;
    capacity: number;
    tickets_sold: number;
    gross_revenue: number;
    net_revenue: number;
    check_in_rate: number;
    conversion_rate: number;
  }[];
  metrics: {
    metric: string;
    values: (number | string)[];
    winner?: number;
  }[];
}

// Feature 3: Reports Summary
export interface EventbriteReportSummary {
  overview: {
    total_events: number;
    active_events: number;
    total_tickets_sold: number;
    total_revenue: number;
    total_attendees: number;
    total_checked_in: number;
  };
  financials: {
    gross_revenue: number;
    total_fees: number;
    total_refunds: number;
    net_revenue: number;
  };
  top_events: {
    id: string;
    name: string;
    tickets_sold: number;
    revenue: number;
  }[];
  orders_by_status: {
    status: string;
    count: number;
  }[];
}
