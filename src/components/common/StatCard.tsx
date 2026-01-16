// Stat Card Component

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  onClick?: () => void;
}

export const StatCard = ({ label, value, icon, color, onClick }: StatCardProps) => (
  <div
    onClick={onClick}
    className="btn-hover"
    style={{
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 12,
      padding: '16px 20px',
      cursor: 'pointer',
    }}
  >
    <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.6 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: color || '#fff', marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 14, color: '#666' }}>{label}</div>
  </div>
);
