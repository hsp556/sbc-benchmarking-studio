// Studio API. The website and the runners both talk to this.
//   node studio/api/server.mjs            (port 3000, data in studio/data/studio.db)
import { timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { z } from 'zod';
import fastifyStatic from '@fastify/static';
import { openStore } from './db.mjs';
import { planBrief, similarPast } from '../../planner/planner.mjs';
import { AGENTS, specFor } from '../shared/job-schema.mjs';

const Agent = z.enum(AGENTS);
// The spec is checked against its database's shape. A Prowess search spends hits as soon as it runs (there is no
// free count first), so the person starting it must confirm that.
const NewJob = z.object({ agent: Agent, brief: z.string().min(3).max(500), spec: z.unknown(), createdBy: z.string().min(1).max(80), confirmHits: z.boolean().optional() })
  .transform((b, ctx) => {
    const spec = specFor(b.agent).safeParse(b.spec);
    if (!spec.success) { for (const i of spec.error.issues) ctx.addIssue({ code: 'custom', path: ['spec', ...i.path], message: i.message }); return z.NEVER; }
    if (b.agent === 'prowess' && b.confirmHits !== true) { ctx.addIssue({ code: 'custom', path: ['confirmHits'], message: 'a Prowess search spends hits: confirm before running' }); return z.NEVER; }
    return { ...b, spec: spec.data };
  });
const ListQuery = z.object({ agent: Agent.optional(), status: z.enum(['queued', 'running', 'done', 'failed']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) });
const Claim = z.object({ runner: z.string().min(1).max(80), agent: Agent });
const Step = z.object({ kind: z.string().min(1).max(40), text: z.string().min(1).max(2000), stepCount: z.string().max(30).optional(), running: z.string().max(30).optional() });
const Finish = z.object({ status: z.enum(['done', 'failed']), total: z.number().int().min(0).optional(), boolean: z.string().max(500).optional(), error: z.string().max(2000).optional(), sharedPath: z.string().max(500).optional(), sharedError: z.string().max(500).optional() });
const Approve = z.object({ approvedBy: z.string().min(2).max(80), view: z.string().min(1).max(60), confirmCredits: z.literal(true) });
const ExportDone = z.object({ status: z.enum(['done', 'failed']), error: z.string().max(2000).optional(), creditsBefore: z.number().int().min(0).nullish(), creditsAfter: z.number().int().min(0).nullish(), sharedPath: z.string().max(500).optional(), sharedError: z.string().max(500).optional() });
const Beat = z.object({ name: z.string().min(1).max(80), agent: Agent, state: z.enum(['idle', 'busy', 'logged_out', 'no_browser']), detail: z.string().max(300).optional() });

// basePath: the Studio served under a path on a shared site (BASE_PATH=/benchmarkingStudio on tpdocgenai.com). The
//   prefix is taken off every request, so routes and the auth check are the same as on a PC. The website must be
//   built with the same BASE_PATH.
// exportsOnRunner: the Studio accepts no export files and the Excel stays on the runner PC (EXPORTS_ON_RUNNER=1, set on
//   the hosted Studio: TP Catalyst data is not loaded onto the cloud server).
export function build({ dbFile, plan = planBrief, similar = similarPast, webDir, runnerToken = process.env.RUNNER_TOKEN, password = process.env.STUDIO_PASSWORD,
  basePath = process.env.BASE_PATH, exportsOnRunner = process.env.EXPORTS_ON_RUNNER === '1' }) {
  const exportsDir = path.join(path.dirname(dbFile), 'exports'); // export files uploaded by runners
  const base = (basePath ?? '').replace(/\/+$/, '');
  const rewriteUrl = base ? (req) => (req.url === base || req.url.startsWith(`${base}/`) || req.url.startsWith(`${base}?`) ? req.url.slice(base.length) || '/' : req.url).replace(/^\?/, '/?') : undefined;
  // forceCloseConnections: shutdown must not wait for browsers' idle keep-alive or open progress streams
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, forceCloseConnections: true, ...(rewriteUrl && { rewriteUrl }) });
  const store = openStore(dbFile);
  const bus = new EventEmitter().setMaxListeners(0); // live progress, keyed by job id
  app.addHook('onClose', () => store.close());
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 60 * 1024 * 1024 }, (req, body, done) => done(null, body));

  // Uniform error envelope: { code, message, requestId }
  const fail = (reply, status, code, message) => reply.code(status).send({ code, message, requestId: reply.request.id });
  const parse = (schema, data, reply) => {
    const r = schema.safeParse(data);
    if (!r.success) { fail(reply, 422, 'invalid_request', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')); return null; }
    return r.data;
  };
  app.setErrorHandler((err, req, reply) => {
    req.log.error(err);
    fail(reply, err.statusCode && err.statusCode < 500 ? err.statusCode : 500, err.statusCode && err.statusCode < 500 ? 'bad_request' : 'internal_error', err.statusCode && err.statusCode < 500 ? err.message : 'Unexpected error');
  });
  // Runner endpoints start searches' results and exports, so on a network they need the shared runner token.
  // Everything else (website and API) asks for the shared Studio password, when one is set: the browser shows its own
  // sign-in box (any user name). /api/health stays open for checks.
  const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  if (runnerToken || password) app.addHook('onRequest', (req, reply, done) => {
    const auth = req.headers.authorization ?? '';
    if (req.url.startsWith('/api/runner/')) {
      if (!runnerToken || same(auth, `Bearer ${runnerToken}`)) return done();
      return fail(reply, 401, 'unauthorized', 'Runner token missing or wrong');
    }
    if (!password || req.url === '/api/health') return done();
    const given = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString().replace(/^[^:]*:/, '') : '';
    if (same(given, password)) return done();
    reply.header('www-authenticate', 'Basic realm="SBC Benchmarking Studio", charset="UTF-8"');
    fail(reply, 401, 'unauthorized', 'Password needed');
  });
  const jobOr404 = (id, reply) => store.getJob(id) ?? (fail(reply, 404, 'not_found', 'No such job'), null);

  app.get('/api/health', () => ({ ok: true }));
  // The built website (studio/web/dist), when present. Unknown non-API paths fall back to the app page.
  if (webDir && fs.existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? fail(reply, 404, 'not_found', 'No such endpoint') : reply.sendFile('index.html')));
  }

  // ---- used by the website
  // Planning is streamed as JSON lines so the website can show what is happening:
  //   {"stage":"examples","count":8} {"stage":"model","model":"..."} {"stage":"checking"} then {"result":{...}} or {"error":"..."}
  app.post('/api/plan', async (req, reply) => {
    const body = parse(z.object({ brief: z.string().min(10).max(500), agent: Agent.default('catalyst') }), req.body, reply);
    if (!body) return;
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
    const line = (o) => reply.raw.write(`${JSON.stringify(o)}\n`);
    try { line({ result: await plan(body.brief, line, body.agent) }); } catch (e) {
      req.log.warn({ err: e.message }, 'planner failed');
      line({ error: e.message.slice(0, 600) });
    }
    reply.raw.end();
  });
  // Has this search been done before? Finished Studio jobs and the team's past export files that share words with the brief.
  app.get('/api/similar', (req, reply) => {
    const q = parse(z.object({ brief: z.string().min(3).max(500) }), req.query, reply);
    if (!q) return;
    const words = (t) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const want = words(q.brief);
    const jobs = store.listJobs({ status: 'done', limit: 200 })
      .filter((j) => !j.id.startsWith('run-')) // imported command-line runs: totals read before the count fix
      .filter((j) => [...words(j.brief.replace(/region:.*$/i, ''))].filter((w) => want.has(w)).length >= 2).slice(0, 5);
    reply.send({ jobs, pastFiles: similar(q.brief) });
  });
  app.post('/api/jobs', (req, reply) => {
    const body = parse(NewJob, req.body, reply);
    if (body) reply.code(201).send(store.createJob(body));
  });
  app.get('/api/jobs', (req, reply) => {
    const q = parse(ListQuery, req.query, reply);
    if (q) reply.send({ items: store.listJobs(q), limit: q.limit, offset: q.offset });
  });
  app.get('/api/jobs/:id', (req, reply) => { const job = jobOr404(req.params.id, reply); if (job) reply.send(job); });
  app.get('/api/runners', () => ({ items: store.listRunners() }));

  // Approval gate. Displaying and exporting results spends pay-per-view credits, so a named person must approve.
  app.post('/api/jobs/:id/export', (req, reply) => {
    const job = jobOr404(req.params.id, reply);
    const b = job && parse(Approve, req.body, reply);
    if (!b) return;
    if (job.agent !== 'catalyst') return fail(reply, 409, 'no_separate_export', 'This database exports as part of the search');
    if (job.status !== 'done') return fail(reply, 409, 'not_finished', 'Only a finished search can be exported');
    if (!(job.total > 0)) return fail(reply, 409, 'nothing_to_export', 'The search matched no companies');
    if (job.total > 10000) return fail(reply, 409, 'over_cap', `The results list refuses more than 10,000 companies (this search has ${job.total.toLocaleString('en')}). Narrow the search first.`);
    if (['approved', 'running'].includes(job.export_state)) return fail(reply, 409, 'export_in_progress', 'An export of this search is already approved or running');
    reply.send(store.approveExport(job.id, b));
  });
  app.get('/api/jobs/:id/file', (req, reply) => {
    const job = jobOr404(req.params.id, reply);
    if (!job) return;
    const file = path.join(exportsDir, `${job.id}.xlsx`);
    if (!job.export_file || !fs.existsSync(file)) return fail(reply, 404, 'no_file', 'This search has no export file');
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${job.export_file}"`).send(fs.createReadStream(file));
  });

  // Live progress as Server-Sent Events: replays what is stored, then streams new steps until the job ends.
  app.get('/api/jobs/:id/events', (req, reply) => {
    const job = jobOr404(req.params.id, reply);
    if (!job) return;
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    reply.raw.write(': connected\n\n'); // sends the headers now, so the listener is attached before the first step
    const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const s of job.steps) send('step', s);
    const ended = (j) => j.status === 'done' || j.status === 'failed';
    if (ended(job)) { send('end', job); reply.raw.end(); return; }
    const onEvent = ({ event, data }) => { send(event, data); if (event === 'end') reply.raw.end(); };
    bus.on(job.id, onEvent);
    req.raw.on('close', () => bus.off(job.id, onEvent));
  });

  // ---- used by runners
  app.post('/api/runner/heartbeat', (req, reply) => {
    const b = parse(Beat, req.body, reply);
    if (b) { store.heartbeat(b); reply.code(204).send(); }
  });
  app.post('/api/runner/claim', (req, reply) => {
    const b = parse(Claim, req.body, reply);
    if (!b) return;
    const job = store.claimJob(b);
    if (!job) return reply.code(204).send();
    bus.emit(job.id, { event: 'status', data: { status: 'running', runner: b.runner } });
    reply.send(job);
  });
  const runningJob = (req, reply) => {
    const job = jobOr404(req.params.id, reply);
    if (job && job.status !== 'running' && job.export_state !== 'running') { fail(reply, 409, 'not_running', `Job is ${job.status}`); return null; }
    return job;
  };
  app.post('/api/runner/jobs/:id/steps', (req, reply) => {
    const job = runningJob(req, reply);
    const b = job && parse(Step, req.body, reply);
    if (!b) return;
    const step = store.addStep(job.id, b);
    bus.emit(job.id, { event: 'step', data: step });
    reply.code(201).send(step);
  });
  // A runner that finds it cannot work (logged out) hands the job back; it waits in the queue untouched.
  app.post('/api/runner/jobs/:id/release', (req, reply) => {
    const job = runningJob(req, reply);
    if (!job) return;
    if (job.export_state === 'running') store.releaseExport(job.id); else store.releaseJob(job.id);
    bus.emit(job.id, { event: 'status', data: { status: 'queued' } });
    reply.code(204).send();
  });
  // The export file itself, then the outcome. The Studio keeps the file on its own disk and sends it nowhere; the runner may also copy it to a synced SharePoint folder (SHAREPOINT_DIR) and reports that here.
  app.post('/api/runner/jobs/:id/file', (req, reply) => {
    const job = runningJob(req, reply);
    if (!job) return;
    if (exportsOnRunner) return fail(reply, 410, 'exports_stay_on_runner', 'This Studio keeps no export files: the file stays on the runner PC');
    if (job.export_state !== 'running' || !Buffer.isBuffer(req.body) || !req.body.length) return fail(reply, 422, 'invalid_request', 'Expected the export file as application/octet-stream');
    const name = `${String(req.headers['x-file-name'] ?? 'export').replace(/[^\w .()-]/g, '').replace(/\.xlsx$/i, '').slice(0, 120) || 'export'}.xlsx`;
    fs.mkdirSync(exportsDir, { recursive: true });
    fs.writeFileSync(path.join(exportsDir, `${job.id}.xlsx`), req.body);
    store.setExportFile(job.id, name);
    reply.code(204).send();
  });
  app.post('/api/runner/jobs/:id/export-finish', (req, reply) => {
    const job = runningJob(req, reply);
    const b = job && parse(ExportDone, req.body, reply);
    if (!b) return;
    if (job.export_state !== 'running') return fail(reply, 409, 'not_exporting', 'This job has no export running');
    reply.send(store.finishExport(job.id, b));
  });
  app.post('/api/runner/jobs/:id/finish', (req, reply) => {
    const job = runningJob(req, reply);
    const b = job && parse(Finish, req.body, reply);
    if (!b) return;
    const done = store.finishJob(job.id, b);
    bus.emit(job.id, { event: 'end', data: done });
    reply.send(done);
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const app = build({ dbFile: path.join(dataDir, 'studio.db'), webDir: path.resolve(dataDir, '..', 'web', 'dist') });
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !((process.env.RUNNER_TOKEN ?? '').length >= 24 && (process.env.STUDIO_PASSWORD ?? '').length >= 8)) {
    console.error('Refusing to listen on the network without RUNNER_TOKEN (24 characters or more) and STUDIO_PASSWORD (8 or more). Set them in office.env.');
    process.exit(1);
  }
  await app.listen({ port: Number(process.env.PORT ?? 3000), host });
}
