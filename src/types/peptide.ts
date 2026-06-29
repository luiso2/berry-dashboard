// PeptideConnect — domain types

export interface PeptideSupplier {
  id: string;
  company_name: string;
  dmf_number?: string;
  dmf_status?: string;
  dmf_type?: string;
  peptides?: string[];
  compliance_score: number;
  website?: string;
  purchasing_email?: string;
  phone?: string;
  country?: string;
  gmp_certified?: boolean;
}

export interface PeptidePharmacy {
  id: string;
  facility_name: string;
  city?: string;
  state?: string;
  inspection_result?: string;
  warning_letter?: boolean;
  form_483_issued?: boolean;
  peptides_compounded?: string[];
  compliance_score: number;
  website?: string;
  purchasing_email?: string;
  phone?: string;
  nabp_accredited?: boolean;
  states_licensed?: string[];
}

export interface PeptideDoctor {
  id: string;
  npi: string;
  first_name?: string;
  last_name?: string;
  credential?: string;
  specialty?: string;
  organization_name?: string;
  city?: string;
  state?: string;
  phone?: string;
  practice_email?: string;
  telehealth_provider?: boolean;
  compliance_score: number;
}

export interface PeptideOpportunity {
  id: string;
  peptide_name?: string;
  type?: string;
  description?: string;
  urgency?: string;
  opportunity_score: number;
  status?: string;
  ai_analysis?: string;
}

export interface PeptideItem {
  id: string;
  name: string;
  also_known_as?: string[];
  category?: string;
  fda_status?: string;
  shortage_active?: boolean;
  use_cases?: string[];
  clinical_trial_count?: number;
}

export interface PeptideMessage {
  role: 'user' | 'assistant';
  content: string;
}
