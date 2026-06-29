// DB-backed reads/writes shared by the agent tools and the REST routes.

export const queries = {
  async getSuppliers(pool, { peptide_name, min_compliance_score = 0, dmf_status = 'A', limit = 10 } = {}) {
    const where = [];
    const params = [];
    if (dmf_status && dmf_status !== 'all') { params.push(dmf_status); where.push(`dmf_status = $${params.length}`); }
    if (min_compliance_score) { params.push(min_compliance_score); where.push(`compliance_score >= $${params.length}`); }
    if (peptide_name) { params.push(peptide_name); where.push(`EXISTS (SELECT 1 FROM unnest(peptides) p WHERE p ILIKE '%' || $${params.length} || '%')`); }
    params.push(limit);
    const sql = `SELECT * FROM peptide_suppliers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY compliance_score DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    return r.rows;
  },

  async getPharmacies(pool, { state, peptide, min_compliance_score = 0, nabp_only = false, limit = 10 } = {}) {
    const where = [];
    const params = [];
    if (state) { params.push(state); where.push(`state = $${params.length}`); }
    if (min_compliance_score) { params.push(min_compliance_score); where.push(`compliance_score >= $${params.length}`); }
    if (nabp_only) where.push('nabp_accredited = TRUE');
    if (peptide) { params.push(peptide); where.push(`EXISTS (SELECT 1 FROM unnest(peptides_compounded) p WHERE p ILIKE '%' || $${params.length} || '%')`); }
    params.push(limit);
    const sql = `SELECT * FROM peptide_pharmacies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY compliance_score DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    return r.rows;
  },

  async getDoctors(pool, { specialty, state, city, limit = 20 } = {}) {
    const where = [];
    const params = [];
    if (specialty) { params.push(`%${specialty}%`); where.push(`specialty ILIKE $${params.length}`); }
    if (state) { params.push(state); where.push(`state = $${params.length}`); }
    if (city) { params.push(`%${city}%`); where.push(`city ILIKE $${params.length}`); }
    params.push(limit);
    const sql = `SELECT * FROM peptide_doctors ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY compliance_score DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    return r.rows;
  },

  async getOpportunities(pool, { limit = 20 } = {}) {
    const r = await pool.query('SELECT * FROM peptide_opportunities ORDER BY opportunity_score DESC LIMIT $1', [limit]);
    return r.rows;
  },

  async getPeptides(pool, { category } = {}) {
    if (category) {
      const r = await pool.query('SELECT * FROM peptides WHERE category = $1 ORDER BY name', [category]);
      return r.rows;
    }
    const r = await pool.query('SELECT * FROM peptides ORDER BY category, name');
    return r.rows;
  },

  // Compute a simple fee from the two entities' scores and record the match.
  async createMatch(pool, { entity_a_type, entity_a_id, entity_b_type, entity_b_id, peptide, notes }) {
    const id = (t) => (/^[0-9a-f-]{36}$/i.test(t || '') ? t : null);
    const fee = 1500; // flat MVP connection fee placeholder
    const r = await pool.query(
      `INSERT INTO peptide_matches (entity_a_type, entity_a_id, entity_b_type, entity_b_id, peptide, match_score, match_reason, status, fee_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
      [entity_a_type, id(entity_a_id), entity_b_type, id(entity_b_id), peptide || null, 80, notes || 'Created via PeptideConnect AI agent', fee]
    );
    return { match: r.rows[0], fee_amount: fee, status: 'pending' };
  },
};
