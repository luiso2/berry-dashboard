import { useState, useEffect, useCallback } from 'react';
import type { EventbriteAlert, EventbriteAlertNotification, EventbriteEventMetrics } from '../../types';
import { API_URL } from '../../constants';

interface AlertsManagerProps {
  events: EventbriteEventMetrics[];
  onNotificationCount?: (count: number) => void;
}

const ALERT_TYPES = [
  { value: 'sales_threshold', label: 'Sales Threshold', description: 'Alert when sales reach a specific number' },
  { value: 'low_inventory', label: 'Low Inventory', description: 'Alert when tickets remaining fall below threshold' },
  { value: 'refund_spike', label: 'Refund Spike', description: 'Alert when refunds exceed a certain amount' },
  { value: 'check_in_rate', label: 'Check-in Rate', description: 'Alert based on check-in percentage' },
  { value: 'revenue_goal', label: 'Revenue Goal', description: 'Alert when revenue reaches target' },
  { value: 'daily_sales', label: 'Daily Sales', description: 'Alert on daily sales performance' },
  { value: 'conversion_drop', label: 'Conversion Drop', description: 'Alert when conversion rate drops' },
];

const OPERATORS = [
  { value: 'gte', label: '>= (Greater or Equal)' },
  { value: 'gt', label: '> (Greater Than)' },
  { value: 'lte', label: '<= (Less or Equal)' },
  { value: 'lt', label: '< (Less Than)' },
  { value: 'eq', label: '= (Equal)' },
];

