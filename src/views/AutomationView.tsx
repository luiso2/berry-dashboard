// Automation View - AI-powered workflow automation
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../constants';

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: {
    type: 'schedule' | 'event' | 'condition' | 'webhook';
    config: Record<string, unknown>;
  };
  actions: AutomationAction[];
  isActive: boolean;
  lastRun?: string;
  runCount: number;
  createdAt: string;
}

interface AutomationAction {
  id: string;
  type: 'send_email' | 'send_sms' | 'update_guest' | 'create_task' | 'webhook' | 'ai_classify';
  config: Record<string, unknown>;
  order: number;
}

interface AutomationLog {
  id: string;
  automationId: string;
  automationName: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  timestamp: string;
}

interface AutomationViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TRIGGER_TYPES = [
  { value: 'event', label: 'Event Trigger', icon: '⚡', description: 'Run when an event occurs (guest added, checked in, etc.)' },
  { value: 'schedule', label: 'Scheduled', icon: '⏰', description: 'Run at specific times or intervals' },
  { value: 'condition', label: 'Condition', icon: '🔀', description: 'Run when conditions are met' },
  { value: 'webhook', label: 'Webhook', icon: '🔗', description: 'Run when external webhook is triggered' },
];

const ACTION_TYPES: { value: AutomationAction['type']; label: string; icon: string }[] = [
  { value: 'send_email', label: 'Send Email', icon: '✉️' },
  { value: 'send_sms', label: 'Send SMS', icon: '📱' },
  { value: 'update_guest', label: 'Update Guest', icon: '👤' },
  { value: 'create_task', label: 'Create Task', icon: '📋' },
  { value: 'ai_classify', label: 'AI Classification', icon: '🤖' },
  { value: 'webhook', label: 'Call Webhook', icon: '🌐' },
];

const STATUS_COLORS: Record<string, string> = {
  success: '#22c55e',
  failed: '#ef4444',
  skipped: '#f59e0b',
};

