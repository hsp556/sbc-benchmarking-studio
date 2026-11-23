// Calls to the Studio API. Every failure becomes an Error with the server's message.
export type Financial = { item: string; min?: number | null; max?: number | null; unit: string; currency: string };
export type Spec = {
  job: string; brief: string; closingDate: string; regions: string[]; accountType: string; status: string[];
  independence: string[]; companiesWith: string[]; years: number[]; yearRule: string; financials: Financial[];
  nace: string[]; usSic: string[]; naics: string[]; text: string[]; maxCompanies?: number;
};
// Prowess: CMIE product/service group names and March year-ends (2024 = FY 2023-24).
export type ProwessSpec = { job: string; brief: string; groups: string[]; fromYear: number; toYear: number; rptYear: number };
export type Notes = { assumptions: string[]; droppedKeywords: string[]; plannedBy: string | null; pastSearchesUsedAsExamples: string[] };
export type Step = { seq: number; kind: string; text: string; stepCount: string | null; running: string | null; at: string };
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type Job = {
  id: string; agent: string; brief: string; status: JobStatus; created_by: string; created_at: string;
  started_at: string | null; finished_at: string | null; runner: string | null; total: number | null;
  boolean: string | null; error: string | null; spec?: Spec; steps?: Step[];
  export_state: 'approved' | 'running' | 'done' | 'failed' | null; export_file: string | null; export_view?: string | null;
  approved_by?: string | null; approved_at?: string | null; export_error?: string | null; credits_before?: number | null; credits_after?: number | null; shared_path?: string | null; shared_error?: string | null;
};
export type PlanStage = { stage: 'examples'; count: number } | { stage: 'model'; model: string } | { stage: 'checking' };
export type PastFile = { file: string; search: string; total: number | null };
export type Runner = { name: string; agent: string; state: string; detail: string | null; last_seen: string; online: boolean };

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('The Studio server is not reachable. Check that it is running.');
  }
  if (r.status === 204) return null as T;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message ?? `Request failed (${r.status})`);
  return data as T;
}

// Planning arrives as JSON lines: stages as they happen, then the result or an error.
async function plan(brief: string, agent: string, onStage: (s: PlanStage) => void): Promise<{ spec: Spec | ProwessSpec; notes: Notes }> {
  let r: Response;
  try {
    r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, agent }) });
  } catch {
    throw new Error('The Studio server is not reachable. Check that it is running.');
  }
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).message ?? `Request failed (${r.status})`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  for (let buffer = ''; ;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const msg = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      if (msg.result) return msg.result;
      if (msg.error) throw new Error(msg.error);
      onStage(msg);
    }
  }
  throw new Error('The planner stopped without an answer. Try again.');
}

export const api = {
  plan,
  similar: (brief: string) => call<{ jobs: Job[]; pastFiles: PastFile[] }>('GET', `/api/similar?brief=${encodeURIComponent(brief)}`),
  createJob: (agent: string, brief: string, spec: Spec | ProwessSpec, createdBy: string, confirmHits?: boolean) => call<Job>('POST', '/api/jobs', { agent, brief, spec, createdBy, ...(confirmHits && { confirmHits }) }),
  approveExport: (id: string, approvedBy: string, view: string) => call<Job>('POST', `/api/jobs/${id}/export`, { approvedBy, view, confirmCredits: true }),
  jobs: () => call<{ items: Job[] }>('GET', '/api/jobs?limit=200'),
  job: (id: string) => call<Job>('GET', `/api/jobs/${id}`),
  runners: () => call<{ items: Runner[] }>('GET', '/api/runners'),
};
