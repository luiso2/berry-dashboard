// Chart Bar Component

interface ChartBarProps {
  value: number;
  max: number;
  label: string;
  color: string;
  delay?: number;
}

export const ChartBar = ({ value, max, label, color, delay = 0 }: ChartBarProps) => {
  const height = max > 0 ? Math.max((value / max) * 140, 4) : 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        className="chart-number-animated"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          animationDelay: `${delay + 0.2}s`
        }}
      >
        {value}
      </div>
      <div
        className="chart-bar-animated"
        style={{
          width: 40,
          height,
          background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`,
          borderRadius: 4,
          boxShadow: `0 4px 12px ${color}40`,
          animationDelay: `${delay}s`,
        }}
      />
      <div
        className="chart-number-animated"
        style={{
          fontSize: 12,
          color: '#666',
          animationDelay: `${delay + 0.3}s`
        }}
      >
        {label}
      </div>
    </div>
  );
};
