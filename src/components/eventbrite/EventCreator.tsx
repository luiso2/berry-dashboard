import { useState, useRef } from 'react';
import { API_URL } from '../../constants';
import { useAuth } from '../../context/AuthContext';

interface EventCreatorProps {
  onEventCreated?: () => void;
}

interface TicketClass {
  name: string;
  description?: string;
  quantity_total: number;
  cost: number;
  free: boolean;
  type: 'free' | 'paid' | 'donation';
}

interface EventFormData {
  // Basic Info (Step 1)
  name: string;
  organizer: string;
  category: string;
  tags: string[];
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  timezone: string;
  online_event: boolean;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_region: string;
  venue_postal_code: string;
  venue_country: string;
  // Details (Step 2)
  cover_image: string | null;
  cover_image_file: File | null;
  description: string;
  summary: string;
  // Settings
  capacity: number;
  listed: boolean;
  shareable: boolean;
}

const CATEGORIES = [
  { id: 'music', name: 'Music' },
  { id: 'nightlife', name: 'Nightlife' },
  { id: 'arts', name: 'Arts & Culture' },
  { id: 'food', name: 'Food & Drink' },
  { id: 'business', name: 'Business & Professional' },
  { id: 'health', name: 'Health & Wellness' },
  { id: 'sports', name: 'Sports & Fitness' },
  { id: 'charity', name: 'Charity & Causes' },
  { id: 'community', name: 'Community & Culture' },
  { id: 'film', name: 'Film & Media' },
  { id: 'fashion', name: 'Fashion & Beauty' },
  { id: 'other', name: 'Other' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST)' },
  { value: 'UTC', label: 'UTC' },
];

const STEP_TITLES = [
  { step: 1, title: 'Basic Info', description: 'Event name, date & location' },
  { step: 2, title: 'Details', description: 'Image & description' },
  { step: 3, title: 'Tickets', description: 'Ticket types & pricing' },
  { step: 4, title: 'Publish', description: 'Review & go live' },
];

