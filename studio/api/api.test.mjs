// API tests: node --test studio/api
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from './server.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
let app, base;
before(async () => {
  process.env.LOG_LEVEL = 'silent';
  // The planner is replaced by a stand-in, so tests never call a model.
  const plan = async (brief, onStage) => {
    if (brief.includes('explode')) throw new Error('model unavailable');
    onStage({ stage: 'examples', count: 3 }); onStage({ stage: 'model', model: 'stand-in' }); onStage({ stage: 'checking' });
    return { spec: { ...spec, brief }, notes: { assumptions: [], droppedKeywords: [], plannedBy: 'stand-in', pastSearchesUsedAsExamples: [] } };
  };
  const similar = () => [{ file: 'A - paints manufacturing - 2024.xlsx', search: 'paints manufacturing', total: 412 }];
  app = build({ dbFile: path.join(dir, 'test.db'), plan, similar });
  base = await app.listen({ port: 0, host: '127.0.0.1' });
});
after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
const spec = { job: 'paints-test', regions: ['MENA'], years: [2025, 2024, 2023], financials: [{ item: 'Operating revenue (Turnover)', min: 1 }], nace: ['2030'] };
const newJob = () => call('POST', '/api/jobs', { agent: 'catalyst', brief: 'manufacture of paints, MENA, FY 2025', spec, createdBy: 'tester' });

test('create a job: queued, defaults applied, listed', async () => {
  const { status, body } = await newJob();
  assert.equal(status, 201);
  assert.equal(body.status, 'queued');
  assert.deepEqual(body.spec.status, ['Active']);
  assert.equal(body.spec.closingDate, '31/12');
  const list = await call('GET', '/api/jobs?status=queued');
  assert.ok(list.body.items.some((j) => j.id === body.id));
});

test('bad requests are rejected with the error envelope', async () => {
  const noCodes = await call('POST', '/api/jobs', { agent: 'catalyst', brief: 'x y z', spec: { ...spec, nace: [] }, createdBy: 't' });
  assert.equal(noCodes.status, 422);
  assert.equal(noCodes.body.code, 'invalid_request');
  assert.ok(noCodes.body.requestId);
  assert.equal((await call('POST', '/api/jobs', { agent: 'unknown', brief: 'abc', spec, createdBy: 't' })).status, 422);
  assert.equal((await call('GET', '/api/jobs/does-not-exist')).status, 404);
});

test('runner flow: claim, steps stream live, finish; a second runner gets nothing', async () => {
  for (const j of (await call('GET', '/api/jobs?status=queued')).body.items) { // drain earlier jobs
    const c = await call('POST', '/api/runner/claim', { runner: 'drain', agent: 'catalyst' });
    await call('POST', `/api/runner/jobs/${c.body.id}/finish`, { status: 'failed', error: 'drained' });
  }
  const { body: job } = await newJob();
  const claimed = await call('POST', '/api/runner/claim', { runner: 'pc-1', agent: 'catalyst' });
  assert.equal(claimed.body.id, job.id);
  assert.equal(claimed.body.status, 'running');
  assert.equal((await call('POST', '/api/runner/claim', { runner: 'pc-2', agent: 'catalyst' })).status, 204);
  assert.equal((await call('POST', '/api/runner/claim', { runner: 'pc-3', agent: 'ace' })).status, 204);

  const events = [];
  const stream = await fetch(`${base}/api/jobs/${job.id}/events`);
  const reading = (async () => { for await (const chunk of stream.body) events.push(Buffer.from(chunk).toString()); })();
  for (const [i, kind] of ['regions', 'accountType', 'financial'].entries()) {
    const s = await call('POST', `/api/runner/jobs/${job.id}/steps`, { kind, text: `${i + 2}. ${kind}`, stepCount: '1,234' });
    assert.equal(s.body.seq, i + 1);
  }
  const done = await call('POST', `/api/runner/jobs/${job.id}/finish`, { status: 'done', total: 570, boolean: '1 and 2 and 3 and 4' });
  assert.equal(done.body.status, 'done');
  await reading;
  const text = events.join('');
  assert.equal((text.match(/event: step/g) ?? []).length, 3);
  assert.match(text, /event: end/);

  const stored = await call('GET', `/api/jobs/${job.id}`);
  assert.equal(stored.body.total, 570);
  assert.equal(stored.body.steps.length, 3);
  assert.equal((await call('POST', `/api/runner/jobs/${job.id}/steps`, { kind: 'x', text: 'late' })).status, 409);
});

