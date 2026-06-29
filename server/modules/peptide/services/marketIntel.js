// Combined market intelligence — blends FDA shortages, clinical trials and
// USDA commodity pricing into one snapshot for the agent and the dashboard.

import { fdaService } from './fdaService.js';
import { trialsService } from './trialsService.js';
import { nassService } from './nassService.js';
import { PCAC_REVIEW_DATE } from '../constants.js';

export const marketIntel = {
  async get({ focus = 'all', peptide } = {}) {
    const out = { focus, peptide: peptide || null };

    if (focus === 'all' || focus === 'shortages') {
      out.shortages = await fdaService.getShortages({
        search_term: peptide || 'peptide sermorelin tirzepatide semaglutide',
        status: 'active',
      });
    }
    if (focus === 'all' || focus === 'trials') {
      out.trials = await trialsService.search({ peptide: peptide || 'peptide', status: 'RECRUITING', limit: 5 });
    }
    if (focus === 'all' || focus === 'pricing') {
      out.pricing = await nassService.getCommodityPrices({ commodity: 'CORN' });
    }
    if (focus === 'all' || focus === 'regulatory') {
      out.regulatory = {
        pcac_meeting: PCAC_REVIEW_DATE,
        note: 'FDA Pharmacy Compounding Advisory Committee reviews 14 Category-2 peptides July 23-24, 2026.',
        category_2_watchlist: ['BPC-157', 'TB-500', 'AOD-9604', 'GHK-Cu'],
      };
    }
    return out;
  },
};
