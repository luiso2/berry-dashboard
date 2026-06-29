// PeptideConnect REST routes. Factory pattern mirrors server/modules/guests.js.
// Mounted at /api/v1/peptide in server/index.js.

import express from 'express';
import { runAgent } from './agent/runAgent.js';
import { marketIntel } from './services/marketIntel.js';
import { emailService } from './services/emailService.js';
import { queries } from './queries.js';

export const createPeptideRoutes = (pool) => {
  const router = express.Router();

  // --- AI agent chat -------------------------------------------------------
  router.post('/agent/chat', async (req, res) => {
    const { messages, conversation_id } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const userId = req.user?.id ? String(req.user.id) : null;

    try {
      const ctx = { pool, userId };
      const { response, toolsUsed } = await runAgent(
        messages.map((m) => ({ role: m.role, content: m.content })),
        ctx
      );

      // Persist conversation + last exchange (best-effort).
      try {
        let convoId = conversation_id;
        if (!convoId) {
          const firstUser = messages.find((m) => m.role === 'user');
          const title = (firstUser?.content || 'Conversación').slice(0, 80);
          const c = await pool.query(
            'INSERT INTO peptide_chat_conversations (user_id, title) VALUES ($1,$2) RETURNING id',
            [userId, title]
          );
          convoId = c.rows[0].id;
        }
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUser) {
          await pool.query(
            'INSERT INTO peptide_chat_messages (conversation_id, role, content) VALUES ($1,$2,$3)',
            [convoId, 'user', lastUser.content]
          );
        }
        await pool.query(
          'INSERT INTO peptide_chat_messages (conversation_id, role, content, tool_calls) VALUES ($1,$2,$3,$4)',
          [convoId, 'assistant', response, JSON.stringify(toolsUsed || [])]
        );
        return res.json({ response, conversation_id: convoId, tools_used: toolsUsed });
      } catch {
        return res.json({ response, tools_used: toolsUsed });
      }
    } catch (error) {
      console.error('Peptide agent error:', error);
      return res.status(500).json({ error: 'Agent unavailable', detail: error.message });
    }
  });

  // --- Read endpoints powering the dashboard cards -------------------------
  router.get('/suppliers', async (req, res) => {
    try {
      const rows = await queries.getSuppliers(pool, {
        peptide_name: req.query.peptide,
        min_compliance_score: Number(req.query.min_score) || 0,
        dmf_status: req.query.dmf_status || 'all',
        limit: Number(req.query.limit) || 50,
      });
      res.json({ suppliers: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/pharmacies', async (req, res) => {
    try {
      const rows = await queries.getPharmacies(pool, {
        state: req.query.state,
        peptide: req.query.peptide,
        min_compliance_score: Number(req.query.min_score) || 0,
        nabp_only: req.query.nabp_only === 'true',
        limit: Number(req.query.limit) || 50,
      });
      res.json({ pharmacies: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/doctors', async (req, res) => {
    try {
      const rows = await queries.getDoctors(pool, {
        specialty: req.query.specialty,
        state: req.query.state,
        city: req.query.city,
        limit: Number(req.query.limit) || 50,
      });
      res.json({ doctors: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/opportunities', async (req, res) => {
    try {
      const rows = await queries.getOpportunities(pool, { limit: Number(req.query.limit) || 50 });
      res.json({ opportunities: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/peptides', async (req, res) => {
    try {
      const rows = await queries.getPeptides(pool, { category: req.query.category });
      res.json({ peptides: rows, total: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/intel', async (req, res) => {
    try {
      const data = await marketIntel.get({ focus: req.query.focus || 'all', peptide: req.query.peptide });
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // --- Create a match ------------------------------------------------------
  router.post('/matches', async (req, res) => {
    try {
      const result = await queries.createMatch(pool, req.body || {});
      res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // --- Draft an outreach email (used by the UI directly) -------------------
  router.post('/email/draft', async (req, res) => {
    try {
      const draft = await emailService.draft(req.body || {});
      res.json(draft);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
