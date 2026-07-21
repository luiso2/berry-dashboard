// Guest Approvals View - Gender-segmented approval workflow
// Segments guest list applicants per event into folders (Inbox, VIP Comp, VIP Paid / Pending,
// GA Future Events / GA Tickets, Removed) and triggers approval / purchase-link emails via berry-api.
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { UserCheck, Download, RefreshCw, Instagram, Linkedin, Link as LinkIcon } from 'lucide-react';
import { API_URL } from '../constants';

interface GuestApprovalsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  token?: string;
  /** Client rule: men and women are managed on separate pages. Each page fixes its gender. */
  fixedGender: 'male' | 'female';
}

interface BerryEvent {
  id: string;
  title: string;
  date?: string;
}

interface ApprovalGuest {
  id: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  linkedin: string | null;
  city: string | null;
  invitedBy: string | null;
  gender: string | null;
  segment: string | null;
  status: string;
  emailSent: boolean;
  createdAt: string;
}

type Gender = 'male' | 'female';

const DEFAULT_EVENT_ID = 'evt_68d357bd-5efd-48d3-b146-8aa51d7c3481';

// Folder chips per gender tab ('none' = segment IS NULL = Inbox)
const FOLDERS: Record<Gender, { key: string; label: string }[]> = {
  male: [
    { key: 'none', label: 'Inbox' },
    { key: 'vip_comp', label: 'VIP Comp' },
    { key: 'vip_paid', label: 'VIP Paid' },
    { key: 'ga_future', label: 'GA Future Events' },
    { key: 'removed', label: 'Removed' },
  ],
  female: [
    { key: 'none', label: 'Inbox' },
    { key: 'vip_comp', label: 'VIP Comp' },
    { key: 'pending', label: 'Pending' },
    { key: 'ga_ticket', label: 'GA Tickets' },
    { key: 'removed', label: 'Removed' },
  ],
};

// Row action buttons per gender tab
const ACTIONS: Record<Gender, { segment: string; label: string; color: string }[]> = {
  male: [
    { segment: 'vip_comp', label: 'VIP COMP', color: '#22c55e' },
    { segment: 'vip_paid', label: 'VIP PAID', color: '#d4af37' },
    { segment: 'ga_future', label: 'GA FUTURE', color: '#3b82f6' },
    { segment: 'removed', label: 'REMOVE', color: '#ef4444' },
  ],
  female: [
    { segment: 'vip_comp', label: 'VIP COMP', color: '#22c55e' },
    { segment: 'pending', label: 'PENDING', color: '#f59e0b' },
    { segment: 'ga_ticket', label: 'GA TICKET', color: '#a78bfa' },
    { segment: 'removed', label: 'REMOVE', color: '#ef4444' },
  ],
};

const SEGMENT_LABELS: Record<string, string> = {
  vip_comp: 'VIP Comp',
  vip_paid: 'VIP Paid',
  ga_future: 'GA Future',
  ga_ticket: 'GA Ticket',
  pending: 'Pending',
  removed: 'Removed',
};

const SEGMENT_COLORS: Record<string, string> = {
  vip_comp: '#22c55e',
  vip_paid: '#d4af37',
  ga_future: '#3b82f6',
  ga_ticket: '#a78bfa',
  pending: '#f59e0b',
  removed: '#ef4444',
};

// Segments that send a purchase-link email and therefore require a ticket link
const TICKET_SEGMENTS = ['vip_paid', 'ga_ticket'];

const mapGuest = (g: Record<string, unknown>): ApprovalGuest => ({
  id: String(g.id),
  name: (g.name as string) || '',
  email: (g.email as string) || '',
  phone: (g.phone as string) || '',
  instagram: (g.instagram as string) || '',
  linkedin: (g.linkedin as string) || null,
  city: (g.city as string) || null,
  invitedBy: (g.invitedBy as string) || null,
  gender: (g.gender as string) || null,
  segment: (g.segment as string) || null,
  status: (g.status as string) || 'pending',
  emailSent: Boolean(g.emailSent),
  createdAt: (g.createdAt as string) || '',
});

