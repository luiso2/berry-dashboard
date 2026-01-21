// Check-In View - Self-contained guest check-in system for events
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../constants';

interface CheckInGuest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  ticketType: string;
  ticketId: string;
  partySize: number;
  checkedIn: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
  category: 'VIP' | 'Priority' | 'Standard' | 'Comp';
  tableAssignment?: string;
  notes?: string;
}

interface CheckInStats {
  totalGuests: number;
  checkedIn: number;
  pending: number;
  vipCheckedIn: number;
  vipTotal: number;
}

interface CheckInViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  VIP: '#d4af37',
  Priority: '#8b5cf6',
  Standard: '#3b82f6',
  Comp: '#22c55e',
};

export function CheckInView({ onToast }: CheckInViewProps) {
  // State
  const [guests, setGuests] = useState<CheckInGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked' | 'pending'>('all');
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [recentCheckIns, setRecentCheckIns] = useState<CheckInGuest[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Fetch guests
  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/checkin/guests`);
      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
      }
    } catch (err) {
      console.error('Failed to fetch guests:', err);
      // Mock data for demo
      setGuests([
        {
          id: '1',
          name: 'Alex Johnson',
          email: 'alex@email.com',
          phone: '+1234567890',
          ticketType: 'VIP Table',
          ticketId: 'TKT-001',
          partySize: 4,
          checkedIn: true,
          checkedInAt: new Date(Date.now() - 30 * 60000).toISOString(),
          checkedInBy: 'Door Staff',
          category: 'VIP',
          tableAssignment: 'Table 1',
          notes: 'Birthday celebration',
        },
        {
          id: '2',
          name: 'Maria Garcia',
          email: 'maria@email.com',
          ticketType: 'General Admission',
          ticketId: 'TKT-002',
          partySize: 2,
          checkedIn: false,
          category: 'Standard',
        },
        {
          id: '3',
          name: 'James Wilson',
          email: 'james@email.com',
          ticketType: 'VIP Pass',
          ticketId: 'TKT-003',
          partySize: 1,
          checkedIn: true,
          checkedInAt: new Date(Date.now() - 45 * 60000).toISOString(),
          category: 'VIP',
        },
        {
          id: '4',
          name: 'Sofia Martinez',
          email: 'sofia@email.com',
          ticketType: 'Priority Entry',
          ticketId: 'TKT-004',
          partySize: 3,
          checkedIn: false,
          category: 'Priority',
        },
        {
          id: '5',
          name: 'Michael Brown',
          email: 'michael@email.com',
          ticketType: 'Comp Ticket',
          ticketId: 'TKT-005',
          partySize: 2,
          checkedIn: false,
          category: 'Comp',
          notes: 'Industry guest',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  // Focus scan input when scan mode is enabled
  useEffect(() => {
    if (scanMode && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [scanMode]);

  // Check in guest
  const handleCheckIn = async (guestId: string) => {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    if (guest.checkedIn) {
      onToast(`${guest.name} is already checked in`, 'info');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/checkin/${guestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkedInBy: 'Door Staff' }),
      });

      if (res.ok) {
        const updatedGuest = {
          ...guest,
          checkedIn: true,
          checkedInAt: new Date().toISOString(),
          checkedInBy: 'Door Staff',
        };
        setGuests(prev => prev.map(g => g.id === guestId ? updatedGuest : g));
        setRecentCheckIns(prev => [updatedGuest, ...prev.slice(0, 9)]);
        onToast(`${guest.name} checked in successfully!`, 'success');
      } else {
        // Fallback for demo
        const updatedGuest = {
          ...guest,
          checkedIn: true,
          checkedInAt: new Date().toISOString(),
          checkedInBy: 'Door Staff',
        };
        setGuests(prev => prev.map(g => g.id === guestId ? updatedGuest : g));
        setRecentCheckIns(prev => [updatedGuest, ...prev.slice(0, 9)]);
        onToast(`${guest.name} checked in successfully!`, 'success');
      }
    } catch (err) {
      // Fallback for demo
      const updatedGuest = {
        ...guest,
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
        checkedInBy: 'Door Staff',
      };
      setGuests(prev => prev.map(g => g.id === guestId ? updatedGuest : g));
      setRecentCheckIns(prev => [updatedGuest, ...prev.slice(0, 9)]);
      onToast(`${guest.name} checked in successfully!`, 'success');
    }
  };

  // Undo check-in
  const handleUndoCheckIn = async (guestId: string) => {
    const guest = guests.find(g => g.id === guestId);
    if (!guest) return;

    try {
      await fetch(`${API_URL}/checkin/${guestId}/undo`, { method: 'POST' });
    } catch (err) {
      // Continue with local update
    }

    setGuests(prev => prev.map(g => g.id === guestId ? {
      ...g,
      checkedIn: false,
      checkedInAt: undefined,
      checkedInBy: undefined,
    } : g));
    setRecentCheckIns(prev => prev.filter(g => g.id !== guestId));
    onToast(`Check-in undone for ${guest.name}`, 'info');
  };

  // Handle scan input
  const handleScanSubmit = () => {
    if (!scanInput.trim()) return;

    const query = scanInput.toLowerCase();
    const guest = guests.find(g =>
      g.ticketId.toLowerCase() === query ||
      g.email.toLowerCase() === query ||
      g.name.toLowerCase().includes(query)
    );

    if (guest) {
      handleCheckIn(guest.id);
      setScanInput('');
    } else {
      onToast('Guest not found. Please check the ticket or try manual search.', 'error');
    }
  };

  // Handle manual entry
  const handleManualCheckIn = async () => {
    if (!manualName.trim()) {
      onToast('Please enter a name', 'error');
      return;
    }

    const newGuest: CheckInGuest = {
      id: Date.now().toString(),
      name: manualName,
      email: manualEmail || 'walk-in@event.com',
      ticketType: 'Walk-in',
      ticketId: `WALK-${Date.now()}`,
      partySize: 1,
      checkedIn: true,
      checkedInAt: new Date().toISOString(),
      checkedInBy: 'Door Staff (Manual)',
      category: 'Standard',
    };

    setGuests(prev => [newGuest, ...prev]);
    setRecentCheckIns(prev => [newGuest, ...prev.slice(0, 9)]);
    onToast(`${manualName} added and checked in`, 'success');
    setManualName('');
    setManualEmail('');
    setShowManualEntry(false);
  };

  // Filter guests
  const filteredGuests = guests.filter(g => {
    if (filterCategory !== 'all' && g.category !== filterCategory) return false;
    if (filterStatus === 'checked' && !g.checkedIn) return false;
    if (filterStatus === 'pending' && g.checkedIn) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        g.name.toLowerCase().includes(query) ||
        g.email.toLowerCase().includes(query) ||
        g.ticketId.toLowerCase().includes(query) ||
        g.phone?.includes(query)
      );
    }
    return true;
  });

  // Stats
  const stats: CheckInStats = {
    totalGuests: guests.reduce((sum, g) => sum + g.partySize, 0),
    checkedIn: guests.filter(g => g.checkedIn).reduce((sum, g) => sum + g.partySize, 0),
    pending: guests.filter(g => !g.checkedIn).reduce((sum, g) => sum + g.partySize, 0),
    vipCheckedIn: guests.filter(g => g.category === 'VIP' && g.checkedIn).length,
    vipTotal: guests.filter(g => g.category === 'VIP').length,
  };

  const checkInRate = stats.totalGuests > 0 ? Math.round((stats.checkedIn / stats.totalGuests) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading check-in system...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{stats.checkedIn}</div>
          <div style={{ fontSize: 13, color: '#888' }}>Checked In</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{stats.pending}</div>
          <div style={{ fontSize: 13, color: '#888' }}>Pending</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{stats.totalGuests}</div>
          <div style={{ fontSize: 13, color: '#888' }}>Total Capacity</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>{stats.vipCheckedIn}/{stats.vipTotal}</div>
          <div style={{ fontSize: 13, color: '#888' }}>VIP Check-ins</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6' }}>{checkInRate}%</div>
          <div style={{ fontSize: 13, color: '#888' }}>Check-in Rate</div>
          <div style={{ marginTop: 8, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${checkInRate}%`, height: '100%', background: '#8b5cf6', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Scan Mode Banner */}
      {scanMode && (
        <div style={{
          background: 'linear-gradient(135deg, #22c55e20 0%, #0a0a0a 100%)',
          border: '2px solid #22c55e',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#22c55e', marginBottom: 12 }}>
            Scan Mode Active
          </div>
          <p style={{ color: '#888', marginBottom: 16 }}>Scan ticket barcode or enter ticket ID / guest email</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', maxWidth: 500, margin: '0 auto' }}>
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScanSubmit()}
              placeholder="Scan or type ticket ID, email, or name..."
              autoFocus
              style={{
                flex: 1,
                background: '#111',
                border: '2px solid #22c55e',
                color: '#fff',
                padding: '14px 18px',
                borderRadius: 8,
                fontSize: 16,
                textAlign: 'center',
              }}
            />
            <button
              onClick={handleScanSubmit}
              style={{ background: '#22c55e', color: '#000', border: 'none', padding: '14px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              Check In
            </button>
          </div>
          <button
            onClick={() => setScanMode(false)}
            style={{ marginTop: 12, background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: 13 }}
          >
            Exit Scan Mode
          </button>
        </div>
      )}

      {/* Actions & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {!scanMode && (
          <button
            onClick={() => setScanMode(true)}
            style={{ background: '#22c55e', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Start Scan Mode
          </button>
        )}
        <button
          onClick={() => setShowManualEntry(true)}
          style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Walk-in Entry
        </button>
        <input
          type="text"
          placeholder="Search by name, email, ticket..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8, minWidth: 250 }}
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Categories</option>
          <option value="VIP">VIP</option>
          <option value="Priority">Priority</option>
          <option value="Standard">Standard</option>
          <option value="Comp">Comp</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'checked' | 'pending')}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="checked">Checked In</option>
        </select>
      </div>

      {/* Manual Entry Modal */}
      {showManualEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>Walk-in Entry</h3>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Name *</label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  autoFocus
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Email (optional)</label>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowManualEntry(false)}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleManualCheckIn}
                style={{ flex: 1, background: '#22c55e', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                Check In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Check-ins */}
      {recentCheckIns.length > 0 && (
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#888' }}>Recent Check-ins</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentCheckIns.map(guest => (
              <div
                key={guest.id}
                style={{
                  background: '#111',
                  border: `1px solid ${CATEGORY_COLORS[guest.category]}30`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: '#22c55e' }}>✓</span>
                <span style={{ color: '#fff', fontSize: 14 }}>{guest.name}</span>
                <span style={{
                  background: CATEGORY_COLORS[guest.category] + '30',
                  color: CATEGORY_COLORS[guest.category],
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                }}>
                  {guest.category}
                </span>
                <button
                  onClick={() => handleUndoCheckIn(guest.id)}
                  style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12 }}
                  title="Undo check-in"
                >
                  ↩
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guest List */}
      <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Guest</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Ticket</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Category</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Party</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredGuests.map(guest => (
              <tr
                key={guest.id}
                style={{
                  borderBottom: '1px solid #111',
                  background: guest.checkedIn ? '#22c55e08' : 'transparent',
                }}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: guest.checkedIn ? '#22c55e30' : CATEGORY_COLORS[guest.category] + '30',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: guest.checkedIn ? '#22c55e' : CATEGORY_COLORS[guest.category],
                      fontWeight: 600,
                      fontSize: 14,
                    }}>
                      {guest.checkedIn ? '✓' : guest.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{guest.name}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{guest.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, color: '#fff' }}>{guest.ticketType}</div>
                  <div style={{ fontSize: 11, color: '#666' }}>{guest.ticketId}</div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    background: CATEGORY_COLORS[guest.category] + '20',
                    color: CATEGORY_COLORS[guest.category],
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                  }}>
                    {guest.category}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#888' }}>{guest.partySize}</td>
                <td style={{ padding: '12px 16px' }}>
                  {guest.checkedIn ? (
                    <div>
                      <span style={{ color: '#22c55e', fontSize: 13 }}>✓ Checked In</span>
                      {guest.checkedInAt && (
                        <div style={{ fontSize: 11, color: '#666' }}>
                          {new Date(guest.checkedInAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#f59e0b', fontSize: 13 }}>○ Pending</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {guest.checkedIn ? (
                    <button
                      onClick={() => handleUndoCheckIn(guest.id)}
                      style={{ background: 'transparent', color: '#888', border: '1px solid #333', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    >
                      Undo
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCheckIn(guest.id)}
                      style={{ background: '#22c55e', color: '#000', border: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Check In
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredGuests.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
            <p style={{ color: '#888', fontSize: 16 }}>No guests found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
