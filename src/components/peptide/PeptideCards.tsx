// PeptideConnect entity cards — obsidian/gold theme, inline styles to match
// the existing dashboard views (SMSView / common cards).

import type { CSSProperties } from 'react';
import type {
  PeptideSupplier,
  PeptidePharmacy,
  PeptideDoctor,
  PeptideOpportunity,
} from '../../types';

const card: CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid #1a1a1a',
  borderRadius: 12,
  padding: 18,
};

function scoreColor(score: number) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: scoreColor(score),
        background: `${scoreColor(score)}1a`,
        padding: '2px 10px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {score}/100
    </span>
  );
}

function Tags({ items }: { items?: string[] }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {items.slice(0, 5).map((t, i) => (
        <span key={i} style={{ fontSize: 11, color: '#9ca3af', background: '#111', border: '1px solid #1f1f1f', padding: '2px 8px', borderRadius: 6 }}>
          {t}
        </span>
      ))}
    </div>
  );
}

export function SupplierCard({ s }: { s: PeptideSupplier }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#fff' }}>{s.company_name}</div>
        <ScorePill score={s.compliance_score} />
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        {s.dmf_number ? `DMF #${s.dmf_number}` : 'No DMF'} · {s.country || '—'}
        {s.gmp_certified ? ' · GMP ✅' : ''}
      </div>
      <Tags items={s.peptides} />
      {s.purchasing_email && <div style={{ fontSize: 12, color: '#d4af37', marginTop: 10 }}>✉ {s.purchasing_email}</div>}
    </div>
  );
}

export function PharmacyCard({ p }: { p: PeptidePharmacy }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#fff' }}>{p.facility_name}</div>
        <ScorePill score={p.compliance_score} />
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        {[p.city, p.state].filter(Boolean).join(', ') || '—'}
        {p.nabp_accredited ? ' · NABP ✅' : ''}
        {p.warning_letter ? ' · ⚠️ Warning Letter' : ''}
      </div>
      <Tags items={p.peptides_compounded} />
      {p.purchasing_email && <div style={{ fontSize: 12, color: '#d4af37', marginTop: 10 }}>✉ {p.purchasing_email}</div>}
    </div>
  );
}

export function DoctorCard({ d }: { d: PeptideDoctor }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#fff' }}>
          {[d.first_name, d.last_name].filter(Boolean).join(' ')} {d.credential ? `, ${d.credential}` : ''}
        </div>
        <ScorePill score={d.compliance_score} />
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
        {d.specialty || '—'} · {[d.city, d.state].filter(Boolean).join(', ')}
        {d.telehealth_provider ? ' · Telehealth' : ''}
      </div>
      {d.organization_name && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{d.organization_name}</div>}
      {d.practice_email && <div style={{ fontSize: 12, color: '#d4af37', marginTop: 8 }}>✉ {d.practice_email}</div>}
    </div>
  );
}

export function OpportunityCard({ o }: { o: PeptideOpportunity }) {
  const urgencyColor = o.urgency === 'high' ? '#ef4444' : o.urgency === 'medium' ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ ...card, borderColor: '#2a2a2a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#fff' }}>💡 {o.peptide_name}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: urgencyColor, textTransform: 'uppercase' }}>{o.urgency}</span>
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{o.description}</div>
      {o.ai_analysis && (
        <div style={{ fontSize: 12, color: '#d4af37', marginTop: 10, background: '#111', borderRadius: 8, padding: 10 }}>
          🤖 {o.ai_analysis}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#666', marginTop: 10 }}>Opportunity score: {o.opportunity_score}/100</div>
    </div>
  );
}
