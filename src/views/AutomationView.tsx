// Automation View - Click-based Email/SMS Automation
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../constants';

// Types
interface Event {
  id: number;
  name: string;
  eventDate: string;
  status: string;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  status: string;
  eventId?: number;
}

interface Campaign {
  id: number;
  type: 'sms' | 'email';
  recipients: string[];
  content: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
  automation_type?: string;
  event_name?: string;
}

interface AutomationViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  token?: string;
}

// Predefined templates with {name} personalization
const PREDEFINED_TEMPLATES = {
  reminder: [
    {
      id: 'reminder-24h',
      name: 'Event Reminder (24h)',
      subject: "Don't Miss Tomorrow's Event!",
      content: `Hey {name}! 👋

Just a quick reminder that our event is TOMORROW!

We can't wait to see you there. Make sure to:
✓ Arrive on time
✓ Bring your ID
✓ Check your email for any updates

See you soon!`,
      smsContent: "Hey {name}! Reminder: Our event is TOMORROW! Can't wait to see you there 🎉",
    },
    {
      id: 'reminder-1week',
      name: 'Event Reminder (1 Week)',
      subject: "One Week Until The Big Event!",
      content: `Hi {name}!

This is your one-week reminder that our event is coming up!

Mark your calendar and get ready for an amazing experience. We've got some incredible things planned for you.

Need any info? Just reply to this email.

See you in 7 days!`,
      smsContent: "Hi {name}! Just 1 week until our event! Get ready for something special 🌟",
    },
    {
      id: 'reminder-1h',
      name: 'Last Chance Reminder (1h)',
      subject: "Starting in 1 Hour! ⏰",
      content: `{name}, we're about to start!

The event begins in just 1 hour. Here's what you need to know:

📍 Check your confirmation email for the venue address
🎟️ Have your ticket/confirmation ready
⏰ Doors open 15 minutes before start time

See you very soon!`,
      smsContent: "{name}, starting in 1 HOUR! Check your email for venue details. See you soon! 🚀",
    },
  ],
  welcome: [
    {
      id: 'welcome-registration',
      name: 'Registration Confirmation',
      subject: "You're In! Welcome to the Event 🎉",
      content: `Welcome {name}!

Great news - your registration is confirmed!

We're thrilled to have you join us. Here's what happens next:

1. You'll receive event details closer to the date
2. Keep an eye on your inbox for updates
3. Add the event to your calendar

Questions? Just reply to this email.

Welcome aboard!`,
      smsContent: "Welcome {name}! Your registration is confirmed 🎉 Check your email for all the details!",
    },
    {
      id: 'welcome-vip',
      name: 'VIP Welcome',
      subject: "VIP Access Confirmed ⭐",
      content: `{name}, you're VIP!

Congratulations! Your VIP status has been confirmed.

As a VIP guest, you'll enjoy:
⭐ Priority entry
⭐ Exclusive access areas
⭐ Special perks throughout the event

We can't wait to give you the VIP treatment!

See you there!`,
      smsContent: "Congrats {name}! Your VIP status is confirmed ⭐ Priority entry + exclusive perks await!",
    },
  ],
  followup: [
    {
      id: 'followup-thankyou',
      name: 'Thank You (Post-Event)',
      subject: "Thank You for Being Amazing! 🙏",
      content: `{name}, thank you!

We had an incredible time and YOU made it special.

Your energy, enthusiasm, and presence made the event unforgettable. We hope you enjoyed it as much as we did!

Stay tuned for:
→ Event photos coming soon
→ Announcements for future events
→ Exclusive opportunities

Until next time!`,
      smsContent: "Thank you {name}! You made the event amazing 🙏 Stay tuned for photos and future events!",
    },
    {
      id: 'followup-feedback',
      name: 'Feedback Request',
      subject: "Quick Question, {name}...",
      content: `Hey {name}!

How was the event? We'd love to hear your thoughts!

Your feedback helps us make future events even better. Just hit reply and let us know:

• What did you enjoy most?
• What could we improve?
• Would you come again?

Thanks for taking a moment to share!`,
      smsContent: "Hey {name}! How was the event? Reply with your feedback - we'd love to hear from you! 💬",
    },
  ],
};

