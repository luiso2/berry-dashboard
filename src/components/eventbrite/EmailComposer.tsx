import { useState } from 'react';
import type { EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface EmailComposerProps {
  events: EventbriteEventMetrics[];
}

type RecipientType = 'all_buyers' | 'all_attendees' | 'checked_in' | 'not_checked_in';

const RECIPIENT_OPTIONS = [
  { value: 'all_buyers', label: 'All Buyers', description: 'Everyone who purchased tickets' },
  { value: 'all_attendees', label: 'All Attendees', description: 'All registered attendees' },
  { value: 'checked_in', label: 'Checked In Only', description: 'Only attendees who have checked in' },
  { value: 'not_checked_in', label: 'Not Checked In', description: 'Attendees who haven\'t checked in yet' },
];

const EMAIL_TEMPLATES = [
  {
    name: 'Event Reminder',
    subject: 'Reminder: {{event_name}} is coming up!',
    content: `Hi {{name}},

Just a friendly reminder that {{event_name}} is coming up soon!

Event Details:
- Date: {{event_date}}
- Location: {{venue}}

We're excited to see you there!

Best regards,
The Team`,
  },
  {
    name: 'Thank You',
    subject: 'Thank you for attending {{event_name}}!',
    content: `Hi {{name}},

Thank you for attending {{event_name}}! We hope you had an amazing time.

We'd love to hear your feedback. Feel free to reply to this email with any thoughts or suggestions.

Stay tuned for upcoming events!

Best regards,
The Team`,
  },
  {
    name: 'Last Chance',
    subject: 'Last chance to join {{event_name}}!',
    content: `Hi {{name}},

Don't miss out! {{event_name}} is almost here and tickets are selling fast.

Secure your spot now before it's too late!

Best regards,
The Team`,
  },
  {
    name: 'Custom',
    subject: '',
    content: '',
  },
];

export function EmailComposer({ events }: EmailComposerProps) {
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [recipientType, setRecipientType] = useState<RecipientType>('all_buyers');
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('berry_token')}`,
  };

  const handleTemplateSelect = (index: number) => {
    setSelectedTemplate(index);
    const template = EMAIL_TEMPLATES[index];
    setSubject(template.subject);
    setContent(template.content);
  };

  const handleSendEmail = async () => {
    if (!selectedEvent) {
      alert('Please select an event');
      return;
    }
    if (!subject.trim() || !content.trim()) {
      alert('Please enter subject and content');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      // Determine which endpoint to use based on recipient type
      const endpoint = recipientType === 'all_buyers'
        ? `${API_URL}/integrations/eventbrite/email/send`
        : `${API_URL}/integrations/eventbrite/email/attendees`;

      const payload: Record<string, unknown> = {
        event_id: selectedEvent,
        subject,
        content,
      };

      // Add filter for attendee endpoints
      if (recipientType !== 'all_buyers') {
        if (recipientType === 'checked_in') {
          payload.filter = { checked_in: true };
        } else if (recipientType === 'not_checked_in') {
          payload.filter = { checked_in: false };
        }
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
          message: 'Emails sent successfully!',
          count: data.sent || data.recipients?.length || 0,
        });
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to send emails',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Failed to send emails',
      });
    } finally {
      setSending(false);
    }
  };

  const getSelectedEventName = () => {
    const event = events.find(e => e.id === selectedEvent);
    return event?.name || 'Your Event';
  };

  const getPreviewContent = () => {
    const eventName = getSelectedEventName();
    const event = events.find(e => e.id === selectedEvent);

    return content
      .replace(/\{\{event_name\}\}/g, eventName)
      .replace(/\{\{name\}\}/g, 'John Doe')
      .replace(/\{\{event_date\}\}/g, event?.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBD')
      .replace(/\{\{venue\}\}/g, event?.venue || 'TBD');
  };

  const getPreviewSubject = () => {
    const eventName = getSelectedEventName();
    return subject.replace(/\{\{event_name\}\}/g, eventName);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Email Composer</h2>
        <p className="text-white/60 text-sm">Send emails to buyers and attendees via Resend</p>
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
                {result.count} email{result.count !== 1 ? 's' : ''} sent
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
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
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
                      ? 'bg-amber-500/20 border border-amber-500/30'
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
            <label className="block text-white/80 text-sm mb-3">Email Template</label>
            <div className="space-y-2">
              {EMAIL_TEMPLATES.map((template, index) => (
                <button
                  key={template.name}
                  onClick={() => handleTemplateSelect(index)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    selectedTemplate === index
                      ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
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
          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !previewMode
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => setPreviewMode(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                previewMode
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              👁️ Preview
            </button>
          </div>

          {!previewMode ? (
            <>
              {/* Subject */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Subject Line *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
                <p className="text-white/40 text-xs mt-1">
                  Available variables: {'{{event_name}}'}, {'{{name}}'}
                </p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Email Content *</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your email content..."
                  rows={16}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none resize-none font-mono text-sm"
                />
                <p className="text-white/40 text-xs mt-1">
                  Available variables: {'{{event_name}}'}, {'{{name}}'}, {'{{event_date}}'}, {'{{venue}}'}
                </p>
              </div>
            </>
          ) : (
            /* Preview Mode */
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 border-b">
                <p className="text-gray-500 text-xs">To: recipient@email.com</p>
                <p className="text-gray-900 font-medium">{getPreviewSubject() || '(No subject)'}</p>
              </div>
              <div className="p-6 min-h-[400px]">
                <pre className="text-gray-800 whitespace-pre-wrap font-sans text-sm">
                  {getPreviewContent() || '(No content)'}
                </pre>
              </div>
            </div>
          )}

          {/* Send Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              onClick={() => {
                setSubject('');
                setContent('');
                setSelectedTemplate(3);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleSendEmail}
              disabled={sending || !selectedEvent || !subject.trim() || !content.trim()}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Sending...
                </>
              ) : (
                <>📧 Send Email</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <h4 className="text-blue-400 font-medium mb-2">💡 Tips for effective emails</h4>
        <ul className="text-white/60 text-sm space-y-1">
          <li>• Keep subject lines short and engaging (under 50 characters)</li>
          <li>• Personalize with {'{{name}}'} to increase engagement</li>
          <li>• Include a clear call-to-action</li>
          <li>• Test with a small group first before sending to everyone</li>
        </ul>
      </div>
    </div>
  );
}
