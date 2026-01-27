// useGuests Hook - Guest management

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Guest, GuestCategory, Filters } from '../types';
import { API_URL, ENDPOINTS } from '../constants';
import { calculateAIScore, statusToCategory } from '../utils';

interface UseGuestsOptions {
  token?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onError?: (error: string) => void;
}

export function useGuests(options: UseGuestsOptions = {}) {
  const { token, autoRefresh = true, refreshInterval = 10000, onError } = options;

  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filters, setFilters] = useState<Filters>({
    search: '',
    category: 'all',
    emailStatus: 'all',
    gender: 'all',
    dateFrom: '',
    dateTo: '',
    scoreMin: 0,
    scoreMax: 100,
  });

  const getHeaders = useCallback((contentType?: string) => {
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    return headers;
  }, [token]);

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}`, { headers: getHeaders() });
      const responseData = await res.json();

      // Handle berry-bly API response format: { entries: [...], total, limit, offset }
      const data = responseData.entries || responseData.data || responseData;

      // Transform berry-bly API data to Dashboard Guest format
      const transformedData = Array.isArray(data) ? data.map((g: any) => ({
        id: String(g.id),
        name: g.name || '',
        email: g.email || '',
        phone: g.phone || '',
        instagram: g.instagram || '',
        partySize: g.numberOfGuests || g.partySize || g.number_of_guests || 1,
        eventDate: g.eventDate || g.event_date || new Date().toISOString(),
        notes: g.notes || g.vipPreferences || '',
        category: g.category || statusToCategory(g.status),
        status: g.status,
        emailSent: g.emailSent || g.email_sent || false,
        emailSentAt: g.emailSentAt || g.email_sent_at,
        createdAt: g.createdAt || g.created_at || new Date().toISOString(),
        checkedInAt: g.checkedInAt || g.checked_in_at,
        eventId: g.eventId || g.event_id,
      })) : [];

      // Calculate AI scores for all guests
      const guestsWithScores = transformedData.map((g: Guest) => ({
        ...g,
        aiScore: calculateAIScore(g),
      }));
      setGuests(guestsWithScores);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching guests:', error);
      onError?.('Error loading guests');
    } finally {
      setLoading(false);
    }
  }, [onError, getHeaders]);

  // Auto-refresh
  useEffect(() => {
    fetchGuests();
    if (autoRefresh) {
      const interval = setInterval(fetchGuests, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchGuests, autoRefresh, refreshInterval]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedGuests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((guestList: Guest[]) => {
    if (selectedGuests.size === guestList.length) {
      setSelectedGuests(new Set());
    } else {
      setSelectedGuests(new Set(guestList.map((g) => g.id)));
    }
  }, [selectedGuests.size]);

  const clearSelection = useCallback(() => {
    setSelectedGuests(new Set());
  }, []);

  // Filter guests
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        if (!g.name.toLowerCase().includes(search) &&
            !g.email.toLowerCase().includes(search) &&
            !(g.instagram?.toLowerCase().includes(search))) {
          return false;
        }
      }
      // Category filter
      if (filters.category !== 'all' && g.category !== filters.category) {
        return false;
      }
      // Email status filter
      if (filters.emailStatus === 'sent' && !g.emailSent) return false;
      if (filters.emailStatus === 'not_sent' && g.emailSent) return false;
      // Score filter
      if (g.aiScore !== undefined) {
        if (g.aiScore < filters.scoreMin || g.aiScore > filters.scoreMax) {
          return false;
        }
      }
      return true;
    });
  }, [guests, filters]);

  // Stats
  const stats = useMemo(() => ({
    total: guests.length,
    pending: guests.filter((g) => g.category === 'pending').length,
    vip: guests.filter((g) => g.category === 'A').length,
    priority: guests.filter((g) => g.category === 'B').length,
    standard: guests.filter((g) => g.category === 'C').length,
    rejected: guests.filter((g) => g.category === 'rejected').length,
    emailsSent: guests.filter((g) => g.emailSent).length,
  }), [guests]);

  // CRUD operations
  const addGuest = useCallback(async (guestData: Partial<Guest>) => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}`, {
        method: 'POST',
        headers: getHeaders('application/json'),
        body: JSON.stringify(guestData),
      });
      if (!res.ok) throw new Error('Failed to add guest');
      await fetchGuests();
      return true;
    } catch (error) {
      onError?.('Error adding guest');
      return false;
    }
  }, [fetchGuests, onError, getHeaders]);

  const removeGuest = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove guest');
      setGuests((prev) => prev.filter((g) => g.id !== id));
      setSelectedGuests((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return true;
    } catch (error) {
      onError?.('Error removing guest');
      return false;
    }
  }, [onError, getHeaders]);

  const updateGuestCategory = useCallback(async (ids: string[], category: GuestCategory) => {
    try {
      await Promise.all(ids.map((id) =>
        fetch(`${API_URL}${ENDPOINTS.guests}/${id}`, {
          method: 'PATCH',
          headers: getHeaders('application/json'),
          body: JSON.stringify({ category }),
        })
      ));
      await fetchGuests();
      return true;
    } catch (error) {
      onError?.('Error updating guest category');
      return false;
    }
  }, [fetchGuests, onError, getHeaders]);

  return {
    // Data
    guests,
    filteredGuests,
    stats,
    loading,
    lastRefresh,
    // Selection
    selectedGuests,
    toggleSelect,
    selectAll,
    clearSelection,
    // Filters
    filters,
    setFilters,
    // Actions
    fetchGuests,
    addGuest,
    removeGuest,
    updateGuestCategory,
  };
}
