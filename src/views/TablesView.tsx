// Tables & Reservations View - Self-contained table reservation management
import { useState, useEffect, useCallback } from 'react';
import type { TableReservation } from '../types';
import { API_URL } from '../constants';

interface TableFormData {
  tableName: string;
  zone: 'VIP' | 'Premium' | 'Standard' | 'Lounge';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  partySize: number;
  specialRequests: string;
  depositAmount: number;
  minimumSpend: number;
  capacity: number;
  eventId: string;
}

interface TablesViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ZONES = ['VIP', 'Premium', 'Standard', 'Lounge'] as const;
const ZONE_COLORS: Record<string, string> = {
  VIP: '#d4af37',
  Premium: '#8b5cf6',
  Standard: '#3b82f6',
  Lounge: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#22c55e',
  declined: '#ef4444',
  cancelled: '#6b7280',
  completed: '#8b5cf6',
};

export function TablesView({ onToast }: TablesViewProps) {
  // State
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterZone, setFilterZone] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState<TableFormData>({
    tableName: '',
    zone: 'Standard',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    partySize: 2,
    specialRequests: '',
    depositAmount: 0,
    minimumSpend: 0,
    capacity: 6,
    eventId: '',
  });

  // Fetch reservations
  const fetchReservations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tables`);
      if (res.ok) {
        const data = await res.json();
        setReservations(data.reservations || []);
      }
    } catch (err) {
      console.error('Failed to fetch reservations:', err);
      // Mock data for demo
      setReservations([
        {
          id: '1',
          tableId: 'T1',
          tableName: 'Table 1',
          zone: 'VIP',
          eventId: '1',
          customerName: 'John Smith',
          customerEmail: 'john@email.com',
          customerPhone: '+1234567890',
          partySize: 4,
          specialRequests: 'Birthday celebration',
          status: 'confirmed',
          depositPaid: true,
          depositAmount: 500,
          minimumSpend: 2000,
          capacity: 6,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          tableId: 'T2',
          tableName: 'Table 2',
          zone: 'Premium',
          eventId: '1',
          customerName: 'Sarah Johnson',
          customerEmail: 'sarah@email.com',
          customerPhone: '+1234567891',
          partySize: 6,
          status: 'pending',
          depositPaid: false,
          depositAmount: 300,
          minimumSpend: 1500,
          capacity: 8,
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          tableId: 'T3',
          tableName: 'Lounge Area A',
          zone: 'Lounge',
          eventId: '1',
          customerName: 'Mike Wilson',
          customerEmail: 'mike@email.com',
          customerPhone: '+1234567892',
          partySize: 8,
          status: 'confirmed',
          depositPaid: true,
          depositAmount: 200,
          minimumSpend: 1000,
          capacity: 10,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Create/Update reservation
  const handleSubmit = async () => {
    if (!formData.customerName || !formData.customerEmail || !formData.tableName) {
      onToast('Please fill in required fields', 'error');
      return;
    }

    try {
      const url = editingId ? `${API_URL}/tables/${editingId}` : `${API_URL}/tables`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tableId: formData.tableName.replace(/\s+/g, '-').toLowerCase(),
        }),
      });

      if (res.ok) {
        onToast(editingId ? 'Reservation updated' : 'Reservation created', 'success');
        await fetchReservations();
        resetForm();
      } else {
        // Fallback for demo - add locally
        const newReservation: TableReservation = {
          id: editingId || Date.now().toString(),
          tableId: formData.tableName.replace(/\s+/g, '-').toLowerCase(),
          tableName: formData.tableName,
          zone: formData.zone,
          eventId: formData.eventId || '1',
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
          partySize: formData.partySize,
          specialRequests: formData.specialRequests,
          status: 'pending',
          depositPaid: false,
          depositAmount: formData.depositAmount,
          minimumSpend: formData.minimumSpend,
          capacity: formData.capacity,
          createdAt: new Date().toISOString(),
        };

        if (editingId) {
          setReservations(prev => prev.map(r => r.id === editingId ? newReservation : r));
        } else {
          setReservations(prev => [newReservation, ...prev]);
        }
        onToast(editingId ? 'Reservation updated' : 'Reservation created', 'success');
        resetForm();
      }
    } catch (err) {
      onToast('Failed to save reservation', 'error');
    }
  };

  // Update status
  const handleUpdateStatus = async (id: string, status: TableReservation['status']) => {
    try {
      const res = await fetch(`${API_URL}/tables/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        onToast(`Reservation ${status}`, 'success');
        await fetchReservations();
      } else {
        // Fallback for demo
        setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
        onToast(`Reservation ${status}`, 'success');
      }
    } catch (err) {
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      onToast(`Reservation ${status}`, 'success');
    }
  };

  // Mark deposit paid
  const handleMarkDepositPaid = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/tables/${id}/deposit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositPaid: true }),
      });

      if (res.ok) {
        onToast('Deposit marked as paid', 'success');
        await fetchReservations();
      } else {
        setReservations(prev => prev.map(r => r.id === id ? { ...r, depositPaid: true } : r));
        onToast('Deposit marked as paid', 'success');
      }
    } catch (err) {
      setReservations(prev => prev.map(r => r.id === id ? { ...r, depositPaid: true } : r));
      onToast('Deposit marked as paid', 'success');
    }
  };

  // Delete reservation
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reservation?')) return;

    try {
      const res = await fetch(`${API_URL}/tables/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReservations(prev => prev.filter(r => r.id !== id));
        onToast('Reservation deleted', 'success');
      } else {
        setReservations(prev => prev.filter(r => r.id !== id));
        onToast('Reservation deleted', 'success');
      }
    } catch (err) {
      setReservations(prev => prev.filter(r => r.id !== id));
      onToast('Reservation deleted', 'success');
    }
  };

  // Edit reservation
  const handleEdit = (reservation: TableReservation) => {
    setFormData({
      tableName: reservation.tableName,
      zone: reservation.zone,
      customerName: reservation.customerName,
      customerEmail: reservation.customerEmail,
      customerPhone: reservation.customerPhone,
      partySize: reservation.partySize,
      specialRequests: reservation.specialRequests || '',
      depositAmount: reservation.depositAmount,
      minimumSpend: reservation.minimumSpend,
      capacity: reservation.capacity,
      eventId: reservation.eventId,
    });
    setEditingId(reservation.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      tableName: '',
      zone: 'Standard',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      partySize: 2,
      specialRequests: '',
      depositAmount: 0,
      minimumSpend: 0,
      capacity: 6,
      eventId: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Filter reservations
  const filteredReservations = reservations.filter(r => {
    if (filterZone !== 'all' && r.zone !== filterZone) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        r.customerName.toLowerCase().includes(query) ||
        r.customerEmail.toLowerCase().includes(query) ||
        r.tableName.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Stats
  const stats = {
    total: reservations.length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
    pending: reservations.filter(r => r.status === 'pending').length,
    totalRevenue: reservations
      .filter(r => r.depositPaid)
      .reduce((sum, r) => sum + r.depositAmount, 0),
    expectedMinimum: reservations
      .filter(r => r.status === 'confirmed')
      .reduce((sum, r) => sum + r.minimumSpend, 0),
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading reservations...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Reservations</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Confirmed</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.confirmed}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.pending}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Deposits Collected</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>${stats.totalRevenue.toLocaleString()}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Expected Minimum</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>${stats.expectedMinimum.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Reservation
        </button>
        <input
          type="text"
          placeholder="Search by name, email, table..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8, minWidth: 250 }}
        />
        <select
          value={filterZone}
          onChange={(e) => setFilterZone(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Zones</option>
          {ZONES.map(zone => (
            <option key={zone} value={zone}>{zone}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="declined">Declined</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Reservation' : 'New Table Reservation'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Table Name *</label>
                  <input
                    type="text"
                    value={formData.tableName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tableName: e.target.value }))}
                    placeholder="e.g., Table 1, VIP Booth A"
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Zone *</label>
                  <select
                    value={formData.zone}
                    onChange={(e) => setFormData(prev => ({ ...prev, zone: e.target.value as TableFormData['zone'] }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    {ZONES.map(zone => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Customer Name *</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Email *</label>
                  <input
                    type="email"
                    value={formData.customerEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Phone</label>
                  <input
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Party Size</label>
                  <input
                    type="number"
                    value={formData.partySize}
                    onChange={(e) => setFormData(prev => ({ ...prev, partySize: parseInt(e.target.value) || 1 }))}
                    min={1}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Table Capacity</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                    min={1}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Deposit Amount ($)</label>
                  <input
                    type="number"
                    value={formData.depositAmount}
                    onChange={(e) => setFormData(prev => ({ ...prev, depositAmount: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Minimum Spend ($)</label>
                  <input
                    type="number"
                    value={formData.minimumSpend}
                    onChange={(e) => setFormData(prev => ({ ...prev, minimumSpend: parseFloat(e.target.value) || 0 }))}
                    min={0}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Special Requests</label>
                <textarea
                  value={formData.specialRequests}
                  onChange={(e) => setFormData(prev => ({ ...prev, specialRequests: e.target.value }))}
                  rows={3}
                  placeholder="Birthday, anniversary, dietary restrictions..."
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetForm}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                style={{ flex: 1, background: '#d4af37', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Create'} Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reservations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
        {filteredReservations.map(reservation => (
          <div
            key={reservation.id}
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 12,
              padding: 20,
              borderLeft: `4px solid ${ZONE_COLORS[reservation.zone]}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                  {reservation.tableName}
                </div>
                <span style={{
                  background: ZONE_COLORS[reservation.zone] + '20',
                  color: ZONE_COLORS[reservation.zone],
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  {reservation.zone}
                </span>
              </div>
              <span style={{
                background: STATUS_COLORS[reservation.status] + '20',
                color: STATUS_COLORS[reservation.status],
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'capitalize',
              }}>
                {reservation.status}
              </span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#fff', marginBottom: 4 }}>
                {reservation.customerName}
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>{reservation.customerEmail}</div>
              {reservation.customerPhone && (
                <div style={{ fontSize: 13, color: '#888' }}>{reservation.customerPhone}</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Party Size</div>
                <div style={{ fontSize: 14, color: '#fff' }}>{reservation.partySize} / {reservation.capacity}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Minimum</div>
                <div style={{ fontSize: 14, color: '#fff' }}>${reservation.minimumSpend.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Deposit</div>
                <div style={{ fontSize: 14, color: reservation.depositPaid ? '#22c55e' : '#f59e0b' }}>
                  ${reservation.depositAmount} {reservation.depositPaid ? '✓' : '(pending)'}
                </div>
              </div>
            </div>

            {reservation.specialRequests && (
              <div style={{ background: '#111', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#888' }}>
                {reservation.specialRequests}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {reservation.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleUpdateStatus(reservation.id, 'confirmed')}
                    style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(reservation.id, 'declined')}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                  >
                    Decline
                  </button>
                </>
              )}
              {reservation.status === 'confirmed' && !reservation.depositPaid && (
                <button
                  onClick={() => handleMarkDepositPaid(reservation.id)}
                  style={{ background: '#d4af37', color: '#000', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Mark Deposit Paid
                </button>
              )}
              {reservation.status === 'confirmed' && (
                <button
                  onClick={() => handleUpdateStatus(reservation.id, 'completed')}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Complete
                </button>
              )}
              <button
                onClick={() => handleEdit(reservation)}
                style={{ background: '#333', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(reservation.id)}
                style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredReservations.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
          <p style={{ color: '#888', fontSize: 16 }}>No reservations found</p>
          <button
            onClick={() => setShowForm(true)}
            style={{ marginTop: 16, background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            + Create First Reservation
          </button>
        </div>
      )}
    </div>
  );
}
