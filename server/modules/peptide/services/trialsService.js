// ClinicalTrials.gov v2 API — peptide trials (signals which peptides are
// progressing toward approval). https://clinicaltrials.gov/api/v2

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

export const trialsService = {
  async search({ peptide, phase = 'all', status = 'RECRUITING', limit = 10 } = {}) {
    const params = new URLSearchParams({ pageSize: String(limit), format: 'json' });
    if (peptide) params.set('query.term', peptide);
    if (status && status !== 'all') params.set('filter.overallStatus', status);

    let data;
    try {
      const res = await fetch(`${BASE_URL}?${params.toString()}`);
      if (!res.ok) return { total: 0, trials: [], error: 'ClinicalTrials API unavailable' };
      data = await res.json();
    } catch {
      return { total: 0, trials: [], error: 'ClinicalTrials API unavailable' };
    }

    const studies = data.studies || [];
    let trials = studies.map((s) => {
      const proto = s.protocolSection || {};
      const id = proto.identificationModule || {};
      const statusMod = proto.statusModule || {};
      const design = proto.designModule || {};
      const sponsor = proto.sponsorCollaboratorsModule || {};
      return {
        nct_id: id.nctId,
        title: id.briefTitle,
        status: statusMod.overallStatus,
        phase: (design.phases || []).join(', ') || 'N/A',
        sponsor: sponsor.leadSponsor?.name || '',
        start_date: statusMod.startDateStruct?.date || '',
      };
    });

    if (phase && phase !== 'all') {
      trials = trials.filter((t) => (t.phase || '').toUpperCase().replace(/\s/g, '').includes(phase.replace('PHASE', 'PHASE')));
    }

    return { total: trials.length, trials, peptide: peptide || null };
  },
};
