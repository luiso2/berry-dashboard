// Client Portal View - Public view for clients
import { useState, useEffect } from 'react';
import { API_URL } from '../constants';
import type { ClientPortalData } from '../types';

interface ClientPortalViewProps {
  token: string;
}

export function ClientPortalView({ token }: ClientPortalViewProps) {
  const [data, setData] = useState<ClientPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortalData = async () => {
      try {
        const res = await fetch(`${API_URL}/client-portal/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Invalid or expired access');
        }
        const portalData = await res.json();
        setData(portalData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load portal');
      } finally {
        setLoading(false);
      }
    };
    fetchPortalData();
  }, [token]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  const formatCurrency = (amount: number) => '$' + (amount || 0).toLocaleString();

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
      });
    } catch {
      return timeStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-gray-700 border-t-amber-500 rounded-full animate-spin mx-auto mb-5" />
          <p className="text-gray-500 text-base">Loading your event portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' }}>
        <div className="text-center max-w-md">
          <div className="text-6xl mb-5">🔒</div>
          <h1 className="text-white text-2xl mb-3">Access Denied</h1>
          <p className="text-gray-500 text-base mb-6">{error || 'This link is invalid or has expired.'}</p>
          <p className="text-gray-600 text-sm">Please contact the event organizer for a new link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white font-sans" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid rgba(212,175,55,0.2)' }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
              {data.event.name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Client Portal</p>
          </div>
          <div className="text-right">
            <p className="text-amber-500 text-sm">Welcome, {data.client.name}</p>
            <p className="text-gray-600 text-xs mt-0.5">{data.client.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {/* Event Info Card */}
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.3)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <p className="text-gray-500 text-xs mb-1 uppercase">Date</p>
              <p className="text-lg font-semibold">📅 {formatDate(data.event.date)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1 uppercase">Venue</p>
              <p className="text-lg font-semibold">📍 {data.event.venue}{data.event.city ? `, ${data.event.city}` : ''}</p>
            </div>
            {data.event.expectedAttendance > 0 && (
              <div>
                <p className="text-gray-500 text-xs mb-1 uppercase">Expected Guests</p>
                <p className="text-lg font-semibold">👥 {data.event.expectedAttendance.toLocaleString()}</p>
              </div>
            )}
            {data.event.dressCode && (
              <div>
                <p className="text-gray-500 text-xs mb-1 uppercase">Dress Code</p>
                <p className="text-lg font-semibold">👔 {data.event.dressCode}</p>
              </div>
            )}
          </div>
          {data.event.theme && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-gray-500 text-xs mb-1 uppercase">Theme</p>
              <p className="text-base text-amber-500">✨ {data.event.theme}</p>
            </div>
          )}
        </div>

        {/* Budget Section */}
        {data.permissions.viewBudget && data.budget && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">💰 Budget Overview</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <p className="text-gray-500 text-xs mb-1">Expected Income</p>
                <p className="text-green-500 text-xl font-bold">{formatCurrency(data.budget.summary?.total_estimated_income || 0)}</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <p className="text-gray-500 text-xs mb-1">Expected Expenses</p>
                <p className="text-red-500 text-xl font-bold">{formatCurrency(data.budget.summary?.total_estimated_expenses || 0)}</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}>
                <p className="text-gray-500 text-xs mb-1">Paid</p>
                <p className="text-blue-400 text-xl font-bold">{data.budget.summary?.paid_count || 0} items</p>
              </div>
            </div>

            {data.budget.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left p-3 text-gray-500 font-medium">Category</th>
                      <th className="text-left p-3 text-gray-500 font-medium">Description</th>
                      <th className="text-right p-3 text-gray-500 font-medium">Estimated</th>
                      <th className="text-right p-3 text-gray-500 font-medium">Actual</th>
                      <th className="text-center p-3 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.budget.items.map((item, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="p-3">{item.icon} {item.category}</td>
                        <td className="p-3 text-gray-400">{item.description}</td>
                        <td className={`p-3 text-right ${item.isIncome ? 'text-green-500' : 'text-red-500'}`}>
                          {formatCurrency(item.estimatedAmount)}
                        </td>
                        <td className={`p-3 text-right ${item.isIncome ? 'text-green-500' : 'text-red-500'}`}>
                          {formatCurrency(item.actualAmount)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isPaid
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-yellow-500/20 text-yellow-500'
                          }`}>
                            {item.isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Timeline Section */}
        {data.permissions.viewTimeline && data.timeline && data.timeline.length > 0 && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">📋 Event Timeline</h2>
            <div className="flex flex-col gap-3">
              {data.timeline.map((item, i) => (
                <div
                  key={i}
                  className={`flex gap-4 p-4 rounded-xl ${
                    item.is_critical
                      ? 'bg-red-500/10 border border-red-500/30'
                      : 'bg-white/5'
                  }`}
                >
                  <div className="min-w-20 text-amber-500 font-semibold">{formatTime(item.time)}</div>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {item.title} {item.is_critical && <span className="text-red-500">⚠️</span>}
                    </p>
                    {item.description && <p className="text-gray-500 text-sm mt-1">{item.description}</p>}
                    {item.location && <p className="text-gray-600 text-xs mt-1">📍 {item.location}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist Section */}
        {data.permissions.viewTimeline && data.checklist && data.checklist.items.length > 0 && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">✅ Planning Checklist</h2>
            <p className="text-gray-500 text-sm mb-5">
              {data.checklist.completed} of {data.checklist.total} tasks completed
            </p>
            <div className="w-full h-2 bg-white/10 rounded mb-5">
              <div
                className="h-full rounded"
                style={{
                  width: `${(data.checklist.completed / data.checklist.total) * 100}%`,
                  background: 'linear-gradient(90deg, #22c55e, #4ade80)'
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              {data.checklist.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-2 px-3 bg-white/5 rounded-lg">
                  <span className={item.is_completed ? 'text-green-500' : 'text-gray-600'}>
                    {item.is_completed ? '✓' : '○'}
                  </span>
                  <span className={`flex-1 ${item.is_completed ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {item.item}
                  </span>
                  <span className="text-xs text-gray-600">{item.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff Section */}
        {data.permissions.viewStaff && data.staff && data.staff.length > 0 && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">👥 Event Staff</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.staff.map((member, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-4 text-center">
                  <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #d4af37, #b8860b)' }}>
                    {member.photo_url
                      ? <img src={member.photo_url} alt={member.name} className="w-full h-full object-cover" />
                      : member.name.charAt(0)
                    }
                  </div>
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-amber-500 text-sm">{member.role}</p>
                  {member.shift_start && (
                    <p className="text-gray-600 text-xs mt-2">
                      {formatTime(member.shift_start)} - {formatTime(member.shift_end)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vendors Section */}
        {data.permissions.viewVendors && data.vendors && data.vendors.length > 0 && (
          <div className="rounded-2xl p-6 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">🏢 Vendors & Contractors</h2>
            <div className="flex flex-col gap-3">
              {data.vendors.map((vendor, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-white/5 rounded-xl">
                  <div>
                    <p className="font-semibold">{vendor.name}</p>
                    <p className="text-gray-500 text-sm mt-1">{vendor.category} • {vendor.contract_title}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    vendor.status === 'signed'
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-yellow-500/20 text-yellow-500'
                  }`}>
                    {vendor.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-10 px-6 mt-10 border-t border-white/10">
        <p className="text-gray-600 text-sm">
          Powered by <span className="text-amber-500">Berry Bly Productions</span>
        </p>
        <p className="text-gray-700 text-xs mt-2">
          This portal is secure and only accessible with your unique link
        </p>
      </footer>
    </div>
  );
}
