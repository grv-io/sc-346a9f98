/*!
 * StainlessCarbon business layer — what the CBAM numbers are worth to Jindal Stainless, who owns what,
 * what a buyer's verifier receives, how JSL compares with the coil it competes against, and what changed
 * since Round 1. Pure functions, no DOM. Every number is either read from model.js at call time or is a
 * constant below with a status tag.
 *
 * Loading (same pattern as model.js, no build):
 *   <script src="model.js"></script><script src="business.js"></script>   → window.StainlessCarbonBiz
 *   import './model.js'; import './business.js'; const B = globalThis.StainlessCarbonBiz;   (Node / ESM)
 *   const B = require('./business.js');                                                     (CommonJS)
 *
 * Status tags (same vocabulary as MODEL_NOTES.md): JSL-assured · regulation · literature · derived ·
 * assumption · estimate (a labelled order-of-magnitude figure we could not source) · model (read live from model.js).
 */
(function (root, factory) {
  'use strict';
  var B = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = B;
  if (root) root.StainlessCarbonBiz = B;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
  'use strict';

  /* ------------------------------------------------------------------ model handle (resolved lazily) */
  function model() {
    var M = root && root.StainlessCarbon;
    if (!M && typeof require === 'function') { try { M = require('./model.js'); } catch (e) { /* not in Node */ } }
    if (!M || typeof M.compute !== 'function') throw new Error('StainlessCarbonBiz: load model.js before business.js');
    return M;
  }

  /* ------------------------------------------------------------------ helpers */
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : ((typeof v === 'string' && v.trim() !== '' && isFinite(+v)) ? +v : d);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;
  const crore = (eur, fx) => eur * fx / 1e7;                     // € → ₹ crore
  const pick = function () { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'number' && isFinite(v)) return v; } return undefined; };
  const fmtNum = x => String(Math.abs(x) >= 100 ? Math.round(x) : r1(x));
  const fmtCr = x => '₹' + fmtNum(x) + ' Cr';
  const rangeCr = (lo, hi) => '₹' + fmtNum(lo) + '–' + fmtNum(hi) + ' Cr';

  /* ------------------------------------------------------------------ constants (each with status + source) */
  // Where v4 of model.js adds a field (quota, duty, yield, route defaults) it is read first; these are fallbacks.
  const C = {
    indiaFlatQuota_t: { value: 64073, unit: 't/yr', status: 'regulation',
      source: 'EU steel safeguard, 2026 revision (Regulation (EU) 2026/1457): India stainless flat quota CR 38,054 t + HR 26,019 t, shared by all Indian mills' },
    outOfQuotaDuty: { value: 0.5, unit: 'ad valorem', status: 'regulation', source: 'EU steel safeguard, mid-2026 revision: out-of-quota duty raised from 25% to 50%' },
    quotaShare: { value: 0.6, unit: 'share of India quota', status: 'assumption',
      source: 'JSL holds ~50% of India\'s stainless market (company/CARE disclosures) and is the largest flat producer; share of the flat quota its buyers clear is our assumption. Data ask: quota usage by quarter' },
    iberjindalTonnes: { value: 30000, unit: 't/yr', status: 'literature', source: 'Iberjindal S.L. (Lucena, Spain), wholly owned: ~30 kt/yr processing capacity, ~€60M turnover' },
    iberjindalInstallation: { value: 'hisar', unit: '-', status: 'literature', source: 'Iberjindal sources primarily from JSL Hisar (Iberjindal disclosures); importer-of-record status to be confirmed' },
    passThrough: { value: 0.4, unit: 'share of buyer headroom', status: 'assumption',
      source: 'Share of the buyer\'s avoided CBAM cost JSL recovers in price or quota priority; 0.2–0.4 is the range we would defend. Contract carbon clause makes it explicit' },
    verifierFeeEur: { value: 30000, unit: '€/installation/yr', status: 'estimate', source: 'Order-of-magnitude fee for an accredited CBAM/ETS verifier (EU ETS verification market); replace with quotes' },
    siteVisitEur: { value: 15000, unit: '€/installation (first year)', status: 'estimate', source: 'First-year physical site visit is mandatory under CBAM verification rules; cost is our estimate (travel + 3–5 verifier days)' },
    yieldCrudeToGood: { value: 0.90, unit: 't good / t crude', status: 'assumption', source: 'Crude steel → cold-rolled coil yield ~0.90; CBAM specific embedded emissions are per tonne of GOOD' },
    indonesiaDefault2026: { value: 9.56, unit: 't CO2e/t', status: 'regulation', source: 'CBAM default values (IR 2025/2621): Indonesia stainless base 8.69, +10% 2026 mark-up = 9.56 (as used in Outokumpu\'s CBAM Q&A worked example)' },
    chinaDefault2026: { value: 6.15, unit: 't CO2e/t', status: 'literature', source: 'SMM (29 Jul 2026): China CN 7219 cold-rolled default 5.59 base, 6.15 with 2026 mark-up; not checked against the Annex' },
    outokumpuPCF: { value: 1.8, low: 1.6, high: 1.8, unit: 't CO2e/t', status: 'literature', source: 'Outokumpu disclosed average ~1.8 t CO2e/t crude stainless (cradle-to-gate incl. upstream); low-carbon product line ~1.5–1.6' },
    aperamPCF: { value: 1.8, low: 1.5, high: 2.0, unit: 't CO2e/t', status: 'estimate', source: 'Not sourced: EU scrap-EAF peer assumed similar to Outokumpu. Replace with Aperam\'s published product footprint/EPD' },
    euAntiDumping: { value: null, unit: '-', status: 'regulation', source: 'Indian and Indonesian stainless cold-rolled flats carry EU anti-dumping/countervailing duties (Reg (EU) 2021/2012 and follow-ups); company-specific, excluded from landed cost here' },
    exportMarginPct: { value: '8–14%', unit: 'EBIT on export sales', status: 'literature', source: 'Indian stainless exporters\' operating margin range (analyst notes)' }
  };
  const cv = k => C[k].value;

  // v4-aware reads (fall back to the constants above)
  function quotaTonnes(M) { return pick(M.QUOTA && M.QUOTA.indiaFlat_t, M.QUOTA && M.QUOTA.india_t, M.CBAM && M.CBAM.indiaFlatQuota_t, cv('indiaFlatQuota_t')); }
  function dutyRate(M) { return pick(M.QUOTA && M.QUOTA.outOfQuotaDuty, M.CBAM && M.CBAM.outOfQuotaDuty, cv('outOfQuotaDuty')); }
  function yieldGood(M) { return pick(M.YIELD && M.YIELD.crToGood, M.YIELD && M.YIELD.coil, M.EOL && M.EOL.yieldGood, cv('yieldCrudeToGood')); }
  function routeDefault(M, key, fallback) {
    const R = M.ROUTE_DEFAULTS || M.ROUTES || (M.CBAM && M.CBAM.countryDefaults) || null;
    if (!R) return fallback;
    const v = R[key];
    return pick(v, v && v.default2026, v && v.defaultE, fallback);
  }
  const instOf = st => (st.plant === 'company' ? 'jajpur' : st.plant);

  // CBAM 2026 (or chosen year) row for an installation, straight from model.js
  function cbamRow(M, st, inst, year) {
    const rows = M.cbamTable(Object.assign({}, st, { plant: inst }));
    return rows.find(r => r.year === year) || rows[0];
  }

  /* ================================================================== 1. capturedValue — the CFO's answer */
  /**
   * What the verification dividend is worth to JSL, not to the buyer, counted on in-quota tonnes only.
   *
   *   inQuota        = min(exportTonnes, quotaShare × India flat quota)
   *   Iberjindal     = min(iberjindalTonnes, inQuota)            JSL is importer of record → full saving lands in JSL consolidated
   *   thirdParty     = inQuota − Iberjindal                      buyer is importer of record → JSL gets passThrough of it
   *   headroom       = saving €/t × thirdParty                   what third-party buyers avoid vs default values
   *   captured       = headroom × passThrough                    (≤ headroom by construction)
   *   duty           = outOfQuotaDuty × CIF × (exportTonnes − inQuota)   charged only when outOfQuota = 'ship'
   *   net            = captured + Iberjindal direct − verification − duty charged
   *
   * Iberjindal tonnes are excluded from the third-party headroom so the same tonne is never counted twice.
   */
  function capturedValue(state, opts) {
    const M = model();
    opts = opts || {};
    const W = [];
    const st = M.normalize(Object.assign({}, state || M.defaultState(), pickDefined(opts, ['exportTonnes', 'fx', 'cifEur', 'benchmarkB'])));
    const year = [2026, 2027, 2028, 2029, 2030].includes(opts.year) ? opts.year : 2026;
    const exportTonnes = st.exportTonnes, fx = st.fx, cif = st.cifEur;
    const quota = quotaTonnes(M);
    const quotaShare = clamp(num(opts.quotaShare, cv('quotaShare')), 0, 1);
    const passThrough = clamp(num(opts.passThrough, cv('passThrough')), 0, 1);
    const ibTonnesIn = Math.max(0, num(opts.iberjindalTonnes, cv('iberjindalTonnes')));
    const exportInst = ['jajpur', 'hisar'].includes(opts.exportInstallation) ? opts.exportInstallation : instOf(st);
    const ibInst = ['jajpur', 'hisar'].includes(opts.iberjindalInstallation) ? opts.iberjindalInstallation : cv('iberjindalInstallation');
    const duty = clamp(num(opts.outOfQuotaDuty, dutyRate(M)), 0, 2);
    const policy = opts.outOfQuota === 'ship' ? 'ship' : 'divert';
    const verFee = Math.max(0, num(opts.verificationCostEur, cv('verifierFeeEur')));
    const siteVisit = Math.max(0, num(opts.siteVisitEur, cv('siteVisitEur')));
    const firstYear = opts.firstYear !== false;
    const installations = [exportInst, ibInst].filter((v, i, a) => a.indexOf(v) === i);
    const nInst = Math.max(1, Math.round(num(opts.installations, installations.length)));

    // €/t saving per installation (verified vs default), read from model.js
    const rowX = cbamRow(M, st, exportInst, year), rowIb = cbamRow(M, st, ibInst, year);
    const savingX = num(opts.savingEurPerT, rowX.saving);
    const savingIb = num(opts.savingEurPerT, rowIb.saving);
    if (opts.savingEurPerT !== undefined) W.push('savingEurPerT override used for every installation.');

    // tonnes
    const quotaCap = quotaShare * quota;
    const inQuota = Math.min(exportTonnes, quotaCap);
    const ibTonnes = Math.min(ibTonnesIn, inQuota);
    const thirdParty = Math.max(0, inQuota - ibTonnes);
    const outOfQuota = Math.max(0, exportTonnes - inQuota);
    if (ibTonnesIn > inQuota) W.push(`Iberjindal volume ${ibTonnesIn} t exceeds the in-quota tonnes (${Math.round(inQuota)} t); only in-quota tonnes are counted.`);
    if (exportTonnes > quota) W.push(`${exportTonnes} t is more than India's entire stainless-flat quota (${quota} t/yr for all Indian mills).`);

    // € lines
    const headroomEur = savingX * thirdParty;
    const capturedEur = headroomEur * passThrough;
    const ibDirectEur = savingIb * ibTonnes;
    const verEur = nInst * verFee + (firstYear ? nInst * siteVisit : 0);
    const dutyExposureEur = duty * cif * outOfQuota;
    const dutyChargedEur = policy === 'ship' ? dutyExposureEur : 0;
    const netEur = capturedEur + ibDirectEur - verEur - dutyChargedEur;

    // routing: what choosing the installation per EU order is worth (the tool's increment over a verifier-only set-up)
    const saveJ = cbamRow(M, st, 'jajpur', year).saving, saveH = cbamRow(M, st, 'hisar', year).saving;
    const best = saveH >= saveJ ? 'hisar' : 'jajpur', bestSave = Math.max(saveJ, saveH);
    const routingUpliftEur = (bestSave - savingX) * thirdParty * passThrough + (bestSave - savingIb) * ibTonnes;
    // Same number as M.routeComparison()'s indonesia_slab row: slab precursor (EU default unless verified) + Indian rolling,
    // read straight from cbamTable so this figure and the site's route table never diverge (was a separate, higher M.cbamCost() call).
    const indoRow = cbamRow(M, st, 'indonesia_slab', year);
    const indoSlabE = indoRow.verifiedE;
    const indoSlabCost = indoRow.verifiedCost;
    const misroutePer10ktEur = (indoSlabCost - rowX.verifiedCost) * 10000;

    const cr = e => crore(e, fx);
    const out = {
      year, installation: { exports: exportInst, iberjindal: ibInst },
      tonnes: { export: exportTonnes, indiaQuota: quota, quotaShare, inQuota, iberjindal: ibTonnes, thirdPartyInQuota: thirdParty, outOfQuota },
      savingEurPerT: { exports: savingX, iberjindal: savingIb, verifiedE_exports: rowX.verifiedE, verifiedE_iberjindal: rowIb.verifiedE, defaultE: rowX.defaultE },
      importerHeadroom_inr_cr: cr(headroomEur),
      jslCaptured_inr_cr: cr(capturedEur),
      iberjindalDirect_inr_cr: cr(ibDirectEur),
      verificationCost_inr_cr: cr(verEur),
      outOfQuotaDutyCost_inr_cr: cr(dutyExposureEur),
      outOfQuotaDutyCharged_inr_cr: cr(dutyChargedEur),
      outOfQuotaPolicy: policy,
      net_inr_cr: cr(netEur),
      netPerQuotaTonne_eur: inQuota > 0 ? netEur / inQuota : 0,
      eur_m: { headroom: headroomEur / 1e6, captured: capturedEur / 1e6, iberjindalDirect: ibDirectEur / 1e6, verification: verEur / 1e6, dutyExposure: dutyExposureEur / 1e6, dutyCharged: dutyChargedEur / 1e6, net: netEur / 1e6 },
      routing: {
        savingEurPerT: { jajpur: saveJ, hisar: saveH }, bestInstallation: best,
        upliftIfBestInstallation_inr_cr: cr(routingUpliftEur),
        indonesianSlabCbamEurPerT: indoSlabCost,
        misroutePenaltyPer10kt_inr_cr: cr(misroutePer10ktEur),
        note: `Coil rolled in India from Indonesian-melted slab is Indonesian under melt-and-pour (from 1 Oct 2026) and carries the slab at Indonesia's default (${r2(indoSlabE)} t/t) unless the slab maker is verified: ≈€${Math.round(indoSlabCost)}/t vs €${Math.round(rowX.verifiedCost)}/t for ${exportInst === 'jajpur' ? 'Jajpur' : 'Hisar'}-melted coil. Every 10 kt routed the wrong way costs ≈${fmtCr(cr(misroutePer10ktEur))}.`
      },
      baseline: 'verifier-only',
      baselineExplanation: 'Any accredited verifier closes the "default vs verified" gap, so the verification dividend itself is not the tool\'s value. '
        + 'Against a verifier-only baseline the tool adds three things: (1) routing — which installation and which heats serve EU orders '
        + `(Hisar and Jajpur differ by €${Math.round(Math.abs(saveH - saveJ))}/t; Indonesian-melted slab would cost ≈€${Math.round(indoSlabCost - rowX.verifiedCost)}/t more); `
        + '(2) grade- and order-level CBAM quotes before the order is booked, so the carbon clause in the contract is priced, not guessed; '
        + '(3) one dataset that feeds the CBAM communication, India\'s CCTS intensity filing and the customer product footprint, instead of three separate exercises.',
      formula: 'net = headroom × passThrough (third-party in-quota tonnes) + saving × Iberjindal in-quota tonnes − verification − out-of-quota duty (if shipped)',
      warnings: W
    };
    out.lines = [
      { key: 'importerHeadroom_inr_cr', label: 'Buyers avoid (third-party in-quota tonnes, verified vs default)', inr_cr: out.importerHeadroom_inr_cr, sign: 0 },
      { key: 'jslCaptured_inr_cr', label: `JSL captures ${Math.round(passThrough * 100)}% of that in price / quota priority`, inr_cr: out.jslCaptured_inr_cr, sign: +1 },
      { key: 'iberjindalDirect_inr_cr', label: 'Iberjindal as importer of record (lands in JSL consolidated)', inr_cr: out.iberjindalDirect_inr_cr, sign: +1 },
      { key: 'verificationCost_inr_cr', label: `Verification (${nInst} installation${nInst > 1 ? 's' : ''}${firstYear ? ', incl. first-year site visit' : ''})`, inr_cr: out.verificationCost_inr_cr, sign: -1 },
      { key: 'outOfQuotaDutyCharged_inr_cr', label: policy === 'ship' ? `Out-of-quota duty ${Math.round(duty * 100)}% on ${Math.round(outOfQuota)} t` : `Out-of-quota duty (${Math.round(outOfQuota)} t diverted to non-EU markets; would cost ${fmtCr(out.outOfQuotaDutyCost_inr_cr)} if shipped)`, inr_cr: out.outOfQuotaDutyCharged_inr_cr, sign: -1 },
      { key: 'net_inr_cr', label: 'Net value to JSL per year', inr_cr: out.net_inr_cr, sign: 0 }
    ];
    out.assumptions = [
      a('exportTonnes', exportTonnes, 't/yr', 'assumption', 'EU export tonnes; 60–80 kt is our estimate from JSL export mix (8% of 2.57 Mt) — only JSL knows'),
      a('indiaFlatQuota_t', quota, 't/yr', C.indiaFlatQuota_t.status, C.indiaFlatQuota_t.source),
      a('quotaShare', quotaShare, '-', C.quotaShare.status, C.quotaShare.source),
      a('passThrough', passThrough, '-', C.passThrough.status, C.passThrough.source),
      a('iberjindalTonnes', ibTonnesIn, 't/yr', C.iberjindalTonnes.status, C.iberjindalTonnes.source),
      a('iberjindalInstallation', ibInst, '-', C.iberjindalInstallation.status, C.iberjindalInstallation.source),
      a('savingEurPerT.exports', r1(savingX), '€/t', opts.savingEurPerT !== undefined ? 'assumption' : 'model', `model.js cbamTable ${year}, ${exportInst}: (default ${rowX.defaultE} − verified ${r3(rowX.verifiedE)}) at €${rowX.price}/t, benchmark ${st.benchmarkB}`),
      a('savingEurPerT.iberjindal', r1(savingIb), '€/t', opts.savingEurPerT !== undefined ? 'assumption' : 'model', `model.js cbamTable ${year}, ${ibInst}`),
      a('fx', fx, '₹/€', 'assumption', 'Calculator input'),
      a('cifEur', cif, '€/t', 'literature', 'EU CIF price, 304 CR coil €2,700–3,300/t (Antwerp/Rotterdam)'),
      a('verificationCostEur', verFee, '€/installation/yr', C.verifierFeeEur.status, C.verifierFeeEur.source),
      a('siteVisitEur', firstYear ? siteVisit : 0, '€/installation', C.siteVisitEur.status, C.siteVisitEur.source),
      a('outOfQuotaDuty', duty, '-', C.outOfQuotaDuty.status, C.outOfQuotaDuty.source),
      a('outOfQuotaPolicy', policy, '-', 'assumption', 'Base case diverts out-of-quota tonnes: a 50% duty (€1,500/t on a €3,000 coil) exceeds both the carbon saving and the 8–14% export margin. Set outOfQuota:"ship" to charge it'),
      a('antiDumping', 'excluded', '-', C.euAntiDumping.status, C.euAntiDumping.source)
    ];
    // how far the net moves on the two assumptions a CFO will push on first
    if (!opts._noRange) {
      const alt = patch => capturedValue(state, Object.assign({}, opts, patch, { _noRange: true })).net_inr_cr;
      out.range = {
        net_inr_cr: { base: out.net_inr_cr, defaultBenchmark1_27: alt({ benchmarkB: M.CBAM.benchmarkB_high }), passThrough0_2: alt({ passThrough: 0.2 }), quotaShare0_4: alt({ quotaShare: 0.4 }) },
        note: 'Default-side benchmark 1.27 (unverified Column B) lowers the €/t saving; pass-through 0.2 and quota share 0.4 are the pessimistic ends of our assumptions.'
      };
    }
    return out;
  }
  function a(key, value, unit, status, source) { return { key, value, unit, status, source }; }
  function pickDefined(o, keys) { const r = {}; keys.forEach(k => { if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; }); return r; }

  /* ================================================================== 2. implementationPlan */
  const SAP_FIELDS = [
    { field: 'Heat / cast number', where: 'MES → S/4 batch (classification)', why: 'Links every coil to its melt, installation and charge' },
    { field: 'CBAM installation ID', where: 'Plant (WERKS) master data', why: 'Emissions are declared per installation (Jajpur, Hisar), never per company' },
    { field: 'CN code of the good (7219 / 7220)', where: 'Material master (foreign trade view)', why: 'Default values and benchmarks are per CN code' },
    { field: 'Charge mix per heat: scrap by type, FeCr (own/merchant), NPI, FeMo, FeMn, Cu (kg)', where: 'Production order components / goods issue', why: 'Drives the precursor block and the AOD carbon balance' },
    { field: 'Precursor supplier + specific embedded emissions + verification status', where: 'Purchasing info record / batch characteristic', why: 'Purchased FeCr and NPI count in CBAM; unverified supplier data falls back to defaults' },
    { field: 'Energy per heat and per rolling line: EAF/AOD/SAF kWh, fuel GJ by type, captive vs purchased split', where: 'Utilities / PM measuring points', why: 'Direct fuel emissions (counted) vs electricity (reported, not charged)' },
    { field: 'Crude → good yield per route (t good / t crude)', where: 'Routing / production version', why: 'CBAM figures are per tonne of good, not per tonne of crude steel' },
    { field: 'Specific embedded emissions (direct, indirect) + data-quality flag per delivery', where: 'Outbound delivery / billing document', why: 'Populates the CBAM communication and the customer product footprint from one source' }
  ];

  function implementationPlan(state, opts) {
    const M = model();
    opts = opts || {};
    const st = M.normalize(state || M.defaultState());
    const fx = st.fx;
    const cvRes = capturedValue(st, opts);
    const nInst = 2;
    const inr = eur => crore(eur, fx);
    const verRun = inr(nInst * num(opts.verificationCostEur, cv('verifierFeeEur')));
    const siteVisit = inr(nInst * num(opts.siteVisitEur, cv('siteVisitEur')));
    // ₹ crore ranges — ALL labelled estimates (order of magnitude; replace with quotes)
    const build = [
      { item: 'Internal build team: 2 data engineers + 1 MRV/LCA analyst for ~4 months', low: 0.25, high: 0.45 },
      { item: 'SAP S/4HANA functional work: 8 sustainability data fields, batch classification, delivery output', low: 0.20, high: 0.50 },
      { item: 'Model hardening: heat-level data feed, product-mix calibration, test suite in CI', low: 0.05, high: 0.15 }
    ];
    const oneOff = [
      { item: `First-year verifier site visits (${nInst} installations; operators are not accredited, the verifier is)`, low: r2(siteVisit), high: r2(siteVisit * 1.6) },
      { item: 'Monitoring methodology document + CBAM Registry operator/installation registration (registration itself has no fee)', low: 0.15, high: 0.40 }
    ];
    const run = [
      { item: `Accredited verifier fees (${nInst} installations/yr)`, low: r2(verRun), high: r2(verRun * 1.6) },
      { item: 'MRV owner capacity: 0.5–1 FTE', low: 0.12, high: 0.30 },
      { item: 'Supplier precursor data programme (NPI, merchant FeCr: data requests, verification follow-up)', low: 0.05, high: 0.15 },
      { item: 'Hosting (static site, no server)', low: 0, high: 0.01 }
    ];
    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const cost = {
      build: { low: sum(build, 'low'), high: sum(build, 'high'), items: build },
      oneOff: { low: sum(oneOff, 'low'), high: sum(oneOff, 'high'), items: oneOff },
      run: { low: sum(run, 'low'), high: sum(run, 'high'), items: run, perYear: true }
    };
    cost.firstYear = { low: cost.build.low + cost.oneOff.low + cost.run.low, high: cost.build.high + cost.oneOff.high + cost.run.high };
    // value before verification (verification is already inside the cost lines above)
    const annualValue = cvRes.jslCaptured_inr_cr + cvRes.iberjindalDirect_inr_cr - cvRes.outOfQuotaDutyCharged_inr_cr;
    const months = c => annualValue > 0 ? 12 * c / annualValue : Infinity;
    const payback = {
      annualValue_inr_cr: annualValue,
      months: { low: months(cost.firstYear.low), high: months(cost.firstYear.high) },
      basis: 'First-year cost (build + one-off + one year of running) ÷ annual value captured by JSL (third-party capture + Iberjindal direct − out-of-quota duty charged). Verification is counted once, in the cost.',
      toolIncrement: {
        cost_inr_cr: { low: cost.build.low, high: cost.build.high },
        routingValue_inr_cr: cvRes.routing.upliftIfBestInstallation_inr_cr,
        misroutePenaltyAvoidedPer10kt_inr_cr: cvRes.routing.misroutePenaltyPer10kt_inr_cr,
        note: 'Against a verifier-only baseline, the build cost is repaid by routing alone if it keeps even ~1 kt of Indonesian-melted coil off the EU book, or by choosing the lower-E installation for EU orders.'
      }
    };
    const owners = [
      { role: 'Plant head, Jajpur and Hisar', owns: 'Signs the installation\'s verified emissions report; owns heat-level data completeness', decision: 'Which heats/lines serve EU orders' },
      { role: 'Head of Sustainability', owns: 'MRV owner: monitoring methodology, annual emissions report, verifier relationship, CCTS filing from the same dataset', decision: 'Method choices (allocation, defaults vs supplier data)' },
      { role: 'Iberjindal S.L. (Spain)', owns: 'Authorised CBAM declarant / importer of record for its ~30 kt: surrenders certificates, files the annual declaration (first due 30 Sep 2027 for 2026 imports)', decision: 'Declared values per shipment; quota usage by quarter' },
      { role: 'Procurement', owns: 'Supplier precursor data: NPI (Indonesian JV), merchant FeCr, FeMn — specific embedded emissions and verification status per batch', decision: 'Supplier contracts with a data clause' },
      { role: 'EU sales / marketing', owns: 'Order-level CBAM quote and carbon clause in EU contracts; pass-through tracking', decision: 'Price vs quota-priority trade-off' },
      { role: 'IT / SAP', owns: 'The 8 S/4HANA data fields and delivery output', decision: 'Build sequence' }
    ];
    const pilot = [
      { phase: 1, name: 'Data pull and mapping', start: '2026-10-01', end: '2026-10-31',
        tasks: ['Map the 8 SAP fields for one CN line (7219 CR 304) at Jajpur and Hisar', 'Pull FY26 heat data for the EU-bound share', 'Confirm Iberjindal importer-of-record status and quota usage by quarter'],
        exit: 'Heat-level dataset for one grade reconciles to BRSR FY26 within ±2%' },
      { phase: 2, name: 'Pilot calculation and supplier data', start: '2026-11-01', end: '2026-12-10',
        tasks: ['Run installation figures on real heat data; replace the load-factor and NPI-share assumptions', 'Request specific embedded emissions from NPI and merchant FeCr suppliers', 'Produce the CBAM communication for one live Iberjindal order'],
        exit: 'Verified-ready figure per installation; supplier data status known for every precursor' },
      { phase: 3, name: 'Verifier pre-assessment and first quote', start: '2026-12-11', end: '2026-12-29',
        tasks: ['Verifier pre-assessment of the monitoring methodology', 'First order-level CBAM quote to an EU buyer with a carbon clause', 'Go / no-go for all EU-bound CN lines in 2027'],
        exit: 'Signed-off methodology; first priced carbon clause; 2027 rollout plan' }
    ];
    const dataAsks = [
      'Captive power generation and load factor (BRSR Principle 6), Jajpur',
      'Captive vs merchant ferrochrome split, and ferrochrome sent from Jajpur to Hisar',
      'NPI tonnage, the Indonesian JV\'s power mix, and whether it will provide verified embedded emissions',
      'Grade mix by series (200/300/400) and by installation',
      'EU export tonnes by installation, CN code and importer of record; quota usage by quarter',
      'Purchased electricity MWh by plant (to reconcile location- vs market-based Scope 2)',
      'Crude → good yield by route (HR, CR, precision strip)',
      'Energy by plant with boundary (to confirm the 16.43 GJ/tcs basis)'
    ];
    return {
      cost, payback, owners, pilot, dataAsks, sapFields: SAP_FIELDS,
      status: 'estimate', currency: '₹ crore',
      note: 'All ₹ ranges are order-of-magnitude estimates to be replaced by vendor and verifier quotes. Value side is read live from capturedValue() at the current inputs.',
      captured: cvRes
    };
  }

  /* ================================================================== 3. cbamTemplateFields */
  const CN_DESC = {
    '7219': 'Flat-rolled products of stainless steel, width ≥ 600 mm',
    '7220': 'Flat-rolled products of stainless steel, width < 600 mm'
  };
  const PLANT_NAME = { jajpur: 'Jindal Stainless Ltd — Jajpur works (Kalinganagar, Odisha)', hisar: 'Jindal Stainless Ltd — Hisar works (Haryana)' };

  function cbamTemplateFields(state, opts) {
    const M = model();
    opts = opts || {};
    const st = M.normalize(state || M.defaultState());
    const inst = ['jajpur', 'hisar'].includes(opts.installation) ? opts.installation : instOf(st);
    const cn = CN_DESC[String(opts.cn)] ? String(opts.cn) : '7219';
    const y = clamp(num(opts.yieldCrudeToGood, yieldGood(M)), 0.5, 1);
    const r = M.compute(Object.assign({}, st, { plant: inst }));
    const g = M.GRADES[st.grade];
    const v = 1 - st.scrap / 100;
    const X = st.fecr === 'captive' ? M.FECR_SUPPLY.captiveShare : 0;
    const E_crude = pick(r.cbamE_installation, r.cbamE);
    const E_good = pick(r.cbamE_good, r.cbamE_perGood, E_crude / y);

    // precursors per tonne of crude, then per tonne of good
    const n = g.ni_kg > 0 ? st.npi / 100 : 0;
    const npiNi_kg = v * g.ni_kg * n;
    const npi_t = npiNi_kg / M.CHEM.npiNi / 1000;
    const fecrBought_t = r.fecr_need_t * (1 - X);
    const femn_t = v * g.femn_kg / 1000;
    const pig_t = (r.pigIron_kg || 0) / 1000;
    const seeNPI = M.EF.npiDirect * M.CHEM.npiNi;              // t CO2 per t NPI (ferro-nickel good)
    const precursorDirect = fecrBought_t * M.EF.fecrDirect + npi_t * seeNPI + femn_t * M.EF.femnDirect + pig_t * M.EF.pigIronDirect;
    const ownDirect = E_crude - precursorDirect;
    const elec = r.electricity;
    const elecEF = elec.total_mwh > 0 ? (elec.captive_mwh * M.EF.captive + (elec.purchased_mwh - elec.re_mwh) * M.EF.grid) / elec.total_mwh : 0;
    const perGood = x => r3(x / y);
    const status = 'not yet verified';
    const MOD = `modelled (model.js v${M.VERSION}, FY26 disclosures), per t of good = per t crude ÷ yield ${y}`;

    const F = [];
    const add = (section, field, value, unit, source, st2) => F.push({ section, field, value, unit: unit || '', source, status: st2 || 'model' });
    add('0. Document', 'Document status', 'PRE-FILLED FOR THE VERIFIER — NOT A FILING', '', 'StainlessCarbon', 'notice');
    add('0. Document', 'Template basis', 'EC CBAM communication template for installations (operator → importer), iron & steel', '', 'European Commission CBAM guidance', 'regulation');
    add('A. Installation', 'Installation name', PLANT_NAME[inst], '', 'JSL Integrated Report FY26', 'JSL-assured');
    add('A. Installation', 'Installation identifier (CBAM Registry)', '<to be issued on operator registration>', '', 'placeholder', 'placeholder');
    add('A. Installation', 'Operator', 'Jindal Stainless Limited', '', 'JSL Integrated Report FY26', 'JSL-assured');
    add('A. Installation', 'Country of installation', 'India (IN)', '', '-', 'JSL-assured');
    add('A. Installation', 'Country of origin of the good (melt-and-pour, from 1 Oct 2026)', 'India — melted at this installation', '', 'EU melt-and-pour origin rule', 'regulation');
    add('A. Installation', 'Reporting period', opts.reportingPeriod || '2026-01-01 to 2026-12-31 (values modelled on FY26: Apr 2025–Mar 2026)', '', 'placeholder period; model basis FY26', 'assumption');
    add('B. Good', 'CN code', cn, '', 'selectable: 7219 / 7220', 'regulation');
    add('B. Good', 'CN description', CN_DESC[cn], '', 'Combined Nomenclature', 'regulation');
    add('B. Good', 'Aggregated goods category', 'Iron or steel products', '', 'CBAM Annex I / IR 2023/1773', 'regulation');
    add('B. Good', 'Steel grade (for the buyer; not a CBAM field)', g.label, '', 'calculator input', 'assumption');
    add('C. Production process', 'Production route', 'EAF + AOD crude steel (scrap ' + st.scrap + '%), continuous casting, hot and cold rolling' + (inst === 'jajpur' ? '; own submerged-arc furnaces make ferrochrome on site' : ''), '', 'JSL disclosures + calculator', 'model');
    add('C. Production process', 'Monitoring approach', 'Calculation-based: fuel and carbon mass balance (FeCr 6% C, NPI 2.5% C, FeMn 7% C)', '', 'IR 2023/1773 Annex III methods', 'model');
    add('D. Embedded emissions', 'Specific direct embedded emissions (SEE direct)', perGood(E_crude), 't CO2e/t good', MOD);
    add('D. Embedded emissions', 'SEE direct, per t crude steel (for reference)', r3(E_crude), 't CO2e/t crude', 'model.js cbamE_installation');
    add('D. Embedded emissions', '— of which attributed own-process direct emissions', perGood(ownDirect), 't CO2e/t good', 'S1 − captive power − ferrochrome reductant shipped out as a precursor');
    add('D. Embedded emissions', '— of which embedded in purchased precursors', perGood(precursorDirect), 't CO2e/t good', 'precursor block E');
    add('D. Embedded emissions', 'Electricity consumed', perGood(elec.total_mwh), 'MWh/t good', 'model.js electricity (captive + purchased)');
    add('D. Embedded emissions', 'Emission factor of electricity (informational)', r3(elecEF), 't CO2/MWh', 'captive coal 1.045 (CEA default) and grid 0.710 (CEA v21) weighted by supply; renewables 0', 'literature');
    add('D. Embedded emissions', 'SEE indirect (informational only — not charged for iron & steel)', perGood(elec.total_mwh * elecEF), 't CO2e/t good', 'Annex II Reg 2023/956: iron & steel pay on direct emissions only', 'regulation');
    add('D. Embedded emissions', 'Share of precursor emissions based on default values',
      precursorDirect <= 1e-9 ? 'n/a (no purchased precursor)'
        : (st.precursorData === 'default' ? '100% (EU default values applied in this scenario)'
                                          : '0% (supplier-side factors used; these are estimates until suppliers provide verified data)'),
      '', 'follows the calculator\'s precursor-data setting', st.precursorData === 'default' ? 'regulation' : 'assumption');
    // E. precursors (always list the four iron & steel precursors that apply to stainless)
    add('E. Precursors', 'Crude steel (own production, same installation) — quantity', perGood(1), 't/t good', 'crude → good yield ' + y, 'assumption');
    add('E. Precursors', 'Ferro-chromium (CN 7202 41), purchased — quantity', perGood(fecrBought_t), 't/t good', X >= 1 ? 'all ferrochrome made in the installation\'s own furnaces (inside own-process emissions)' : 'merchant / imported share');
    add('E. Precursors', 'Ferro-chromium, purchased — SEE direct', M.EF.fecrDirect, 't CO2e/t', 'SAF reductant carbon, literature 1.35–1.55; replace with supplier-verified value', 'literature');
    add('E. Precursors', 'Ferro-nickel / nickel pig iron (CN 7202 60) — quantity', perGood(npi_t), 't/t good', `NPI share of Ni units ${st.npi}% (calibration fit), 12.2% Ni`);
    add('E. Precursors', 'Ferro-nickel / NPI — SEE direct', r3(seeNPI), 't CO2e/t', '20 t CO2/t contained Ni (reductant + kiln coal; power excluded) × 12.2% Ni — assumption until the supplier reports', 'assumption');
    add('E. Precursors', 'Ferro-manganese (CN 7202 1x) — quantity', perGood(femn_t), 't/t good', 'grade recipe (J4 uses HC-FeMn)');
    add('E. Precursors', 'Ferro-manganese — SEE direct', M.EF.femnDirect, 't CO2e/t', 'reductant share of HC-FeMn', 'assumption');
    add('E. Precursors', 'Pig iron (CN 7201) — quantity', perGood(pig_t), 't/t good', st.feUnits === 'pigiron' ? 'Fe units replacing NPI iron' : 'none (Fe units from scrap)');
    add('E. Precursors', 'Pig iron — SEE direct', M.EF.pigIronDirect, 't CO2e/t', 'BF route ≈ 90% direct', 'assumption');
    add('E. Precursors', 'Nickel (Class 1), FeMo, copper, scrap', '0 (not CBAM precursors / scrap)', 't CO2e/t', 'CBAM Annex I scope', 'regulation');
    add('F. Carbon price', 'Carbon price due in country of origin', 0, '€/t good', 'India CCTS is an intensity-credit scheme; no carbon price is paid per tonne in 2026, so no Art. 9 deduction is claimed', 'regulation');
    add('G. Verification', 'Verifier name', opts.verifierName || '<accredited CBAM verifier — to be appointed>', '', 'placeholder', 'placeholder');
    add('G. Verification', 'Accreditation body / number', '<to be completed by verifier>', '', 'placeholder', 'placeholder');
    add('G. Verification', 'Site visit date', '<first year: physical site visit required>', '', 'CBAM verification rules', 'placeholder');
    add('G. Verification', 'Verification status', status, '', 'StainlessCarbon', 'notice');
    add('0. Document', 'Disclaimer', 'Modelled figures from public disclosures, pre-filled so the verifier and the importer see the structure and the numbers to be verified. Not a CBAM declaration, not verified, not for filing.', '', 'StainlessCarbon', 'notice');

    const meta = { title: 'CBAM communication — pre-fill', installation: inst, cn, grade: st.grade, yieldCrudeToGood: y, generated: new Date().toISOString().slice(0, 10),
      notice: 'Pre-filled for the verifier, not a filing.', verificationStatus: status };
    Object.defineProperty(F, 'meta', { value: meta, enumerable: false });
    Object.defineProperty(F, 'toCSV', { value: () => templateToCSV(F), enumerable: false });
    Object.defineProperty(F, 'toJSON', { value: () => Object.assign({}, meta, { fields: F.map(f => Object.assign({}, f)) }), enumerable: false });
    return F;
  }
  function csvCell(x) { const s = x === null || x === undefined ? '' : String(x); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function templateToCSV(fields) {
    const head = ['section', 'field', 'value', 'unit', 'source', 'status'];
    const lines = ['# PRE-FILLED FOR THE VERIFIER - NOT A FILING', head.join(',')];
    fields.forEach(f => lines.push(head.map(h => csvCell(f[h])).join(',')));
    return lines.join('\r\n') + '\r\n';
  }
  function templateToJSON(fields) { return JSON.stringify(typeof fields.toJSON === 'function' ? fields.toJSON() : fields, null, 2); }

  /* ================================================================== 4. headToHead */
  function headToHead(state, opts) {
    const M = model();
    opts = opts || {};
    const st = M.normalize(state || M.defaultState());
    const cif = num(opts.cifEur, 3000);
    const duty = dutyRate(M);
    const A = M.CBAM.benchmarkA, B = st.benchmarkB, y26 = M.CBAM.years[0];
    const cost = (E, bm) => M.cbamCost(E, 2026, bm);
    const quotaIN = `India stainless flat quota ${quotaTonnes(M).toLocaleString('en-US')} t/yr (CR 38,054 + HR 26,019), shared by all Indian mills`;
    let fromModel = null;
    if (typeof M.routeComparison === 'function') { try { fromModel = M.routeComparison(st); } catch (e) { fromModel = null; } }
    const modelRow = key => {
      if (!fromModel) return null;
      const arr = Array.isArray(fromModel) ? fromModel : (fromModel.rows || []);
      return arr.find(x => x && (x.key === key || x.id === key || x.route === key || x.installation === key)) || null;
    };
    const pcf = r => pick(r.footprint_a1a3, r.pcf, r.footprint_cradleToGate, r.total);
    const asian = M.compute(Object.assign({}, st, { grade: '304', plant: 'company', scrap: 30, npi: 100, fecr: 'odisha', re: 0, cf: 0, feUnits: 'scrap', npiEF: M.EF.npiCoal })).total;

    const jslRow = (key, inst, label) => {
      const t = M.cbamTable(Object.assign({}, st, { plant: inst }))[0];
      const r = M.compute(Object.assign({}, st, { plant: inst }));
      const mr = modelRow(key) || modelRow(inst) || {};
      const ver = pick(mr.cbamVerified2026, mr.verifiedCost, t.verifiedCost);
      return {
        key, label, producer: 'Jindal Stainless', melt: inst === 'jajpur' ? 'Jajpur, India' : 'Hisar, India',
        cbam2026_default_eur: pick(mr.cbamDefault2026, t.defaultCost), cbam2026_verified_eur: ver, cbamE_verified: pick(mr.cbamE, t.verifiedE),
        productFootprint_t: pcf(r), footprintBasis: 'S1+2+3 per t crude, as disclosed boundary (model.js)',
        landedInQuota_eur: cif + ver, landedOutOfQuota_eur: cif * (1 + duty) + ver,
        quotaBucket: quotaIN, origin: 'India (melted at ' + (inst === 'jajpur' ? 'Jajpur' : 'Hisar') + ')',
        sources: 'model.js at current inputs', status: 'model'
      };
    };
    const indoE = routeDefault(M, 'indonesia', cv('indonesiaDefault2026'));
    const chinaE = routeDefault(M, 'china', cv('chinaDefault2026'));
    // JSL's own Indonesia-slab route: pull the slab-plus-rolling figure from M.routeComparison
    // (slab base 8.67 -> per-coil ~9.43) so this row and the site's route table agree; fall back
    // to the flat Indonesian CR-coil default (9.56) only if routeComparison is unavailable.
    const indoSlabRoute = modelRow('indonesia_slab');
    const indoSlabDefaultCost = pick(indoSlabRoute && indoSlabRoute.defaultCost2026_meltPour, cost(indoE, B));
    const indoSlabVerifiedCost = indoSlabRoute ? indoSlabRoute.cbamCost2026 : null;
    const indoSlabE = indoSlabRoute ? indoSlabRoute.cbamE : null;
    const indoSlabGap = indoSlabRoute ? indoSlabRoute.gapVsJajpur_eur_per_t : null;
    const rows = [
      jslRow('jsl-jajpur', 'jajpur', 'JSL, Jajpur-melted coil'),
      jslRow('jsl-hisar', 'hisar', 'JSL, Hisar-melted coil'),
      {
        key: 'jsl-indonesian-slab', label: 'JSL coil rolled in India from Indonesian-melted slab', producer: 'Jindal Stainless (Indonesian melt shop)', melt: 'Indonesia',
        cbam2026_default_eur: indoSlabDefaultCost, cbam2026_verified_eur: indoSlabVerifiedCost, cbamE_verified: indoSlabE,
        productFootprint_t: null, footprintBasis: 'not modelled (Indonesian melt shop not in the model)',
        landedInQuota_eur: cif + indoSlabDefaultCost, landedOutOfQuota_eur: cif * (1 + duty) + indoSlabDefaultCost,
        quotaBucket: 'Indonesia, not India: origin follows the melt, so these tonnes cannot use India\'s quota ("in quota" = only if Indonesia\'s allocation has room)',
        origin: 'Indonesia (melt-and-pour, from 1 Oct 2026); rolling in India does not confer origin',
        note: indoSlabGap !== null ? `About €${Math.round(indoSlabGap)}/t above Jajpur-melted coil on this model (M.routeComparison: slab base ${M.CBAM.indonesiaSlabDefault} t/t → per-coil ${r2(indoSlabE)} t/t).` : null,
        sources: 'slab at Indonesia default ' + M.CBAM.indonesiaSlabDefault + ' t/t (EU default for Indonesian CN 7218 91 semi-finished) plus modelled Indian rolling emissions, via M.routeComparison, unless the slab maker is verified', status: 'regulation'
      },
      {
        key: 'outokumpu', label: 'Outokumpu (EU mill)', producer: 'Outokumpu', melt: 'EU (Finland / Sweden / Germany)',
        cbam2026_default_eur: 0, cbam2026_verified_eur: 0, cbamE_verified: null,
        productFootprint_t: cv('outokumpuPCF'), productFootprintRange: [C.outokumpuPCF.low, C.outokumpuPCF.high], footprintBasis: 'cradle-to-gate incl. upstream, company average',
        landedInQuota_eur: cif, landedOutOfQuota_eur: cif,
        quotaBucket: 'n/a (EU origin)', origin: 'EU',
        note: 'No CBAM. Pays EU ETS on direct emissions above its free allocation, which mirrors the benchmark deduction importers get; price parity at the same CIF assumed.',
        sources: C.outokumpuPCF.source, status: C.outokumpuPCF.status
      },
      {
        key: 'aperam', label: 'Aperam (EU mill)', producer: 'Aperam', melt: 'EU (Belgium / France)',
        cbam2026_default_eur: 0, cbam2026_verified_eur: 0, cbamE_verified: null,
        productFootprint_t: cv('aperamPCF'), productFootprintRange: [C.aperamPCF.low, C.aperamPCF.high], footprintBasis: 'labelled estimate',
        landedInQuota_eur: cif, landedOutOfQuota_eur: cif,
        quotaBucket: 'n/a (EU origin)', origin: 'EU',
        note: 'No CBAM; EU ETS with free allocation. Footprint is our estimate, not an Aperam figure.',
        sources: C.aperamPCF.source, status: C.aperamPCF.status
      },
      {
        key: 'indonesia', label: 'Indonesian import (NPI-integrated mill)', producer: 'Indonesian mills', melt: 'Indonesia',
        cbam2026_default_eur: cost(indoE, B), cbam2026_verified_eur: null, cbamE_verified: null,
        productFootprint_t: asian, footprintBasis: 'estimate: this model at 30% scrap, 100% NPI on coal power, coal-power FeCr (worldstainless Asian route ≈ 6.8)',
        landedInQuota_eur: cif + cost(indoE, B), landedOutOfQuota_eur: cif * (1 + duty) + cost(indoE, B),
        quotaBucket: 'Indonesia\'s own allocation or the residual pool — not sourced, check the safeguard annex', origin: 'Indonesia',
        note: 'Also subject to EU anti-dumping on cold-rolled flats (excluded here).',
        sources: C.indonesiaDefault2026.source, status: C.indonesiaDefault2026.status
      },
      {
        key: 'china', label: 'Chinese import', producer: 'Chinese mills', melt: 'China',
        cbam2026_default_eur: cost(chinaE, B), cbam2026_verified_eur: null, cbamE_verified: null,
        productFootprint_t: asian, footprintBasis: 'estimate: same Asian NPI route as above',
        landedInQuota_eur: cif + cost(chinaE, B), landedOutOfQuota_eur: cif * (1 + duty) + cost(chinaE, B),
        quotaBucket: 'China\'s allocation or the residual pool — not sourced, check the safeguard annex', origin: 'China',
        note: 'Default is a trade-press figure (5.59 base), not checked against the Annex. EU anti-dumping on Chinese cold-rolled flats excluded.',
        sources: C.chinaDefault2026.source, status: C.chinaDefault2026.status
      }
    ];
    rows.forEach(r => { r.cbamShareOfLanded = r.landedInQuota_eur ? (r.cbam2026_verified_eur !== null ? r.cbam2026_verified_eur : r.cbam2026_default_eur) / r.landedInQuota_eur : null; });
    return Object.assign(rows, {
      cifEur: cif, year: 2026, price: y26.price, benchmarkA: A, benchmarkB: B, outOfQuotaDuty: duty,
      columns: ['label', 'cbam2026_default_eur', 'cbam2026_verified_eur', 'productFootprint_t', 'landedInQuota_eur', 'landedOutOfQuota_eur', 'quotaBucket', 'origin'],
      note: `Landed = CIF €${cif} + CBAM 2026 (+ ${Math.round(duty * 100)}% duty on CIF when out of quota). Anti-dumping / countervailing duties are company-specific and excluded. EU mills: no CBAM, price parity at the same CIF assumed.`,
      usedModelRouteComparison: !!fromModel
    });
  }

  /* ================================================================== 5. reconciliation — "What changed since Round 1" */
  function reconciliation() {
    const M = model();
    const D = M.defaultState();
    const r = M.compute(D);
    const mo = M.money(D);
    const fy30 = M.compute(M.applyPreset(D, 'fy30'));
    const r430 = M.compute(Object.assign({}, D, { grade: '430' }));
    const bd = r.breakdown;
    const alloyBoughtIn = (bd.fecr + bd.ni) / r.total;
    const alloy = (bd.fecr + bd.ni + bd.femo + bd.femn + bd.cu + bd.saf) / r.total;
    const capt = capturedValue(D);
    const lf = D.captiveLF;
    const rows = [
      { round1: '₹200–290 Cr a year by 2030 (verification dividend)',
        current: `${rangeCr(mo.saving2026_inr_cr.low, mo.saving2026_inr_cr.high)} in 2026 and ${rangeCr(mo.saving2030_inr_cr.low, mo.saving2030_inr_cr.high)} by 2030 at ${D.exportTonnes / 1000} kt (buyer-side headroom); ${fmtCr(capt.net_inr_cr)} a year net to JSL on in-quota tonnes`,
        values: { saving2026_inr_cr: mo.saving2026_inr_cr, saving2030_inr_cr: mo.saving2030_inr_cr, net_inr_cr: capt.net_inr_cr, inQuota_t: capt.tonnes.inQuota },
        reason: 'Statutory net formula replaces the pro-rata phase-in shortcut, so the saving exists from 2026; and the headline now counts only what reaches JSL on quota-feasible tonnes, not the buyer\'s whole avoided cost.' },
      { round1: 'CBAM saving €372–398 per tonne (2030)',
        current: `€${Math.round(mo.saving2030_eur_per_t.low)}–${Math.round(mo.saving2030_eur_per_t.high)}/t in 2030; €${Math.round(mo.saving2026_eur_per_t.low)}–${Math.round(mo.saving2026_eur_per_t.high)}/t in 2026`,
        values: { saving2030_eur_per_t: mo.saving2030_eur_per_t, saving2026_eur_per_t: mo.saving2026_eur_per_t },
        reason: 'The EC CBAM Q&A (27 May 2026) confirms liability = (embedded − benchmark × free-allocation share) × price, not embedded × phase-in % × price; range = unverified default-side benchmark 0.268 → 1.27.' },
      { round1: 'Calibration: S1+2 1.73, total 2.99 t CO2e/t',
        current: `S1+2 ${r3(r.s12)}, total ${r3(r.total)} (disclosed FY26: 1.76 / 3.03)`,
        values: { s12: r.s12, total: r.total },
        reason: 'Re-fitted to the FY26 Integrated Report per installation (Jajpur 2.31, Hisar 0.74); the fit is an identity, and FY24 Scope 1 out-of-sample lands +0.8%.' },
      { round1: 'FY28–30 path: S1+2 1.35–1.45',
        current: `S1+2 ${r2(fy30.s12)} on our FY30 roadmap reading`,
        values: { fy30_s12: fy30.s12 },
        reason: `The 264 MW captive coal plant now runs at a fixed load factor (${lf}); renewables only replace purchased power, so the FY30 levers cut less than Round 1 assumed.` },
      { round1: '"430 is about half of 304"',
        current: `430 / 304 = ${r2(r430.total / r.total)}`,
        values: { ratio430_304: r430.total / r.total },
        reason: '430 avoids nickel but still carries the same ferrochrome and melt-shop energy; the ratio is JSL-specific (NPI-heavy nickel) and global ISSF data put it near 0.95.' },
      { round1: '"60–80% of the footprint is alloys"',
        current: `${Math.round(alloyBoughtIn * 100)}% bought-in nickel and ferro-chrome; ${Math.round(alloy * 100)}% including own-furnace ferro-chrome`,
        values: { alloyShareBoughtIn: alloyBoughtIn, alloyShare: alloy },
        reason: '60–80% holds for low-scrap routes; at JSL\'s 70% scrap the virgin alloy charge is smaller.' },
      { round1: '"No existing calculator does this"',
        current: 'Aperam and Outokumpu publish producer carbon tools; none models an Indian mill\'s alloy chain per installation on the CBAM boundary',
        values: null,
        reason: 'Round 1 overstated it; the differentiator is the alloy chain + per-installation CBAM figure + India factors, not being first.' },
      { round1: 'Product name "Spark the Rising Curve"',
        current: 'StainlessCarbon',
        values: null,
        reason: 'One product name across the calculator, appendix and presentation.' }
    ];
    return Object.assign(rows, { modelVersion: M.VERSION, asOf: 'model defaults (FY26, ' + D.exportTonnes + ' t, ₹' + D.fx + '/€)' });
  }

  /* ------------------------------------------------------------------ public API */
  return {
    VERSION: '1.0.0',
    CONSTANTS: C,
    SAP_FIELDS,
    capturedValue, implementationPlan, cbamTemplateFields, headToHead, reconciliation,
    templateToCSV, templateToJSON
  };
});
