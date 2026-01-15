// Staff Management Types

export interface Staff {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  secondaryRole?: string;
  photoUrl?: string;
  instagram?: string;
  hourlyRate?: number;
  dayRate?: number;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  skills?: string[];
  notes?: string;
  status: 'active' | 'inactive' | 'unavailable';
  rating: number;
  totalEvents: number;
  totalEarned: number;
  availability?: {
    weekdays: boolean;
    weekends: boolean
  };
  emergencyContact?: string;
  emergencyPhone?: string;
  createdAt: string;
  assignmentsCount?: number;
  upcomingEvents?: number;
}
