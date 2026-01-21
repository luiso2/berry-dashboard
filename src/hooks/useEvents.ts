// useEvents Hook - Event management

import { useState, useCallback, useMemo } from 'react';
import type { Event } from '../types';
import { API_URL } from '../constants';

interface EventStats {
  total: number;
  planning: number;
  confirmed: number;
  completed: number;
  upcoming: number;
  thisMonth: number;
}

interface UseEventsOptions {
  token?: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

export function useEvents(options: UseEventsOptions = {}) {
  const { token, onError, onSuccess } = options;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

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

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/events`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      setEvents(data.events || data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      onError?.('Error loading events');
    } finally {
      setLoading(false);
    }
  }, [onError, getHeaders]);

  const stats = useMemo((): EventStats => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      total: events.length,
      planning: events.filter((e) => e.status === 'planning').length,
      confirmed: events.filter((e) => e.status === 'confirmed').length,
      completed: events.filter((e) => e.status === 'completed').length,
      upcoming: events.filter((e) => new Date(e.eventDate) > now).length,
      thisMonth: events.filter((e) => new Date(e.eventDate) >= startOfMonth).length,
    };
  }, [events]);

  const createEvent = useCallback(async (eventData: Partial<Event>) => {
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: getHeaders('application/json'),
        body: JSON.stringify(eventData),
      });
      if (!res.ok) throw new Error('Failed to create event');
      const data = await res.json();
      await fetchEvents();
      onSuccess?.('Event created successfully');
      return data;
    } catch (error) {
      console.error('Error creating event:', error);
      onError?.('Error creating event');
      return null;
    }
  }, [fetchEvents, onError, onSuccess, getHeaders]);

  const updateEvent = useCallback(async (id: number, eventData: Partial<Event>) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}`, {
        method: 'PUT',
        headers: getHeaders('application/json'),
        body: JSON.stringify(eventData),
      });
      if (!res.ok) throw new Error('Failed to update event');
      await fetchEvents();
      onSuccess?.('Event updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating event:', error);
      onError?.('Error updating event');
      return false;
    }
  }, [fetchEvents, onError, onSuccess, getHeaders]);

  const deleteEvent = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete event');
      setEvents((prev) => prev.filter((e) => e.id !== id));
      if (selectedEvent?.id === id) {
        setSelectedEvent(null);
      }
      onSuccess?.('Event deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      onError?.('Error deleting event');
      return false;
    }
  }, [selectedEvent, onError, onSuccess, getHeaders]);

  const duplicateEvent = useCallback(async (event: Event) => {
    const newEvent = {
      ...event,
      name: `${event.name} (Copy)`,
      status: 'planning' as const,
    };
    delete (newEvent as any).id;
    return createEvent(newEvent);
  }, [createEvent]);

  return {
    // Data
    events,
    stats,
    loading,
    selectedEvent,
    // Actions
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    duplicateEvent,
    setSelectedEvent,
  };
}
