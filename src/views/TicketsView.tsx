// Tickets & Orders View - Self-contained ticket management, orders list, and Eventbrite sync
import { useState, useEffect, useCallback } from 'react';
import type { Ticket, Order, OrderStats } from '../types';
import { API_URL } from '../constants';

interface TicketFormData {
  holderName: string;
  holderEmail: string;
  ticketType: string;
  price: string;
  eventId: string;
}

interface TicketsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function TicketsView({ onToast }: TicketsViewProps) {
  // Self-contained state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats>({
    total_orders: 0,
    total_tickets: 0,
    total_revenue: 0,
    active_orders: 0,
    refunded_orders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncingEventbrite, setSyncingEventbrite] = useState(false);

  // Local UI state
  const [ticketView, setTicketView] = useState<'orders' | 'tickets'>('orders');
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [ticketFormData, setTicketFormData] = useState<TicketFormData>({
    holderName: '',
    holderEmail: '',
    ticketType: 'General',
    price: '0',
    eventId: '',
  });

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/tickets`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    }
  }, []);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        if (data.stats) {
          setOrderStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTickets(), fetchOrders()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTickets, fetchOrders]);

  // Create ticket handler
  const handleCreateTicket = async () => {
    if (!ticketFormData.holderName || !ticketFormData.holderEmail) {
      onToast('Please fill in holder name and email', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketFormData),
      });
      if (res.ok) {
        onToast('Ticket created successfully', 'success');
        await fetchTickets();
        setShowTicketForm(false);
        setShowTicketPreview(false);
        setTicketFormData({
          holderName: '',
          holderEmail: '',
          ticketType: 'General',
          price: '0',
          eventId: '',
        });
      } else {
        onToast('Failed to create ticket', 'error');
      }
    } catch (err) {
      onToast('Failed to create ticket', 'error');
    }
  };

  // Delete ticket handler
  const handleDeleteTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`${API_URL}/tickets/${ticketId}`, { method: 'DELETE' });
      if (res.ok) {
        setTickets(prev => prev.filter(t => t.id !== ticketId));
        onToast('Ticket deleted', 'success');
      }
    } catch (err) {
      onToast('Failed to delete ticket', 'error');
    }
  };

  // Delete all tickets handler
  const handleDeleteAllTickets = async () => {
    if (!confirm('Are you sure you want to delete all tickets?')) return;
    try {
      await Promise.all(tickets.map(t => fetch(`${API_URL}/tickets/${t.id}`, { method: 'DELETE' })));
      setTickets([]);
      onToast('All tickets deleted', 'success');
    } catch (err) {
      onToast('Failed to delete tickets', 'error');
    }
  };

  // Sync from Eventbrite handler
  const handleSyncEventbrite = async () => {
    setSyncingEventbrite(true);
    try {
      const userId = localStorage.getItem('eventbrite_user_id') || 'global';
      const res = await fetch(`${API_URL}/integrations/eventbrite/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-eventbrite-user-id': userId,
        },
      });
      if (res.ok) {
        onToast('Successfully synced from Eventbrite', 'success');
        await Promise.all([fetchTickets(), fetchOrders()]);
      } else {
        const data = await res.json();
        onToast(data.error || 'Failed to sync from Eventbrite', 'error');
      }
    } catch (err) {
      onToast('Failed to sync from Eventbrite', 'error');
    } finally {
      setSyncingEventbrite(false);
    }
  };

  // Download CSV handlers
  const handleDownloadOrdersCSV = () => {
    const headers = ['Order ID', 'Buyer', 'Email', 'Event', 'Tickets', 'Amount', 'Status', 'Date'];
    const rows = orders.map(o => [
      o.id,
      o.buyer_name || '',
      o.buyer_email || '',
      o.event_name || '',
      o.ticket_count,
      o.total_amount,
      o.order_status,
      new Date(o.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Orders CSV downloaded', 'success');
  };

  const handleDownloadTicketsCSV = () => {
    const headers = ['Ticket ID', 'Holder Name', 'Email', 'Type', 'Price', 'Status'];
    const rows = tickets.map(t => [
      t.id,
      t.holderName || '',
      t.holderEmail || '',
      t.ticketType || '',
      t.price || 0,
      t.status,
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Tickets CSV downloaded', 'success');
  };

  const handleShareTicket = (ticketId: string) => {
    const ticketUrl = `https://berry.merktop.com/ticket/${ticketId}`;
    navigator.clipboard.writeText(ticketUrl);
    onToast('Ticket link copied!', 'success');
  };

  if (loading) {
    return (
      <div className="page-content" style={{ padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⟳</div>
          <div style={{ color: '#888' }}>Loading tickets...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
      {/* Stats Grid */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Orders</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{orderStats.total_orders}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Tickets Sold</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{orderStats.total_tickets}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #d4af3740', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 4 }}>Total Revenue</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>${orderStats.total_revenue.toLocaleString()}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #ef444440', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 4 }}>Refunded</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>{orderStats.refunded_orders}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowTicketForm(true)}
          style={{
            background: '#d4af37',
            border: 'none',
            color: '#000',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          + Add Ticket
        </button>
        <button
          onClick={handleSyncEventbrite}
          disabled={syncingEventbrite}
          style={{
            background: syncingEventbrite ? '#333' : '#F6682F',
            border: 'none',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: syncingEventbrite ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: syncingEventbrite ? 0.7 : 1
          }}
        >
          {syncingEventbrite ? '⟳ Syncing...' : '🎪 Sync from Eventbrite'}
        </button>
        <button
          onClick={ticketView === 'orders' ? handleDownloadOrdersCSV : handleDownloadTicketsCSV}
          style={{
            background: '#22c55e',
            border: 'none',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          📥 Download CSV
        </button>
        <div style={{ display: 'flex', background: '#1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setTicketView('orders')}
            style={{
              background: ticketView === 'orders' ? '#333' : 'transparent',
              border: 'none',
              color: ticketView === 'orders' ? '#fff' : '#888',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Orders ({orders.length})
          </button>
          <button
            onClick={() => setTicketView('tickets')}
            style={{
              background: ticketView === 'tickets' ? '#333' : 'transparent',
              border: 'none',
              color: ticketView === 'tickets' ? '#fff' : '#888',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Tickets ({tickets.length})
          </button>
        </div>
      </div>

      {/* Orders List */}
      {ticketView === 'orders' && (
        <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Recent Orders</span>
            <span style={{ fontSize: 14, color: '#666' }}>{orders.length} orders</span>
          </div>
          {orders.map((order, idx) => (
            <div
              key={order.id}
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: order.order_status === 'refunded' ? '#ef444420' : '#22c55e20',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: order.order_status === 'refunded' ? '#ef4444' : '#22c55e',
                }}>
                  {order.order_status === 'refunded' ? '↩' : '🎫'}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{order.buyer_name || order.buyer_email || 'Unknown Buyer'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: '#888' }}>{order.event_name}</span>
                    <span style={{ fontSize: 13, color: '#666' }}>{order.ticket_count} ticket{order.ticket_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#d4af37' }}>${order.total_amount.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{
                  background: order.order_status === 'refunded' ? '#ef444420' : '#22c55e20',
                  color: order.order_status === 'refunded' ? '#ef4444' : '#22c55e',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  textTransform: 'capitalize'
                }}>
                  {order.order_status}
                </span>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>🎪</div>
              <div style={{ color: '#666', fontSize: 15 }}>No orders yet</div>
              <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Connect Eventbrite in Settings → Integrations, then click "Sync from Eventbrite"</div>
            </div>
          )}
        </div>
      )}

      {/* Tickets List */}
      {ticketView === 'tickets' && (
        <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Tickets</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: '#666' }}>{tickets.length} tickets</span>
              {tickets.length > 0 && (
                <button
                  onClick={handleDeleteAllTickets}
                  style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  🗑️ Delete All
                </button>
              )}
            </div>
          </div>
          {tickets.map((ticket, idx) => (
            <div
              key={ticket.id}
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: ticket.status === 'used' ? '#22c55e20' : '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: ticket.status === 'used' ? '#22c55e' : '#666',
                }}>
                  🎫
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{ticket.holderName || 'No Name'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: '#888' }}>{ticket.ticketType}</span>
                    <span style={{ fontSize: 13, color: '#666' }}>{ticket.holderEmail}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  background: ticket.status === 'used' ? '#22c55e20' : ticket.status === 'valid' ? '#fbbf2420' : '#ef444420',
                  color: ticket.status === 'used' ? '#22c55e' : ticket.status === 'valid' ? '#fbbf24' : '#ef4444',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  textTransform: 'capitalize'
                }}>
                  {ticket.status}
                </span>
                <button
                  onClick={() => handleShareTicket(ticket.id)}
                  style={{ background: '#3b82f620', color: '#3b82f6', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
                  title="Share ticket link"
                >
                  🔗
                </button>
                <button
                  onClick={() => handleDeleteTicket(ticket.id)}
                  style={{ background: '#ef444420', color: '#ef4444', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
                  title="Delete ticket"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {tickets.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>🎫</div>
              <div style={{ color: '#666', fontSize: 15 }}>No tickets yet</div>
              <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Click "Add Ticket" to create one manually</div>
            </div>
          )}
        </div>
      )}

      {/* Add Ticket Modal with Preview */}
      {showTicketForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowTicketForm(false); setShowTicketPreview(false); }}
        >
          <div
            style={{ background: '#111', borderRadius: 16, width: '100%', maxWidth: showTicketPreview ? 900 : 450, border: '1px solid #333', display: 'flex', transition: 'max-width 0.3s ease' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Form Section */}
            <div style={{ flex: 1, padding: 32, borderRight: showTicketPreview ? '1px solid #333' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Add New Ticket</h2>
                <button
                  onClick={() => setShowTicketPreview(!showTicketPreview)}
                  style={{
                    padding: '6px 12px',
                    background: showTicketPreview ? '#d4af3720' : '#1a1a1a',
                    border: showTicketPreview ? '1px solid #d4af3740' : '1px solid #333',
                    borderRadius: 6,
                    color: showTicketPreview ? '#d4af37' : '#888',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {showTicketPreview ? '👁 Hide Preview' : '👁 Preview'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Holder Name *</label>
                  <input
                    type="text"
                    value={ticketFormData.holderName}
                    onChange={e => setTicketFormData({ ...ticketFormData, holderName: e.target.value })}
                    placeholder="John Doe"
                    style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Email *</label>
                  <input
                    type="email"
                    value={ticketFormData.holderEmail}
                    onChange={e => setTicketFormData({ ...ticketFormData, holderEmail: e.target.value })}
                    placeholder="john@example.com"
                    style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Ticket Type</label>
                  <select
                    value={ticketFormData.ticketType}
                    onChange={e => setTicketFormData({ ...ticketFormData, ticketType: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  >
                    <option value="General">General</option>
                    <option value="VIP">VIP</option>
                    <option value="Early Bird">Early Bird</option>
                    <option value="Student">Student</option>
                    <option value="Complimentary">Complimentary</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Price ($)</label>
                  <input
                    type="number"
                    value={ticketFormData.price}
                    onChange={e => setTicketFormData({ ...ticketFormData, price: e.target.value })}
                    placeholder="0"
                    style={{ width: '100%', padding: '12px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => { setShowTicketForm(false); setShowTicketPreview(false); }}
                  style={{ flex: 1, padding: '12px 24px', background: '#333', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTicket}
                  style={{ flex: 1, padding: '12px 24px', background: '#d4af37', border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Create Ticket
                </button>
              </div>
            </div>

            {/* Preview Section */}
            {showTicketPreview && (
              <div style={{ flex: 1, padding: 32, background: '#0a0a0a', borderRadius: '0 16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: 320 }}>
                  <div style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Ticket Preview</div>

                  {/* Ticket Card Preview */}
                  <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
                    borderRadius: 16,
                    border: '1px solid #333',
                    overflow: 'hidden',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
                  }}>
                    {/* Ticket Header */}
                    <div style={{
                      padding: '20px 24px',
                      background: ticketFormData.ticketType === 'VIP' ? 'linear-gradient(135deg, #d4af37 0%, #b8860b 100%)' : 'linear-gradient(135deg, #333 0%, #1a1a1a 100%)',
                      borderBottom: '1px dashed #444'
                    }}>
                      <div style={{ fontSize: 10, color: ticketFormData.ticketType === 'VIP' ? '#000' : '#888', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Berry Bly Productions</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: ticketFormData.ticketType === 'VIP' ? '#000' : '#fff' }}>{ticketFormData.ticketType || 'General'} Ticket</div>
                    </div>

                    {/* Ticket Body */}
                    <div style={{ padding: 24 }}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Guest Name</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{ticketFormData.holderName || 'Guest Name'}</div>
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Email</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{ticketFormData.holderEmail || 'email@example.com'}</div>
                      </div>
                      {parseInt(ticketFormData.price) > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Price</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#d4af37' }}>${ticketFormData.price}</div>
                        </div>
                      )}
                    </div>

                    {/* Ticket Footer - QR Placeholder */}
                    <div style={{ padding: '16px 24px', borderTop: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ width: 60, height: 60, background: '#fff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#000' }}>
                        QR
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#666' }}>Ticket ID</div>
                        <div style={{ fontSize: 12, color: '#d4af37', fontFamily: 'monospace' }}>TKT-XXXX</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 16, padding: 12, background: '#111', borderRadius: 8, border: '1px solid #222' }}>
                    <div style={{ fontSize: 11, color: '#666', textAlign: 'center' }}>
                      This is how your ticket will appear to guests
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