export function GuestApprovalsView({ onToast, token, fixedGender }: GuestApprovalsViewProps) {
  const [events, setEvents] = useState<BerryEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const gender: Gender = fixedGender;
  const [folder, setFolder] = useState('none');
  const [guests, setGuests] = useState<ApprovalGuest[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [ticketLink, setTicketLink] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

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

  // Fetch upcoming events for the selector (proxied through the dashboard server)
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`${API_URL}/berry-events`);
        const data = await res.json();
        const list: BerryEvent[] = (data.events || []).map((e: Record<string, unknown>) => ({
          id: String(e.id),
          title: (e.title as string) || 'Untitled event',
          date: e.date as string | undefined,
        }));
        setEvents(list);
        setEventId((prev) => {
          if (prev) return prev;
          if (list.some((e) => e.id === DEFAULT_EVENT_ID)) return DEFAULT_EVENT_ID;
          return list[0]?.id || '';
        });
      } catch (err) {
        console.error('Failed to fetch berry events:', err);
        onToast('Error loading events', 'error');
      }
    };
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticket link is persisted per event + gender tab
  const ticketLinkStorageKey = `berry_ticket_link_${eventId}_${gender}`;

  useEffect(() => {
    if (!eventId) return;
    setTicketLink(localStorage.getItem(ticketLinkStorageKey) || '');
  }, [ticketLinkStorageKey, eventId]);

  const handleTicketLinkChange = (value: string) => {
    setTicketLink(value);
    localStorage.setItem(ticketLinkStorageKey, value);
  };

  // Fetch the active folder rows + live counts for all folders of the active tab
  const refresh = useCallback(async (silent = false) => {
    if (!eventId) return;
    if (!silent) setLoading(true);
    try {
      const base = `${API_URL}/guest-lists?eventId=${encodeURIComponent(eventId)}&gender=${gender}`;
      const [rowsRes, allRes] = await Promise.all([
        fetch(`${base}&segment=${folder}`, { headers: getHeaders() }),
        fetch(base, { headers: getHeaders() }),
      ]);
      const rowsData = await rowsRes.json();
      const allData = await allRes.json();
      setGuests((rowsData.entries || []).map(mapGuest));

      const nextCounts: Record<string, number> = {};
      for (const g of (allData.entries || [])) {
        const key = g.segment || 'none';
        nextCounts[key] = (nextCounts[key] || 0) + 1;
      }
      setCounts(nextCounts);
    } catch (err) {
      console.error('Failed to fetch guest approvals:', err);
      onToast('Error loading guest approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [eventId, gender, folder, getHeaders, onToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Apply a segment via the dashboard server proxy -> berry-api (handles emails + validation)
  const applySegment = async (guest: ApprovalGuest, segment: string) => {
    // Client rule: female REMOVE permanently deletes; male REMOVE only takes them off the list.
    if (segment === 'removed') {
      const confirmMessage = gender === 'female'
        ? `Remove and permanently DELETE ${guest.name}? This cannot be undone. No email is sent.`
        : `Remove ${guest.name} from the list? (No email is sent.)`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }

    const payload: { segment: string; ticketUrl?: string } = { segment };
    if (TICKET_SEGMENTS.includes(segment)) {
      const link = ticketLink.trim();
      if (!link) {
        onToast(`Enter a Ticket link in the toolbar first - ${SEGMENT_LABELS[segment]} sends a purchase-link email`, 'error');
        return;
      }
      payload.ticketUrl = link;
    }

    setActionInProgress(guest.id);
    try {
      const res = await fetch(`${API_URL}/guest-lists/${guest.id}/segment`, {
        method: 'PATCH',
        headers: getHeaders('application/json'),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        onToast(data.message || data.error || `Failed to update ${guest.name}`, 'error');
        return;
      }

      const label = SEGMENT_LABELS[segment] || segment;
      if (data.emailSent) {
        onToast(`${guest.name} moved to ${label} - email sent`, 'success');
      } else if (data.emailError) {
        onToast(`${guest.name} moved to ${label} - email failed: ${data.emailError}`, 'error');
      } else {
        onToast(`${guest.name} moved to ${label}`, 'success');
      }
      await refresh(true);
    } catch (err) {
      console.error('Failed to update segment:', err);
      onToast(`Failed to update ${guest.name}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Export the currently displayed folder + tab rows to XLSX (for Google Sheets / texting services)
  const exportXlsx = () => {
    if (guests.length === 0) {
      onToast('No guests in this folder to export', 'error');
      return;
    }
    const rows = guests.map((g) => ({
      'Name': g.name,
      'Email': g.email,
      'Phone': g.phone || '',
      'Instagram': g.instagram || '',
      'LinkedIn': g.linkedin || '',
      'City': g.city || '',
      'Invited By': g.invitedBy || '',
      'Gender': g.gender || '',
      'Segment': g.segment || 'inbox',
      'Applied At': g.createdAt ? new Date(g.createdAt).toLocaleString() : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Guests');

    const selectedEvent = events.find((e) => e.id === eventId);
    const eventSlug = (selectedEvent?.title || 'event').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'event';
    const folderSlug = folder === 'none' ? 'inbox' : folder;
    XLSX.writeFile(workbook, `${eventSlug}-${gender}-${folderSlug}.xlsx`);
    onToast(`Exported ${rows.length} guests`, 'success');
  };

  const linkedinHref = (linkedin: string) =>
    linkedin.startsWith('http://') || linkedin.startsWith('https://') ? linkedin : `https://${linkedin}`;

  const formatDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  if (loading && guests.length === 0 && !events.length) {
    return (
      <div className="page-content" style={{ padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⟳</div>
          <div style={{ color: '#888' }}>Loading guest approvals...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
      {/* Toolbar: event selector + gender tabs + ticket link + export */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8, fontSize: 14, minWidth: 240 }}
        >
          {events.length === 0 && <option value="">No upcoming events</option>}
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}{event.date ? ` (${event.date})` : ''}
            </option>
          ))}
        </select>

        {/* Fixed gender badge: men and women are managed on separate pages */}
        <div
          style={{
            background: gender === 'male' ? '#3b82f6' : '#ec4899',
            color: '#fff',
            borderRadius: 8,
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {gender === 'male' ? 'MEN' : 'WOMEN'}
        </div>

        {/* Ticket link (required for VIP PAID / GA TICKET actions) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', border: '1px solid #333', borderRadius: 8, padding: '0 12px', flex: 1, minWidth: 260 }}>
          <LinkIcon size={14} color="#666" />
          <input
            type="text"
            placeholder={`Ticket link (required for ${gender === 'male' ? 'VIP PAID' : 'GA TICKET'})`}
            value={ticketLink}
            onChange={(e) => handleTicketLinkChange(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', padding: '10px 0', fontSize: 13, flex: 1 }}
          />
        </div>

        <button
          onClick={() => refresh()}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#888', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={exportXlsx}
          style={{
            background: 'rgba(212,175,55,0.1)',
            border: '1px solid rgba(212,175,55,0.3)',
            color: '#d4af37',
            padding: '10px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Download size={14} /> Export XLSX ({guests.length})
        </button>
      </div>

      {/* Folder chips with live counts */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FOLDERS[gender].map((f) => {
          const active = folder === f.key;
          const chipColor = f.key === 'none' ? '#d4af37' : (SEGMENT_COLORS[f.key] || '#d4af37');
          return (
            <button
              key={f.key}
              onClick={() => setFolder(f.key)}
              style={{
                background: active ? `${chipColor}20` : 'transparent',
                border: `1px solid ${active ? `${chipColor}60` : '#333'}`,
                color: active ? chipColor : '#666',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {f.label} ({counts[f.key] || 0})
            </button>
          );
        })}
      </div>

      {/* Guests table */}
      <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Instagram</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>LinkedIn</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>City</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Invited By</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Email</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Phone</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Applied</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Segment</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Email</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((guest, idx) => (
                <tr key={guest.id} style={{ borderBottom: '1px solid #111', animation: `fadeIn 0.2s ease ${idx * 0.02}s both`, opacity: actionInProgress === guest.id ? 0.5 : 1 }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{guest.name}</td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    {guest.instagram ? (
                      <a
                        href={`https://instagram.com/${guest.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#d4af37', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                      >
                        <Instagram size={13} /> @{guest.instagram.replace('@', '')}
                      </a>
                    ) : (
                      <span style={{ color: '#444', fontSize: 13 }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    {guest.linkedin ? (
                      <a
                        href={linkedinHref(guest.linkedin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                      >
                        <Linkedin size={13} /> Profile
                      </a>
                    ) : (
                      <span style={{ color: '#444', fontSize: 13 }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>{guest.city || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>{guest.invitedBy || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#888', fontSize: 13 }}>{guest.email}</td>
                  <td style={{ padding: '12px 16px', color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>{guest.phone || '-'}</td>
                  <td style={{ padding: '12px 16px', color: '#666', fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(guest.createdAt)}</td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      background: `${guest.segment ? (SEGMENT_COLORS[guest.segment] || '#888') : '#888'}20`,
                      color: guest.segment ? (SEGMENT_COLORS[guest.segment] || '#888') : '#888',
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {guest.segment ? (SEGMENT_LABELS[guest.segment] || guest.segment) : guest.status.charAt(0).toUpperCase() + guest.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    {guest.emailSent ? (
                      <span style={{ color: '#22c55e', fontSize: 13 }}>✓ Sent</span>
                    ) : (
                      <span style={{ color: '#666', fontSize: 13 }}>○ Not sent</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {ACTIONS[gender].map((action) => (
                        <button
                          key={action.segment}
                          onClick={() => applySegment(guest, action.segment)}
                          disabled={actionInProgress === guest.id || guest.segment === action.segment}
                          style={{
                            background: `${action.color}20`,
                            border: `1px solid ${action.color}40`,
                            color: action.color,
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: actionInProgress === guest.id || guest.segment === action.segment ? 'default' : 'pointer',
                            opacity: guest.segment === action.segment ? 0.35 : 1,
                            letterSpacing: '0.3px',
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {guests.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ color: '#333', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <UserCheck size={48} />
            </div>
            <div style={{ color: '#666', fontSize: 15 }}>
              {folder === 'none' ? 'Inbox is empty for this tab' : `No guests in ${FOLDERS[gender].find((f) => f.key === folder)?.label || 'this folder'}`}
            </div>
            <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>
              {gender === 'male' ? 'Male' : 'Female'} applicants for the selected event will appear here
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
