// NPI Registry service — search physicians by specialty/location.
// Public CMS API: https://npiregistry.cms.hhs.gov/api

const BASE_URL = 'https://npiregistry.cms.hhs.gov/api';

export const npiService = {
  async searchDoctors({ specialty, state, city, credential, limit = 20 } = {}) {
    const params = new URLSearchParams({
      version: '2.1',
      enumeration_type: 'NPI-1',
      limit: String(limit),
    });
    if (specialty) params.set('taxonomy_description', specialty);
    if (state) params.set('state', state);
    if (city) params.set('city', city);

    let data;
    try {
      const res = await fetch(`${BASE_URL}/?${params.toString()}`);
      if (!res.ok) return { total: 0, doctors: [], error: 'NPI API unavailable' };
      data = await res.json();
    } catch {
      return { total: 0, doctors: [], error: 'NPI API unavailable' };
    }

    const results = data.results || [];
    const doctors = results.map((r) => {
      const basic = r.basic || {};
      const addresses = r.addresses || [];
      const taxonomies = r.taxonomies || [];
      const location = addresses.find((a) => a.address_purpose === 'LOCATION') || addresses[0] || {};
      const primary = taxonomies.find((t) => t.primary) || taxonomies[0] || {};
      return {
        npi: r.number,
        name: `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
        credential: basic.credential || '',
        specialty: primary.desc || specialty,
        organization: basic.organization_name || '',
        address: location.address_1 || '',
        city: location.city || '',
        state: location.state || '',
        zip: location.postal_code || '',
        phone: location.telephone_number || '',
        npi_status: basic.status || 'A',
        last_updated: basic.last_updated || '',
        compliance_score: basic.status === 'A' ? 80 : 20,
      };
    });

    const filtered = credential
      ? doctors.filter((d) => (d.credential || '').toUpperCase().includes(credential.toUpperCase()))
      : doctors;

    return { total: data.result_count || filtered.length, doctors: filtered, specialty, state };
  },
};
