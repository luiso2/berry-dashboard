// PeptideConnect — B2B peptide marketplace dashboard.
// Sub-tabs: AI Agent chat, Suppliers, Pharmacies, Doctors, Opportunities, Market Intel.

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { API_URL } from '../constants';
import { useAuth } from '../context/AuthContext';
import { ChatInterface } from '../components/peptide/ChatInterface';
import { SupplierCard, PharmacyCard, DoctorCard, OpportunityCard } from '../components/peptide/PeptideCards';
import type {
  PeptideSupplier,
  PeptidePharmacy,
  PeptideDoctor,
  PeptideOpportunity,
} from '../types';

interface Props {
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type Tab = 'chat' | 'suppliers' | 'pharmacies' | 'doctors' | 'opportunities' | 'intel';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: '🤖 AI Agent' },
  { id: 'suppliers', label: '🏭 Suppliers' },
  { id: 'pharmacies', label: '💊 Farmacias' },
  { id: 'doctors', label: '👨‍⚕️ Doctores' },
  { id: 'opportunities', label: '💡 Oportunidades' },
  { id: 'intel', label: '📊 Market Intel' },
];

interface IntelData {
  shortages?: { total: number; opportunities: number; shortages: { drug_name: string; status: string; reason: string }[] };
  regulatory?: { pcac_meeting: string; note: string; category_2_watchlist: string[] };
  trials?: { total: number; trials: { nct_id: string; title: string; phase: string; status: string }[] };
}

export function PeptideConnectView({ onToast }: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('chat');
  const [loading, setLoading] = useState(false);

  const [suppliers, setSuppliers] = useState<PeptideSupplier[]>([]);
  const [pharmacies, setPharmacies] = useState<PeptidePharmacy[]>([]);
  const [doctors, setDoctors] = useState<PeptideDoctor[]>([]);
  const [opportunities, setOpportunities] = useState<PeptideOpportunity[]>([]);
  const [intel, setIntel] = useState<IntelData | null>(null);

  const authedGet = useCallback(
    async (path: string) => {
      const res = await fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (tab === 'chat') return;
      setLoading(true);
      try {
        if (tab === 'suppliers') { const d = await authedGet('/peptide/suppliers'); if (!cancelled) setSuppliers(d.suppliers || []); }
        else if (tab === 'pharmacies') { const d = await authedGet('/peptide/pharmacies'); if (!cancelled) setPharmacies(d.pharmacies || []); }
        else if (tab === 'doctors') { const d = await authedGet('/peptide/doctors'); if (!cancelled) setDoctors(d.doctors || []); }
        else if (tab === 'opportunities') { const d = await authedGet('/peptide/opportunities'); if (!cancelled) setOpportunities(d.opportunities || []); }
        else if (tab === 'intel') { const d = await authedGet('/peptide/intel'); if (!cancelled) setIntel(d); }
      } catch {
        if (!cancelled) onToast('Error cargando datos de PeptideConnect', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tab, authedGet, onToast]);

  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 };

  return (
    <div style={{ padding: 24, animation: 'fadeIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
            🧬 PeptideConnect <span style={{ fontSize: 12, color: '#059669', background: '#05966922', padding: '2px 8px', borderRadius: 999 }}>Beta</span>
          </h1>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Marketplace B2B de péptidos · Mercado $336B · PCAC Meeting Jul 23-24, 2026</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #1a1a1a', padding: '12px 0', marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontSize: 13,
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: tab === t.id ? '#059669' : 'transparent',
              color: tab === t.id ? '#fff' : '#9ca3af',
              fontWeight: tab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'chat' && <ChatInterface onToast={onToast} />}

      {loading && tab !== 'chat' && <div style={{ color: '#666', fontSize: 14 }}>Cargando…</div>}

      {tab === 'suppliers' && !loading && (
        <div style={grid}>
          {suppliers.length ? suppliers.map((s) => <SupplierCard key={s.id} s={s} />) : <Empty label="suppliers" />}
        </div>
      )}
      {tab === 'pharmacies' && !loading && (
        <div style={grid}>
          {pharmacies.length ? pharmacies.map((p) => <PharmacyCard key={p.id} p={p} />) : <Empty label="farmacias" />}
        </div>
      )}
      {tab === 'doctors' && !loading && (
        <div style={grid}>
          {doctors.length ? doctors.map((d) => <DoctorCard key={d.id} d={d} />) : <Empty label="doctores" />}
        </div>
      )}
      {tab === 'opportunities' && !loading && (
        <div style={grid}>
          {opportunities.length ? opportunities.map((o) => <OpportunityCard key={o.id} o={o} />) : <Empty label="oportunidades" />}
        </div>
      )}
      {tab === 'intel' && !loading && intel && <IntelPanel intel={intel} />}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ color: '#555', fontSize: 14, padding: 24 }}>No hay {label} todavía. Pídele al agente que busque algunos.</div>;
}

function IntelPanel({ intel }: { intel: IntelData }) {
  const box: CSSProperties = { background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: 18, marginBottom: 14 };
  return (
    <div>
      {intel.shortages && (
        <div style={box}>
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8 }}>⚠️ Shortages activos ({intel.shortages.opportunities} oportunidades)</div>
          {intel.shortages.shortages.length ? intel.shortages.shortages.slice(0, 8).map((s, i) => (
            <div key={i} style={{ fontSize: 13, color: '#9ca3af', padding: '4px 0', borderBottom: '1px solid #141414' }}>
              <span style={{ color: '#fff' }}>{s.drug_name}</span> — {s.status} · {s.reason}
            </div>
          )) : <div style={{ fontSize: 13, color: '#666' }}>No hay shortages reportados en este momento.</div>}
        </div>
      )}
      {intel.regulatory && (
        <div style={box}>
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8 }}>📋 Regulatorio</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{intel.regulatory.note}</div>
          <div style={{ fontSize: 12, color: '#d4af37', marginTop: 8 }}>Watchlist Categoría 2: {intel.regulatory.category_2_watchlist.join(', ')}</div>
        </div>
      )}
      {intel.trials && (
        <div style={box}>
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8 }}>🔬 Ensayos clínicos ({intel.trials.total})</div>
          {intel.trials.trials.slice(0, 6).map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: '#9ca3af', padding: '4px 0', borderBottom: '1px solid #141414' }}>
              <span style={{ color: '#fff' }}>{t.title}</span> — {t.phase} · {t.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
