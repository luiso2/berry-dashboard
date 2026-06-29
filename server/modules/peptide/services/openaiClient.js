// Thin OpenAI chat-completions wrapper (matches the fetch pattern used
// elsewhere in server/index.js). Supports tool/function calling.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.PEPTIDE_OPENAI_MODEL || 'gpt-4o-mini';

export async function chatCompletion({ messages, system, tools, max_tokens = 1024, temperature = 0.7 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const msgs = system ? [{ role: 'system', content: system }, ...(messages || [])] : (messages || []);
  const body = { model: MODEL, messages: msgs, max_tokens, temperature };
  if (tools) { body.tools = tools; body.tool_choice = 'auto'; }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }
  return res.json();
}
