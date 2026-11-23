// Tab 1: describe the search, watch it being planned, review the plan, run it.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api, type Job, type Notes, type PastFile, type PlanStage, type ProwessSpec, type Spec } from './api';
import { Button, Card, Field, Notice, inputClass, when } from './ui';

const AGENTS = [
  { id: 'catalyst', name: 'TP Catalyst', live: true },
  { id: 'ace', name: 'ACE', live: false },
  { id: 'prowess', name: 'Prowess', live: true },
  { id: 'capitaline', name: 'Capitaline', live: false },
];

// A text box that edits a list. It keeps what was typed (so a trailing comma survives) and reports the parsed list.
function ListInput({ id, describedBy, value, onChange, lines }: { id: string; describedBy?: string; value: string[]; onChange: (v: string[]) => void; lines?: boolean }) {
  const [text, setText] = useState(value.join(lines ? '\n' : ', '));
  const change = (t: string) => { setText(t); onChange(t.split(lines ? '\n' : ',').map((x) => x.trim()).filter(Boolean)); };
  return lines
    ? <textarea id={id} aria-describedby={describedBy} rows={4} className={inputClass} value={text} onChange={(e) => change(e.target.value)} />
    : <input id={id} aria-describedby={describedBy} className={inputClass} value={text} onChange={(e) => change(e.target.value)} />;
}

