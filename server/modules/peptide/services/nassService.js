// USDA NASS QuickStats — amino-acid feedstock commodity prices as a leading
// indicator for peptide API costs. https://quickstats.nass.usda.gov/api

const BASE_URL = 'https://quickstats.nass.usda.gov/api/api_GET/';
const API_KEY = process.env.NASS_API_KEY;

export const nassService = {
  async getCommodityPrices({ commodity = 'CORN' } = {}) {
    if (!API_KEY) return { commodity, prices: [], trend: 'unavailable', insight: 'NASS_API_KEY not configured' };
    const params = new URLSearchParams({
      key: API_KEY,
      commodity_desc: commodity,
      statisticcat_desc: 'PRICE RECEIVED',
      year__GE: '2023',
      format: 'JSON',
    });

    let data;
    try {
      const res = await fetch(`${BASE_URL}?${params.toString()}`);
      if (!res.ok) return { commodity, prices: [], trend: 'unavailable' };
      data = await res.json();
    } catch {
      return { commodity, prices: [], trend: 'unavailable' };
    }

    const items = data.data || [];
    const prices = items.slice(0, 20).map((i) => ({
      period: `${i.year} ${i.reference_period_desc}`,
      value: i.Value || 'N/A',
      unit: i.unit_desc || '',
      state: i.state_alpha || 'US',
    }));

    return {
      commodity,
      prices,
      relevance: 'Amino acid feedstock for peptide synthesis',
      insight: 'Price increases in corn/soy can signal higher peptide API costs in 60-90 days',
    };
  },
};
