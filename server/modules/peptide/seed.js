// PeptideConnect — idempotent seed data.
// Populates realistic Category-1/Category-2 peptides plus a handful of sample
// suppliers, 503B pharmacies, doctors and opportunities so the dashboard is
// never empty while live FDA/NPI calls fill in the rest.

import { PCAC_REVIEW_DATE } from './constants.js';

const PEPTIDES = [
  // Category 1 — permitted
  { name: 'Sermorelin', aka: ['GRF 1-29'], category: '1', status: 'Permitted', useCases: ['growth hormone', 'recovery', 'anti-aging'], route: 'injectable', trials: 14 },
  { name: 'CJC-1295', aka: ['DAC:GRF'], category: '1', status: 'Permitted', useCases: ['recovery', 'anti-aging'], route: 'injectable', trials: 9 },
  { name: 'Ipamorelin', aka: [], category: '1', status: 'Permitted', useCases: ['recovery', 'lean mass'], route: 'injectable', trials: 7 },
  { name: 'CJC-1295/Ipamorelin', aka: ['blend'], category: '1', status: 'Permitted', useCases: ['recovery', 'anti-aging'], route: 'injectable', trials: 5 },
  { name: 'PT-141', aka: ['Bremelanotide', 'Vyleesi'], category: '1', status: 'Permitted', useCases: ['sexual health'], route: 'injectable', trials: 22 },
  { name: 'Tirzepatide', aka: ['Mounjaro', 'Zepbound'], category: '1', status: 'Permitted (503B with Rx)', useCases: ['weight loss', 'diabetes'], route: 'injectable', trials: 61, shortage: true, shortageReason: 'Demand surge' },
  { name: 'Semaglutide', aka: ['Ozempic', 'Wegovy'], category: '1', status: 'Permitted (503B with Rx)', useCases: ['weight loss', 'diabetes'], route: 'injectable', trials: 88, shortage: false, shortageReason: 'Shortage resolved' },
  // Category 2 — under review
  { name: 'BPC-157', aka: ['Body Protection Compound'], category: '2', status: 'Category 2 - Under Review', useCases: ['recovery', 'gut health'], route: 'injectable', trials: 12 },
  { name: 'TB-500', aka: ['Thymosin Beta-4'], category: '2', status: 'Category 2 - Under Review', useCases: ['recovery', 'tissue repair'], route: 'injectable', trials: 8 },
  { name: 'AOD-9604', aka: [], category: '2', status: 'Category 2 - Under Review', useCases: ['weight loss'], route: 'injectable', trials: 4 },
  { name: 'GHK-Cu', aka: ['Copper Peptide'], category: '2', status: 'Category 2 - Under Review', useCases: ['anti-aging', 'skin'], route: 'topical', trials: 6 },
];

const SUPPLIERS = [
  { dmf: '34521', name: 'Bachem Americas Inc', type: 'Type II - Drug Substance (API)', subject: 'Sermorelin Acetate, Ipamorelin', peptides: ['Sermorelin', 'Ipamorelin', 'CJC-1295'], score: 92, website: 'https://www.bachem.com', purchasing: 'sales@bachem.com', phone: '+1-888-422-2436', country: 'USA', gmp: true },
  { dmf: '37810', name: 'PolyPeptide Group', type: 'Type II - Drug Substance (API)', subject: 'Tirzepatide, Semaglutide API', peptides: ['Tirzepatide', 'Semaglutide'], score: 88, website: 'https://www.polypeptide.com', purchasing: 'info@polypeptide.com', phone: '+1-858-455-3700', country: 'USA', gmp: true },
  { dmf: '40233', name: 'CordenPharma International', type: 'Type II - Drug Substance (API)', subject: 'Peptide API manufacturing', peptides: ['PT-141', 'Sermorelin'], score: 84, website: 'https://www.cordenpharma.com', purchasing: 'contact@cordenpharma.com', phone: '+49-6201-3920', country: 'Germany', gmp: true },
  { dmf: '29117', name: 'AmbioPharm Inc', type: 'Type II - Drug Substance (API)', subject: 'GMP peptide API supplier', peptides: ['CJC-1295', 'Ipamorelin', 'Semaglutide'], score: 79, website: 'https://www.ambiopharm.com', purchasing: 'sales@ambiopharm.com', phone: '+1-803-637-0335', country: 'USA', gmp: true },
];

const PHARMACIES = [
  { name: 'Empower Pharmacy', city: 'Houston', state: 'TX', zip: '77041', inspection: 'Closed - No Action Indicated', form483: false, peptides: ['Sermorelin', 'Tirzepatide', 'Semaglutide', 'PT-141'], score: 90, website: 'https://www.empowerpharmacy.com', purchasing: 'orders@empowerpharmacy.com', phone: '+1-877-562-8577', nabp: true, states: ['TX', 'FL', 'CA', 'NY', 'AZ'] },
  { name: 'Olympia Pharmaceuticals', city: 'Orlando', state: 'FL', zip: '32809', inspection: 'Closed', form483: false, peptides: ['Sermorelin', 'CJC-1295', 'Ipamorelin'], score: 82, website: 'https://www.olympiapharmacy.com', purchasing: 'sales@olympiapharmacy.com', phone: '+1-407-673-2222', nabp: true, states: ['FL', 'GA', 'TX'] },
  { name: 'Tailor Made Compounding', city: 'Nicholasville', state: 'KY', zip: '40356', inspection: 'Warning Letter', form483: true, peptides: ['BPC-157', 'TB-500'], score: 48, website: 'https://tailormadecompounding.com', purchasing: 'info@tailormadecompounding.com', phone: '+1-859-887-0013', nabp: false, states: ['KY'] },
  { name: 'Strive Pharmacy', city: 'Gilbert', state: 'AZ', zip: '85233', inspection: 'Closed - No Action Indicated', form483: false, peptides: ['Tirzepatide', 'Semaglutide', 'Sermorelin'], score: 86, website: 'https://strivepharmacy.com', purchasing: 'support@strivepharmacy.com', phone: '+1-833-377-7483', nabp: true, states: ['AZ', 'TX', 'CO', 'NV'] },
];

