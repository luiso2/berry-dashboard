// Table Reservation Types

export interface TableReservation {
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
