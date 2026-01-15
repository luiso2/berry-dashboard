// Emails List Component

import type { Guest, GuestCategory } from '../../types';
import { StatusBadge, SmallBtn } from '../common';
import { thStyle, tdStyle } from '../common/tableStyles';

interface EmailsListProps {
  guests: Guest[];
  selectedGuests: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  removeGuest: (id: string) => void;
  openModal: (guests: Guest[], category: GuestCategory | null, emailOnly?: boolean) => void;
  formatDate: (date: string) => string;
  formatPhone: (phone: string | undefined | null) => string;
  openSmsToGuest: (guest: Guest) => void;
}

export const EmailsList = ({
  guests,
  selectedGuests,
  toggleSelect,
  selectAll,
  removeGuest,
  openModal,
  formatDate,
  formatPhone,
  openSmsToGuest,
}: EmailsListProps) => (
  <div className="page-content" style={{ padding: '0 32px 32px', animation: 'fadeIn 0.3s ease' }}>
    {/* Desktop Table */}
    <div className="table-wrapper desktop-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
            <th style={{ ...thStyle, width: 50 }}>
              <input
                type="checkbox"
                className="checkbox-custom"
                checked={selectedGuests.size === guests.length && guests.length > 0}
                onChange={selectAll}
              />
            </th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Category</th>
            <th style={{ ...thStyle, width: 120 }}>Phone</th>
            <th style={thStyle}>Sent At</th>
            <th style={{ ...thStyle, width: 100 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest, idx) => (
            <tr
              key={guest.id}
              className="row-hover"
              style={{
                borderBottom: '1px solid #111',
                animation: `fadeIn 0.3s ease ${idx * 0.02}s both`,
              }}
            >
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  className="checkbox-custom"
                  checked={selectedGuests.has(guest.id)}
                  onChange={() => toggleSelect(guest.id)}
                />
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#22c55e15',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: '#22c55e',
                    flexShrink: 0,
                  }}>
                    ✓
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 15 }}>{guest.name}</span>
                </div>
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>{guest.email}</td>
              <td style={tdStyle}>
                <StatusBadge category={guest.category} />
              </td>
              <td style={{ ...tdStyle, fontSize: 13 }}>
                {guest.phone ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#22c55e' }}>{formatPhone(guest.phone)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openSmsToGuest(guest); }}
                      className="btn-hover"
                      style={{ background: '#00C08B', border: 'none', color: '#000', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      title="Send SMS"
                    >
                      📱
                    </button>
                  </span>
                ) : (
                  <span style={{ color: '#666' }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>
                {guest.emailSentAt ? formatDate(guest.emailSentAt) : '—'}
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <SmallBtn onClick={() => openModal([guest], null, true)} label="↻" title="Resend Email" color="#22c55e" />
                  <SmallBtn onClick={() => removeGuest(guest.id)} label="×" title="Remove" danger />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Mobile Cards */}
    <div className="mobile-card" style={{ display: 'none' }}>
      {guests.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 12 }}>
          <input
            type="checkbox"
            className="checkbox-custom"
            checked={selectedGuests.size === guests.length && guests.length > 0}
            onChange={selectAll}
          />
          <span style={{ fontSize: 15, color: '#888' }}>Select all ({guests.length})</span>
        </div>
      )}

      {guests.map((guest, idx) => (
        <div
          key={guest.id}
          style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={selectedGuests.has(guest.id)}
              onChange={() => toggleSelect(guest.id)}
              style={{ marginTop: 4 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: '#22c55e15',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color: '#22c55e',
                  flexShrink: 0,
                }}>
                  ✓
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{guest.name}</div>
                  <div style={{ fontSize: 14, color: '#666' }}>{guest.email}</div>
                </div>
                <StatusBadge category={guest.category} />
              </div>

              {guest.phone && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>📞 Phone:</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#22c55e', fontWeight: 500 }}>{formatPhone(guest.phone)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openSmsToGuest(guest); }}
                      style={{ background: '#00C08B', border: 'none', color: '#000', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >
                      SMS
                    </button>
                  </span>
                </div>
              )}

              {guest.emailSentAt && (
                <div style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
                  Sent: {formatDate(guest.emailSentAt)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <SmallBtn onClick={() => openModal([guest], null, true)} label="↻ Resend" title="Resend Email" color="#22c55e" />
                <SmallBtn onClick={() => removeGuest(guest.id)} label="Remove" title="Remove" danger />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Empty State */}
    {guests.length === 0 && (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: 48, marginBottom: 16 }}>✉</div>
        <div style={{ color: '#666', fontSize: 16 }}>No emails sent yet</div>
        <div style={{ color: '#444', fontSize: 14, marginTop: 8 }}>Send invitations from the Guests page</div>
      </div>
    )}
  </div>
);