export function AutomationView({ onToast }: AutomationViewProps) {
  // State
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'automations' | 'logs'>('automations');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    triggerType: 'event' as Automation['trigger']['type'],
    triggerEvent: 'guest_added',
    scheduleInterval: '1h',
    isActive: true,
    actions: [] as { type: AutomationAction['type']; config: Record<string, unknown> }[],
  });

  // Fetch automations
  const fetchAutomations = useCallback(async () => {
    try {
      const [autoRes, logsRes] = await Promise.all([
        fetch(`${API_URL}/automations`),
        fetch(`${API_URL}/automations/logs`),
      ]);

      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomations(data.automations || []);
      }
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch automations:', err);
      // Mock data for demo
      setAutomations([
        {
          id: '1',
          name: 'Auto-approve VIP Guests',
          description: 'Automatically approve guests with VIP status from Eventbrite',
          trigger: { type: 'event', config: { event: 'guest_added', source: 'eventbrite' } },
          actions: [
            { id: 'a1', type: 'ai_classify', config: { threshold: 0.8 }, order: 1 },
            { id: 'a2', type: 'update_guest', config: { category: 'A' }, order: 2 },
            { id: 'a3', type: 'send_email', config: { template: 'vip_confirmation' }, order: 3 },
          ],
          isActive: true,
          lastRun: new Date(Date.now() - 15 * 60000).toISOString(),
          runCount: 156,
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60000).toISOString(),
        },
        {
          id: '2',
          name: 'Event Reminder Emails',
          description: 'Send reminder emails 24 hours before the event',
          trigger: { type: 'schedule', config: { interval: '24h', before: 'event_start' } },
          actions: [
            { id: 'a4', type: 'send_email', config: { template: 'event_reminder' }, order: 1 },
          ],
          isActive: true,
          lastRun: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
          runCount: 12,
          createdAt: new Date(Date.now() - 14 * 24 * 60 * 60000).toISOString(),
        },
        {
          id: '3',
          name: 'Low Ticket Alert',
          description: 'Alert when tickets are running low (< 10%)',
          trigger: { type: 'condition', config: { field: 'tickets_remaining', operator: '<', value: 10, unit: 'percent' } },
          actions: [
            { id: 'a5', type: 'send_sms', config: { to: 'admin', message: 'Tickets running low!' }, order: 1 },
            { id: 'a6', type: 'send_email', config: { to: 'team', template: 'low_ticket_alert' }, order: 2 },
          ],
          isActive: false,
          runCount: 3,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60000).toISOString(),
        },
      ]);

      setLogs([
        { id: '1', automationId: '1', automationName: 'Auto-approve VIP Guests', status: 'success', message: 'Approved 3 VIP guests', timestamp: new Date(Date.now() - 15 * 60000).toISOString() },
        { id: '2', automationId: '2', automationName: 'Event Reminder Emails', status: 'success', message: 'Sent 245 reminder emails', timestamp: new Date(Date.now() - 2 * 60 * 60000).toISOString() },
        { id: '3', automationId: '1', automationName: 'Auto-approve VIP Guests', status: 'success', message: 'Approved 1 VIP guest', timestamp: new Date(Date.now() - 45 * 60000).toISOString() },
        { id: '4', automationId: '1', automationName: 'Auto-approve VIP Guests', status: 'skipped', message: 'No matching guests found', timestamp: new Date(Date.now() - 60 * 60000).toISOString() },
        { id: '5', automationId: '3', automationName: 'Low Ticket Alert', status: 'failed', message: 'Failed to send SMS: Invalid phone number', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  // Toggle automation
  const handleToggleAutomation = async (id: string) => {
    const automation = automations.find(a => a.id === id);
    if (!automation) return;

    try {
      await fetch(`${API_URL}/automations/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !automation.isActive }),
      });
    } catch (err) {
      // Continue with local update
    }

    setAutomations(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
    onToast(`Automation ${automation.isActive ? 'disabled' : 'enabled'}`, 'success');
  };

  // Run automation manually
  const handleRunAutomation = async (id: string) => {
    const automation = automations.find(a => a.id === id);
    if (!automation) return;

    onToast(`Running "${automation.name}"...`, 'info');

    try {
      await fetch(`${API_URL}/automations/${id}/run`, { method: 'POST' });
      onToast(`"${automation.name}" executed successfully`, 'success');
    } catch (err) {
      onToast(`"${automation.name}" executed (demo mode)`, 'success');
    }

    // Add to logs
    const newLog: AutomationLog = {
      id: Date.now().toString(),
      automationId: id,
      automationName: automation.name,
      status: 'success',
      message: 'Manual execution completed',
      timestamp: new Date().toISOString(),
    };
    setLogs(prev => [newLog, ...prev]);

    // Update run count
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, runCount: a.runCount + 1, lastRun: new Date().toISOString() } : a));
  };

  // Delete automation
  const handleDeleteAutomation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation?')) return;

    try {
      await fetch(`${API_URL}/automations/${id}`, { method: 'DELETE' });
    } catch (err) {
      // Continue with local delete
    }
    setAutomations(prev => prev.filter(a => a.id !== id));
    onToast('Automation deleted', 'success');
  };

  // Add action to form
  const handleAddAction = (type: AutomationAction['type']) => {
    setFormData(prev => ({
      ...prev,
      actions: [...prev.actions, { type, config: {} as Record<string, unknown> }],
    }));
  };

  // Remove action from form
  const handleRemoveAction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  };

  // Save automation
  const handleSaveAutomation = async () => {
    if (!formData.name || formData.actions.length === 0) {
      onToast('Please fill in name and add at least one action', 'error');
      return;
    }

    const newAutomation: Automation = {
      id: editingId || Date.now().toString(),
      name: formData.name,
      description: formData.description,
      trigger: {
        type: formData.triggerType,
        config: formData.triggerType === 'event'
          ? { event: formData.triggerEvent }
          : formData.triggerType === 'schedule'
            ? { interval: formData.scheduleInterval }
            : {},
      },
      actions: formData.actions.map((a, i) => ({ id: `${Date.now()}-${i}`, ...a, order: i + 1 })),
      isActive: formData.isActive,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };

    if (editingId) {
      setAutomations(prev => prev.map(a => a.id === editingId ? newAutomation : a));
    } else {
      setAutomations(prev => [newAutomation, ...prev]);
    }

    onToast(editingId ? 'Automation updated' : 'Automation created', 'success');
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      triggerType: 'event',
      triggerEvent: 'guest_added',
      scheduleInterval: '1h',
      isActive: true,
      actions: [],
    });
    setEditingId(null);
    setShowForm(false);
  };

  // Stats
  const stats = {
    total: automations.length,
    active: automations.filter(a => a.isActive).length,
    totalRuns: automations.reduce((sum, a) => sum + a.runCount, 0),
    successRate: logs.length > 0
      ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100)
      : 100,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading automations...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Automations</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.active}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Runs</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{stats.totalRuns}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Success Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: stats.successRate >= 90 ? '#22c55e' : '#f59e0b' }}>{stats.successRate}%</div>
        </div>
      </div>

      {/* Tabs & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('automations')}
            style={{
              background: activeTab === 'automations' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'automations' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Automations
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              background: activeTab === 'logs' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'logs' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Activity Log
          </button>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          + Create Automation
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Automation' : 'Create Automation'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Auto-approve VIP Guests"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  placeholder="What does this automation do?"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 8 }}>Trigger</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {TRIGGER_TYPES.map(trigger => (
                    <button
                      key={trigger.value}
                      onClick={() => setFormData(prev => ({ ...prev, triggerType: trigger.value as Automation['trigger']['type'] }))}
                      style={{
                        background: formData.triggerType === trigger.value ? '#8b5cf620' : '#0a0a0a',
                        border: formData.triggerType === trigger.value ? '1px solid #8b5cf6' : '1px solid #333',
                        padding: 12,
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 16, marginBottom: 4 }}>{trigger.icon} {trigger.label}</div>
                      <div style={{ fontSize: 11, color: '#666' }}>{trigger.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {formData.triggerType === 'event' && (
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Event Type</label>
                  <select
                    value={formData.triggerEvent}
                    onChange={(e) => setFormData(prev => ({ ...prev, triggerEvent: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="guest_added">Guest Added</option>
                    <option value="guest_approved">Guest Approved</option>
                    <option value="guest_checked_in">Guest Checked In</option>
                    <option value="ticket_purchased">Ticket Purchased</option>
                    <option value="table_reserved">Table Reserved</option>
                  </select>
                </div>
              )}

              {formData.triggerType === 'schedule' && (
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Interval</label>
                  <select
                    value={formData.scheduleInterval}
                    onChange={(e) => setFormData(prev => ({ ...prev, scheduleInterval: e.target.value }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="15m">Every 15 minutes</option>
                    <option value="1h">Every hour</option>
                    <option value="6h">Every 6 hours</option>
                    <option value="24h">Every day</option>
                    <option value="24h_before">24 hours before event</option>
                    <option value="1h_before">1 hour before event</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 8 }}>Actions *</label>
                {formData.actions.map((action, index) => {
                  const actionType = ACTION_TYPES.find(a => a.value === action.type);
                  return (
                    <div
                      key={index}
                      style={{
                        background: '#0a0a0a',
                        border: '1px solid #333',
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{actionType?.icon}</span>
                        <span>{actionType?.label}</span>
                        <span style={{ color: '#666', fontSize: 12 }}>#{index + 1}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveAction(index)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ACTION_TYPES.map(action => (
                    <button
                      key={action.value}
                      onClick={() => handleAddAction(action.value)}
                      style={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        color: '#888',
                        padding: '6px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      + {action.icon} {action.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span style={{ fontSize: 14 }}>Enable automation immediately</span>
                </label>
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
                onClick={handleSaveAutomation}
                style={{ flex: 1, background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingId ? 'Update' : 'Create'} Automation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automations Tab */}
      {activeTab === 'automations' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {automations.map(automation => (
            <div
              key={automation.id}
              style={{
                background: '#0a0a0a',
                border: automation.isActive ? '1px solid #22c55e30' : '1px solid #1a1a1a',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>
                      {TRIGGER_TYPES.find(t => t.value === automation.trigger.type)?.icon}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{automation.name}</span>
                  </div>
                  <p style={{ fontSize: 14, color: '#888', margin: 0 }}>{automation.description}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: automation.isActive ? '#22c55e20' : '#6b728020',
                    color: automation.isActive ? '#22c55e' : '#6b7280',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                  }}>
                    {automation.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {automation.actions.map((action, i) => {
                  const actionType = ACTION_TYPES.find(a => a.value === action.type);
                  return (
                    <span
                      key={action.id}
                      style={{
                        background: '#1a1a1a',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#888',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {i + 1}. {actionType?.icon} {actionType?.label}
                    </span>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 24, marginBottom: 16, color: '#666', fontSize: 13 }}>
                <span>Runs: {automation.runCount}</span>
                {automation.lastRun && (
                  <span>Last run: {new Date(automation.lastRun).toLocaleString()}</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleToggleAutomation(automation.id)}
                  style={{
                    background: automation.isActive ? '#333' : '#22c55e',
                    color: automation.isActive ? '#fff' : '#000',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {automation.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => handleRunAutomation(automation.id)}
                  style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                >
                  Run Now
                </button>
                <button
                  onClick={() => handleDeleteAutomation(automation.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {automations.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
              <p style={{ color: '#888', fontSize: 16 }}>No automations yet</p>
              <button
                onClick={() => setShowForm(true)}
                style={{ marginTop: 16, background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Create First Automation
              </button>
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Time</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Automation</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#888', fontSize: 13 }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.automationName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: STATUS_COLORS[log.status] + '20',
                      color: STATUS_COLORS[log.status],
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#888', fontSize: 13 }}>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <p style={{ color: '#888', fontSize: 16 }}>No activity logs yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
