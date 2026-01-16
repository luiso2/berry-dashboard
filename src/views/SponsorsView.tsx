// Sponsors View - Sponsor management, tiers, and flyer generator
import { useState, useRef } from 'react';
import type { Sponsor } from '../types';
import { API_URL } from '../constants';

interface SponsorStats {
  total: number;
  pending: number;
  active: number;
  revenue: number;
}

interface GuestStats {
  total: number;
  vip: number;
}

interface SponsorsViewProps {
  sponsors: Sponsor[];
  sponsorStats: SponsorStats;
  guestStats: GuestStats;
  onUpdateSponsor: (sponsorId: string, updates: Partial<Sponsor>) => void;
  onDeleteSponsor: (sponsorId: string) => void;
  onLogoUpload: (sponsorId: string, file: File) => Promise<void>;
  onSelectSponsor: (sponsor: Sponsor) => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Sponsor tier configuration
const SPONSOR_TIERS = [
  { tier: 'Platinum', color: '#e5e4e2' },
  { tier: 'Gold', color: '#d4af37' },
  { tier: 'Silver', color: '#c0c0c0' },
  { tier: 'Bronze', color: '#cd7f32' }
] as const;

export function SponsorsView({
  sponsors,
  sponsorStats,
  guestStats,
  onUpdateSponsor,
  onDeleteSponsor,
  onLogoUpload,
  onSelectSponsor,
  onToast,
}: SponsorsViewProps) {
  // Local state
  const [showFlyerGenerator, setShowFlyerGenerator] = useState(false);
  const flyerRef = useRef<HTMLDivElement>(null);

  const handleCopyApplicationLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/sponsor-application`);
    onToast('Sponsor portal link copied!', 'success');
  };

  const handleSendPortalLink = async (sponsor: Sponsor, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_URL}/sponsors/${sponsor.id}/send-portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        onToast(`Portal link sent to ${sponsor.email}`, 'success');
      } else {
        onToast('Failed to send portal link', 'error');
      }
    } catch {
      onToast('Failed to send portal link', 'error');
    }
  };

  const downloadFlyer = async () => {
    if (!flyerRef.current) return;

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(flyerRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = 'event-flyer.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      onToast('Flyer downloaded!', 'success');
    } catch (error) {
      onToast('Failed to generate flyer', 'error');
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return '#e5e4e2';
      case 'gold': return '#d4af37';
      case 'silver': return '#c0c0c0';
      case 'bronze': return '#cd7f32';
      default: return '#666';
    }
  };

  const getStatusColors = (status: string) => {
    if (status === 'approved' || status === 'active') {
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
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>Total Sponsors</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{sponsorStats.total}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #fbbf2440', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#fbbf24', marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#fbbf24' }}>{sponsorStats.pending}</div>
        </div>
        <div className="stat-card" style={{ background: '#0a0a0a', border: '1px solid #22c55e40', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>Active</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{sponsorStats.active}</div>
        </div>
      </div>

      {/* Sponsor Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {SPONSOR_TIERS.map(t => (
          <div key={t.tier} style={{ background: '#0a0a0a', border: `1px solid ${t.color}40`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8, color: t.color }}>◆</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: t.color }}>{t.tier}</div>
          </div>
        ))}
      </div>

      {/* Sponsors List */}
      <div style={{ background: '#0a0a0a', borderRadius: 12, border: '1px solid #1a1a1a', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Sponsors</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowFlyerGenerator(true)}
              style={{
                background: '#a78bfa20',
                border: '1px solid #a78bfa40',
                color: '#a78bfa',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Generate Flyer
            </button>
            <button
              onClick={handleCopyApplicationLink}
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
              Copy Application Link
            </button>
          </div>
        </div>

        {/* Sponsor List Items */}
        {sponsors.map((sponsor, idx) => {
          const tierColor = getTierColor(sponsor.tier);
          const statusColors = getStatusColors(sponsor.status);

          return (
            <div
              key={sponsor.id}
              onClick={() => onSelectSponsor(sponsor)}
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
                  borderRadius: 12,
                  background: sponsor.logoUrl ? `url(${sponsor.logoUrl}) center/cover` : '#1a1a1a',
                  backgroundSize: 'cover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: tierColor,
                }}>
                  {!sponsor.logoUrl && '◆'}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>{sponsor.companyName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, color: '#888' }}>{sponsor.contactName}</span>
                    <span style={{
                      background: `${tierColor}20`,
                      color: tierColor,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                    }}>
                      {sponsor.tier}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Approve Button */}
                {sponsor.status === 'pending' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateSponsor(sponsor.id, { status: 'approved' });
                    }}
                    style={{
                      background: '#22c55e20',
                      border: 'none',
                      color: '#22c55e',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Approve
                  </button>
                )}

                {/* Logo Upload */}
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#3b82f620',
                    border: 'none',
                    color: '#3b82f6',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {sponsor.logoUrl ? '✓ Logo' : '+ Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onLogoUpload(sponsor.id, file);
                    }}
                  />
                </label>

                {/* Status Badge */}
                <span style={{
                  background: statusColors.bg,
                  color: statusColors.color,
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  textTransform: 'capitalize'
                }}>
                  {sponsor.status}
                </span>

                {/* Portal Link Button */}
                <button
                  onClick={(e) => handleSendPortalLink(sponsor, e)}
                  style={{
                    background: '#d4af3720',
                    border: 'none',
                    color: '#d4af37',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  title="Send metrics portal link"
                >
                  Portal
                </button>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSponsor(sponsor.id);
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
                  title="Delete sponsor"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {sponsors.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#333', fontSize: 48, marginBottom: 12 }}>◆</div>
            <div style={{ color: '#666', fontSize: 15 }}>No sponsors yet</div>
            <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>Sponsor applications will appear here</div>
          </div>
        )}
      </div>

      {/* Flyer Generator Modal */}
      {showFlyerGenerator && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            animation: 'fadeIn 0.2s ease',
            padding: 16,
          }}
          onClick={() => setShowFlyerGenerator(false)}
        >
          <div
            style={{
              background: '#0a0a0a',
              border: '1px solid #1a1a1a',
              borderRadius: 16,
              padding: 24,
              animation: 'slideUp 0.3s ease',
              maxHeight: '95vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Event Flyer Generator</h2>
              <button
                onClick={() => setShowFlyerGenerator(false)}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            {/* Flyer Preview */}
            <div
              ref={flyerRef}
              style={{
                width: 600,
                height: 800,
                background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)',
                borderRadius: 16,
                padding: 40,
                position: 'relative',
                overflow: 'hidden',
                marginBottom: 20,
              }}
            >
              {/* Gold border effect */}
              <div style={{ position: 'absolute', inset: 0, border: '2px solid #d4af37', borderRadius: 16, opacity: 0.5 }} />

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <h1 style={{ fontSize: 48, fontWeight: 700, color: '#d4af37', margin: '0 0 8px', fontFamily: 'Georgia, serif' }}>BERRY BLY</h1>
                <p style={{ fontSize: 14, color: '#666', letterSpacing: 4, textTransform: 'uppercase', margin: 0 }}>Luxury Events</p>
              </div>

              {/* Event Info */}
              <div style={{ textAlign: 'center', marginBottom: 60 }}>
                <h2 style={{ fontSize: 32, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>EXCLUSIVE EVENT</h2>
                <p style={{ fontSize: 18, color: '#888', margin: 0 }}>An Unforgettable Night</p>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 60 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#d4af37' }}>{guestStats.total}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>Guests</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#a78bfa' }}>{guestStats.vip}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>VIP</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#22c55e' }}>{sponsorStats.active}</div>
                  <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' }}>Sponsors</div>
                </div>
              </div>

              {/* Sponsor Logos */}
              {sponsors.filter(s => s.status === 'approved' || s.status === 'active').length > 0 && (
                <div style={{ marginBottom: 40 }}>
                  <p style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2 }}>Sponsored By</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                    {sponsors.filter(s => s.status === 'approved' || s.status === 'active').slice(0, 6).map(sponsor => (
                      <div
                        key={sponsor.id}
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 12,
                          background: sponsor.logoUrl ? `url(${sponsor.logoUrl}) center/contain no-repeat` : '#1a1a1a',
                          backgroundSize: 'contain',
                          border: '1px solid #333',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          color: '#666',
                          padding: 8,
                          textAlign: 'center',
                        }}
                      >
                        {!sponsor.logoUrl && sponsor.companyName.substring(0, 10)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ position: 'absolute', bottom: 40, left: 40, right: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#d4af37', marginBottom: 8 }}>berrybly.com</div>
                <div style={{ fontSize: 11, color: '#444' }}>Follow @berrybly on Instagram</div>
              </div>
            </div>

            <button
              onClick={downloadFlyer}
              style={{
                width: '100%',
                background: '#d4af37',
                border: 'none',
                color: '#000',
                padding: '14px 24px',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download Flyer (PNG)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
