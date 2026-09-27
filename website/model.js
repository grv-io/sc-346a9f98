/*!
 * StainlessCarbon model v4 — the ONE source of truth for every number the calculator shows.
 * 26 Sep 2026. Built from public sources (JSL FY26 Integrated Report / BRSR, EU CBAM Regulation 2023/956 and Implementing
 * Regulation 2025/2621, CEA CO2 baseline database, ICDA / ISSF / worldstainless LCA data) plus team analysis.
 * Every constant, its value, status and source: website/MODEL_NOTES.md.
 *
 * Loading (no dependencies, no build):
 *   <script src="model.js"></script>            → window.StainlessCarbon   (works from file:// too)
 *   import './model.js'; const M = globalThis.StainlessCarbon;   (ES module side-effect import, browser or Node)
 *   const M = require('./model.js');             (CommonJS)
 * It is deliberately NOT written with `export` syntax: a file containing `export` cannot be loaded by a plain
 * <script> tag, and <script type="module"> does not load from file://.
 *
 * Units: every intensity is t CO2e per tonne of CRUDE steel (tcs) unless a field name says otherwise, or state.basis = 'product'
 * (then per tonne of cold-rolled coil). cbamTable() and money() default to per tonne of product (the CBAM good).
 */
(function (root, factory) {
  'use strict';
  var M = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = M;
  if (root) root.StainlessCarbon = M;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const num = (v, d) => {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return +v;
    return d;
  };
  const r3 = x => Math.round(x * 1000) / 1000;
  const rd = x => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
  const pct = (a, b) => 100 * (a - b) / b;
  const uniq = a => [...new Set(a)];
  function upRange(cur, cap, step) {            // cur, then step-aligned values towards cap, then cap
    if (cur >= cap) return [cur];
    const out = [cur];
    for (let v = Math.ceil((cur + 1e-9) / step) * step; v < cap - 1e-9; v += step) out.push(v);
    out.push(cap);
    return uniq(out.map(rd));
  }
  function downRange(cur, floor, step) {
    if (cur <= floor) return [cur];
    const out = [cur];
    for (let v = Math.floor((cur - 1e-9) / step) * step; v > floor + 1e-9; v -= step) out.push(v);
    out.push(floor);
    return uniq(out.map(rd));
  }

  /* ------------------------------------------------------------------ 1. constants */
  // Emission factors. Status + source of each: MODEL_NOTES.md §3.
  const EF = {
    grid: 0.710,          // t CO2/MWh, CEA v21 FY24-25                                  literature
    captive: 1.045,       // t CO2/MWh, captive subcritical coal, CEA default heat rate  literature
    fecrOdisha: 5.65,     // t CO2e/t HCFeCr, merchant Odisha SAF on captive coal (5.40-5.90)   literature
    fecrImported: 2.3,    // t CO2e/t, global-average / closed-SAF FeCr                  literature
    fecrDirect: 1.5,      // t CO2/t FeCr, SAF reductant carbon (1.35-1.55)              literature
    niClass1: 13,         // t CO2e/t Ni, Class-1 cathode/briquette                      literature
    npiCoal: 69,          // t CO2e/t contained Ni, NPI via coal-fired RKEF (60-85)       literature
    npiRE: 30,            // t CO2e/t Ni, NPI with RE/hydro power at the JV               assumption (69 minus ~39 power share)
    npiDirect: 20,        // t CO2/t Ni, NPI direct (reductant + kiln coal; power is indirect)  assumption
    femo: 6.5,            // t CO2e/t FeMo                                               literature (least certain, ±30%)
    femn: 3.5,            // t CO2e/t HC-FeMn                                            literature
    femnDirect: 1.3,      // t CO2/t HC-FeMn, direct (reductant) share                   assumption
    cu: 4.0,              // t CO2e/t Cu cathode                                         literature (~4)
    pigIron: 2.1,         // t CO2e/t pig iron (BF route)                                literature
    pigIronDirect: 1.9,   // t CO2/t pig iron, direct share                              assumption
    consumables: 0.18     // t CO2e/tcs: FeSi, lime, refractories, electrodes, O2/Ar (+0.12-0.27)  assumption (estimate)
  };
  // Metallurgical chemistry used for mass balances.
  const CHEM = {
    fecrC: 0.06,          // C mass fraction in HCFeCr (4-8%)                            literature
    npiNi: 0.122,         // Ni fraction in NPI (≈80 kg Ni per 655 kg NPI → 575 kg Fe)    literature (typical RKEF NPI analysis)
    npiC: 0.025,          // C in RKEF NPI (2-3.5%)                                      literature
    fePerNiNPI: 575 / 80, // kg Fe carried per kg Ni in NPI                              literature
    femnC: 0.07,          // C in HC-FeMn                                                literature
    pigFe: 0.945, pigC: 0.045,
    co2PerC: 44 / 12
  };
  // SAF electricity per t FeCr by technology (open 3,950 is the Odisha figure from ICDA / producer filings).
  const SAF_KWH = { open: 3950, closed: 3100, prereduction: 2500 };
  const SAF_TECH_LABEL = { open: 'Open/semi-closed SAF (3,950 kWh/t)', closed: 'Closed SAF + preheat (3,100 kWh/t)', prereduction: 'Pre-reduction + SAF (2,500 kWh/t)' };
  const ENERGY = {
    gjPerMWh: 3.6,              // purchased electricity at final-energy value
    captiveHeatRate: 10.467,    // GJ fuel per MWh captive (2,500 kcal/kWh)
    eafSens: 0.0003             // MWh per kg of slag-bearing virgin charge (ferroalloy + NPI + pig iron); first-order  assumption
  };
  // 264 MW at Jajpur (company statements / literature, not an assured figure); LF 0.70 = assumption ("calibrate with JSL").
  // Subcritical coal units have a minimum technical load of ~55%: below that, units must be shut, not just throttled.
  const CAPTIVE = { mw: 264, hours: 8760, lf: 0.70, minTechnicalLoad: 0.55 };
  // Captive FeCr: 250 kt nameplate vs modelled need. captiveShare 'auto' = min(1, nameplate / need at the current state);
  // at FY26 need = 2.017 Mt × 0.09 t/t = 182 kt → nameplate covers 138% → share 1.0.
  const FECR_SUPPLY = { capacity_kt: 250, captiveShare: 1.0, mode: 'auto' };
  const EOL = { RR: 0.95, Y: 0.909 };                           // ISSF method B
  const LIMITS = { reMax: 90, cfMax: 80, biocharMax: 30, lfMin: 0 };   // theoretical ceilings (biochar is also a hard input cap)
  // Product basis. CR coil per t crude (estimate: casting ~0.97 × hot rolling ~0.96 × cold rolling ~0.97 ≈ 0.90).
  // JSL's disclosed S1+2 already covers the rolling mills at Jajpur and Hisar (company emissions ÷ crude tonnes), so going to
  // per-tonne-of-product divides by the yield; rolling is ADDED explicitly only where it is not in a crude intensity
  // (the Indonesia-slab route, rolled in India).
  const PRODUCT = { yieldCR: 0.90, yieldCasting: 0.97, yieldSlabToCR: 0.90 / 0.97,
    downstreamS3: 0.12, downstreamRange: [0.10, 0.15] };   // S3 cat 10 + 12 inside JSL's disclosed 3.03 (estimate)
  // Indonesia JV melt shop (1.2 MTPA; slab shipped to India and rolled at Jajpur). All values are estimates.
  const INDONESIA = {
    meltCapacity_mtpa: 1.2,
    scrap: 20,            // % scrap in the charge (NPI hot-charge route, little scrap)
    npiShare: 1.0,        // Ni units all NPI (JV smelter)
    fecrEF: 5.65,         // t CO2e/t FeCr, coal-power SAF (proxy: the Odisha merchant factor)
    meltShop: 0.60,       // t CO2e/t slab: EAF/AOD + coal power in the industrial park (0.4-0.9)
    meltShopDirect: 0.15, // t CO2/t slab: electrodes, AOD, lime, ladle fuel (direct part of meltShop)
    rollDirect: 0.08,     // t CO2/t slab: Indian reheating + annealing fuel (0.05-0.10)
    rollMWh: 0.20,        // MWh/t slab: hot + cold rolling at Jajpur (0.15-0.30)
    rollFuelGJ: 0.9       // GJ/t slab: reheating + annealing fuel (≈ rollDirect ÷ 89 kg/GJ Jajpur fired-fuel EF)
  };
  const RANGES = {
    exportTonnes: Object.assign([0, 300000], { default: 40000,
      note: 'Default 40,000 t: JSL\'s plausible in-quota EU flat volume (India\'s whole stainless-flat quota is 64,073 t/yr for all Indian mills). Our older 60-80 kt estimate exceeds the quota.' }),
    fx: [60, 150], cifEur: [1000, 6000],
    quotaShare: Object.assign([0, 1], { default: 0.6, note: 'JSL\'s assumed share of India\'s country quota (first come, first served; estimate).' })
  };
  const EURUSD = 1.15;

  // Disclosed anchors (JSL FY26 Integrated Report / BRSR; FY24 BRSR + CDP).
  const ANCHOR = {
    fy26: {
      crude_mt: 2.017, s1_t: 3074950, s2_t: 474893, s2_location_t: 651984, s3_t: 2561950,
      s12: 1.76, total: 3.03, energy_gj: 16.43, re_pct: 46.8, scrap_pct: 70.12,
      total_disclosed: 3.03,
      total_disclosed_label: 'Scope 1+2+3 as disclosed by JSL (includes downstream categories 10 & 12)',
      total_a1a3_est: r3(3.03 - PRODUCT.downstreamS3),
      total_a1a3_label: 'Cradle-to-gate (A1–A3) estimate: disclosed total minus an estimated 0.10–0.15 t (central 0.12) for downstream categories 10 & 12',
      jajpur: { s12: 2.31, s1_t: 2803152 }, hisar: { s12: 0.74, sec_gj: 8.84 },
      cleanFuelAvoided_t: 17400 + 2700   // Bio-LDO (Hisar HRM) + green H2 (Hisar), t CO2/yr
    },
    fy24: { crude_mt: 1.758, s1_t: 2992334, s2_t: 787141, s12: 2.15, energy_gj: 19.97, s3: 1.90 }
  };

  const DISCLOSED = { fy22: 1.98, fy23: 2.08, fy24: 2.15, fy25: 1.85, fy26: 1.76, target_fy35: 0.99 };

  /* ------------------------------------------------------------------ 2. grades */
  // kg per tonne of the VIRGIN (non-scrap) charge. HCFeCr @ 60% Cr, FeMo @ 70% Mo, HC-FeMn @ 75% Mn.
  // scrapCap = practical ceiling set by scrap SUPPLY + chemistry match (not carbon-steel Cu/Sn hot-shortness).
  // massFactor = mass needed per functional unit vs 304 when the design is STRENGTH-limited (1.0 if deflection/corrosion-limited).
  const GRADES = {
    '304': { label: '304 (austenitic 18Cr-8Ni)', fecr_kg: 300, ni_kg: 80, femo_kg: 0, femn_kg: 0, cu_kg: 0, pren: 19, massFactor: 1.0, scrapCap: 80,
      capNote: '300-series scrap is the most traded stainless scrap; Ni-bearing returns fit the chemistry. Outokumpu runs ~90% recycled, so 80% is a supply ceiling for India, not a metallurgical one.' },
    '316': { label: '316 (Mo-austenitic)', fecr_kg: 283, ni_kg: 100, femo_kg: 29, femn_kg: 0, cu_kg: 0, pren: 24, massFactor: 1.0, scrapCap: 75,
      capNote: 'Mo-bearing scrap is scarcer and must be segregated from 304 returns; Mo cannot be refined out, so mixed scrap caps the share.' },
    '430': { label: '430 (ferritic, Ni-free)', fecr_kg: 283, ni_kg: 0, femo_kg: 0, femn_kg: 0, cu_kg: 0, pren: 17, massFactor: 1.0, scrapCap: 60,
      capNote: 'Needs Ni-free (400-series) scrap, since Ni is a tramp element in ferritics and 400-series scrap supply is thin.' },
    '2205': { label: '2205 (duplex)', fecr_kg: 367, ni_kg: 50, femo_kg: 43, femn_kg: 0, cu_kg: 0, pren: 35, massFactor: 0.6, scrapCap: 60,
      capNote: 'Tight Cr/Ni/Mo/N phase balance; duplex scrap is scarce and 300-series scrap brings too much Ni.' },
    'J4': { label: 'J4 (200-series Cr-Mn-Cu)', fecr_kg: 250, ni_kg: 10, femo_kg: 0, femn_kg: 120, cu_kg: 16, pren: 15, massFactor: 1.0, scrapCap: 70,
      capNote: '200-series scrap is plentiful in India, and Cu (1.6%) is intentional in J4, so Cu pick-up is not the limit; Mn/N balance is.' }
  };

  /* ------------------------------------------------------------------ 3. plants (filled by calibrate()) */
  const PLANTS = {
    company: { label: 'Company (Jajpur + Hisar)', s12_disclosed: 1.76, s1_disclosed: null, crude_mt: 2.017, weights: null },
    jajpur: { label: 'Jajpur (Odisha)', s12_disclosed: 2.31, captiveMW: CAPTIVE.mw, hasSAF: true, origin: 'India (melted at Jajpur)' },
    hisar: { label: 'Hisar (Haryana)', s12_disclosed: 0.74, captiveMW: 0, hasSAF: false, origin: 'India (melted at Hisar)' },
    indonesia_slab: { label: 'Indonesia JV slab, rolled in India', s12_disclosed: null, s1_disclosed: null, captiveMW: 0, hasSAF: false, route: 'slab',
      origin: 'Indonesia (melt-and-pour: origin is where the steel was melted)',
      note: 'Slab melted at the 1.2 MTPA Indonesian melt shop (NPI/RKEF route) and rolled to CR coil at Jajpur. Every route parameter is an estimate; CBAM E uses the EU default for Indonesian slab unless a verified value is entered.' }
  };

  /* ------------------------------------------------------------------ 4. CBAM (statutory net formula only) */
  // Liability €/t = max(0, E − BM × freeAlloc) × price. Per installation, per tonne of good.
  const CBAM = {
    benchmarkA: 0.268,          // verified-data column (EAF high-alloy) — assumption for all years
    benchmarkB: 0.268,          // default-value column — base; override via state.benchmarkB (test 1.27 = Outokumpu example)
    benchmarkB_high: 1.27,
    eua_dec26: 86,              // Dec-26 EUA ≈ €86: upside case for 2026, not the base
    settlementNote: '2026 imports are declared and settled by 30 Sep 2027.',
    indiaCRDefaultBase: 6.49,   // IR 2025/2621 India CN 7219 base (may be 5.59: unverified)
    indonesiaCRDefault: 8.69,   // IR 2025/2621 Indonesia CN 7219 base (9.56 with the 2026 mark-up)
    indonesiaSlabDefault: 8.67, // IR 2025/2621 (as corrected by 2026/1740) Indonesia CN 7218 91 semi-finished, base, t CO2e/t slab
    // Default values for purchased PRECURSORS (state.precursorData = 'default'), base values without mark-up.
    // Source: IR 2025/2621 country tables as compiled by third-party CBAM databases; verify against the Annex before external use.
    precursorDefaults: {
      fecr: { value: 2.35, unit: 't CO2e/t FeCr', cn: '7202 41', country: 'India' },
      npi: { value: 6.15, unit: 't CO2e/t NPI (ferro-nickel)', cn: '7202 60', country: 'Indonesia' },
      femn: { value: 1.69, unit: 't CO2e/t FeMn', cn: '7202 11', country: 'India' },
      pigIron: { value: 2.53, unit: 't CO2e/t pig iron', cn: '7201', country: 'India' }
    },
    precursorMarkupApplied: false,  // whether the 10/20/30% mark-up applies to precursor defaults is unresolved; we use base values
    // EU steel safeguard successor measure: India's stainless flat quota (CR 38,054 + HR 26,019 t/yr, all Indian mills).
    indiaStainlessFlatQuota_t: 64073,
    indiaStainlessFlatQuotaSplit: { cr: 38054, hr: 26019 },
    quotaRegulation: 'Regulation (EU) 2026/1457 per our research; another source cites 2026/1384 — verify the number before external use.',
    outOfQuotaDuty: 0.50,       // ad valorem on customs value, out-of-quota (doubled from 25%)
    originRuleNote: 'Safeguard quota origin follows melt-and-pour (from 1 Oct 2026). For CBAM default values we assume customs origin (last substantial transformation, i.e. India for slab rolled in India); if melt-and-pour is extended to CBAM, the Indonesian CR default applies instead (shown as defaultE_meltPour).',
    years: [
      { year: 2026, price: 75, freeAlloc: 0.975, defaultE: 7.14, markup: 0.10, priceNote: 'actual (EC Q1 €75.36 / Q2 €75.28)' },
      { year: 2027, price: 89, freeAlloc: 0.95, defaultE: 7.79, markup: 0.20, priceNote: 'analyst path' },
      { year: 2028, price: 95, freeAlloc: 0.90, defaultE: 8.44, markup: 0.30, priceNote: 'analyst path' },
      { year: 2029, price: 100, freeAlloc: 0.775, defaultE: 8.44, markup: 0.30, priceNote: 'analyst path' },
      { year: 2030, price: 109, freeAlloc: 0.515, defaultE: 8.44, markup: 0.30, priceNote: 'analyst path' }
    ]
  };
  const cbamCost = (E, row, bm) => Math.max(0, E - bm * row.freeAlloc) * row.price;

  /* ------------------------------------------------------------------ 5. optimiser tiers + costs */
  // scrapBelowCap: practical scrap ceiling = grade cap − this (India scrap supply); npiMin: New Yaking offtake keeps some NPI.
  const TIERS = {
    practical: { key: 'practical', label: 'Practical today', reMax: 70, cfMax: 15, biocharMax: 20, lfMin: 0.55, npiMin: 45, npiEF: false, scrapBelowCap: 5,
      note: 'Buildable with contracts and equipment available today: bio-LDO only (no hydrogen at scale), RE ≤70% of purchased power, biochar ≤20%, captive coal kept at or above minimum technical load (LF ≥0.55), NPI share ≥45% and JV power unchanged, scrap 5 pp below the grade cap.' },
    stretch: { key: 'stretch', label: 'Stretch 2030', reMax: 90, cfMax: 40, biocharMax: 30, lfMin: 0.40, npiMin: 30, npiEF: true, scrapBelowCap: 0,
      note: 'Plausible by 2030 with firm RTC renewables, some green hydrogen, one captive unit shut (LF ≥0.40), NPI share ≥30% with the JV on renewable/hydro power.' },
    theoretical: { key: 'theoretical', label: 'Theoretical floor', reMax: LIMITS.reMax, cfMax: LIMITS.cfMax, biocharMax: LIMITS.biocharMax, lfMin: LIMITS.lfMin, npiMin: 0, npiEF: true, scrapBelowCap: 0,
      note: 'Every lever at the model\'s ceiling, including the captive coal plant fully replaced by purchased power. Not a plan: a bound.' }
  };
  const COSTS = {
    inrPerUsd: 90 / EURUSD,   // derived from the model's own ₹90/€ and US$1.15/€ defaults (≈ ₹78/$)
    captiveLF: [              // ₹/kWh extra for replacing captive coal with purchased power (RTC RE PPA vs captive variable cost)
      { lo: CAPTIVE.minTechnicalLoad, hi: 1, inrPerKWh: 2.0, note: 'RTC renewable PPA ≈ ₹1.5–2.5/kWh above captive coal variable cost (estimate, mid ₹2.0)' },
      { lo: 0, hi: CAPTIVE.minTechnicalLoad, inrPerKWh: 3.0, note: 'below minimum technical load units must be shut: fixed costs are no longer spread (estimate +₹1.0/kWh)' }
    ]
  };
  // $/tCO2 steps in the lever's own units (absolute level). Activity-based: $/t steel = $/tCO2 × FY26 company abatement per unit.
  const COST_PROXY = {
    scrap: { usdPerTCO2: 36.5, label: 'Scrap + sensor sorting', steps: null /* grade-dependent: see scrapSteps() */,
      source: 'Team estimate: scrap premium over virgin charge + sensor sorting; last 5 pp to the grade cap at $60 (imported/segregated scrap)', status: 'assumption' },
    npi: { usdPerTCO2: 36, label: 'Less NPI (Class-1 nickel)', steps: [{ lo: 0, hi: 100, usd: 36 }],
      source: 'Team estimate: Class-1 premium over NPI per t Ni ÷ 56 t CO2 saved per t Ni', status: 'assumption' },
    re: { usdPerTCO2: 15, label: 'Renewables (purchased power)', steps: [{ lo: 0, hi: 55, usd: 15 }, { lo: 55, hi: 100, usd: 40 }],
      source: 'Team estimate: green open-access premium $15/tCO2; above 55% of purchased power firming/storage for round-the-clock supply $40/tCO2', status: 'assumption' },
    cf: { usdPerTCO2: 50, label: 'Clean fuel (bio-LDO, then green H2)', steps: [{ lo: 0, hi: 15, usd: 50 }, { lo: 15, hi: 100, usd: 250 }],
      source: 'Estimate: bio-LDO premium over LDO $40–60/tCO2 (mid 50) for the first 15% of fired fuel; beyond that green hydrogen at ~US$4–5/kg ≈ $200–300/tCO2 (mid 250)', status: 'assumption' },
    biochar: { usdPerTCO2: 29, label: 'Biochar in own SAF', steps: [{ lo: 0, hi: 20, usd: 29 }, { lo: 20, hi: 100, usd: 45 }],
      source: 'Team analysis of published biochar prices vs coke/coal reductant; above 20% supply and quality premium $45', status: 'assumption' },
    fecr: { usdPerTCO2: 60, label: 'Merchant FeCr → imported low-carbon', source: 'Team estimate: price premium of closed-SAF / hydro-powered FeCr', status: 'assumption' },
    npiEF: { usdPerTCO2: 45, label: 'NPI JV on RE/hydro', source: 'Estimate: Indonesian RE/storage vs captive coal ≈ $40–50/MWh extra ÷ ~1 t CO2/MWh; JSL holds 49%, so it needs the partner', status: 'assumption' },
    captiveLF: { usdPerTCO2: null, label: 'Run the captive coal plant less', source: 'Estimate: ₹2.0/kWh above captive coal down to LF 0.55, ₹3.0/kWh below (unit shutdown); converted at ₹78/$', status: 'assumption' }
  };

  /* ------------------------------------------------------------------ 6. presets (never carry grade/plant) */
  const LEVER_FIELDS = ['scrap', 'npi', 're', 'cf', 'fecr', 'biochar', 'feUnits', 'npiEF', 'safTech', 'captiveLF', 'fecrCaptiveShare', 'fecrMerchant'];
  const PRESETS = {
    fy26: { label: 'FY26 (today)', note: 'Disclosed outputs, fitted inputs: scrap 70% and RE 47% are disclosed; clean fuel 2% is derived from Bio-LDO + H2 savings; NPI share is a calibration fit (assumed); captive load factor 0.70 is assumed.',
      scrap: 70, npi: 58, re: 47, cf: 2, fecr: 'captive', biochar: 0, feUnits: 'scrap', npiEF: 69, safTech: 'open', captiveLF: CAPTIVE.lf, fecrCaptiveShare: null, fecrMerchant: 'odisha' },
    fy30: { label: 'JSL roadmap FY30', note: 'Illustrative reading of announced projects (315.6 MW hybrid RE, green H2 at Jajpur, higher scrap): our inputs, not a JSL target.',
      scrap: 75, npi: 58, re: 75, cf: 10, fecr: 'captive', biochar: 0, feUnits: 'scrap', npiEF: 69, safTech: 'open', captiveLF: CAPTIVE.lf, fecrCaptiveShare: null, fecrMerchant: 'odisha' },
    maxgreen: { label: 'Theoretical maximum', tier: 'theoretical', note: 'Every material/fuel lever at its modelled ceiling: scrap at the grade cap, Class-1 Ni, RE 90% of purchased power, clean fuel 80% (mostly hydrogen), biochar 30%, closed SAF, NPI on RE. Captive coal keeps its FY26 share of Jajpur\'s electricity (load factor 0.70 at FY26 demand), so it generates less as demand falls. A bound, not a plan.',
      scrap: 80, npi: 0, re: 90, cf: 80, fecr: 'captive', biochar: 30, feUnits: 'scrap', npiEF: 30, safTech: 'closed', captiveLF: CAPTIVE.lf, fecrCaptiveShare: null, fecrMerchant: 'odisha' }
  };

  /* ------------------------------------------------------------------ 7. calibration (runs once at load) */
  const CAL = {};          // fitted values; exposed as M.CALIBRATION
  let NPI_REF = 0.58;      // Fe-unit reference NPI share (= FY26 fitted share)

  function calibrate() {
    const A = ANCHOR.fy26, T = A.crude_mt;
    const X = FECR_SUPPLY.captiveShare;
    const re = PRESETS.fy26.re / 100, cf = PRESETS.fy26.cf / 100;
    const g = GRADES['304'], v = 1 - PRESETS.fy26.scrap / 100;

    // (a) crude split from S1+2 absolutes and installation intensities
    const s12abs = (A.s1_t + A.s2_t) / 1e6;
    const xJ = (s12abs - A.hisar.s12 * T) / (A.jajpur.s12 - A.hisar.s12), xH = T - xJ;
    const wJ = xJ / T, wH = xH / T;
    const s1J = A.jajpur.s1_t / 1e6 / xJ, s2J = A.jajpur.s12 - s1J;
    const s1H = (A.s1_t - A.jajpur.s1_t) / 1e6 / xH, s2H = A.hisar.s12 - s1H;

    // (b) NPI share of Ni units from company S3 (all FeCr captive → no merchant FeCr S3 at company level)
    const s3target = A.s3_t / 1e6 / T;
    const nonNi = v * (g.femo_kg * EF.femo + g.femn_kg * EF.femn + g.cu_kg * EF.cu) / 1000 + v * g.fecr_kg * (1 - X) * EF.fecrOdisha / 1000 + EF.consumables;
    const nExact = ((s3target - nonNi) * 1000 / (v * g.ni_kg) - EF.niClass1) / (EF.npiCoal - EF.niClass1);
    const n = Math.round(nExact * 100) / 100;
    PRESETS.fy26.npi = PRESETS.fy30.npi = Math.round(n * 100);
    NPI_REF = n;

    // (c) AOD / process: keep 0.12 total at the calibration point; carbon from FeCr + NPI is explicit
    const need = v * g.fecr_kg / 1000;
    const npiMass = v * g.ni_kg * n / CHEM.npiNi;
    const cKg = v * g.fecr_kg * CHEM.fecrC + npiMass * CHEM.npiC;
    const aodRef = 0.12;
    const aodOther = aodRef - cKg * CHEM.co2PerC / 1000;
    const slagRef = v * (g.fecr_kg + g.femo_kg + g.femn_kg) + npiMass;

    // (d) Hisar: no captive coal, no SAF
    const pH = s2H / ((1 - re) * EF.grid);
    const F0H = (s1H - aodRef) / (1 - cf);
    const thermalH = A.hisar.sec_gj - pH * ENERGY.gjPerMWh;

    // (e) Jajpur: captive coal at LF, SAF supplies the whole group's Cr units
    const cJ = CAPTIVE.mw * CAPTIVE.hours * CAPTIVE.lf / (xJ * 1e6);
    const pJ = s2J / ((1 - re) * EF.grid);
    const safOut = X * need / wJ;
    const safRefMWh = safOut * SAF_KWH.open / 1000;
    const eSteelJ = cJ + pJ - safRefMWh;
    const F0J = (s1J - cJ * EF.captive - safOut * EF.fecrDirect - aodRef) / (1 - cf);
    const energyJ = (A.energy_gj * T - A.hisar.sec_gj * xH) / xJ;
    const thermalJ = energyJ - cJ * ENERGY.captiveHeatRate - pJ * ENERGY.gjPerMWh;
    const siteEF = (cJ * EF.captive + pJ * (1 - re) * EF.grid) / (cJ + pJ);

    Object.assign(CAL, {
      wJ, wH, crudeJ_mt: xJ, crudeH_mt: xH,
      s1J, s2J, s1H, s2H, s3target, npiExact: nExact, npi: n,
      aodRef, aodOther, carbonRef_tCO2: cKg * CHEM.co2PerC / 1000, slagRef_kg: slagRef, fecrNeedRef_t: need,
      jajpur: { captiveMWh: cJ, purchasedMWh: pJ, safOut_t: safOut, safRefMWh, dRefMWh: cJ + pJ, eSteelBase: eSteelJ, F0: F0J, thermalGJ: thermalJ, energyGJ: energyJ,
        impliedFiredEF_kgGJ: 1000 * F0J / thermalJ, captiveShareOfElec: cJ / (cJ + pJ), siteEF,
        ownFecr_site: EF.fecrDirect + SAF_KWH.open / 1000 * siteEF, ownFecr_marginal: EF.fecrDirect + SAF_KWH.open / 1000 * (1 - re) * EF.grid },
      hisar: { captiveMWh: 0, purchasedMWh: pH, safOut_t: 0, safRefMWh: 0, dRefMWh: pH, eSteelBase: pH, F0: F0H, thermalGJ: thermalH, energyGJ: A.hisar.sec_gj,
        impliedFiredEF_kgGJ: 1000 * F0H / thermalH },
      captiveShareOfS1_company: wJ * cJ * EF.captive / (A.s1_t / 1e6 / T),
      captiveShareOfS1_jajpur: cJ * EF.captive / s1J,
      fecrCoverAtNameplate: FECR_SUPPLY.capacity_kt / (T * 1000 * need),
      locationS2_impliedGridEF: A.s2_location_t / 1e6 / T / (wJ * pJ + wH * pH)
    });
    Object.assign(PLANTS.jajpur, { share: wJ, crude_mt: xJ, eSteelBase: eSteelJ, safRefMWh, F0: F0J, thermalGJ: thermalJ, s1_disclosed: s1J });
    Object.assign(PLANTS.hisar, { share: wH, crude_mt: xH, eSteelBase: pH, safRefMWh: 0, F0: F0H, thermalGJ: thermalH, s1_disclosed: s1H });
    PLANTS.company.weights = { jajpur: wJ, hisar: wH };
    PLANTS.company.s1_disclosed = A.s1_t / 1e6 / T;
  }

  /* ------------------------------------------------------------------ 8. state */
  function defaultState() {
    const p = PRESETS.fy26;
    return { grade: '304', plant: 'company', scrap: p.scrap, npi: p.npi, re: p.re, cf: p.cf, fecr: p.fecr, biochar: p.biochar,
      feUnits: p.feUnits, npiEF: p.npiEF, safTech: p.safTech, captiveLF: p.captiveLF, benchmarkB: CBAM.benchmarkB,
      fecrCaptiveShare: null, fecrMerchant: 'odisha', fecrAttribution: 'site', precursorData: 'verified', basis: 'crude',
      indonesiaSlabE: null, quotaShare: RANGES.quotaShare.default,
      exportTonnes: RANGES.exportTonnes.default, fx: 90, cifEur: 3000 };
  }

  // Keeps grade + plant; clamps scrap to the grade cap.
  function applyPreset(state, key) {
    const p = PRESETS[key];
    if (!p) throw new Error('Unknown preset ' + key);
    const out = Object.assign({}, state || defaultState());
    LEVER_FIELDS.forEach(f => { if (p[f] !== undefined) out[f] = p[f]; });
    const g = GRADES[out.grade] || GRADES['304'];
    if (out.scrap > g.scrapCap) out.scrap = g.scrapCap;
    return out;
  }

  const optShare = v => {                         // null = auto; accepts 0-1 or 0-100
    if (v === null || v === undefined || v === '' || v === 'auto') return null;
    let x = num(v, NaN);
    if (!isFinite(x)) return null;
    if (x > 1) x = x / 100;
    return clamp(x, 0, 1);
  };

  function normalize(state, W) {
    const s = state || {};
    const w = W || [];
    const d = defaultState();
    const out = {};
    out.grade = GRADES[s.grade] ? s.grade : (s.grade !== undefined && w.push(`Unknown grade "${s.grade}": using 304.`), '304');
    out.plant = PLANTS[s.plant] ? s.plant : (s.plant !== undefined && w.push(`Unknown plant "${s.plant}": using company.`), 'company');
    out.scrap = clamp(num(s.scrap, d.scrap), 0, 100);
    out.npi = clamp(num(s.npi, d.npi), 0, 100);
    out.re = clamp(num(s.re, d.re), 0, 100);
    out.cf = clamp(num(s.cf, d.cf), 0, 100);
    const bio = clamp(num(s.biochar, 0), 0, 100);
    if (bio > LIMITS.biocharMax) w.push(`Biochar is capped at ${LIMITS.biocharMax}% of SAF reductant (furnace resistivity and slag limits); ${bio}% was reduced to ${LIMITS.biocharMax}%.`);
    out.biochar = Math.min(bio, LIMITS.biocharMax);
    out.fecr = ['captive', 'odisha', 'imported'].includes(s.fecr) ? s.fecr : 'captive';
    out.fecrMerchant = out.fecr !== 'captive' ? out.fecr : (s.fecrMerchant === 'imported' ? 'imported' : 'odisha');
    out.fecrCaptiveShare = optShare(s.fecrCaptiveShare);
    out.fecrAttribution = s.fecrAttribution === 'marginal' ? 'marginal' : 'site';
    out.precursorData = s.precursorData === 'default' ? 'default' : 'verified';
    out.basis = s.basis === 'product' ? 'product' : 'crude';
    out.feUnits = s.feUnits === 'pigiron' ? 'pigiron' : 'scrap';
    out.npiEF = clamp(num(s.npiEF, EF.npiCoal), 0, 150);
    out.safTech = SAF_KWH[s.safTech] ? s.safTech : 'open';
    let lf = num(s.captiveLF, CAPTIVE.lf);
    if (lf > 1) lf = lf / 100;                           // accept 70 as 70%
    out.captiveLF = clamp(lf, 0, 1);
    out.benchmarkB = clamp(num(s.benchmarkB, CBAM.benchmarkB), 0, 5);
    const ie = s.indonesiaSlabE === null || s.indonesiaSlabE === undefined || s.indonesiaSlabE === '' ? NaN : num(s.indonesiaSlabE, NaN);
    out.indonesiaSlabE = isFinite(ie) ? clamp(ie, 0, 30) : null;
    let qs = num(s.quotaShare, d.quotaShare);
    if (qs > 1) qs = qs / 100;
    out.quotaShare = clamp(qs, 0, 1);
    const rng = (k, def) => {
      const raw = num(s[k], def), [lo, hi] = RANGES[k], v = clamp(raw, lo, hi);
      if (raw !== v) w.push(`${k} ${raw} is outside ${lo}–${hi}; using ${v}.`);
      return v;
    };
    out.exportTonnes = rng('exportTonnes', d.exportTonnes);
    out.fx = rng('fx', d.fx);
    out.cifEur = rng('cifEur', d.cifEur);
    return out;
  }

  /* ------------------------------------------------------------------ 9. the model */
  // Precursor direct factors used in CBAM E: supplier / literature ('verified') or EU default values ('default').
  function precursorFactors(st) {
    const D = CBAM.precursorDefaults;
    return st.precursorData === 'default'
      ? { fecr: D.fecr.value, npiPerKgNi: D.npi.value / CHEM.npiNi, femn: D.femn.value, pig: D.pigIron.value }
      : { fecr: EF.fecrDirect, npiPerKgNi: EF.npiDirect, femn: EF.femnDirect, pig: EF.pigIronDirect };
  }
  const VERIFIED_ST = { precursorData: 'verified' }, DEFAULT_ST = { precursorData: 'default' };

  // One Indian installation, per tonne of that installation's crude steel. jRes = Jajpur result at the same state (Hisar only).
  function plantCore(pk, st, ctx, jRes) {
    const P = PLANTS[pk], g = GRADES[st.grade];
    const s = st.scrap / 100, v = 1 - s;
    const n = g.ni_kg > 0 ? st.npi / 100 : 0;
    const re = st.re / 100, cf = st.cf / 100, bio = st.biochar / 100;
    const kwh = SAF_KWH[st.safTech];
    const crudeTot = ctx.crude_mt || ANCHOR.fy26.crude_mt;
    const marginal = st.fecrAttribution === 'marginal';

    // alloy + Fe units
    const need = v * g.fecr_kg / 1000;                                  // t FeCr / tcs
    // own-SAF share of Cr units: user share (or auto = 1) capped by 250 kt nameplate
    const Xcap = need > 1e-12 ? Math.min(1, FECR_SUPPLY.capacity_kt / (need * crudeTot * 1000)) : 1;
    const X = st.fecr === 'captive' ? Math.min(st.fecrCaptiveShare === null || st.fecrCaptiveShare === undefined ? 1 : st.fecrCaptiveShare, Xcap) : 0;
    const merchant = st.fecr === 'captive' ? st.fecrMerchant : st.fecr;
    const niKg = v * g.ni_kg, npiNi = niKg * n, c1Ni = niKg - npiNi;    // kg Ni
    const npiMass = npiNi / CHEM.npiNi;                                  // kg NPI
    const feDisplaced = g.ni_kg > 0 ? Math.max(0, v * g.ni_kg * (NPI_REF - n)) * CHEM.fePerNiNPI : 0;  // kg Fe lost when NPI < reference
    const pigKg = st.feUnits === 'pigiron' ? feDisplaced / CHEM.pigFe : 0;

    // S1: AOD decarburisation carbon mass balance + other process
    const cKg = v * g.fecr_kg * CHEM.fecrC + npiMass * CHEM.npiC + v * g.femn_kg * CHEM.femnC + pigKg * CHEM.pigC;
    const aodCarbon = cKg * CHEM.co2PerC / 1000;
    const aod = CAL.aodOther + aodCarbon;

    // S1: captive SAF (Jajpur supplies the group's Cr units: output per Jajpur tonne = need / wJ)
    const safOut = P.hasSAF ? X * need / CAL.wJ : 0;
    const safRed = safOut * EF.fecrDirect * (1 - bio);
    const safMWh = safOut * kwh / 1000;

    // electricity balance
    const slagKg = v * (g.fecr_kg + g.femo_kg + g.femn_kg) + npiMass + pigKg;
    const eSteel = Math.max(0, P.eSteelBase * (ctx.elecMult || 1) + ENERGY.eafSens * (slagKg - CAL.slagRef_kg));
    const eTot = eSteel + safMWh;
    const crude = crudeTot * P.share;
    const capAbs = P.captiveMW * CAPTIVE.hours / (crude * 1e6);         // MWh/t at LF 1
    const cMax = capAbs * st.captiveLF;
    let cUsed, phi = 0;
    if (!P.captiveMW) cUsed = 0;
    else if (marginal) cUsed = Math.min(cMax, eTot);                    // captive is baseload; purchased power is the swing
    else {                                                               // 'site': captive covers a fixed share of site demand
      const dRef = P.eSteelBase * (ctx.elecMult || 1) + P.safRefMWh;     // reference demand (FY26 levers) in this year's context
      phi = dRef > 0 ? Math.min(1, cMax / dRef) : 0;
      cUsed = Math.min(phi * eTot, capAbs, eTot);
    }
    const pur = eTot - cUsed;
    const capCO2 = cUsed * EF.captive;
    const s2 = pur * (1 - re) * EF.grid;
    const efMarg = pur > 1e-12 ? (1 - re) * EF.grid : EF.captive;       // marginal EF of the next MWh (baseload dispatch)
    const efSite = eTot > 1e-12 ? (capCO2 + s2) / eTot : (1 - re) * EF.grid;
    const efAttr = marginal ? efMarg : efSite;                           // EF charged to SAF electricity

    const fired = P.F0 * (1 - cf);
    const s1 = capCO2 + safRed + fired + aod;

    // S3 (recycled-content cut-off: scrap carries no burden)
    const merchantEF = merchant === 'imported' ? EF.fecrImported : EF.fecrOdisha;
    const fecrMerchant = need * (1 - X) * merchantEF;
    const ownFecrEF = EF.fecrDirect * (1 - bio) + kwh / 1000 * (P.hasSAF ? efAttr : (jRes ? jRes.efAttr : efAttr));
    let intra = 0, intraDirect = 0;
    if (!P.hasSAF && X > 0) {                                             // Hisar buys Jajpur FeCr (intra-group)
      intra = X * need * ownFecrEF;
      intraDirect = X * need * EF.fecrDirect * (1 - bio);
    }
    const s3fecr = fecrMerchant + intra;
    const s3ni = (npiNi * st.npiEF + c1Ni * EF.niClass1) / 1000;
    const s3femo = v * g.femo_kg * EF.femo / 1000;
    const s3femn = v * g.femn_kg * EF.femn / 1000;
    const s3cu = v * g.cu_kg * EF.cu / 1000;
    const s3fe = pigKg * EF.pigIron / 1000;
    const s3 = s3fecr + s3ni + s3femo + s3femn + s3cu + s3fe + EF.consumables;

    // FeCr shipped to Hisar, inside Jajpur's inventory (removed for a Jajpur product footprint)
    const fecrExportEm = P.hasSAF ? X * need * (CAL.wH / CAL.wJ) * ownFecrEF : 0;

    // CBAM: direct only. Remove captive power (indirect under Annex II) and SAF output shipped to Hisar
    // (it belongs to the FeCr good); add purchased precursors' direct emissions. Class-1 Ni, Cu, FeMo, scrap = 0.
    const safExportRed = P.hasSAF ? safRed * (1 - CAL.wJ) : 0;
    const prec = f => need * (1 - X) * f.fecr + intraDirect + (npiNi * f.npiPerKgNi + v * g.femn_kg * f.femn + pigKg * f.pig) / 1000;
    const precVer = prec(precursorFactors(VERIFIED_ST)), precDef = prec(precursorFactors(DEFAULT_ST));
    const precursors = st.precursorData === 'default' ? precDef : precVer;
    const direct = s1 - capCO2 - safExportRed;
    const cbamE = direct + precursors;

    // energy
    const elecGJ = cUsed * ENERGY.captiveHeatRate + pur * ENERGY.gjPerMWh;
    const thermalGJ = P.thermalGJ;

    // process breakdown (sums to total). SAF electricity at the attribution rule's EF.
    let safElecP, safElecC;
    if (marginal) {
      const safFromP = Math.min(safMWh, pur), safFromC = safMWh - safFromP;
      safElecP = safFromP * (1 - re) * EF.grid; safElecC = safFromC * EF.captive;
    } else {
      const c = eTot > 1e-12 ? cUsed / eTot : 0;
      safElecP = safMWh * (1 - c) * (1 - re) * EF.grid; safElecC = safMWh * c * EF.captive;
    }
    const total = s1 + s2 + s3;

    return {
      s1, s2, s3, s12: s1 + s2, total, cbamE, cbamE_conservative: s1 + precursors, cbamE_scope1: s1,
      cbamE_ver: direct + precVer, cbamE_def: direct + precDef,
      footprint_product: total - fecrExportEm, fecrExportEm,
      energy_gj: elecGJ + thermalGJ, elecGJ, thermalGJ,
      capCO2, safRed, safExportRed, fired, aod, aodCarbon, precursors, intra, efMarg, efSite, efAttr,
      eTot, eSteel, safMWh, cUsed, cMax, pur, reMWh: pur * re, safOut, need, pigKg, npiMass,
      X, Xcap, merchant, ownFecrEF, lfEff: capAbs > 0 ? cUsed / capAbs : 0,
      bd: {
        captivePower: capCO2 - safElecC, saf: safRed + safElecP + safElecC, reheat: fired, aod,
        grid: s2 - safElecP, fecr: s3fecr, ni: s3ni, femo: s3femo, femn: s3femn, cu: s3cu, feUnits: s3fe, consumables: EF.consumables
      }
    };
  }

  // Indonesia JV slab rolled at Jajpur: per tonne of slab processed (the crude-equivalent). J = Jajpur result (for the power mix).
  function routeCore(st, ctx, J) {
    const g = GRADES[st.grade], I = INDONESIA;
    const v = 1 - I.scrap / 100, re = st.re / 100, cf = st.cf / 100;
    const niKg = v * g.ni_kg, npiNi = g.ni_kg > 0 ? niKg * I.npiShare : 0, c1Ni = niKg - npiNi;
    const npiMass = npiNi / CHEM.npiNi, need = v * g.fecr_kg / 1000;
    const fecr = need * I.fecrEF, ni = (npiNi * st.npiEF + c1Ni * EF.niClass1) / 1000;
    const femo = v * g.femo_kg * EF.femo / 1000, femn = v * g.femn_kg * EF.femn / 1000, cu = v * g.cu_kg * EF.cu / 1000;
    const slabFoot = fecr + ni + femo + femn + cu + I.meltShop + EF.consumables;
    const slabE_modelEstimate = I.meltShopDirect + need * EF.fecrDirect + npiNi * EF.npiDirect / 1000 + v * g.femn_kg * EF.femnDirect / 1000;
    const slabE = st.indonesiaSlabE !== null && st.indonesiaSlabE !== undefined ? st.indonesiaSlabE : CBAM.indonesiaSlabDefault;
    // rolling at Jajpur, supplied at the Jajpur attribution rule
    let cUsed, pur;
    if (st.fecrAttribution === 'marginal') { if (J.pur > 1e-12) { cUsed = 0; pur = I.rollMWh; } else { cUsed = I.rollMWh; pur = 0; } }
    else { const c = J.eTot > 1e-12 ? J.cUsed / J.eTot : 0; cUsed = I.rollMWh * c; pur = I.rollMWh - cUsed; }
    const capCO2 = cUsed * EF.captive, s2 = pur * (1 - re) * EF.grid;
    const fired = I.rollDirect * (1 - cf);
    const s1 = fired + capCO2, s3 = slabFoot, total = s1 + s2 + s3;
    const cbamE = slabE + fired;
    const elecGJ = cUsed * ENERGY.captiveHeatRate + pur * ENERGY.gjPerMWh, thermalGJ = I.rollFuelGJ * (1 - cf);
    return {
      s1, s2, s3, s12: s1 + s2, total, cbamE, cbamE_conservative: cbamE + capCO2, cbamE_scope1: s1, cbamE_ver: cbamE, cbamE_def: cbamE,
      footprint_product: total, fecrExportEm: 0, slabE, slabE_modelEstimate, slabFootprint: slabFoot,
      energy_gj: elecGJ + thermalGJ, elecGJ, thermalGJ,
      capCO2, safRed: 0, safExportRed: 0, fired, aod: 0, aodCarbon: 0, precursors: slabE, intra: 0, efMarg: J.efMarg, efSite: J.efSite, efAttr: J.efAttr,
      eTot: I.rollMWh, eSteel: I.rollMWh, safMWh: 0, cUsed, cMax: 0, pur, reMWh: pur * re, safOut: 0, need, pigKg: 0, npiMass,
      X: 0, Xcap: J.Xcap, merchant: 'n/a', ownFecrEF: I.fecrEF, lfEff: J.lfEff,
      bd: { captivePower: capCO2, saf: 0, reheat: fired, aod: 0, grid: s2, fecr, ni, femo, femn, cu, feUnits: 0, consumables: EF.consumables, slabMelt: I.meltShop }
    };
  }

  const NUM_KEYS = ['s1', 's2', 's3', 's12', 'total', 'cbamE', 'cbamE_conservative', 'cbamE_scope1', 'cbamE_ver', 'cbamE_def', 'footprint_product',
    'energy_gj', 'elecGJ', 'thermalGJ', 'capCO2', 'safRed',
    'safExportRed', 'fired', 'aod', 'aodCarbon', 'precursors', 'intra', 'eTot', 'eSteel', 'safMWh', 'cUsed', 'cMax', 'pur', 'reMWh', 'safOut', 'need', 'pigKg', 'npiMass'];

  // Fast path: normalized state in, raw numbers out (no EoL, no warnings). Used by every search.
  function core(st, ctx) {
    ctx = ctx || {};
    const J = plantCore('jajpur', st, ctx, null);
    if (st.plant === 'jajpur') return Object.assign(J, { plant: 'jajpur', J });
    if (st.plant === 'indonesia_slab') return Object.assign(routeCore(st, ctx, J), { plant: 'indonesia_slab', J });
    const H = plantCore('hisar', st, ctx, J);
    if (st.plant === 'hisar') return Object.assign(H, { plant: 'hisar', J, H });
    const wJ = CAL.wJ, wH = CAL.wH, C = { plant: 'company', J, H, bd: {} };
    NUM_KEYS.forEach(k => { C[k] = wJ * J[k] + wH * H[k]; });
    Object.keys(J.bd).forEach(k => { C.bd[k] = wJ * J.bd[k] + wH * H.bd[k]; });
    // eliminate intra-group FeCr: it is already inside Jajpur's S1+S2
    const elim = wH * H.intra;
    C.s3 -= elim; C.total -= elim; C.bd.fecr -= elim; C.intra = 0;
    C.footprint_product = C.total;    // = wJ·(J.total − export) + wH·H.total, exactly
    ['efMarg', 'efSite', 'efAttr', 'X', 'Xcap', 'merchant', 'ownFecrEF', 'lfEff'].forEach(k => { C[k] = J[k]; });
    // cbamE: weighted sum is exact (Jajpur's exported SAF reductant = Hisar's intra precursor)
    return C;
  }

  // Company-level S1+2 with own-FeCr production restored to what the own SAFs can supply: the basis for progress to FY35.
  function progressState(st) {
    const x = Object.assign({}, st, { plant: 'company' });
    if (x.fecr !== 'captive') x.fecrMerchant = x.fecr;
    x.fecr = 'captive'; x.fecrCaptiveShare = null;
    return x;
  }

  function metricOf(st, metric, ctx) {
    if (metric === 'cbamE' && st.plant === 'company') return core(Object.assign({}, st, { plant: 'jajpur' }), ctx).cbamE;
    if (metric === 's12_progress') return core(progressState(st), ctx).s12;
    return core(st, ctx)[metric];
  }

  const installationOf = plant => (plant === 'company' ? 'jajpur' : plant);
  const yieldOf = plant => (plant === 'indonesia_slab' ? PRODUCT.yieldSlabToCR : PRODUCT.yieldCR);
  const downstreamOf = plant => (plant === 'indonesia_slab' ? 0 : PRODUCT.downstreamS3);

  function compute(state, ctx) {
    const warnings = [];
    const st = normalize(state, warnings);
    const r = core(st, ctx);
    const g = GRADES[st.grade];
    const route = st.plant === 'indonesia_slab';
    // ISSF method B (end-of-life credit): X = Xpr + (Xre − Xpr)·RR·Y, other levers held
    const xPr = core(Object.assign({}, st, { scrap: 0 }), ctx).total;
    const xRe = core(Object.assign({}, st, { scrap: 100 }), ctx).total;
    const eol = xPr + (xRe - xPr) * EOL.RR * EOL.Y;
    const inst = installationOf(st.plant);
    const rI = st.plant === 'company' ? r.J : r;
    const k = st.basis === 'product' ? 1 / yieldOf(st.plant) : 1;
    const sc = x => x * k;

    // relocation: S1+2 cuts that only move emissions into Scope 3 (own FeCr → bought) or to another installation
    const sCo = st.plant === 'company' ? r.s12 : core(Object.assign({}, st, { plant: 'company' }), ctx).s12;
    const sProg = core(progressState(st), ctx).s12;
    const relocation = { fecr_t: sc(sProg - sCo), plant_t: sc(sCo - r.s12) };
    relocation.total_t = relocation.fecr_t + relocation.plant_t;

    const J = r.J;
    if (st.scrap > g.scrapCap && !route) warnings.push(`Scrap ${st.scrap}% is above the ~${g.scrapCap}% practical ceiling for ${st.grade}: ${g.capNote}`);
    if (g.ni_kg === 0 && (st.npi !== PRESETS.fy26.npi || st.npiEF !== EF.npiCoal)) warnings.push(`${st.grade} contains no nickel, so the NPI settings have no effect.`);
    if (st.biochar > 0 && st.fecr !== 'captive' && !route) warnings.push('Biochar only changes JSL\'s own SAF reductant; with all FeCr bought in it has no effect.');
    if (st.feUnits === 'pigiron' && g.ni_kg > 0 && st.npi < NPI_REF * 100 && !route) warnings.push(`Cutting NPI below ${Math.round(NPI_REF * 100)}% removes the Fe it carried; that Fe is modelled as bought pig iron (2.1 t CO2/t), which offsets part of the saving.`);
    if (st.fecr === 'captive' && !route && J.Xcap < 1 - 1e-9) warnings.push(`JSL's own SAFs (${FECR_SUPPLY.capacity_kt} kt/yr nameplate) cover only ${Math.round(J.Xcap * 100)}% of the chromium units at this scrap share; the rest is bought (${J.merchant === 'imported' ? 'imported' : 'merchant Odisha'} FeCr).`);
    if (st.fecrCaptiveShare !== null && st.fecr === 'captive' && st.fecrCaptiveShare > J.Xcap + 1e-9) warnings.push(`Own-SAF share ${Math.round(st.fecrCaptiveShare * 100)}% exceeds what 250 kt of SAF capacity can supply here; capped at ${Math.round(J.Xcap * 100)}%.`);
    if (relocation.fecr_t > 0.005) warnings.push(`Buying ferrochrome instead of smelting it lowers Scope 1+2 by ${r3(relocation.fecr_t)} t/t but adds it to Scope 3: relocation, not abatement. Progress to the FY35 target uses s12_progress_basis, which adds it back.`);
    if (st.fecrAttribution === 'marginal' && st.plant !== 'hisar' && !route && J.cMax > 0 && J.cUsed < J.cMax - 1e-9) warnings.push('Electricity demand at Jajpur fell below captive generation; the captive plant is modelled as backed down.');
    if (st.re > LIMITS.reMax) warnings.push(`RE above ${LIMITS.reMax}% of purchased power needs round-the-clock contracts not yet available at this scale (assumption).`);
    if (st.cf > LIMITS.cfMax) warnings.push(`Clean fuel above ${LIMITS.cfMax}% of fired fuel has no demonstrated supply route at JSL scale (assumption).`);
    if (route) warnings.push('Indonesia-slab route: scrap, NPI share, FeCr sourcing, biochar, SAF and captive-coal levers apply to the Indian melt shops and do not move this route. Grade, NPI power (the JV), and clean fuel / renewables (Indian rolling only) do. Route parameters are estimates.');

    const bd = {};
    Object.keys(r.bd).forEach(key => { bd[key] = sc(r.bd[key]); });
    const kI = 1 / yieldOf(inst);            // customer PCF is always per tonne of product
    const customer_crude = rI.footprint_product - downstreamOf(inst);
    const isIndia = !route;
    return {
      state: st, plant: st.plant, basis: st.basis,
      unit: st.basis === 'product' ? 't CO2e per t cold-rolled coil' : 't CO2e per t crude steel',
      yield: yieldOf(st.plant),
      s1: sc(r.s1), s2: sc(r.s2), s3: sc(r.s3), s12: sc(r.s12), total: sc(r.total),
      total_label: isIndia ? ANCHOR.fy26.total_disclosed_label : 'Cradle-to-gate estimate (slab route; no downstream categories)',
      footprint_a1a3: sc(r.footprint_product - downstreamOf(st.plant)),
      footprint_a1a3_label: isIndia ? `A1–A3 cradle-to-gate estimate: product boundary, minus ${PRODUCT.downstreamS3} t (estimate, 0.10–0.15) for downstream categories 10 & 12` : 'A1–A3 cradle-to-gate estimate (route model)',
      footprint_product: sc(r.footprint_product),
      customer_installation: inst,
      customer_footprint: customer_crude * kI,
      customer_footprint_crude: customer_crude,
      customer_footprint_basis: `A1–A3 per t cold-rolled coil at ${PLANTS[inst].label} (product boundary: FeCr shipped to other plants removed; downstream cat 10/12 removed). Estimate.`,
      relocation_t: relocation.total_t, relocation,
      s12_progress_basis: sc(r.s12) + relocation.total_t,
      energy_gj: sc(r.energy_gj), energy_split: { elec_gj: sc(r.elecGJ), thermal_gj: sc(r.thermalGJ) },
      energy_note: route ? 'Indian rolling energy only (the Indonesian melt shop is outside JSL India\'s energy boundary).' : 'Captive electricity counted at fuel input (10.47 GJ/MWh); purchased at 3.6 GJ/MWh.',
      cbamE: sc(r.cbamE),
      cbamE_conservative: sc(r.cbamE_conservative),
      cbamE_conservative_installation: sc(rI.cbamE_conservative),
      cbamE_conservative_label: 'Conservative bound: Scope 1 (captive power NOT removed) + purchased-precursor direct emissions. Always ≥ the CBAM figure.',
      cbamE_scope1: sc(r.cbamE_scope1),
      cbamE_scope1_label: 'Scope 1 only (excludes precursors) — not a CBAM figure',
      cbamInstallation: inst,
      cbamE_installation: sc(rI.cbamE),
      cbamE_byPrecursorData: { verified: sc(rI.cbamE_ver), default: sc(rI.cbamE_def), used: st.precursorData },
      footprint_eol: sc(eol), footprint_primary: sc(xPr), footprint_recycled: sc(xRe),
      consumables: sc(EF.consumables),
      s1_split: { captivePower: sc(r.capCO2), safReductant: sc(r.safRed), fired: sc(r.fired), aod: sc(r.aod) },
      electricity: { total_mwh: sc(r.eTot), captive_mwh: sc(r.cUsed), purchased_mwh: sc(r.pur), re_mwh: sc(r.reMWh), saf_mwh: sc(r.safMWh), steel_mwh: sc(r.eSteel),
        captive_lf_input: st.captiveLF, captive_lf_effective: J.lfEff, site_ef: J.efSite, marginal_ef: J.efMarg, dispatch: st.fecrAttribution },
      fecr: { attribution: st.fecrAttribution, captiveShare: J.X === undefined ? 0 : (route ? 0 : r.X), captiveShareCap: J.Xcap, merchantSource: route ? null : r.merchant,
        own_t_per_t: J.ownFecrEF, merchant_t_per_t: (route ? EF.fecrOdisha : (r.merchant === 'imported' ? EF.fecrImported : EF.fecrOdisha)),
        odisha_t_per_t: EF.fecrOdisha, own_vs_odisha: J.ownFecrEF - EF.fecrOdisha,
        note: st.fecrAttribution === 'site' ? 'Own-SAF electricity charged at the Jajpur site mix (captive coal share × 1.045 + purchased share × grid/RE mix).' : 'Own-SAF electricity charged at the marginal supply (purchased power first; captive coal treated as baseload).' },
      route: route ? { slabE: r.slabE, slabE_default: CBAM.indonesiaSlabDefault, slabE_isVerified: st.indonesiaSlabE !== null, slabE_modelEstimate: r.slabE_modelEstimate, slabFootprint: r.slabFootprint,
        yieldSlabToCR: PRODUCT.yieldSlabToCR, origin: PLANTS.indonesia_slab.origin } : null,
      fecr_need_t: sc(r.need), pigIron_kg: sc(r.pigKg),
      breakdown: bd,
      warnings
    };
  }

  /* ------------------------------------------------------------------ 10. attribution + search */
  const WF_FIELDS = ['plant', 'grade', 'scrap', 'npi', 'npiEF', 'feUnits', 'fecr', 'fecrMerchant', 'fecrCaptiveShare', 'biochar', 'safTech', 're', 'cf', 'captiveLF', 'indonesiaSlabE'];
  const METHOD_FIELDS = ['fecrAttribution', 'precursorData'];
  const WF_LABEL = { plant: 'Installation', grade: 'Grade', scrap: 'Scrap share', npi: 'NPI share of Ni', npiEF: 'NPI power source', feUnits: 'Fe-unit source',
    fecr: 'FeCr sourcing', fecrMerchant: 'Merchant FeCr source', fecrCaptiveShare: 'Own-SAF share of FeCr', biochar: 'Biochar in SAF', safTech: 'SAF technology',
    re: 'Renewables (purchased power)', cf: 'Clean fuel (fired furnaces)', captiveLF: 'Captive coal load factor', indonesiaSlabE: 'Indonesian slab CBAM value' };
  const RELOC_LEVERS = ['plant', 'fecr', 'fecrCaptiveShare'];

  function shapley(from, to, fields, f) {
    const n = fields.length, N = 1 << n, val = new Float64Array(N);
    for (let m = 0; m < N; m++) {
      const st = Object.assign({}, from);
      for (let i = 0; i < n; i++) if (m >> i & 1) st[fields[i]] = to[fields[i]];
      val[m] = f(st);
    }
    const fact = [1]; for (let k = 1; k <= n; k++) fact[k] = fact[k - 1] * k;
    const phi = new Array(n).fill(0);
    for (let m = 0; m < N; m++) {
      let size = 0; for (let i = 0; i < n; i++) if (m >> i & 1) size++;
      for (let i = 0; i < n; i++) {
        if (m >> i & 1) continue;
        phi[i] += fact[size] * fact[n - size - 1] / fact[n] * (val[m | (1 << i)] - val[m]);
      }
    }
    return { phi, from: val[0], to: val[N - 1] };
  }

  // Method fields (attribution rule, precursor data) are taken from `to` on both sides: they are accounting rules, not levers.
  function waterfall(fromState, toState, opts) {
    const metric = (opts && opts.metric) || 'total';
    const b = normalize(toState), a = normalize(fromState);
    METHOD_FIELDS.forEach(k => { a[k] = b[k]; });
    const k = b.basis === 'product' ? 1 / yieldOf(b.plant) : 1;
    const fields = WF_FIELDS.filter(key => a[key] !== b[key]);
    const f = st => metricOf(st, metric) * k;
    if (!fields.length) { const v = f(a); return Object.assign([], { from: v, to: v, total: 0, metric }); }
    const { phi, from, to } = shapley(a, b, fields, f);
    const reloc = ['s12', 's1', 's2'].includes(metric);
    const out = fields.map((key, i) => ({ lever: key, label: WF_LABEL[key], from: a[key], to: b[key], delta: phi[i],
      relocation: reloc && RELOC_LEVERS.includes(key) && phi[i] < 0 }))
      // fecrMerchant mirrors fecr when FeCr is not captive: it stays in the Shapley set (exactness) but a zero row is dropped
      .filter(row => !(row.lever === 'fecrMerchant' && Math.abs(row.delta) < 1e-12));
    return Object.assign(out, { from, to, total: to - from, metric, method: 'Shapley (exact, all 2^n orderings)',
      note: reloc ? 'Rows flagged relocation move emissions to Scope 3 or to another installation; exclude them from progress.' : '' });
  }

  // Reference abatement per unit move at the FY26 company state (t CO2 per t steel per pp or per switch). Set in initCosts().
  const ABATE_REF = {};
  const UNIT_COST = {};   // $/t steel per unit move on the FIRST cost step (kept for v3 compatibility)
  function initCosts() {
    const base = Object.assign(defaultState(), { plant: 'company' });
    const t0 = core(base).total;
    const d = (patch, per) => Math.abs(t0 - core(Object.assign({}, base, patch)).total) / per;
    ABATE_REF.scrap = d({ scrap: base.scrap + 10 }, 10);
    ABATE_REF.npi = d({ npi: base.npi - 10 }, 10);
    ABATE_REF.re = d({ re: base.re + 10 }, 10);
    ABATE_REF.cf = d({ cf: base.cf + 10 }, 10);
    ABATE_REF.biochar = d({ biochar: 10 }, 10);
    ABATE_REF.fecr = d({ fecr: 'imported' }, 1);
    ABATE_REF.npiEF = d({ npiEF: EF.npiRE }, 1);
    ['scrap', 'npi', 're', 'cf', 'biochar', 'fecr', 'npiEF'].forEach(k => { UNIT_COST[k] = COST_PROXY[k].usdPerTCO2 * ABATE_REF[k]; });
    UNIT_COST.captiveLF = lfMWhPerUnit('company') * 0.01 * COSTS.captiveLF[0].inrPerKWh * 1000 / COSTS.inrPerUsd;   // per 0.01 LF
  }
  const scrapSteps = grade => { const cap = (GRADES[grade] || GRADES['304']).scrapCap; return [{ lo: 0, hi: cap - 5, usd: 36.5 }, { lo: cap - 5, hi: 100, usd: 60 }]; };
  function segCost(a, b, steps, per) {
    if (!(b > a)) return 0;
    let c = 0;
    steps.forEach(s => { const o = Math.min(b, s.hi) - Math.max(a, s.lo); if (o > 0) c += o * s.usd * per; });
    return c;
  }
  // captive MWh per t steel per unit of load factor (company-average or Jajpur tonne)
  function lfMWhPerUnit(plant) {
    if (plant === 'company') return CAPTIVE.mw * CAPTIVE.hours / (ANCHOR.fy26.crude_mt * 1e6);
    if (plant === 'jajpur') return CAPTIVE.mw * CAPTIVE.hours / (CAL.crudeJ_mt * 1e6);
    return 0;
  }
  const usdPerMWh = inrPerKWh => inrPerKWh * 1000 / COSTS.inrPerUsd;
  function lfCost(plant, lfTo, lfFrom) {
    if (!(lfFrom > lfTo)) return 0;
    let c = 0;
    COSTS.captiveLF.forEach(s => { const o = Math.min(lfFrom, s.hi) - Math.max(lfTo, s.lo); if (o > 0) c += o * usdPerMWh(s.inrPerKWh); });
    return c * lfMWhPerUnit(plant);
  }
  function leverCost(base, x) {
    const parts = {
      scrap: segCost(base.scrap, x.scrap, scrapSteps(base.grade), ABATE_REF.scrap),
      npi: segCost(x.npi, base.npi, COST_PROXY.npi.steps, ABATE_REF.npi),
      re: segCost(base.re, x.re, COST_PROXY.re.steps, ABATE_REF.re),
      cf: segCost(base.cf, x.cf, COST_PROXY.cf.steps, ABATE_REF.cf),
      biochar: segCost(base.biochar, x.biochar, COST_PROXY.biochar.steps, ABATE_REF.biochar),
      fecr: (x.fecr !== base.fecr && x.fecr === 'imported') ? UNIT_COST.fecr : 0,
      npiEF: x.npiEF < base.npiEF ? UNIT_COST.npiEF * (base.npiEF - x.npiEF) / (EF.npiCoal - EF.npiRE) : 0,
      captiveLF: lfCost(base.plant, x.captiveLF, base.captiveLF)
    };
    let usd = 0; Object.keys(parts).forEach(k => { usd += parts[k]; });
    return { usd, parts };
  }

  // Every $/tCO2 (or ₹/kWh) the optimiser uses, for the UI to print.
  function costTable(st) {
    const cap = (GRADES[st.grade] || GRADES['304']).scrapCap;
    const abLF = EF.captive - (1 - st.re / 100) * EF.grid;
    const row = (lever, steps, extra) => Object.assign({ lever, label: COST_PROXY[lever].label, unit: 'US$/t CO2', steps, source: COST_PROXY[lever].source, status: COST_PROXY[lever].status }, extra || {});
    return [
      row('scrap', [{ range: `up to ${cap - 5}%`, usd_per_tco2: 36.5 }, { range: `${cap - 5}–${cap}%`, usd_per_tco2: 60 }]),
      row('npi', [{ range: 'any', usd_per_tco2: 36 }]),
      row('re', [{ range: 'up to 55% of purchased power', usd_per_tco2: 15 }, { range: 'above 55%', usd_per_tco2: 40 }]),
      row('cf', [{ range: 'up to 15% of fired fuel (bio-LDO)', usd_per_tco2: 50 }, { range: 'above 15% (green hydrogen)', usd_per_tco2: 250 }]),
      row('biochar', [{ range: 'up to 20% of SAF reductant', usd_per_tco2: 29 }, { range: '20–30%', usd_per_tco2: 45 }]),
      row('npiEF', [{ range: 'switch', usd_per_tco2: 45 }]),
      row('fecr', [{ range: 'switch (merchant → imported)', usd_per_tco2: 60 }]),
      row('captiveLF', COSTS.captiveLF.map(s => ({ range: `LF ${s.lo.toFixed(2)}–${s.hi.toFixed(2)}`, inr_per_kwh: s.inrPerKWh, usd_per_mwh: r3(usdPerMWh(s.inrPerKWh)),
        usd_per_tco2: abLF > 1e-6 ? r3(usdPerMWh(s.inrPerKWh) / abLF) : null, note: s.note })),
        { unit: '₹/kWh over captive coal (US$/t CO2 implied at this state\'s RE share)', abatement_t_per_mwh: r3(abLF) })
    ];
  }

  // Candidate increments per lever for a tier, in the improving direction (base value excluded).
  function leverPlan(base, tier, keys) {
    const g = GRADES[base.grade], want = k => !keys || keys.includes(k);
    const hasCaptive = base.plant === 'company' || base.plant === 'jajpur';
    const route = base.plant === 'indonesia_slab';
    const P = [];
    const push = (key, values, continuous, res) => { values = values.filter(v => v !== base[key]); if (values.length) P.push({ key, values, continuous, res }); };
    if (want('scrap') && !route) push('scrap', upRange(base.scrap, Math.max(base.scrap, g.scrapCap - tier.scrapBelowCap), 5), true, 1);
    if (want('npi') && !route && g.ni_kg > 0) push('npi', downRange(base.npi, Math.min(base.npi, tier.npiMin), 10), true, 1);
    if (want('npiEF') && tier.npiEF && g.ni_kg > 0 && base.npiEF > EF.npiRE) push('npiEF', [EF.npiRE], false);
    if (want('fecr') && !route && base.fecr === 'odisha') push('fecr', ['imported'], false);   // captive → imported is relocation: never offered
    if (want('biochar') && !route && base.fecr === 'captive') push('biochar', upRange(base.biochar, Math.max(base.biochar, tier.biocharMax), 5), true, 1);
    if (want('re')) push('re', upRange(base.re, Math.max(base.re, tier.reMax), 5), true, 1);
    if (want('cf')) push('cf', upRange(base.cf, Math.max(base.cf, tier.cfMax), 5), true, 1);
    if (want('captiveLF') && hasCaptive) push('captiveLF', downRange(base.captiveLF, Math.min(base.captiveLF, tier.lfMin), 0.05), true, 0.01);
    return P;
  }

  // Rising-MACC greedy: repeatedly take the increment with the lowest marginal $/t CO2 at the current state.
  function greedy(base, plan, f, mode, target) {
    let x = Object.assign({}, base), m = f(x), c = 0;
    const pos = plan.map(() => 0), seq = [];
    for (let guard = 0; guard < 1000; guard++) {
      if (mode === 'cheapestToTarget' && m <= target + 1e-9) break;
      let best = null;
      plan.forEach((L, i) => {
        if (pos[i] >= L.values.length) return;
        const x2 = Object.assign({}, x, { [L.key]: L.values[pos[i]] });
        const m2 = f(x2), dm = m - m2;
        if (!(dm > 1e-9)) return;
        const c2 = leverCost(base, x2).usd, r = (c2 - c) / dm;
        if (!best || r < best.r - 1e-12 || (Math.abs(r - best.r) <= 1e-12 && dm > best.dm)) best = { i, x2, m2, c2, dm, r };
      });
      if (!best) break;
      const L = plan[best.i];
      seq.push({ lever: L.key, label: COST_PROXY[L.key] ? COST_PROXY[L.key].label : WF_LABEL[L.key], from: x[L.key], to: L.values[pos[best.i]],
        abatement: best.dm, usd_per_t: best.c2 - c, usd_per_tco2: best.r, after: best.m2 });
      pos[best.i]++; x = best.x2; m = best.m2; c = best.c2;
    }
    return { x, m, c, seq };
  }

  // After reaching a target: drop whole increments that are not needed, then trim continuous levers to 1 pp / 0.01 LF.
  function pruneTrim(base, plan, x, f, target, seq) {
    for (let guard = 0; guard < 200; guard++) {
      let best = null;
      plan.forEach(L => {
        const key = L.key; if (x[key] === base[key]) return;
        const idx = L.values.indexOf(x[key]);
        const prev = idx > 0 ? L.values[idx - 1] : base[key];
        const x2 = Object.assign({}, x, { [key]: prev });
        if (f(x2) <= target + 1e-9) { const save = leverCost(base, x).usd - leverCost(base, x2).usd; if (save > 1e-12 && (!best || save > best.save)) best = { x2, save }; }
      });
      if (!best) break;
      x = best.x2;
    }
    const rate = {}; seq.forEach(s => { rate[s.lever] = s.usd_per_tco2; });
    plan.filter(L => L.continuous && x[L.key] !== base[L.key]).sort((a, b) => (rate[b.key] || 0) - (rate[a.key] || 0)).forEach(L => {
      const key = L.key, dir = x[key] > base[key] ? 1 : -1, res = L.res;
      const N = Math.floor(Math.abs(x[key] - base[key]) / res + 1e-9);
      const val = nn => (nn >= N ? base[key] : rd(x[key] - dir * nn * res));
      let lo = 0, hi = N;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (f(Object.assign({}, x, { [key]: val(mid) })) <= target + 1e-9) lo = mid; else hi = mid - 1; }
      x = Object.assign({}, x, { [key]: val(lo) });
    });
    return x;
  }

  function sensitivity(state) {
    const st = normalize(state), g = GRADES[st.grade];
    const k = st.basis === 'product' ? 1 / yieldOf(st.plant) : 1;
    const t0 = core(st), cb0 = metricOf(st, 'cbamE'), pr0 = metricOf(st, 's12_progress');
    const rows = [];
    const add = (lever, label, basis, patch, scale, extra) => {
      const x = Object.assign({}, st, patch), r = core(x);
      const row = Object.assign({
        lever, label, basis,
        delta_total: (r.total - t0.total) * scale * k, delta_s12: (r.s12 - t0.s12) * scale * k, delta_cbam: (metricOf(x, 'cbamE') - cb0) * scale * k,
        delta_s12_progress: (metricOf(x, 's12_progress') - pr0) * scale * k
      }, extra);
      row.relocation = row.delta_s12_progress - row.delta_s12 > 1e-6;
      if (Math.abs(row.delta_total) + Math.abs(row.delta_s12) + Math.abs(row.delta_cbam) > 1e-9) rows.push(row);
    };
    const route = st.plant === 'indonesia_slab';
    // continuous levers: per 10 pp in the improving direction; linear-scaled when headroom < 10 pp
    const cont = [
      ['scrap', 'Scrap +10 pp', +1, g.scrapCap, 1], ['npi', 'NPI share −10 pp', -1, 0, 1], ['re', 'Renewables +10 pp (of purchased power)', +1, 100, 1],
      ['cf', 'Clean fuel +10 pp (of fired fuel)', +1, 100, 1], ['biochar', 'Biochar +10 pp (of own-SAF reductant)', +1, LIMITS.biocharMax, 1],
      ['captiveLF', 'Run the coal plant less (replace with purchased power at current RE mix)', -1, 0, 0.01]
    ];
    cont.forEach(([key, label, dir, lim, unit]) => {
      if (key === 'npi' && g.ni_kg === 0) return;
      if (key === 'captiveLF' && !(st.plant === 'company' || st.plant === 'jajpur')) return;
      if (route && ['scrap', 'npi', 'biochar'].includes(key)) return;
      const cur = st[key] / unit, limU = lim / unit, top = key === 'captiveLF' ? 100 : 100;
      const head = dir > 0 ? Math.max(0, limU - cur) : Math.max(0, cur - limU);
      let step = Math.min(10, head), sign = dir;
      if (step < 1e-9) { step = 10; sign = -dir; }          // at the limit: measure the slope on the other side
      const val = clamp(cur + sign * step, 0, top);
      const realStep = Math.abs(val - cur) || 1;
      const scale = (10 / realStep) * (sign === dir ? 1 : -1);
      add(key, label, key === 'captiveLF' ? 'per 10 pp of load factor (−0.10 LF; linear-scaled if headroom < 10 pp)' : 'per 10 pp (linear-scaled if headroom < 10 pp)',
        { [key]: rd(val * unit) }, scale, { step_pp: 10, headroom_pp: head });
    });
    // switches: best alternative FeCr source, NPI power, SAF technology
    if (!route) {
      const fecrAlt = ['captive', 'odisha', 'imported'].filter(v => v !== st.fecr);
      let best = null;
      fecrAlt.forEach(v => { const t = core(Object.assign({}, st, { fecr: v })).total; if (!best || t < best.t) best = { v, t }; });
      const fecrLab = { captive: 'own SAF (Jajpur)', odisha: 'merchant Odisha', imported: 'imported low-carbon' };
      add('fecr', `FeCr → ${fecrLab[best.v]}${st.fecr === 'captive' ? ' (idles own SAF: relocation)' : ''}`, 'switch', { fecr: best.v }, 1, { to: best.v });
    }
    if (g.ni_kg > 0 && st.npiEF > EF.npiRE) add('npiEF', 'NPI smelted on RE/hydro (69 → 30 t/t Ni)', 'switch', { npiEF: EF.npiRE }, 1, { to: EF.npiRE });
    if (!route && st.fecr === 'captive' && st.safTech !== 'prereduction') {
      const nxt = st.safTech === 'open' ? 'closed' : 'prereduction';
      add('safTech', `SAF → ${SAF_TECH_LABEL[nxt]}`, 'switch', { safTech: nxt }, 1, { to: nxt });
    }
    return rows.sort((a, b) => a.delta_total - b.delta_total);
  }

  function tierOf(opts) { return TIERS[opts && opts.tier] || TIERS.practical; }

  function optimize(state, opts) {
    opts = opts || {};
    const mode = opts.mode === 'cheapestToTarget' ? 'cheapestToTarget' : 'minCO2';
    const metric = opts.metric || 'total';
    const tier = tierOf(opts);
    const base = normalize(state), g = GRADES[base.grade];
    const warn = [];
    if (base.scrap > g.scrapCap) { warn.push(`Scrap ${base.scrap}% was above the ${g.scrapCap}% cap for ${base.grade}; the search starts from the cap.`); base.scrap = g.scrapCap; }
    const f = st => metricOf(st, metric);
    const cur = f(base);
    const target = num(opts.target, NaN);
    if (mode === 'cheapestToTarget' && !isFinite(target)) throw new Error('optimize: cheapestToTarget needs a numeric opts.target');

    const floorFor = t => greedy(base, leverPlan(base, t), f, 'minCO2');
    const floors = {}; Object.keys(TIERS).forEach(key => { floors[key] = floorFor(TIERS[key]); });
    const floorByTier = {}; Object.keys(floors).forEach(key => { floorByTier[key] = floors[key].m; });
    const own = floors[tier.key];
    const plan = leverPlan(base, tier);
    const common = { mode, metric, tier: tier.key, tierLabel: tier.label, tierNote: tier.note, limits: tier, basis: 'crude', floorByTier, costs: costTable(base) };

    if (mode === 'cheapestToTarget' && cur <= target + 1e-9) {
      return Object.assign(common, { reachable: true, state: base, before: cur, after: cur, abatement: 0, cost_usd_per_t: 0, avg_usd_per_tco2: 0, steps: [], macc: [],
        floor: own.m, note: `Already at or below the target (${r3(cur)} ≤ ${target}).`, warnings: warn });
    }
    let run;
    if (mode === 'minCO2') run = own;
    else {
      if (own.m > target + 1e-9) {
        const reach = Object.keys(TIERS).filter(key => floors[key].m <= target + 1e-9).map(key => TIERS[key].label);
        return Object.assign(common, { reachable: false, state: base, before: cur, after: cur, abatement: 0, cost_usd_per_t: 0, avg_usd_per_tco2: 0, steps: [], macc: [],
          floor: own.m, floorState: own.x,
          note: `Target ${target} is not reachable in the "${tier.label}" tier for ${base.grade} at ${PLANTS[base.plant].label}; the lowest ${metric} there is ${r3(own.m)}.`
            + (reach.length ? ` Reachable in: ${reach.join(', ')}.` : ' Not reachable in any tier.'), warnings: warn });
      }
      run = greedy(base, plan, f, 'cheapestToTarget', target);
      run.x = pruneTrim(base, plan, run.x, f, target, run.seq);
      run.m = f(run.x);
    }
    const best = run.x;
    const lc = leverCost(base, best);
    const fields = ['scrap', 'npi', 'npiEF', 'fecr', 'biochar', 're', 'cf', 'captiveLF'].filter(key => base[key] !== best[key]);
    const sh = fields.length ? shapley(base, best, fields, f) : { phi: [] };
    const steps = fields.map((key, i) => {
      const ab = -sh.phi[i], usd = lc.parts[key] || 0;
      return { lever: key, label: COST_PROXY[key] ? COST_PROXY[key].label : WF_LABEL[key], from: base[key], to: best[key], abatement: ab, usd_per_t: usd,
        usd_per_tco2: ab > 1e-6 ? usd / ab : null };
    }).sort((a, b) => (a.usd_per_tco2 === null) - (b.usd_per_tco2 === null) || (a.usd_per_tco2 || 0) - (b.usd_per_tco2 || 0));
    const after = f(best), abatement = cur - after;
    let relocNote = '';
    if (base.fecr === 'captive' && base.plant !== 'indonesia_slab') {
      const alt = core(Object.assign({}, best, { fecr: 'imported' })), curR = core(best);
      if (alt.s12 < curR.s12 - 1e-6) relocNote = ` Idling JSL's own SAFs and importing FeCr would cut S1+2 to ${r3(alt.s12)}, but it moves ${r3(alt.s3 - curR.s3)} t/tcs into Scope 3 — relocation, not abatement; the optimiser never uses it.`;
    }
    return Object.assign(common, {
      reachable: true, state: best, result: compute(best), before: cur, after, abatement,
      cost_usd_per_t: lc.usd, avg_usd_per_tco2: abatement > 1e-6 ? lc.usd / abatement : 0, steps, macc: run.seq, floor: own.m, floorState: own.x,
      note: `Tier "${tier.label}". Abatement per lever is Shapley-attributed (parts sum to the total). Costs are activity-based estimates with rising marginal steps; every $/t CO2 used is in .costs.` + relocNote,
      warnings: warn
    });
  }

  function goalSeek(state, targetS12, opts) {
    opts = opts || {};
    const tier = TIERS[opts.tier] || TIERS.theoretical;
    const base = normalize(state), target = num(targetS12, DISCLOSED.target_fy35);
    const f = st => core(st).s12;
    const cur = f(base);
    const hasCaptive = base.plant === 'company' || base.plant === 'jajpur';
    // every tier lever that moves S1+2, except FeCr sourcing (relocation) and NPI power (Scope 3 only)
    const noLF = ['scrap', 'npi', 're', 'cf', 'biochar'], withLF = hasCaptive ? noLF.concat('captiveLF') : noLF;
    const floorRun = (t, keys) => greedy(base, leverPlan(base, t, keys), f, 'minCO2');
    const tiers = {};
    Object.keys(TIERS).forEach(key => {
      const a = floorRun(TIERS[key], noLF).m, b = floorRun(TIERS[key], withLF).m;
      tiers[key] = { label: TIERS[key].label, floorWithoutLF: a, floorWithLF: b, reachable: b <= target + 1e-9, lfMin: TIERS[key].lfMin };
    });
    const fw = floorRun(tier, withLF), fwo = floorRun(tier, noLF);
    // LF needed with RE / clean fuel / biochar at this tier's caps (the "how much coal must go" number)
    let lfAtCaps = null;
    if (hasCaptive) {
      const capsState = Object.assign({}, fwo.x);
      if (f(capsState) <= target) lfAtCaps = base.captiveLF;
      else if (f(Object.assign({}, capsState, { captiveLF: 0 })) <= target) {
        let lo = 0, hi = base.captiveLF;
        for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (f(Object.assign({}, capsState, { captiveLF: mid })) <= target) lo = mid; else hi = mid; }
        lfAtCaps = lo;
      }
    }
    const gwh = lf => (base.captiveLF - lf) * CAPTIVE.mw * CAPTIVE.hours / 1000;
    const common = { target, tier: tier.key, tierLabel: tier.label, floor: fw.m, floorWithLF: fw.m, floorWithoutLF: fwo.m, tiers,
      captiveLF_needed_atCaps: lfAtCaps, basis: 'crude' };
    if (cur <= target + 1e-9) return Object.assign(common, { reachable: true, state: base, s12: cur, cost_usd_per_t: 0, captiveLF_needed: base.captiveLF, note: `Already at ${r3(cur)} ≤ ${target}.` });

    let note;
    const capsTxt = `scrap to ${tier.scrapBelowCap ? tier.scrapBelowCap + ' pp below ' : ''}the grade cap, renewables ≤${tier.reMax}% of purchased power, clean fuel ≤${tier.cfMax}%, biochar ≤${tier.biocharMax}%`;
    const reachTiers = Object.keys(tiers).filter(key => tiers[key].reachable).map(key => TIERS[key].label);
    if (fw.m > target + 1e-9) {
      note = `Not reachable in the "${tier.label}" tier: floor ${r3(fw.m)} with the captive plant at LF ≥${tier.lfMin.toFixed(2)} (${r3(fwo.m)} without touching it) vs target ${target}.`
        + (reachTiers.length ? ` Reachable in: ${reachTiers.join(', ')}.` : (hasCaptive ? ' Needs process changes outside this model (electrified reheat, CCUS on SAF/AOD).' : ' Hisar has no captive coal; what remains is fired fuel and AOD process CO2.'));
      const out = Object.assign(common, { reachable: false, state: fw.x, s12: fw.m, cost_usd_per_t: leverCost(base, fw.x).usd, captiveLF_needed: lfAtCaps, note });
      return addRelocNote(out, fw.x);
    }
    const run = greedy(base, leverPlan(base, tier, withLF), f, 'cheapestToTarget', target);
    const x = pruneTrim(base, leverPlan(base, tier, withLF), run.x, f, target, run.seq);
    const s12 = f(x), cost = leverCost(base, x).usd;
    const lfMoved = x.captiveLF < base.captiveLF - 1e-9;
    note = `Reachable (cheapest combination, tier "${tier.label}"): scrap ${x.scrap}%, renewables ${x.re}% of purchased power, clean fuel ${x.cf}%, biochar ${x.biochar}%`
      + (lfMoved ? `, and the 264 MW captive coal plant's load factor down from ${base.captiveLF.toFixed(2)} to ${x.captiveLF.toFixed(2)} (≈${Math.round(gwh(x.captiveLF))} GWh/yr bought instead).` : '.')
      + ` Without touching captive coal the floor is ${r3(fwo.m)} (${capsTxt})`
      + (lfAtCaps !== null && hasCaptive ? `; with those levers at their caps, LF ${lfAtCaps.toFixed(2)} is enough.` : '.')
      + (fwo.m > target ? ' The gap is captive coal power, which buying greener grid power cannot touch.' : '');
    return addRelocNote(Object.assign(common, { reachable: true, state: x, s12, cost_usd_per_t: cost, captiveLF_needed: x.captiveLF, macc: run.seq, note }), x);
  }
  function addRelocNote(out, x) {
    if (x.fecr === 'captive' && x.plant !== 'indonesia_slab') {
      const alt = core(Object.assign({}, x, { fecr: 'imported' })), fl = core(x);
      if (alt.s12 < fl.s12 - 1e-6) out.note += ` (Idling JSL's own SAFs and importing FeCr would cut S1+2 by a further ${r3(fl.s12 - alt.s12)}, but it moves ${r3(alt.s3 - fl.s3)} t/tcs into Scope 3 — relocation, not abatement; the goal-seek does not use it.)`;
    }
    return out;
  }

  /* ------------------------------------------------------------------ 11. CBAM table + money + routes */
  function cbamRows(st, basis) {
    const inst = installationOf(st.plant);
    const r = core(Object.assign({}, st, { plant: inst }));
    const y = yieldOf(inst), k = basis === 'crude' ? 1 : 1 / y;
    return { inst, r, k, E: r.cbamE * k, Econs: r.cbamE_conservative * k, Es1: r.cbamE_scope1 * k, Ever: r.cbamE_ver * k, Edef: r.cbamE_def * k };
  }

  function cbamTable(state, opts) {
    const st = normalize(state);
    const basis = opts && opts.basis === 'crude' ? 'crude' : 'product';
    const c = cbamRows(st, basis), inst = c.inst;
    const A = CBAM.benchmarkA, B = st.benchmarkB;
    const rows = CBAM.years.map(y => {
      const defaultCost = cbamCost(y.defaultE, y, B), verifiedCost = cbamCost(c.E, y, A), consCost = cbamCost(c.Econs, y, A);
      const row = { year: y.year, price: y.price, priceNote: y.priceNote, freeAlloc: y.freeAlloc, benchmarkTerm: A * y.freeAlloc, benchmarkTermB: B * y.freeAlloc,
        defaultE: y.defaultE, defaultCost, verifiedE: c.E, verifiedCost, saving: defaultCost - verifiedCost,
        verifiedE_conservative: c.Econs, verifiedCost_conservative: consCost, saving_conservative: defaultCost - consCost,
        verifiedE_scope1: c.Es1,
        verifiedE_defaultPrecursors: c.Edef, verifiedCost_defaultPrecursors: cbamCost(c.Edef, y, A), saving_defaultPrecursors: defaultCost - cbamCost(c.Edef, y, A),
        installation: inst, basis };
      if (inst === 'indonesia_slab') {
        row.defaultE_meltPour = CBAM.indonesiaCRDefault * (1 + y.markup);
        row.defaultCost_meltPour = cbamCost(row.defaultE_meltPour, y, B);
      }
      return row;
    });
    rows.installation = inst;
    rows.benchmarkA = A; rows.benchmarkB = B;
    rows.basis = basis;
    rows.unit = basis === 'product' ? 't CO2e per t cold-rolled coil (the CBAM good); crude-basis E ÷ yield ' + r3(yieldOf(inst)) : 't CO2e per t crude steel (calibration basis; EU default values are per t of good)';
    rows.precursorData = st.precursorData;
    rows.flag = st.plant === 'company' ? 'CBAM is declared per installation; the company view uses Jajpur (where EU-bound coil is melted).'
      : inst === 'indonesia_slab' ? 'Indonesia-slab route: verified E = Indonesian slab precursor (EU default unless verified) + Indian rolling. Default column assumes customs origin India; defaultE_meltPour shows the Indonesian default. ' + CBAM.originRuleNote : null;
    rows.formula = 'max(0, E − benchmark × free-allocation share) × certificate price  (EC CBAM Q&A 27 May 2026 §3.8)';
    rows.conservativeLabel = 'Conservative = Scope 1 without removing captive power, plus precursors (≥ verified)';
    return rows;
  }

  function money(state, opts) {
    const merged = Object.assign({}, state);
    Object.keys(opts || {}).forEach(k => { if (opts[k] !== undefined && opts[k] !== null) merged[k] = opts[k]; });
    const W = [];
    const st = normalize(merged, W);
    const basis = opts && opts.basis === 'crude' ? 'crude' : 'product';
    const c = cbamRows(st, basis), inst = c.inst, E = c.E;
    const A = CBAM.benchmarkA, y26 = CBAM.years[0], y30 = CBAM.years[4];
    const per = (row, B, price) => {
      const rr = price ? Object.assign({}, row, { price }) : row;
      return cbamCost(row.defaultE, rr, B) - cbamCost(E, rr, A);
    };
    const t = st.exportTonnes, fx = st.fx;
    const cr = eurPerT => eurPerT * t * fx / 1e7;
    const e26 = { low: per(y26, CBAM.benchmarkB_high), high: per(y26, 0.268) };
    const e30 = { low: per(y30, CBAM.benchmarkB_high), high: per(y30, 0.268) };
    const verCost = cbamCost(E, y26, A), defCost = cbamCost(y26.defaultE, y26, st.benchmarkB);
    // quota: India's stainless-flat country quota; JSL's assumed share; out-of-quota tonnes pay 50% ad valorem
    const route = inst === 'indonesia_slab';
    const jslQuota = st.quotaShare * CBAM.indiaStainlessFlatQuota_t;
    const inQ = route ? null : Math.min(t, jslQuota), outQ = route ? null : Math.max(0, t - jslQuota);
    const outShare = !route && t > 0 ? outQ / t : 0;
    const duty = CBAM.outOfQuotaDuty * st.cifEur;
    const landedVerified = st.cifEur + verCost + outShare * duty, landedDefault = st.cifEur + defCost + outShare * duty;
    return {
      installation: inst, cbamE: E, basis, unit: basis === 'product' ? 't CO2e per t product' : 't CO2e per t crude',
      exportTonnes: t, fx, cifEur: st.cifEur, benchmarkB: st.benchmarkB,
      saving2026_eur_per_t: e26, saving2030_eur_per_t: e30,
      saving2026_eur_m: { low: e26.low * t / 1e6, high: e26.high * t / 1e6 },
      saving2026_inr_cr: { low: cr(e26.low), high: cr(e26.high) },
      saving2030_inr_cr: { low: cr(e30.low), high: cr(e30.high) },
      saving2026_upside_eua86_inr_cr: cr(per(y26, st.benchmarkB, CBAM.eua_dec26)),
      verifiedCost2026: verCost, defaultCost2026: defCost,
      quota_t: CBAM.indiaStainlessFlatQuota_t, quotaShare: st.quotaShare, jslQuota_t: route ? null : jslQuota,
      inQuotaTonnes: inQ, outOfQuotaTonnes: outQ, outOfQuotaShare: outShare, outOfQuotaDuty_eur_per_t: duty,
      landedVerified, landedDefault, landedGap: landedDefault - landedVerified,
      landedVerified_inQuota: st.cifEur + verCost, landedDefault_inQuota: st.cifEur + defCost,
      landedVerified_outOfQuota: st.cifEur + verCost + duty, landedDefault_outOfQuota: st.cifEur + defCost + duty,
      cbamShareOfPrice: { verified: verCost / landedVerified, default: defCost / landedDefault },
      rangeNote: 'Range = default-side benchmark 1.27 (low, Outokumpu example) to 0.268 (high, same benchmark both sides). Landed cost uses state.benchmarkB and blends the 50% out-of-quota safeguard duty over the out-of-quota share of tonnes (anti-dumping duty not included).',
      quotaNote: `India's stainless-flat quota ${CBAM.indiaStainlessFlatQuota_t.toLocaleString('en-US')} t/yr for all Indian mills (${CBAM.quotaRegulation}); JSL share ${Math.round(st.quotaShare * 100)}% is an assumption.`
        + (route ? ' Indonesia-slab coil is Indonesian-origin under melt-and-pour, so India\'s quota does not apply; the Indonesian allocation is not modelled (no duty included).' : ''),
      settlementNote: CBAM.settlementNote,
      flag: st.plant === 'company' ? 'CBAM is per installation — Jajpur used.' : null,
      warnings: W
    };
  }

  function routeComparison(state) {
    const st = normalize(state);
    const rows = ['jajpur', 'hisar', 'indonesia_slab'].map(p => {
      const s = Object.assign({}, st, { plant: p });
      const tab = cbamTable(s), r26 = tab[0], m = money(s);
      const declaredCost = Math.min(r26.verifiedCost, r26.defaultCost);
      return { route: p, label: PLANTS[p].label, origin: PLANTS[p].origin, quotaPool: p === 'indonesia_slab' ? 'Indonesia (not India\'s quota)' : 'India stainless-flat quota',
        cbamE: r26.verifiedE, cbamE_defaultPrecursors: r26.verifiedE_defaultPrecursors, cbamCost2026: r26.verifiedCost,
        defaultE2026: r26.defaultE, defaultCost2026: r26.defaultCost, declaredCost2026: declaredCost,
        defaultE2026_meltPour: r26.defaultE_meltPour || null, defaultCost2026_meltPour: r26.defaultCost_meltPour || null,
        landed: m.landedVerified, landedDefault: m.landedDefault, landedBestDeclared: m.landedVerified - r26.verifiedCost + declaredCost,
        verifiedBeatsDefault: r26.verifiedCost < r26.defaultCost, basis: 'product' };
    });
    const j = rows[0];
    rows.forEach(r => { r.gapVsJajpur_eur_per_t = r.cbamCost2026 - j.cbamCost2026; });
    rows.note = 'Per tonne of cold-rolled coil, 2026, verified-data column (benchmark 0.268). Indonesia slab E uses the EU default for Indonesian slab (' + CBAM.indonesiaSlabDefault + ' t/t) unless state.indonesiaSlabE is set. ' + CBAM.originRuleNote;
    return rows;
  }

  /* ------------------------------------------------------------------ 12. back-cast + validation */
  let FY24_FIT = null;
  function backcast(year) {
    if (year === 'fy26') {
      const r = compute(defaultState());
      return { year, state: r.state, params: { crude_mt: ANCHOR.fy26.crude_mt, elecMult: 1 }, result: r,
        disclosed: { s12: 1.76, total: 3.03, energy_gj: 16.43 }, error_pct: { s12: pct(r.s12, 1.76), total: pct(r.total, 3.03), energy: pct(r.energy_gj, 16.43) },
        note: 'Calibration year: S1+2, S3 and energy are fitted here, so this is a consistency check, not a test.' };
    }
    if (year !== 'fy24') throw new Error('backcast: only fy24 and fy26 are available');
    const A = ANCHOR.fy24;
    const st = Object.assign(defaultState(), { grade: '304', plant: 'company', scrap: 66, re: 30, cf: 0 });
    const s2target = A.s2_t / 1e6 / A.crude_mt;
    if (!FY24_FIT) {
      let lo = 0.3, hi = 3;
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (core(st, { crude_mt: A.crude_mt, elecMult: mid }).s2 < s2target) lo = mid; else hi = mid; }
      FY24_FIT = (lo + hi) / 2;
    }
    const ctx = { crude_mt: A.crude_mt, elecMult: FY24_FIT };
    const r = compute(st, ctx);
    const d = { s1: A.s1_t / 1e6 / A.crude_mt, s2: s2target, s12: A.s12, energy_gj: A.energy_gj, s3: A.s3 };
    return {
      year, state: r.state, params: { crude_mt: A.crude_mt, elecMult: FY24_FIT, re: 30, scrap: 66, cf: 0, npi: st.npi },
      result: r, disclosed: d,
      error_pct: { s12: pct(r.s12, d.s12), s1: pct(r.s1, d.s1), s2: pct(r.s2, d.s2), energy: pct(r.energy_gj, d.energy_gj), s3: pct(r.s3, d.s3) },
      note: 'One per-year parameter (steel-side electricity intensity multiplier) is fitted to FY24 Scope 2. Scope 1 is out-of-sample: it moves only through lower FY24 output '
        + '(fixed 264 MW captive spread over 1.758 Mt), lower scrap (66%, interpolated FY23 60% → FY25 72%) and no clean fuel. RE 30% is an assumption that only affects energy. '
        + 'FY24 S3 is not comparable (FY26 changed the category 10/12 method).'
    };
  }

  // Scrap slope per +10 pp (t CO2e/t) for a state
  const scrapSlope = st => { const a = compute(st).total, b = compute(Object.assign({}, st, { scrap: st.scrap + 10 })).total; return b - a; };

  function validate() {
    const out = [];
    const chk = (check, expected, got, pass, note) => out.push({ check, expected, got: typeof got === 'number' ? r3(got) : got, pass: !!pass, note: note || '' });
    const fy26 = compute(defaultState());
    chk('FY26 company S1+2 within 2% of 1.76 (fit)', '1.76 ±2%', fy26.s12, Math.abs(pct(fy26.s12, 1.76)) <= 2, 'calibration target');
    chk('FY26 company total within 3% of 3.03 as disclosed (fit)', '3.03 ±3%', fy26.total, Math.abs(pct(fy26.total, 3.03)) <= 3, 'Scope 1+2+3 as disclosed by JSL (incl. downstream cat 10/12); S3 fitted via NPI share');
    chk('FY26 energy within 3% of 16.43 GJ/tcs (fit)', '16.43 ±3%', fy26.energy_gj, Math.abs(pct(fy26.energy_gj, 16.43)) <= 3, 'thermal constants fitted');
    const j = compute(Object.assign(defaultState(), { plant: 'jajpur' })), h = compute(Object.assign(defaultState(), { plant: 'hisar' }));
    chk('Jajpur S1+2 within 2% of 2.31 (fit)', '2.31 ±2%', j.s12, Math.abs(pct(j.s12, 2.31)) <= 2);
    chk('Hisar S1+2 within 2% of 0.74 (fit)', '0.74 ±2%', h.s12, Math.abs(pct(h.s12, 0.74)) <= 2);
    chk('Jajpur Scope 1 within 2% of derived 2.14', r3(CAL.s1J) + ' ±2%', j.s1, Math.abs(pct(j.s1, CAL.s1J)) <= 2);
    const b24 = backcast('fy24');
    chk('FY24 back-cast S1+2 within 2% of 2.15', '2.15 ±2%', b24.result.s12, Math.abs(b24.error_pct.s12) <= 2, 'S2 fitted by 1 per-year electricity parameter');
    chk('FY24 back-cast Scope 1 within 3% of 1.70 (out-of-sample)', r3(b24.disclosed.s1) + ' ±3%', b24.result.s1, Math.abs(b24.error_pct.s1) <= 3, 'not fitted');
    const t430 = compute(Object.assign(defaultState(), { grade: '430' })).total;
    const ratio = t430 / fy26.total;
    chk('430 vs 304 total footprint ratio (Ni-free grade is lower; a JSL-NPI-specific expectation, not ISSF’s 0.95)', '0.60–0.95', ratio, ratio >= 0.60 && ratio <= 0.95);
    // worldstainless curve, route-matched: Asian NPI/coal route at 30% scrap; global-average charge at 50% scrap
    const asianSt = Object.assign(defaultState(), { scrap: 30, npi: 100, fecr: 'odisha', re: 0, cf: 0 });
    const asian = compute(asianSt).total;
    chk('ISSF curve: 30% scrap, NPI + coal-power FeCr route ≈ 6.80 (±15%)', '6.80 ±15%', asian, Math.abs(pct(asian, 6.80)) <= 15, 'grade 304, NPI 100%, merchant Odisha FeCr, RE 0');
    const glob = compute(Object.assign(defaultState(), { scrap: 50, npi: 50, fecr: 'imported', re: 0, cf: 0 })).total;
    chk('ISSF curve: 50% scrap, global-average charge ≈ 3.70 (±15%)', '3.70 ±15%', glob, Math.abs(pct(glob, 3.70)) <= 15, 'grade 304, NPI 50%, global-average FeCr 2.3, RE 0');
    // ISSF rule of thumb for scrap: −0.8 to −0.9 per +10 pp on a virgin-heavy NPI route; shallower on JSL's FY26 route
    const slopeAsian = scrapSlope(asianSt), slopeFY26 = scrapSlope(defaultState());
    chk('Scrap +10 pp on the NPI + coal-FeCr route vs ISSF rule of thumb −0.8/−0.9', '−0.65 to −1.0', slopeAsian, slopeAsian <= -0.65 && slopeAsian >= -1.0, 'route-matched: 100% NPI nickel at 69 t/t Ni, merchant coal-power FeCr');
    chk('Scrap +10 pp at FY26 JSL settings is shallower than ISSF (42% Class-1 Ni, own FeCr on 47%-RE purchased share)', '−0.35 to −0.65', slopeFY26, slopeFY26 <= -0.35 && slopeFY26 >= -0.65, 'explains the −0.5 on the site vs −0.8/−0.9 in the appendix');
    // CBAM arithmetic vs the canonical worked table (E = 1.054, the Jajpur installation figure per t crude at FY26 settings)
    const y = CBAM.years;
    const d26 = cbamCost(7.14, y[0], 0.268), v26 = cbamCost(1.054, y[0], 0.268);
    chk('CBAM 2026 default liability (worked table, 515.9)', 515.9, d26, Math.abs(d26 - 515.9) < 0.1);
    chk('CBAM 2026 verified @1.054 (worked table, 59.5)', 59.5, v26, Math.abs(v26 - 59.5) < 0.1);
    chk('CBAM 2026 saving @1.054, benchmark 0.268 (worked table, 456.4)', 456.4, d26 - v26, Math.abs(d26 - v26 - 456.4) < 0.1);
    const s30 = cbamCost(8.44, y[4], 0.268) - cbamCost(1.054, y[4], 0.268);
    chk('CBAM 2030 saving @1.054, benchmark 0.268 (worked table, 805.1)', 805.1, s30, Math.abs(s30 - 805.1) < 0.1);
    const sB = cbamCost(7.14, y[0], 1.27) - v26;
    chk('CBAM 2026 saving @1.054, benchmark B 1.27 (worked table, 383.1)', 383.1, sB, Math.abs(sB - 383.1) < 0.1);
    const fl = cbamCost(5.59 * 1.10, y[0], 1.27) - v26;
    chk('CBAM 2026 floor: default 5.59 base, B 1.27 (worked table, 308.9)', 308.9, fl, Math.abs(fl - 308.9) < 0.15);
    // CBAM basis fixes
    const e1 = metricOf(normalize({ re: 20 }), 'cbamE'), e2 = metricOf(normalize({ re: 95 }), 'cbamE');
    chk('Renewables do not move CBAM-embedded E', 'Δ = 0', e2 - e1, Math.abs(e2 - e1) < 1e-12);
    const eg = metricOf(normalize({ grade: '316' }), 'cbamE'), e0 = metricOf(normalize({}), 'cbamE');
    chk('Grade moves CBAM-embedded E (316 vs 304)', '≠ 0', eg - e0, Math.abs(eg - e0) > 1e-3);
    // v4 checks
    chk('Own-SAF FeCr footprint at FY26 (site attribution) is close to merchant Odisha 5.65', '4.6–5.65', fy26.fecr.own_t_per_t, fy26.fecr.own_t_per_t >= 4.6 && fy26.fecr.own_t_per_t <= EF.fecrOdisha, 'same furnace type, same grid; the gap is the RE share of purchased power');
    const conOK = ['company', 'jajpur', 'hisar', 'indonesia_slab'].every(p => { const r = compute(Object.assign(defaultState(), { plant: p })); return r.cbamE_conservative_installation >= r.cbamE_installation - 1e-12 && r.cbamE_conservative >= r.cbamE - 1e-12; });
    chk('Conservative CBAM bound ≥ verified figure at every installation', 'true', conOK ? 'true' : 'false', conOK);
    chk('Customer PCF follows the installation (Jajpur ≠ Hisar)', 'Jajpur > Hisar', r3(j.customer_footprint) + ' / ' + r3(h.customer_footprint), j.customer_footprint > h.customer_footprint + 0.3);
    const reloc = compute(Object.assign(defaultState(), { fecr: 'odisha' }));
    chk('FeCr → merchant is relocation: progress basis unchanged', 'Δ = 0', reloc.s12_progress_basis - fy26.s12_progress_basis, Math.abs(reloc.s12_progress_basis - fy26.s12_progress_basis) < 1e-9 && reloc.s12 < fy26.s12);
    const gs = goalSeek(defaultState(), 0.99);
    chk('FY35 0.99: unreachable without captive coal, reachable with it (theoretical tier)', 'floorWithoutLF > 0.99 > floorWithLF', r3(gs.floorWithoutLF) + ' / ' + r3(gs.floorWithLF), gs.floorWithoutLF > 0.99 && gs.floorWithLF < 0.99 && gs.reachable);
    const rc = routeComparison(defaultState());
    chk('Indonesia-slab route CBAM E far above Jajpur-melted (slab precursor on EU default)', '> 5 t/t gap', rc[2].cbamE - rc[0].cbamE, rc[2].cbamE - rc[0].cbamE > 5);
    chk('A1–A3 estimate = disclosed total minus downstream estimate', r3(ANCHOR.fy26.total_a1a3_est), fy26.footprint_a1a3, Math.abs(fy26.footprint_a1a3 - (fy26.total - PRODUCT.downstreamS3)) < 1e-9);
    return out;
  }

  /* ------------------------------------------------------------------ 13. factor registry (data-quality badges) */
  const FACTORS = [
    ['EF.grid', EF.grid, 't CO2/MWh', 'literature', 'CEA CO2 Baseline Database v21.0 (FY24-25)'],
    ['EF.captive', EF.captive, 't CO2/MWh', 'literature', 'CEA default heat rate for captive coal (2,500 kcal/kWh); range 1.04-1.15'],
    ['EF.fecrOdisha', EF.fecrOdisha, 't CO2e/t', 'literature', 'ICDA ferrochrome LCA; Odisha producer filings (IMFA, JSL): SAF on captive coal 5.40-5.90'],
    ['EF.fecrImported', EF.fecrImported, 't CO2e/t', 'literature', 'ICDA global average 2.3-2.8 (closed SAF, cleaner power)'],
    ['EF.fecrDirect', EF.fecrDirect, 't CO2/t', 'literature', 'ICDA ferrochrome LCA: SAF reductant, electrode paste and flux 1.35-1.55'],
    ['EF.niClass1', EF.niClass1, 't CO2e/t Ni', 'literature', 'Nickel Institute LCA: Class-1 nickel ≈ 13'],
    ['EF.npiCoal', EF.npiCoal, 't CO2e/t Ni', 'literature', 'Published RKEF NPI LCAs: 60-85, central 69'],
    ['EF.npiRE', EF.npiRE, 't CO2e/t Ni', 'assumption', 'Team estimate: JV NPI on RE/hydro (69 minus ~39 power share)'],
    ['EF.npiDirect', EF.npiDirect, 't CO2/t Ni', 'assumption', 'Team estimate: direct share of RKEF NPI (reductant + kiln coal)'],
    ['EF.femo', EF.femo, 't CO2e/t', 'literature', 'Published FeMo LCA (±30%, least certain factor)'],
    ['EF.femn', EF.femn, 't CO2e/t', 'assumption', 'Team estimate (HC-FeMn)'],
    ['EF.femnDirect', EF.femnDirect, 't CO2/t', 'assumption', 'Team estimate: reductant share of HC-FeMn'],
    ['EF.cu', EF.cu, 't CO2e/t', 'assumption', 'Team estimate (~4)'],
    ['EF.pigIron', EF.pigIron, 't CO2e/t', 'assumption', 'Team estimate (BF route)'],
    ['EF.pigIronDirect', EF.pigIronDirect, 't CO2/t', 'assumption', 'BF route ≈ 90% direct'],
    ['EF.consumables', EF.consumables, 't CO2e/tcs', 'assumption', 'Team estimate (0.12-0.27): FeSi, lime, refractories, electrodes, O2/Ar'],
    ['CAPTIVE.mw', CAPTIVE.mw, 'MW', 'literature', 'Company statements / industry literature (264 MW at Jajpur); not an assured figure'],
    ['CAPTIVE.lf', CAPTIVE.lf, '-', 'assumption', 'Team estimate (60-75%); JSL generation data (BRSR P6) would replace it'],
    ['CAPTIVE.minTechnicalLoad', CAPTIVE.minTechnicalLoad, '-', 'assumption', 'Typical minimum technical load of subcritical coal units (~55%)'],
    ['FECR_SUPPLY.capacity_kt', FECR_SUPPLY.capacity_kt, 'kt/yr', 'literature', 'Company statements: ~250 kt SAF capacity at Jajpur (expanding to 450 kt)'],
    ['FECR_SUPPLY.captiveShare', 'auto', '-', 'assumption', 'min(1, 250 kt nameplate ÷ need); 1.0 at FY26 (need 182 kt)'],
    ['SAF_KWH.open', SAF_KWH.open, 'kWh/t FeCr', 'literature', 'ICDA / Odisha producer data (open/semi-closed SAF)'],
    ['ENERGY.eafSens', ENERGY.eafSens, 'MWh/kg', 'assumption', 'First-order slag/alloy melting load'],
    ['PRODUCT.yieldCR', PRODUCT.yieldCR, 't coil/t crude', 'assumption', 'Estimate: casting ~0.97 × hot rolling ~0.96 × cold rolling ~0.97'],
    ['PRODUCT.downstreamS3', PRODUCT.downstreamS3, 't CO2e/tcs', 'assumption', 'Estimate (0.10-0.15): S3 cat 10 + 12 inside JSL\'s disclosed total'],
    ['INDONESIA.meltShop', INDONESIA.meltShop, 't CO2e/t slab', 'assumption', 'Estimate (0.4-0.9): EAF/AOD on coal power, Indonesian melt shop'],
    ['INDONESIA.rollDirect', INDONESIA.rollDirect, 't CO2/t slab', 'assumption', 'Estimate (0.05-0.10): Indian reheating + annealing of imported slab'],
    ['INDONESIA.rollMWh', INDONESIA.rollMWh, 'MWh/t slab', 'assumption', 'Estimate (0.15-0.30): hot + cold rolling'],
    ['CBAM.benchmarkA', CBAM.benchmarkA, 't CO2/t', 'assumption', 'EU ETS EAF high-alloy benchmark 2021-25, used for all years'],
    ['CBAM.benchmarkB_high', CBAM.benchmarkB_high, 't CO2/t', 'literature', 'Outokumpu CBAM Q&A worked example'],
    ['CBAM.default2026', 7.14, 't CO2/t', 'regulation', 'IR 2025/2621 India CN 7219 (6.49 base +10%); may be 5.59 base'],
    ['CBAM.indonesiaSlabDefault', CBAM.indonesiaSlabDefault, 't CO2/t slab', 'regulation', 'IR 2025/2621 (corrected by 2026/1740), Indonesia CN 7218 91, base value'],
    ['CBAM.precursorDefaults.fecr', CBAM.precursorDefaults.fecr.value, 't CO2/t', 'regulation', 'IR 2025/2621 India CN 7202 41 (via third-party compilation; verify)'],
    ['CBAM.precursorDefaults.npi', CBAM.precursorDefaults.npi.value, 't CO2/t NPI', 'regulation', 'IR 2025/2621 Indonesia CN 7202 60 ferro-nickel (via third-party compilation; verify)'],
    ['CBAM.indiaStainlessFlatQuota_t', CBAM.indiaStainlessFlatQuota_t, 't/yr', 'regulation', 'EU steel safeguard successor measure, India stainless flat (CR 38,054 + HR 26,019); Reg 2026/1457 (number to verify vs 2026/1384)'],
    ['CBAM.outOfQuotaDuty', CBAM.outOfQuotaDuty, 'ad valorem', 'regulation', 'Out-of-quota duty doubled from 25% to 50% (2026 revision)'],
    ['CBAM.price2026', 75, '€/t', 'regulation', 'EC CBAM certificate price Q1/Q2 2026'],
    ['CBAM.price2027-30', '89/95/100/109', '€/t', 'assumption', 'Analyst consensus path'],
    ['COSTS.captiveLF', '2.0 / 3.0', '₹/kWh', 'assumption', 'Estimate: RTC RE PPA vs captive coal (≥ LF 0.55) / below minimum technical load'],
    ['COST_PROXY.cf', '50 → 250', 'US$/t CO2', 'assumption', 'Estimate: bio-LDO $40-60 up to 15% of fired fuel; green H2 $200-300 beyond'],
    ['COST_PROXY.re', '15 → 40', 'US$/t CO2', 'assumption', 'Estimate: green open access; above 55% firming/storage']
  ].map(([key, value, unit, status, source]) => ({ key, value, unit, status, source }));

  /* ------------------------------------------------------------------ init + public API */
  calibrate();
  initCosts();
  FY24_FIT = null;

  const M = {
    VERSION: '4.0.0',
    GRADES, PLANTS, PRESETS, DISCLOSED, CBAM, EF, CHEM, SAF_KWH, SAF_TECH_LABEL, ENERGY, CAPTIVE, FECR_SUPPLY, EOL, LIMITS, RANGES, ANCHOR, FACTORS,
    PRODUCT, INDONESIA, TIERS, COSTS, COST_PROXY, UNIT_COST, ABATE_REF, EURUSD,
    CALIBRATION: CAL,
    get NPI_REF() { return NPI_REF; },
    defaultState, applyPreset, normalize: s => normalize(s),
    compute: (s) => compute(s),
    sensitivity, waterfall, goalSeek, optimize, cbamTable, money, routeComparison, backcast, validate,
    costTable: s => costTable(normalize(s)),
    cbamCost: (E, year, benchmark) => {
      const row = CBAM.years.find(y => y.year === year);
      if (!row) throw new Error('cbamCost: year must be 2026-2030');
      return cbamCost(E, row, benchmark === undefined ? CBAM.benchmarkA : benchmark);
    }
  };
  return M;
});
