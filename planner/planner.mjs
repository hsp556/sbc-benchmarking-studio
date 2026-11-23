// Turns a plain-language brief into a search specification.
// The model sees only the brief, the house rules and the closest of the team's own past search strategies
// (codes and keywords, no company data). It proposes regions, industry codes and keywords; everything else is
// the fixed house template. Model output is untrusted and is checked before use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropicKey, geminiKey } from './key.mjs';
import { ProwessSpec, SearchSpec } from '../studio/shared/job-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Claude plans when an Anthropic key is present; Gemini is the fallback.
const CLAUDE_MODEL = 'claude-opus-5-5';
// Gemini free tier: Pro models have no quota; flash models return 503 at busy times, hence the list.
const MODELS = process.env.PLANNER_MODEL ? [process.env.PLANNER_MODEL] : ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
export const HOUSE_REGIONS = ['Eastern Europe', 'Middle East', 'Africa', 'MENA', 'United Arab Emirates'];

// Closest past searches by shared words between the brief and the past file's description.
function closest(brief, max) {
  const file = path.join(root, 'sop', 'past-searches.json');
  if (!fs.existsSync(file)) return [];
  const words = (s) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const want = words(brief);
  return JSON.parse(fs.readFileSync(file, 'utf8'))
    .map((r) => {
      const desc = r.file.replace(/\.xlsx$/i, '').split(' - ').slice(1, -1).join(' - ');
      return { desc, score: [...words(desc)].filter((w) => want.has(w)).length, r };
    })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
}
// Past export files that look like this brief (at least two shared words), for the "already done?" check.
export const similarPast = (brief, max = 5) => closest(brief, 40).filter((x) => x.score >= 2).slice(0, max)
  .map(({ desc, r }) => ({ file: r.file, search: desc, total: r.total }));
function pastExamples(brief, max = 8) {
  const codes = (r, name) => r.steps.filter((s) => s.step.includes(name)).flatMap((s) => s.detail.match(/(?:^|, )(\d{2,6}) - /g) ?? []).map((c) => c.replace(/\D/g, ''));
  return closest(brief, max)
    .map(({ desc, r }) => ({
      search: desc,
      regions: r.steps.find((s) => s.step.includes('World region'))?.detail.replace(/^.*?: /, '') ?? '',
      nace: codes(r, 'NACE'), usSic: codes(r, 'US SIC'), naics: codes(r, 'NAICS'),
      text: r.steps.filter((s) => s.step.includes('Activity text')).map((s) => s.detail.match(/'(.*)'/)?.[1] ?? '').filter(Boolean),
      boolean: r.boolean, total: r.total,
    }));
}

const list = (d) => ({ type: 'array', items: { type: 'string' }, description: d });
const schema = {
  type: 'object',
  required: ['jobName', 'regions', 'nace', 'usSic', 'naics', 'text', 'assumptions'],
  properties: {
    jobName: { type: 'string', description: 'short lower-case name with hyphens, e.g. household-appliances-distribution-mena' },
    regions: list('TP Catalyst world regions or country names, spelled as in Orbis'),
    nace: list('NACE Rev. 2 codes, 2 to 4 digits, no dots'),
    usSic: list('US SIC codes, 2 to 4 digits'),
    naics: list('NAICS 2022 codes; empty when NACE and US SIC are enough'),
    text: list('activity text searches; may use and/or, brackets, quotes and the * wildcard'),
    assumptions: list('anything assumed or unclear in the brief, for the human reviewer'),
  },
};
const Plan = z.object({ jobName: z.string(), regions: z.array(z.string()), nace: z.array(z.string()), usSic: z.array(z.string()), naics: z.array(z.string()), text: z.array(z.string()), assumptions: z.array(z.string()) });

