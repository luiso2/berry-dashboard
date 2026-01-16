import { useState, useEffect, useCallback } from 'react';
import type { EventbriteOrder, OrderDailyStats, EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface OrdersFeedProps {
  events: EventbriteEventMetrics[];
}

export function OrdersFeed({ events }: OrdersFeedProps) {
  const [orders, setOrders] = useState<EventbriteOrder[]>([]);
  const [recentOrders, setRecentOrders] = useState<EventbriteOrder[]>([]);
  const [dailyStats, setDailyStats] = useState<OrderDailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'recent' | 'all' | 'stats'>('recent');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('berry_token')}`,
  };

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '100');

      const res = await fetch(`${API_URL}/integrations/eventbrite/orders?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Ensure data is an array
        setOrders(Array.isArray(data) ? data : data?.orders || []);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  }, [selectedEvent, statusFilter]);

  const fetchRecentOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/orders/recent?limit=20`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Ensure data is an array
        setRecentOrders(Array.isArray(data) ? data : data?.orders || []);
      }
    } catch (err) {
      console.error('Error fetching recent orders:', err);
    }
  }, []);

  const fetchDailyStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);
      params.append('days', '30');

      const res = await fetch(`${API_URL}/integrations/eventbrite/orders/stats/daily?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Ensure data is an array
        setDailyStats(Array.isArray(data) ? data : data?.stats || []);
      }
    } catch (err) {
      console.error('Error fetching daily stats:', err);
    }
  }, [selectedEvent]);

  const syncOrders = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/orders/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_id: selectedEvent || undefined }),
      });
      if (res.ok) {
        await Promise.all([fetchOrders(), fetchRecentOrders(), fetchDailyStats()]);
      }
    } catch (err) {
      console.error('Error syncing orders:', err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchRecentOrders(), fetchDailyStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchOrders, fetchRecentOrders, fetchDailyStats]);

  // Auto-refresh every 30 seconds for recent orders
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecentOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRecentOrders]);

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
      case 'placed':
        return 'bg-green-500/20 text-green-400';
      case 'refunded':
        return 'bg-red-500/20 text-red-400';
      case 'cancelled':
        return 'bg-gray-500/20 text-gray-400';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-white/10 text-white/60';
    }
  };

  const totalRevenue = Array.isArray(orders) ? orders.reduce((sum, o) => sum + (o.net_amount || 0), 0) : 0;
  const totalTickets = Array.isArray(orders) ? orders.reduce((sum, o) => sum + (o.ticket_count || 0), 0) : 0;

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
          <h2 className="text-xl font-bold text-white">Orders Feed</h2>
          <p className="text-white/60 text-sm">Real-time order tracking and analytics</p>
        </div>
        <button
          onClick={syncOrders}
          disabled={syncing}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Syncing...
            </>
          ) : (
            <>🔄 Sync Orders</>
          )}
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Orders</p>
          <p className="text-2xl font-bold text-white">{orders.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Tickets</p>
          <p className="text-2xl font-bold text-white">{totalTickets}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Net Revenue</p>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Avg Order Value</p>
          <p className="text-2xl font-bold text-white">
            {orders.length > 0 ? formatCurrency(totalRevenue / orders.length) : '$0'}
          </p>
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="placed">Placed</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'recent'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Recent Orders
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          All Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Daily Stats
        </button>
      </div>

      {/* Recent Orders - Live Feed Style */}
      {activeTab === 'recent' && (
        <div className="space-y-3">
          {recentOrders.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <div className="text-4xl mb-4">📦</div>
              <p className="text-white/60">No recent orders</p>
            </div>
          ) : (
            recentOrders.map((order, index) => (
              <div
                key={order.id}
                className={`p-4 rounded-xl border border-white/10 bg-white/5 transition-all ${
                  index === 0 ? 'animate-pulse border-amber-500/50 bg-amber-500/10' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold">
                      {order.buyer_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-white font-medium">{order.buyer_name}</p>
                      <p className="text-white/60 text-sm">{order.buyer_email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold">{formatCurrency(order.net_amount)}</p>
                    <p className="text-white/60 text-sm">{order.ticket_count} ticket(s)</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="text-white/40 text-xs">{order.event_name}</span>
                    {order.promo_code && (
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                        {order.promo_code}
                      </span>
                    )}
                  </div>
                  <span className="text-white/40 text-xs">{formatDate(order.order_date)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* All Orders Table */}
      {activeTab === 'all' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 text-white/60 text-sm font-medium">Buyer</th>
                <th className="text-left p-3 text-white/60 text-sm font-medium">Event</th>
                <th className="text-left p-3 text-white/60 text-sm font-medium">Status</th>
                <th className="text-right p-3 text-white/60 text-sm font-medium">Tickets</th>
                <th className="text-right p-3 text-white/60 text-sm font-medium">Amount</th>
                <th className="text-right p-3 text-white/60 text-sm font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <div>
                      <p className="text-white">{order.buyer_name}</p>
                      <p className="text-white/40 text-xs">{order.buyer_email}</p>
                    </div>
                  </td>
                  <td className="p-3 text-white/80 text-sm">{order.event_name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-3 text-right text-white">{order.ticket_count}</td>
                  <td className="p-3 text-right text-green-400 font-medium">
                    {formatCurrency(order.net_amount)}
                  </td>
                  <td className="p-3 text-right text-white/60 text-sm">
                    {formatDate(order.order_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Daily Stats Chart */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {dailyStats.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <div className="text-4xl mb-4">📊</div>
              <p className="text-white/60">No daily stats available</p>
            </div>
          ) : (
            <>
              {/* Simple Bar Chart */}
              <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="text-white font-medium mb-4">Revenue by Day (Last 30 Days)</h3>
                <div className="flex items-end gap-1 h-48">
                  {dailyStats.slice(-30).map((stat) => {
                    const maxRevenue = Math.max(...dailyStats.map(s => s.total_revenue));
                    const height = maxRevenue > 0 ? (stat.total_revenue / maxRevenue) * 100 : 0;
                    return (
                      <div
                        key={stat.date}
                        className="flex-1 bg-gradient-to-t from-amber-500 to-yellow-500 rounded-t hover:from-amber-400 hover:to-yellow-400 transition-colors cursor-pointer group relative"
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`${stat.date}: ${formatCurrency(stat.total_revenue)}`}
                      >
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/90 px-2 py-1 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                          {new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <br />
                          {formatCurrency(stat.total_revenue)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stats Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-3 text-white/60 text-sm font-medium">Date</th>
                      <th className="text-right p-3 text-white/60 text-sm font-medium">Orders</th>
                      <th className="text-right p-3 text-white/60 text-sm font-medium">Tickets</th>
                      <th className="text-right p-3 text-white/60 text-sm font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats.slice().reverse().map((stat) => (
                      <tr key={stat.date} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-white">
                          {new Date(stat.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-3 text-right text-white">{stat.total_orders}</td>
                        <td className="p-3 text-right text-white">{stat.total_tickets}</td>
                        <td className="p-3 text-right text-green-400 font-medium">
                          {formatCurrency(stat.total_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
