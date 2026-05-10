const BASE_PORTFOLIO = 'https://merktop.com/portfolio';
const CONTACT_URL = process.env.MERKTOP_CONTACT_URL || 'https://merktop.com';

const renderTemplate = ({
  businessName,
  city,
  introHtml,
  portfolioUrl,
  portfolioLabel,
  unsubscribeUrl,
}) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeAttr(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f1ea;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b8865b;font-family:Georgia,serif;">Merktop &middot; Florida</div>
            <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:#1a1a1a;font-family:Georgia,serif;font-weight:normal;">A premium website for <em>${escapeAttr(businessName)}</em></h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            ${introHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 16px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#1a1a1a;">
              Here is a recent ${escapeAttr(portfolioLabel)} site I built &mdash;
              <a href="${escapeAttr(portfolioUrl)}" style="color:#b8865b;text-decoration:underline;">${escapeAttr(portfolioUrl)}</a>.
              Yours would be in the same league.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 16px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f1ea;border-radius:8px;">
              <tr>
                <td style="padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#b8865b;">What you get for $600</div>
                  <ul style="margin:8px 0 0 0;padding-left:18px;font-size:15px;line-height:1.6;color:#1a1a1a;">
                    <li>Custom-designed website, mobile-first, deployed in 7&ndash;10 days</li>
                    <li>A Claude AI assistant on your site (answers questions in English &amp; Spanish, books appointments, captures leads)</li>
                    <li>Basic automation: lead notifications, follow-up emails, calendar sync</li>
                    <li>SEO setup so ${escapeAttr(city)} customers can actually find you</li>
                  </ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 24px 32px;">
            <a href="${escapeAttr(CONTACT_URL)}" style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;border-radius:6px;">Reply YES and I&rsquo;ll send a 5-minute Loom for ${escapeAttr(businessName)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:14px;line-height:1.5;color:#5a5a5a;">&mdash; Marc, Merktop</p>
            <p style="margin:4px 0 0 0;font-size:12px;line-height:1.5;color:#9a9a9a;">I only take 8 new clients a month. If now isn&rsquo;t the right time, just ignore this email and I won&rsquo;t follow up.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:center;">
            <p style="margin:0;font-size:11px;line-height:1.5;color:#9a9a9a;">
              Merktop &middot; Florida, USA &middot;
              <a href="${escapeAttr(unsubscribeUrl)}" style="color:#9a9a9a;">unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

const escapeAttr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const nicheTemplates = {
  restaurants: {
    label: 'Restaurants & Cafes',
    portfolio_url: `${BASE_PORTFOLIO}/restaurants`,
    portfolio_label: 'restaurant',
    google_places_types: ['restaurant', 'cafe', 'bakery', 'meal_takeaway', 'bar'],
  },
  salons: {
    label: 'Salons, Barbers & Spas',
    portfolio_url: `${BASE_PORTFOLIO}/salons`,
    portfolio_label: 'salon',
    google_places_types: ['beauty_salon', 'hair_care', 'nail_salon', 'spa', 'barber_shop'],
  },
  gyms: {
    label: 'Gyms & Fitness Studios',
    portfolio_url: `${BASE_PORTFOLIO}/gyms`,
    portfolio_label: 'gym',
    google_places_types: ['gym', 'fitness_center', 'yoga_studio'],
  },
  dentists: {
    label: 'Dentists & Dental Clinics',
    portfolio_url: `${BASE_PORTFOLIO}/dentists`,
    portfolio_label: 'dental practice',
    google_places_types: ['dentist', 'dental_clinic'],
  },
  lawyers: {
    label: 'Law Firms',
    portfolio_url: `${BASE_PORTFOLIO}/lawyers`,
    portfolio_label: 'law firm',
    google_places_types: ['lawyer', 'legal_services'],
  },
  real_estate: {
    label: 'Real Estate Agents',
    portfolio_url: `${BASE_PORTFOLIO}/real-estate`,
    portfolio_label: 'real estate agent',
    google_places_types: ['real_estate_agency'],
  },
  contractors: {
    label: 'Contractors & Trades',
    portfolio_url: `${BASE_PORTFOLIO}/contractors`,
    portfolio_label: 'contractor',
    google_places_types: [
      'plumber',
      'electrician',
      'roofing_contractor',
      'general_contractor',
      'hvac_contractor',
      'painter',
    ],
  },
  auto_repair: {
    label: 'Auto Repair Shops',
    portfolio_url: `${BASE_PORTFOLIO}/auto-repair`,
    portfolio_label: 'auto shop',
    google_places_types: ['car_repair', 'car_dealer', 'auto_parts_store'],
  },
  cleaning_services: {
    label: 'Cleaning Services',
    portfolio_url: `${BASE_PORTFOLIO}/cleaning`,
    portfolio_label: 'cleaning service',
    google_places_types: ['cleaning_service', 'laundry'],
  },
  medical_clinics: {
    label: 'Medical Clinics',
    portfolio_url: `${BASE_PORTFOLIO}/medical`,
    portfolio_label: 'medical clinic',
    google_places_types: ['doctor', 'medical_clinic', 'chiropractor', 'veterinary_care'],
  },
};

export const listTemplates = () =>
  Object.entries(nicheTemplates).map(([id, t]) => ({
    id,
    label: t.label,
    portfolio_url: t.portfolio_url,
    google_places_types: t.google_places_types,
  }));

export const renderOutreachEmail = ({ niche, businessName, city, introHtml, prospectId }) => {
  const template = nicheTemplates[niche] || nicheTemplates.restaurants;
  const unsubscribeUrl = `mailto:${
    process.env.MERKTOP_REPLY_TO || 'hello@merktop.com'
  }?subject=unsubscribe%20${encodeURIComponent(businessName)}&body=Please%20remove%20prospect%20${prospectId || ''}`;
  return renderTemplate({
    businessName,
    city,
    introHtml,
    portfolioUrl: template.portfolio_url,
    portfolioLabel: template.portfolio_label,
    unsubscribeUrl,
  });
};
