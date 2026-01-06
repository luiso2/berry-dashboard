// Berry Dashboard API Service
// Connects to the production Railway backend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface GuestEntry {
  id: number;
  eventId: number;
  name: string;
  email: string;
  phone?: string;
  instagram?: string;
  partySize: number;
  status: 'pending' | 'approved' | 'declined';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  checkedInAt?: string;
  // Extended fields
  instagramFollowers?: number;
  aiScore?: number;
}

export interface GuestListStats {
  total: number;
  pending: number;
  approved: number;
  declined: number;
  totalPartySize: number;
}

export interface Event {
  id: number;
  name: string;
  date: string;
  venue?: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Get all guest list entries with filters
export async function getGuestListEntries(filters: {
  status?: string;
  eventId?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<PaginatedResponse<GuestEntry>> {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.eventId) params.append('eventId', String(filters.eventId));
  if (filters.limit) params.append('limit', String(filters.limit));
  if (filters.offset) params.append('offset', String(filters.offset));

  const res = await fetch(`${API_URL}/api/v1/guest-lists?${params}`);
  if (!res.ok) throw new Error('Failed to fetch guest list');
  return res.json();
}

// Get statistics
export async function getGuestListStats(eventId?: number): Promise<GuestListStats> {
  const url = eventId
    ? `${API_URL}/api/v1/guest-lists/stats?eventId=${eventId}`
    : `${API_URL}/api/v1/guest-lists/stats`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

// Approve entry
export async function approveEntry(entryId: number): Promise<GuestEntry> {
  const res = await fetch(`${API_URL}/api/v1/guest-lists/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  if (!res.ok) throw new Error('Failed to approve entry');
  return res.json();
}

// Decline entry
export async function declineEntry(entryId: number): Promise<GuestEntry> {
  const res = await fetch(`${API_URL}/api/v1/guest-lists/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'declined' }),
  });
  if (!res.ok) throw new Error('Failed to decline entry');
  return res.json();
}

// Set entry back to pending
export async function setPendingEntry(entryId: number): Promise<GuestEntry> {
  const res = await fetch(`${API_URL}/api/v1/guest-lists/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  });
  if (!res.ok) throw new Error('Failed to update entry');
  return res.json();
}

// Delete entry
export async function deleteEntry(entryId: number): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/v1/guest-lists/${entryId}`, {
    method: 'DELETE',
  });
  return res.status === 204 || res.ok;
}

// Check-in guest
export async function checkInGuest(entryId: number): Promise<GuestEntry> {
  const res = await fetch(`${API_URL}/api/v1/guest-lists/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'approved',
      checkedInAt: new Date().toISOString()
    }),
  });
  if (!res.ok) throw new Error('Failed to check in guest');
  return res.json();
}

// Bulk update entries
export async function bulkUpdateStatus(
  entryIds: number[],
  status: 'approved' | 'declined' | 'pending'
): Promise<GuestEntry[]> {
  const results = await Promise.all(
    entryIds.map(id =>
      fetch(`${API_URL}/api/v1/guest-lists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => r.json())
    )
  );
  return results;
}

// Export API URL for debugging
export { API_URL };