// Timing presets
const TIMING_PRESETS = [
  { id: 'immediate', label: 'Immediate', value: 0, unit: 'hours', direction: 'before' },
  { id: '1h-before', label: '1 hour before', value: 1, unit: 'hours', direction: 'before' },
  { id: '24h-before', label: '24 hours before', value: 24, unit: 'hours', direction: 'before' },
  { id: '3d-before', label: '3 days before', value: 3, unit: 'days', direction: 'before' },
  { id: '1w-before', label: '1 week before', value: 7, unit: 'days', direction: 'before' },
  { id: '1d-after', label: '1 day after', value: 1, unit: 'days', direction: 'after' },
];

export function AutomationView({ onToast, token }: AutomationViewProps) {
  // Data states
  const [events, setEvents] = useState<Event[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard states
  const [step, setStep] = useState(1);
  const [automationType, setAutomationType] = useState<'reminder' | 'welcome' | 'followup' | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof PREDEFINED_TEMPLATES.reminder[0] | null>(null);
  const [channel, setChannel] = useState<'email' | 'sms'>('email');

  // Timing states
  const [timingPreset, setTimingPreset] = useState<string | null>(null);
  const [customTiming, setCustomTiming] = useState({ value: 1, unit: 'days', direction: 'before' });

  // Audience states
  const [audienceType, setAudienceType] = useState<'all' | 'category' | 'status' | 'manual'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');

  // View mode
  const [viewMode, setViewMode] = useState<'create' | 'campaigns'>('create');

  // Auth headers helper
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

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, guestsRes, campaignsRes] = await Promise.all([
        fetch(`${API_URL}/events`, { headers: getHeaders() }),
        fetch(`${API_URL}/guest-lists`, { headers: getHeaders() }),
        fetch(`${API_URL}/automation/campaigns`, { headers: getHeaders() }),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || data || []);
      }

      if (guestsRes.ok) {
        const data = await guestsRes.json();
        const entries = data.entries || data.data || data || [];
        setGuests(entries.map((g: any) => ({
          id: String(g.id),
          name: g.name || '',
          email: g.email || '',
          phone: g.phone || '',
          category: g.category || 'pending',
          status: g.status || 'pending',
          eventId: g.eventId || g.event_id,
        })));
      }

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get filtered guests based on audience selection
  const getFilteredGuests = useCallback(() => {
    let filtered = guests;

    // Filter by event if selected
    if (selectedEvent) {
      filtered = filtered.filter(g => g.eventId === selectedEvent.id || !g.eventId);
    }

    // Filter by audience type
    if (audienceType === 'category') {
      filtered = filtered.filter(g => selectedCategories.includes(g.category));
    } else if (audienceType === 'status') {
      filtered = filtered.filter(g => selectedStatuses.includes(g.status));
    } else if (audienceType === 'manual') {
      filtered = filtered.filter(g => selectedGuestIds.includes(g.id));
    }

    return filtered;
  }, [guests, selectedEvent, audienceType, selectedCategories, selectedStatuses, selectedGuestIds]);

  // Calculate scheduled time
  const getScheduledTime = useCallback(() => {
    if (!selectedEvent) return new Date();

    const eventDate = new Date(selectedEvent.eventDate);
    const preset = TIMING_PRESETS.find(p => p.id === timingPreset);

    if (preset) {
      const multiplier = preset.direction === 'before' ? -1 : 1;
      const ms = preset.unit === 'hours' ? preset.value * 60 * 60 * 1000 : preset.value * 24 * 60 * 60 * 1000;
      return new Date(eventDate.getTime() + (multiplier * ms));
    }

    // Custom timing
    const multiplier = customTiming.direction === 'before' ? -1 : 1;
    const ms = customTiming.unit === 'hours' ? customTiming.value * 60 * 60 * 1000 : customTiming.value * 24 * 60 * 60 * 1000;
    return new Date(eventDate.getTime() + (multiplier * ms));
  }, [selectedEvent, timingPreset, customTiming]);

  // Personalize message with guest name
  const personalizeMessage = (template: string, guestName: string) => {
    return template.replace(/\{name\}/g, guestName);
  };

  // Activate automation
  const handleActivate = async () => {
    const filteredGuests = getFilteredGuests();
    if (filteredGuests.length === 0) {
      onToast('No recipients selected', 'error');
      return;
    }

    if (!selectedTemplate) {
      onToast('Please select a template', 'error');
      return;
    }

    const scheduledAt = getScheduledTime();
    const isImmediate = timingPreset === 'immediate';

    try {
      // Send personalized messages to each guest
      const promises = filteredGuests.map(async (guest) => {
        const personalizedContent = channel === 'email'
          ? personalizeMessage(selectedTemplate.content, guest.name)
          : personalizeMessage(selectedTemplate.smsContent, guest.name);

        const personalizedSubject = channel === 'email'
          ? personalizeMessage(selectedTemplate.subject, guest.name)
          : '';

        if (isImmediate) {
          // Send now
          return fetch(`${API_URL}/automation/send-now`, {
            method: 'POST',
            headers: getHeaders('application/json'),
            body: JSON.stringify({
              type: channel,
              recipients: [channel === 'email' ? guest.email : guest.phone],
              message: personalizedContent,
              subject: personalizedSubject,
              htmlContent: channel === 'email' ? `<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; padding: 32px; color: #fff;">
                  <h2 style="color: #d4af37; margin: 0 0 20px;">${personalizedSubject}</h2>
                  <div style="white-space: pre-line; line-height: 1.6; color: rgba(255,255,255,0.9);">${personalizedContent}</div>
                </div>
              </div>` : undefined,
            }),
          });
        } else {
          // Schedule
          return fetch(`${API_URL}/automation/email/schedule`, {
            method: 'POST',
            headers: getHeaders('application/json'),
            body: JSON.stringify({
              recipients: [channel === 'email' ? guest.email : guest.phone],
              message: personalizedContent,
              subject: personalizedSubject,
              scheduledAt: scheduledAt.toISOString(),
              automationType: automationType,
              eventName: selectedEvent?.name,
            }),
          });
        }
      });

      await Promise.all(promises);
      onToast(`Automation ${isImmediate ? 'sent' : 'scheduled'} for ${filteredGuests.length} recipients!`, 'success');
      resetWizard();
      fetchData();
    } catch (err) {
      onToast('Error activating automation', 'error');
    }
  };

  // Reset wizard
  const resetWizard = () => {
    setStep(1);
    setAutomationType(null);
    setSelectedEvent(null);
    setSelectedTemplate(null);
    setTimingPreset(null);
    setAudienceType('all');
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSelectedGuestIds([]);
    setChannel('email');
  };

  // Cancel campaign
  const handleCancelCampaign = async (campaign: Campaign) => {
    try {
      await fetch(`${API_URL}/automation/email/scheduled/${campaign.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      onToast('Campaign cancelled', 'success');
      fetchData();
    } catch (err) {
      onToast('Error cancelling campaign', 'error');
    }
  };

  // Stats
  const stats = {
    active: campaigns.filter(c => c.status === 'pending').length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    totalSent: campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0),
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading automation...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setViewMode('create')}
            style={{
              background: viewMode === 'create' ? 'linear-gradient(to right, #d4af37, #b8922f)' : 'rgba(255,255,255,0.03)',
              color: viewMode === 'create' ? '#000' : 'rgba(255,255,255,0.4)',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⚡ Create Automation
          </button>
          <button
            onClick={() => setViewMode('campaigns')}
            style={{
              background: viewMode === 'campaigns' ? 'linear-gradient(to right, #d4af37, #b8922f)' : 'rgba(255,255,255,0.03)',
              color: viewMode === 'campaigns' ? '#000' : 'rgba(255,255,255,0.4)',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📅 Active Campaigns ({stats.active})
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          <span>✓ {stats.sent} completed</span>
          <span>📧 {stats.totalSent} messages sent</span>
        </div>
      </div>

      {/* Campaigns View */}
      {viewMode === 'campaigns' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Event</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Recipients</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Scheduled</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={campaign.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: campaign.type === 'email' ? 'rgba(139,92,246,0.2)' : 'rgba(34,197,94,0.2)',
                      color: campaign.type === 'email' ? '#8b5cf6' : '#22c55e',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                    }}>
                      {campaign.type === 'email' ? '✉️ Email' : '📱 SMS'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)' }}>
                    {campaign.event_name || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
                    {Array.isArray(campaign.recipients) ? campaign.recipients.length : 0}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                    {new Date(campaign.scheduled_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: campaign.status === 'sent' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                      color: campaign.status === 'sent' ? '#22c55e' : '#f59e0b',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                    }}>
                      {campaign.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {campaign.status === 'pending' && (
                      <button
                        onClick={() => handleCancelCampaign(campaign)}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📅</div>
              <p style={{ color: 'rgba(255,255,255,0.3)' }}>No active campaigns</p>
            </div>
          )}
        </div>
      )}

      {/* Create Automation Wizard */}
      {viewMode === 'create' && (
        <div>
          {/* Progress Steps */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: s <= step ? 'linear-gradient(to right, #d4af37, #b8922f)' : 'rgba(255,255,255,0.1)',
                  transition: 'all 0.3s',
                }}
              />
            ))}
          </div>

          {/* Step 1: Automation Type */}
          {step === 1 && (
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 600 }}>What do you want to automate?</h2>
              <p style={{ margin: '0 0 24px', color: 'rgba(255,255,255,0.4)' }}>Select the type of automation you want to create</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { type: 'reminder' as const, icon: '📅', title: 'Event Reminder', desc: 'Send before the event' },
                  { type: 'welcome' as const, icon: '👋', title: 'Welcome Message', desc: 'When guests register' },
                  { type: 'followup' as const, icon: '🙏', title: 'Follow-up', desc: 'Send after the event' },
                ].map(item => (
                  <button
                    key={item.type}
                    onClick={() => { setAutomationType(item.type); setStep(2); }}
                    style={{
                      background: automationType === item.type ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                      border: automationType === item.type ? '2px solid #d4af37' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 16,
                      padding: 32,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 48, marginBottom: 16 }}>{item.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>{item.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Select Event */}
          {step === 2 && (() => {
            const upcomingEvents = events.filter(e => new Date(e.eventDate) >= new Date());
            return (
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 600 }}>Select Event</h2>
              <p style={{ margin: '0 0 24px', color: 'rgba(255,255,255,0.4)' }}>Choose an upcoming event for this automation</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {upcomingEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => { setSelectedEvent(event); setStep(3); }}
                    style={{
                      background: selectedEvent?.id === event.id ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                      border: selectedEvent?.id === event.id ? '2px solid #d4af37' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 16,
                      padding: 20,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>{event.name}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                      📅 {new Date(event.eventDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        background: event.status === 'confirmed' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                        color: event.status === 'confirmed' ? '#22c55e' : '#f59e0b',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        textTransform: 'uppercase',
                      }}>
                        {event.status}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                        {guests.filter(g => g.eventId === event.id || !g.eventId).length} guests
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {upcomingEvents.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, background: 'rgba(255,255,255,0.02)', borderRadius: 16 }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📅</div>
                  <p style={{ color: 'rgba(255,255,255,0.3)' }}>No upcoming events found. Create an event first.</p>
                </div>
              )}

              <button
                onClick={() => setStep(1)}
                style={{ marginTop: 24, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }}
              >
                ← Back
              </button>
            </div>
            );
          })()}

          {/* Step 3: Select Template */}
          {step === 3 && automationType && (
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 600 }}>Choose a Template</h2>
              <p style={{ margin: '0 0 24px', color: 'rgba(255,255,255,0.4)' }}>Select a pre-written message (personalized with guest's name)</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {PREDEFINED_TEMPLATES[automationType].map(template => (
                  <button
                    key={template.id}
                    onClick={() => { setSelectedTemplate(template); setStep(4); }}
                    style={{
                      background: selectedTemplate?.id === template.id ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                      border: selectedTemplate?.id === template.id ? '2px solid #d4af37' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 16,
                      padding: 20,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>{template.name}</div>
                    <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 12 }}>Subject: {template.subject}</div>
                    <div style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.4)',
                      lineHeight: 1.5,
                      maxHeight: 80,
                      overflow: 'hidden',
                      whiteSpace: 'pre-line',
                    }}>
                      {template.content.substring(0, 150)}...
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                style={{ marginTop: 24, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }}
              >
                ← Back
              </button>
            </div>
          )}

          {/* Step 4: Configure & Activate */}
          {step === 4 && selectedTemplate && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
              {/* Left: Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Channel */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Channel</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setChannel('email')}
                      style={{
                        flex: 1,
                        background: channel === 'email' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                        border: channel === 'email' ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                        color: channel === 'email' ? '#8b5cf6' : 'rgba(255,255,255,0.4)',
                        padding: '14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: 15,
                      }}
                    >
                      ✉️ Email
                    </button>
                    <button
                      onClick={() => setChannel('sms')}
                      style={{
                        flex: 1,
                        background: channel === 'sms' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.03)',
                        border: channel === 'sms' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
                        color: channel === 'sms' ? '#22c55e' : 'rgba(255,255,255,0.4)',
                        padding: '14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: 15,
                      }}
                    >
                      📱 SMS
                    </button>
                  </div>
                </div>

                {/* Timing */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>When to Send</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {TIMING_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setTimingPreset(preset.id)}
                        style={{
                          background: timingPreset === preset.id ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)',
                          border: timingPreset === preset.id ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.06)',
                          color: timingPreset === preset.id ? '#d4af37' : 'rgba(255,255,255,0.6)',
                          padding: '8px 16px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom timing */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Custom:</span>
                    <input
                      type="number"
                      min="1"
                      value={customTiming.value}
                      onChange={(e) => { setCustomTiming(prev => ({ ...prev, value: parseInt(e.target.value) || 1 })); setTimingPreset(null); }}
                      style={{ width: 60, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6, textAlign: 'center' }}
                    />
                    <select
                      value={customTiming.unit}
                      onChange={(e) => { setCustomTiming(prev => ({ ...prev, unit: e.target.value })); setTimingPreset(null); }}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6 }}
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    <select
                      value={customTiming.direction}
                      onChange={(e) => { setCustomTiming(prev => ({ ...prev, direction: e.target.value })); setTimingPreset(null); }}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: 6 }}
                    >
                      <option value="before">before event</option>
                      <option value="after">after event</option>
                    </select>
                  </div>
                </div>

                {/* Audience */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Who Receives This</h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* All guests */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px', background: audienceType === 'all' ? 'rgba(212,175,55,0.1)' : 'transparent', borderRadius: 8 }}>
                      <input
                        type="radio"
                        checked={audienceType === 'all'}
                        onChange={() => setAudienceType('all')}
                        style={{ accentColor: '#d4af37' }}
                      />
                      <span style={{ fontWeight: 500 }}>All guests ({guests.length})</span>
                    </label>

                    {/* By category */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px', background: audienceType === 'category' ? 'rgba(212,175,55,0.1)' : 'transparent', borderRadius: 8 }}>
                      <input
                        type="radio"
                        checked={audienceType === 'category'}
                        onChange={() => setAudienceType('category')}
                        style={{ accentColor: '#d4af37' }}
                      />
                      <span style={{ fontWeight: 500 }}>By category</span>
                    </label>
                    {audienceType === 'category' && (
                      <div style={{ display: 'flex', gap: 8, marginLeft: 32 }}>
                        {['A', 'B', 'C', 'pending'].map(cat => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                            style={{
                              background: selectedCategories.includes(cat) ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)',
                              border: selectedCategories.includes(cat) ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                              color: selectedCategories.includes(cat) ? '#d4af37' : 'rgba(255,255,255,0.6)',
                              padding: '6px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            {cat === 'A' ? '⭐ VIP' : cat === 'B' ? '🎯 Priority' : cat === 'C' ? '👤 Standard' : '⏳ Pending'}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* By status */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px', background: audienceType === 'status' ? 'rgba(212,175,55,0.1)' : 'transparent', borderRadius: 8 }}>
                      <input
                        type="radio"
                        checked={audienceType === 'status'}
                        onChange={() => setAudienceType('status')}
                        style={{ accentColor: '#d4af37' }}
                      />
                      <span style={{ fontWeight: 500 }}>By status</span>
                    </label>
                    {audienceType === 'status' && (
                      <div style={{ display: 'flex', gap: 8, marginLeft: 32 }}>
                        {['approved', 'pending', 'checked_in'].map(status => (
                          <button
                            key={status}
                            onClick={() => setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}
                            style={{
                              background: selectedStatuses.includes(status) ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.03)',
                              border: selectedStatuses.includes(status) ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                              color: selectedStatuses.includes(status) ? '#d4af37' : 'rgba(255,255,255,0.6)',
                              padding: '6px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              textTransform: 'capitalize',
                            }}
                          >
                            {status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Manual selection */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '12px', background: audienceType === 'manual' ? 'rgba(212,175,55,0.1)' : 'transparent', borderRadius: 8 }}>
                      <input
                        type="radio"
                        checked={audienceType === 'manual'}
                        onChange={() => setAudienceType('manual')}
                        style={{ accentColor: '#d4af37' }}
                      />
                      <span style={{ fontWeight: 500 }}>Select manually ({selectedGuestIds.length} selected)</span>
                    </label>
                    {audienceType === 'manual' && (
                      <button
                        onClick={() => setShowGuestPicker(true)}
                        style={{ marginLeft: 32, background: 'rgba(255,255,255,0.05)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                      >
                        Open Guest Picker →
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Preview */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, position: 'sticky', top: 20, height: 'fit-content' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Preview</h3>

                <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>To</div>
                  <div style={{ color: '#fff' }}>{getFilteredGuests().length} guests</div>
                </div>

                <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Scheduled</div>
                  <div style={{ color: '#fff' }}>
                    {timingPreset === 'immediate' ? 'Send immediately' : getScheduledTime().toLocaleString()}
                  </div>
                </div>

                {channel === 'email' && (
                  <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Subject</div>
                    <div style={{ color: '#d4af37' }}>{selectedTemplate.subject}</div>
                  </div>
                )}

                <div style={{ marginBottom: 20, padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Message Preview</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {personalizeMessage(channel === 'email' ? selectedTemplate.content : selectedTemplate.smsContent, 'John')}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setStep(3)}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '14px', borderRadius: 8, cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleActivate}
                    disabled={getFilteredGuests().length === 0}
                    style={{
                      flex: 2,
                      background: getFilteredGuests().length > 0 ? 'linear-gradient(to right, #d4af37, #b8922f)' : 'rgba(255,255,255,0.1)',
                      color: getFilteredGuests().length > 0 ? '#000' : 'rgba(255,255,255,0.3)',
                      border: 'none',
                      padding: '14px',
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: getFilteredGuests().length > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    ⚡ {timingPreset === 'immediate' ? 'Send Now' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Guest Picker Modal */}
      {showGuestPicker && (() => {
        const searchLower = guestSearch.toLowerCase();
        const filteredPickerGuests = guests.filter(g =>
          g.name.toLowerCase().includes(searchLower) ||
          g.email.toLowerCase().includes(searchLower) ||
          g.phone.toLowerCase().includes(searchLower)
        );
        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Select Guests</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setSelectedGuestIds([])}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setSelectedGuestIds(filteredPickerGuests.map(g => g.id))}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Select All
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="🔍 Search by name, email or phone..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>{selectedGuestIds.length} selected</span>
              <span>{filteredPickerGuests.length} of {guests.length} shown</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredPickerGuests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>
                  No guests match "{guestSearch}"
                </div>
              ) : (
                filteredPickerGuests.map(guest => (
                  <label
                    key={guest.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: selectedGuestIds.includes(guest.id) ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                      border: selectedGuestIds.includes(guest.id) ? '1px solid rgba(212,175,55,0.2)' : '1px solid rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGuestIds.includes(guest.id)}
                      onChange={() => setSelectedGuestIds(prev => prev.includes(guest.id) ? prev.filter(id => id !== guest.id) : [...prev, guest.id])}
                      style={{ accentColor: '#d4af37' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{guest.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', gap: 8 }}>
                        <span>📧 {guest.email || '-'}</span>
                        <span>📱 {guest.phone || '-'}</span>
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => { setSelectedGuestIds([]); setGuestSearch(''); setShowGuestPicker(false); }}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setGuestSearch(''); setShowGuestPicker(false); }}
                style={{ flex: 1, background: 'linear-gradient(to right, #d4af37, #b8922f)', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                Done ({selectedGuestIds.length})
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
