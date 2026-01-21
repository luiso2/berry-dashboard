// Status/Category mapping utilities
// Backend uses 'status', dashboard uses 'category'

import type { GuestCategory } from '../types';

/**
 * Convert backend status to dashboard category
 */
export const statusToCategory = (status: string): GuestCategory => {
  switch (status) {
    case 'approved': return 'A';
    case 'declined': return 'C';
    case 'rejected': return 'rejected';
    default: return 'pending';
  }
};

