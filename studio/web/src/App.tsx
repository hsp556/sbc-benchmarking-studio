// Shell: glass top bar with pill tabs, page heading, and hash routing (#new, #run/<id>, #searches, #agents, #guide).
import { useEffect, useState } from 'react';
import NewSearch from './NewSearch';
import { Agents, Guide, RunPage, Searches } from './pages';

const TABS = [
  { id: 'new', label: 'New search', eyebrow: 'Step 1 · Brief and plan', title: 'Describe the search,', accent: 'built and run by agents.' },
  { id: 'run', label: 'Run', eyebrow: 'Step 2 · Live run', title: 'Watch it build,', accent: 'step by step.' },
  { id: 'searches', label: 'Searches', eyebrow: 'Step 3 · History', title: 'Every search,', accent: 'ready to reuse.' },
  { id: 'agents', label: 'Agents', eyebrow: 'TP database agents', title: 'Four databases,', accent: 'one studio.' },
  { id: 'guide', label: 'How it works', eyebrow: 'House rules', title: 'How a search runs,', accent: 'and what needs approval.' },
];
const parse = () => {
  const [tab, arg] = window.location.hash.replace(/^#/, '').split('/');
  return { tab: TABS.some((t) => t.id === tab) ? tab : 'new', arg: arg ?? null };
};

export default function App() {
  const [route, setRoute] = useState(parse);
  const [runId, setRunId] = useState<string | null>(route.tab === 'run' ? route.arg : null);
  useEffect(() => {
    const onHash = () => { const r = parse(); setRoute(r); if (r.tab === 'run' && r.arg) setRunId(r.arg); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const current = TABS.find((t) => t.id === route.tab)!;

  return (
    <div className="min-h-screen">
      <header className="glass-bar sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <a href="#new" className="flex min-h-11 cursor-pointer items-center gap-3">
            {/* The logo's wordmark is white, so it sits on a dark tile. */}
            <span className="flex h-11 items-center rounded-xl bg-ink px-3">
              <img src="logo.png" alt="SBC" width={900} height={323} className="h-7 w-auto" />
            </span>
            <span>
              <span className="block font-semibold leading-tight text-ink">SBC Benchmarking Studio</span>
              <span className="eyebrow block">Firm OS · TP database agents</span>
            </span>
          </a>
          <nav aria-label="Sections">
            <ul className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <li key={t.id}>
                  <a href={t.id === 'run' && runId ? `#run/${runId}` : `#${t.id}`} aria-current={route.tab === t.id ? 'page' : undefined}
                    className={`flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium transition-colors duration-150 ${route.tab === t.id ? 'bg-ink text-white' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
        <p className="eyebrow mb-3 flex items-center gap-2"><span aria-hidden className="inline-block size-1.5 bg-accent" />{current.eyebrow}</p>
        <h1 className="mb-8 font-display text-4xl font-light leading-[1.05] tracking-tight text-ink sm:text-5xl">
          {current.title} <em className="text-accent-strong">{current.accent}</em>
        </h1>
        {route.tab === 'new' && <NewSearch onRun={(id) => { window.location.hash = `run/${id}`; }} />}
        {route.tab === 'run' && <RunPage id={runId} />}
        {route.tab === 'searches' && <Searches />}
        {route.tab === 'agents' && <Agents />}
        {route.tab === 'guide' && <Guide />}
      </main>
    </div>
  );
}
