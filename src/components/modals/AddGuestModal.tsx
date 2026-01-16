// Add Guest Modal
import { Input } from '../common';

interface GuestFormData {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  partySize: number;
  eventDate: string;
  notes: string;
}

interface AddGuestModalProps {
  show: boolean;
  onClose: () => void;
  formData: GuestFormData;
  onFormChange: (data: GuestFormData) => void;
  onSubmit: () => void;
}

export function AddGuestModal({ show, onClose, formData, onFormChange, onSubmit }: AddGuestModalProps) {
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
        zIndex: 200,
        animation: 'fadeIn 0.2s ease',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 16,
          width: '100%',
          maxWidth: 420,
          padding: 24,
          animation: 'slideUp 0.3s ease',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>+ Add Guest</h2>
          <button
            onClick={onClose}
            style={{
              background: '#1a1a1a',
              border: 'none',
              color: '#888',
              fontSize: 18,
              cursor: 'pointer',
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Full Name"
            placeholder="John Doe"
            value={formData.name}
            onChange={(v) => onFormChange({ ...formData, name: v })}
            required
          />
          <Input
            label="Email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(v) => onFormChange({ ...formData, email: v })}
            type="email"
            required
          />
          <Input
            label="Phone"
            placeholder="+1 (555) 000-0000"
            value={formData.phone}
            onChange={(v) => onFormChange({ ...formData, phone: v })}
          />
          <Input
            label="Instagram"
            placeholder="johndoe"
            value={formData.instagram}
            onChange={(v) => onFormChange({ ...formData, instagram: v })}
            prefix="@"
          />
          <div className="form-row" style={{ display: 'flex', gap: 12 }}>
            <Input
              label="Party Size"
              placeholder="2"
              value={String(formData.partySize)}
              onChange={(v) => onFormChange({ ...formData, partySize: parseInt(v) || 1 })}
              type="number"
            />
            <Input
              label="Event Date"
              value={formData.eventDate}
              onChange={(v) => onFormChange({ ...formData, eventDate: v })}
              type="date"
            />
          </div>
          <button
            onClick={onSubmit}
            className="btn-hover"
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              padding: '14px 20px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            Add Guest
          </button>
        </div>
      </div>
    </div>
  );
}
