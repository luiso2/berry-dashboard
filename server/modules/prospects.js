import express from 'express';
import { searchBusinesses } from '../utils/googlePlaces.js';
import { nicheTemplates } from '../templates/merktopOutreach.js';

const transformProspect = (row) => ({
  id: row.id,
  placeId: row.place_id,
  businessName: row.business_name,
  niche: row.niche,
  city: row.city,
  state: row.state,
  formattedAddress: row.formatted_address,
  phone: row.phone,
  email: row.email,
  website: row.website,
  hasWebsite: row.has_website,
  googleTypes: row.google_types,
  status: row.status,
  doNotContact: row.do_not_contact,
  lastContactedAt: row.last_contacted_at,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createProspectRoutes = (pool) => {
  const router = express.Router();

  // POST /discover — call Google Places, insert prospects without website
  router.post('/discover', async (req, res) => {
    const { niche, cities = [], limit = 60 } = req.body || {};

    if (!niche || !nicheTemplates[niche]) {
      return res.status(400).json({
        success: false,
        message: `niche is required and must be one of: ${Object.keys(nicheTemplates).join(', ')}`,
      });
    }
    if (!Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'cities must be a non-empty array',
      });
    }

    let totalSeen = 0;
    let totalWithWebsite = 0;
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const city of cities) {
      try {
        const businesses = await searchBusinesses({ niche, city, limit });
        totalSeen += businesses.length;
        for (const b of businesses) {
          if (b.has_website) {
            totalWithWebsite++;
            continue;
          }
          try {
            const result = await pool.query(
              `INSERT INTO prospects
                 (place_id, business_name, niche, city, state, formatted_address,
                  phone, website, has_website, google_types)
               VALUES ($1,$2,$3,$4,'FL',$5,$6,$7,$8,$9)
               ON CONFLICT (place_id) DO NOTHING
               RETURNING id`,
              [
                b.place_id,
                b.business_name,
                b.inferred_niche || niche,
                b.city,
                b.formatted_address,
                b.phone,
                b.website,
                b.has_website,
                JSON.stringify(b.google_types),
              ]
            );
            if (result.rows.length > 0) inserted++;
            else skipped++;
          } catch (insertErr) {
            console.error('Insert prospect error:', insertErr.message);
            errors.push(`${b.business_name}: ${insertErr.message}`);
          }
        }
      } catch (err) {
        console.error(`Discover error for ${niche} in ${city}:`, err.message);
        errors.push(`${city}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      niche,
      cities,
      total_seen: totalSeen,
      total_with_website: totalWithWebsite,
      total_without_website: totalSeen - totalWithWebsite,
      inserted,
      skipped_duplicate: skipped,
      errors,
    });
  });

  // GET / — list with filters and pagination
  router.get('/', async (req, res) => {
    const {
      niche,
      city,
      status,
      has_website,
      page = 1,
      pageSize = 50,
    } = req.query;

    const where = [];
    const params = [];
    let i = 1;

    if (niche) {
      where.push(`niche = $${i++}`);
      params.push(niche);
    }
    if (city) {
      where.push(`city ILIKE $${i++}`);
      params.push(city);
    }
    if (status) {
      where.push(`status = $${i++}`);
      params.push(status);
    }
    if (has_website !== undefined) {
      where.push(`has_website = $${i++}`);
      params.push(has_website === 'true' || has_website === true);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(parseInt(pageSize, 10) || 50, 500);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

    try {
      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT * FROM prospects ${whereSql}
           ORDER BY created_at DESC
           LIMIT ${limit} OFFSET ${offset}`,
          params
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM prospects ${whereSql}`, params),
      ]);

      res.json({
        success: true,
        prospects: rows.rows.map(transformProspect),
        page: parseInt(page, 10) || 1,
        pageSize: limit,
        total: count.rows[0].total,
      });
    } catch (err) {
      console.error('List prospects error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /stats — aggregate counts
  router.get('/stats', async (req, res) => {
    try {
      const [byNiche, byStatus, byCity, totals] = await Promise.all([
        pool.query(`SELECT niche, COUNT(*)::int AS n FROM prospects GROUP BY niche ORDER BY n DESC`),
        pool.query(`SELECT status, COUNT(*)::int AS n FROM prospects GROUP BY status ORDER BY n DESC`),
        pool.query(`SELECT city, COUNT(*)::int AS n FROM prospects GROUP BY city ORDER BY n DESC LIMIT 25`),
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE has_website = false)::int AS without_website,
                  COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
                  COUNT(*) FILTER (WHERE status = 'replied')::int AS replied
           FROM prospects`
        ),
      ]);

      res.json({
        success: true,
        totals: totals.rows[0],
        by_niche: byNiche.rows,
        by_status: byStatus.rows,
        top_cities: byCity.rows,
      });
    } catch (err) {
      console.error('Prospect stats error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /:id
  router.get('/:id', async (req, res) => {
    try {
      const p = await pool.query(`SELECT * FROM prospects WHERE id = $1`, [req.params.id]);
      if (p.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Prospect not found' });
      }
      const emails = await pool.query(
        `SELECT * FROM outreach_emails WHERE prospect_id = $1 ORDER BY sent_at DESC`,
        [req.params.id]
      );
      res.json({
        success: true,
        prospect: transformProspect(p.rows[0]),
        outreach_emails: emails.rows,
      });
    } catch (err) {
      console.error('Get prospect error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // PATCH /:id — manual edits (correct email, mark do_not_contact, add notes)
  router.patch('/:id', async (req, res) => {
    const allowed = ['email', 'phone', 'do_not_contact', 'status', 'notes', 'niche'];
    const sets = [];
    const params = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        params.push(req.body[key]);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No editable fields provided' });
    }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    try {
      const result = await pool.query(
        `UPDATE prospects SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        params
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Prospect not found' });
      }
      res.json({ success: true, prospect: transformProspect(result.rows[0]) });
    } catch (err) {
      console.error('Patch prospect error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // DELETE /:id
  router.delete('/:id', async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM prospects WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Prospect not found' });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Delete prospect error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
