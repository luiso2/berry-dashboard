// PeptideConnect agent — OpenAI function-calling agentic loop.
// Dispatches tool calls to the services/DB, feeds results back, and returns
// the final assistant text.

import { SYSTEM_PROMPT } from './prompts.js';
import { TOOLS } from './tools.js';
import { chatCompletion } from '../services/openaiClient.js';
import { fdaService } from '../services/fdaService.js';
import { npiService } from '../services/npiService.js';
import { trialsService } from '../services/trialsService.js';
import { complianceService } from '../services/complianceService.js';
import { emailService } from '../services/emailService.js';
import { marketIntel } from '../services/marketIntel.js';
import { queries } from '../queries.js';

const MAX_TURNS = 8;

async function executeTool(name, args, ctx) {
  const { pool } = ctx;
  switch (name) {
    case 'search_suppliers': {
      const suppliers = await queries.getSuppliers(pool, args);
      const recalls = await fdaService.searchSuppliers({ peptide_name: args.peptide_name });
      return { count: suppliers.length, suppliers, fda_recalls: recalls };
    }
    case 'search_pharmacies': {
      const pharmacies = await queries.getPharmacies(pool, args);
      return { count: pharmacies.length, pharmacies };
    }
    case 'search_doctors': {
      const live = await npiService.searchDoctors(args);
      if (live.doctors && live.doctors.length) return live;
      const fallback = await queries.getDoctors(pool, args); // seed fallback
      return { total: fallback.length, doctors: fallback, source: 'database' };
    }
    case 'get_drug_shortages':
      return fdaService.getShortages(args);
    case 'get_compliance_score':
      return complianceService.calculate(args, ctx);
    case 'create_match':
      return queries.createMatch(pool, args);
    case 'draft_email':
      return emailService.draft(args);
    case 'send_email':
      return emailService.send(args, ctx);
    case 'get_market_intel':
      return marketIntel.get(args);
    case 'get_peptide_status':
      return fdaService.getPeptideStatus(args);
    case 'get_clinical_trials':
      return trialsService.search(args);
    default:
      return { error: `Tool ${name} no encontrada` };
  }
}

// messages: [{ role: 'user'|'assistant', content }]
export async function runAgent(messages, ctx) {
  const convo = [...messages];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await chatCompletion({
      system: SYSTEM_PROMPT,
      messages: convo,
      tools: TOOLS,
      max_tokens: 1500,
    });

    const choice = resp.choices?.[0];
    const msg = choice?.message;
    if (!msg) return { response: '⚠️ El agente no devolvió respuesta.', toolsUsed: [] };

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length || choice.finish_reason !== 'tool_calls') {
      return { response: msg.content || '', toolsUsed: ctx._toolsUsed || [] };
    }

    // Record the assistant turn that requested the tools.
    convo.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });
    ctx._toolsUsed = ctx._toolsUsed || [];

    for (const call of toolCalls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
      ctx._toolsUsed.push(call.function.name);
      let result;
      try {
        result = await executeTool(call.function.name, args, ctx);
      } catch (e) {
        result = { error: e.message, tool: call.function.name };
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { response: '⚠️ Se alcanzó el límite de pasos del agente. Reformula tu petición.', toolsUsed: ctx._toolsUsed || [] };
}
