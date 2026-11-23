// End-to-end test of run.mjs against test/mock.html. Never touches TP Catalyst.
// Starts a throwaway Chrome, runs the mock flow, checks the evidence, then a failure case.
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalyst-runner-test-'));
const port = '9333';
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
  '--no-first-run', '--headless=new', pathToFileURL(path.join(root, 'test', 'mock.html')).href,
]);

const runFlow = (flowFile, out) => spawnSync(process.execPath,
  ['run.mjs', '--flow', flowFile, '--params', paramsFile, '--port', port, '--out', out],
  { cwd: root, input: '\n', encoding: 'utf8' });

const paramsFile = path.join(tmp, 'params.json');
fs.writeFileSync(paramsFile, JSON.stringify({
  job: 'TEST-001', operator: 'Test Operator', region: 'IN', keywords: ['pumps', 'valves', 'motors'],
}));

try {
  // wait for Chrome's debugging port
  for (let i = 0; ; i += 1) {
    try { (await chromium.connectOverCDP(`http://127.0.0.1:${port}`)).close(); break; }
    catch (err) { if (i > 40) throw err; await new Promise((r) => setTimeout(r, 250)); }
  }

  // 1. happy path
  const okOut = path.join(tmp, 'ok');
  const ok = runFlow('test/mock-flow.json', okOut);
  assert.equal(ok.status, 0, `runner failed:\n${ok.stdout}\n${ok.stderr}`);
  const okDir = path.join(okOut, fs.readdirSync(okOut)[0]);
  const log = JSON.parse(fs.readFileSync(path.join(okDir, 'run-log.json'), 'utf8'));
  assert.equal(log.status, 'ok');
  assert.equal(log.operator, 'Test Operator');
  assert.equal(log.steps.find((s) => s.action === 'count').count, 3234); // 3 keywords + independent
  const dl = log.steps.find((s) => s.action === 'download').download;
  assert.equal(dl.file, 'TEST-001-dump.csv');
  assert.equal(fs.readFileSync(path.join(okDir, dl.file), 'utf8'), 'region,keywords\nIN,pumps|valves|motors\n');
  assert.match(dl.sha256, /^[0-9a-f]{64}$/);
  assert.ok(log.steps.filter((s) => s.screenshot).every((s) => fs.existsSync(path.join(okDir, s.screenshot))));
  console.log(`PASS happy path: ${log.steps.length} steps, count ${3234}, download ${dl.bytes} bytes`);

  // 2. a missing element must fail loudly and still leave a log
  const badFlow = path.join(tmp, 'bad-flow.json');
  fs.writeFileSync(badFlow, JSON.stringify({ urlMatch: 'mock.html', timeoutMs: 1500,
    steps: [{ name: 'Missing button', action: 'click', selector: '#nope' }] }));
  const badOut = path.join(tmp, 'bad');
  const bad = runFlow(badFlow, badOut);
  assert.equal(bad.status, 1);
  const badLog = JSON.parse(fs.readFileSync(path.join(badOut, fs.readdirSync(badOut)[0], 'run-log.json'), 'utf8'));
  assert.equal(badLog.status, 'failed');
  assert.equal(badLog.steps[0].status, 'failed');
  console.log('PASS failure path: exit 1, log marked failed');

  // 3. a flow that names a param the job file lacks must fail
  const noParam = path.join(tmp, 'noparam-flow.json');
  fs.writeFileSync(noParam, JSON.stringify({ urlMatch: 'mock.html',
    steps: [{ name: 'x', action: 'fill', selector: '#kw', value: '{{missing}}' }] }));
  const np = runFlow(noParam, path.join(tmp, 'np'));
  assert.equal(np.status, 1);
  assert.match(np.stderr, /no "missing"/);
  console.log('PASS missing-param path');
} finally {
  chrome.kill();
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
}
