// Small Button Component - Enhanced Design

interface SmallBtnProps {
  onClick: () => void;
  label: string;
  title: string;
  danger?: boolean;
  color?: string;
}

export const SmallBtn = ({ onClick, label, title, danger, color }: SmallBtnProps) => (
  <button
    onClick={onClick}
    title={title}
    className="btn-hover"
    style={{
      background: danger ? '#ef444420' : color ? `${color}20` : '#1a1a1a',
      color: danger ? '#ef4444' : color || '#999',
      border: danger ? '1px solid #ef444440' : color ? `1px solid ${color}40` : '1px solid #333',
      padding: '8px 14px',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minWidth: 40,
      minHeight: 36,
      transition: 'all 0.2s ease',
    }}
  >
    {label}
  </button>
);
