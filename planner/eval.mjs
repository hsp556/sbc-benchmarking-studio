// Planner check on fixed briefs: every plan must respect the house rules, name sensible regions, give codes that fit
// the function, and need no keyword repairs. Calls the real model once per brief (a few cents in total).
//   node planner/eval.mjs
import { HOUSE_REGIONS, planBrief } from './planner.mjs';

const TRADE = /^(45|46|47)/, MAKE = /^(1\d|2\d|3[0-3])/; // NACE divisions: wholesale and retail trade; manufacturing
const BRIEFS = [
  ['industry: household appliances; function: distributor; FY 2025; region: MENA', 'house', TRADE],
  ['industry: fruits and vegetables; function: wholesale and retail distribution; FY 2025', 'house', TRADE],
  ['industry: pharmaceutical products; function: limited-risk distributor; FY 2025; region: Middle East, Africa', ['Middle East', 'Africa'], TRADE],
  ['industry: automotive spare parts; function: distributor; FY 2024; region: Western Europe', ['Western Europe'], TRADE],
  ['industry: paints, varnishes and coatings; function: manufacturer; FY 2025; region: MENA', 'house', MAKE],
  ['industry: plastic packaging; function: contract manufacturer; FY 2025; region: Western Europe, Eastern Europe', ['Western Europe', 'Eastern Europe'], MAKE],
  ['industry: processed food and beverages; function: manufacturer; FY 2025; region: Far East and Central Asia', ['Far East and Central Asia'], MAKE],
  ['industry: steel pipes and tubes; function: manufacturer; FY 2025', 'house', MAKE],
  ['industry: software development and IT support; function: service provider; FY 2025; region: India', ['India'], /^(62|63)/],
  ['industry: freight forwarding and logistics; function: service provider; FY 2025; region: MENA', 'house', /^(49|50|51|52|53)/],
  ['industry: management consulting; function: support services provider; FY 2025; region: Western Europe', ['Western Europe'], /^(69|70|73|78|82)/],
  ['industry: engineering and technical design; function: contract service provider; FY 2025; region: North America', ['North America'], /^(71|72)/],
];

async function check([brief, regions, naceFit]) {
  const started = Date.now();
  let spec, notes;
  try { ({ spec, notes } = await planBrief(brief)); } catch (e) { return { brief, seconds: 0, problems: [`no plan: ${e.message.slice(0, 120)}`] }; }
  const problems = [];
  const want = regions === 'house' ? HOUSE_REGIONS : regions;
  if (want.some((r) => !spec.regions.includes(r))) problems.push(`regions ${JSON.stringify(spec.regions)} lack ${JSON.stringify(want)}`);
  if (regions !== 'house' && spec.regions.some((r) => HOUSE_REGIONS.includes(r) && !want.includes(r))) problems.push(`house regions added to a brief that named its own: ${spec.regions}`);
  if (!spec.nace.length) problems.push('no NACE code');
  if (spec.nace.some((c) => !naceFit.test(c))) problems.push(`NACE ${spec.nace} does not all fit the function (${naceFit})`);
  if (!spec.usSic.length && !spec.naics.length) problems.push('neither US SIC nor NAICS codes');
  if (!spec.text.length) problems.push('no keyword search');
  if (notes.droppedKeywords.length) problems.push(`malformed keywords dropped: ${notes.droppedKeywords.join(' | ')}`);
  if (spec.accountType !== 'U1' || spec.status.join() !== 'Active' || spec.independence.join() !== 'A,B,U' || spec.financials.length !== 2 || spec.years.length !== 3 || spec.closingDate !== '31/12') problems.push('house rules changed');
  return { brief, seconds: Math.round((Date.now() - started) / 1000), model: notes.plannedBy, nace: spec.nace.join(' '), text: spec.text.length, problems };
}

const results = [];
for (let i = 0; i < BRIEFS.length; i += 4) results.push(...await Promise.all(BRIEFS.slice(i, i + 4).map(check)));
for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${String(r.seconds).padStart(3)}s  NACE ${r.nace ?? '-'}  kw ${r.text ?? '-'}  ${r.brief.slice(10, 70)}${r.problems.map((p) => `\n        ${p}`).join('')}`);
const failed = results.filter((r) => r.problems.length).length;
console.log(`\n${results.length - failed} of ${results.length} briefs passed; planned by ${[...new Set(results.map((r) => r.model).filter(Boolean))].join(', ')}`);
process.exitCode = failed ? 1 : 0;
