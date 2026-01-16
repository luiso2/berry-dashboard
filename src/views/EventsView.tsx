// Events View - Event management with Partiful-style creator (Self-contained)
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Event, ClientAccess } from '../types';
import { API_URL } from '../constants';

// Event templates for the creator
const EVENT_TEMPLATES = [
  { id: 'elegant-dark', name: 'Elegant Dark', bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)', accent: '#d4af37', textColor: '#fff', preview: '✨' },
  { id: 'vip-gold', name: 'VIP Gold', bg: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)', accent: '#ffd700', textColor: '#fff', preview: '👑' },
  { id: 'neon-night', name: 'Neon Night', bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', accent: '#ff00ff', textColor: '#fff', preview: '🌃' },
  { id: 'sunset-party', name: 'Sunset Party', bg: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)', accent: '#fff', textColor: '#fff', preview: '🌅' },
  { id: 'ocean-blue', name: 'Ocean Blue', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', accent: '#00d4ff', textColor: '#fff', preview: '🌊' },
  { id: 'pool-party', name: 'Pool Party', bg: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', accent: '#fff', textColor: '#fff', preview: '🏊' },
  { id: 'garden-party', name: 'Garden Party', bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)', accent: '#fff', textColor: '#fff', preview: '🌿' },
  { id: 'rose-gold', name: 'Rose Gold', bg: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)', accent: '#e8b4b8', textColor: '#fff', preview: '🌹' },
];

interface EventsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface EventFormData {
  name: string;
  eventDate: string;
  eventTime: string;
  endTime: string;
  eventType: string;
  description: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  template: string;
  coverImage: string;
  accentColor: string;
  expectedAttendance: string;
  dressCode: string;
  theme: string;
  ageRestriction: string;
  rsvpEnabled: boolean;
  showGuestList: boolean;
  showGuestCount: boolean;
  allowPlusOne: boolean;
  maxPlusOne: number;
  requireApproval: boolean;
  isPublic: boolean;
  slug: string;
  ticketLink: string;
  notes: string;
}

const initialFormData: EventFormData = {
  name: '',
  eventDate: '',
  eventTime: '',
  endTime: '',
  eventType: 'party',
  description: '',
  venueName: '',
  venueAddress: '',
  venueCity: '',
  template: 'elegant-dark',
  coverImage: '',
  accentColor: '#d4af37',
  expectedAttendance: '',
  dressCode: '',
  theme: '',
  ageRestriction: '',
  rsvpEnabled: true,
  showGuestList: false,
  showGuestCount: true,
  allowPlusOne: true,
  maxPlusOne: 1,
  requireApproval: false,
  isPublic: false,
  slug: '',
  ticketLink: '',
  notes: '',
};

interface EventStats {
  total: number;
  planning: number;
  confirmed: number;
  completed: number;
  upcoming: number;
  thisMonth: number;
}

export function EventsView({ onToast }: EventsViewProps) {
  // Self-contained state
  const [events, setEvents] = useState<Event[]>([]);
  const [eventStats, setEventStats] = useState<EventStats>({
    total: 0, planning: 0, confirmed: 0, completed: 0, upcoming: 0, thisMonth: 0
  });
  const [clientAccesses, setClientAccesses] = useState<ClientAccess[]>([]);
  const [loading, setLoading] = useState(true);

  // Local UI state
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormData, setEventFormData] = useState<EventFormData>(initialFormData);
  const [creatorTab, setCreatorTab] = useState<'basic' | 'design' | 'details' | 'rsvp' | 'visibility'>('basic');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [eventActionMenu, setEventActionMenu] = useState<number | null>(null);
  const [showClientAccessForm, setShowClientAccessForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/events`);
      const data = await res.json();
      const eventList = data.events || [];
      setEvents(eventList);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      setEventStats({
        total: eventList.length,
        planning: eventList.filter((e: Event) => e.status === 'planning').length,
        confirmed: eventList.filter((e: Event) => e.status === 'confirmed').length,
        completed: eventList.filter((e: Event) => e.status === 'completed').length,
        upcoming: eventList.filter((e: Event) => new Date(e.eventDate) > now).length,
        thisMonth: eventList.filter((e: Event) => {
          const eventDate = new Date(e.eventDate);
          return eventDate >= thisMonth && eventDate <= nextMonth;
        }).length,
      });
    } catch (error) {
      console.error('Error fetching events:', error);
      onToast('Failed to load events', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  // Fetch client accesses for an event
  const fetchClientAccesses = useCallback(async (eventId: number) => {
    try {
      const res = await fetch(`${API_URL}/client-access?eventId=${eventId}`);
      const data = await res.json();
      setClientAccesses(data.accesses || []);
    } catch (error) {
      console.error('Error fetching client accesses:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        setEventFormData(p => ({ ...p, coverImage: data.url }));
        onToast('Cover uploaded!', 'success');
      }
    } catch {
      onToast('Failed to upload cover', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventFormData.name || !eventFormData.eventDate) {
      onToast('Please fill in event name and date', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventFormData.name,
          eventDate: eventFormData.eventDate,
          startTime: eventFormData.eventTime,
          endTime: eventFormData.endTime,
          eventType: eventFormData.eventType,
          description: eventFormData.description,
          venueName: eventFormData.venueName,
          venueAddress: eventFormData.venueAddress,
          venueCity: eventFormData.venueCity,
          template: eventFormData.template,
          coverImage: eventFormData.coverImage,
          accentColor: eventFormData.accentColor,
          expectedAttendance: eventFormData.expectedAttendance ? parseInt(eventFormData.expectedAttendance) : null,
          dressCode: eventFormData.dressCode,
          theme: eventFormData.theme,
          ageRestriction: eventFormData.ageRestriction,
          rsvpEnabled: eventFormData.rsvpEnabled,
          showGuestList: eventFormData.showGuestList,
          showGuestCount: eventFormData.showGuestCount,
          allowPlusOne: eventFormData.allowPlusOne,
          maxPlusOne: eventFormData.maxPlusOne,
          requireApproval: eventFormData.requireApproval,
          isPublic: eventFormData.isPublic,
          slug: eventFormData.slug,
          ticketLink: eventFormData.ticketLink,
          notes: eventFormData.notes,
          status: 'planning',
        }),
      });

      if (res.ok) {
        onToast('Event created successfully!', 'success');
        setShowEventForm(false);
        setEventFormData(initialFormData);
        fetchEvents();
      } else {
        throw new Error('Failed to create event');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      onToast('Failed to create event', 'error');
    }
  };

  const handleUpdateEventStatus = async (eventId: number, status: string) => {
    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        onToast(`Event ${status}!`, 'success');
        fetchEvents();
      }
    } catch (error) {
      console.error('Error updating event:', error);
      onToast('Failed to update event', 'error');
    }
  };

  const handleDeleteEvent = async (eventId: number, eventName: string) => {
    if (!confirm(`Delete "${eventName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        onToast('Event deleted', 'success');
        fetchEvents();
      }
    } catch (error) {
      console.error('Error deleting event:', error);
      onToast('Failed to delete event', 'error');
    }
  };

  const handleDeleteAllEvents = async () => {
    if (!confirm('Delete ALL events? This cannot be undone.')) return;

    try {
      await Promise.all(events.map(e => fetch(`${API_URL}/events/${e.id}`, { method: 'DELETE' })));
      onToast('All events deleted', 'success');
      fetchEvents();
    } catch (error) {
      console.error('Error deleting events:', error);
      onToast('Failed to delete all events', 'error');
    }
  };

  const selectedTemplate = EVENT_TEMPLATES.find(t => t.id === eventFormData.template) || EVENT_TEMPLATES[0];

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#666' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p>Loading events...</p>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      {/* Stats Row */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total Events', value: eventStats.total, color: '#fff' },
          { label: 'Upcoming', value: eventStats.upcoming, color: '#22c55e' },
          { label: 'This Month', value: eventStats.thisMonth, color: '#3b82f6' },
          { label: 'Planning', value: eventStats.planning, color: '#f59e0b' },
          { label: 'Confirmed', value: eventStats.confirmed, color: '#a78bfa' },
          { label: 'Completed', value: eventStats.completed, color: '#6b7280' },
        ].map((stat, i) => (
          <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>All Events</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          {events.length > 0 && (
            <button
              onClick={handleDeleteAllEvents}
              className="btn-hover"
              style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              🗑️ Delete All
            </button>
          )}
          <button
            onClick={() => setShowEventForm(true)}
            className="btn-hover"
            style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* Events Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {events.map(event => (
          <div
            key={event.id}
            className="row-hover"
            style={{
              background: '#0a0a0a',
              border: `1px solid ${event.status === 'confirmed' ? '#22c55e40' : event.status === 'planning' ? '#f59e0b40' : '#1a1a1a'}`,
              borderRadius: 12,
              padding: 20,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{event.name}</h3>
                  {event.eventbriteUrl && (
                    <span style={{ fontSize: 10, padding: '2px 6px', background: '#F6682F20', color: '#F6682F', borderRadius: 4, fontWeight: 600 }}>
                      EVENTBRITE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                  {event.venueName || 'Venue TBD'} {event.venueCity && `• ${event.venueCity}`}
                </div>
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                background: event.status === 'confirmed' ? '#22c55e20' : event.status === 'planning' ? '#f59e0b20' : event.status === 'completed' ? '#6b728020' : event.status === 'upcoming' ? '#3b82f620' : '#ef444420',
                color: event.status === 'confirmed' ? '#22c55e' : event.status === 'planning' ? '#f59e0b' : event.status === 'completed' ? '#9ca3af' : event.status === 'upcoming' ? '#3b82f6' : '#ef4444',
              }}>
                {event.status}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#888' }}>
              <span>📅 {new Date(event.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              {event.startTime && <span>🕐 {event.startTime}</span>}
              {event.expectedAttendance && <span>👥 {event.expectedAttendance}</span>}
            </div>
            {event.theme && <div style={{ marginTop: 10, fontSize: 12, color: '#d4af37' }}>Theme: {event.theme}</div>}

            {/* Action Menu */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, position: 'relative' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEventActionMenu(eventActionMenu === event.id ? null : event.id);
                }}
                style={{
                  padding: '8px 12px',
                  background: eventActionMenu === event.id ? '#1a1a1a' : 'transparent',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#888',
                  fontSize: 16,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Actions"
              >
                ⋮
              </button>

              {/* Dropdown Menu */}
              {eventActionMenu === event.id && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    padding: 4,
                    minWidth: 160,
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { handleUpdateEventStatus(event.id, 'confirmed'); setEventActionMenu(null); }}
                    style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 6, color: '#22c55e', fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                    className="row-hover"
                  >
                    ✓ Confirm Event
                  </button>
                  <button
                    onClick={() => {
                      setSelectedEvent(event);
                      fetchClientAccesses(event.id);
                      setShowClientAccessForm(true);
                      setEventActionMenu(null);
                    }}
                    style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 6, color: '#3b82f6', fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                    className="row-hover"
                  >
                    🔗 Share Event
                  </button>
                  {event.eventbriteUrl && (
                    <button
                      onClick={() => { window.open(event.eventbriteUrl, '_blank'); setEventActionMenu(null); }}
                      style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 6, color: '#F6682F', fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                      className="row-hover"
                    >
                      🎫 Open Eventbrite
                    </button>
                  )}
                  <div style={{ height: 1, background: '#333', margin: '4px 0' }} />
                  <button
                    onClick={() => { handleDeleteEvent(event.id, event.name); setEventActionMenu(null); }}
                    style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 6, color: '#ef4444', fontSize: 13, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                    className="row-hover"
                  >
                    🗑️ Delete Event
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 60, textAlign: 'center', background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <div style={{ color: '#666', fontSize: 15 }}>No events yet</div>
            <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Create your first event to get started</div>
          </div>
        )}
      </div>

      {/* Full Screen Event Creator - Partiful Style */}
      {showEventForm && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 300, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => setShowEventForm(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', padding: 8 }}>
                ← Back
              </button>
              <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Create Event</h1>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowEventForm(false)}
                style={{ padding: '10px 20px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEvent}
                style={{ padding: '10px 24px', background: '#d4af37', border: 'none', borderRadius: 8, color: '#000', fontWeight: 600, cursor: 'pointer' }}
              >
                Publish Event
              </button>
            </div>
          </div>

          {/* Main Content - Split View */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

            {/* Left Side - Form */}
            <div style={{ borderRight: '1px solid #1a1a1a', overflow: 'auto', background: '#0a0a0a' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, padding: '16px 24px', borderBottom: '1px solid #1a1a1a', background: '#050505', position: 'sticky', top: 0, zIndex: 10 }}>
                {[
                  { id: 'basic', label: 'Basic Info', icon: '📝' },
                  { id: 'design', label: 'Design', icon: '🎨' },
                  { id: 'details', label: 'Details', icon: '📋' },
                  { id: 'rsvp', label: 'RSVP', icon: '✉️' },
                  { id: 'visibility', label: 'Sharing', icon: '🔗' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setCreatorTab(tab.id as typeof creatorTab)}
                    style={{
                      padding: '8px 16px',
                      background: creatorTab === tab.id ? '#d4af3720' : 'transparent',
                      border: creatorTab === tab.id ? '1px solid #d4af3740' : '1px solid transparent',
                      borderRadius: 8,
                      color: creatorTab === tab.id ? '#d4af37' : '#888',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Form Content */}
              <div style={{ padding: 24 }}>
                {/* Basic Info Tab */}
                {creatorTab === 'basic' && (
                  <div style={{ display: 'grid', gap: 20 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Event Name *</label>
                      <input
                        placeholder="Give your event a name"
                        value={eventFormData.name}
                        onChange={e => setEventFormData(p => ({ ...p, name: e.target.value, slug: generateSlug(e.target.value) }))}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 16 }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Date *</label>
                        <input
                          type="date"
                          value={eventFormData.eventDate}
                          onChange={e => setEventFormData(p => ({ ...p, eventDate: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Event Type</label>
                        <select
                          value={eventFormData.eventType}
                          onChange={e => setEventFormData(p => ({ ...p, eventType: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        >
                          <option value="party">Party</option>
                          <option value="corporate">Corporate</option>
                          <option value="concert">Concert</option>
                          <option value="festival">Festival</option>
                          <option value="private">Private</option>
                          <option value="wedding">Wedding</option>
                          <option value="birthday">Birthday</option>
                          <option value="networking">Networking</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Start Time</label>
                        <input
                          type="time"
                          value={eventFormData.eventTime}
                          onChange={e => setEventFormData(p => ({ ...p, eventTime: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>End Time</label>
                        <input
                          type="time"
                          value={eventFormData.endTime}
                          onChange={e => setEventFormData(p => ({ ...p, endTime: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Description</label>
                      <textarea
                        placeholder="Tell guests what your event is about..."
                        value={eventFormData.description}
                        onChange={e => setEventFormData(p => ({ ...p, description: e.target.value }))}
                        rows={4}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14, resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 20, marginTop: 4 }}>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Venue</label>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <input
                          placeholder="Venue Name"
                          value={eventFormData.venueName}
                          onChange={e => setEventFormData(p => ({ ...p, venueName: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                        <input
                          placeholder="Address"
                          value={eventFormData.venueAddress}
                          onChange={e => setEventFormData(p => ({ ...p, venueAddress: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                        <input
                          placeholder="City"
                          value={eventFormData.venueCity}
                          onChange={e => setEventFormData(p => ({ ...p, venueCity: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Design Tab */}
                {creatorTab === 'design' && (
                  <div style={{ display: 'grid', gap: 24 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Cover Image</label>
                      <input
                        type="file"
                        ref={coverInputRef}
                        accept="image/*"
                        onChange={handleCoverUpload}
                        style={{ display: 'none' }}
                      />
                      <div
                        onClick={() => coverInputRef.current?.click()}
                        style={{
                          width: '100%',
                          height: 200,
                          background: eventFormData.coverImage ? `url(${eventFormData.coverImage}) center/cover` : '#111',
                          border: '2px dashed #333',
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {uploadingCover ? (
                          <div style={{ color: '#888' }}>Uploading...</div>
                        ) : !eventFormData.coverImage && (
                          <div style={{ textAlign: 'center', color: '#666' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                            <div>Click to upload cover image</div>
                          </div>
                        )}
                      </div>
                      {eventFormData.coverImage && (
                        <button
                          onClick={() => setEventFormData(p => ({ ...p, coverImage: '' }))}
                          style={{ marginTop: 8, padding: '8px 16px', background: '#ef444420', border: 'none', borderRadius: 6, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}
                        >
                          Remove Cover
                        </button>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Design Template</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        {EVENT_TEMPLATES.map(template => (
                          <div
                            key={template.id}
                            onClick={() => setEventFormData(p => ({ ...p, template: template.id, accentColor: template.accent }))}
                            style={{
                              background: template.bg,
                              border: eventFormData.template === template.id ? '2px solid #d4af37' : '2px solid transparent',
                              borderRadius: 12,
                              padding: 16,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              position: 'relative',
                            }}
                          >
                            <div style={{ fontSize: 24, marginBottom: 8 }}>{template.preview}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: template.textColor }}>{template.name}</div>
                            {eventFormData.template === template.id && (
                              <div style={{ position: 'absolute', top: 8, right: 8, background: '#d4af37', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                                SELECTED
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Accent Color</label>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <input
                          type="color"
                          value={eventFormData.accentColor}
                          onChange={e => setEventFormData(p => ({ ...p, accentColor: e.target.value }))}
                          style={{ width: 50, height: 50, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                        />
                        <input
                          value={eventFormData.accentColor}
                          onChange={e => setEventFormData(p => ({ ...p, accentColor: e.target.value }))}
                          style={{ flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Details Tab */}
                {creatorTab === 'details' && (
                  <div style={{ display: 'grid', gap: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Expected Attendance</label>
                        <input
                          type="number"
                          placeholder="100"
                          value={eventFormData.expectedAttendance}
                          onChange={e => setEventFormData(p => ({ ...p, expectedAttendance: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Age Restriction</label>
                        <select
                          value={eventFormData.ageRestriction}
                          onChange={e => setEventFormData(p => ({ ...p, ageRestriction: e.target.value }))}
                          style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                        >
                          <option value="">No restriction</option>
                          <option value="18+">18+</option>
                          <option value="21+">21+</option>
                          <option value="All Ages">All Ages</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Dress Code</label>
                      <input
                        placeholder="e.g., All White, Smart Casual, Black Tie"
                        value={eventFormData.dressCode}
                        onChange={e => setEventFormData(p => ({ ...p, dressCode: e.target.value }))}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Theme</label>
                      <input
                        placeholder="e.g., Masquerade, Gatsby, Tropical"
                        value={eventFormData.theme}
                        onChange={e => setEventFormData(p => ({ ...p, theme: e.target.value }))}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Ticket Link (External)</label>
                      <input
                        placeholder="https://eventbrite.com/..."
                        value={eventFormData.ticketLink}
                        onChange={e => setEventFormData(p => ({ ...p, ticketLink: e.target.value }))}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Additional Notes</label>
                      <textarea
                        placeholder="Any additional information for guests..."
                        value={eventFormData.notes}
                        onChange={e => setEventFormData(p => ({ ...p, notes: e.target.value }))}
                        rows={4}
                        style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14, resize: 'vertical' }}
                      />
                    </div>
                  </div>
                )}

                {/* RSVP Tab */}
                {creatorTab === 'rsvp' && (
                  <div style={{ display: 'grid', gap: 20 }}>
                    {[
                      { key: 'rsvpEnabled', label: 'Enable RSVP', desc: 'Allow guests to RSVP to this event' },
                      { key: 'requireApproval', label: 'Require Approval', desc: 'Review RSVPs before confirming guests' },
                      { key: 'showGuestList', label: 'Show Guest List', desc: 'Let attendees see who else is going' },
                      { key: 'showGuestCount', label: 'Show Guest Count', desc: 'Display number of people attending' },
                    ].map(toggle => (
                      <div key={toggle.key} style={{ padding: 16, background: '#111', borderRadius: 12, border: '1px solid #222' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{toggle.label}</div>
                            <div style={{ fontSize: 13, color: '#666' }}>{toggle.desc}</div>
                          </div>
                          <button
                            onClick={() => setEventFormData(p => ({ ...p, [toggle.key]: !p[toggle.key as keyof EventFormData] }))}
                            style={{
                              width: 50, height: 28, borderRadius: 14, border: 'none',
                              background: eventFormData[toggle.key as keyof EventFormData] ? '#d4af37' : '#333',
                              cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
                            }}
                          >
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 3,
                              left: eventFormData[toggle.key as keyof EventFormData] ? 25 : 3,
                              transition: 'left 0.2s'
                            }} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div style={{ padding: 16, background: '#111', borderRadius: 12, border: '1px solid #222' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Allow +1</div>
                          <div style={{ fontSize: 13, color: '#666' }}>Let guests bring additional people</div>
                        </div>
                        <button
                          onClick={() => setEventFormData(p => ({ ...p, allowPlusOne: !p.allowPlusOne }))}
                          style={{
                            width: 50, height: 28, borderRadius: 14, border: 'none',
                            background: eventFormData.allowPlusOne ? '#d4af37' : '#333',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 3,
                            left: eventFormData.allowPlusOne ? 25 : 3,
                            transition: 'left 0.2s'
                          }} />
                        </button>
                      </div>
                      {eventFormData.allowPlusOne && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #222' }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8 }}>Max guests per RSVP</label>
                          <select
                            value={eventFormData.maxPlusOne}
                            onChange={e => setEventFormData(p => ({ ...p, maxPlusOne: Number(e.target.value) }))}
                            style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14 }}
                          >
                            {[1, 2, 3, 4, 5].map(n => (
                              <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Visibility Tab */}
                {creatorTab === 'visibility' && (
                  <div style={{ display: 'grid', gap: 20 }}>
                    <div style={{ padding: 16, background: '#111', borderRadius: 12, border: '1px solid #222' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Public Event</div>
                          <div style={{ fontSize: 13, color: '#666' }}>Anyone with the link can view this event</div>
                        </div>
                        <button
                          onClick={() => setEventFormData(p => ({ ...p, isPublic: !p.isPublic }))}
                          style={{
                            width: 50, height: 28, borderRadius: 14, border: 'none',
                            background: eventFormData.isPublic ? '#d4af37' : '#333',
                            cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: 3,
                            left: eventFormData.isPublic ? 25 : 3,
                            transition: 'left 0.2s'
                          }} />
                        </button>
                      </div>
                    </div>

                    {eventFormData.isPublic && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Event URL</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1, background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#666', fontSize: 14, display: 'flex', alignItems: 'center' }}>
                            <span style={{ color: '#888' }}>berry.merktop.com/e/</span>
                            <span style={{ color: '#d4af37' }}>{eventFormData.slug || 'your-event'}</span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`https://berry.merktop.com/e/${eventFormData.slug}`);
                              onToast('Link copied!', 'success');
                            }}
                            style={{ padding: '14px 20px', background: '#d4af3720', border: '1px solid #d4af3740', borderRadius: 8, color: '#d4af37', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Copy
                          </button>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8 }}>Custom URL slug</label>
                          <input
                            placeholder="my-awesome-party"
                            value={eventFormData.slug}
                            onChange={e => setEventFormData(p => ({ ...p, slug: generateSlug(e.target.value) }))}
                            style={{ width: '100%', background: '#111', border: '1px solid #222', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 14 }}
                          />
                        </div>
                      </div>
                    )}

                    <div style={{ padding: 20, background: '#0f0f0f', borderRadius: 12, border: '1px solid #1a1a1a' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#d4af37' }}>Share Options</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                          { icon: '📱', label: 'SMS' },
                          { icon: '✉️', label: 'Email' },
                          { icon: '📸', label: 'Instagram' },
                          { icon: '🔗', label: 'Copy Link' },
                        ].map(share => (
                          <button key={share.label} style={{ padding: 16, background: '#111', border: '1px solid #222', borderRadius: 8, cursor: 'pointer', textAlign: 'center' }}>
                            <div style={{ fontSize: 24, marginBottom: 4 }}>{share.icon}</div>
                            <div style={{ fontSize: 11, color: '#888' }}>{share.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Live Preview */}
            <div style={{ background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, overflow: 'auto' }}>
              <div style={{ width: '100%', maxWidth: 400 }}>
                {/* Phone Frame */}
                <div style={{
                  background: '#000',
                  borderRadius: 40,
                  padding: 12,
                  boxShadow: '0 20px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                }}>
                  {/* Screen */}
                  <div style={{
                    borderRadius: 32,
                    overflow: 'hidden',
                    background: selectedTemplate.bg,
                    minHeight: 600,
                  }}>
                    {/* Cover Image */}
                    {eventFormData.coverImage ? (
                      <div style={{
                        height: 240,
                        background: `url(${eventFormData.coverImage}) center/cover`,
                        position: 'relative',
                      }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.8) 100%)' }} />
                      </div>
                    ) : (
                      <div style={{
                        height: 160,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 48,
                      }}>
                        {selectedTemplate.preview}
                      </div>
                    )}

                    {/* Event Info */}
                    <div style={{ padding: 24, color: selectedTemplate.textColor }}>
                      <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.2 }}>
                        {eventFormData.name || 'Your Event Name'}
                      </h2>

                      {eventFormData.theme && (
                        <div style={{ fontSize: 14, color: eventFormData.accentColor, marginBottom: 16, fontWeight: 600 }}>
                          {eventFormData.theme}
                        </div>
                      )}

                      <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
                        {eventFormData.eventDate && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                            <span style={{ fontSize: 18 }}>📅</span>
                            <span>
                              {new Date(eventFormData.eventDate).toLocaleDateString('en-US', {
                                weekday: 'long', month: 'long', day: 'numeric'
                              })}
                            </span>
                          </div>
                        )}

                        {eventFormData.eventTime && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                            <span style={{ fontSize: 18 }}>🕐</span>
                            <span>{eventFormData.eventTime}{eventFormData.endTime && ` - ${eventFormData.endTime}`}</span>
                          </div>
                        )}

                        {eventFormData.venueName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                            <span style={{ fontSize: 18 }}>📍</span>
                            <span>{eventFormData.venueName}{eventFormData.venueCity && `, ${eventFormData.venueCity}`}</span>
                          </div>
                        )}

                        {eventFormData.dressCode && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                            <span style={{ fontSize: 18 }}>👔</span>
                            <span>{eventFormData.dressCode}</span>
                          </div>
                        )}

                        {eventFormData.ageRestriction && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                            <span style={{ fontSize: 18 }}>🔞</span>
                            <span>{eventFormData.ageRestriction}</span>
                          </div>
                        )}
                      </div>

                      {eventFormData.description && (
                        <p style={{ fontSize: 14, color: `${selectedTemplate.textColor}99`, marginTop: 20, lineHeight: 1.6 }}>
                          {eventFormData.description}
                        </p>
                      )}

                      {eventFormData.showGuestCount && (
                        <div style={{
                          marginTop: 20, padding: '12px 16px',
                          background: 'rgba(255,255,255,0.1)', borderRadius: 12,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span style={{ fontSize: 16 }}>👥</span>
                          <span style={{ fontSize: 14, opacity: 0.8 }}>
                            {eventFormData.expectedAttendance || '0'} people interested
                          </span>
                        </div>
                      )}

                      {eventFormData.rsvpEnabled && (
                        <button style={{
                          width: '100%', marginTop: 24, padding: '16px 24px',
                          background: eventFormData.accentColor, border: 'none', borderRadius: 12,
                          color: selectedTemplate.id === 'minimalist' ? '#fff' : '#000',
                          fontWeight: 700, fontSize: 16, cursor: 'pointer',
                        }}>
                          RSVP Now
                        </button>
                      )}

                      {eventFormData.ticketLink && (
                        <button style={{
                          width: '100%', marginTop: 12, padding: '14px 24px',
                          background: 'transparent', border: `2px solid ${eventFormData.accentColor}`,
                          borderRadius: 12, color: eventFormData.accentColor,
                          fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        }}>
                          Get Tickets
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: 20, color: '#666', fontSize: 13 }}>
                  Live Preview
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Access Modal */}
      {showClientAccessForm && selectedEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={() => setShowClientAccessForm(false)}
        >
          <div
            style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 16, padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Share with Client</h2>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{selectedEvent.name}</div>
              </div>
              <button onClick={() => setShowClientAccessForm(false)} style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>

            {/* Existing Client Accesses */}
            {clientAccesses.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Active Portal Links</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {clientAccesses.map(access => (
                    <div key={access.id} style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{access.clientName}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{access.clientEmail}</div>
                        <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                          {access.permissions.viewBudget && <span style={{ marginRight: 8 }}>💰 Budget</span>}
                          {access.permissions.viewTimeline && <span style={{ marginRight: 8 }}>📅 Timeline</span>}
                          {access.permissions.viewStaff && <span style={{ marginRight: 8 }}>👥 Staff</span>}
                          {access.permissions.viewVendors && <span>🏢 Vendors</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(access.portalUrl || '');
                          onToast('Link copied!', 'success');
                        }}
                        style={{ padding: '6px 12px', background: '#3b82f620', border: 'none', borderRadius: 6, color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}
                      >
                        Copy Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {clientAccesses.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
                <p>No client access links yet.</p>
                <p style={{ fontSize: 13 }}>Create a link to share event details with your clients.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
