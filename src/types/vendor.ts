// Vendor Types

export interface Vendor {
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
