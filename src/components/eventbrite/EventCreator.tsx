import { useState } from 'react';
import { API_URL } from '../../constants';

interface EventCreatorProps {
  onEventCreated?: () => void;
}

interface TicketClass {
  name: string;
  description?: string;
  quantity_total: number;
  cost: number;
  free: boolean;
  sales_start?: string;
  sales_end?: string;
}

export function EventCreator({ onEventCreated }: EventCreatorProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  // Event details
  const [eventData, setEventData] = useState({
    name: '',
    description: '',
    start_date: '',
    start_time: '19:00',
    end_date: '',
    end_time: '23:00',
    timezone: 'America/New_York',
    venue_name: '',
    venue_address: '',
    venue_city: '',
    venue_region: '',
    venue_postal_code: '',
    venue_country: 'US',
    online_event: false,
    capacity: 100,
    listed: true,
    shareable: true,
  });

  // Ticket classes
  const [ticketClasses, setTicketClasses] = useState<TicketClass[]>([
    {
      name: 'General Admission',
      description: '',
      quantity_total: 100,
      cost: 0,
      free: true,
    },
  ]);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const handleCreateEvent = async () => {
    setLoading(true);
    try {
      // Format dates for API
      const startDateTime = `${eventData.start_date}T${eventData.start_time}:00`;
      const endDateTime = `${eventData.end_date || eventData.start_date}T${eventData.end_time}:00`;

      const payload = {
        name: eventData.name,
        description: eventData.description,
        start_date: startDateTime,
        end_date: endDateTime,
        timezone: eventData.timezone,
        venue: eventData.online_event ? null : {
          name: eventData.venue_name,
          address: {
            address_1: eventData.venue_address,
            city: eventData.venue_city,
            region: eventData.venue_region,
            postal_code: eventData.venue_postal_code,
            country: eventData.venue_country,
          },
        },
        online_event: eventData.online_event,
        capacity: eventData.capacity,
        listed: eventData.listed,
        shareable: eventData.shareable,
      };

      const res = await fetch(`${API_URL}/integrations/eventbrite/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedEventId(data.id);
        setStep(2);
      } else {
        const error = await res.json();
        alert(`Error creating event: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error creating event:', err);
      alert('Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTicketClass = async (ticketClass: TicketClass) => {
    if (!createdEventId) return;
    setLoading(true);
    try {
      const payload = {
        name: ticketClass.name,
        description: ticketClass.description,
        quantity_total: ticketClass.quantity_total,
        cost: ticketClass.free ? 0 : ticketClass.cost * 100, // Convert to cents
        free: ticketClass.free,
        sales_start: ticketClass.sales_start,
        sales_end: ticketClass.sales_end,
      };

      const res = await fetch(`${API_URL}/integrations/eventbrite/events/${createdEventId}/ticket-classes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error adding ticket: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding ticket class:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishEvent = async () => {
    if (!createdEventId) return;
    setLoading(true);
    try {
      // First add all ticket classes
      for (const ticket of ticketClasses) {
        await handleAddTicketClass(ticket);
      }

      // Then publish
      const res = await fetch(`${API_URL}/integrations/eventbrite/events/${createdEventId}/publish`, {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        setStep(3);
        onEventCreated?.();
      } else {
        const error = await res.json();
        alert(`Error publishing event: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error publishing event:', err);
      alert('Failed to publish event');
    } finally {
      setLoading(false);
    }
  };

  const addTicketClass = () => {
    setTicketClasses([
      ...ticketClasses,
      {
        name: '',
        description: '',
        quantity_total: 50,
        cost: 0,
        free: false,
      },
    ]);
  };

  const updateTicketClass = (index: number, updates: Partial<TicketClass>) => {
    const newClasses = [...ticketClasses];
    newClasses[index] = { ...newClasses[index], ...updates };
    setTicketClasses(newClasses);
  };

  const removeTicketClass = (index: number) => {
    setTicketClasses(ticketClasses.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setStep(1);
    setCreatedEventId(null);
    setEventData({
      name: '',
      description: '',
      start_date: '',
      start_time: '19:00',
      end_date: '',
      end_time: '23:00',
      timezone: 'America/New_York',
      venue_name: '',
      venue_address: '',
      venue_city: '',
      venue_region: '',
      venue_postal_code: '',
      venue_country: 'US',
      online_event: false,
      capacity: 100,
      listed: true,
      shareable: true,
    });
    setTicketClasses([
      {
        name: 'General Admission',
        description: '',
        quantity_total: 100,
        cost: 0,
        free: true,
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Create Eventbrite Event</h2>
        <p className="text-white/60 text-sm">Create and publish events directly to Eventbrite</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                step >= s
                  ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white'
                  : 'bg-white/10 text-white/40'
              }`}
            >
              {step > s ? '✓' : s}
            </div>
            <span className={`text-sm ${step >= s ? 'text-white' : 'text-white/40'}`}>
              {s === 1 ? 'Event Details' : s === 2 ? 'Tickets' : 'Published'}
            </span>
            {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-amber-500' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Event Details */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <h3 className="text-white font-medium">Basic Information</h3>

            <div>
              <label className="block text-white/60 text-sm mb-2">Event Name *</label>
              <input
                type="text"
                value={eventData.name}
                onChange={(e) => setEventData({ ...eventData, name: e.target.value })}
                placeholder="My Amazing Event"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-white/60 text-sm mb-2">Description</label>
              <textarea
                value={eventData.description}
                onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
                placeholder="Tell people what your event is about..."
                rows={4}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Start Date *</label>
                <input
                  type="date"
                  value={eventData.start_date}
                  onChange={(e) => setEventData({ ...eventData, start_date: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Start Time *</label>
                <input
                  type="time"
                  value={eventData.start_time}
                  onChange={(e) => setEventData({ ...eventData, start_time: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">End Date</label>
                <input
                  type="date"
                  value={eventData.end_date}
                  onChange={(e) => setEventData({ ...eventData, end_date: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">End Time *</label>
                <input
                  type="time"
                  value={eventData.end_time}
                  onChange={(e) => setEventData({ ...eventData, end_time: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-white/60 text-sm mb-2">Timezone</label>
              <select
                value={eventData.timezone}
                onChange={(e) => setEventData({ ...eventData, timezone: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label className="block text-white/60 text-sm mb-2">Capacity</label>
              <input
                type="number"
                value={eventData.capacity}
                onChange={(e) => setEventData({ ...eventData, capacity: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Venue or Online */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium">Location</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventData.online_event}
                  onChange={(e) => setEventData({ ...eventData, online_event: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white/80 text-sm">Online Event</span>
              </label>
            </div>

            {!eventData.online_event && (
              <div className="space-y-4">
                <div>
                  <label className="block text-white/60 text-sm mb-2">Venue Name</label>
                  <input
                    type="text"
                    value={eventData.venue_name}
                    onChange={(e) => setEventData({ ...eventData, venue_name: e.target.value })}
                    placeholder="Convention Center"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-2">Address</label>
                  <input
                    type="text"
                    value={eventData.venue_address}
                    onChange={(e) => setEventData({ ...eventData, venue_address: e.target.value })}
                    placeholder="123 Main Street"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-white/60 text-sm mb-2">City</label>
                    <input
                      type="text"
                      value={eventData.venue_city}
                      onChange={(e) => setEventData({ ...eventData, venue_city: e.target.value })}
                      placeholder="New York"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">State</label>
                    <input
                      type="text"
                      value={eventData.venue_region}
                      onChange={(e) => setEventData({ ...eventData, venue_region: e.target.value })}
                      placeholder="NY"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">ZIP Code</label>
                    <input
                      type="text"
                      value={eventData.venue_postal_code}
                      onChange={(e) => setEventData({ ...eventData, venue_postal_code: e.target.value })}
                      placeholder="10001"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">Country</label>
                    <select
                      value={eventData.venue_country}
                      onChange={(e) => setEventData({ ...eventData, venue_country: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="MX">Mexico</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-medium mb-4">Settings</h3>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventData.listed}
                  onChange={(e) => setEventData({ ...eventData, listed: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white/80 text-sm">Listed on Eventbrite</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventData.shareable}
                  onChange={(e) => setEventData({ ...eventData, shareable: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-white/80 text-sm">Shareable</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreateEvent}
              disabled={loading || !eventData.name || !eventData.start_date}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating...
                </>
              ) : (
                <>Continue to Tickets →</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Ticket Classes */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-green-400">✓ Event created successfully! Now add your ticket types.</p>
          </div>

          <div className="space-y-4">
            {ticketClasses.map((ticket, index) => (
              <div key={index} className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-medium">Ticket #{index + 1}</h4>
                  {ticketClasses.length > 1 && (
                    <button
                      onClick={() => removeTicketClass(index)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/60 text-sm mb-2">Ticket Name *</label>
                    <input
                      type="text"
                      value={ticket.name}
                      onChange={(e) => updateTicketClass(index, { name: e.target.value })}
                      placeholder="General Admission"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">Quantity</label>
                    <input
                      type="number"
                      value={ticket.quantity_total}
                      onChange={(e) => updateTicketClass(index, { quantity_total: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 text-sm mb-2">Description</label>
                  <input
                    type="text"
                    value={ticket.description || ''}
                    onChange={(e) => updateTicketClass(index, { description: e.target.value })}
                    placeholder="What's included with this ticket"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ticket.free}
                      onChange={(e) => updateTicketClass(index, { free: e.target.checked, cost: 0 })}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-white/80 text-sm">Free Ticket</span>
                  </label>

                  {!ticket.free && (
                    <div className="flex-1">
                      <label className="block text-white/60 text-sm mb-2">Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={ticket.cost}
                        onChange={(e) => updateTicketClass(index, { cost: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addTicketClass}
            className="w-full py-3 border-2 border-dashed border-white/20 rounded-xl text-white/60 hover:border-amber-500 hover:text-amber-400 transition-colors"
          >
            + Add Another Ticket Type
          </button>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handlePublishEvent}
              disabled={loading || ticketClasses.some(t => !t.name)}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Publishing...
                </>
              ) : (
                <>Publish Event 🚀</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🎉</span>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Event Published!</h3>
          <p className="text-white/60 mb-8">Your event is now live on Eventbrite.</p>

          <div className="flex justify-center gap-4">
            <a
              href={`https://www.eventbrite.com/e/${createdEventId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
            >
              View on Eventbrite →
            </a>
            <button
              onClick={resetForm}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Create Another Event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
