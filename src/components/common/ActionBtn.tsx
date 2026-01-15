// Action Button Component

interface ActionBtnProps {
  onClick: () => void;
  color: string;
  label: string;
}

export const ActionBtn = ({ onClick, color, label }: ActionBtnProps) => (
  <button
    onClick={onClick}
    className="btn-hover"
    style={{
      background: `${color}15`,
      color,
      border: `1px solid ${color}30`,
      padding: '6px 12px',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);
