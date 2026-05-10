import { request } from 'undici';

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.types',
  'places.primaryType',
  'nextPageToken',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLACES_TYPE_TO_NICHE = {
  restaurant: 'restaurants',
  cafe: 'restaurants',
  bakery: 'restaurants',
  meal_takeaway: 'restaurants',
  meal_delivery: 'restaurants',
  bar: 'restaurants',
  beauty_salon: 'salons',
  hair_care: 'salons',
  nail_salon: 'salons',
  spa: 'salons',
  barber_shop: 'salons',
  gym: 'gyms',
  fitness_center: 'gyms',
  yoga_studio: 'gyms',
  dentist: 'dentists',
  dental_clinic: 'dentists',
  lawyer: 'lawyers',
  legal_services: 'lawyers',
  real_estate_agency: 'real_estate',
  plumber: 'contractors',
  electrician: 'contractors',
  roofing_contractor: 'contractors',
  general_contractor: 'contractors',
  hvac_contractor: 'contractors',
  painter: 'contractors',
  car_repair: 'auto_repair',
  car_dealer: 'auto_repair',
  auto_parts_store: 'auto_repair',
  cleaning_service: 'cleaning_services',
  laundry: 'cleaning_services',
  doctor: 'medical_clinics',
  medical_clinic: 'medical_clinics',
  chiropractor: 'medical_clinics',
  veterinary_care: 'medical_clinics',
};

export const classifyNiche = (types) => {
  if (!Array.isArray(types)) return null;
  for (const t of types) {
    const niche = PLACES_TYPE_TO_NICHE[t];
    if (niche) return niche;
  }
  return null;
};

const callTextSearch = async ({ apiKey, textQuery, pageToken }) => {
  const body = pageToken ? { pageToken } : { textQuery, regionCode: 'US' };
  const { statusCode, body: resBody } = await request(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  const text = await resBody.text();
  if (statusCode >= 400) {
    throw new Error(`Google Places ${statusCode}: ${text}`);
  }
  return JSON.parse(text);
};

/**
 * Search businesses by niche keyword + city in Florida.
 * Paginates internally up to `limit` results.
 * Returns array of normalized prospect rows (no DB writes here).
 */
export const searchBusinesses = async ({ niche, city, limit = 60 }) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const textQuery = `${niche} in ${city}, FL`;
  const collected = [];
  let pageToken = null;

  while (collected.length < limit) {
    const data = await callTextSearch({
      apiKey,
      textQuery: pageToken ? undefined : textQuery,
      pageToken,
    });
    const places = data.places || [];
    for (const p of places) {
      collected.push({
        place_id: p.id,
        business_name: p.displayName?.text || 'Unknown',
        formatted_address: p.formattedAddress || null,
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        website: p.websiteUri || null,
        has_website: Boolean(p.websiteUri),
        google_types: p.types || [],
        inferred_niche: classifyNiche(p.types) || niche,
        city,
      });
      if (collected.length >= limit) break;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await sleep(2000);
  }

  return collected;
};
