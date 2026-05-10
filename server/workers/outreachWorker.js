import { sendEmail } from '../utils/email.js';
import { personalizeEmail } from '../utils/anthropic.js';
import { nicheTemplates, renderOutreachEmail } from '../templates/merktopOutreach.js';

const TICK_MS = 60 * 1000;
const BATCH_SIZE_PER_TICK = 10;
const SEND_GAP_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fromAddress = () =>
  process.env.MERKTOP_FROM_EMAIL || 'Marc at Merktop <hello@merktop.com>';
const replyTo = () => process.env.MERKTOP_REPLY_TO || 'hello@merktop.com';

const processCampaign = async (pool, campaign) => {
  const sentTodayRow = await pool.query(
    `SELECT COUNT(*)::int AS n FROM outreach_emails
     WHERE campaign_id = $1 AND created_at >= date_trunc('day', NOW())`,
    [campaign.id]
  );
  const sentToday = sentTodayRow.rows[0].n;
  const remainingToday = campaign.daily_cap - sentToday;
  if (remainingToday <= 0) return { campaign_id: campaign.id, skipped: 'daily_cap_reached' };

  const batchSize = Math.min(BATCH_SIZE_PER_TICK, remainingToday);

  const cities = Array.isArray(campaign.cities) ? campaign.cities : [];
  const cityFilter = cities.length > 0 ? `AND p.city = ANY($2::text[])` : '';

  const prospectsQuery = `
    SELECT p.* FROM prospects p
    WHERE p.niche = $1
      AND p.has_website = false
      AND p.do_not_contact = false
      AND p.email IS NOT NULL
      AND p.email <> ''
      AND p.status IN ('new')
      AND NOT EXISTS (
        SELECT 1 FROM outreach_emails oe WHERE oe.prospect_id = p.id
      )
      ${cityFilter}
    ORDER BY p.created_at ASC
    LIMIT ${batchSize}
  `;
  const params = cities.length > 0 ? [campaign.niche, cities] : [campaign.niche];
  const { rows: prospects } = await pool.query(prospectsQuery, params);

  if (prospects.length === 0) {
    return { campaign_id: campaign.id, skipped: 'no_eligible_prospects' };
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    try {
      const personalization = await personalizeEmail({
        businessName: p.business_name,
        niche: campaign.template_id,
        city: p.city,
      });
      const html = renderOutreachEmail({
        niche: campaign.template_id,
        businessName: p.business_name,
        city: p.city,
        introHtml: personalization.intro_html,
        prospectId: p.id,
      });

      const sendResult = await sendEmail({
        to: p.email,
        from: fromAddress(),
        replyTo: replyTo(),
        subject: personalization.subject,
        html,
        emailType: 'merktop_outreach',
        relatedId: p.id,
      });

      if (sendResult.success) {
        await pool.query(
          `INSERT INTO outreach_emails
             (campaign_id, prospect_id, resend_email_id, subject, status, sent_at)
           VALUES ($1, $2, $3, $4, 'sent', NOW())
           ON CONFLICT (campaign_id, prospect_id) DO NOTHING`,
          [campaign.id, p.id, sendResult.emailId, personalization.subject]
        );
        await pool.query(
          `UPDATE prospects SET status = 'contacted', last_contacted_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [p.id]
        );
        sent++;
      } else {
        failed++;
        console.warn(`Send failed for ${p.email}: ${sendResult.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`Worker error for prospect ${p.id} (${p.business_name}):`, err.message);
    }

    if (i < prospects.length - 1) await sleep(SEND_GAP_MS);
  }

  return { campaign_id: campaign.id, sent, failed };
};

const processOutreachCampaigns = async (pool) => {
  try {
    const { rows: campaigns } = await pool.query(
      `SELECT * FROM outreach_campaigns
       WHERE status = 'active' AND starts_at <= NOW()
       ORDER BY created_at ASC`
    );
    if (campaigns.length === 0) return;

    for (const c of campaigns) {
      if (!nicheTemplates[c.template_id]) {
        console.warn(`Campaign ${c.id} has unknown template_id ${c.template_id}, skipping`);
        continue;
      }
      const result = await processCampaign(pool, c);
      if (result.sent || result.failed) {
        console.log(
          `📮 Merktop outreach campaign ${c.id} (${c.niche}): sent=${result.sent || 0} failed=${result.failed || 0}`
        );
      }
    }
  } catch (err) {
    console.error('Outreach worker tick error:', err);
  }
};

export const startOutreachWorker = (pool) => {
  setInterval(() => processOutreachCampaigns(pool), TICK_MS);
  console.log('📮 Merktop outreach worker started (checks every 60s)');
};
