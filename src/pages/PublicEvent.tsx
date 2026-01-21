import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';

// API Configuration
// API Configuration
const LOCAL_API = 'http://localhost:8080/api/v1';
// Use relative path in production to avoid CORS and mixed content issues
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/v1' : LOCAL_API);

// Event Design Templates
const EVENT_TEMPLATES = [
  { id: 'elegant-dark', name: 'Elegant Dark', bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)', accent: '#d4af37', textColor: '#fff', preview: '' },
  { id: 'vip-gold', name: 'VIP Gold', bg: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)', accent: '#ffd700', textColor: '#fff', preview: '' },
  { id: 'neon-night', name: 'Neon Night', bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', accent: '#ff00ff', textColor: '#fff', preview: '' },
  { id: 'sunset-party', name: 'Sunset Party', bg: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)', accent: '#fff', textColor: '#fff', preview: '' },
  { id: 'ocean-blue', name: 'Ocean Blue', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', accent: '#00d4ff', textColor: '#fff', preview: '' },
  { id: 'pool-party', name: 'Pool Party', bg: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', accent: '#fff', textColor: '#fff', preview: '' },
  { id: 'garden-party', name: 'Garden Party', bg: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)', accent: '#fff', textColor: '#fff', preview: '' },
  { id: 'rose-gold', name: 'Rose Gold', bg: 'linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%)', accent: '#e8b4b8', textColor: '#fff', preview: '' },
  { id: 'minimalist', name: 'Minimalist', bg: '#ffffff', accent: '#000000', textColor: '#000', preview: '' },
  { id: 'retro-disco', name: 'Retro Disco', bg: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)', accent: '#fff', textColor: '#fff', preview: '' },
];

interface PublicEventData {
  id: number;
  name: string;
  eventDate: string;
  eventTime?: string;
  endTime?: string;
  eventType?: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  template?: string;
  coverImage?: string;
  accentColor?: string;
  expectedAttendance?: number;
  dressCode?: string;
  theme?: string;
  ageRestriction?: string;
  rsvpEnabled?: boolean;
  showGuestList?: boolean;
  showGuestCount?: boolean;
  allowPlusOne?: boolean;
  maxPlusOne?: number;
  requireApproval?: boolean;
  isPublic?: boolean;
  slug?: string;
  ticketLink?: string;
  notes?: string;
  guestCount?: number;
}

interface RsvpForm {
  name: string;
  email: string;
  phone: string;
  partySize: number;
  notes: string;
  gender: string;
}

export default function PublicEvent() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<PublicEventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRsvpForm, setShowRsvpForm] = useState(false);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [rsvpForm, setRsvpForm] = useState<RsvpForm>({
    name: '',
    email: '',
    phone: '',
    partySize: 1,
    notes: '',
    gender: '',
  });

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setLoading(true);
        // The backend /events/:eventId endpoint supports both id and slug lookup
        const res = await fetch(`${API_URL}/events/${slug}`);
        if (res.ok) {
          const data = await res.json();
          // Map backend fields to our expected format
          const mappedEvent: PublicEventData = {
            id: data.id,
            name: data.title || data.name,
            eventDate: data.date || data.eventDate,
            eventTime: data.time || data.eventTime || data.startTime,
            endTime: data.endTime,
            eventType: data.category || data.eventType,
            description: data.description,
            venueName: data.venue || data.venueName,
            venueAddress: data.venueAddress,
            venueCity: data.venueCity,
            template: data.template || 'elegant-dark',
            coverImage: data.cover_image || data.flyerUrl || data.coverImage || data.flyer_url,
            accentColor: data.accentColor || '#d4af37',
            expectedAttendance: data.expectedAttendance,
            dressCode: data.dressCode,
            theme: data.theme,
            ageRestriction: data.ageRestriction,
            rsvpEnabled: data.guestListEnabled ?? data.rsvpEnabled ?? true,
            showGuestList: data.showGuestList ?? false,
            showGuestCount: data.showGuestCount ?? true,
            allowPlusOne: data.allowPlusOne ?? true,
            maxPlusOne: data.maxPlusOne ?? 5,
            requireApproval: data.requireApproval ?? false,
            isPublic: data.isPublic ?? true,
            slug: data.slug,
            ticketLink: data.eventbriteUrl || data.ticketLink,
            notes: data.notes,
            guestCount: data.guestCount,
          };
          setEvent(mappedEvent);
        } else if (res.status === 404) {
          setError('Event not found');
        } else {
          setError('Failed to load event');
        }
      } catch (err) {
        console.error('Error fetching event:', err);
        setError('Failed to load event');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchEvent();
    }
  }, [slug]);

  const handleRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    setRsvpSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/guest-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: rsvpForm.name,
          email: rsvpForm.email,
          phone: rsvpForm.phone,
          partySize: rsvpForm.partySize,
          notes: rsvpForm.notes,
          eventId: event.id,
          eventDate: event.eventDate,
          gender: rsvpForm.gender,
        }),
      });

      if (res.ok) {
        setRsvpSuccess(true);
        setShowRsvpForm(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit RSVP');
      }
    } catch (err) {
      console.error('Error submitting RSVP:', err);
      alert('Failed to submit RSVP');
    } finally {
      setRsvpSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #d4af37 0%, #f5d76e 100%)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            animation: 'pulse 2s infinite',
          }}>
            <span style={{ color: '#000', fontWeight: 'bold', fontSize: 24 }}>B</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading event...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 24 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>404</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
            Event Not Found
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
            {error || "This event doesn't exist or is no longer available."}
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: '#d4af37',
              color: '#000',
              fontWeight: 600,
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            Go to Berry Bly
          </a>
        </div>
      </div>
    );
  }

  const template = EVENT_TEMPLATES.find(t => t.id === event.template) || EVENT_TEMPLATES[0];
  const accentColor = event.accentColor || template.accent;

  return (
    <div style={{
      minHeight: '100vh',
      background: template.bg,
      color: template.textColor,
    }}>
      {/* Cover Image */}
      {event.coverImage && (
        <div style={{
          height: 300,
          background: `url(${event.coverImage}) center/cover`,
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.9) 100%)',
            }} />
        </div>
      )}

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          maxWidth: 600,
          margin: '0 auto',
          padding: event.coverImage ? '0 24px 60px' : '60px 24px',
          marginTop: event.coverImage ? -100 : 0,
          position: 'relative',
        }}
      >
        {/* Event Type Badge */}
        {event.eventType && (
          <div style={{
            display: 'inline-block',
            padding: '6px 14px',
            background: `${accentColor}20`,
            border: `1px solid ${accentColor}40`,
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: accentColor,
            marginBottom: 16,
          }}>
            {event.eventType}
          </div>
        )}

        {/* Event Title */}
        <h1 style={{
          fontSize: 42,
          fontWeight: 700,
          margin: '0 0 12px',
          lineHeight: 1.1,
        }}>
          {event.name}
        </h1>

        {/* Theme */}
        {event.theme && (
          <div style={{
            fontSize: 18,
            color: accentColor,
            marginBottom: 24,
            fontWeight: 600,
          }}>
            {event.theme}
          </div>
        )}

        {/* Event Details Grid */}
        <div style={{
          display: 'grid',
          gap: 16,
          marginTop: 32,
          padding: 24,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 16,
          backdropFilter: 'blur(10px)',
        }}>
          {/* Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 48,
              height: 48,
              background: `${accentColor}20`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}>

            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>
                {new Date(event.eventDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
              {event.eventTime && (
                <div style={{ fontSize: 14, opacity: 0.8 }}>
                  {event.eventTime}
                  {event.endTime && ` - ${event.endTime}`}
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          {event.venueName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                background: `${accentColor}20`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>

              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{event.venueName}</div>
                {(event.venueAddress || event.venueCity) && (
                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    {event.venueAddress}
                    {event.venueAddress && event.venueCity && ', '}
                    {event.venueCity}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dress Code */}
          {event.dressCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                background: `${accentColor}20`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>

              </div>
              <div>
                <div style={{ fontSize: 14, opacity: 0.7 }}>Dress Code</div>
                <div style={{ fontWeight: 600 }}>{event.dressCode}</div>
              </div>
            </div>
          )}

          {/* Age Restriction */}
          {event.ageRestriction && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48,
                height: 48,
                background: `${accentColor}20`,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>

              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{event.ageRestriction}</div>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {event.description && (
          <div style={{
            marginTop: 32,
            padding: 24,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 16,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>
              About This Event
            </h3>
            <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {event.description}
            </p>
          </div>
        )}

        {/* Guest Count */}
        {event.showGuestCount && event.guestCount !== undefined && (
          <div style={{
            marginTop: 24,
            padding: '16px 24px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ fontSize: 20 }}></span>
            <span style={{ fontWeight: 600 }}>
              {event.guestCount} {event.guestCount === 1 ? 'person' : 'people'} going
            </span>
          </div>
        )}

        {/* RSVP Section */}
        {event.rsvpEnabled && !rsvpSuccess && (
          <div style={{ marginTop: 32 }}>
            {!showRsvpForm ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRsvpForm(true)}
                style={{
                  width: '100%',
                  padding: '18px 24px',
                  background: accentColor,
                  border: 'none',
                  borderRadius: 12,
                  color: template.id === 'minimalist' ? '#fff' : '#000',
                  fontWeight: 700,
                  fontSize: 18,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                }}
              >
                RSVP Now
              </motion.button>
            ) : (
              <form onSubmit={handleRsvp} style={{
                padding: 24,
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 16,
                backdropFilter: 'blur(10px)',
              }}>
                <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>RSVP to this Event</h3>
                <div style={{ display: 'grid', gap: 16 }}>
                  <input
                    type="text"
                    placeholder="Your Name *"
                    required
                    value={rsvpForm.name}
                    onChange={e => setRsvpForm(p => ({ ...p, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 16,
                    }}
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    required
                    value={rsvpForm.email}
                    onChange={e => setRsvpForm(p => ({ ...p, email: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 16,
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      value={rsvpForm.phone}
                      onChange={e => setRsvpForm(p => ({ ...p, phone: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 16,
                      }}
                    />
                    <select
                      required
                      value={rsvpForm.gender}
                      onChange={e => setRsvpForm(p => ({ ...p, gender: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 16,
                      }}
                    >
                      <option value="" disabled>Select Gender *</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {event.allowPlusOne && (
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 8, opacity: 0.8 }}>
                        Party Size
                      </label>
                      <select
                        value={rsvpForm.partySize}
                        onChange={e => setRsvpForm(p => ({ ...p, partySize: Number(e.target.value) }))}
                        style={{
                          width: '100%',
                          padding: '14px 16px',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 8,
                          color: '#fff',
                          fontSize: 16,
                        }}
                      >
                        {[...Array(event.maxPlusOne || 1)].map((_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1} {i === 0 ? 'person' : 'people'}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <textarea
                    placeholder="Any notes or dietary restrictions?"
                    value={rsvpForm.notes}
                    onChange={e => setRsvpForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 16,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => setShowRsvpForm(false)}
                      style={{
                        flex: 1,
                        padding: '14px 24px',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 8,
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={rsvpSubmitting}
                      style={{
                        flex: 2,
                        padding: '14px 24px',
                        background: accentColor,
                        border: 'none',
                        borderRadius: 8,
                        color: template.id === 'minimalist' ? '#fff' : '#000',
                        fontWeight: 700,
                        cursor: rsvpSubmitting ? 'not-allowed' : 'pointer',
                        opacity: rsvpSubmitting ? 0.7 : 1,
                      }}
                    >
                      {rsvpSubmitting ? 'Submitting...' : 'Submit RSVP'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* RSVP Success */}
        {rsvpSuccess && (
          <div style={{
            marginTop: 32,
            padding: 24,
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 16,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}></div>
            <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              {event.requireApproval ? "RSVP Submitted!" : "You're on the list!"}
            </h3>
            <p style={{ opacity: 0.8 }}>
              {event.requireApproval
                ? "Your RSVP is pending approval. You'll receive a confirmation email soon."
                : "You'll receive a confirmation email shortly."}
            </p>
          </div>
        )}

        {/* Ticket Link */}
        {event.ticketLink && (
          <a
            href={event.ticketLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              marginTop: 16,
              padding: '16px 24px',
              background: 'transparent',
              border: `2px solid ${accentColor}`,
              borderRadius: 12,
              color: accentColor,
              fontWeight: 600,
              fontSize: 16,
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Get Tickets
          </a>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 60,
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          textAlign: 'center',
        }}>
          <div style={{ opacity: 0.5, fontSize: 13 }}>
            Powered by <a href="https://berry.merktop.com" style={{ color: accentColor, textDecoration: 'none' }}>Berry Bly Productions</a>
          </div>
        </div>
      </motion.div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        input::placeholder, textarea::placeholder {
          color: rgba(255,255,255,0.4);
        }
        select option {
          background: #1a1a1a;
          color: #fff;
        }
      `}</style>
    </div>
  );
}
