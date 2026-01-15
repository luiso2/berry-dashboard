// Status Badge Component

import type { GuestCategory } from '../../types';

interface StatusBadgeProps {
  category: GuestCategory;
}

const badgeStyles: Record<GuestCategory, { bg: string; color: string; label: string }> = {
  pending: { bg: '#fbbf2415', color: '#fbbf24', label: 'Pending' },
  A: { bg: '#a78bfa15', color: '#a78bfa', label: 'VIP' },
  B: { bg: '#60a5fa15', color: '#60a5fa', label: 'Priority' },
  C: { bg: '#6b728015', color: '#9ca3af', label: 'Standard' },
  rejected: { bg: '#ef444415', color: '#ef4444', label: 'Rejected' },
};

export const StatusBadge = ({ category }: StatusBadgeProps) => {
  const s = badgeStyles[category];

  return (
    <span style={{
      background: s.bg,
      color: s.color,
      padding: '4px 10px',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 600,
      border: `1px solid ${s.color}25`,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
};
