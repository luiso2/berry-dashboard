// Tab Button Component

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}

export const TabButton = ({ active, onClick, label, count }: TabButtonProps) => (
  <button
    onClick={onClick}
    style={{
      background: active ? '#1a1a1a' : 'transparent',
      border: 'none',
      padding: '8px 14px',
      borderRadius: 8,
      color: active ? '#fff' : '#666',
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    {label}
    <span style={{
      background: active ? '#333' : '#1a1a1a',
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 13,
    }}>
      {count}
    </span>
  </button>
);
