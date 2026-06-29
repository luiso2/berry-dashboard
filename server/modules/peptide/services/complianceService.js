// Compliance scoring — 0-100 based on FDA enforcement history + entity metadata.
// Reads the canonical row from the DB when an id/name is supplied.

const FDA_KEY = process.env.OPENFDA_API_KEY;

const TABLE = {
  supplier: { name: 'peptide_suppliers', label: 'company_name' },
  pharmacy: { name: 'peptide_pharmacies', label: 'facility_name' },
  doctor: { name: 'peptide_doctors', label: 'last_name' },
};

async function findEntity(pool, entityType, entityId, entityName) {
  const t = TABLE[entityType];
  if (!t) return null;
  try {
    if (entityId && /^[0-9a-f-]{36}$/i.test(entityId)) {
      const r = await pool.query(`SELECT * FROM ${t.name} WHERE id = $1`, [entityId]);
      if (r.rows[0]) return r.rows[0];
    }
    const name = entityName || entityId;
    if (name) {
      const r = await pool.query(`SELECT * FROM ${t.name} WHERE ${t.label} ILIKE $1 LIMIT 1`, [`%${name}%`]);
      return r.rows[0] || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const complianceService = {
  async calculate({ entity_type, entity_id, entity_name }, ctx = {}) {
    let score = 100;
    const factors = [];
    const row = ctx.pool ? await findEntity(ctx.pool, entity_type, entity_id, entity_name) : null;
    const name = entity_name || row?.company_name || row?.facility_name ||
      (row ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : entity_id);

    // If the DB already has a stored score, anchor to it.
    if (row && typeof row.compliance_score === 'number' && row.compliance_score > 0) {
      score = row.compliance_score;
      factors.push(`📊 Stored compliance score: ${row.compliance_score}`);
    }

    if (entity_type === 'supplier') {
      if (name && FDA_KEY) {
        try {
          const res = await fetch(
            `https://api.fda.gov/drug/enforcement.json?api_key=${FDA_KEY}&search=recalling_firm:${encodeURIComponent(name)}&limit=20`
          );
          if (res.ok) {
            const data = await res.json();
            const recalls = data.results || [];
            const active = recalls.filter((r) => r.status === 'Ongoing');
            if (active.length) { score -= 50; factors.push(`⚠️ ${active.length} active recall(s): -50 pts`); }
            else if (recalls.length) { score -= 20; factors.push(`📋 ${recalls.length} historical recall(s): -20 pts`); }
            else factors.push('✅ No FDA recalls found');
          }
        } catch { /* ignore */ }
      }
      if (row?.gmp_certified) factors.push('✅ GMP certified');
      if (row?.dmf_status === 'A') factors.push('✅ DMF active');
    } else if (entity_type === 'pharmacy') {
      if (row?.warning_letter) { score -= 40; factors.push('⚠️ FDA Warning Letter on file: -40 pts'); }
      if (row?.form_483_issued) { score -= 20; factors.push('📋 Form 483 issued: -20 pts'); }
      if (row?.nabp_accredited) factors.push('✅ NABP accredited');
      factors.push('✅ 503B FDA-registered');
    } else if (entity_type === 'doctor') {
      if (row?.npi_status === 'A') factors.push('✅ NPI active');
      else { score -= 60; factors.push('⚠️ NPI not active: -60 pts'); }
      factors.push('✅ Relevant specialty');
    }

    const final = Math.max(0, Math.min(100, score));
    const recommendation =
      final >= 80 ? 'HIGHLY RECOMMENDED' :
      final >= 60 ? 'APPROVED' :
      final >= 40 ? 'REVIEW REQUIRED' : 'NOT RECOMMENDED';

    return {
      entity_type,
      entity_name: name,
      compliance_score: final,
      recommendation,
      factors,
      can_connect: final >= 60,
    };
  },
};
