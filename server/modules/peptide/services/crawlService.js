// Common Crawl enrichment (best-effort) — guesses a company domain and pulls
// candidate contact emails/phones. Used once when importing a new entity.
// Never on the critical path; fails gracefully.

const INDEX = 'https://index.commoncrawl.org/CC-MAIN-2025-26-index';

function guessDomain(companyName) {
  let clean = (companyName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
  clean = clean.replace(/\b(inc|llc|corp|ltd|group|americas|international)\b/g, '');
  clean = clean.trim().replace(/\s+/g, '');
  return clean ? `${clean}.com` : '';
}

function extractEmails(text) {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(m)]
    .filter((e) => !['example', 'test', 'noreply', 'donotreply'].some((s) => e.includes(s)))
    .slice(0, 5);
}

function extractPhones(text) {
  const m = text.match(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
  return [...new Set(m)].slice(0, 3);
}

export const crawlService = {
  async enrichEntity({ company_name }) {
    const domain = guessDomain(company_name);
    if (!domain) return { website: null, emails_found: [], phones_found: [], purchasing_email: null };

    let text = '';
    try {
      const res = await fetch(`${INDEX}?url=${encodeURIComponent(`${domain}/contact*`)}&output=json&limit=3`);
      if (res.ok) text = await res.text();
    } catch { /* ignore */ }

    const emails = extractEmails(text);
    const phones = extractPhones(text);
    return {
      website: `https://${domain}`,
      emails_found: emails,
      phones_found: phones,
      purchasing_email:
        emails.find((e) => ['purchasing', 'sales', 'orders', 'info'].some((kw) => e.includes(kw))) || emails[0] || null,
    };
  },
};