const DOCTORS = [
  { npi: '1234567890', first: 'Sarah', last: 'Mitchell', credential: 'MD', specialty: 'Functional Medicine', org: 'Vitality Health Clinic', city: 'Miami', state: 'FL', zip: '33131', phone: '+1-305-555-0142', email: 'office@vitalityhealth.com', telehealth: true, cashPay: true },
  { npi: '1234567891', first: 'James', last: 'Carter', credential: 'DO', specialty: 'Anti-Aging Medicine', org: 'Renew Longevity', city: 'Austin', state: 'TX', zip: '78701', phone: '+1-512-555-0188', email: 'info@renewlongevity.com', telehealth: true, cashPay: true },
  { npi: '1234567892', first: 'Priya', last: 'Nair', credential: 'MD', specialty: 'Endocrinology', org: 'Coastal Endocrine Associates', city: 'San Diego', state: 'CA', zip: '92101', phone: '+1-619-555-0173', email: 'contact@coastalendo.com', telehealth: false, cashPay: false },
];

export const seedPeptideData = async (pool) => {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding PeptideConnect sample data...');

    const peptideIdByName = {};
    for (const p of PEPTIDES) {
      const res = await client.query(
        `INSERT INTO peptides (name, also_known_as, category, fda_status, shortage_active, shortage_reason, use_cases, route_of_administration, pcac_review_date, clinical_trial_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [p.name, p.aka, p.category, p.status, !!p.shortage, p.shortageReason || null, p.useCases, p.route,
         p.category === '2' ? PCAC_REVIEW_DATE : null, p.trials]
      );
      peptideIdByName[p.name] = res.rows[0].id;
    }

    for (const s of SUPPLIERS) {
      await client.query(
        `INSERT INTO peptide_suppliers (dmf_number, company_name, dmf_status, dmf_type, subject, peptides, compliance_score, website, purchasing_email, email_contact, phone, country, gmp_certified, fda_registered)
         VALUES ($1,$2,'A',$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,TRUE)
         ON CONFLICT (dmf_number) DO NOTHING`,
        [s.dmf, s.name, s.type, s.subject, s.peptides, s.score, s.website, s.purchasing, s.phone, s.country, s.gmp]
      );
    }

    for (const f of PHARMACIES) {
      await client.query(
        `INSERT INTO peptide_pharmacies (facility_name, city, state, zip, inspection_result, form_483_issued, warning_letter, peptides_compounded, compliance_score, website, purchasing_email, phone, nabp_accredited, states_licensed, sterile_capable)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)`,
        [f.name, f.city, f.state, f.zip, f.inspection, f.form483, f.inspection.includes('Warning'), f.peptides, f.score, f.website, f.purchasing, f.phone, f.nabp, f.states]
      );
    }

    for (const d of DOCTORS) {
      await client.query(
        `INSERT INTO peptide_doctors (npi, first_name, last_name, credential, specialty, organization_name, city, state, zip, phone, practice_email, telehealth_provider, cash_pay_friendly, compliance_score, npi_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,80,'A')
         ON CONFLICT (npi) DO NOTHING`,
        [d.npi, d.first, d.last, d.credential, d.specialty, d.org, d.city, d.state, d.zip, d.phone, d.email, d.telehealth, d.cashPay]
      );
    }

    // A couple of seed opportunities tied to real peptides.
    await client.query(
      `INSERT INTO peptide_opportunities (peptide_id, peptide_name, type, description, urgency, opportunity_score, status, ai_analysis)
       VALUES ($1,$2,'shortage',$3,'high',90,'open',$4)`,
      [peptideIdByName['Tirzepatide'], 'Tirzepatide',
       'Tirzepatide in active shortage — 503B demand is high and verified API suppliers are available.',
       'High-margin connection opportunity: match Empower/Strive pharmacies with Bachem/PolyPeptide API supply.']
    );
    await client.query(
      `INSERT INTO peptide_opportunities (peptide_id, peptide_name, type, description, urgency, opportunity_score, status, ai_analysis)
       VALUES ($1,$2,'regulatory',$3,'medium',72,'open',$4)`,
      [peptideIdByName['BPC-157'], 'BPC-157',
       'BPC-157 up for PCAC review July 23-24, 2026 — potential move to Category 1.',
       'Pre-position suppliers and pharmacies ahead of a possible Category-1 approval.']
    );

    console.log('✅ PeptideConnect seed complete');
  } catch (error) {
    console.error('❌ Error seeding PeptideConnect data:', error.message);
  } finally {
    client.release();
  }
};
