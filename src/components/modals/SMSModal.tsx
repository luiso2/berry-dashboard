// SMS Modal - Send SMS via Telnyx
interface SMSModalProps {
  show: boolean;
  onClose: () => void;
  formData: { to: string; message: string };
  onFormChange: (data: { to: string; message: string }) => void;
  onSend: () => void;
  sending: boolean;
}

export function SMSModal({ show, onClose, formData, onFormChange, onSend, sending }: SMSModalProps) {
  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        animation: 'fadeIn 0.2s ease',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #00C08B40',
          borderRadius: 16,
          padding: 32,
          width: '100%',
          maxWidth: 450,
          animation: 'slideUp 0.3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#00C08B' }}>📱</span> Send SMS via Telnyx
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Phone Number (To)</label>
            <input
              type="tel"
              placeholder="+1234567890"
              value={formData.to}
              onChange={(e) => onFormChange({ ...formData, to: e.target.value })}
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                color: '#fff'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 6 }}>Message</label>
            <textarea
              placeholder="Type your message here..."
              value={formData.message}
              onChange={(e) => onFormChange({ ...formData, message: e.target.value })}
              rows={4}
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #333',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                color: '#fff',
                resize: 'vertical'
              }}
            />
            <div style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'right' }}>
              {formData.message.length} / 160 characters
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                background: '#1a1a1a',
                border: '1px solid #333',
                color: '#fff',
                padding: '12px',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSend}
              disabled={sending || !formData.to || !formData.message}
              style={{
                flex: 1,
                background: sending ? '#00C08B80' : '#00C08B',
                border: 'none',
                color: '#000',
                padding: '12px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer',
                opacity: (!formData.to || !formData.message) ? 0.5 : 1
              }}
            >
              {sending ? 'Sending...' : '📤 Send SMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
