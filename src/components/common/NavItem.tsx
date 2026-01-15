// Navigation Item Component

interface NavItemProps {
  label: string;
  active: boolean;
  icon: string;
  count?: number;
  onClick: () => void;
}

export const NavItem = ({ label, active, icon, count, onClick }: NavItemProps) => (
  <div
    onClick={onClick}
    className="nav-hover"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: 8,
      background: active ? '#1a1a1a' : 'transparent',
      marginBottom: 4,
      cursor: 'pointer',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, opacity: active ? 1 : 0.4 }}>{icon}</span>
      <span style={{ fontSize: 15, color: active ? '#fff' : '#888' }}>{label}</span>
    </div>
    {count !== undefined && (
      <span style={{
        fontSize: 13,
        color: '#666',
        background: active ? '#333' : '#1a1a1a',
        padding: '3px 8px',
        borderRadius: 5,
        fontWeight: 500,
      }}>
        {count}
      </span>
    )}
  </div>
);
