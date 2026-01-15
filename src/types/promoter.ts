// Promoter Types

export interface Promoter {
  id: number;
  name: string;
  email: string;
  phone?: string;
  code: string;
  commissionRate: number;
  commissionType: 'percentage' | 'fixed';
  status: 'active' | 'inactive' | 'pending';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  bio?: string;
  photoUrl?: string;
  socialInstagram?: string;
  socialTiktok?: string;
  socialTwitter?: string;
  totalSales: number;
  totalCommission: number;
  totalTicketsSold: number;
  totalGuestsReferred: number;
  lastSaleAt?: string;
  createdAt: string;
}
