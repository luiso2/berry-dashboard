export type GuestCategory = 'pending' | 'A' | 'B' | 'C';

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  partySize: number;
  eventDate: string;
  notes?: string;
  category: GuestCategory;
  createdAt: Date;
}