// What the planner is doing right now. The stages are reported by the server as they happen; nothing is simulated.
function PlanProgress({ stages, seconds, prowess }: { stages: PlanStage[]; seconds: number; prowess: boolean }) {
  const examples = stages.find((s) => s.stage === 'examples');
  const model = stages.find((s) => s.stage === 'model');
  const checking = stages.some((s) => s.stage === 'checking');
  const steps = prowess ? [
    { label: 'Reading the brief', done: true },
    { label: examples ? `${examples.count} CMIE product and service groups shortlisted` : 'Shortlisting CMIE product and service groups', done: !!examples },
    { label: model ? `${model.model} is choosing the groups to tick` : 'Choosing the groups to tick', done: checking },
    { label: 'Checking the group names against the Prowess list', done: false },
  ] : [
    { label: 'Reading the brief', done: true },
    { label: examples ? `${examples.count} of the team's past searches picked as a guide` : 'Looking through the team\'s past searches', done: !!examples },
    { label: model ? `${model.model} is choosing regions, industry codes and keywords` : 'Choosing regions, industry codes and keywords', done: checking },
    { label: 'Checking the codes and the keyword syntax', done: false },
  ];
  const active = steps.findIndex((s) => !s.done);
  return (
    <div role="status" aria-live="polite" className="grid gap-6">
      <div className="flex items-center gap-5">
        <div aria-hidden className="plan-orb shrink-0" />
        <div>
          <p className="font-display text-2xl font-light text-ink">Drafting the search strategy</p>
          <p className="eyebrow mt-1">{seconds} s elapsed</p>
        </div>
      </div>
      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={i} className={`flex items-center gap-3 ${i > active ? 'text-muted' : 'text-ink'}`}>
            <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full ${s.done ? 'bg-ok text-white' : i === active ? 'plan-pulse bg-accent' : 'border border-line'}`}>
              {s.done && <Check className="size-4" />}
            </span>
            <span className={i === active ? 'font-medium' : ''}>{s.label}{s.done ? '' : i === active ? '…' : ''}</span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="grid gap-3">
        {(prowess ? ['Product and service groups', 'Years'] : ['Regions', 'NACE · US SIC · NAICS', 'Keywords']).map((label, i) => (
          <div key={label}>
            <p className="eyebrow mb-1">{label}</p>
            <div className="plan-shimmer h-10 rounded-xl" style={{ animationDelay: `${i * 180}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewSearch({ onRun }: { onRun: (id: string) => void }) {
  const [form, setForm] = useState({ industry: '', func: '', year: 'FY 2025', region: 'Eastern Europe, Middle East, Africa, MENA, United Arab Emirates', who: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [agent, setAgent] = useState('catalyst');
  const [busy, setBusy] = useState<'plan' | 'run' | null>(null);
  const [stages, setStages] = useState<PlanStage[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [spec, setSpec] = useState<Spec | null>(null);
  const [pspec, setPspec] = useState<ProwessSpec | null>(null); // the plan when the database is Prowess
  const [hitsOk, setHitsOk] = useState(false);
  const prowess = agent === 'prowess';
  const [planNo, setPlanNo] = useState(0); // remounts the list boxes when a new plan arrives
  const [notes, setNotes] = useState<Notes | null>(null);
  const [similar, setSimilar] = useState<{ jobs: Job[]; pastFiles: PastFile[] }>({ jobs: [], pastFiles: [] });

  useEffect(() => {
    try { const who = localStorage.getItem('studio.who'); if (who) setForm((f) => ({ ...f, who })); } catch { /* storage unavailable */ }
  }, []);
  // Has this been searched before? Asked half a second after typing stops. It is a hint only, so a failure shows nothing.
  useEffect(() => {
    const q = `${form.industry} ${form.func}`.trim();
    if (q.length < 8) { setSimilar({ jobs: [], pastFiles: [] }); return; }
    // Only results from the same database count; the past export files are TP Catalyst's.
    const t = setTimeout(() => api.similar(q).then((r) => setSimilar({ jobs: r.jobs.filter((j) => j.agent === agent), pastFiles: agent === 'catalyst' ? r.pastFiles : [] })).catch(() => setSimilar({ jobs: [], pastFiles: [] })), 500);
    return () => clearTimeout(t);
  }, [form.industry, form.func, agent]);
  useEffect(() => {
    if (busy !== 'plan') return;
    const started = Date.now();
    setSeconds(0);
    const t = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const brief = `industry: ${form.industry.trim()}; function: ${form.func.trim()}; ${form.year.trim()}; region: ${prowess ? 'India' : form.region.trim()}`;
  const missing = (k: 'industry' | 'func' | 'who') => (touched[k] && !form[k].trim() ? 'Required' : undefined);
  const ready = form.industry.trim() && form.func.trim() && form.who.trim();

  async function plan() {
    setTouched({ industry: true, func: true, who: true });
    if (!ready) return;
    setBusy('plan'); setError(''); setSpec(null); setPspec(null); setHitsOk(false); setStages([]);
    try {
      const r = await api.plan(brief, agent, (s) => setStages((all) => [...all, s]));
      if (prowess) setPspec(r.spec as ProwessSpec); else setSpec(r.spec as Spec);
      setNotes(r.notes); setPlanNo((n) => n + 1);
      try { localStorage.setItem('studio.who', form.who.trim()); } catch { /* storage unavailable */ }
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  async function run() {
    const chosen = prowess ? pspec : spec;
    if (!chosen || (prowess && !hitsOk)) return;
    setBusy('run'); setError('');
    try { onRun((await api.createJob(agent, brief, chosen, form.who.trim(), prowess)).id); } catch (e) { setError((e as Error).message); setBusy(null); }
  }
  const set = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
    onBlur: () => setTouched({ ...touched, [k]: true }),
  });
  const edit = (patch: Partial<Spec>) => spec && setSpec({ ...spec, ...patch });
  const editP = (patch: Partial<ProwessSpec>) => pspec && setPspec({ ...pspec, ...patch });
  const year = (v: string, fallback: number) => (Number.isInteger(Number(v)) && Number(v) > 2000 ? Number(v) : fallback);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="1 · Describe the search">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); plan(); }} noValidate>
          <Field label="Database">
            {(id) => (
              <select id={id} className={inputClass} value={agent} onChange={(e) => { setAgent(e.target.value); setSpec(null); setPspec(null); setNotes(null); setError(''); setHitsOk(false); }}>
                {AGENTS.map((a) => <option key={a.id} value={a.id} disabled={!a.live}>{a.name}{a.live ? '' : ' (planned)'}</option>)}
              </select>
            )}
          </Field>
          <Field label="Industry" hint="For example: paints, varnishes and coatings" error={missing('industry')}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!missing('industry')} className={inputClass} {...set('industry')} />}
          </Field>
          <Field label="Function" hint="For example: distributor, manufacturer, service provider" error={missing('func')}>
            {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!missing('func')} className={inputClass} {...set('func')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Financial year" hint={prowess ? 'FY 2025 means the year ending March 2025' : undefined}>{(id, d) => <input id={id} aria-describedby={d} className={inputClass} {...set('year')} />}</Field>
            <Field label="Your name" error={missing('who')}>
              {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!missing('who')} className={inputClass} autoComplete="name" {...set('who')} />}
            </Field>
          </div>
          {!prowess && <Field label="Region" hint="Regions or countries, separated by commas">{(id, d) => <input id={id} aria-describedby={d} className={inputClass} {...set('region')} />}</Field>}
          {(similar.jobs.length > 0 || similar.pastFiles.length > 0) && (
            <Notice kind="warn">
              <p className="font-medium">This may have been searched before. Use an existing result instead of running it again:</p>
              <ul className="mt-2 grid gap-2">
                {similar.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 p-3 ring-1 ring-line">
                    <span className="min-w-0 flex-1 basis-56 [overflow-wrap:anywhere]">{j.brief}
                      <span className="block text-muted">{j.total?.toLocaleString()} companies · {when(j.finished_at)}{j.export_state === 'done' ? ' · Excel already exported' : ''}{j.agent === 'prowess' ? ' · CSV files saved' : ''}</span></span>
                    <a href={`#run/${j.id}`} className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-white px-5 font-medium text-ink ring-1 ring-line transition-colors duration-150 hover:bg-soft">Use this result</a>
                  </li>
                ))}
                {similar.pastFiles.map((f) => (
                  <li key={f.file}>Past export file: {f.file}{f.total != null ? ` · ${f.total.toLocaleString()} companies` : ''}</li>
                ))}
              </ul>
            </Notice>
          )}
          <div><Button type="submit" busy={busy === 'plan'}>{busy === 'plan' ? 'Planning' : similar.jobs.length > 0 ? 'Plan a new search anyway' : 'Plan the search'}</Button></div>
        </form>
      </Card>

      <Card title="2 · Review and run">
        {error && <div className="mb-4"><Notice kind="bad">{error}</Notice></div>}
        {busy === 'plan' && <PlanProgress stages={stages} seconds={seconds} prowess={prowess} />}
        {!spec && !pspec && !error && busy !== 'plan' && <p className="text-muted">{prowess ? 'The proposed CMIE product and service groups and the years appear here. You can edit them before running.' : 'The proposed regions, industry codes and keywords appear here. You can edit them before running.'}</p>}
        {pspec && prowess && (
          <div className="grid gap-4" key={planNo}>
            <Field label="Main product/service groups" hint="One per line, spelled exactly as in Prowess. A company in any of these groups is included.">
              {(id, d) => <ListInput id={id} describedBy={d} lines value={pspec.groups} onChange={(groups) => editP({ groups })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First year" hint="Year ending March">{(id, d) => <input id={id} aria-describedby={d} type="number" className={inputClass} value={pspec.fromYear} onChange={(e) => editP({ fromYear: year(e.target.value, pspec.fromYear) })} />}</Field>
              <Field label="Last year" hint="Year ending March">{(id, d) => <input id={id} aria-describedby={d} type="number" className={inputClass} value={pspec.toYear} onChange={(e) => editP({ toYear: year(e.target.value, pspec.toYear) })} />}</Field>
              <Field label="Related-party year" hint="One year per run">{(id, d) => <input id={id} aria-describedby={d} type="number" className={inputClass} value={pspec.rptYear} onChange={(e) => editP({ rptYear: year(e.target.value, pspec.rptYear) })} />}</Field>
            </div>
            <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-white/60 p-3 text-sm ring-1 ring-line sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Data pulled</dt>
              <dd>NIC code and name, industry type and group, main product/service group; total income, total expenses, income from non-financial operations, net worth, PBT, exports as % of sales (Rs. crore, standalone); related-party income and expense percentages</dd>
              <dt className="text-muted">Filtering</dt>
              <dd>None in Prowess. The two CSV files are saved for TAIGA.</dd>
              {notes?.plannedBy && (<><dt className="text-muted">Planned by</dt><dd>{notes.plannedBy}</dd></>)}
            </dl>
            {notes && notes.assumptions.length > 0 && (
              <Notice kind="info"><p className="font-medium">Assumptions to check</p><ul className="ml-5 list-disc">{notes.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></Notice>
            )}
            {notes && notes.droppedKeywords.length > 0 && (
              <Notice kind="warn">Dropped because Prowess has no group with this exact name: {notes.droppedKeywords.join(' | ')}</Notice>
            )}
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 cursor-pointer" checked={hitsOk} onChange={(e) => setHitsOk(e.target.checked)} />
              <span>I confirm this run. It makes four Execute clicks in Prowess, which spend hits from the firm's balance, and exports two CSV files.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={run} busy={busy === 'run'} disabled={!hitsOk}>Run the search</Button>
              <span className="text-sm text-muted">Runs the whole search and saves both files. The run reports the hits before and after.</span>
            </div>
          </div>
        )}
        {spec && !prowess && (
          <div className="grid gap-4" key={planNo}>
            <Field label="Regions">{(id) => <ListInput id={id} value={spec.regions} onChange={(regions) => edit({ regions })} />}</Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="NACE codes">{(id) => <ListInput id={id} value={spec.nace} onChange={(nace) => edit({ nace })} />}</Field>
              <Field label="US SIC codes">{(id) => <ListInput id={id} value={spec.usSic} onChange={(usSic) => edit({ usSic })} />}</Field>
              <Field label="NAICS codes">{(id) => <ListInput id={id} value={spec.naics} onChange={(naics) => edit({ naics })} />}</Field>
            </div>
            <Field label="Keyword searches" hint="One per line. Joined to the codes with OR; with AND if the search is over the company limit.">
              {(id, d) => <ListInput id={id} describedBy={d} lines value={spec.text} onChange={(text) => edit({ text })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              {spec.financials.flatMap((f, i) => (['min', 'max'] as const).map((bound) => (
                <Field key={f.item + bound} label={`${f.item}, ${bound === 'min' ? 'minimum' : 'maximum'} (${f.unit} ${f.currency})`} hint={bound === 'max' ? 'Leave empty for no upper limit' : undefined}>
                  {(id, d) => <input id={id} aria-describedby={d} type="number" className={inputClass} value={f[bound] ?? ''}
                    onChange={(e) => edit({ financials: spec.financials.map((x, k) => (k === i ? { ...x, [bound]: e.target.value === '' ? null : Number(e.target.value) } : x)) })} />}
                </Field>
              )))}
            </div>
            <Field label="Maximum companies" hint="If the search finds more, the runner narrows it: first a code and a keyword must both match, then a code in every classification.">
              {(id, d) => <input id={id} aria-describedby={d} type="number" min={1} max={10000} className={inputClass} value={spec.maxCompanies ?? 2000}
                onChange={(e) => edit({ maxCompanies: Math.min(10000, Math.max(1, Math.round(Number(e.target.value)) || 2000)) })} />}
            </Field>
            <Field label="Years" hint={`Applied to both thresholds, ${spec.yearRule === 'all' ? 'for all the selected years' : 'for at least one year'}.`}>
              {(id, d) => <ListInput id={id} describedBy={d} value={spec.years.map(String)} onChange={(y) => edit({ years: y.map(Number).filter(Number.isInteger) })} />}
            </Field>
            <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-white/60 p-3 text-sm ring-1 ring-line sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">House rules</dt>
              <dd>{spec.accountType}, {spec.status.join(' + ')}, independence {spec.independence.join('/')}, website / overview / trade description</dd>
              <dt className="text-muted">Analysis</dt>
              <dd>A new one is created for this search, closing date {spec.closingDate}</dd>
              {notes?.plannedBy && (<><dt className="text-muted">Planned by</dt><dd>{notes.plannedBy}</dd></>)}
            </dl>
            {notes && notes.assumptions.length > 0 && (
              <Notice kind="info"><p className="font-medium">Assumptions to check</p><ul className="ml-5 list-disc">{notes.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></Notice>
            )}
            {notes && notes.droppedKeywords.length > 0 && (
              <Notice kind="warn">A malformed keyword search was dropped: {notes.droppedKeywords.join(' | ')}</Notice>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={run} busy={busy === 'run'}>Run the search</Button>
              <span className="text-sm text-muted">Stops at the company count. No credits are spent.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
