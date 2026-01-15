// Sponsor Types

export interface Sponsor {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  logoUrl?: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'title';
  tierPrice: number;
  message?: string;
  status: 'pending' | 'contacted' | 'negotiating' | 'approved' | 'declined' | 'active';
  contractSigned: boolean;
  paymentStatus: 'pending' | 'partial' | 'complete';
  benefits: string[];
  createdAt: string;
}
