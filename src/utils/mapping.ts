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

/**
 * Convert dashboard category to backend status
 */
export const categoryToStatus = (category: GuestCategory): string => {
  switch (category) {
    case 'A': return 'approved';
    case 'B': return 'approved'; // B also maps to approved
    case 'C': return 'declined';
    case 'rejected': return 'rejected';
    default: return 'pending';
  }
};