export function EventCreator({ onEventCreated }: EventCreatorProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [_createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [eventbriteUrl, setEventbriteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [eventData, setEventData] = useState<EventFormData>({
    name: '',
    organizer: '',
    category: 'nightlife',
    tags: [],
    start_date: '',
    start_time: '19:00',
    end_date: '',
    end_time: '23:00',
    timezone: 'America/New_York',
    online_event: false,
    venue_name: '',
    venue_address: '',
    venue_city: '',
    venue_region: '',
    venue_postal_code: '',
    venue_country: 'US',
    cover_image: null,
    cover_image_file: null,
    description: '',
    summary: '',
    capacity: 100,
    listed: true,
    shareable: true,
  });

  const [ticketClasses, setTicketClasses] = useState<TicketClass[]>([
    {
      name: 'General Admission',
      description: '',
      quantity_total: 100,
      cost: 0,
      free: true,
      type: 'free',
    },
  ]);

  const [tagInput, setTagInput] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_URL}/gallery/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setEventData(prev => ({
          ...prev,
          cover_image: data.imageUrl || data.url,
          cover_image_file: file,
        }));
      } else {
        alert('Failed to upload image');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && eventData.tags.length < 10) {
      setEventData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    setEventData(prev => ({
      ...prev,
      tags: prev.tags.filter((_, i) => i !== index),
    }));
  };

  const handleCreateAndPublish = async () => {
    setLoading(true);
    setError(null);

    try {
      // Format dates for API
      const startDateTime = `${eventData.start_date}T${eventData.start_time}:00`;
      const endDateTime = `${eventData.end_date || eventData.start_date}T${eventData.end_time}:00`;

      const payload = {
        userId: user?.id,  // Include userId for backend fallback
        name: eventData.name,
        description: eventData.description || eventData.summary,
        summary: eventData.summary,
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
        logo_url: eventData.cover_image,
        category: eventData.category,
        organizer_name: eventData.organizer,
      };

      // Step 1: Create event in Eventbrite
      const createRes = await fetch(`${API_URL}/integrations/eventbrite/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create event');
      }

      const createData = await createRes.json();
      const eventId = createData.id;
      setCreatedEventId(eventId);

      // Step 2: Add ticket classes
      for (const ticket of ticketClasses) {
        const ticketPayload = {
          userId: user?.id,  // Include userId for backend fallback
          name: ticket.name,
          description: ticket.description,
          quantity_total: ticket.quantity_total,
          cost: ticket.free ? 0 : ticket.cost * 100,
          free: ticket.free,
          donation: ticket.type === 'donation',
        };

        await fetch(`${API_URL}/integrations/eventbrite/events/${eventId}/ticket-classes`, {
          method: 'POST',
          headers,
          body: JSON.stringify(ticketPayload),
        });
      }

      // Step 3: Publish event
      const publishRes = await fetch(`${API_URL}/integrations/eventbrite/events/${eventId}/publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: user?.id }),  // Include userId for backend fallback
      });

      if (publishRes.ok) {
        const publishData = await publishRes.json();
        setPortalUrl(createData.portalUrl || null);
        setEventbriteUrl(publishData.url || createData.eventbriteUrl || createData.eventbrite_event?.url || null);
        setStep(5); // Success step
        onEventCreated?.();
      } else {
        // Event created but not published - still show success with draft status
        setPortalUrl(createData.portalUrl || null);
        setEventbriteUrl(createData.eventbriteUrl || createData.eventbrite_event?.url || null);
        setStep(5);
        setError('Event created but could not be published. It is saved as a draft.');
        onEventCreated?.();
      }
    } catch (err) {
      console.error('Error creating event:', err);
      setError(err instanceof Error ? err.message : 'Failed to create event');
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
        type: 'paid',
      },
    ]);
  };

  const updateTicketClass = (index: number, updates: Partial<TicketClass>) => {
    const newClasses = [...ticketClasses];
    newClasses[index] = { ...newClasses[index], ...updates };

    // Sync free and type
    if ('type' in updates) {
      newClasses[index].free = updates.type === 'free';
      if (updates.type === 'free') newClasses[index].cost = 0;
    }
    if ('free' in updates) {
      newClasses[index].type = updates.free ? 'free' : 'paid';
      if (updates.free) newClasses[index].cost = 0;
    }

    setTicketClasses(newClasses);
  };

  const removeTicketClass = (index: number) => {
    if (ticketClasses.length > 1) {
      setTicketClasses(ticketClasses.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setStep(1);
    setCreatedEventId(null);
    setPortalUrl(null);
    setEventbriteUrl(null);
    setError(null);
    setEventData({
      name: '',
      organizer: '',
      category: 'nightlife',
      tags: [],
      start_date: '',
      start_time: '19:00',
      end_date: '',
      end_time: '23:00',
      timezone: 'America/New_York',
      online_event: false,
      venue_name: '',
      venue_address: '',
      venue_city: '',
      venue_region: '',
      venue_postal_code: '',
      venue_country: 'US',
      cover_image: null,
      cover_image_file: null,
      description: '',
      summary: '',
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
        type: 'free',
      },
    ]);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return eventData.name && eventData.start_date && (eventData.online_event || eventData.venue_name);
      case 2:
        return true; // Details are optional
      case 3:
        return ticketClasses.every(t => t.name);
      case 4:
        return true;
      default:
        return false;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Create Event</h2>
          <p className="text-white/60 text-sm">Create and publish directly to Eventbrite</p>
        </div>
        {step < 5 && (
          <div className="text-sm text-white/40">
            Step {step} of 4
          </div>
        )}
      </div>

      {/* Progress Steps - Eventbrite Style */}
      {step < 5 && (
        <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
          {STEP_TITLES.map((s, idx) => (
            <div key={s.step} className="flex items-center">
              <button
                onClick={() => step > s.step && setStep(s.step)}
                disabled={step <= s.step}
                className={`flex items-center gap-3 ${step <= s.step ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                    step > s.step
                      ? 'bg-green-500 text-white'
                      : step === s.step
                      ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white ring-4 ring-amber-500/20'
                      : 'bg-white/10 text-white/40'
                  }`}
                >
                  {step > s.step ? '✓' : s.step}
                </div>
                <div className="hidden md:block text-left">
                  <p className={`font-medium ${step >= s.step ? 'text-white' : 'text-white/40'}`}>
                    {s.title}
                  </p>
                  <p className={`text-xs ${step >= s.step ? 'text-white/60' : 'text-white/30'}`}>
                    {s.description}
                  </p>
                </div>
              </button>
              {idx < STEP_TITLES.length - 1 && (
                <div className={`hidden md:block w-12 h-0.5 mx-4 ${step > s.step ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && step < 5 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Event Title */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <span className="text-2xl">📝</span> Event Title
            </h3>
            <input
              type="text"
              value={eventData.name}
              onChange={(e) => setEventData({ ...eventData, name: e.target.value })}
              placeholder="Give your event a name that stands out"
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white text-lg focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              maxLength={75}
            />
            <p className="text-white/40 text-sm mt-2 text-right">{eventData.name.length}/75</p>
          </div>

          {/* Organizer & Category */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <span className="text-2xl">🏢</span> Organizer & Category
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Organizer Name</label>
                <input
                  type="text"
                  value={eventData.organizer}
                  onChange={(e) => setEventData({ ...eventData, organizer: e.target.value })}
                  placeholder="Your name or organization"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Category</label>
                <select
                  value={eventData.category}
                  onChange={(e) => setEventData({ ...eventData, category: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-white/60 text-sm mb-2">Tags (up to 10)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {eventData.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm flex items-center gap-1"
                  >
                    {tag}
                    <button onClick={() => removeTag(i)} className="hover:text-amber-200">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Add a tag"
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={addTag}
                  disabled={!tagInput.trim() || eventData.tags.length >= 10}
                  className="px-4 py-2 bg-white/10 rounded-lg text-white hover:bg-white/20 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Date & Time */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <span className="text-2xl">📅</span> Date & Time
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Start Date *</label>
                <input
                  type="date"
                  value={eventData.start_date}
                  onChange={(e) => setEventData({ ...eventData, start_date: e.target.value, end_date: eventData.end_date || e.target.value })}
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
                  min={eventData.start_date}
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
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <span className="text-2xl">📍</span> Location
              </h3>
              <label className="flex items-center gap-2 cursor-pointer bg-white/5 px-4 py-2 rounded-lg hover:bg-white/10">
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
                  <label className="block text-white/60 text-sm mb-2">Venue Name *</label>
                  <input
                    type="text"
                    value={eventData.venue_name}
                    onChange={(e) => setEventData({ ...eventData, venue_name: e.target.value })}
                    placeholder="e.g., Convention Center, The Grand Ballroom"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-2">Street Address</label>
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
                      placeholder="Miami"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">State</label>
                    <input
                      type="text"
                      value={eventData.venue_region}
                      onChange={(e) => setEventData({ ...eventData, venue_region: e.target.value })}
                      placeholder="FL"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-2">ZIP</label>
                    <input
                      type="text"
                      value={eventData.venue_postal_code}
                      onChange={(e) => setEventData({ ...eventData, venue_postal_code: e.target.value })}
                      placeholder="33101"
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
                      <option value="AU">Australia</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {eventData.online_event && (
              <div className="text-center py-8 text-white/60">
                <span className="text-4xl mb-2 block">💻</span>
                <p>This will be an online event</p>
                <p className="text-sm">Attendees will join virtually</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Cover Image */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <span className="text-2xl">🖼️</span> Cover Image
            </h3>
            <p className="text-white/60 text-sm mb-4">
              Add a high-quality image that represents your event. Recommended size: 2160 x 1080 pixels.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {eventData.cover_image ? (
              <div className="relative">
                <img
                  src={eventData.cover_image}
                  alt="Event cover"
                  className="w-full h-64 object-cover rounded-xl"
                />
                <button
                  onClick={() => setEventData(prev => ({ ...prev, cover_image: null, cover_image_file: null }))}
                  className="absolute top-4 right-4 p-2 bg-black/50 rounded-lg text-white hover:bg-black/70"
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="w-full h-64 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-white/60 hover:border-amber-500 hover:text-amber-400 transition-colors"
              >
                {uploadingImage ? (
                  <>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mb-4" />
                    <p>Uploading...</p>
                  </>
                ) : (
                  <>
                    <span className="text-4xl mb-4">📷</span>
                    <p className="font-medium">Click to upload image</p>
                    <p className="text-sm">or drag and drop</p>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <span className="text-2xl">📋</span> Summary
            </h3>
            <p className="text-white/60 text-sm mb-4">
              Write a short summary that will appear in search results and social shares.
            </p>
            <textarea
              value={eventData.summary}
              onChange={(e) => setEventData({ ...eventData, summary: e.target.value })}
              placeholder="A brief description of your event (140 characters recommended)"
              rows={2}
              maxLength={140}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none resize-none"
            />
            <p className="text-white/40 text-sm mt-2 text-right">{eventData.summary.length}/140</p>
          </div>

          {/* Full Description */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <span className="text-2xl">📖</span> Description
            </h3>
            <p className="text-white/60 text-sm mb-4">
              Tell people everything they need to know about your event.
            </p>
            <textarea
              value={eventData.description}
              onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
              placeholder="Include details about what attendees will experience, schedule, special guests, what to bring, etc."
              rows={8}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Capacity & Settings */}
          <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <span className="text-2xl">⚙️</span> Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Total Capacity</label>
                <input
                  type="number"
                  value={eventData.capacity}
                  onChange={(e) => setEventData({ ...eventData, capacity: Number(e.target.value) })}
                  min={1}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={eventData.listed}
                  onChange={(e) => setEventData({ ...eventData, listed: e.target.checked })}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <p className="text-white font-medium">Public Event</p>
                  <p className="text-white/60 text-xs">Listed on Eventbrite</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={eventData.shareable}
                  onChange={(e) => setEventData({ ...eventData, shareable: e.target.checked })}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <p className="text-white font-medium">Shareable</p>
                  <p className="text-white/60 text-xs">Allow social sharing</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Tickets */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-amber-400 flex items-center gap-2">
              <span>💡</span> Create tickets for your event. You can have multiple ticket types with different prices.
            </p>
          </div>

          {ticketClasses.map((ticket, index) => (
            <div key={index} className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-semibold flex items-center gap-2">
                  <span className="text-xl">🎫</span> Ticket {index + 1}
                </h4>
                {ticketClasses.length > 1 && (
                  <button
                    onClick={() => removeTicketClass(index)}
                    className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded-lg hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Ticket Type Selection */}
              <div className="grid grid-cols-3 gap-2">
                {(['free', 'paid', 'donation'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => updateTicketClass(index, { type })}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      ticket.type === type
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    <span className="text-xl block mb-1">
                      {type === 'free' ? '🆓' : type === 'paid' ? '💵' : '💝'}
                    </span>
                    <span className="capitalize font-medium">{type}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-sm mb-2">Ticket Name *</label>
                  <input
                    type="text"
                    value={ticket.name}
                    onChange={(e) => updateTicketClass(index, { name: e.target.value })}
                    placeholder="e.g., General Admission, VIP, Early Bird"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-2">Quantity Available</label>
                  <input
                    type="number"
                    value={ticket.quantity_total}
                    onChange={(e) => updateTicketClass(index, { quantity_total: Number(e.target.value) })}
                    min={1}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {ticket.type !== 'free' && (
                <div>
                  <label className="block text-white/60 text-sm mb-2">
                    {ticket.type === 'donation' ? 'Suggested Amount ($)' : 'Price ($)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={ticket.cost}
                      onChange={(e) => updateTicketClass(index, { cost: Number(e.target.value) })}
                      min={0}
                      className="w-full pl-8 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-white/60 text-sm mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={ticket.description || ''}
                  onChange={(e) => updateTicketClass(index, { description: e.target.value })}
                  placeholder="What's included with this ticket"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addTicketClass}
            className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-white/60 hover:border-amber-500 hover:text-amber-400 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span> Add Another Ticket Type
          </button>
        </div>
      )}

      {/* Step 4: Review & Publish */}
      {step === 4 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-xl p-6">
            <h3 className="text-amber-400 font-semibold text-lg mb-2 flex items-center gap-2">
              <span className="text-2xl">🚀</span> Ready to Publish!
            </h3>
            <p className="text-white/60">
              Review your event details below. When you publish, your event will be created on Eventbrite and you'll receive a link to share.
            </p>
          </div>

          {/* Event Preview */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {eventData.cover_image && (
              <img
                src={eventData.cover_image}
                alt="Event cover"
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-6 space-y-4">
              <div>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs uppercase">
                  {CATEGORIES.find(c => c.id === eventData.category)?.name || eventData.category}
                </span>
                <h3 className="text-2xl font-bold text-white mt-2">{eventData.name || 'Untitled Event'}</h3>
                {eventData.organizer && <p className="text-white/60">by {eventData.organizer}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 border-y border-white/10">
                <div className="flex items-start gap-3">
                  <span className="text-xl">📅</span>
                  <div>
                    <p className="text-white font-medium">{formatDate(eventData.start_date)}</p>
                    <p className="text-white/60 text-sm">{eventData.start_time} - {eventData.end_time}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl">📍</span>
                  <div>
                    {eventData.online_event ? (
                      <p className="text-white font-medium">Online Event</p>
                    ) : (
                      <>
                        <p className="text-white font-medium">{eventData.venue_name}</p>
                        <p className="text-white/60 text-sm">
                          {[eventData.venue_city, eventData.venue_region].filter(Boolean).join(', ')}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {eventData.summary && (
                <p className="text-white/80">{eventData.summary}</p>
              )}

              {/* Tickets Summary */}
              <div>
                <h4 className="text-white font-medium mb-3">Tickets</h4>
                <div className="space-y-2">
                  {ticketClasses.map((ticket, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div>
                        <p className="text-white font-medium">{ticket.name}</p>
                        <p className="text-white/60 text-sm">{ticket.quantity_total} available</p>
                      </div>
                      <span className={`font-bold ${ticket.free ? 'text-green-400' : 'text-amber-400'}`}>
                        {ticket.free ? 'Free' : `$${ticket.cost.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Success */}
      {step === 5 && (
        <div className="text-center py-12 animate-in fade-in duration-300">
          <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">🎉</span>
          </div>
          <h3 className="text-3xl font-bold text-white mb-2">Event Published!</h3>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            Your event is now live on Eventbrite and ready to share with the world.
          </p>

          {error && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 max-w-md mx-auto">
              <p className="text-yellow-400">{error}</p>
            </div>
          )}

          {/* Eventbrite Link */}
          {eventbriteUrl && (
            <div className="mb-6 p-6 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-xl border border-orange-500/20 max-w-lg mx-auto">
              <p className="text-orange-400 font-medium mb-3 flex items-center justify-center gap-2">
                <span>🎟️</span> Your Eventbrite Link
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={eventbriteUrl}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(eventbriteUrl);
                    alert('Link copied!');
                  }}
                  className="px-4 py-3 bg-orange-500 rounded-lg text-white font-medium hover:bg-orange-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Portal Link */}
          {portalUrl && (
            <div className="mb-8 p-6 bg-white/5 rounded-xl border border-white/10 max-w-lg mx-auto">
              <p className="text-white/60 text-sm mb-3">Share your event page:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={portalUrl}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(portalUrl);
                    alert('Link copied!');
                  }}
                  className="px-4 py-3 bg-amber-500 rounded-lg text-white font-medium hover:bg-amber-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {eventbriteUrl && (
              <a
                href={eventbriteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-white font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <span>🎟️</span> View on Eventbrite
              </a>
            )}
            {portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-xl text-white font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <span>🌐</span> View Event Page
              </a>
            )}
            <button
              onClick={resetForm}
              className="px-8 py-4 bg-white/10 rounded-xl text-white font-medium hover:bg-white/20 transition-colors"
            >
              Create Another Event
            </button>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      {step < 5 && (
        <div className="flex justify-between pt-6 border-t border-white/10">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors flex items-center gap-2"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-xl text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleCreateAndPublish}
              disabled={loading || !canProceed()}
              className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Publishing...
                </>
              ) : (
                <>
                  <span>🚀</span> Publish to Eventbrite
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
