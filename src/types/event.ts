// Event Management Types

export type ViewType =
  | 'overview'
  | 'guests'
  | 'guest-approvals'
  | 'guest-approvals-men'
  | 'guest-approvals-women'
  | 'emails'
  | 'analytics'
  | 'automation'
  | 'checkin'
  | 'models'
  | 'tables'
  | 'tickets'
  | 'sponsors'
  | 'promoters'
  | 'events'
  | 'budget'
  | 'vendors'
  | 'staff'
  | 'monitoring'
  | 'integrations'
  | 'chatgpt'
  | 'sms'
  | 'eventbrite';

export interface Event {
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
  status: 'planning' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'upcoming' | 'past';
  coverImage?: string;
  theme?: string;
  dressCode?: string;
  ageRestriction?: string;
  ticketLink?: string;
  eventbriteUrl?: string;
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
