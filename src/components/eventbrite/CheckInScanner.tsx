import { useState, useEffect, useCallback, useRef } from 'react';
import type { EventbriteAttendee, EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface CheckInScannerProps {
  events: EventbriteEventMetrics[];
}

export function CheckInScanner({ events }: CheckInScannerProps) {
  const [attendees, setAttendees] = useState<EventbriteAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked_in' | 'not_checked_in'>('all');
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; attendee?: EventbriteAttendee } | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('berry_token')}`,
  };

  const fetchAttendees = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedEvent) params.append('event_id', selectedEvent);
      params.append('limit', '500');

      const res = await fetch(`${API_URL}/integrations/eventbrite/attendees?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        // Handle both array and object response formats
        setAttendees(Array.isArray(data) ? data : (data.attendees || []));
      }
    } catch (err) {
      console.error('Error fetching attendees:', err);
    }
  }, [selectedEvent]);

  const syncAttendees = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/attendees/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event_id: selectedEvent || undefined }),
      });
      if (res.ok) {
        await fetchAttendees();
      }
    } catch (err) {
      console.error('Error syncing attendees:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckIn = async (attendeeId: string) => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/attendees/${attendeeId}/check-in`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchAttendees();
        const attendee = attendees.find(a => a.id === attendeeId);
        setScanResult({
          success: true,
          message: `${attendee?.name} checked in successfully!`,
          attendee,
        });
      }
    } catch (err) {
      console.error('Error checking in:', err);
      setScanResult({
        success: false,
        message: 'Failed to check in attendee',
      });
    }
  };

  const handleUndoCheckIn = async (attendeeId: string) => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/attendees/${attendeeId}/undo-check-in`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchAttendees();
      }
    } catch (err) {
      console.error('Error undoing check-in:', err);
    }
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/attendees/check-in-by-barcode`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          barcode: barcodeInput.trim(),
          event_id: selectedEvent || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setScanResult({
          success: true,
          message: `${data.attendee.name} checked in!`,
          attendee: data.attendee,
        });
        await fetchAttendees();
      } else {
        setScanResult({
          success: false,
          message: data.error || 'Check-in failed',
        });
      }
    } catch (err) {
      setScanResult({
        success: false,
        message: 'Failed to process barcode',
      });
    }

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchAttendees();
      setLoading(false);
    };
    loadData();
  }, [fetchAttendees]);

  // Auto-focus barcode input when scanner is shown
  useEffect(() => {
    if (showScanner && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [showScanner]);

  // Clear scan result after 3 seconds
  useEffect(() => {
    if (scanResult) {
      const timer = setTimeout(() => setScanResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [scanResult]);

  const filteredAttendees = attendees.filter((attendee) => {
    const matchesSearch =
      attendee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      attendee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (attendee.barcode && attendee.barcode.includes(searchTerm));

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'checked_in' && attendee.checked_in) ||
      (filterStatus === 'not_checked_in' && !attendee.checked_in);

    return matchesSearch && matchesStatus;
  });

  const checkedInCount = attendees.filter(a => a.checked_in).length;
  const checkInRate = attendees.length > 0 ? Math.round((checkedInCount / attendees.length) * 100) : 0;

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
          <h2 className="text-xl font-bold text-white">Check-In & Attendees</h2>
          <p className="text-white/60 text-sm">Manage attendee check-ins with barcode/QR scanner</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncAttendees}
            disabled={syncing}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              '🔄'
            )}
            Sync
          </button>
          <button
            onClick={() => setShowScanner(!showScanner)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              showScanner
                ? 'bg-green-500 text-white'
                : 'bg-gradient-to-r from-amber-500 to-yellow-600 text-white'
            }`}
          >
            📷 {showScanner ? 'Close Scanner' : 'Open Scanner'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Total Attendees</p>
          <p className="text-2xl font-bold text-white">{attendees.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Checked In</p>
          <p className="text-2xl font-bold text-green-400">{checkedInCount}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{attendees.length - checkedInCount}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-white/60 text-sm">Check-In Rate</p>
          <p className="text-2xl font-bold text-white">{checkInRate}%</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/60 text-sm">Check-In Progress</span>
          <span className="text-white font-medium">{checkedInCount} / {attendees.length}</span>
        </div>
        <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${checkInRate}%` }}
          />
        </div>
      </div>

      {/* Scanner Section */}
      {showScanner && (
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <span className="text-2xl">📷</span>
            </div>
            <div>
              <h3 className="text-white font-medium">Barcode Scanner Mode</h3>
              <p className="text-white/60 text-sm">Scan or type barcode to check in attendees</p>
            </div>
          </div>

          <form onSubmit={handleBarcodeSubmit} className="flex gap-3">
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode or enter manually..."
              className="flex-1 px-4 py-4 bg-black/30 border-2 border-green-500/30 rounded-lg text-white text-lg font-mono focus:border-green-500 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="px-6 py-4 bg-green-500 hover:bg-green-600 rounded-lg text-white font-medium transition-colors"
            >
              Check In
            </button>
          </form>

          {/* Scan Result */}
          {scanResult && (
            <div
              className={`mt-4 p-4 rounded-lg flex items-center gap-4 ${
                scanResult.success
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-red-500/20 border border-red-500/30'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl ${
                scanResult.success ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {scanResult.success ? '✓' : '✗'}
              </div>
              <div>
                <p className={`font-medium ${scanResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {scanResult.message}
                </p>
                {scanResult.attendee && (
                  <p className="text-white/60 text-sm">
                    {scanResult.attendee.email} - {scanResult.attendee.ticket_class_name}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
            placeholder="Search by name, email, or barcode..."
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filterStatus === 'all'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('checked_in')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filterStatus === 'checked_in'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Checked In
          </button>
          <button
            onClick={() => setFilterStatus('not_checked_in')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filterStatus === 'not_checked_in'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Attendees List */}
      {filteredAttendees.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-xl">
          <div className="text-4xl mb-4">👥</div>
          <p className="text-white/60">
            {attendees.length === 0 ? 'No attendees found' : 'No matching attendees'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAttendees.map((attendee) => (
            <div
              key={attendee.id}
              className={`p-4 rounded-xl border transition-all ${
                attendee.checked_in
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-white/5 border-white/10 hover:border-amber-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      attendee.checked_in
                        ? 'bg-green-500 text-white'
                        : 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white'
                    }`}
                  >
                    {attendee.checked_in ? '✓' : attendee.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-white font-medium">{attendee.name}</p>
                    <p className="text-white/60 text-sm">{attendee.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-white/80 text-sm">{attendee.ticket_class_name}</p>
                    <p className="text-white/40 text-xs">{attendee.event_name}</p>
                  </div>

                  {attendee.checked_in ? (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                        Checked In
                      </span>
                      <button
                        onClick={() => handleUndoCheckIn(attendee.id)}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/60 text-sm transition-colors"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCheckIn(attendee.id)}
                      className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
                    >
                      Check In
                    </button>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              {attendee.checked_in && attendee.checked_in_at && (
                <div className="mt-2 pt-2 border-t border-white/10 text-white/40 text-xs">
                  Checked in at {new Date(attendee.checked_in_at).toLocaleString()}
                  {attendee.checked_in_by && ` by ${attendee.checked_in_by}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
