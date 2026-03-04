// Add Guest Modal
import { useState } from 'react';
import { Input } from '../common';
import { detectGenderFromName } from '../../utils/gender';

interface GuestFormData {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  partySize: number;
  eventDate: string;
  notes: string;
  gender: string;
}

interface AddGuestModalProps {
  show: boolean;
  onClose: () => void;
  formData: GuestFormData;
  onFormChange: (data: GuestFormData) => void;
  onSubmit: () => void;
}

export function AddGuestModal({ show, onClose, formData, onFormChange, onSubmit }: AddGuestModalProps) {
  const [manualGender, setManualGender] = useState(false);

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
            onChange={(v) => {
              const detected = detectGenderFromName(v);
              if (!manualGender && detected) {
                onFormChange({ ...formData, name: v, gender: detected });
              } else {
                onFormChange({ ...formData, name: v });
              }
            }}
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
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Input
                label="Phone"
                placeholder="+1 (555) 000-0000"
                value={formData.phone}
                onChange={(v) => onFormChange({ ...formData, phone: v })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#888' }}>Gender</label>
              <select
                value={formData.gender}
                onChange={(e) => {
                  setManualGender(!!e.target.value);
                  onFormChange({ ...formData, gender: e.target.value });
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#111',
                  border: '1px solid #333',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  height: 42,
                  appearance: 'none',
                  outline: 'none',
                }}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
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
