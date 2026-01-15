// IntegrationsView - External integrations management

import { useEffect } from 'react';
import { useIntegrations } from '../hooks/useIntegrations';
import { API_URL } from '../constants';

interface IntegrationsViewProps {
  userId?: string;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onOpenSmsModal: () => void;
  onRefreshTickets?: () => void;
  onRefreshEvents?: () => void;
}

export function IntegrationsView({
  userId,
  onToast,
  onOpenSmsModal,
  onRefreshTickets,
  onRefreshEvents,
}: IntegrationsViewProps) {
  const {
    integrations,
    selectedIntegration,
    integrationFormData,
    integrationLoading,
    mailchimpAudiences,
    fetchIntegrations,
    saveIntegrationConfig,
    testIntegration,
    syncIntegration,
    disconnectIntegration,
    fetchMailchimpAudiences,
    setSelectedIntegration,
    setIntegrationFormData,
  } = useIntegrations({
    userId,
    onToast,
    onRefreshTickets,
    onRefreshEvents,
  });

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Integrations</h2>
        <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
          Connect external services to sync tickets, guests, and send campaigns
        </p>
      </div>

      {/* Integration Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 20 }}>
        {integrations.map((integration) => (
          <div
            key={integration.provider}
            style={{
              background: '#0a0a0a',
              border: `1px solid ${integration.status === 'connected' ? integration.color + '40' : '#1a1a1a'}`,
              borderRadius: 12,
              padding: 20,
              transition: 'all 0.2s',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{integration.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{integration.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{integration.description}</div>
                </div>
              </div>
              <span
                style={{
                  background:
                    integration.status === 'connected'
                      ? '#22c55e20'
                      : integration.status === 'pending'
                        ? '#f59e0b20'
                        : integration.status === 'error'
                          ? '#ef444420'
                          : '#1a1a1a',
                  color:
                    integration.status === 'connected'
                      ? '#22c55e'
                      : integration.status === 'pending'
                        ? '#f59e0b'
                        : integration.status === 'error'
                          ? '#ef4444'
                          : '#666',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {integration.status}
              </span>
            </div>

            {/* Last Sync Info */}
            {integration.lastSync && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                Last synced: {new Date(integration.lastSync).toLocaleString()}
              </div>
            )}

            {/* Error Message */}
            {integration.lastError && integration.status === 'error' && (
              <div
                style={{
                  background: '#ef444420',
                  border: '1px solid #ef444440',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 12,
                  fontSize: 12,
                  color: '#fca5a5',
                }}
              >
                {integration.lastError}
              </div>
            )}

            {/* Connected Eventbrite User Info */}
            {integration.provider === 'eventbrite' && integration.status === 'connected' && integration.connectedUser && (
              <div
                style={{
                  background: '#22c55e10',
                  border: '1px solid #22c55e30',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>Connected Account</div>
                <div style={{ fontSize: 14, color: '#fff' }}>{integration.connectedUser.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{integration.connectedUser.email}</div>
              </div>
            )}

            {/* Eventbrite OAuth - Special handling */}
            {integration.provider === 'eventbrite' && integration.status !== 'connected' && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={() => {
                    window.location.href = `${API_URL.replace('/api/v1', '')}/api/v1/auth/eventbrite?userId=${userId || 'global'}`;
                  }}
                  style={{
                    width: '100%',
                    background: '#F6682F',
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 18 }}>🎟️</span>
                  Connect with Eventbrite
                </button>
                <p style={{ fontSize: 11, color: '#666', marginTop: 8, textAlign: 'center' }}>
                  You'll be redirected to Eventbrite to authorize access
                </p>
              </div>
            )}

            {/* Configuration Form */}
            {integration.provider !== 'eventbrite' &&
              (integration.status === 'disconnected' ||
                integration.status === 'error' ||
                selectedIntegration?.provider === integration.provider) && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                      {integration.provider === 'twilio' ? 'Account SID' : 'API Key'}
                    </label>
                    <input
                      type="password"
                      placeholder={integration.hasApiKey ? '••••••••' : 'Enter your API key'}
                      value={selectedIntegration?.provider === integration.provider ? integrationFormData.apiKey : ''}
                      onChange={(e) => {
                        setSelectedIntegration(integration);
                        setIntegrationFormData((prev) => ({ ...prev, apiKey: e.target.value }));
                      }}
                      onFocus={() => setSelectedIntegration(integration)}
                      style={{
                        width: '100%',
                        background: '#111',
                        border: '1px solid #333',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 14,
                        color: '#fff',
                      }}
                    />
                  </div>

                  {/* Mailchimp server prefix */}
                  {integration.provider === 'mailchimp' && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                        Server Prefix (e.g., us21)
                      </label>
                      <input
                        type="text"
                        placeholder="us21"
                        value={
                          selectedIntegration?.provider === integration.provider
                            ? integrationFormData.serverPrefix
                            : integration.extraConfig?.server_prefix || ''
                        }
                        onChange={(e) => setIntegrationFormData((prev) => ({ ...prev, serverPrefix: e.target.value }))}
                        style={{
                          width: '100%',
                          background: '#111',
                          border: '1px solid #333',
                          borderRadius: 8,
                          padding: '10px 12px',
                          fontSize: 14,
                          color: '#fff',
                        }}
                      />
                    </div>
                  )}

                  {/* Twilio/Ticketmaster secret */}
                  {(integration.provider === 'twilio' || integration.provider === 'ticketmaster') && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                        {integration.provider === 'twilio' ? 'Auth Token' : 'API Secret'}
                      </label>
                      <input
                        type="password"
                        placeholder="Enter secret"
                        value={selectedIntegration?.provider === integration.provider ? integrationFormData.apiSecret : ''}
                        onChange={(e) => setIntegrationFormData((prev) => ({ ...prev, apiSecret: e.target.value }))}
                        style={{
                          width: '100%',
                          background: '#111',
                          border: '1px solid #333',
                          borderRadius: 8,
                          padding: '10px 12px',
                          fontSize: 14,
                          color: '#fff',
                        }}
                      />
                    </div>
                  )}

                  {/* Telnyx specific fields */}
                  {integration.provider === 'telnyx' && (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                          Phone Number (From)
                        </label>
                        <input
                          type="text"
                          placeholder="+1234567890"
                          value={
                            selectedIntegration?.provider === integration.provider
                              ? integrationFormData.phoneNumber
                              : integration.extraConfig?.phone_number || ''
                          }
                          onChange={(e) => {
                            setSelectedIntegration(integration);
                            setIntegrationFormData((prev) => ({ ...prev, phoneNumber: e.target.value }));
                          }}
                          onFocus={() => setSelectedIntegration(integration)}
                          style={{
                            width: '100%',
                            background: '#111',
                            border: '1px solid #333',
                            borderRadius: 8,
                            padding: '10px 12px',
                            fontSize: 14,
                            color: '#fff',
                          }}
                        />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>
                          Messaging Profile ID (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., 40017e70-..."
                          value={
                            selectedIntegration?.provider === integration.provider
                              ? integrationFormData.messagingProfileId
                              : integration.extraConfig?.messaging_profile_id || ''
                          }
                          onChange={(e) =>
                            setIntegrationFormData((prev) => ({ ...prev, messagingProfileId: e.target.value }))
                          }
                          style={{
                            width: '100%',
                            background: '#111',
                            border: '1px solid #333',
                            borderRadius: 8,
                            padding: '10px 12px',
                            fontSize: 14,
                            color: '#fff',
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Save button */}
              {selectedIntegration?.provider === integration.provider && integrationFormData.apiKey && (
                <button
                  onClick={() => saveIntegrationConfig(integration.provider)}
                  disabled={integrationLoading === integration.provider}
                  style={{
                    background: integration.color,
                    color: '#000',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: integrationLoading === integration.provider ? 0.6 : 1,
                  }}
                >
                  {integrationLoading === integration.provider ? 'Saving...' : 'Save'}
                </button>
              )}

              {/* Test Connection */}
              {integration.hasApiKey && (
                <button
                  onClick={() => testIntegration(integration.provider)}
                  disabled={integrationLoading === integration.provider}
                  style={{
                    background: '#1a1a1a',
                    color: '#fff',
                    border: '1px solid #333',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                    opacity: integrationLoading === integration.provider ? 0.6 : 1,
                  }}
                >
                  {integrationLoading === integration.provider ? 'Testing...' : 'Test Connection'}
                </button>
              )}

              {/* Sync button */}
              {integration.status === 'connected' &&
                (integration.provider === 'eventbrite' || integration.provider === 'mailchimp') && (
                  <button
                    onClick={() => {
                      if (integration.provider === 'mailchimp') {
                        fetchMailchimpAudiences();
                        onToast('Select an audience to sync guests', 'info');
                      } else {
                        syncIntegration(integration.provider);
                      }
                    }}
                    disabled={integrationLoading === integration.provider}
                    style={{
                      background: '#22c55e20',
                      color: '#22c55e',
                      border: '1px solid #22c55e40',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      opacity: integrationLoading === integration.provider ? 0.6 : 1,
                    }}
                  >
                    {integrationLoading === integration.provider
                      ? 'Syncing...'
                      : integration.provider === 'eventbrite'
                        ? 'Sync Events & Tickets'
                        : 'Sync to Mailchimp'}
                  </button>
                )}

              {/* Send SMS button */}
              {integration.status === 'connected' && integration.provider === 'telnyx' && (
                <button
                  onClick={onOpenSmsModal}
                  style={{
                    background: '#00C08B20',
                    color: '#00C08B',
                    border: '1px solid #00C08B40',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  📱 Send SMS
                </button>
              )}

              {/* Disconnect button */}
              {integration.status === 'connected' && (
                <button
                  onClick={() => disconnectIntegration(integration.provider)}
                  style={{
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #ef444440',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>

            {/* Mailchimp Audiences Selector */}
            {integration.provider === 'mailchimp' && integration.status === 'connected' && mailchimpAudiences.length > 0 && (
              <div style={{ marginTop: 16, padding: 12, background: '#111', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Select audience to sync guests:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mailchimpAudiences.map((audience) => (
                    <button
                      key={audience.id}
                      onClick={() => syncIntegration('mailchimp', { audienceId: audience.id, guestFilter: 'all' })}
                      style={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        color: '#fff',
                        padding: '10px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{audience.name}</span>
                      <span style={{ color: '#666' }}>{audience.memberCount} members</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Masked API Key display */}
            {integration.hasApiKey && integration.apiKeyMasked && integration.status !== 'disconnected' && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#444' }}>API Key: {integration.apiKeyMasked}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
