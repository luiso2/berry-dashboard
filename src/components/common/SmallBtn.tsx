// Small Button Component

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
    style={{
      background: danger ? '#ef444415' : color ? `${color}15` : '#1a1a1a',
      color: danger ? '#ef4444' : color || '#888',
      border: danger ? '1px solid #ef444430' : color ? `1px solid ${color}30` : '1px solid #222',
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);
