// PeptideConnect — database schema (raw SQL, auto-created on startup)
// Mirrors the `CREATE TABLE IF NOT EXISTS` init pattern used in server/index.js.
// All tables are prefixed `peptide_` to avoid collisions with the existing
// Berry Dashboard schema. UUID primary keys use pgcrypto's gen_random_uuid().

import { seedPeptideData } from './seed.js';

export const initPeptideSchema = async (pool) => {
  const client = await pool.connect();
  try {
    // gen_random_uuid() lives in pgcrypto (built into Postgres 13+).
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Suppliers: fabricantes con DMF activo en FDA
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dmf_number VARCHAR(20) UNIQUE,
        company_name VARCHAR(200) NOT NULL,
        dmf_status VARCHAR(5) DEFAULT 'A',
        dmf_type VARCHAR(60),
        subject TEXT,
        date_received DATE,
        peptides TEXT[],
        compliance_score INT DEFAULT 0,
        website VARCHAR(300),
        email_contact VARCHAR(200),
        purchasing_email VARCHAR(200),
        phone VARCHAR(50),
        linkedin_url VARCHAR(300),
        country VARCHAR(100),
        last_recall_date DATE,
        recall_count INT DEFAULT 0,
        gmp_certified BOOLEAN DEFAULT FALSE,
        fda_registered BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Farmacias 503B: outsourcing facilities FDA-registered
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_pharmacies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        facility_name VARCHAR(200) NOT NULL,
        address_line1 VARCHAR(200),
        address_line2 VARCHAR(200),
        city VARCHAR(100),
        state VARCHAR(2),
        zip VARCHAR(10),
        initial_registration_date DATE,
        last_registration_date DATE,
        inspection_date DATE,
        inspection_result VARCHAR(200),
        form_483_issued BOOLEAN DEFAULT FALSE,
        warning_letter BOOLEAN DEFAULT FALSE,
        peptides_compounded TEXT[],
        sterile_capable BOOLEAN DEFAULT TRUE,
        compliance_score INT DEFAULT 0,
        website VARCHAR(300),
        purchasing_email VARCHAR(200),
        phone VARCHAR(50),
        nabp_accredited BOOLEAN DEFAULT FALSE,
        states_licensed TEXT[],
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Doctores: prescriptores potenciales
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_doctors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        npi VARCHAR(10) UNIQUE NOT NULL,
        npi_type VARCHAR(10) DEFAULT 'NPI-1',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        credential VARCHAR(100),
        specialty VARCHAR(200),
        specialty_taxonomy VARCHAR(20),
        organization_name VARCHAR(200),
        address_line1 VARCHAR(200),
        city VARCHAR(100),
        state VARCHAR(2),
        zip VARCHAR(10),
        phone VARCHAR(50),
        npi_status VARCHAR(20) DEFAULT 'A',
        last_npi_update DATE,
        compliance_score INT DEFAULT 0,
        practice_email VARCHAR(200),
        practice_website VARCHAR(200),
        telehealth_provider BOOLEAN DEFAULT FALSE,
        cash_pay_friendly BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Péptidos permitidos (FDA 503A Bulks List)
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        also_known_as TEXT[],
        category VARCHAR(10),
        fda_status VARCHAR(100),
        shortage_active BOOLEAN DEFAULT FALSE,
        shortage_reason TEXT,
        shortage_date DATE,
        use_cases TEXT[],
        route_of_administration VARCHAR(50),
        pcac_review_date DATE,
        clinical_trial_count INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Oportunidades detectadas por IA
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_opportunities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        peptide_id UUID REFERENCES peptides(id),
        peptide_name VARCHAR(200),
        type VARCHAR(50),
        description TEXT,
        urgency VARCHAR(20),
        matched_supplier_ids UUID[],
        matched_pharmacy_ids UUID[],
        opportunity_score INT DEFAULT 0,
        status VARCHAR(30) DEFAULT 'open',
        ai_analysis TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
    `);

    // Matches: conexiones creadas por la plataforma
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        opportunity_id UUID REFERENCES peptide_opportunities(id),
        entity_a_type VARCHAR(20),
        entity_a_id UUID,
        entity_b_type VARCHAR(20),
        entity_b_id UUID,
        peptide VARCHAR(200),
        match_score INT,
        match_reason TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        fee_amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW(),
        connected_at TIMESTAMP
      );
    `);

    // Emails enviados
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_outreach_emails (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100),
        recipient_type VARCHAR(20),
        recipient_id UUID,
        recipient_email VARCHAR(200),
        recipient_name VARCHAR(200),
        subject VARCHAR(300),
        body TEXT,
        provider_message_id VARCHAR(100),
        status VARCHAR(30) DEFAULT 'pending',
        sent_at TIMESTAMP,
        opened_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Conversaciones del chat con el agente
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_chat_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(100),
        title VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES peptide_chat_conversations(id),
        role VARCHAR(20),
        content TEXT,
        tool_calls JSONB,
        tool_results JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Intel diario
    await client.query(`
      CREATE TABLE IF NOT EXISTS peptide_daily_intel (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE UNIQUE,
        new_shortages TEXT[],
        resolved_shortages TEXT[],
        new_approvals TEXT[],
        regulatory_updates TEXT[],
        price_alerts TEXT[],
        trial_updates TEXT[],
        summary TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ PeptideConnect tables initialized');

    // Idempotent seed: only when there are no suppliers yet.
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM peptide_suppliers;');
    if (rows[0].n === 0) {
      await seedPeptideData(pool);
    }
  } catch (error) {
    console.error('❌ Error initializing PeptideConnect schema:', error.message);
  } finally {
    client.release();
  }
};
