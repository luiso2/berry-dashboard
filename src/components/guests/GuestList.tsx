// Guest List Component

import type { Guest, GuestCategory } from '../../types';
import { StatusBadge, SmallBtn } from '../common';
import { thStyle, tdStyle } from '../common/tableStyles';

interface GuestListProps {
  guests: Guest[];
  selectedGuests: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  openModal: (guests: Guest[], category: GuestCategory | null, emailOnly?: boolean) => void;
  removeGuest: (id: string) => void;
  showActions: boolean;
  setShowForm: (show: boolean) => void;
  openReminderModal: (guests: Guest[]) => void;
  formatPhone: (phone: string | undefined | null) => string;
  openSmsToGuest: (guest: Guest) => void;
}

export const GuestList = ({
  guests,
  selectedGuests,
  toggleSelect,
  selectAll,
  openModal,
  removeGuest,
  showActions,
  setShowForm,
  openReminderModal,
  formatPhone,
  openSmsToGuest,
}: GuestListProps) => (
  <div className="page-content" style={{ padding: '0 32px 32px', animation: 'fadeIn 0.3s ease' }}>
    {/* Desktop Table */}
    <div className="table-wrapper desktop-table">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
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
            <th style={{ ...thStyle }} className="hide-tablet">Instagram</th>
            <th style={{ ...thStyle, width: 120 }}>Phone</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, width: 180 }}>Actions</th>
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
                    background: '#1a1a1a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#666',
                    flexShrink: 0,
                  }}>
                    {guest.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{guest.name}</div>
                    {guest.emailSent && (
                      <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Email sent</span>
                    )}
                  </div>
                </div>
              </td>
              <td style={{ ...tdStyle, color: '#888', fontSize: 14 }}>{guest.email}</td>
              <td style={tdStyle} className="hide-tablet">
                {guest.instagram ? (
                  <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', fontSize: 14, textDecoration: 'none' }}>@{guest.instagram.replace('@', '')}</a>
                ) : (
                  <span style={{ color: '#333' }}>—</span>
                )}
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
              <td style={tdStyle}>
                <StatusBadge category={guest.category} />
              </td>
              <td style={tdStyle}>
                <div className="action-buttons" style={{ display: 'flex', gap: 4 }}>
                  {showActions && (
                    <>
                      <SmallBtn onClick={() => openModal([guest], null, true)} label="✉" title="Send Email" color="#22c55e" />
                      {guest.phone && <SmallBtn onClick={() => openSmsToGuest(guest)} label="📱" title="Send SMS" color="#00C08B" />}
                      <SmallBtn onClick={() => openReminderModal([guest])} label="🔔" title="Send Reminder" color="#f59e0b" />
                      <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />
                      <SmallBtn onClick={() => openModal([guest], 'B')} label="Pri" title="Move to Priority" color="#60a5fa" />
                      <SmallBtn onClick={() => openModal([guest], 'C')} label="Std" title="Move to Standard" />
                    </>
                  )}
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
                  background: '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#666',
                  flexShrink: 0,
                }}>
                  {guest.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{guest.name}</div>
                  <div style={{ fontSize: 14, color: '#666' }}>{guest.email}</div>
                </div>
                <StatusBadge category={guest.category} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: '#666', marginBottom: 8, flexWrap: 'wrap' }}>
                {guest.phone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#22c55e' }}>📱 {formatPhone(guest.phone)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openSmsToGuest(guest); }}
                      style={{ background: '#00C08B', border: 'none', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >
                      SMS
                    </button>
                  </span>
                )}
                {guest.instagram && <a href={`https://instagram.com/${guest.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#d4af37', textDecoration: 'none' }}>📸 @{guest.instagram.replace('@', '')}</a>}
                <span>👥 {guest.partySize}</span>
              </div>


              <div className="action-buttons" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showActions && (
                  <>
                    <SmallBtn onClick={() => openModal([guest], null, true)} label="✉ Email" title="Send Email" color="#22c55e" />
                    {guest.phone && <SmallBtn onClick={() => openSmsToGuest(guest)} label="📱 SMS" title="Send SMS" color="#00C08B" />}
                    <SmallBtn onClick={() => openReminderModal([guest])} label="🔔 Reminder" title="Send Reminder" color="#f59e0b" />
                    <SmallBtn onClick={() => openModal([guest], 'A')} label="VIP" title="Move to VIP" color="#a78bfa" />
                    <SmallBtn onClick={() => openModal([guest], 'B')} label="Priority" title="Move to Priority" color="#60a5fa" />
                    <SmallBtn onClick={() => openModal([guest], 'C')} label="Standard" title="Move to Standard" />
                  </>
                )}
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
        <div style={{ color: '#333', fontSize: 48, marginBottom: 16 }}>◈</div>
        <div style={{ color: '#666', fontSize: 16, marginBottom: 16 }}>No guests found</div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: '#111',
            color: '#888',
            border: '1px solid #222',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          + Add your first guest
        </button>
      </div>
    )}
  </div>
);