test('runner heartbeat shows in the runner list', async () => {
  assert.equal((await call('POST', '/api/runner/heartbeat', { name: 'pc-1', agent: 'catalyst', state: 'logged_out' })).status, 204);
  const r = (await call('GET', '/api/runners')).body.items.find((x) => x.name === 'pc-1');
  assert.equal(r.state, 'logged_out');
  assert.equal(r.online, true);
});

test('plan: stages stream in order, then the result; a planner failure arrives as an error line', async () => {
  const lines = async (brief) => (await (await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief }) })).text())
    .trim().split('\n').map((l) => JSON.parse(l));
  const good = await lines('industry: paints; function: manufacturer; FY 2025');
  assert.deepEqual(good.slice(0, 3).map((l) => l.stage), ['examples', 'model', 'checking']);
  assert.equal(good[3].result.notes.plannedBy, 'stand-in');
  const bad = await lines('please explode the planner now');
  assert.deepEqual(bad, [{ error: 'model unavailable' }]);
  assert.equal((await call('POST', '/api/plan', { brief: 'short' })).status, 422);
});

test('a runner can hand a job back: it is queued again with no steps and can be claimed again', async () => {
  const { body: job } = await newJob();
  await call('POST', '/api/runner/claim', { runner: 'pc-1', agent: 'catalyst' });
  await call('POST', `/api/runner/jobs/${job.id}/steps`, { kind: 'analysis', text: 'half done' });
  assert.equal((await call('POST', `/api/runner/jobs/${job.id}/release`, {})).status, 204);
  const back = (await call('GET', `/api/jobs/${job.id}`)).body;
  assert.equal(back.status, 'queued');
  assert.equal(back.runner, null);
  assert.equal(back.steps.length, 0);
  assert.equal((await call('POST', '/api/runner/claim', { runner: 'pc-2', agent: 'catalyst' })).body.id, job.id);
  await call('POST', `/api/runner/jobs/${job.id}/finish`, { status: 'done', total: 570 });
});

test('similar: finished jobs and past export files that match the brief; unrelated briefs match no job', async () => {
  const hit = (await call('GET', `/api/similar?brief=${encodeURIComponent('manufacture of paints')}`)).body;
  assert.ok(hit.jobs.length >= 1 && hit.jobs.every((j) => j.status === 'done'));
  assert.equal(hit.pastFiles[0].total, 412);
  assert.equal((await call('GET', `/api/similar?brief=${encodeURIComponent('dairy farming cooperative')}`)).body.jobs.length, 0);
});

test('unknown API paths and wrong job states answer with the error envelope', async () => {
  const done = (await call('GET', '/api/jobs?status=done')).body.items[0];
  const late = await call('POST', `/api/runner/jobs/${done.id}/finish`, { status: 'done' });
  assert.equal(late.status, 409);
  assert.equal(late.body.code, 'not_running');
  assert.equal((await call('GET', '/api/jobs?limit=9999')).status, 422);
});

