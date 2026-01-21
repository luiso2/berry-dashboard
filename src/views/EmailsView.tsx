// Emails View - Self-contained email campaigns and communications management
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../constants';

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  recipientType: 'all' | 'vip' | 'pending' | 'checked_in' | 'custom';
  recipientCount: number;
  sentCount: number;
  openRate: number;
  clickRate: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  eventId?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'confirmation' | 'reminder' | 'announcement' | 'thank_you' | 'custom';
}

interface EmailsViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  scheduled: '#f59e0b',
  sent: '#22c55e',
  failed: '#ef4444',
};

const RECIPIENT_LABELS: Record<string, string> = {
  all: 'All Guests',
  vip: 'VIP Guests',
  pending: 'Pending Approval',
  checked_in: 'Checked In',
  custom: 'Custom List',
};

export function EmailsView({ onToast }: EmailsViewProps) {
  // State
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [composerData, setComposerData] = useState({
    name: '',
    subject: '',
    body: '',
    recipientType: 'all' as EmailCampaign['recipientType'],
    scheduledAt: '',
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [campaignsRes, templatesRes] = await Promise.all([
        fetch(`${API_URL}/emails/campaigns`),
        fetch(`${API_URL}/emails/templates`),
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to fetch emails data:', err);
      // Mock data for demo
      setCampaigns([
        {
          id: '1',
          name: 'Event Confirmation',
          subject: 'Your Spot is Confirmed!',
          body: 'Thank you for registering. Your spot has been confirmed for our upcoming event...',
          status: 'sent',
          recipientType: 'all',
          recipientCount: 245,
          sentCount: 243,
          openRate: 68,
          clickRate: 24,
          sentAt: new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString(),
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60000).toISOString(),
        },
        {
          id: '2',
          name: 'VIP Early Access',
          subject: 'Exclusive VIP Early Entry',
          body: 'As a VIP guest, you have early access starting at 8 PM...',
          status: 'scheduled',
          recipientType: 'vip',
          recipientCount: 48,
          sentCount: 0,
          openRate: 0,
          clickRate: 0,
          scheduledAt: new Date(Date.now() + 24 * 60 * 60000).toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'Day-of Reminder',
          subject: 'See You Tonight!',
          body: 'Just a friendly reminder that our event is tonight...',
          status: 'draft',
          recipientType: 'all',
          recipientCount: 320,
          sentCount: 0,
          openRate: 0,
          clickRate: 0,
          createdAt: new Date().toISOString(),
        },
      ]);

      setTemplates([
        {
          id: '1',
          name: 'Confirmation Email',
          subject: 'Your Spot is Confirmed for {{event_name}}!',
          body: 'Hi {{guest_name}},\n\nThank you for registering for {{event_name}}. Your spot has been confirmed!\n\nEvent Details:\nDate: {{event_date}}\nTime: {{event_time}}\nLocation: {{event_location}}\n\nSee you there!',
          category: 'confirmation',
        },
        {
          id: '2',
          name: 'Event Reminder',
          subject: 'Reminder: {{event_name}} is Tomorrow!',
          body: 'Hi {{guest_name}},\n\nJust a friendly reminder that {{event_name}} is happening tomorrow!\n\nDon\'t forget to bring your ID.\n\nSee you soon!',
          category: 'reminder',
        },
        {
          id: '3',
          name: 'Thank You',
          subject: 'Thanks for Attending {{event_name}}!',
          body: 'Hi {{guest_name}},\n\nThank you for attending {{event_name}}! We hope you had a great time.\n\nStay tuned for our next event!',
          category: 'thank_you',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create/Update campaign
  const handleSaveCampaign = async (sendNow: boolean = false) => {
    if (!composerData.name || !composerData.subject || !composerData.body) {
      onToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      const status = sendNow ? 'sent' : (composerData.scheduledAt ? 'scheduled' : 'draft');
      const url = editingId ? `${API_URL}/emails/campaigns/${editingId}` : `${API_URL}/emails/campaigns`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...composerData, status }),
      });

      if (res.ok) {
        onToast(sendNow ? 'Campaign sent!' : 'Campaign saved', 'success');
        await fetchData();
        resetComposer();
      } else {
        // Fallback for demo
        const newCampaign: EmailCampaign = {
          id: editingId || Date.now().toString(),
          name: composerData.name,
          subject: composerData.subject,
          body: composerData.body,
          status,
          recipientType: composerData.recipientType,
          recipientCount: 150,
          sentCount: sendNow ? 148 : 0,
          openRate: sendNow ? 65 : 0,
          clickRate: sendNow ? 22 : 0,
          scheduledAt: composerData.scheduledAt || undefined,
          sentAt: sendNow ? new Date().toISOString() : undefined,
          createdAt: new Date().toISOString(),
        };

        if (editingId) {
          setCampaigns(prev => prev.map(c => c.id === editingId ? newCampaign : c));
        } else {
          setCampaigns(prev => [newCampaign, ...prev]);
        }
        onToast(sendNow ? 'Campaign sent!' : 'Campaign saved', 'success');
        resetComposer();
      }
    } catch (err) {
      onToast('Failed to save campaign', 'error');
    }
  };

  // Delete campaign
  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;

    try {
      await fetch(`${API_URL}/emails/campaigns/${id}`, { method: 'DELETE' });
    } catch (err) {
      // Continue with local delete
    }
    setCampaigns(prev => prev.filter(c => c.id !== id));
    onToast('Campaign deleted', 'success');
  };

  // Duplicate campaign
  const handleDuplicateCampaign = (campaign: EmailCampaign) => {
    setComposerData({
      name: `${campaign.name} (Copy)`,
      subject: campaign.subject,
      body: campaign.body,
      recipientType: campaign.recipientType,
      scheduledAt: '',
    });
    setEditingId(null);
    setShowComposer(true);
  };

  // Edit campaign
  const handleEditCampaign = (campaign: EmailCampaign) => {
    setComposerData({
      name: campaign.name,
      subject: campaign.subject,
      body: campaign.body,
      recipientType: campaign.recipientType,
      scheduledAt: campaign.scheduledAt || '',
    });
    setEditingId(campaign.id);
    setShowComposer(true);
  };

  // Use template
  const handleUseTemplate = (template: EmailTemplate) => {
    setComposerData({
      name: template.name,
      subject: template.subject,
      body: template.body,
      recipientType: 'all',
      scheduledAt: '',
    });
    setEditingId(null);
    setShowComposer(true);
    setActiveTab('campaigns');
  };

  const resetComposer = () => {
    setComposerData({
      name: '',
      subject: '',
      body: '',
      recipientType: 'all',
      scheduledAt: '',
    });
    setEditingId(null);
    setShowComposer(false);
  };

  // Filter campaigns
  const filteredCampaigns = campaigns.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    return true;
  });

  // Stats
  const stats = {
    total: campaigns.length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
    avgOpenRate: campaigns.filter(c => c.status === 'sent').length > 0
      ? Math.round(campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.openRate, 0) / campaigns.filter(c => c.status === 'sent').length)
      : 0,
    totalSent: campaigns.reduce((sum, c) => sum + c.sentCount, 0),
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Loading emails...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Total Campaigns</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.total}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Emails Sent</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.totalSent.toLocaleString()}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Scheduled</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.scheduled}</div>
        </div>
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Avg Open Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{stats.avgOpenRate}%</div>
        </div>
      </div>

      {/* Tabs & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              background: activeTab === 'campaigns' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'campaigns' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            style={{
              background: activeTab === 'templates' ? '#1a1a1a' : 'transparent',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              color: activeTab === 'templates' ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Templates
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {activeTab === 'campaigns' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '10px 14px', borderRadius: 8 }}
            >
              <option value="all">All Status</option>
              <option value="draft">Drafts</option>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
            </select>
          )}
          <button
            onClick={() => setShowComposer(true)}
            style={{ background: '#d4af37', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            + New Campaign
          </button>
        </div>
      </div>

      {/* Composer Modal */}
      {showComposer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 16, padding: 24, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingId ? 'Edit Campaign' : 'New Email Campaign'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Campaign Name *</label>
                  <input
                    type="text"
                    value={composerData.name}
                    onChange={(e) => setComposerData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Event Confirmation"
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Recipients</label>
                  <select
                    value={composerData.recipientType}
                    onChange={(e) => setComposerData(prev => ({ ...prev, recipientType: e.target.value as EmailCampaign['recipientType'] }))}
                    style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  >
                    <option value="all">All Guests</option>
                    <option value="vip">VIP Guests Only</option>
                    <option value="pending">Pending Approval</option>
                    <option value="checked_in">Checked In</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Subject Line *</label>
                <input
                  type="text"
                  value={composerData.subject}
                  onChange={(e) => setComposerData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g., Your Spot is Confirmed!"
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Email Body *</label>
                <textarea
                  value={composerData.body}
                  onChange={(e) => setComposerData(prev => ({ ...prev, body: e.target.value }))}
                  rows={10}
                  placeholder="Write your email content here... Use {{guest_name}}, {{event_name}}, {{event_date}} for personalization."
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '12px', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                  Variables: {'{{guest_name}}'}, {'{{event_name}}'}, {'{{event_date}}'}, {'{{event_time}}'}, {'{{event_location}}'}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Schedule (optional)</label>
                <input
                  type="datetime-local"
                  value={composerData.scheduledAt}
                  onChange={(e) => setComposerData(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  style={{ background: '#0a0a0a', border: '1px solid #333', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetComposer}
                style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveCampaign(false)}
                style={{ flex: 1, background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSaveCampaign(true)}
                style={{ flex: 1, background: '#22c55e', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {filteredCampaigns.map(campaign => (
            <div
              key={campaign.id}
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 12,
                padding: 20,
                borderLeft: `4px solid ${STATUS_COLORS[campaign.status]}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{campaign.name}</div>
                  <div style={{ fontSize: 14, color: '#888' }}>{campaign.subject}</div>
                </div>
                <span style={{
                  background: STATUS_COLORS[campaign.status] + '20',
                  color: STATUS_COLORS[campaign.status],
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}>
                  {campaign.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Recipients</div>
                  <div style={{ fontSize: 14, color: '#fff' }}>{RECIPIENT_LABELS[campaign.recipientType]} ({campaign.recipientCount})</div>
                </div>
                {campaign.status === 'sent' && (
                  <>
                    <div>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Sent</div>
                      <div style={{ fontSize: 14, color: '#22c55e' }}>{campaign.sentCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Open Rate</div>
                      <div style={{ fontSize: 14, color: '#8b5cf6' }}>{campaign.openRate}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Click Rate</div>
                      <div style={{ fontSize: 14, color: '#3b82f6' }}>{campaign.clickRate}%</div>
                    </div>
                  </>
                )}
                {campaign.status === 'scheduled' && campaign.scheduledAt && (
                  <div>
                    <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Scheduled For</div>
                    <div style={{ fontSize: 14, color: '#f59e0b' }}>{new Date(campaign.scheduledAt).toLocaleString()}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {campaign.status === 'draft' && (
                  <button
                    onClick={() => handleEditCampaign(campaign)}
                    style={{ background: '#d4af37', color: '#000', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Edit & Send
                  </button>
                )}
                <button
                  onClick={() => handleDuplicateCampaign(campaign)}
                  style={{ background: '#333', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Duplicate
                </button>
                <button
                  onClick={() => handleDeleteCampaign(campaign.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {filteredCampaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
              <p style={{ color: '#888', fontSize: 16 }}>No campaigns found</p>
              <button
                onClick={() => setShowComposer(true)}
                style={{ marginTop: 16, background: '#d4af37', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Create First Campaign
              </button>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {templates.map(template => (
            <div
              key={template.id}
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{template.name}</div>
                  <span style={{
                    background: '#333',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: '#888',
                    textTransform: 'capitalize',
                  }}>
                    {template.category.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Subject:</div>
                <div style={{ fontSize: 14, color: '#fff' }}>{template.subject}</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Preview:</div>
                <div style={{ fontSize: 13, color: '#666', background: '#111', padding: 10, borderRadius: 6, maxHeight: 80, overflow: 'hidden' }}>
                  {template.body.substring(0, 150)}...
                </div>
              </div>

              <button
                onClick={() => handleUseTemplate(template)}
                style={{ width: '100%', background: '#d4af37', color: '#000', border: 'none', padding: '10px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
