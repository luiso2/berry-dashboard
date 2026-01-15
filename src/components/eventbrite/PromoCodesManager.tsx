import { useState, useEffect, useCallback } from 'react';
import type { EventbritePromoCode, EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface PromoCodesManagerProps {
  events: EventbriteEventMetrics[];
}

export function PromoCodesManager({ events }: PromoCodesManagerProps) {
  const [promoCodes, setPromoCodes] = useState<EventbritePromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string>('');

  const [formData, setFormData] = useState({
    event_id: '',
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    quantity_available: 100,
    start_date: '',
    end_date: '',
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const fetchPromoCodes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);

      const res = await fetch(`${API_URL}/integrations/eventbrite/promo-codes?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPromoCodes(data);
      }
    } catch (err) {
      console.error('Error fetching promo codes:', err);
    }
  }, [selectedEvent]);

  const syncPromoCodes = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/promo-codes/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_id: selectedEvent || undefined }),
      });
      if (res.ok) {
        await fetchPromoCodes();
      }
    } catch (err) {
      console.error('Error syncing promo codes:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreatePromoCode = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/promo-codes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchPromoCodes();
        setShowCreateModal(false);
        resetForm();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error || 'Failed to create promo code'}`);
      }
    } catch (err) {
      console.error('Error creating promo code:', err);
    }
  };

  const handleDeletePromoCode = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/promo-codes/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        await fetchPromoCodes();
      }
    } catch (err) {
      console.error('Error deleting promo code:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      event_id: '',
      code: '',
      discount_type: 'percentage',
      discount_value: 10,
      quantity_available: 100,
      start_date: '',
      end_date: '',
    });
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, code });
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchPromoCodes();
      setLoading(false);
    };
    loadData();
  }, [fetchPromoCodes]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getUsagePercentage = (code: EventbritePromoCode) => {
    if (!code.quantity_available) return 0;
    return Math.round((code.quantity_sold / code.quantity_available) * 100);
  };

  const totalDiscountGiven = promoCodes.reduce((sum, code) => {
    const discount = code.discount_type === 'percentage'
      ? 0 // Can't calculate without order amounts
      : code.discount_value * code.quantity_sold;
    return sum + discount;
  }, 0);

  const totalCodesUsed = promoCodes.reduce((sum, code) => sum + code.quantity_sold, 0);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Promo Codes</h2>
          <p className="text-white/60 text-sm">Create and manage discount codes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncPromoCodes}
            disabled={syncing}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              '🔄'
            )}
            Sync from Eventbrite
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Create Code
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Active Codes</p>
          <p className="text-2xl font-bold text-white">
            {promoCodes.filter(c => c.is_active).length}
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Codes</p>
          <p className="text-2xl font-bold text-white">{promoCodes.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Times Used</p>
          <p className="text-2xl font-bold text-amber-400">{totalCodesUsed}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Discount (Fixed)</p>
          <p className="text-2xl font-bold text-green-400">${totalDiscountGiven}</p>
        </div>
      </div>

      {/* Filter */}
      <div>
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
      </div>

      {/* Promo Codes List */}
      {promoCodes.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-xl">
          <div className="text-4xl mb-4">🏷️</div>
          <p className="text-white/60">No promo codes found</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
          >
            Create your first promo code
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {promoCodes.map((code) => (
            <div
              key={code.id}
              className={`p-4 rounded-xl border transition-colors ${
                code.is_active
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded font-mono text-lg font-bold">
                      {code.code}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      code.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex items-center gap-6 mt-3">
                    <div>
                      <p className="text-white/40 text-xs">Discount</p>
                      <p className="text-white font-medium">
                        {code.discount_type === 'percentage'
                          ? `${code.discount_value}%`
                          : `$${code.discount_value}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs">Event</p>
                      <p className="text-white/80 text-sm">{code.event_name || 'All Events'}</p>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs">Usage</p>
                      <p className="text-white/80 text-sm">
                        {code.quantity_sold} / {code.quantity_available || '∞'}
                      </p>
                    </div>
                    {code.end_date && (
                      <div>
                        <p className="text-white/40 text-xs">Expires</p>
                        <p className="text-white/80 text-sm">{formatDate(code.end_date)}</p>
                      </div>
                    )}
                  </div>

                  {/* Usage Progress */}
                  {code.quantity_available && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                        <span>Usage</span>
                        <span>{getUsagePercentage(code)}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all"
                          style={{ width: `${getUsagePercentage(code)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(code.code);
                      alert('Code copied to clipboard!');
                    }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/60 hover:text-white transition-colors"
                    title="Copy code"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => handleDeletePromoCode(code.id)}
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                    title="Delete code"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-white mb-6">Create Promo Code</h3>

            <div className="space-y-4">
              {/* Event Selection */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Event *</label>
                <select
                  value={formData.event_id}
                  onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">Select an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Promo Code *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER25"
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={generateCode}
                    className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>

              {/* Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/80 text-sm mb-2">Discount Type</label>
                  <select
                    value={formData.discount_type}
                    onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as 'percentage' | 'fixed' })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/80 text-sm mb-2">
                    Discount Value {formData.discount_type === 'percentage' ? '(%)' : '($)'}
                  </label>
                  <input
                    type="number"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Quantity Available</label>
                <input
                  type="number"
                  value={formData.quantity_available}
                  onChange={(e) => setFormData({ ...formData, quantity_available: Number(e.target.value) })}
                  placeholder="Leave empty for unlimited"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/80 text-sm mb-2">Start Date</label>
                  <input
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/80 text-sm mb-2">End Date</label>
                  <input
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePromoCode}
                disabled={!formData.event_id || !formData.code}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Create Code
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
