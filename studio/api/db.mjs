// Job store: one SQLite file (Node's built-in driver). Jobs hold the search spec; steps arrive from runners.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function openStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, agent TEXT NOT NULL, brief TEXT NOT NULL, spec TEXT NOT NULL,
      status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
      started_at TEXT, finished_at TEXT, runner TEXT, total INTEGER, boolean TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES jobs(id), seq INTEGER NOT NULL,
      kind TEXT NOT NULL, text TEXT NOT NULL, step_count TEXT, running TEXT, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runners (
      name TEXT PRIMARY KEY, agent TEXT NOT NULL, state TEXT NOT NULL, detail TEXT, last_seen TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS steps_job ON steps(job_id, seq);
    CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(agent, status, created_at);`);
  // Export columns were added after the first version: add them to an existing file.
  const have = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name));
  for (const [col, type] of Object.entries({ export_state: 'TEXT', export_view: 'TEXT', approved_by: 'TEXT', approved_at: 'TEXT', export_file: 'TEXT', export_error: 'TEXT', credits_before: 'INTEGER', credits_after: 'INTEGER', shared_path: 'TEXT', shared_error: 'TEXT' })) {
    if (!have.has(col)) db.exec(`ALTER TABLE jobs ADD COLUMN ${col} ${type}`);
  }
  const now = () => new Date().toISOString();
  const row = (j) => j && { ...j, spec: JSON.parse(j.spec) };

  return {
    createJob({ agent, brief, spec, createdBy }) {
      const id = randomUUID();
      db.prepare('INSERT INTO jobs (id, agent, brief, spec, status, created_by, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, agent, brief, JSON.stringify(spec), 'queued', createdBy, now());
      return this.getJob(id);
    },
    getJob(id) {
      const job = row(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
      return job && { ...job, steps: db.prepare('SELECT seq, kind, text, step_count AS stepCount, running, at FROM steps WHERE job_id = ? ORDER BY seq').all(id) };
    },
    listJobs({ agent, status, limit = 50, offset = 0 }) {
      const where = [agent && 'agent = @agent', status && 'status = @status'].filter(Boolean).join(' AND ');
      const params = { ...(agent && { agent }), ...(status && { status }), limit, offset };
      return db.prepare(`SELECT id, agent, brief, status, created_by, created_at, started_at, finished_at, runner, total, boolean, error, export_state, export_file
        FROM jobs ${where ? `WHERE ${where}` : ''} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all(params);
    },
    // Hands the oldest queued job for this agent to one runner. Synchronous, so two runners cannot get the same job.
    claimJob({ agent, runner }) {
      // Approved exports go first: someone is waiting for a file.
      const exp = db.prepare("SELECT id FROM jobs WHERE agent = ? AND export_state = 'approved' ORDER BY approved_at LIMIT 1").get(agent);
      if (exp) {
        db.prepare("UPDATE jobs SET export_state = 'running', export_error = NULL, runner = ? WHERE id = ? AND export_state = 'approved'").run(runner, exp.id);
        return { ...this.getJob(exp.id), task: 'export' };
      }
      const next = db.prepare("SELECT id FROM jobs WHERE agent = ? AND status = 'queued' ORDER BY created_at LIMIT 1").get(agent);
      if (!next) return null;
      db.prepare("UPDATE jobs SET status = 'running', runner = ?, started_at = ? WHERE id = ? AND status = 'queued'").run(runner, now(), next.id);
      return { ...this.getJob(next.id), task: 'search' };
    },
    // The approval gate: nothing is exported (and no credit spent) until a named person has approved it.
    approveExport(jobId, { approvedBy, view }) {
      db.prepare("UPDATE jobs SET export_state = 'approved', export_view = ?, approved_by = ?, approved_at = ?, export_error = NULL WHERE id = ?").run(view, approvedBy, now(), jobId);
      return this.getJob(jobId);
    },
    releaseExport(jobId) { db.prepare("UPDATE jobs SET export_state = 'approved' WHERE id = ? AND export_state = 'running'").run(jobId); },
    setExportFile(jobId, name) { db.prepare('UPDATE jobs SET export_file = ? WHERE id = ?').run(name, jobId); },
    finishExport(jobId, { status, error, creditsBefore, creditsAfter, sharedPath, sharedError }) {
      db.prepare('UPDATE jobs SET export_state = ?, export_error = ?, credits_before = ?, credits_after = ?, shared_path = ?, shared_error = ? WHERE id = ?')
        .run(status, error ?? null, creditsBefore ?? null, creditsAfter ?? null, sharedPath ?? null, sharedError ?? null, jobId);
      return this.getJob(jobId);
    },
    addStep(jobId, { kind, text, stepCount, running }) {
      const seq = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM steps WHERE job_id = ?').get(jobId).n;
      const step = { seq, kind, text, stepCount: stepCount ?? null, running: running ?? null, at: now() };
      db.prepare('INSERT INTO steps (job_id, seq, kind, text, step_count, running, at) VALUES (?,?,?,?,?,?,?)')
        .run(jobId, seq, kind, text, step.stepCount, step.running, step.at);
      return step;
    },
    // A run made from the command line before the Studio existed. Importing the same run twice changes nothing.
    importRun({ id, brief, spec, started, finished, total, boolean, rows }) {
      const added = db.prepare(`INSERT OR IGNORE INTO jobs (id, agent, brief, spec, status, created_by, created_at, started_at, finished_at, runner, total, boolean)
        VALUES (?, 'catalyst', ?, ?, 'done', 'command line', ?, ?, ?, 'command line', ?, ?)`).run(id, brief, JSON.stringify(spec), started, started, finished, total, boolean).changes;
      if (added) for (const r of rows) this.addStep(id, { kind: 'imported', text: r.text, stepCount: r.stepCount, running: r.running });
      return added === 1;
    },
    releaseJob(jobId) {
      db.prepare("UPDATE jobs SET status = 'queued', runner = NULL, started_at = NULL WHERE id = ? AND status = 'running'").run(jobId);
      db.prepare('DELETE FROM steps WHERE job_id = ?').run(jobId);
    },
    finishJob(jobId, { status, total, boolean, error, sharedPath, sharedError }) {
      db.prepare('UPDATE jobs SET status = ?, total = ?, boolean = ?, error = ?, finished_at = ?, shared_path = COALESCE(?, shared_path), shared_error = COALESCE(?, shared_error) WHERE id = ?')
        .run(status, total ?? null, boolean ?? null, error ?? null, now(), sharedPath ?? null, sharedError ?? null, jobId);
      return this.getJob(jobId);
    },
    heartbeat({ name, agent, state, detail }) {
      db.prepare(`INSERT INTO runners (name, agent, state, detail, last_seen) VALUES (?,?,?,?,?)
        ON CONFLICT(name) DO UPDATE SET agent = excluded.agent, state = excluded.state, detail = excluded.detail, last_seen = excluded.last_seen`)
        .run(name, agent, state, detail ?? null, now());
    },
    listRunners() {
      const cutoff = Date.now() - 60_000; // a runner that has not reported for a minute counts as offline
      return db.prepare('SELECT * FROM runners ORDER BY name').all().map((r) => ({ ...r, online: Date.parse(r.last_seen) > cutoff }));
    },
    close() { db.close(); },
  };
}
