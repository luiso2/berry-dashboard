import { useState, useEffect, useCallback } from 'react';
import type { EventbriteRefund, EventbriteOrder, EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface RefundManagerProps {
  events: EventbriteEventMetrics[];
}

export function RefundManager({ events }: RefundManagerProps) {
  const [refunds, setRefunds] = useState<EventbriteRefund[]>([]);
  const [orders, setOrders] = useState<EventbriteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<EventbriteOrder | null>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [refundForm, setRefundForm] = useState({
    reason: '',
    full_refund: true,
    amount: 0,
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const fetchRefunds = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);

      const res = await fetch(`${API_URL}/integrations/eventbrite/refunds?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRefunds(data);
      }
    } catch (err) {
      console.error('Error fetching refunds:', err);
    }
  }, [selectedEvent]);

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);
      params.append('status', 'placed');
      params.append('limit', '100');

      const res = await fetch(`${API_URL}/integrations/eventbrite/orders?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  }, [selectedEvent]);

  const handleCreateRefund = async () => {
    if (!selectedOrder) return;

    setProcessing(true);
    try {
      const payload = {
        order_id: selectedOrder.id,
        event_id: selectedOrder.event_id,
        reason: refundForm.reason,
        amount: refundForm.full_refund ? undefined : refundForm.amount,
      };

      const res = await fetch(`${API_URL}/integrations/eventbrite/refunds`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await Promise.all([fetchRefunds(), fetchOrders()]);
        setShowRefundModal(false);
        setSelectedOrder(null);
        setRefundForm({ reason: '', full_refund: true, amount: 0 });
      } else {
        const error = await res.json();
        alert(`Error: ${error.error || 'Failed to process refund'}`);
      }
    } catch (err) {
      console.error('Error creating refund:', err);
      alert('Failed to process refund');
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchRefunds(), fetchOrders()]);
      setLoading(false);
    };
    loadData();
  }, [fetchRefunds, fetchOrders]);

  const openRefundModal = (order: EventbriteOrder) => {
    setSelectedOrder(order);
    setRefundForm({
      reason: '',
      full_refund: true,
      amount: order.net_amount,
    });
    setShowRefundModal(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'bg-green-500/20 text-green-400';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'failed':
        return 'bg-red-500/20 text-red-400';
      case 'cancelled':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-white/10 text-white/60';
    }
  };

  const filteredOrders = orders.filter((order) =>
    order.buyer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.buyer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.id.includes(searchTerm)
  );

  const totalRefunded = refunds
    .filter(r => r.status === 'processed')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Refund Management</h2>
        <p className="text-white/60 text-sm">Process refunds and track refund history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Refunds</p>
          <p className="text-2xl font-bold text-white">{refunds.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Processed</p>
          <p className="text-2xl font-bold text-green-400">
            {refunds.filter(r => r.status === 'processed').length}
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">
            {refunds.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Refunded</p>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(totalRefunded)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
        >
          <option value="">All Events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search orders by name, email, or ID..."
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders Available for Refund */}
        <div className="space-y-4">
          <h3 className="text-white font-medium">Orders Available for Refund</h3>

          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 bg-white/5 rounded-xl">
              <div className="text-3xl mb-2">📦</div>
              <p className="text-white/60">No orders available for refund</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-amber-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-medium">{order.buyer_name}</p>
                      <p className="text-white/60 text-sm">{order.buyer_email}</p>
                      <p className="text-white/40 text-xs mt-1">
                        Order #{order.id.slice(-8)} • {order.ticket_count} ticket(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-medium">{formatCurrency(order.net_amount)}</p>
                      <button
                        onClick={() => openRefundModal(order)}
                        className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                      >
                        Refund
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refund History */}
        <div className="space-y-4">
          <h3 className="text-white font-medium">Refund History</h3>

          {refunds.length === 0 ? (
            <div className="text-center py-8 bg-white/5 rounded-xl">
              <div className="text-3xl mb-2">💸</div>
              <p className="text-white/60">No refunds processed yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {refunds.map((refund) => (
                <div
                  key={refund.id}
                  className={`p-4 rounded-xl border ${
                    refund.status === 'processed'
                      ? 'bg-green-500/10 border-green-500/20'
                      : refund.status === 'pending'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(refund.status)}`}>
                          {refund.status}
                        </span>
                      </div>
                      <p className="text-white/80 text-sm">Order #{refund.order_id.slice(-8)}</p>
                      {refund.reason && (
                        <p className="text-white/40 text-xs mt-1">Reason: {refund.reason}</p>
                      )}
                      <p className="text-white/40 text-xs mt-1">{formatDate(refund.created_at)}</p>
                    </div>
                    <div className="text-right">
                      {refund.amount !== undefined && refund.amount !== null && (
                        <p className="text-red-400 font-medium">{formatCurrency(refund.amount)}</p>
                      )}
                      {refund.processed_at && (
                        <p className="text-white/40 text-xs mt-1">
                          Processed: {formatDate(refund.processed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-6">Process Refund</h3>

            {/* Order Summary */}
            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <p className="text-white font-medium">{selectedOrder.buyer_name}</p>
              <p className="text-white/60 text-sm">{selectedOrder.buyer_email}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                <span className="text-white/60 text-sm">Order Amount</span>
                <span className="text-white font-medium">{formatCurrency(selectedOrder.net_amount)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white/60 text-sm">Tickets</span>
                <span className="text-white">{selectedOrder.ticket_count}</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Refund Type */}
              <div>
                <label className="block text-white/80 text-sm mb-3">Refund Type</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      checked={refundForm.full_refund}
                      onChange={() => setRefundForm({ ...refundForm, full_refund: true })}
                      className="text-amber-500"
                    />
                    <div>
                      <p className="text-white font-medium">Full Refund</p>
                      <p className="text-white/40 text-xs">{formatCurrency(selectedOrder.net_amount)}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="radio"
                      checked={!refundForm.full_refund}
                      onChange={() => setRefundForm({ ...refundForm, full_refund: false })}
                      className="text-amber-500"
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">Partial Refund</p>
                      {!refundForm.full_refund && (
                        <input
                          type="number"
                          step="0.01"
                          max={selectedOrder.net_amount}
                          value={refundForm.amount}
                          onChange={(e) => setRefundForm({ ...refundForm, amount: Number(e.target.value) })}
                          className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                          placeholder="Enter amount"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Reason for Refund</label>
                <select
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Select a reason</option>
                  <option value="Event cancelled">Event cancelled</option>
                  <option value="Customer request">Customer request</option>
                  <option value="Duplicate purchase">Duplicate purchase</option>
                  <option value="Unable to attend">Unable to attend</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Warning */}
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">
                ⚠️ This action will process a refund through Eventbrite and cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedOrder(null);
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRefund}
                disabled={processing || !refundForm.reason}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Processing...
                  </>
                ) : (
                  <>Process Refund</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
