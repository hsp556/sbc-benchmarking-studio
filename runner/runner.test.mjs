// Runner tests with a stand-in search script and a stand-in Chrome: node --test --test-timeout=60000 runner/runner.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../studio/api/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
let app, base, chrome, runner, prowessRunner, tabUrl = 'https://tpcatalyst-r1.bvdinfo.com/202610-1/tpcatalyst/1/Companies';
const share = path.join(dir, 'sharepoint'); // stands in for the synced SharePoint folder
fs.mkdirSync(share);
const spec = (job) => ({ job, regions: ['MENA'], years: [2025], financials: [], nace: ['2030'] });
const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const get = async (url) => (await fetch(base + url)).json();
const newJob = (name) => post('/api/jobs', { agent: 'catalyst', brief: `test ${name}`, spec: spec(name), createdBy: 'tester' });
const until = async (check, what, ms = 25000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) { const v = await check(); if (v) return v; }
  assert.fail(`timed out waiting for ${what}`);
};

before(async () => {
  process.env.LOG_LEVEL = 'silent';
  app = build({ dbFile: path.join(dir, 'test.db'), runnerToken: 'test-token-test-token-test' });
  base = await app.listen({ port: 0, host: '127.0.0.1' });
  chrome = http.createServer((req, res) => res.end(JSON.stringify([{ type: 'page', url: tabUrl }, { type: 'page', url: 'https://prowess.cmie.com/' }]))).listen(0, '127.0.0.1');
  await new Promise((r) => chrome.once('listening', r));
});
after(async () => { runner?.kill(); prowessRunner?.kill(); chrome.close(); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('runner: runs a job and reports steps; reports a zero-count stop and a script crash as failures', async () => {
  assert.equal((await fetch(`${base}/api/runner/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runner: 'stranger', agent: 'catalyst' }) })).status, 401); // no token
  const good = await newJob('good'), zero = await newJob('zero'), crash = await newJob('crash');
  runner = spawn(process.execPath, [path.join(here, 'runner.mjs')], {
    env: { ...process.env, STUDIO_URL: base, CHROME_PORT: String(chrome.address().port), SEARCH_SCRIPT: path.join(here, 'fake-search.mjs'), RUNNER_NAME: 'test-runner', RUNNER_TOKEN: 'test-token-test-token-test', SHAREPOINT_DIR: share },
  });
  const done = await until(async () => { const j = await get(`/api/jobs/${good.id}`); return j.status === 'done' && j; }, 'the good job');
  assert.equal(done.total, 123);
  assert.deepEqual(done.steps.map((s) => s.kind), ['analysis', 'regions', 'financial']);
  assert.equal(done.runner, 'test-runner');
  const z = await until(async () => { const j = await get(`/api/jobs/${zero.id}`); return j.status === 'failed' && j; }, 'the zero-count job');
  assert.match(z.error, /matched 0 companies/);
  assert.equal(z.steps.length, 1);
  const c = await until(async () => { const j = await get(`/api/jobs/${crash.id}`); return j.status === 'failed' && j; }, 'the crashed job');
  assert.match(c.error, /something broke/);
});

test('runner: a logged-out job goes back to the queue; with the tab on the login page nothing is claimed', async () => {
  const job = await newJob('logout');
  await until(async () => (await get('/api/runners')).items.some((r) => r.state === 'logged_out'), 'the runner to report logged out');
  const back = await get(`/api/jobs/${job.id}`);
  assert.equal(back.status, 'queued');
  assert.equal(back.steps.length, 0);
  tabUrl = 'https://login.bvdinfo.com/R1/TPCatalyst';
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await get(`/api/jobs/${job.id}`)).status, 'queued');
});

test('export: refused without approval or for an unfinished search; after approval the runner exports and uploads the file', async () => {
  tabUrl = 'https://tpcatalyst-r1.bvdinfo.com/202610-1/tpcatalyst/1/Companies';
  const done = (await get('/api/jobs?status=done')).items[0];
  const approve = (id, body) => fetch(`${base}/api/jobs/${id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await approve(done.id, { approvedBy: 'Approver', view: '2025' })).status, 422); // credits not confirmed
  const queued = (await get('/api/jobs?status=queued')).items[0];
  assert.equal((await approve(queued.id, { approvedBy: 'Approver', view: '2025', confirmCredits: true })).status, 409);
  assert.equal((await fetch(`${base}/api/jobs/${done.id}/file`)).status, 404);

  assert.equal((await approve(done.id, { approvedBy: 'Approver', view: '2025', confirmCredits: true })).status, 200);
  assert.equal((await approve(done.id, { approvedBy: 'Approver', view: '2025', confirmCredits: true })).status, 409); // already approved
  const j = await until(async () => { const x = await get(`/api/jobs/${done.id}`); return x.export_state === 'done' && x; }, 'the export', 45000);
  assert.equal(j.approved_by, 'Approver');
  assert.equal(j.credits_before, 800);
  assert.equal(j.credits_after, 799);
  assert.match(j.export_file, /\.xlsx$/);
  assert.equal(j.status, 'done'); // the search result itself is untouched
  assert.equal(j.steps.at(-1).kind, 'export');
  const file = await fetch(`${base}/api/jobs/${done.id}/file`);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'stand-in workbook');
  // a copy went to the SharePoint folder, and the job says where
  assert.equal(path.dirname(j.shared_path), share);
  assert.equal(fs.readFileSync(j.shared_path, 'utf8'), 'stand-in workbook');
  assert.equal(j.shared_error, null);

  // a second export of the same search keeps the first file; a missing folder is reported and the export still succeeds
  assert.equal((await approve(done.id, { approvedBy: 'Approver', view: '2025', confirmCredits: true })).status, 200);
  const again = await until(async () => { const x = await get(`/api/jobs/${done.id}`); return x.export_state === 'done' && x.shared_path !== j.shared_path && x; }, 'the second export', 45000);
  assert.equal(fs.readdirSync(share).length, 2);
  fs.rmSync(share, { recursive: true });
  assert.equal((await approve(done.id, { approvedBy: 'Approver', view: '2025', confirmCredits: true })).status, 200);
  const lost = await until(async () => { const x = await get(`/api/jobs/${done.id}`); return x.export_state === 'done' && x.shared_error && x; }, 'the export without the folder', 45000);
  assert.match(lost.shared_error, /Not saved to SharePoint.*does not exist/);
  assert.equal(lost.shared_path, null);
  assert.ok(again.shared_path);
});

test('prowess: needs the hits confirmation; one task runs the whole search and copies both files to the shared folder', async () => {
  const share2 = path.join(dir, 'taiga-pickup');
  fs.mkdirSync(share2);
  const body = { agent: 'prowess', brief: 'test prowess', createdBy: 'tester', spec: { job: 'software', groups: ['Software services'], fromYear: 2022, toYear: 2024, rptYear: 2023 } };
  const create = (b) => fetch(`${base}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await create(body)).status, 422); // hits not confirmed
  assert.equal((await create({ ...body, confirmHits: true, spec: { ...body.spec, rptYear: 2019 } })).status, 422); // year outside the range
  const job = await (await create({ ...body, confirmHits: true })).json();
  assert.equal(job.status, 'queued');
  prowessRunner = spawn(process.execPath, [path.join(here, 'runner.mjs')], {
    env: { ...process.env, STUDIO_URL: base, CHROME_PORT: String(chrome.address().port), SEARCH_SCRIPT: path.join(here, 'fake-search.mjs'), RUNNER_AGENT: 'prowess', RUNNER_NAME: 'test-prowess', RUNNER_TOKEN: 'test-token-test-token-test', SHAREPOINT_DIR: share2 },
  });
  const done = await until(async () => { const j = await get(`/api/jobs/${job.id}`); return j.status === 'done' && j; }, 'the prowess job');
  assert.equal(done.total, 1838);
  assert.equal(done.runner, 'test-prowess');
  assert.deepEqual(done.steps.map((s) => s.kind), ['industry', 'files']);
  assert.deepEqual(fs.readdirSync(share2).sort(), [`${job.id} - companies.csv`, `${job.id} - related parties.csv`]);
  assert.equal(done.shared_path.split(' | ').length, 2);
  assert.equal(done.shared_error, null);
  // a Prowess job has no separate export step
  assert.equal((await fetch(`${base}/api/jobs/${job.id}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvedBy: 'Approver', view: '2025', confirmCredits: true }) })).status, 409);
});