export function AlertsManager({ events, onNotificationCount }: AlertsManagerProps) {
  const [alerts, setAlerts] = useState<EventbriteAlert[]>([]);
  const [notifications, setNotifications] = useState<EventbriteAlertNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<EventbriteAlert | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'notifications'>('alerts');

  // Form state
  const [formData, setFormData] = useState({
    event_id: '',
    alert_type: 'sales_threshold',
    threshold_value: 100,
    threshold_operator: 'gte',
    notification_channels: ['dashboard'] as string[],
  });

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/notifications`, { headers });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        const unreadCount = data.filter((n: EventbriteAlertNotification) => !n.is_read).length;
        onNotificationCount?.(unreadCount);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [onNotificationCount]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAlerts(), fetchNotifications()]);
      setLoading(false);
    };
    loadData();
  }, [fetchAlerts, fetchNotifications]);

  const handleCreateAlert = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchAlerts();
        setShowCreateModal(false);
        resetForm();
      }
    } catch (err) {
      console.error('Error creating alert:', err);
    }
  };

  const handleUpdateAlert = async () => {
    if (!editingAlert) return;
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts/${editingAlert.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchAlerts();
        setEditingAlert(null);
        resetForm();
      }
    } catch (err) {
      console.error('Error updating alert:', err);
    }
  };

  const handleDeleteAlert = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert?')) return;
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        await fetchAlerts();
      }
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  const handleToggleAlert = async (alert: EventbriteAlert) => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts/${alert.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: !alert.is_active }),
      });
      if (res.ok) {
        await fetchAlerts();
      }
    } catch (err) {
      console.error('Error toggling alert:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/notifications/read`, {
        method: 'PUT',
        headers,
      });
      if (res.ok) {
        await fetchNotifications();
      }
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  const handleTriggerAlerts = async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/eventbrite/alerts/trigger`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchNotifications();
      }
    } catch (err) {
      console.error('Error triggering alerts:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      event_id: '',
      alert_type: 'sales_threshold',
      threshold_value: 100,
      threshold_operator: 'gte',
      notification_channels: ['dashboard'],
    });
  };

  const openEditModal = (alert: EventbriteAlert) => {
    setEditingAlert(alert);
    setFormData({
      event_id: alert.event_id || '',
      alert_type: alert.alert_type,
      threshold_value: alert.threshold_value,
      threshold_operator: alert.threshold_operator,
      notification_channels: alert.notification_channels,
    });
  };

  const getAlertTypeLabel = (type: string) => {
    return ALERT_TYPES.find(t => t.value === type)?.label || type;
  };

  const getOperatorLabel = (op: string) => {
    return OPERATORS.find(o => o.value === op)?.label || op;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Smart Alerts</h2>
          <p className="text-white/60 text-sm">Get notified about important Eventbrite metrics</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTriggerAlerts}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
          >
            Check Alerts Now
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Create Alert
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'alerts'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
            activeTab === 'notifications'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Notifications
          {notifications.filter(n => !n.is_read).length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">
              {notifications.filter(n => !n.is_read).length}
            </span>
          )}
        </button>
      </div>

      {/* Alerts List */}
      {activeTab === 'alerts' && (
        <div className="grid gap-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <div className="text-4xl mb-4">🔔</div>
              <p className="text-white/60">No alerts configured yet</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
              >
                Create your first alert
              </button>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border transition-colors ${
                  alert.is_active
                    ? 'bg-white/5 border-white/10'
                    : 'bg-white/[0.02] border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        alert.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {alert.is_active ? 'Active' : 'Paused'}
                      </span>
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                        {getAlertTypeLabel(alert.alert_type)}
                      </span>
                    </div>
                    <p className="text-white font-medium">
                      {alert.event_name || 'All Events'}: {getAlertTypeLabel(alert.alert_type)} {getOperatorLabel(alert.threshold_operator)} {alert.threshold_value}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-white/60">
                      <span>Channels: {alert.notification_channels.join(', ')}</span>
                      <span>Triggered: {alert.trigger_count} times</span>
                      {alert.last_triggered_at && (
                        <span>Last: {formatDate(alert.last_triggered_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAlert(alert)}
                      className={`p-2 rounded-lg transition-colors ${
                        alert.is_active
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                      title={alert.is_active ? 'Pause alert' : 'Activate alert'}
                    >
                      {alert.is_active ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => openEditModal(alert)}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/60 hover:text-white transition-colors"
                      title="Edit alert"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteAlert(alert.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                      title="Delete alert"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Notifications List */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {notifications.filter(n => !n.is_read).length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleMarkAllRead}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/60 text-sm transition-colors"
              >
                Mark all as read
              </button>
            </div>
          )}
          {notifications.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-white/60">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-xl border transition-colors ${
                  notification.is_read
                    ? 'bg-white/[0.02] border-white/5'
                    : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-2xl">
                    {notification.alert_type === 'sales_threshold' && '📈'}
                    {notification.alert_type === 'low_inventory' && '⚠️'}
                    {notification.alert_type === 'refund_spike' && '🔴'}
                    {notification.alert_type === 'revenue_goal' && '🎯'}
                    {notification.alert_type === 'check_in_rate' && '✅'}
                    {notification.alert_type === 'daily_sales' && '📊'}
                    {notification.alert_type === 'conversion_drop' && '📉'}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{notification.title}</p>
                    <p className="text-white/60 text-sm mt-1">{notification.message}</p>
                    <p className="text-white/40 text-xs mt-2">{formatDate(notification.created_at)}</p>
                  </div>
                  {!notification.is_read && (
                    <span className="w-2 h-2 bg-amber-500 rounded-full" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingAlert) && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-6">
              {editingAlert ? 'Edit Alert' : 'Create New Alert'}
            </h3>

            <div className="space-y-4">
              {/* Event Selection */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Event (optional)</label>
                <select
                  value={formData.event_id}
                  onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="">All Events</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Alert Type */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Alert Type</label>
                <select
                  value={formData.alert_type}
                  onChange={(e) => setFormData({ ...formData, alert_type: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                >
                  {ALERT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <p className="text-white/40 text-xs mt-1">
                  {ALERT_TYPES.find(t => t.value === formData.alert_type)?.description}
                </p>
              </div>

              {/* Threshold */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/80 text-sm mb-2">Operator</label>
                  <select
                    value={formData.threshold_operator}
                    onChange={(e) => setFormData({ ...formData, threshold_operator: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/80 text-sm mb-2">Threshold Value</label>
                  <input
                    type="number"
                    value={formData.threshold_value}
                    onChange={(e) => setFormData({ ...formData, threshold_value: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Notification Channels */}
              <div>
                <label className="block text-white/80 text-sm mb-2">Notification Channels</label>
                <div className="flex gap-3">
                  {['dashboard', 'email', 'sms'].map((channel) => (
                    <label key={channel} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.notification_channels.includes(channel)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              notification_channels: [...formData.notification_channels, channel],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              notification_channels: formData.notification_channels.filter(c => c !== channel),
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-white/80 text-sm capitalize">{channel}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingAlert(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingAlert ? handleUpdateAlert : handleCreateAlert}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
              >
                {editingAlert ? 'Update Alert' : 'Create Alert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
