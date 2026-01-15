// useIntegrations Hook - Integration management

import { useState, useCallback } from 'react';
import type { Integration } from '../types';
import { API_URL } from '../constants';

interface IntegrationFormData {
  apiKey: string;
  apiSecret: string;
  serverPrefix: string;
  phoneNumber: string;
  messagingProfileId: string;
}

interface MailchimpAudience {
  id: string;
  name: string;
  memberCount: number;
}

interface UseIntegrationsOptions {
  userId?: string;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onRefreshTickets?: () => void;
  onRefreshEvents?: () => void;
}

export function useIntegrations(options: UseIntegrationsOptions) {
  const { userId, onToast, onRefreshTickets, onRefreshEvents } = options;

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [integrationFormData, setIntegrationFormData] = useState<IntegrationFormData>({
    apiKey: '',
    apiSecret: '',
    serverPrefix: '',
    phoneNumber: '',
    messagingProfileId: '',
  });
  const [integrationLoading, setIntegrationLoading] = useState<string | null>(null);
  const [mailchimpAudiences, setMailchimpAudiences] = useState<MailchimpAudience[]>([]);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations`);
      const data = await res.json();
      let integrationsList = data.integrations || [];

      // Check per-user Eventbrite status
      if (userId) {
        try {
          const ebRes = await fetch(`${API_URL}/auth/eventbrite/status?userId=${userId}`);
          const ebData = await ebRes.json();
          if (ebData.connected) {
            integrationsList = integrationsList.map((int: Integration) => {
              if (int.provider === 'eventbrite') {
                return {
                  ...int,
                  status: 'connected' as const,
                  connectedUser: ebData.user,
                  lastSync: ebData.lastSync,
                };
              }
              return int;
            });
          }
        } catch (e) {
          console.error('Error checking Eventbrite status:', e);
        }
      }

      setIntegrations(integrationsList);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  }, [userId]);

  const saveIntegrationConfig = useCallback(async (provider: string) => {
    setIntegrationLoading(provider);
    try {
      const extraConfig: Record<string, string> = {};
      if (provider === 'mailchimp' && integrationFormData.serverPrefix) {
        extraConfig.server_prefix = integrationFormData.serverPrefix;
      }
      if (provider === 'telnyx') {
        if (integrationFormData.phoneNumber) {
          extraConfig.phone_number = integrationFormData.phoneNumber;
        }
        if (integrationFormData.messagingProfileId) {
          extraConfig.messaging_profile_id = integrationFormData.messagingProfileId;
        }
      }

      const res = await fetch(`${API_URL}/integrations/${provider}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: integrationFormData.apiKey,
          apiSecret: integrationFormData.apiSecret || undefined,
          extraConfig,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onToast('Configuration saved! Click Test Connection to verify.', 'success');
        fetchIntegrations();
        setIntegrationFormData({
          apiKey: '',
          apiSecret: '',
          serverPrefix: '',
          phoneNumber: '',
          messagingProfileId: '',
        });
      } else {
        onToast(data.error || 'Failed to save', 'error');
      }
    } catch (error) {
      onToast('Failed to save configuration', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  }, [integrationFormData, fetchIntegrations, onToast]);

  const testIntegration = useCallback(async (provider: string) => {
    setIntegrationLoading(provider);
    try {
      const res = await fetch(`${API_URL}/integrations/${provider}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        onToast(data.message || 'Connected successfully!', 'success');
      } else {
        onToast(data.message || 'Connection failed', 'error');
      }
      fetchIntegrations();
    } catch (error) {
      onToast('Connection test failed', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  }, [fetchIntegrations, onToast]);

  const syncIntegration = useCallback(async (provider: string, syncOptions?: Record<string, string>) => {
    setIntegrationLoading(provider);
    try {
      const options = {
        ...syncOptions,
        userId,
      };

      const res = await fetch(`${API_URL}/integrations/${provider}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const data = await res.json();
      if (data.success) {
        onToast(data.message || 'Sync completed!', 'success');
        // Refresh relevant data
        if (provider === 'eventbrite') {
          onRefreshTickets?.();
          onRefreshEvents?.();
        }
      } else {
        onToast(data.error || 'Sync failed', 'error');
      }
    } catch (error) {
      onToast('Sync failed', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  }, [userId, onToast, onRefreshTickets, onRefreshEvents]);

  const disconnectIntegration = useCallback(async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider}?`)) return;

    setIntegrationLoading(provider);
    try {
      let res;
      if (provider === 'eventbrite') {
        res = await fetch(`${API_URL}/auth/eventbrite/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } else {
        res = await fetch(`${API_URL}/integrations/${provider}`, {
          method: 'DELETE',
        });
      }
      const data = await res.json();
      if (data.success) {
        onToast(`${provider} disconnected`, 'success');
        fetchIntegrations();
        setSelectedIntegration(null);
      } else {
        onToast(data.error || 'Failed to disconnect', 'error');
      }
    } catch (error) {
      onToast('Failed to disconnect', 'error');
    } finally {
      setIntegrationLoading(null);
    }
  }, [userId, fetchIntegrations, onToast]);

  const fetchMailchimpAudiences = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/integrations/mailchimp/audiences`);
      const data = await res.json();
      setMailchimpAudiences(data.audiences || []);
    } catch (error) {
      console.error('Error fetching audiences:', error);
    }
  }, []);

  const resetFormData = useCallback(() => {
    setIntegrationFormData({
      apiKey: '',
      apiSecret: '',
      serverPrefix: '',
      phoneNumber: '',
      messagingProfileId: '',
    });
    setSelectedIntegration(null);
  }, []);

  return {
    // Data
    integrations,
    selectedIntegration,
    integrationFormData,
    integrationLoading,
    mailchimpAudiences,
    // Actions
    fetchIntegrations,
    saveIntegrationConfig,
    testIntegration,
    syncIntegration,
    disconnectIntegration,
    fetchMailchimpAudiences,
    setSelectedIntegration,
    setIntegrationFormData,
    resetFormData,
  };
}
