// openFDA service — drug shortages, enforcement/recalls, labels, and the
// combined "peptide status" lookup. Uses the global fetch convention.

import { classifyPeptide, PCAC_REVIEW_DATE } from '../constants.js';

const BASE_URL = 'https://api.fda.gov';
const API_KEY = process.env.OPENFDA_API_KEY;

function qs(params) {
  const sp = new URLSearchParams();
  if (API_KEY) sp.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) if (v != null) sp.set(k, v);
  return sp.toString();
}

async function fdaGet(endpoint, params) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}?${qs(params)}`);
    if (!res.ok) return { results: [] };
    return await res.json();
  } catch {
    return { results: [] };
  }
}

export const fdaService = {
  // Suppliers: enrich a peptide name with any matching FDA recalls (the DB
  // holds the canonical supplier rows; routes blend the two).
  async searchSuppliers({ peptide_name } = {}) {
    if (!peptide_name) return { recalls_found: 0, recalls: [] };
    const data = await fdaGet('/drug/enforcement.json', {
      search: `product_description:${peptide_name}`,
      limit: 50,
    });
    const recalls = data.results || [];
    return {
      recalls_found: recalls.length,
      recalls: recalls.slice(0, 5).map((r) => ({
        firm: r.recalling_firm,
        reason: r.reason_for_recall,
        status: r.status,
        date: r.recall_initiation_date,
      })),
    };
  },

  async getShortages({ search_term = 'peptide sermorelin tirzepatide semaglutide', status = 'active' } = {}) {
    const data = await fdaGet('/drug/shortages.json', {
      search: `generic_name:${search_term}`,
      limit: 50,
    });
    let shortages = data.results || [];
    if (status === 'active') shortages = shortages.filter((s) => s.status === 'Current');
    else if (status === 'resolved') shortages = shortages.filter((s) => s.status === 'Resolved');

    return {
      total: shortages.length,
      shortages: shortages.map((s) => ({
        drug_name: s.generic_name || '',
        status: s.status || '',
        reason: s.shortage_reason || '',
        company: s.company_name || '',
        availability: s.availability || '',
        presentation: s.presentation || '',
      })),
      opportunities: shortages.filter((s) => s.status === 'Current').length,
    };
  },

  async getPeptideStatus({ peptide_name }) {
    const [shortageData, recallData] = await Promise.all([
      fdaGet('/drug/shortages.json', { search: `generic_name:${peptide_name}`, limit: 5 }),
      fdaGet('/drug/enforcement.json', { search: `product_description:${peptide_name}`, limit: 10 }),
    ]);

    const { category, fdaStatus, canCompound503a } = classifyPeptide(peptide_name);
    const shortages = shortageData.results || [];
    const recalls = recallData.results || [];

    return {
      peptide: peptide_name,
      fda_category: category,
      fda_status: fdaStatus,
      shortage_active: shortages.length > 0,
      shortage_details: shortages.slice(0, 2),
      recall_count: recalls.length,
      can_compound_503a: canCompound503a,
      pcac_review_date: category === '2' ? PCAC_REVIEW_DATE : null,
      business_opportunity: shortages.length > 0 && category === '1' ? 'HIGH' : 'MEDIUM',
    };
  },
};