const system = `You are the search strategy planner for a transfer-pricing benchmarking team. You turn a short brief (industry, function of the tested party, financial year, region) into the search strategy for a comparable-company search in Moody's TP Catalyst.

Your plan is not read by the database directly. A person reviews and edits it, then a runner script builds the search in TP Catalyst from your fields, one step per field:
- regions: each entry is typed into the "World region / Country" search box and the matching entry is ticked, so each must be spelled exactly as TP Catalyst lists it.
- nace, usSic, naics: each code is typed into that scheme's code box and ticked. A code that does not exist in the scheme stops the run, so give only real codes, digits only, no dots.
- text: each entry is pasted as one activity text search over company trade descriptions.
- jobName: used as the file and job name.
- assumptions: shown to the reviewer. Say what you assumed and what in the brief was unclear or looks wrong. Do not put instructions for the script here.
The runner combines the steps as: regions and house rules and financial thresholds and (all codes or all text searches). So every code and every text search widens the result.

Rules:
- Function drives the codes: a distributor needs wholesale/retail trade codes for the product, a manufacturer needs manufacturing codes, a service provider needs the matching service codes. Do not mix functions unless the brief does.
- Regions: when the brief names MENA or gives no region, use the team's standard set: ${HOUSE_REGIONS.join(', ')}. Otherwise use the regions or countries the brief names (TP Catalyst world regions include Western Europe, Eastern Europe, Middle East, Africa, MENA, Far East and Central Asia, North America, South and Central America, Oceania).
- Codes: pick the few primary codes that describe the tested activity (usually 1 to 4 per scheme). Codes and keywords are combined with OR, so broad codes inflate the result.
- Keywords: one or two short searches that a company description for this function and product would contain, e.g. (distribut* or wholesal* or trad*) and ("home appliance" or "household appliance").
- Keyword syntax: lower-case and/or, complete brackets, and never put the * wildcard inside double quotes (write "home appliance" or appliance*, not "home appliance*"). Avoid words with a second everyday meaning (e.g. produce). Keep each search under 180 characters.
- Follow the style of the team's past searches below when they are relevant; ignore them when they are not.
- Do not set years, financial thresholds, account type, status or independence: the runner applies the house rules (U1 accounts, active companies, independence A/B/U, a website, overview or trade description, EBIT at least 0 and revenue at least 1 million USD for the latest three full years).
- You have no access to TP Catalyst and are given no company data. Plan from the brief and your knowledge of the classification schemes only.`;

const userMessage = (brief, examples) => `Brief: ${brief}\n\nTeam's closest past searches (for style):\n${JSON.stringify(examples, null, 1)}`;

// Each provider returns { plan, model } or throws an Error describing why it could not.
async function askClaude(brief, examples, key) {
  const client = new Anthropic({ apiKey: key, timeout: 120000, maxRetries: 1 });
  const r = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4000, // cost cap: a plan is a few hundred tokens
    system,
    messages: [{ role: 'user', content: userMessage(brief, examples) }],
    output_config: { effort: 'low', format: zodOutputFormat(Plan) },
  });
  if (!r.parsed_output) throw new Error(`${CLAUDE_MODEL}: no usable plan (stop reason: ${r.stop_reason})`);
  return { plan: r.parsed_output, model: CLAUDE_MODEL };
}

async function askGemini(brief, examples, key) {
  const problems = [];
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userMessage(brief, examples) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 8000 },
      }),
      signal: AbortSignal.timeout(240000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      problems.push(`${model}: ${r.status} ${(body.error?.message ?? '').split('\n')[0].slice(0, 160)}`);
      if ([0, 429, 403, 404, 503].includes(r.status)) continue; // quota, access, availability or network: try the next model
      break;
    }
    const cand = body.candidates?.[0];
    try { return { plan: Plan.parse(JSON.parse(cand?.content?.parts?.map((x) => x.text ?? '').join('') ?? '')), model }; } catch {
      problems.push(`${model}: no usable plan (finish reason: ${cand?.finishReason ?? body.promptFeedback?.blockReason ?? 'none'})`);
    }
  }
  throw new Error(problems.join(' | '));
}

