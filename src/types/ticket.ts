// Ticket & Order Types

export interface Ticket {
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

export interface Order {
  id: string;
  event_id: string;
  event_name: string;
  source: string;
  buyer_name: string;
  buyer_email: string;
  order_status: string;
  ticket_count: number;
  total_amount: number;
  currency: string;
  tickets: {
    id: string;
    name: string;
    email: string;
    ticketType: string;
    checkedIn: boolean
  }[];
  created_at: string;
}

export interface OrderStats {
  total_orders: number;
  total_tickets: number;
  total_revenue: number;
  active_orders: number;
  refunded_orders: number;
  orders_today?: number;
  revenue_today?: number;
}
