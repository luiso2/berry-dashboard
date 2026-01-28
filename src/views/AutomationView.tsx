// Automation View - Email/SMS Campaigns & Templates
import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../constants';

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  html_content: string;
  description: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

interface Campaign {
  id: number;
  type: 'sms' | 'email';
  recipients: string[];
  content: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface AutomationViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function AutomationView({ onToast }: AutomationViewProps) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates' | 'send'>('campaigns');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  // Form states
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject: '',
    htmlContent: '',
    description: '',
    category: 'general',
  });

  const [sendForm, setSendForm] = useState({
    type: 'email' as 'email' | 'sms',
    selectedTemplate: null as EmailTemplate | null,
    subject: '',
    message: '',
    htmlContent: '',
    selectedGuests: [] as string[],
    selectAll: false,
    scheduledAt: '',
    sendNow: true,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, campaignsRes, guestsRes] = await Promise.all([
        fetch(`${API_URL}/automation/templates`),
        fetch(`${API_URL}/automation/campaigns`),
        fetch(`${API_URL}/guest-lists`),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }

      if (guestsRes.ok) {
        const data = await guestsRes.json();
        const entries = data.entries || data.data || data || [];
        setGuests(entries.map((g: any) => ({
          id: String(g.id),
          name: g.name || '',
          email: g.email || '',
          phone: g.phone || '',
        })));
      }
    } catch (err) {
      console.error('Failed to fetch automation data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Template CRUD
  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.htmlContent) {
      onToast('Por favor completa todos los campos requeridos', 'error');
      return;
    }

    try {
      const url = editingTemplate
        ? `${API_URL}/automation/templates/${editingTemplate.id}`
        : `${API_URL}/automation/templates`;

      const res = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      });

      if (res.ok) {
        onToast(editingTemplate ? 'Template actualizado' : 'Template creado', 'success');
        fetchData();
        resetTemplateForm();
      } else {
        throw new Error('Failed to save template');
      }
    } catch (err) {
      onToast('Error al guardar template', 'error');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('¿Eliminar este template?')) return;

    try {
      await fetch(`${API_URL}/automation/templates/${id}`, { method: 'DELETE' });
      onToast('Template eliminado', 'success');
      fetchData();
    } catch (err) {
      onToast('Error al eliminar template', 'error');
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({ name: '', subject: '', htmlContent: '', description: '', category: 'general' });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setTemplateForm({
      name: template.name,
      subject: template.subject,
      htmlContent: template.html_content,
      description: template.description || '',
      category: template.category,
    });
    setEditingTemplate(template);
    setShowTemplateForm(true);
  };

  // Send/Schedule Campaign
  const handleSendCampaign = async () => {
    const recipients = sendForm.type === 'email'
      ? guests.filter(g => sendForm.selectedGuests.includes(g.id)).map(g => g.email).filter(Boolean)
      : guests.filter(g => sendForm.selectedGuests.includes(g.id)).map(g => g.phone).filter(Boolean);

    if (recipients.length === 0) {
      onToast('Selecciona al menos un destinatario', 'error');
      return;
    }

    if (sendForm.type === 'email' && (!sendForm.subject || !sendForm.htmlContent)) {
      onToast('Subject y contenido son requeridos para email', 'error');
      return;
    }

    if (sendForm.type === 'sms' && !sendForm.message) {
      onToast('Mensaje es requerido para SMS', 'error');
      return;
    }

    try {
      if (sendForm.sendNow) {
        // Send immediately
        const res = await fetch(`${API_URL}/automation/send-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: sendForm.type,
            recipients,
            message: sendForm.message,
            subject: sendForm.subject,
            htmlContent: sendForm.htmlContent,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          onToast(`Enviado: ${data.sentCount} exitosos, ${data.failedCount} fallidos`, 'success');
          resetSendForm();
          fetchData();
        } else {
          throw new Error(data.error);
        }
      } else {
        // Schedule for later
        if (!sendForm.scheduledAt) {
          onToast('Selecciona fecha y hora para programar', 'error');
          return;
        }

        const endpoint = sendForm.type === 'email'
          ? `${API_URL}/automation/email/schedule`
          : `${API_URL}/sms/schedule`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients,
            message: sendForm.message,
            subject: sendForm.subject,
            htmlContent: sendForm.htmlContent,
            scheduledAt: sendForm.scheduledAt,
          }),
        });

        if (res.ok) {
          onToast('Campaña programada exitosamente', 'success');
          resetSendForm();
          fetchData();
        } else {
          throw new Error('Failed to schedule');
        }
      }
    } catch (err) {
      onToast('Error al enviar campaña', 'error');
    }
  };

  const handleCancelCampaign = async (campaign: Campaign) => {
    try {
      const endpoint = campaign.type === 'email'
        ? `${API_URL}/automation/email/scheduled/${campaign.id}`
        : `${API_URL}/sms/scheduled/${campaign.id}`;

      await fetch(endpoint, { method: 'DELETE' });
      onToast('Campaña cancelada', 'success');
      fetchData();
    } catch (err) {
      onToast('Error al cancelar campaña', 'error');
    }
  };

  const resetSendForm = () => {
    setSendForm({
      type: 'email',
      selectedTemplate: null,
      subject: '',
      message: '',
      htmlContent: '',
      selectedGuests: [],
      selectAll: false,
      scheduledAt: '',
      sendNow: true,
    });
    setShowScheduleForm(false);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    setSendForm(prev => ({
      ...prev,
      selectedTemplate: template,
      subject: template.subject,
      htmlContent: template.html_content,
    }));
  };

  const handleToggleGuest = (guestId: string) => {
    setSendForm(prev => ({
      ...prev,
      selectedGuests: prev.selectedGuests.includes(guestId)
        ? prev.selectedGuests.filter(id => id !== guestId)
        : [...prev.selectedGuests, guestId],
    }));
  };

  const handleSelectAllGuests = () => {
    setSendForm(prev => ({
      ...prev,
      selectAll: !prev.selectAll,
      selectedGuests: !prev.selectAll ? guests.map(g => g.id) : [],
    }));
  };

  // Stats
  const stats = {
    totalCampaigns: campaigns.length,
    pendingCampaigns: campaigns.filter(c => c.status === 'pending').length,
    sentCampaigns: campaigns.filter(c => c.status === 'sent').length,
    templates: templates.length,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #222', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#666' }}>Cargando automatización...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Campañas Totales</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{stats.totalCampaigns}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Pendientes</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.pendingCampaigns}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Enviadas</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.sentCampaigns}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Templates</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d4af37' }}>{stats.templates}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['campaigns', 'templates', 'send'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'rgba(212,175,55,0.2)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(212,175,55,0.3)' : '1px solid transparent',
                padding: '10px 16px',
                borderRadius: 8,
                color: activeTab === tab ? '#d4af37' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              {tab === 'campaigns' ? '📅 Campañas' : tab === 'templates' ? '📧 Templates' : '🚀 Enviar'}
            </button>
          ))}
        </div>
        {activeTab === 'templates' && (
          <button
            onClick={() => setShowTemplateForm(true)}
            style={{ background: 'linear-gradient(to right, #d4af37, #b8922f)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            + Nuevo Template
          </button>
        )}
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contenido</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destinatarios</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Programado</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(campaign => (
                <tr key={`${campaign.type}-${campaign.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: campaign.type === 'email' ? 'rgba(139,92,246,0.2)' : 'rgba(34,197,94,0.2)',
                      color: campaign.type === 'email' ? '#8b5cf6' : '#22c55e',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {campaign.type === 'email' ? '✉️ Email' : '📱 SMS'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {campaign.content?.substring(0, 50)}...
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
                    {Array.isArray(campaign.recipients) ? campaign.recipients.length : 0}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                    {new Date(campaign.scheduled_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: campaign.status === 'sent' ? 'rgba(34,197,94,0.1)' : campaign.status === 'pending' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                      color: campaign.status === 'sent' ? '#22c55e' : campaign.status === 'pending' ? '#f59e0b' : '#ef4444',
                      border: `1px solid ${campaign.status === 'sent' ? 'rgba(34,197,94,0.15)' : campaign.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      {campaign.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {campaign.status === 'pending' && (
                      <button
                        onClick={() => handleCancelCampaign(campaign)}
                        style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    )}
                    {campaign.status === 'sent' && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                        ✓ {campaign.sent_count} enviados
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📅</div>
              <p style={{ color: 'rgba(255,255,255,0.3)' }}>No hay campañas programadas</p>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {templates.map(template => (
            <div
              key={template.id}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: 20,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#fff' }}>{template.name}</h3>
                  <span style={{
                    background: 'rgba(212,175,55,0.1)',
                    color: '#d4af37',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {template.category}
                  </span>
                </div>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: template.is_active ? '#22c55e' : '#6b7280',
                }} />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
                {template.description || 'Sin descripción'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: '0 0 16px' }}>
                <strong>Subject:</strong> {template.subject}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleSelectTemplate(template)}
                  style={{ flex: 1, background: 'linear-gradient(to right, #d4af37, #b8922f)', color: '#000', border: 'none', padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Usar Template
                </button>
                <button
                  onClick={() => handleEditTemplate(template)}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📧</div>
              <p style={{ color: 'rgba(255,255,255,0.3)' }}>No hay templates de email</p>
              <button
                onClick={() => setShowTemplateForm(true)}
                style={{ marginTop: 16, background: 'linear-gradient(to right, #d4af37, #b8922f)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Crear Primer Template
              </button>
            </div>
          )}
        </div>
      )}

      {/* Send Tab */}
      {activeTab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Left: Form */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>Componer Mensaje</h3>

            {/* Type selector */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>Tipo de Mensaje</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setSendForm(prev => ({ ...prev, type: 'email' }))}
                  style={{
                    flex: 1,
                    background: sendForm.type === 'email' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                    border: sendForm.type === 'email' ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: sendForm.type === 'email' ? '#8b5cf6' : 'rgba(255,255,255,0.4)',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  ✉️ Email
                </button>
                <button
                  onClick={() => setSendForm(prev => ({ ...prev, type: 'sms' }))}
                  style={{
                    flex: 1,
                    background: sendForm.type === 'sms' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.03)',
                    border: sendForm.type === 'sms' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: sendForm.type === 'sms' ? '#22c55e' : 'rgba(255,255,255,0.4)',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  📱 SMS
                </button>
              </div>
            </div>

            {/* Template selector for email */}
            {sendForm.type === 'email' && templates.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>Template (opcional)</label>
                <select
                  value={sendForm.selectedTemplate?.id || ''}
                  onChange={(e) => {
                    const template = templates.find(t => t.id === Number(e.target.value));
                    if (template) handleSelectTemplate(template);
                  }}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                >
                  <option value="">Sin template</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Email fields */}
            {sendForm.type === 'email' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Subject *</label>
                  <input
                    type="text"
                    value={sendForm.subject}
                    onChange={(e) => setSendForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Asunto del email"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Contenido HTML *</label>
                  <textarea
                    value={sendForm.htmlContent}
                    onChange={(e) => setSendForm(prev => ({ ...prev, htmlContent: e.target.value }))}
                    rows={6}
                    placeholder="<html>...</html>"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontFamily: 'monospace', resize: 'vertical' }}
                  />
                </div>
              </>
            )}

            {/* SMS field */}
            {sendForm.type === 'sms' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Mensaje *</label>
                <textarea
                  value={sendForm.message}
                  onChange={(e) => setSendForm(prev => ({ ...prev, message: e.target.value }))}
                  rows={4}
                  maxLength={160}
                  placeholder="Tu mensaje SMS (max 160 caracteres)"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8, resize: 'vertical' }}
                />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  {sendForm.message.length}/160 caracteres
                </div>
              </div>
            )}

            {/* Schedule options */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={sendForm.sendNow}
                  onChange={(e) => setSendForm(prev => ({ ...prev, sendNow: e.target.checked }))}
                  style={{ accentColor: '#d4af37' }}
                />
                <span style={{ fontSize: 14 }}>Enviar ahora</span>
              </label>
              {!sendForm.sendNow && (
                <input
                  type="datetime-local"
                  value={sendForm.scheduledAt}
                  onChange={(e) => setSendForm(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              )}
            </div>

            <button
              onClick={handleSendCampaign}
              disabled={sendForm.selectedGuests.length === 0}
              style={{
                width: '100%',
                background: sendForm.selectedGuests.length > 0 ? 'linear-gradient(to right, #d4af37, #b8922f)' : 'rgba(255,255,255,0.1)',
                color: sendForm.selectedGuests.length > 0 ? '#000' : 'rgba(255,255,255,0.3)',
                border: 'none',
                padding: '14px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                cursor: sendForm.selectedGuests.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {sendForm.sendNow ? '🚀 Enviar Ahora' : '📅 Programar'} ({sendForm.selectedGuests.length} destinatarios)
            </button>
          </div>

          {/* Right: Recipients */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, maxHeight: 600, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Destinatarios</h3>
              <button
                onClick={handleSelectAllGuests}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
              >
                {sendForm.selectAll ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
              {sendForm.selectedGuests.length} de {guests.length} seleccionados
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guests.map(guest => (
                <label
                  key={guest.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    background: sendForm.selectedGuests.includes(guest.id) ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                    border: sendForm.selectedGuests.includes(guest.id) ? '1px solid rgba(212,175,55,0.2)' : '1px solid rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sendForm.selectedGuests.includes(guest.id)}
                    onChange={() => handleToggleGuest(guest.id)}
                    style={{ accentColor: '#d4af37' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: '#fff', marginBottom: 2 }}>{guest.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sendForm.type === 'email' ? guest.email : guest.phone}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {guests.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>👥</div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No hay invitados disponibles</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Form Modal */}
      {showTemplateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
              {editingTemplate ? 'Editar Template' : 'Nuevo Template'}
            </h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Nombre *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="ej: VIP Invitation"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Categoría</label>
                <select
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                >
                  <option value="general">General</option>
                  <option value="invitation">Invitation</option>
                  <option value="reminder">Reminder</option>
                  <option value="followup">Follow Up</option>
                  <option value="promotion">Promotion</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Subject *</label>
                <input
                  type="text"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="Asunto del email"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Descripción</label>
                <input
                  type="text"
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Breve descripción del template"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 6 }}>Contenido HTML *</label>
                <textarea
                  value={templateForm.htmlContent}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, htmlContent: e.target.value }))}
                  rows={10}
                  placeholder="<!DOCTYPE html><html>..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontFamily: 'monospace', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={resetTemplateForm}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTemplate}
                style={{ flex: 1, background: 'linear-gradient(to right, #d4af37, #b8922f)', color: '#000', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                {editingTemplate ? 'Actualizar' : 'Crear'} Template
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