// A text search must be complete: balanced brackets and quotes, no dangling operator, no wildcard inside quotes.
const wellFormed = (q) => (q.match(/\(/g) ?? []).length === (q.match(/\)/g) ?? []).length && (q.match(/"/g) ?? []).length % 2 === 0
  && !/\b(and|or|not)\s*$/i.test(q) && !(q.match(/"[^"]*"/g) ?? []).some((phrase) => phrase.includes('*')); // quotes taken pair by pair

// ---- Prowess. The industry is chosen from CMIE's own product/service group names (sop/prowess-product-groups.json,
// the classification list only, no company data). Two short model calls: search words, then a pick from the groups
// that contain them. Claude only: there is no Gemini fallback for this plan.
const Words = z.object({ jobName: z.string(), words: z.array(z.string()) });
const Pick = z.object({ groups: z.array(z.string()), assumptions: z.array(z.string()) });
const prowessSystem = `You are the search strategy planner for an Indian transfer-pricing benchmarking team using CMIE Prowess. A brief gives the industry, the function of the tested party and the financial year. The search starts from CMIE's "Main product/service group" classification: a runner ticks the group names you choose, exactly as written, and every company whose main product or service falls in any ticked group is pulled. Filtering happens later, outside the database.
- Function drives the choice: a distributor needs the "Wholesale trade in ..." and "Retail trade in ..." groups for the product, a manufacturer needs the product groups themselves, a service provider needs the matching service groups.
- Ticking a parent group includes everything under it. Every extra group widens the result, so choose the few groups (usually 1 to 5) that describe the tested activity.
- You are given no company data. Work from the brief and the group names only.`;
async function askProwess(key, content, shape) {
  const client = new Anthropic({ apiKey: key, timeout: 120000, maxRetries: 1 });
  const r = await client.messages.parse({ model: CLAUDE_MODEL, max_tokens: 2000, system: prowessSystem, messages: [{ role: 'user', content }], output_config: { effort: 'low', format: zodOutputFormat(shape) } });
  if (!r.parsed_output) throw new Error(`${CLAUDE_MODEL}: no usable answer (stop reason: ${r.stop_reason})`);
  return r.parsed_output;
}
async function planProwess(brief, onStage) {
  const file = path.join(root, 'sop', 'prowess-product-groups.json');
  if (!fs.existsSync(file)) throw new Error('The list of CMIE product/service groups is missing (sop/prowess-product-groups.json)');
  const catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = anthropicKey();
  if (!key) throw new Error('No planner key: add "ANTHROPIC_API_KEY=<key>" to local.env (Prowess plans need Claude)');
  onStage({ stage: 'model', model: CLAUDE_MODEL });
  let w, pick, shortlist;
  try {
    w = await askProwess(key, `Brief: ${brief}\n\nGive a short lower-case job name with hyphens, and up to 12 single words or short phrases (3 letters or more) that CMIE product/service group names for this activity are likely to contain. Include the product words and, for a distributor, "wholesale trade" and "retail trade" only together with a product word.`, Words);
    const words = [...new Set(w.words.map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 3 && x.length <= 40))].slice(0, 12);
    shortlist = catalogue.filter((g) => words.some((x) => g.label.toLowerCase().includes(x))).sort((a, b) => a.sid.length - b.sid.length).slice(0, 400);
    if (!shortlist.length) throw new Error(`no CMIE group name contains any of: ${words.join(', ')}`);
    onStage({ stage: 'examples', count: shortlist.length });
    pick = await askProwess(key, `Brief: ${brief}\n\nCMIE product/service groups that may fit (code, name; a longer code is a child of the shorter code it starts with):\n${shortlist.map((g) => `${g.sid} ${g.label}`).join('\n')}\n\nChoose the groups to tick, copying each name exactly (name only, no code). In assumptions, say what you assumed and what in the brief was unclear.`, Pick);
  } catch (e) {
    throw new Error(`The planner could not produce a Prowess plan. ${(e.status ? `${CLAUDE_MODEL}: ${e.status} ${e.error?.error?.message ?? e.message}` : e.message).slice(0, 300)}`);
  }
  onStage({ stage: 'checking' });
  // Untrusted output: keep only names that exist in the catalogue, exactly.
  const known = new Set(catalogue.map((g) => g.label));
  const named = [...new Set(pick.groups.map((g) => g.trim()))];
  const groups = named.filter((g) => known.has(g)).slice(0, 20);
  if (!groups.length) throw new Error('The planner chose no group that exists in Prowess. Try again or describe the industry differently.');
  // "FY 2025" and "FY 2024-25" both mean the year ending March 2025; with no year, the last March that has passed with a year to file.
  const fy = brief.match(/\b(20\d\d)\s*[-/]\s*(\d\d)\b/) ?? brief.match(/\b(20\d\d)\b/);
  const toYear = fy ? (fy[2] ? Number(fy[1]) + 1 : Number(fy[1])) : new Date().getFullYear() - 1;
  const clean = (l, max) => l.map((s) => s.replace(/[\r\n]+/g, ' ').trim()).filter((s) => s && s.length <= 300).slice(0, max);
  return {
    spec: ProwessSpec.parse({
      job: w.jobName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'prowess-search',
      brief: brief.slice(0, 500), groups, fromYear: toYear - 2, toYear, rptYear: toYear - 1,
    }),
    notes: { assumptions: clean(pick.assumptions, 10), droppedKeywords: named.filter((g) => !known.has(g)), plannedBy: CLAUDE_MODEL, pastSearchesUsedAsExamples: [] },
  };
}

// Returns { spec, notes } or throws an Error with a message fit to show the user.
// onStage is told what is happening as it happens: { stage: 'examples' | 'model' | 'checking', ... }.
export async function planBrief(brief, onStage = () => {}, agent = 'catalyst') {
  if (agent === 'prowess') return planProwess(brief, onStage);
  const examples = pastExamples(brief);
  onStage({ stage: 'examples', count: examples.length });
  const providers = [[anthropicKey(), askClaude], [geminiKey(), askGemini]].filter(([key]) => key);
  if (!providers.length) throw new Error('No planner key: add "ANTHROPIC_API_KEY=<key>" or "gemini=<key>" to local.env');
  const problems = [];
  let p = null, usedModel = null;
  for (const [key, ask] of providers) {
    onStage({ stage: 'model', model: ask === askClaude ? CLAUDE_MODEL : 'Gemini' });
    try { ({ plan: p, model: usedModel } = await ask(brief, examples, key)); break; } catch (e) {
      // Anthropic errors carry a status; keep the message short and free of request details.
      problems.push((e.status ? `${CLAUDE_MODEL}: ${e.status} ${e.error?.error?.message ?? e.message}` : e.message).slice(0, 300));
    }
  }
  if (p) onStage({ stage: 'checking' });
  if (!p) throw new Error(`The planner could not produce a plan. ${problems.join(' | ')}`);

  const codes = (l, re) => [...new Set(l.map((c) => c.replace(/[.\s]/g, '')))].filter((c) => re.test(c)).slice(0, 12);
  const clean = (l, max) => l.map((s) => s.replace(/[\r\n]+/g, ' ').trim()).filter((s) => s && s.length <= 200).slice(0, max);
  const allText = clean(p.text, 4);
  const latest = new Date().getFullYear() - 1; // house rule: latest three full years
  const spec = SearchSpec.parse({
    job: p.jobName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'search',
    brief: brief.slice(0, 500),
    closingDate: '31/12',
    regions: clean(p.regions, 30).length ? clean(p.regions, 30) : HOUSE_REGIONS,
    years: [latest, latest - 1, latest - 2],
    financials: [
      { item: 'Operating profit (loss) [EBIT]', min: 0, unit: 'million', currency: 'USD' },
      { item: 'Operating revenue (Turnover)', min: 1, unit: 'million', currency: 'USD' },
    ],
    nace: codes(p.nace, /^\d{2,4}$/),
    usSic: codes(p.usSic, /^\d{2,4}$/),
    naics: codes(p.naics, /^\d{3,6}$/),
    text: allText.filter(wellFormed),
  });
  return {
    spec,
    notes: {
      assumptions: clean(p.assumptions, 10),
      droppedKeywords: allText.filter((q) => !wellFormed(q)),
      plannedBy: usedModel,
      fallbackReason: problems.join(' | ') || undefined,
      pastSearchesUsedAsExamples: examples.map((e) => e.search),
    },
  };
}
