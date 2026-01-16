import { useState } from 'react';
import type { EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface SMSComposerProps {
  events: EventbriteEventMetrics[];
}

type RecipientType = 'all_buyers' | 'all_attendees' | 'checked_in' | 'not_checked_in';

const RECIPIENT_OPTIONS = [
  { value: 'all_buyers', label: 'All Buyers', description: 'Everyone who purchased tickets' },
  { value: 'all_attendees', label: 'All Attendees', description: 'All registered attendees with phone numbers' },
  { value: 'checked_in', label: 'Checked In Only', description: 'Only attendees who have checked in' },
  { value: 'not_checked_in', label: 'Not Checked In', description: 'Attendees who haven\'t checked in yet' },
];

const SMS_TEMPLATES = [
  {
    name: 'Event Reminder',
    content: `Hi {{name}}! 📍 Reminder: {{event_name}} is coming up! See you at {{venue}}. Reply STOP to opt out.`,
  },
  {
    name: 'Day-Of Reminder',
    content: `Hey {{name}}! 🎉 {{event_name}} is TODAY! Doors open at {{event_date}}. See you soon!`,
  },
  {
    name: 'Thank You',
    content: `Thanks for attending {{event_name}}, {{name}}! 🙌 Hope you had a great time. Stay tuned for more events!`,
  },
  {
    name: 'Last Chance',
    content: `⚡ {{name}}, last chance to get tickets for {{event_name}}! Don't miss out - grab yours now!`,
  },
  {
    name: 'Custom',
    content: '',
  },
];

export function SMSComposer({ events }: SMSComposerProps) {
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [recipientType, setRecipientType] = useState<RecipientType>('all_buyers');
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('berry_token')}`,
  };

  const handleTemplateSelect = (index: number) => {
    setSelectedTemplate(index);
    const template = SMS_TEMPLATES[index];
    setMessage(template.content);
  };

  const getCharCount = () => message.length;
  const getSegments = () => Math.ceil(message.length / 160) || 1;

  const handleSendSMS = async () => {
    if (!selectedEvent) {
      alert('Please select an event');
      return;
    }
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const endpoint = `${API_URL}/integrations/eventbrite/sms/send`;

      const payload: Record<string, unknown> = {
        event_id: selectedEvent,
        message,
        recipient_type: recipientType,
      };

      // Add filter for specific recipient types
      if (recipientType === 'checked_in') {
        payload.filter = { checked_in: true };
      } else if (recipientType === 'not_checked_in') {
        payload.filter = { checked_in: false };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          message: 'SMS messages sent successfully!',
          count: data.sent || data.recipients?.length || 0,
        });
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to send SMS messages',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Failed to send SMS messages',
      });
    } finally {
      setSending(false);
    }
  };

  const getSelectedEventName = () => {
    const event = events.find(e => e.id === selectedEvent);
    return event?.name || 'Your Event';
  };

  const getPreviewMessage = () => {
    const eventName = getSelectedEventName();
    const event = events.find(e => e.id === selectedEvent);

    return message
      .replace(/\{\{event_name\}\}/g, eventName)
      .replace(/\{\{name\}\}/g, 'John')
      .replace(/\{\{event_date\}\}/g, event?.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBD')
      .replace(/\{\{venue\}\}/g, event?.venue || 'TBD');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">SMS Composer</h2>
        <p className="text-white/60 text-sm">Send SMS to attendees via Telnyx integration</p>
      </div>

      {/* Result Message */}
      {result && (
        <div
          className={`p-4 rounded-xl flex items-center gap-4 ${
            result.success
              ? 'bg-green-500/20 border border-green-500/30'
              : 'bg-red-500/20 border border-red-500/30'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl ${
            result.success ? 'bg-green-500' : 'bg-red-500'
          }`}>
            {result.success ? '✓' : '✗'}
          </div>
          <div>
            <p className={`font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
              {result.message}
            </p>
            {result.count !== undefined && (
              <p className="text-white/60 text-sm">
                {result.count} message{result.count !== 1 ? 's' : ''} sent
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column */}
        <div className="space-y-4">
          {/* Event Selection */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <label className="block text-white/80 text-sm mb-2">Select Event *</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-green-500 focus:outline-none"
            >
              <option value="">Choose an event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          {/* Recipient Type */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <label className="block text-white/80 text-sm mb-3">Recipients</label>
            <div className="space-y-2">
              {RECIPIENT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    recipientType === option.value
                      ? 'bg-green-500/20 border border-green-500/30'
                      : 'bg-white/5 border border-transparent hover:border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="recipientType"
                    value={option.value}
                    checked={recipientType === option.value}
                    onChange={(e) => setRecipientType(e.target.value as RecipientType)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-white font-medium text-sm">{option.label}</p>
                    <p className="text-white/40 text-xs">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <label className="block text-white/80 text-sm mb-3">SMS Template</label>
            <div className="space-y-2">
              {SMS_TEMPLATES.map((template, index) => (
                <button
                  key={template.name}
                  onClick={() => handleTemplateSelect(index)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    selectedTemplate === index
                      ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                      : 'bg-white/5 border border-transparent text-white/80 hover:border-white/10'
                  }`}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Editor Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Message Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/80 text-sm">Message *</label>
              <div className="flex items-center gap-4 text-xs">
                <span className={`${getCharCount() > 160 ? 'text-amber-400' : 'text-white/40'}`}>
                  {getCharCount()}/160 chars
                </span>
                <span className="text-white/40">
                  {getSegments()} segment{getSegments() !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your SMS message..."
              rows={5}
              maxLength={480}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-green-500 focus:outline-none resize-none"
            />
            <p className="text-white/40 text-xs mt-1">
              Variables: {'{{event_name}}'}, {'{{name}}'}, {'{{event_date}}'}, {'{{venue}}'}
            </p>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-white/80 text-sm mb-2">Preview</label>
            <div className="bg-gray-800 rounded-2xl p-4 max-w-sm mx-auto">
              <div className="bg-green-600 rounded-2xl rounded-bl-md px-4 py-3 text-white text-sm">
                {getPreviewMessage() || '(No message)'}
              </div>
              <div className="text-white/40 text-xs mt-2 text-right">
                SMS • Just now
              </div>
            </div>
          </div>

          {/* Character Warning */}
          {getCharCount() > 160 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-amber-400 text-sm">
                ⚠️ Your message exceeds 160 characters and will be sent as {getSegments()} segments.
                This may increase costs.
              </p>
            </div>
          )}

          {/* Send Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              onClick={() => {
                setMessage('');
                setSelectedTemplate(4);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleSendSMS}
              disabled={sending || !selectedEvent || !message.trim()}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Sending...
                </>
              ) : (
                <>📱 Send SMS</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <h4 className="text-green-400 font-medium mb-2">📱 SMS Best Practices</h4>
        <ul className="text-white/60 text-sm space-y-1">
          <li>• Keep messages under 160 characters to avoid multiple segments</li>
          <li>• Include event name so recipients know who's messaging</li>
          <li>• Always include opt-out instructions (Reply STOP)</li>
          <li>• Send during appropriate hours (9 AM - 9 PM local time)</li>
          <li>• Only message attendees who have provided phone numbers</li>
        </ul>
      </div>
    </div>
  );
}
