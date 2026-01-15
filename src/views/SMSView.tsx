// SMS AI Conversations View

import { useState, useEffect } from 'react';
import type { SMSThread, SMSMessage, SMSStats } from '../types';
import { API_URL } from '../constants';

interface SMSViewProps {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function SMSView({ onToast }: SMSViewProps) {
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
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sms/conversations/threads`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setThreads(data.threads || []);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error('Error fetching SMS threads:', error);
      onToast('Error loading SMS conversations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/sms/conversations/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching SMS stats:', error);
    }
  };

  const fetchMessages = async (phone: string) => {
    try {
      const res = await fetch(`${API_URL}/sms/conversations/thread/${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMessages(data.messages || []);
      setSelectedThread(phone);
    } catch (error) {
      console.error('Error fetching SMS messages:', error);
      onToast('Error loading messages', 'error');
    }
  };

  const toggleHumanTakeover = async (phone: string, enable: boolean) => {
    try {
      const res = await fetch(`${API_URL}/sms/conversations/takeover/${encodeURIComponent(phone)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable }),
      });
      if (!res.ok) throw new Error('Failed');
      onToast(enable ? 'Human takeover enabled' : 'AI resumed', 'success');
      await fetchThreads();
    } catch (error) {
      onToast('Error updating takeover status', 'error');
    }
  };

  const sendReply = async (phone: string, message: string) => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/sms/conversations/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, message }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send');
      }
      setReplyText('');
      onToast('Message sent', 'success');
      await fetchMessages(phone);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Error sending SMS', 'error');
    } finally {
      setSending(false);
    }
  };

  const deleteThread = async (phone: string) => {
    if (!confirm('Delete this conversation?')) return;
    try {
      const res = await fetch(`${API_URL}/sms/conversations/thread/${encodeURIComponent(phone)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      setSelectedThread(null);
      setMessages([]);
      onToast('Conversation deleted', 'success');
      await fetchThreads();
    } catch (error) {
      onToast('Error deleting conversation', 'error');
    }
  };

  const deleteMessage = async (id: number, phone: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      const res = await fetch(`${API_URL}/sms/conversations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
      onToast('Message deleted', 'success');
      await fetchMessages(phone);
    } catch (error) {
      onToast('Error deleting message', 'error');
    }
  };

  useEffect(() => {
    fetchThreads();
    fetchStats();
  }, []);

  return (
    <div className="page-content" style={{ padding: 32, animation: 'fadeIn 0.3s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>SMS AI Conversations</h2>
        <p style={{ color: '#666', margin: '8px 0 0', fontSize: 14 }}>View and manage AI-powered SMS conversations with users</p>
      </div>

      {/* Stats Cards */}
      <div className="sms-stats-grid" style={{ marginBottom: 24 }}>
        <div className="sms-stat-card" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{stats.total_conversations}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total Threads</div>
        </div>
        <div className="sms-stat-card" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{stats.total_messages}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Total Messages</div>
        </div>
        <div className="sms-stat-card" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{stats.unread_messages}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Unread</div>
        </div>
        <div className="sms-stat-card" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>{stats.human_takeover_count}</div>
          <div style={{ fontSize: 12, color: '#888' }}>Human Mode</div>
        </div>
      </div>

      {/* Main Content - Thread List + Chat */}
      <div className="sms-main-grid" style={{ gridTemplateColumns: selectedThread ? undefined : '1fr' }}>
        {/* Thread List */}
        <div style={{ background: '#111', borderRadius: 12, border: '1px solid #222', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Conversations</h3>
            <button
              onClick={() => { fetchThreads(); fetchStats(); }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 12 }}
            >
              Refresh
            </button>
          </div>
          <div className="sms-thread-list">
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>
            ) : threads.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>No conversations yet</div>
            ) : (
              threads.map((thread) => (
                <div
                  key={thread.contact_number}
                  onClick={() => fetchMessages(thread.contact_number)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #1a1a1a',
                    cursor: 'pointer',
                    background: selectedThread === thread.contact_number ? 'rgba(59,130,246,0.1)' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{thread.contact_number}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {thread.is_human_takeover && (
                        <span style={{ background: '#8b5cf6', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>Human</span>
                      )}
                      {(parseInt(String(thread.unread_count), 10) || 0) > 0 && (
                        <span style={{ background: '#3b82f6', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center' }}>{thread.unread_count}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {thread.last_message}
                  </div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                    {new Date(thread.last_message_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat View */}
        {selectedThread && (
          <div style={{ background: '#111', borderRadius: 12, border: '1px solid #222', display: 'flex', flexDirection: 'column' }}>
            {/* Chat Header */}
            <div className="sms-chat-header" style={{ padding: 16, borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedThread}</h3>
                <span style={{ fontSize: 12, color: '#888' }}>{messages.length} messages</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    const thread = threads.find(t => t.contact_number === selectedThread);
                    toggleHumanTakeover(selectedThread, !thread?.is_human_takeover);
                  }}
                  style={{
                    background: threads.find(t => t.contact_number === selectedThread)?.is_human_takeover ? '#8b5cf6' : '#333',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {threads.find(t => t.contact_number === selectedThread)?.is_human_takeover ? 'Switch to AI' : 'Take Over'}
                </button>
                <button
                  onClick={() => deleteThread(selectedThread)}
                  style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Delete
                </button>
                <button
                  onClick={() => { setSelectedThread(null); setMessages([]); }}
                  style={{ background: '#333', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="sms-messages-container" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="sms-message-bubble"
                  style={{
                    alignSelf: msg.direction === 'inbound' ? 'flex-start' : 'flex-end',
                    maxWidth: '70%'
                  }}
                >
                  <div
                    style={{
                      background: msg.direction === 'inbound' ? '#1a1a1a' : '#3b82f6',
                      padding: '10px 14px',
                      borderRadius: 12,
                      borderBottomLeftRadius: msg.direction === 'inbound' ? 4 : 12,
                      borderBottomRightRadius: msg.direction === 'outbound' ? 4 : 12
                    }}
                  >
                    <div style={{ fontSize: 14 }}>{msg.message}</div>
                    {msg.ai_response && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 13, color: '#10b981' }}>
                        AI: {msg.ai_response}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#555' }}>
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                    <button
                      onClick={() => deleteMessage(msg.id, selectedThread)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10, cursor: 'pointer', padding: '2px 6px' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <div style={{ padding: 16, borderTop: '1px solid #222' }}>
              <div className="sms-reply-input" style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a reply..."
                  style={{
                    flex: 1,
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: '#fff',
                    fontSize: 16
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && replyText.trim()) {
                      sendReply(selectedThread, replyText.trim());
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (replyText.trim()) {
                      sendReply(selectedThread, replyText.trim());
                    }
                  }}
                  disabled={sending || !replyText.trim()}
                  style={{
                    background: sending ? '#333' : '#3b82f6',
                    border: 'none',
                    color: '#fff',
                    padding: '12px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: sending ? 'not-allowed' : 'pointer'
                  }}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#555', margin: '8px 0 0' }}>
                Messages are sent via Telnyx. Human takeover mode disables AI auto-responses.
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!selectedThread && threads.length > 0 && (
          <div style={{ background: '#111', borderRadius: 12, border: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>Select a Conversation</h3>
              <p style={{ margin: 0, fontSize: 14, color: '#888' }}>Click on a thread to view messages and respond</p>
            </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div style={{ marginTop: 24, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#10b981' }}>About SMS AI</h4>
        <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>The Berry Bly AI Assistant automatically responds to incoming SMS messages with event information, VIP tables, dress code, and more.</p>
          <p style={{ margin: '0 0 8px' }}><strong>Human Takeover:</strong> Enable human mode to temporarily disable AI responses and respond manually.</p>
          <p style={{ margin: 0 }}><strong>API Endpoint:</strong> <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4 }}>/api/v1/sms/conversations/*</code></p>
        </div>
      </div>
    </div>
  );
}
