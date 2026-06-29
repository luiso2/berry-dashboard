// API Configuration

const LOCAL_API = 'http://localhost:8080/api/v1';

export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/v1' : LOCAL_API);

export const ENDPOINTS = {
  guests: '/guest-lists',
  stats: '/guest-lists/stats',
} as const;

// PeptideConnect B2B marketplace endpoints (relative to API_URL)
export const PEPTIDE_ENDPOINTS = {
  agentChat: '/peptide/agent/chat',
  suppliers: '/peptide/suppliers',
  pharmacies: '/peptide/pharmacies',
  doctors: '/peptide/doctors',
  opportunities: '/peptide/opportunities',
  peptides: '/peptide/peptides',
  intel: '/peptide/intel',
  matches: '/peptide/matches',
  emailDraft: '/peptide/email/draft',
} as const;
