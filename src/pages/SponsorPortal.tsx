import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://berry-dashboard-api-production.up.railway.app/api/v1';

interface SponsorData {
  companyName: string;
  contactName: string;
  tier: string;
  tierName: string;
  tierPrice: string;
  status: string;
  logoUrl?: string;
  benefits: string[];
}

interface EventData {
  id: number;
  title: string;
  date: string;
  status: string;
  venueName?: string;
  venueCity?: string;
  expectedAttendance: number;
  actualAttendance: number;
  attendanceRate: number | null;
}

interface Metrics {
  totalEvents: number;
  totalAttendance: number;
  avgAttendancePerEvent: number;
  estimatedImpressions: number;
  estimatedSocialReach: number;
  sponsorInvestment: number;
  costPerImpression: string;
  costPerAttendee: string;
  performanceVsIndustry: string | null;
  industryBenchmark: {
    avgCostPerImpression: string;
    avgCostPerLead: string;
    avgEventROI: string;
  };
}

interface PortalData {
  success: boolean;
  sponsor: SponsorData;
  events: EventData[];
  metrics: Metrics;
  generatedAt: string;
}

function SponsorPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/sponsor-portal/${token}`);
        if (!res.ok) {
          if (res.status === 401) {
            setError('This link has expired or is invalid. Please contact us for a new link.');
          } else {
            setError('Failed to load portal data');
          }
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #d4af37 0%, #b8962d 100%)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            animation: 'pulse 2s infinite'
          }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>B</span>
          </div>
          <p style={{ color: '#888' }}>Loading your metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        padding: 20
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 64,
            height: 64,
            background: '#ef444420',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <span style={{ fontSize: 28, color: '#ef4444' }}>!</span>
          </div>
          <h2 style={{ marginBottom: 12 }}>Access Error</h2>
          <p style={{ color: '#888' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { sponsor, events, metrics } = data;
  const tierColors: Record<string, string> = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#d4af37',
    platinum: '#e5e4e2',
    title: '#d4af37'
  };
  const tierColor = tierColors[sponsor.tier] || '#d4af37';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {sponsor.logoUrl ? (
            <img src={sponsor.logoUrl} alt={sponsor.companyName} style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              objectFit: 'contain',
              background: '#fff'
            }} />
          ) : (
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: `${tierColor}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tierColor,
              fontSize: 20,
              fontWeight: 700
            }}>
              {sponsor.companyName.charAt(0)}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{sponsor.companyName}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{
                background: `${tierColor}20`,
                color: tierColor,
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                {sponsor.tierName}
              </span>
              <span style={{ color: '#888', fontSize: 14 }}>Sponsor</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Data as of {new Date(data.generatedAt).toLocaleDateString()}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Key Metrics Grid */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#888' }}>Your Sponsorship Impact</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16
          }}>
            <MetricCard
              label="Events Sponsored"
              value={metrics.totalEvents.toString()}
              icon="◈"
              color="#22c55e"
            />
            <MetricCard
              label="Total Attendance"
              value={metrics.totalAttendance.toLocaleString()}
              icon="◉"
              color="#3b82f6"
            />
            <MetricCard
              label="Est. Impressions"
              value={metrics.estimatedImpressions.toLocaleString()}
              subtitle="Logo views"
              icon="◎"
              color="#d4af37"
            />
            <MetricCard
              label="Social Reach"
              value={metrics.estimatedSocialReach.toLocaleString()}
              subtitle="Est. extended reach"
              icon="◐"
              color="#a855f7"
            />
          </div>
        </section>

        {/* ROI Analysis */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#888' }}>ROI Analysis</h2>
          <div style={{
            background: '#111',
            borderRadius: 12,
            border: '1px solid #222',
            padding: 24
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 24
            }}>
              <div>
                <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Investment</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: tierColor }}>
                  ${metrics.sponsorInvestment.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Cost Per Impression</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  ${metrics.costPerImpression}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  Industry avg: {metrics.industryBenchmark.avgCostPerImpression}
                </div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Cost Per Attendee</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  ${metrics.costPerAttendee}
                </div>
              </div>
              {metrics.performanceVsIndustry && (
                <div>
                  <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>vs. Industry</div>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: parseInt(metrics.performanceVsIndustry) > 100 ? '#22c55e' : '#ef4444'
                  }}>
                    {metrics.performanceVsIndustry}%
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {parseInt(metrics.performanceVsIndustry) > 100 ? 'Better than average' : 'Below average'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Events List */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#888' }}>Event Performance</h2>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {events.map(event => (
              <div key={event.id} style={{
                background: '#111',
                borderRadius: 12,
                border: '1px solid #222',
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{event.title}</div>
                  <div style={{ fontSize: 13, color: '#888' }}>
                    {new Date(event.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                    {event.venueName && ` • ${event.venueName}`}
                    {event.venueCity && `, ${event.venueCity}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{event.actualAttendance.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>Attendees</div>
                  </div>
                  {event.attendanceRate !== null && (
                    <div style={{
                      background: event.attendanceRate >= 80 ? '#22c55e20' : event.attendanceRate >= 50 ? '#fbbf2420' : '#ef444420',
                      color: event.attendanceRate >= 80 ? '#22c55e' : event.attendanceRate >= 50 ? '#fbbf24' : '#ef4444',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 600
                    }}>
                      {event.attendanceRate}% capacity
                    </div>
                  )}
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div style={{
                background: '#111',
                borderRadius: 12,
                border: '1px solid #222',
                padding: 40,
                textAlign: 'center',
                color: '#666'
              }}>
                No events data available yet
              </div>
            )}
          </div>
        </section>

        {/* Industry Benchmarks */}
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#888' }}>Industry Benchmarks</h2>
          <div style={{
            background: '#111',
            borderRadius: 12,
            border: '1px solid #222',
            padding: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 24
          }}>
            <div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Avg. Cost Per Impression</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{metrics.industryBenchmark.avgCostPerImpression}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Avg. Cost Per Lead</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{metrics.industryBenchmark.avgCostPerLead}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Avg. Event ROI</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{metrics.industryBenchmark.avgEventROI}</div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px 32px',
        borderTop: '1px solid #222',
        textAlign: 'center',
        color: '#666',
        fontSize: 13
      }}>
        <p>Powered by Berry Bly Productions</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Questions about your sponsorship? Contact us at sponsors@berryblyproductions.com
        </p>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ label, value, subtitle, icon, color }: {
  label: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
}) {
  return (
    <div style={{
      background: '#111',
      borderRadius: 12,
      border: '1px solid #222',
      padding: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color, fontSize: 18 }}>{icon}</span>
        <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div>
      {subtitle && <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}

export default SponsorPortal;
