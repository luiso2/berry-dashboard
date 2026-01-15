// Model Management Types

export interface Model {
  id: string;
  eventId?: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  photos: string[];
  height?: string;
  experienceLevel: 'beginner' | 'intermediate' | 'professional';
  availability?: {
    weekdays?: boolean;
    weekends?: boolean;
    specificDates?: string[]
  };
  notes?: string;
  status: 'pending' | 'approved' | 'declined' | 'rejected' | 'assigned';
  aiScore?: number;
  eventsAssigned?: {
    eventId: string;
    eventName: string;
    date: string;
    role?: string
  }[];
  createdAt: string;
  updatedAt?: string;
}
