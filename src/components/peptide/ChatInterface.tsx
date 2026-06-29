// PeptideConnect AI agent chat — adapted from the SMSView chat pattern.
// Calls POST ${API_URL}/peptide/agent/chat with the auth bearer token.

import { useState, useRef, useEffect } from 'react';
import { API_URL } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import type { PeptideMessage } from '../../types';

const QUICK_ACTIONS = [
  '¿Qué péptidos están en shortage ahora mismo?',
  'Busca suppliers de Sermorelin con compliance score alto',
  'Muéstrame doctores de Functional Medicine en Florida',
  'Encuentra farmacias 503B en Texas y redacta un email de introducción',
  '¿Cuál es el status de BPC-157 con la FDA?',
  'Dame el intel de mercado de esta semana',
];

const WELCOME: PeptideMessage = {
  role: 'assistant',
  content:
    '👋 Soy el agente de PeptideConnect. Puedo buscar suppliers, farmacias y doctores, calcular compliance scores, detectar oportunidades de mercado, y redactar y enviar emails profesionales — todo desde aquí.\n\n¿Qué necesitas hacer hoy?',
};

export function ChatInterface({ onToast }: { onToast: (m: string, t: 'success' | 'error' | 'info') => void }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<PeptideMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || isLoading) return;

    const next: PeptideMessage[] = [...messages, { role: 'user', content: messageText }];
    setMessages(next);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/peptide/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Skip the welcome message; send only the real turns.
        body: JSON.stringify({ messages: next.filter((m) => m !== WELCOME) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response || '(sin respuesta)' }]);
    } catch {
      onToast('Error conectando con el agente', 'error');
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Error conectando con el agente. Intenta de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: 420 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 8 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                whiteSpace: 'pre-wrap',
                fontSize: 14,
                lineHeight: 1.5,
                borderRadius: 14,
                padding: '10px 14px',
                background: msg.role === 'user' ? '#047857' : '#1a1a1a',
                color: msg.role === 'user' ? '#fff' : '#e5e7eb',
                border: msg.role === 'user' ? 'none' : '1px solid #262626',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#1a1a1a', border: '1px solid #262626', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: '#9ca3af' }}>
              Buscando y analizando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick actions (only before the first user message) */}
      {messages.length === 1 && (
        <div style={{ padding: '14px 0' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>⚡ Acciones rápidas:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_ACTIONS.map((a, i) => (
              <button
                key={i}
                onClick={() => sendMessage(a)}
                style={{ fontSize: 12, background: '#111', border: '1px solid #1f1f1f', color: '#d1d5db', padding: '6px 12px', borderRadius: 999, cursor: 'pointer' }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(); }}
            placeholder="Buscar suppliers, redactar email, analizar oportunidad…"
            style={{ flex: 1, background: '#0a0a0a', border: '1px solid #262626', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            style={{ background: isLoading || !input.trim() ? '#1f2937' : '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            Enviar
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#555', textAlign: 'center', marginTop: 8 }}>
          El agente puede buscar, matchear y enviar emails directamente desde aquí
        </div>
      </div>
    </div>
  );
}
