// Client Access & Portal Types

export interface ClientAccess {
  id: number;
  eventId: number;
  clientName: string;
  clientEmail: string;
  accessToken?: string;
  permissions: {
    viewBudget: boolean;
    viewTimeline: boolean;
    viewStaff: boolean;
    viewVendors: boolean;
  };
  lastAccessed?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
  portalUrl?: string;
}

export interface ClientPortalData {
  client: {
    name: string;
    email: string
  };
  event: {
    id: number;
    name: string;
    date: string;
    venue: string;
    city: string;
    status: string;
    expectedAttendance: number;
    theme?: string;
    dressCode?: string;
  };
  permissions: {
    viewBudget: boolean;
    viewTimeline: boolean;
    viewStaff: boolean;
    viewVendors: boolean;
  };
  budget?: {
    items: Array<{
      category: string;
      icon: string;
      description: string;
      estimatedAmount: number;
      actualAmount: number;
      isPaid: boolean;
      isIncome: boolean;
    }>;
    summary: {
      total_estimated_expenses: number;
      total_actual_expenses: number;
      total_estimated_income: number;
      total_actual_income: number;
      paid_count: number;
      pending_count: number;
    };
  };
  timeline?: Array<{
    time: string;
    title: string;
    description: string;
    location: string;
    is_critical: boolean;
    status: string;
  }>;
  checklist?: {
    items: Array<{
      category: string;
      item: string;
      is_completed: boolean;
      priority: string
    }>;
    completed: number;
    total: number;
  };
  staff?: Array<{
    name: string;
    role: string;
    photo_url: string;
    shift_start: string;
    shift_end: string;
    status: string;
  }>;
  vendors?: Array<{
    name: string;
    category: string;
    contract_title: string;
    status: string;
  }>;
}
