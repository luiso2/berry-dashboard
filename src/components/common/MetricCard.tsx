// Metric Card Component

interface MetricCardProps {
  label: string;
  value: number | string;
  subtitle: string;
  color: string;
}

export const MetricCard = ({ label, value, subtitle, color }: MetricCardProps) => (
  <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '20px' }}>
    <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 36, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 13, color: '#444' }}>{subtitle}</div>
  </div>
);
