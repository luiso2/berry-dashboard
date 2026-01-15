import { useState, useEffect } from 'react';
import type { EventbriteEventMetrics, EventComparison } from '../../types';
import { API_URL } from '../../constants';

interface EventComparisonViewProps {
  events: EventbriteEventMetrics[];
}

export function EventComparisonView({ events }: EventComparisonViewProps) {
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [comparison, setComparison] = useState<EventComparison | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const fetchComparison = async () => {
    if (selectedEvents.length < 2) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('event_ids', selectedEvents.join(','));

      const res = await fetch(`${API_URL}/integrations/eventbrite/compare?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setComparison(data);
      }
    } catch (err) {
      console.error('Error fetching comparison:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEvents.length >= 2) {
      fetchComparison();
    } else {
      setComparison(null);
    }
  }, [selectedEvents]);

  const toggleEventSelection = (eventId: string) => {
    if (selectedEvents.includes(eventId)) {
      setSelectedEvents(selectedEvents.filter(id => id !== eventId));
    } else if (selectedEvents.length < 4) {
      setSelectedEvents([...selectedEvents, eventId]);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMetricColor = (winner: number | undefined, index: number) => {
    if (winner === undefined) return 'text-white';
    return winner === index ? 'text-green-400 font-bold' : 'text-white/60';
  };

  const formatMetricValue = (metric: string, value: number | string) => {
    if (typeof value === 'string') return value;
    if (metric.includes('Revenue') || metric.includes('Amount')) {
      return formatCurrency(value);
    }
    if (metric.includes('Rate')) {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Event Comparison</h2>
        <p className="text-white/60 text-sm">Compare performance metrics across events side by side</p>
      </div>

      {/* Event Selection */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">Select Events to Compare</h3>
          <span className="text-white/40 text-sm">{selectedEvents.length}/4 selected</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((event) => {
            const isSelected = selectedEvents.includes(event.id);
            const selectionIndex = selectedEvents.indexOf(event.id);

            return (
              <button
                key={event.id}
                onClick={() => toggleEventSelection(event.id)}
                disabled={!isSelected && selectedEvents.length >= 4}
                className={`p-4 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                      {event.name}
                    </p>
                    <p className="text-white/60 text-sm mt-1">
                      {new Date(event.startDate).toLocaleDateString()}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      {event.ticketsSold} tickets • {formatCurrency(event.grossRevenue)}
                    </p>
                  </div>
                  {isSelected && (
                    <span className="ml-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {selectionIndex + 1}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedEvents.length < 2 && (
          <p className="text-white/40 text-sm mt-4 text-center">
            Select at least 2 events to compare
          </p>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      )}

      {/* Comparison Results */}
      {comparison && !loading && (
        <div className="space-y-6">
          {/* Event Headers */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${comparison.events.length}, 1fr)` }}>
            <div />
            {comparison.events.map((event, index) => (
              <div
                key={event.id}
                className="bg-gradient-to-br from-amber-500/20 to-yellow-500/10 rounded-xl p-4 border border-amber-500/20"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {index + 1}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    event.status === 'live' ? 'bg-green-500/20 text-green-400' :
                    event.status === 'ended' || event.status === 'completed' ? 'bg-gray-500/20 text-gray-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {event.status}
                  </span>
                </div>
                <p className="text-white font-medium truncate">{event.name}</p>
                <p className="text-white/60 text-sm">
                  {new Date(event.start_date).toLocaleDateString()}
                </p>
                {event.venue && (
                  <p className="text-white/40 text-xs truncate">{event.venue}</p>
                )}
              </div>
            ))}
          </div>

          {/* Metrics Comparison Table */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="grid divide-y divide-white/10">
              {comparison.metrics.map((metric, metricIndex) => (
                <div
                  key={metric.metric}
                  className={`grid items-center ${metricIndex % 2 === 0 ? 'bg-white/[0.02]' : ''}`}
                  style={{ gridTemplateColumns: `200px repeat(${comparison.events.length}, 1fr)` }}
                >
                  <div className="p-4 font-medium text-white/80 text-sm">
                    {metric.metric}
                  </div>
                  {metric.values.map((value, index) => (
                    <div
                      key={index}
                      className={`p-4 text-center ${getMetricColor(metric.winner, index)}`}
                    >
                      <span className="text-lg">
                        {formatMetricValue(metric.metric, value)}
                      </span>
                      {metric.winner === index && (
                        <span className="ml-2 text-green-400">👑</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Visual Comparison Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue Comparison */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-medium mb-4">Revenue Comparison</h3>
              <div className="space-y-4">
                {comparison.events.map((event, index) => {
                  const maxRevenue = Math.max(...comparison.events.map(e => e.gross_revenue));
                  const percentage = maxRevenue > 0 ? (event.gross_revenue / maxRevenue) * 100 : 0;

                  return (
                    <div key={event.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/80 text-sm truncate flex-1">{event.name}</span>
                        <span className="text-white font-medium ml-2">{formatCurrency(event.gross_revenue)}</span>
                      </div>
                      <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            index === 0 ? 'bg-gradient-to-r from-amber-500 to-yellow-500' :
                            index === 1 ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                            index === 2 ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                            'bg-gradient-to-r from-green-500 to-emerald-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tickets Comparison */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-medium mb-4">Tickets Sold</h3>
              <div className="space-y-4">
                {comparison.events.map((event, index) => {
                  const maxTickets = Math.max(...comparison.events.map(e => e.tickets_sold));
                  const percentage = maxTickets > 0 ? (event.tickets_sold / maxTickets) * 100 : 0;

                  return (
                    <div key={event.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/80 text-sm truncate flex-1">{event.name}</span>
                        <span className="text-white font-medium ml-2">{event.tickets_sold.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            index === 0 ? 'bg-gradient-to-r from-amber-500 to-yellow-500' :
                            index === 1 ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                            index === 2 ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                            'bg-gradient-to-r from-green-500 to-emerald-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Check-in Rate */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-medium mb-4">Check-in Rate</h3>
              <div className="flex items-end justify-around h-48">
                {comparison.events.map((event, index) => (
                  <div key={event.id} className="flex flex-col items-center">
                    <div
                      className={`w-16 rounded-t transition-all ${
                        index === 0 ? 'bg-gradient-to-t from-amber-500 to-yellow-500' :
                        index === 1 ? 'bg-gradient-to-t from-blue-500 to-cyan-500' :
                        index === 2 ? 'bg-gradient-to-t from-purple-500 to-pink-500' :
                        'bg-gradient-to-t from-green-500 to-emerald-500'
                      }`}
                      style={{ height: `${Math.max(event.check_in_rate, 5)}%` }}
                    />
                    <p className="text-white font-medium mt-2">{event.check_in_rate.toFixed(0)}%</p>
                    <p className="text-white/40 text-xs text-center mt-1 max-w-[80px] truncate">
                      {event.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
              <h3 className="text-white font-medium mb-4">Conversion Rate</h3>
              <div className="flex items-end justify-around h-48">
                {comparison.events.map((event, index) => (
                  <div key={event.id} className="flex flex-col items-center">
                    <div
                      className={`w-16 rounded-t transition-all ${
                        index === 0 ? 'bg-gradient-to-t from-amber-500 to-yellow-500' :
                        index === 1 ? 'bg-gradient-to-t from-blue-500 to-cyan-500' :
                        index === 2 ? 'bg-gradient-to-t from-purple-500 to-pink-500' :
                        'bg-gradient-to-t from-green-500 to-emerald-500'
                      }`}
                      style={{ height: `${Math.max(event.conversion_rate * 5, 5)}%` }}
                    />
                    <p className="text-white font-medium mt-2">{event.conversion_rate.toFixed(1)}%</p>
                    <p className="text-white/40 text-xs text-center mt-1 max-w-[80px] truncate">
                      {event.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 rounded-xl p-6 border border-amber-500/20">
            <h3 className="text-white font-medium mb-4">📊 Quick Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💰</span>
                <div>
                  <p className="text-white font-medium">Highest Revenue</p>
                  <p className="text-white/60">
                    {comparison.events.reduce((a, b) => a.gross_revenue > b.gross_revenue ? a : b).name}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎫</span>
                <div>
                  <p className="text-white font-medium">Most Tickets Sold</p>
                  <p className="text-white/60">
                    {comparison.events.reduce((a, b) => a.tickets_sold > b.tickets_sold ? a : b).name}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-white font-medium">Best Check-in Rate</p>
                  <p className="text-white/60">
                    {comparison.events.reduce((a, b) => a.check_in_rate > b.check_in_rate ? a : b).name}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">📈</span>
                <div>
                  <p className="text-white font-medium">Best Conversion</p>
                  <p className="text-white/60">
                    {comparison.events.reduce((a, b) => a.conversion_rate > b.conversion_rate ? a : b).name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
