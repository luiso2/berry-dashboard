import Anthropic from '@anthropic-ai/sdk';

let client = null;

const getClient = () => {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
};

const BRAND_GUIDE = `# Merktop Brand Guide for Cold Outreach

You are writing a cold outreach email on behalf of Marc, the founder of Merktop, a Florida-based premium web design studio. The goal: convince a local Florida business owner to reply and book a call about a $600 premium website that includes a Claude AI assistant and basic automation.

## Tone
- Warm, founder-to-founder, never corporate.
- Short sentences. Active voice. Plain English (no jargon like "synergy", "leverage", "solutions").
- One concrete observation about THIS business or its industry, not a generic compliment.
- No hype words: "amazing", "revolutionary", "game-changing", "best-in-class" — all banned.
- No fake urgency ("limited time", "act fast").
- No emojis. No exclamation marks. Period.

## Voice rules
- Write from "I" (Marc), not "we" or "Merktop".
- Reference the city the business is in if it adds local color.
- If the business name contains a person's name (e.g. "Tony's Auto"), feel free to address Tony directly by first name in the intro.
- Never lie. Don't say "I saw your Instagram" unless told to. Don't fabricate numbers.

## What we sell (do not invent extras)
- A premium custom website: $600 flat. Mobile-first, fast (~95+ Lighthouse), SEO-ready, deployed in 7-10 days.
- A Claude-powered AI chat assistant embedded in the site (answers customer questions in English/Spanish, books appointments, captures leads). Included.
- Basic automation (lead notifications, follow-up emails, calendar sync). Included.
- We are based in Florida and we only take 8 new clients per month, so capacity is real.

## The cold email structure (we render the body; you only write subject + intro_html)
1. SUBJECT (≤60 chars, lowercase-feel, no clickbait, no all caps, no spammy words like "free" or "$$$"). Mention the business name OR the city OR a niche-specific hook. Examples that work: "quick idea for {{business_name}}", "a website for {{business_name}}", "{{city}} {{niche}} idea".
2. INTRO_HTML (2 short paragraphs, total ≤90 words):
   - Paragraph 1: ONE sentence opening that names the business and shows you actually understand what they do. Then ONE sentence stating the problem (no website / weak website / losing local searches).
   - Paragraph 2: ONE sentence transitioning to "I built something you might like" — DO NOT mention the $600 price, the Claude assistant, the portfolio link, or the CTA. Those come later in the template, not in intro_html.
   - Wrap each paragraph in <p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#1a1a1a;">...</p>
   - No links, no images, no lists in intro_html.

## Output format
Return ONLY valid JSON matching the schema. No prose before or after. No markdown fences. No commentary.

---

## Niche-specific context (use as background, do not quote verbatim)

### restaurants
Pain: depending on third-party delivery apps (Uber Eats / DoorDash) that take 30% commission; phone reservations and walk-ins are unpredictable; no menu visible on Google; bad food photos hurt them.
Hook angle: their menu deserves better than a Google PDF; direct online orders avoid commission.

### salons
Pain: clients book through Instagram DMs or by phone; double-bookings; no-shows; no way to showcase before/after work professionally.
Hook angle: an online booking calendar and a gallery turns Instagram followers into paying clients on autopilot.

### gyms
Pain: class schedule lives on Instagram stories and disappears; no membership signup online; no testimonials surfaced; competitors look more legit.
Hook angle: a real schedule page, trial sign-ups, and trainer bios make a small studio feel like a chain.

### dentists
Pain: patients judge dentists by their website in the first 3 seconds; old WordPress sites kill trust; no online appointment requests; no insurance info upfront.
Hook angle: a clean, trustworthy site that lets new patients request appointments at 11pm without calling.

### lawyers
Pain: legal websites all look the same — bad stock photos, walls of text, no clear practice area; clients can't tell if you handle their case.
Hook angle: a focused practice-area page and a 24/7 intake form that filters good leads from tire-kickers.

### real_estate
Pain: relying on Zillow / Realtor.com sends leads to competitors; no personal brand; no neighborhood guides; outdated headshots.
Hook angle: a personal site with neighborhood pages and an instant valuation form keeps the lead — and the commission — with them.

### contractors
Pain: leads come from word of mouth or Thumbtack (which charges per lead); no project gallery; phone tag with potential clients.
Hook angle: a portfolio of past jobs, a quote-request form, and AI that pre-qualifies leads at 2am.

### auto_repair
Pain: customers Google "mechanic near me" and pick whoever has reviews and a website; if you have neither, you're invisible; appointment-by-phone-only loses younger drivers.
Hook angle: online appointment booking, services list with starting prices, and Google reviews surfaced on the homepage.

### cleaning_services
Pain: hiring a cleaner is a trust decision; no website means no trust; no online quote means no comparison; no recurring booking means no LTV.
Hook angle: an instant online quote, weekly/biweekly subscriptions, and an AI assistant answering "do you do move-outs?" at any hour.

### medical_clinics
Pain: patients want to see hours, insurance, and how to schedule before they call; old sites in Spanish-only or English-only miss half the FL market.
Hook angle: a bilingual site (English + Spanish) with hours, insurance accepted, and an online intake form built for FL demographics.

---

End of brand guide.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'Email subject line, 60 chars or fewer, no spammy words',
    },
    intro_html: {
      type: 'string',
      description: 'Two <p>-wrapped paragraphs of intro copy, ≤90 words total',
    },
  },
  required: ['subject', 'intro_html'],
  additionalProperties: false,
};

/**
 * Personalize a cold outreach email for one prospect.
 * The brand guide is sent in a cache_control system block — across a batch of
 * calls in the same campaign tick, only the per-business user message changes,
 * so the brand guide is served from cache (cost ~0.1x).
 *
 * Min cacheable prefix on Haiku 4.5 is 4096 tokens; the brand guide above
 * comfortably exceeds that.
 *
 * Returns: { subject, intro_html, usage }
 * Falls back to a deterministic non-personalized result if the API call fails.
 */
export const personalizeEmail = async ({ businessName, niche, city }) => {
  const fallback = {
    subject: `A premium website for ${businessName}`,
    intro_html:
      `<p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#1a1a1a;">Hi — I noticed ${businessName} in ${city} and saw you don't have a website yet.</p>` +
      `<p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#1a1a1a;">I build sites for small ${niche.replace(/_/g, ' ')} businesses in Florida and thought you'd want to see one.</p>`,
    usage: null,
    fallback: true,
  };

  try {
    const c = getClient();
    const response = await c.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: BRAND_GUIDE,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content:
            `Business name: ${businessName}\n` +
            `Niche: ${niche}\n` +
            `City: ${city}, Florida\n\n` +
            `Write the subject and intro_html for this prospect.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock?.text) throw new Error('No text in Claude response');

    const parsed = JSON.parse(textBlock.text);
    if (!parsed.subject || !parsed.intro_html) {
      throw new Error('Missing subject/intro_html in parsed output');
    }

    return {
      subject: parsed.subject.slice(0, 200),
      intro_html: parsed.intro_html,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens:
          response.usage.cache_creation_input_tokens || 0,
      },
      fallback: false,
    };
  } catch (err) {
    console.error(
      `Claude personalize error for ${businessName} (${niche}/${city}):`,
      err.message
    );
    return fallback;
  }
};
