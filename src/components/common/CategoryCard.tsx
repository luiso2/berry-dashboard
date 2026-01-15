// Category Card Component

interface CategoryCardProps {
  label: string;
  value: number;
  color: string;
  onClick: () => void;
}

export const CategoryCard = ({ label, value, color, onClick }: CategoryCardProps) => (
  <div
    onClick={onClick}
    className="btn-hover"
    style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '16px 20px',
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 14, color: '#888' }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
  </div>
);
