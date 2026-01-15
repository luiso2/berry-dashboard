// useSMS Hook - SMS conversations management

import { useState, useCallback } from 'react';
import type { SMSThread, SMSMessage, SMSStats } from '../types';
import { API_URL } from '../constants';

interface UseSMSOptions {
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

export function useSMS(options: UseSMSOptions = {}) {
  const { onError, onSuccess } = options;

  const [threads, setThreads] = useState<SMSThread[]>([]);
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [stats, setStats] = useState<SMSStats>({
    total_conversations: 0,
    total_messages: 0,
    unread_messages: 0,
    human_takeover_count: 0,
    messages_today: 0,
  });
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sms/threads`);
      if (!res.ok) throw new Error('Failed to fetch threads');
      const data = await res.json();
      setThreads(data.threads || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching SMS threads:', error);
      onError?.('Error loading SMS conversations');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const fetchMessages = useCallback(async (phoneNumber: string) => {
    try {
      const res = await fetch(`${API_URL}/sms/messages/${encodeURIComponent(phoneNumber)}`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      setMessages(data.messages || []);
      setSelectedThread(phoneNumber);
    } catch (error) {
      console.error('Error fetching SMS messages:', error);
      onError?.('Error loading messages');
    }
  }, [onError]);

  const sendMessage = useCallback(async (to: string, message: string) => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send SMS');
      }
      onSuccess?.('SMS sent successfully');
      // Refresh messages if we're viewing this thread
      if (selectedThread === to) {
        await fetchMessages(to);
      }
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      onError?.(error instanceof Error ? error.message : 'Error sending SMS');
      return false;
    } finally {
      setSending(false);
    }
  }, [selectedThread, fetchMessages, onError, onSuccess]);

  const sendReply = useCallback(async (message: string) => {
    if (!selectedThread) return false;
    return sendMessage(selectedThread, message);
  }, [selectedThread, sendMessage]);

  const toggleHumanTakeover = useCallback(async (phoneNumber: string, enable: boolean) => {
    try {
      const res = await fetch(`${API_URL}/sms/takeover/${encodeURIComponent(phoneNumber)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable }),
      });
      if (!res.ok) throw new Error('Failed to toggle takeover');
      onSuccess?.(enable ? 'Human takeover enabled' : 'AI resumed');
      await fetchThreads();
      return true;
    } catch (error) {
      console.error('Error toggling takeover:', error);
      onError?.('Error updating takeover status');
      return false;
    }
  }, [fetchThreads, onError, onSuccess]);

  const markAsRead = useCallback(async (phoneNumber: string) => {
    try {
      await fetch(`${API_URL}/sms/read/${encodeURIComponent(phoneNumber)}`, {
        method: 'POST',
      });
      await fetchThreads();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  }, [fetchThreads]);

  return {
    // Data
    threads,
    messages,
    stats,
    selectedThread,
    loading,
    sending,
    // Actions
    fetchThreads,
    fetchMessages,
    sendMessage,
    sendReply,
    toggleHumanTakeover,
    markAsRead,
    setSelectedThread,
  };
}
