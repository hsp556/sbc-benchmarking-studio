// Tabs 2 to 5: Run, Searches, Agents, How it works.
import { useEffect, useState } from 'react';
import { api, type Job, type Runner, type Step } from './api';
import { Download } from 'lucide-react';
import { Button, Card, Field, Notice, StatusChip, duration, inputClass, when } from './ui';

// Approval gate for the paid part: displaying and exporting results spends pay-per-view credits.
function ExportCard({ job, onChange }: { job: Job; onChange: (j: Job) => void }) {
  const [who, setWho] = useState(() => { try { return localStorage.getItem('studio.who') ?? ''; } catch { return ''; } });
  const [view, setView] = useState('2025');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = job.total ?? 0;
  if (total === 0) return <Card title="Export"><p className="text-muted">Nothing to export: the search matched no companies.</p></Card>;
  if (total > 10000) return <Card title="Export"><Notice kind="warn">TP Catalyst refuses to list more than 10,000 companies. Narrow the search and run it again before exporting.</Notice></Card>;
  const waiting = job.export_state === 'approved' || job.export_state === 'running';
  async function approve() {
    setBusy(true); setError('');
    try { onChange(await api.approveExport(job.id, who.trim(), view.trim())); setAgreed(false); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title="Export">
      <div className="grid gap-4">
        {job.export_state === 'done' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 p-3 ring-1 ring-line">
            <p className="text-sm"><span className="font-medium">{job.export_file}</span>
              <span className="block text-muted">Approved by {job.approved_by} · {when(job.approved_at ?? null)}
                {job.credits_before != null ? ` · credit balance before ${job.credits_before}` : ''}{job.credits_after != null ? `, after the display charge ${job.credits_after}` : ''}</span></p>
            <a href={`api/jobs/${job.id}/file`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ink px-6 font-medium text-white transition-colors duration-150 hover:bg-accent-strong">
              <Download className="size-4" aria-hidden />Download Excel</a>
          </div>
        )}
        {job.shared_path && !waiting && <Notice kind="info">Saved to SharePoint: <span className="break-all font-medium">{job.shared_path}</span></Notice>}
        {job.shared_error && !waiting && <Notice kind="warn">{job.shared_error}. The file is still available{job.export_state === 'done' ? ' from the download button' : ' on the runner PC'}.</Notice>}
        {waiting && <Notice kind="info">{job.export_state === 'approved' ? `Approved by ${job.approved_by}. Waiting for the runner.` : 'Exporting: the runner is rebuilding the search, then it displays and exports the results. This takes about five minutes.'}</Notice>}
        {job.export_state === 'failed' && <Notice kind="bad">{job.export_error ?? 'The export failed.'}</Notice>}
        {error && <Notice kind="bad">{error}</Notice>}
        {!waiting && job.export_state !== 'done' && (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); approve(); }}>
            <p className="text-sm text-body">Exporting displays the {total.toLocaleString()} companies in TP Catalyst and downloads the Excel file. This spends pay-per-view credits, so it needs a named approver.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Approved by">{(id) => <input id={id} className={inputClass} value={who} onChange={(e) => setWho(e.target.value)} autoComplete="name" required minLength={2} />}</Field>
              <Field label="Export view" hint="The saved view in TP Catalyst, for example 2025">{(id, d) => <input id={id} aria-describedby={d} className={inputClass} value={view} onChange={(e) => setView(e.target.value)} required />}</Field>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--color-accent-strong)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I approve spending credits to display and export these results.
            </label>
            <div><Button type="submit" busy={busy} disabled={!agreed || who.trim().length < 2 || !view.trim()}>Approve and export</Button></div>
          </form>
        )}
      </div>
    </Card>
  );
}

