// Promoters View - Promoter management, tiers, leaderboard, and commissions
import { useState } from 'react';
import type { Promoter } from '../types';

interface PromoterStats {
  total: number;
  active: number;
  totalSales: number;
  totalCommission: number;
}

interface PromoterFormData {
  name: string;
  email: string;
  phone: string;
  commissionRate: string;
  commissionType: string;
  bio: string;
  socialInstagram: string;
  socialTiktok: string;
  socialTwitter: string;
}

interface PromotersViewProps {
  promoters: Promoter[];
  promoterStats: PromoterStats;
  promoterLeaderboard: Promoter[];
  onCreatePromoter: (formData: PromoterFormData) => Promise<void>;
  onUpdatePromoter: (promoterId: number, updates: Partial<Promoter>) => void;
  onDeletePromoter: (promoterId: number) => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Promoter tier configuration
const PROMOTER_TIERS = [
  { tier: 'Platinum', color: '#e5e4e2', icon: '💎', minSales: '$35,000+' },
  { tier: 'Gold', color: '#d4af37', icon: '🥇', minSales: '$15,000+' },
  { tier: 'Silver', color: '#c0c0c0', icon: '🥈', minSales: '$5,000+' },
  { tier: 'Bronze', color: '#cd7f32', icon: '🥉', minSales: '$0+' }
] as const;

export function PromotersView({
  promoters,
  promoterStats,
  promoterLeaderboard,
  onCreatePromoter,
  onUpdatePromoter,
  onDeletePromoter,
  onToast,
}: PromotersViewProps) {
  // Local state
  const [showPromoterForm, setShowPromoterForm] = useState(false);
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [promoterFormData, setPromoterFormData] = useState<PromoterFormData>({
    name: '',
    email: '',
    phone: '',
    commissionRate: '10',
    commissionType: 'percentage',
    bio: '',
    socialInstagram: '',
    socialTiktok: '',
    socialTwitter: '',
  });

  const handleCreatePromoter = async () => {
    if (!promoterFormData.name || !promoterFormData.email) {
      onToast('Please fill in name and email', 'error');
      return;
    }
    await onCreatePromoter(promoterFormData);
    setShowPromoterForm(false);
    setPromoterFormData({
      name: '',
      email: '',
      phone: '',
      commissionRate: '10',
      commissionType: 'percentage',
      bio: '',
      socialInstagram: '',
      socialTiktok: '',
      socialTwitter: '',
    });
  };

  const handleCopyCode = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(code);
    onToast(`Code ${code} copied!`, 'success');
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'platinum': return '💎';
      case 'gold': return '🥇';
      case 'silver': return '🥈';
      case 'bronze': return '🥉';
      default: return '🥉';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return '#e5e4e2';
      case 'gold': return '#d4af37';
      case 'silver': return '#c0c0c0';
      case 'bronze': return '#cd7f32';
      default: return '#cd7f32';
    }
  };

  const getStatusColors = (status: string) => {
    if (status === 'active') {
      return { bg: '#22c55e20', color: '#22c55e' };
    }
    if (status === 'pending') {
      return { bg: '#fbbf2420', color: '#fbbf24' };
    }
    return { bg: '#66666620', color: '#888' };
  };

  return (
    <div className="page-content" style={{ padding: '32px', animation: 'fadeIn 0.3s ease' }}>
      {/* Stats Grid */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Promoters</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{promoterStats.total}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{promoterStats.active}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #d4af3740', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#d4af37', marginBottom: 4 }}>Total Sales</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#d4af37' }}>${promoterStats.totalSales.toLocaleString()}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #a78bfa40', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#a78bfa', marginBottom: 4 }}>Total Commission</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#a78bfa' }}>${promoterStats.totalCommission.toLocaleString()}</div>
        </div>
      </div>

      {/* Promoter Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {PROMOTER_TIERS.map(t => (
          <div key={t.tier} style={{ background: '#0a0a0a', border: `1px solid ${t.color}40`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: t.color }}>{t.tier}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{t.minSales}</div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {promoterLeaderboard.length > 0 && (
        <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #d4af3740', padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            🏆 <span style={{ color: '#d4af37' }}>Top Promoters This Month</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {promoterLeaderboard.slice(0, 5).map((p, idx) => (
              <div key={p.id} style={{ flex: 1, textAlign: 'center', padding: 16, background: '#111', borderRadius: 8 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#d4af37' }}>${(p.totalSales || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promoters List */}
      <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Promoters</span>
          <button
            onClick={() => setShowPromoterForm(true)}
            style={{
              background: '#d4af37',
              border: 'none',
              color: '#000',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add Promoter
          </button>
        </div>

        {/* Promoter List Items */}
        {promoters.map((promoter, idx) => {
          const tierColor = getTierColor(promoter.tier);
          const tierIcon = getTierIcon(promoter.tier);
          const statusColors = getStatusColors(promoter.status);

          return (
            <div
              key={promoter.id}
              onClick={() => setSelectedPromoter(promoter)}
              className="nav-hover"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                animation: `fadeIn 0.2s ease ${idx * 0.02}s both`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: promoter.photoUrl ? `url(${promoter.photoUrl}) center/cover` : '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: tierColor,
                }}>
                  {!promoter.photoUrl && tierIcon}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{promoter.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: '#888' }}>Code: {promoter.code}</span>
                    <span style={{
                      background: `${tierColor}20`,
                      color: tierColor,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      textTransform: 'capitalize'
                    }}>
                      {promoter.tier}
                    </span>
                    {promoter.socialInstagram && (
                      <span style={{ fontSize: 12, color: '#888' }}>📷 {promoter.socialInstagram}</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#d4af37' }}>${(promoter.totalSales || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{promoter.totalTicketsSold || 0} tickets sold</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: statusColors.bg,
                    color: statusColors.color,
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    textTransform: 'capitalize'
                  }}>
                    {promoter.status}
                  </span>
                  <button
                    onClick={(e) => handleCopyCode(promoter.code, e)}
                    style={{
                      background: '#3b82f620',
                      border: 'none',
                      color: '#3b82f6',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    title="Copy promo code"
                  >
                    📋 Copy Code
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePromoter(promoter.id);
                    }}
                    style={{
                      background: '#ef444420',
                      border: 'none',
                      color: '#ef4444',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    title="Delete promoter"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {promoters.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>📣</div>
            <div style={{ color: '#666', fontSize: 15 }}>No promoters yet</div>
            <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Add promoters to track sales and commissions</div>
          </div>
        )}
      </div>

      {/* Add Promoter Modal */}
      {showPromoterForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a0a0a', borderRadius: 16, width: 500, maxHeight: '90vh', overflow: 'auto', border: '1px solid #1a1a1a' }}>
            <div style={{ padding: 24, borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Add New Promoter</h3>
              <button onClick={() => setShowPromoterForm(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Name *</label>
                <input
                  type="text"
                  value={promoterFormData.name}
                  onChange={(e) => setPromoterFormData({ ...promoterFormData, name: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  placeholder="John Doe"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Email *</label>
                <input
                  type="email"
                  value={promoterFormData.email}
                  onChange={(e) => setPromoterFormData({ ...promoterFormData, email: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  placeholder="john@example.com"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Phone</label>
                <input
                  type="tel"
                  value={promoterFormData.phone}
                  onChange={(e) => setPromoterFormData({ ...promoterFormData, phone: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Commission Rate (%)</label>
                  <input
                    type="number"
                    value={promoterFormData.commissionRate}
                    onChange={(e) => setPromoterFormData({ ...promoterFormData, commissionRate: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                    placeholder="10"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Commission Type</label>
                  <select
                    value={promoterFormData.commissionType}
                    onChange={(e) => setPromoterFormData({ ...promoterFormData, commissionType: e.target.value })}
                    style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Instagram</label>
                <input
                  type="text"
                  value={promoterFormData.socialInstagram}
                  onChange={(e) => setPromoterFormData({ ...promoterFormData, socialInstagram: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14 }}
                  placeholder="@username"
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Bio</label>
                <textarea
                  value={promoterFormData.bio}
                  onChange={(e) => setPromoterFormData({ ...promoterFormData, bio: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: 14, minHeight: 80, resize: 'vertical' }}
                  placeholder="Brief description..."
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowPromoterForm(false)}
                  style={{ padding: '12px 24px', background: '#222', border: 'none', borderRadius: 8, color: '#888', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePromoter}
                  style={{ padding: '12px 24px', background: '#d4af37', border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Create Promoter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Promoter Detail Modal */}
      {selectedPromoter && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0a0a0a', borderRadius: 16, width: 600, maxHeight: '90vh', overflow: 'auto', border: '1px solid #1a1a1a' }}>
            <div style={{ padding: 24, borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: selectedPromoter.photoUrl ? `url(${selectedPromoter.photoUrl}) center/cover` : '#1a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {!selectedPromoter.photoUrl && getTierIcon(selectedPromoter.tier)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{selectedPromoter.name}</h3>
                  <div style={{ fontSize: 14, color: '#888' }}>Code: <span style={{ color: '#d4af37', fontWeight: 600 }}>{selectedPromoter.code}</span></div>
                </div>
              </div>
              <button onClick={() => setSelectedPromoter(null)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ background: '#111', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#d4af37' }}>${(selectedPromoter.totalSales || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Total Sales</div>
                </div>
                <div style={{ background: '#111', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#a78bfa' }}>${(selectedPromoter.totalCommission || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Commission Earned</div>
                </div>
                <div style={{ background: '#111', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedPromoter.totalTicketsSold || 0}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Tickets Sold</div>
                </div>
              </div>

              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Email</div>
                  <div style={{ fontSize: 14 }}>{selectedPromoter.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Phone</div>
                  <div style={{ fontSize: 14 }}>{selectedPromoter.phone || 'Not provided'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Commission Rate</div>
                  <div style={{ fontSize: 14 }}>{selectedPromoter.commissionRate}% ({selectedPromoter.commissionType})</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Tier</div>
                  <div style={{ fontSize: 14, textTransform: 'capitalize', color: getTierColor(selectedPromoter.tier) }}>
                    {getTierIcon(selectedPromoter.tier)} {selectedPromoter.tier}
                  </div>
                </div>
                {selectedPromoter.socialInstagram && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Instagram</div>
                    <div style={{ fontSize: 14 }}>📷 {selectedPromoter.socialInstagram}</div>
                  </div>
                )}
                {selectedPromoter.lastSaleAt && (
                  <div>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Last Sale</div>
                    <div style={{ fontSize: 14 }}>{new Date(selectedPromoter.lastSaleAt).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              {selectedPromoter.bio && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Bio</div>
                  <div style={{ fontSize: 14, color: '#ccc' }}>{selectedPromoter.bio}</div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleCopyCode(selectedPromoter.code)}
                  style={{ padding: '12px 24px', background: '#3b82f620', border: '1px solid #3b82f640', borderRadius: 8, color: '#3b82f6', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  📋 Copy Code
                </button>
                {selectedPromoter.status !== 'active' && (
                  <button
                    onClick={() => {
                      onUpdatePromoter(selectedPromoter.id, { status: 'active' });
                      setSelectedPromoter({ ...selectedPromoter, status: 'active' });
                    }}
                    style={{ padding: '12px 24px', background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: 8, color: '#22c55e', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✓ Activate
                  </button>
                )}
                {selectedPromoter.status === 'active' && (
                  <button
                    onClick={() => {
                      onUpdatePromoter(selectedPromoter.id, { status: 'inactive' });
                      setSelectedPromoter({ ...selectedPromoter, status: 'inactive' });
                    }}
                    style={{ padding: '12px 24px', background: '#f59e0b20', border: '1px solid #f59e0b40', borderRadius: 8, color: '#f59e0b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Deactivate
                  </button>
                )}
                <button
                  onClick={() => {
                    onDeletePromoter(selectedPromoter.id);
                    setSelectedPromoter(null);
                  }}
                  style={{ padding: '12px 24px', background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, color: '#ef4444', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