test('password: the website and API ask for it; health stays open; runner paths use the token instead', async () => {
  const guarded = build({ dbFile: path.join(dir, 'guarded.db'), plan: async () => ({}), similar: () => [], password: 'open-sesame-1', runnerToken: 'token-token-token-token-1' });
  const at = await guarded.listen({ port: 0, host: '127.0.0.1' });
  try {
    const basic = (p) => ({ authorization: 'Basic ' + Buffer.from('anyone:' + p).toString('base64') });
    const none = await fetch(at + '/api/jobs');
    assert.equal(none.status, 401);
    assert.match(none.headers.get('www-authenticate'), /^Basic/);
    assert.equal((await fetch(at + '/api/jobs', { headers: basic('wrong') })).status, 401);
    assert.equal((await fetch(at + '/api/jobs', { headers: basic('open-sesame-1') })).status, 200);
    assert.equal((await fetch(at + '/api/health')).status, 200);
    const beat = (headers) => fetch(at + '/api/runner/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ name: 'r', agent: 'catalyst', state: 'idle' }) });
    assert.equal((await beat(basic('open-sesame-1'))).status, 401);
    assert.ok((await beat({ authorization: 'Bearer token-token-token-token-1' })).status < 300);
  } finally { await guarded.close(); }
});

test('base path: the Studio answers under BASE_PATH, the password and token still guard it, the site page falls back', async () => {
  const web = fs.mkdtempSync(path.join(dir, 'web-'));
  fs.writeFileSync(path.join(web, 'index.html'), '<p>studio page</p>');
  const hosted = build({ dbFile: path.join(dir, 'hosted.db'), plan: async () => ({}), similar: () => [], webDir: web, basePath: '/benchmarkingStudio/', password: 'open-sesame-1', runnerToken: 'token-token-token-token-1' });
  const at = await hosted.listen({ port: 0, host: '127.0.0.1' });
  try {
    const basic = { authorization: 'Basic ' + Buffer.from('anyone:open-sesame-1').toString('base64') };
    assert.equal((await fetch(at + '/benchmarkingStudio/api/health')).status, 200);
    assert.equal((await fetch(at + '/benchmarkingStudio/api/jobs')).status, 401);
    const jobs = await fetch(at + '/benchmarkingStudio/api/jobs?limit=5', { headers: basic });
    assert.equal(jobs.status, 200);
    assert.deepEqual((await jobs.json()).items, []);
    for (const page of ['/benchmarkingStudio', '/benchmarkingStudio/', '/benchmarkingStudio/anything']) {
      const r = await fetch(at + page, { headers: basic });
      assert.equal(r.status, 200, page);
      assert.match(await r.text(), /studio page/, page);
    }
    assert.equal((await fetch(at + '/benchmarkingStudio/api/nothing', { headers: basic })).status, 404);
    const beat = (headers) => fetch(at + '/benchmarkingStudio/api/runner/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ name: 'r', agent: 'catalyst', state: 'idle' }) });
    assert.equal((await beat(basic)).status, 401);
    assert.ok((await beat({ authorization: 'Bearer token-token-token-token-1' })).status < 300);
    // a look-alike prefix is not the Studio's path
    assert.equal((await fetch(at + '/benchmarkingStudioX/api/health')).status, 401);
  } finally { await hosted.close(); }
});

test('exports on the runner: the Studio refuses export files with 410', async () => {
  const hosted = build({ dbFile: path.join(dir, 'runner-files.db'), plan: async () => ({}), similar: () => [], exportsOnRunner: true });
  const at = await hosted.listen({ port: 0, host: '127.0.0.1' });
  try {
    const post = (url, body, headers = { 'content-type': 'application/json' }) => fetch(at + url, { method: 'POST', headers, body });
    const job = await (await post('/api/jobs', JSON.stringify({ agent: 'catalyst', brief: 'manufacture of paints, MENA, FY 2025', spec, createdBy: 'tester' }))).json();
    await post('/api/runner/claim', JSON.stringify({ runner: 'r', agent: 'catalyst' }));
    await post(`/api/runner/jobs/${job.id}/finish`, JSON.stringify({ status: 'done', total: 12 }));
    await post(`/api/jobs/${job.id}/export`, JSON.stringify({ approvedBy: 'Approver', view: '2025', confirmCredits: true }));
    const claimed = await (await post('/api/runner/claim', JSON.stringify({ runner: 'r', agent: 'catalyst' }))).json();
    assert.equal(claimed.task, 'export');
    const up = await post(`/api/runner/jobs/${job.id}/file`, Buffer.from('xlsx'), { 'content-type': 'application/octet-stream', 'x-file-name': 'a.xlsx' });
    assert.equal(up.status, 410);
    assert.equal((await up.json()).code, 'exports_stay_on_runner');
    const done = await (await post(`/api/runner/jobs/${job.id}/export-finish`, JSON.stringify({ status: 'done' }))).json();
    assert.equal(done.export_state, 'done');
    assert.equal(done.export_file, null);
  } finally { await hosted.close(); }
});
