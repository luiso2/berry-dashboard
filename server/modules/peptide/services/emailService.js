// Email service — drafts B2B outreach with OpenAI and sends via the existing
// Resend helper (server/utils/email.js). Logs to peptide_outreach_emails.

import { sendEmail } from '../../../utils/email.js';
import { chatCompletion } from './openaiClient.js';

const SYSTEM_TEMPLATES = {
  supplier_introduction:
    'You are a professional B2B pharmaceutical outreach specialist. Draft a concise, professional email to a peptide API supplier. Introduce our marketplace platform and invite them to list their products. No medical claims. Focus on business opportunity.',
  pharmacy_shortage_alert:
    'Draft an email to a 503B compounding pharmacy alerting them about a drug shortage and offering to connect them with verified suppliers. Be specific about the shortage and the business opportunity.',
  doctor_invitation:
    'Draft an email inviting a physician to join our platform for streamlined access to verified compounding pharmacies for their peptide therapy patients. HIPAA-aware, professional tone.',
};

export const emailService = {
  async draft({ recipient_type, recipient_name, purpose, peptide_focus, custom_context, language = 'english' }) {
    const system = SYSTEM_TEMPLATES[`${recipient_type}_${purpose}`] || SYSTEM_TEMPLATES.supplier_introduction;
    const lang = language === 'spanish' ? 'Write in Spanish.' : 'Write in English.';

    const user = `Write a professional B2B email for:
- Recipient Type: ${(recipient_type || '').toUpperCase()}
- Recipient Name: ${recipient_name}
- Email Purpose: ${purpose}
- Peptide Focus: ${peptide_focus || 'General peptide supply chain'}
- Additional Context: ${custom_context || 'None'}
- ${lang}

Requirements:
- Subject line included
- Under 200 words
- Clear call-to-action
- Professional signature from PeptideConnect
- No medical efficacy claims
- Reference specific business value

Format your response exactly as:
SUBJECT: [subject line]
BODY: [email body]`;

    let content;
    try {
      const resp = await chatCompletion({ system, messages: [{ role: 'user', content: user }], max_tokens: 500 });
      content = resp.choices?.[0]?.message?.content || '';
    } catch (e) {
      return { error: e.message, ready_to_send: false };
    }

    let subject = '';
    const bodyLines = [];
    let inBody = false;
    for (const line of content.split('\n')) {
      if (line.startsWith('SUBJECT:')) subject = line.replace('SUBJECT:', '').trim();
      else if (line.startsWith('BODY:')) { inBody = true; const rest = line.replace('BODY:', '').trim(); if (rest) bodyLines.push(rest); }
      else if (inBody) bodyLines.push(line);
    }

    return {
      subject: subject || `PeptideConnect — ${purpose}`,
      body: bodyLines.join('\n').trim() || content.trim(),
      recipient_type,
      recipient_name,
      ready_to_send: true,
    };
  },

  async send({ to_email, subject, body, to_name, recipient_id, recipient_type }, ctx = {}) {
    let result;
    try {
      result = await sendEmail({
        to: to_email,
        subject,
        html: body.includes('<') ? body : body.replace(/\n/g, '<br>'),
      });
    } catch (e) {
      result = { success: false, error: e.message };
    }

    // Log the attempt regardless of outcome.
    if (ctx.pool) {
      try {
        await ctx.pool.query(
          `INSERT INTO peptide_outreach_emails (user_id, recipient_type, recipient_id, recipient_email, recipient_name, subject, body, provider_message_id, status, sent_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            ctx.userId || null,
            recipient_type || null,
            recipient_id && /^[0-9a-f-]{36}$/i.test(recipient_id) ? recipient_id : null,
            to_email,
            to_name || null,
            subject,
            body,
            result.emailId || null,
            result.success ? 'sent' : 'failed',
            result.success ? new Date().toISOString() : null,
          ]
        );
      } catch { /* logging best-effort */ }
    }

    return result.success
      ? { success: true, message_id: result.emailId, to: to_email, subject, status: 'sent' }
      : { success: false, error: result.error, status: 'failed' };
  },
};
