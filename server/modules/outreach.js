import express from 'express';
import { sendEmail } from '../utils/email.js';
import { personalizeEmail } from '../utils/anthropic.js';
import { nicheTemplates, listTemplates, renderOutreachEmail } from '../templates/merktopOutreach.js';

const fromAddress = () =>
  process.env.MERKTOP_FROM_EMAIL || 'Marc at Merktop <hello@merktop.com>';
const replyTo = () => process.env.MERKTOP_REPLY_TO || 'hello@merktop.com';

export const createOutreachRoutes = (pool) => {
  const router = express.Router();

  // GET /templates — list niches available
  router.get('/templates', (req, res) => {
    res.json({ success: true, templates: listTemplates() });
  });

  // GET /campaigns — list with metrics
  router.get('/campaigns', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT c.*,
          COALESCE(s.sent, 0)::int AS sent_count,
          COALESCE(s.delivered, 0)::int AS delivered_count,
          COALESCE(s.opened, 0)::int AS opened_count,
          COALESCE(s.clicked, 0)::int AS clicked_count,
          COALESCE(s.bounced, 0)::int AS bounced_count,
          COALESCE(s.replied, 0)::int AS replied_count
        FROM outreach_campaigns c
        LEFT JOIN (
          SELECT campaign_id,
            COUNT(*) AS sent,
            COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked','replied')) AS delivered,
            COUNT(*) FILTER (WHERE status IN ('opened','clicked','replied')) AS opened,
            COUNT(*) FILTER (WHERE status IN ('clicked','replied')) AS clicked,
            COUNT(*) FILTER (WHERE status = 'bounced') AS bounced,
            COUNT(*) FILTER (WHERE status = 'replied') AS replied
          FROM outreach_emails
          GROUP BY campaign_id
        ) s ON s.campaign_id = c.id
        ORDER BY c.created_at DESC
      `);
      res.json({ success: true, campaigns: result.rows });
    } catch (err) {
      console.error('List campaigns error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /campaigns — create
  router.post('/campaigns', async (req, res) => {
    const {
      name,
      niche,
      cities = [],
      template_id,
      daily_cap = 200,
      starts_at,
    } = req.body || {};

    if (!name || !niche) {
      return res.status(400).json({ success: false, message: 'name and niche are required' });
    }
    const templateId = template_id || niche;
    if (!nicheTemplates[templateId]) {
      return res.status(400).json({
        success: false,
        message: `template_id must be one of: ${Object.keys(nicheTemplates).join(', ')}`,
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO outreach_campaigns
           (name, niche, cities, template_id, daily_cap, starts_at, status)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()),'active')
         RETURNING *`,
        [
          name,
          niche,
          JSON.stringify(cities),
          templateId,
          daily_cap,
          starts_at || null,
        ]
      );
      res.json({ success: true, campaign: result.rows[0] });
    } catch (err) {
      console.error('Create campaign error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /campaigns/:id — detail + last 50 emails
  router.get('/campaigns/:id', async (req, res) => {
    try {
      const c = await pool.query(`SELECT * FROM outreach_campaigns WHERE id = $1`, [req.params.id]);
      if (c.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      const emails = await pool.query(
        `SELECT oe.*, p.business_name, p.email AS prospect_email, p.city
         FROM outreach_emails oe
         JOIN prospects p ON p.id = oe.prospect_id
         WHERE oe.campaign_id = $1
         ORDER BY oe.sent_at DESC
         LIMIT 50`,
        [req.params.id]
      );
      res.json({ success: true, campaign: c.rows[0], recent_emails: emails.rows });
    } catch (err) {
      console.error('Get campaign error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /campaigns/:id/pause
  router.post('/campaigns/:id/pause', async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE outreach_campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      res.json({ success: true, campaign: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /campaigns/:id/resume
  router.post('/campaigns/:id/resume', async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE outreach_campaigns SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }
      res.json({ success: true, campaign: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // POST /campaigns/test — render one email and send to test_email (no DB writes)
  router.post('/campaigns/test', async (req, res) => {
    const {
      niche,
      template_id,
      test_email,
      business_name = 'Sample Business LLC',
      city = 'Miami',
    } = req.body || {};

    if (!test_email) {
      return res.status(400).json({ success: false, message: 'test_email is required' });
    }
    const templateId = template_id || niche;
    if (!templateId || !nicheTemplates[templateId]) {
      return res.status(400).json({
        success: false,
        message: `niche/template_id must be one of: ${Object.keys(nicheTemplates).join(', ')}`,
      });
    }

    try {
      const personalization = await personalizeEmail({
        businessName: business_name,
        niche: templateId,
        city,
      });
      const html = renderOutreachEmail({
        niche: templateId,
        businessName: business_name,
        city,
        introHtml: personalization.intro_html,
        prospectId: 'test',
      });

      const sent = await sendEmail({
        to: test_email,
        from: fromAddress(),
        replyTo: replyTo(),
        subject: personalization.subject,
        html,
        emailType: 'merktop_outreach_test',
      });

      res.json({
        success: sent.success,
        emailId: sent.emailId,
        subject: personalization.subject,
        intro_html: personalization.intro_html,
        ai_usage: personalization.usage,
        ai_fallback: personalization.fallback,
        send_error: sent.error,
      });
    } catch (err) {
      console.error('Campaign test error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