export function RunPage({ id }: { id: string | null }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!id) return;
    setJob(null); setError('');
    let closed = false;
    api.job(id).then((j) => !closed && setJob(j)).catch((e) => setError(e.message));
    // Live progress: each step arrives as the runner finishes it.
    const es = new EventSource(`api/jobs/${id}/events`);
    const refresh = () => api.job(id).then((j) => !closed && setJob(j)).catch(() => {});
    es.addEventListener('step', (e) => {
      const step = JSON.parse((e as MessageEvent).data) as Step;
      setJob((j) => (j && !(j.steps ?? []).some((s) => s.seq === step.seq) ? { ...j, steps: [...(j.steps ?? []), step] } : j));
    });
    es.addEventListener('status', refresh);
    es.addEventListener('end', () => { refresh(); es.close(); });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { closed = true; es.close(); clearInterval(tick); };
  }, [id]);
  // While an export is approved or running, re-read the job every few seconds.
  const exportBusy = job?.export_state === 'approved' || job?.export_state === 'running';
  useEffect(() => {
    if (!id || !exportBusy) return;
    const t = setInterval(() => api.job(id).then(setJob).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [id, exportBusy]);

  if (!id) return <Card title="Run"><p className="text-muted">No search is selected. Start one in New search, or open one from Searches.</p></Card>;
  if (error) return <Notice kind="bad">{error}</Notice>;
  if (!job) return <Card title="Run"><p className="text-muted">Loading the search…</p></Card>;
  const steps = job.steps ?? [];
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <Card title={job.brief} aside={<StatusChip status={job.status} />}>
        <dl className="grid grid-cols-2 gap-4 [overflow-wrap:anywhere] sm:grid-cols-4 [&>div]:min-w-0">
          <div><dt className="text-sm text-muted">Companies</dt><dd className="font-display text-4xl font-light text-ink">{job.total != null ? job.total.toLocaleString() : '—'}</dd></div>
          <div><dt className="text-sm text-muted">Time taken</dt><dd className="font-display text-4xl font-light text-ink">{duration(job.started_at, job.finished_at, now) || '—'}</dd></div>
          <div><dt className="text-sm text-muted">Requested by</dt><dd>{job.created_by}<br /><span className="text-sm text-muted">{when(job.created_at)}</span></dd></div>
          <div><dt className="text-sm text-muted">Runner</dt><dd>{job.runner ?? 'waiting for a runner'}</dd></div>
        </dl>
        {job.status === 'queued' && <div className="mt-4"><Notice kind="info">Waiting for a runner that is logged in to the database. Check the Agents tab.</Notice></div>}
        {job.status === 'failed' && <div className="mt-4"><Notice kind="bad">{job.error ?? 'The search failed.'}</Notice></div>}
        {job.id.startsWith('run-') && <div className="mt-4"><Notice kind="warn">Imported from an earlier command-line run. Its total was read before a counting fix and has not been verified: run the search again before relying on it.</Notice></div>}
        {job.agent === 'catalyst' && job.total != null && job.total > 10000 && <div className="mt-4"><Notice kind="warn">Over the 10,000 limit of the results list. Narrow the search.</Notice></div>}
        {job.agent === 'catalyst' && job.status === 'done' && job.total != null && job.total <= 10000 && job.total > (job.spec?.maxCompanies ?? 2000) && !job.id.startsWith('run-') && <div className="mt-4"><Notice kind="warn">Over the limit of {(job.spec?.maxCompanies ?? 2000).toLocaleString()} companies even after narrowing. Tighten the codes or keywords and run it again.</Notice></div>}
        {job.boolean && <p className="mt-4 text-sm"><span className="text-muted">Boolean: </span><code className="break-words">{job.boolean}</code></p>}
      </Card>
      {job.status === 'done' && job.agent === 'catalyst' && <ExportCard job={job} onChange={setJob} />}
      {job.status === 'done' && job.agent === 'prowess' && (
        <Card title="Files">
          <div className="grid gap-3">
            {job.shared_path
              ? <Notice kind="info">Saved to the shared folder for TAIGA:<ul className="ml-5 list-disc">{job.shared_path.split(' | ').map((p) => <li key={p} className="break-all font-medium">{p}</li>)}</ul></Notice>
              : <Notice kind="warn">{job.shared_error ?? 'No shared folder is set on the runner PC (SHAREPOINT_DIR)'}. The two CSV files are in the runs folder on the runner PC: see the last search step.</Notice>}
            <p className="text-sm text-muted">Filtering is done in TAIGA from these files.</p>
          </div>
        </Card>
      )}
      <Card title="Search steps">
        {steps.length === 0 ? <p className="text-muted">{job.status === 'running' ? 'The first step is being added…' : 'No steps were recorded.'}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Search steps with company counts</caption>
              <thead><tr className="border-b border-line text-muted"><th scope="col" className="py-2 pr-4 font-medium">Step</th><th scope="col" className="py-2 pr-4 text-right font-medium">Step result</th></tr></thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.seq} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-4">{s.text}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{s.stepCount ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Searches() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [agent, setAgent] = useState('');
  useEffect(() => {
    const load = () => api.jobs().then((r) => { setJobs(r.items); setError(''); }).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  const shown = (jobs ?? []).filter((j) => (!status || j.status === status) && (!agent || j.agent === agent));
  return (
    <Card title="Searches" aside={<div className="flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-sm">Database
        <select className={`${inputClass} w-auto`} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">All</option>{DATABASES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">Status
        <select className={`${inputClass} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="queued">Queued</option><option value="running">Running</option><option value="done">Done</option><option value="failed">Failed</option>
        </select>
      </label></div>}>
      {error && <Notice kind="bad">{error}</Notice>}
      {!jobs && !error && <p className="text-muted">Loading searches…</p>}
      {jobs && shown.length === 0 && <p className="text-muted">No searches match. Start one in New search.</p>}
      {shown.length > 0 && (
        <ul className="divide-y divide-line">
          {shown.map((j) => (
            <li key={j.id}>
              <a href={`#run/${j.id}`} className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 py-3 transition-colors duration-150 hover:bg-soft">
                <span className="min-w-0 flex-1 basis-64"><span className="block font-medium text-ink">{j.brief}</span>
                  <span className="text-sm text-muted">{j.agent} · {j.created_by} · {when(j.created_at)}</span></span>
                <span className="tabular-nums">{j.total != null ? `${j.total.toLocaleString()} companies${j.id.startsWith('run-') ? ' (unverified)' : ''}` : ''}</span>
                <StatusChip status={j.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const DATABASES = [
  { id: 'catalyst', name: 'TP Catalyst', note: 'Moody\'s. Search building is live; export after approval is next.' },
  { id: 'ace', name: 'ACE', note: 'Planned.' },
  { id: 'prowess', name: 'Prowess', note: 'CMIE, India. One run does the search and saves two CSV files for TAIGA. It spends Prowess hits.' },
  { id: 'capitaline', name: 'Capitaline', note: 'Planned.' },
];
const LIVE = ['catalyst', 'prowess'];
const RUNNER_STATE: Record<string, string> = { idle: 'Ready', busy: 'Running a search', logged_out: 'Logged out of the database', no_browser: 'Browser not open' };

export function Agents() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.runners().then((r) => { setRunners(r.items); setError(''); }).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid gap-4">
      {error && <Notice kind="bad">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {DATABASES.map((d) => {
          const mine = runners.filter((r) => r.agent === d.id);
          return (
            <Card key={d.id} title={`${d.name} agent`} aside={<span className={`rounded-full px-2.5 py-1 text-sm font-medium ${LIVE.includes(d.id) ? 'bg-okbg text-ok' : 'bg-soft text-muted'}`}>{LIVE.includes(d.id) ? 'Live' : 'Planned'}</span>}>
              <p className="text-sm text-muted">{d.note}</p>
              {LIVE.includes(d.id) && (mine.length === 0 ? <p className="mt-3 text-sm">No runner has connected yet.</p> : (
                <ul className="mt-3 grid gap-2">
                  {mine.map((r) => (
                    <li key={r.name} className="rounded-xl bg-white/60 p-3 ring-1 ring-line text-sm">
                      <span className="font-medium">{r.name}</span>: {r.online ? RUNNER_STATE[r.state] ?? r.state : 'Offline'}
                      {r.online && r.detail && <span className="block text-muted">{r.detail}</span>}
                      <span className="block text-muted">Last seen {when(r.last_seen)}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function Guide() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="How a search runs">
        <ol className="ml-5 grid list-decimal gap-2">
          <li>Describe the search: industry, function, financial year and region.</li>
          <li>The planner proposes regions, industry codes and keywords, using the team's past searches as a guide.</li>
          <li>Review and edit the plan.</li>
          <li>Run. A runner on a PC that is logged in to the database builds the search step by step.</li>
          <li>If the search finds more than the company limit (2,000 unless changed), the runner narrows it by requiring a code and a keyword together. Thresholds are never changed.</li>
          <li>The run stops at the company count and spends no credits.</li>
          <li>To get the Excel file, a named person approves the export. The runner rebuilds the search, checks the count is unchanged, then displays and exports the results.</li>
          <li>Prowess is different: one run ticks the product and service groups, pulls the data and saves two CSV files for TAIGA. It spends Prowess hits, so the person starting it confirms that first.</li>
        </ol>
      </Card>
      <Card title="Rules">
        <ul className="ml-5 grid list-disc gap-2">
          <li>House template: U1 accounts, active companies, independence A/B/U, website, overview and trade description, EBIT at least 0 and revenue at least 1 million USD for the latest three years.</li>
          <li>Accounts closing date is 31/12.</li>
          <li>The results list refuses more than 10,000 companies.</li>
          <li>Credits are spent only by an export, and only after a named person approves it on the Run page.</li>
          <li>Database logins stay on the runner PC. The Studio never sees a password.</li>
          <li>The planner sees the brief and past search strategies only, never company data.</li>
        </ul>
      </Card>
    </div>
  );
}
