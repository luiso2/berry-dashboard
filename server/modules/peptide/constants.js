// PeptideConnect — shared regulatory constants.
// FDA 503A Bulks List categorization (as of the spec, June 2026).

// Category 1 — permitted for 503A compounding.
export const CATEGORY_1 = [
  'sermorelin', 'cjc-1295', 'ipamorelin', 'pt-141', 'bremelanotide',
  'tirzepatide', 'semaglutide', 'oxytocin', 'vasopressin', 'glutathione',
];

// Category 2 — under review (PCAC meeting July 23-24, 2026).
export const CATEGORY_2 = [
  'bpc-157', 'tb-500', 'aod-9604', 'ghk-cu', 'selank', 'semax',
  'epithalon', 'mots-c', 'kisspeptin', 'thymosin alpha-1',
];

// NPI taxonomy specialties relevant to peptide prescribing.
export const PEPTIDE_SPECIALTIES = [
  'Functional Medicine', 'Anti-Aging', 'Endocrinology', 'Sports Medicine',
  'Integrative Medicine', 'Internal Medicine', 'Family Medicine', 'Preventive Medicine',
];

export const PCAC_REVIEW_DATE = '2026-07-23';

// Returns { category, fdaStatus, canCompound503a } for a peptide name.
export function classifyPeptide(name) {
  const n = (name || '').toLowerCase();
  if (CATEGORY_1.some((p) => n.includes(p))) {
    return { category: '1', fdaStatus: 'Permitted for 503A Compounding', canCompound503a: true };
  }
  if (CATEGORY_2.some((p) => n.includes(p))) {
    return { category: '2', fdaStatus: 'Under Review - PCAC Meeting July 23-24, 2026', canCompound503a: false };
  }
  return { category: 'unknown', fdaStatus: 'Not in 503A Bulks List', canCompound503a: false };
}
