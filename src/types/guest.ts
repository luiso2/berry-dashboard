// Guest Management Types

export type GuestCategory = 'pending' | 'A' | 'B' | 'C' | 'rejected';
export type GuestStatus = 'pending' | 'approved' | 'declined' | 'rejected';

export interface Purchase {
  id: string;
  eventId: string;
  eventName: string;
  ticketType: string;
  amount: number;
  currency: string;
  purchaseDate: string;
  status: 'completed' | 'pending' | 'refunded';
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  partySize: number;
  eventDate: string;
  notes?: string;
  category: GuestCategory;
  status?: GuestStatus;
  emailSent?: boolean;
  emailSentAt?: string;
  createdAt: string;
  checkedInAt?: string;
  eventId?: number;
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
  gender?: string;
}

export interface QRModal {
  show: boolean;
  guest: Guest | null;
}

export interface ScheduledEmail {
  id: string;
  guestId: string;
  guestName: string;
  scheduledFor: string;
  type: 'reminder' | 'followup' | 'invitation';
  status: 'pending' | 'sent' | 'cancelled';
}

export interface ConfirmationModal {
  show: boolean;
  guests: Guest[];
  category: GuestCategory | null;
  emailOnly?: boolean;
}

export interface Filters {
  search: string;
  category: GuestCategory | 'all';
  emailStatus: 'all' | 'sent' | 'not_sent';
  dateFrom: string;
  dateTo: string;
  scoreMin: number;
  scoreMax: number;
}
