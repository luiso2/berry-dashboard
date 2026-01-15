// Input Component

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  prefix?: string;
  required?: boolean;
}

export const Input = ({ label, placeholder, value, onChange, type = 'text', prefix, required }: InputProps) => (
  <div style={{ position: 'relative', flex: 1 }}>
    {label && (
      <label style={{ display: 'block', fontSize: 14, color: '#888', marginBottom: 6, fontWeight: 500 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
    )}
    <div style={{ position: 'relative' }}>
      {prefix && (
        <span style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#666',
          fontSize: 15,
        }}>
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-focus"
        style={{
          width: '100%',
          background: '#111',
          border: '1px solid #222',
          borderRadius: 10,
          padding: prefix ? '11px 12px 11px 28px' : '11px 12px',
          color: '#fff',
          fontSize: 15,
          outline: 'none',
        }}
      />
    </div>
  </div>
);
