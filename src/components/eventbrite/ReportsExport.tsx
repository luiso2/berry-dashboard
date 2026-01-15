import { useState, useEffect, useCallback } from 'react';
import type { EventbriteEventMetrics, EventbriteReportSummary } from '../../types';
import { API_URL } from '../../constants';

interface ReportsExportProps {
  events: EventbriteEventMetrics[];
}

export function ReportsExport({ events }: ReportsExportProps) {
  const [summary, setSummary] = useState<EventbriteReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    start_date: '',
    end_date: '',
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/reports/summary`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchSummary();
      setLoading(false);
    };
    loadData();
  }, [fetchSummary]);

  const downloadReport = async (type: 'orders' | 'attendees', format: 'csv' | 'json') => {
    setDownloading(`${type}-${format}`);
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (selectedEvent) params.append('event_id', selectedEvent);
      if (dateRange.start_date) params.append('start_date', dateRange.start_date);
      if (dateRange.end_date) params.append('end_date', dateRange.end_date);

      const res = await fetch(`${API_URL}/integrations/eventbrite/reports/${type}?${params}`, { headers });

      if (res.ok) {
        if (format === 'csv') {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `eventbrite-${type}-${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `eventbrite-${type}-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }
      }
    } catch (err) {
      console.error('Error downloading report:', err);
    } finally {
      setDownloading(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

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
        <h2 className="text-xl font-bold text-white">Reports & Export</h2>
        <p className="text-white/60 text-sm">Download detailed reports in CSV or JSON format</p>
      </div>

      {/* Summary Cards */}
      {summary?.overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white/60 text-sm">Total Events</p>
            <p className="text-2xl font-bold text-white">{summary.overview.total_events}</p>
            <p className="text-amber-400 text-sm">{summary.overview.active_events} active</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white/60 text-sm">Tickets Sold</p>
            <p className="text-2xl font-bold text-white">{summary.overview.total_tickets_sold}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white/60 text-sm">Net Revenue</p>
            <p className="text-2xl font-bold text-green-400">
              {formatCurrency(summary.financials?.net_revenue ?? 0)}
            </p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-white/60 text-sm">Check-in Rate</p>
            <p className="text-2xl font-bold text-white">
              {summary.overview.total_attendees > 0
                ? Math.round((summary.overview.total_checked_in / summary.overview.total_attendees) * 100)
                : 0}%
            </p>
          </div>
        </div>
      )}

      {/* Financial Breakdown */}
      {summary && (
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-white font-medium mb-4">Financial Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-white/60 text-sm">Gross Revenue</p>
              <p className="text-xl font-bold text-white">
                {formatCurrency(summary.financials.gross_revenue)}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-sm">Platform Fees</p>
              <p className="text-xl font-bold text-red-400">
                -{formatCurrency(summary.financials.total_fees)}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-sm">Refunds</p>
              <p className="text-xl font-bold text-orange-400">
                -{formatCurrency(summary.financials.total_refunds)}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-sm">Net Revenue</p>
              <p className="text-xl font-bold text-green-400">
                {formatCurrency(summary.financials.net_revenue)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Events */}
      {summary && summary.top_events.length > 0 && (
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-white font-medium mb-4">Top Performing Events</h3>
          <div className="space-y-3">
            {summary.top_events.map((event, index) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-amber-500 text-white' :
                    index === 1 ? 'bg-gray-400 text-white' :
                    index === 2 ? 'bg-amber-700 text-white' :
                    'bg-white/10 text-white/60'
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-white font-medium">{event.name}</p>
                    <p className="text-white/60 text-sm">{event.tickets_sold} tickets sold</p>
                  </div>
                </div>
                <p className="text-green-400 font-bold">{formatCurrency(event.revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <h3 className="text-white font-medium mb-4">Export Data</h3>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-white/60 text-sm mb-2">Event</label>
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="">All Events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Start Date</label>
            <input
              type="date"
              value={dateRange.start_date}
              onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">End Date</label>
            <input
              type="date"
              value={dateRange.end_date}
              onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Export Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Orders Export */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📦</span>
              </div>
              <div>
                <p className="text-white font-medium">Orders Report</p>
                <p className="text-white/60 text-sm">Export all order data</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadReport('orders', 'csv')}
                disabled={downloading === 'orders-csv'}
                className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {downloading === 'orders-csv' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  <>📥 CSV</>
                )}
              </button>
              <button
                onClick={() => downloadReport('orders', 'json')}
                disabled={downloading === 'orders-json'}
                className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {downloading === 'orders-json' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  <>📥 JSON</>
                )}
              </button>
            </div>
          </div>

          {/* Attendees Export */}
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">👥</span>
              </div>
              <div>
                <p className="text-white font-medium">Attendees Report</p>
                <p className="text-white/60 text-sm">Export attendee data with check-in status</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadReport('attendees', 'csv')}
                disabled={downloading === 'attendees-csv'}
                className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {downloading === 'attendees-csv' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  <>📥 CSV</>
                )}
              </button>
              <button
                onClick={() => downloadReport('attendees', 'json')}
                disabled={downloading === 'attendees-json'}
                className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {downloading === 'attendees-json' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  <>📥 JSON</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Orders by Status */}
      {summary && summary.orders_by_status.length > 0 && (
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-white font-medium mb-4">Orders by Status</h3>
          <div className="flex flex-wrap gap-4">
            {summary.orders_by_status.map((item) => (
              <div
                key={item.status}
                className={`px-4 py-3 rounded-lg ${
                  item.status === 'placed' ? 'bg-green-500/20' :
                  item.status === 'refunded' ? 'bg-red-500/20' :
                  item.status === 'cancelled' ? 'bg-gray-500/20' :
                  'bg-yellow-500/20'
                }`}
              >
                <p className={`text-sm capitalize ${
                  item.status === 'placed' ? 'text-green-400' :
                  item.status === 'refunded' ? 'text-red-400' :
                  item.status === 'cancelled' ? 'text-gray-400' :
                  'text-yellow-400'
                }`}>
                  {item.status}
                </p>
                <p className="text-2xl font-bold text-white">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
