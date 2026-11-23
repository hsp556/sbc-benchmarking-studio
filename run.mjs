// Deterministic flow runner. Attaches to a visible Chrome the operator has logged in to,
// replays the steps in a flow file with values from a params file, and writes evidence
// (screenshots, counts, downloads with SHA-256, run log) to a run folder.
// Nothing here calls an AI service and nothing leaves this machine.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

function parseArgs(argv) {
  const args = { port: '9222', out: 'runs' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['flow', 'params', 'port', 'out'].includes(key) || argv[i + 1] === undefined) {
      throw new Error('Usage: node run.mjs --flow <flow.json> --params <params.json> [--port 9222] [--out runs]');
    }
    args[key] = argv[i + 1];
  }
  if (!args.flow || !args.params) throw new Error('Both --flow and --params are required.');
  return args;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Replaces {{name}} with a value from params (or the current forEach item). Unknown names are an error.
function fill(text, scope) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in scope)) throw new Error(`Flow uses {{${name}}} but params has no "${name}".`);
    return String(scope[name]);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const flow = JSON.parse(fs.readFileSync(args.flow, 'utf8'));
  const params = JSON.parse(fs.readFileSync(args.params, 'utf8'));
  for (const required of ['job', 'operator']) {
    if (!params[required]) throw new Error(`params must include "${required}".`);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const runDir = path.resolve(args.out, `${String(params.job).replace(/[^\w.-]+/g, '_')}-${stamp}`);
  fs.mkdirSync(runDir, { recursive: true });

  const log = {
    job: params.job,
    operator: params.operator,
    flow: { file: path.resolve(args.flow), sha256: sha256(args.flow) },
    params,
    started: new Date().toISOString(),
    finished: null,
    status: 'running',
    steps: [],
  };
  const saveLog = () => fs.writeFileSync(path.join(runDir, 'run-log.json'), JSON.stringify(log, null, 2));
  saveLog();

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${args.port}`).catch(() => {
    throw new Error(`No Chrome on debugging port ${args.port}. Start it with start-chrome.ps1 and log in first.`);
  });
  const pages = browser.contexts().flatMap((c) => c.pages());
  const page = pages.find((p) => p.url().includes(flow.urlMatch));
  if (!page) {
    throw new Error(`No open tab whose address contains "${flow.urlMatch}". Open the site and log in, then rerun.`);
  }
  await page.bringToFront();
  const timeout = flow.timeoutMs ?? 30000;
  let n = 0;

  async function runStep(step, scope) {
    n += 1;
    const id = String(n).padStart(3, '0');
    const name = fill(step.name, scope);
    const entry = { id, name, action: step.action, started: new Date().toISOString(), status: 'running' };
    log.steps.push(entry);
    const opts = { timeout: step.timeoutMs ?? timeout };
    const selector = fill(step.selector, scope);
    const value = fill(step.value, scope);
    console.log(`[${id}] ${step.action}: ${name}`);

    try {
      switch (step.action) {
        case 'goto': await page.goto(fill(step.url, scope), opts); break;
        case 'click': await page.click(selector, opts); break;
        case 'fill': await page.fill(selector, value, opts); break;
        case 'press': await page.press(selector, step.key, opts); break;
        case 'select': await page.selectOption(selector, value, opts); break;
        case 'check': await page.check(selector, opts); break;
        case 'waitFor': await page.waitForSelector(selector, { ...opts, state: step.state ?? 'visible' }); break;
        case 'count': {
          const text = (await page.innerText(selector, opts)).trim();
          const digits = text.replace(/[^\d]/g, '');
          if (!digits) throw new Error(`Count element "${selector}" has no number in it: "${text}"`);
          entry.countText = text;
          entry.count = Number(digits);
          break;
        }
        case 'download': {
          const [download] = await Promise.all([page.waitForEvent('download', opts), page.click(selector, opts)]);
          const failure = await download.failure();
          if (failure) throw new Error(`Download failed: ${failure}`);
          const fileName = step.saveAs ? fill(step.saveAs, scope) : download.suggestedFilename();
          const target = path.join(runDir, path.basename(fileName));
          await download.saveAs(target);
          entry.download = { file: path.basename(target), bytes: fs.statSync(target).size, sha256: sha256(target) };
          break;
        }
        case 'pause': {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          await rl.question(`    ${fill(step.message, scope)}\n    Press Enter to continue... `);
          rl.close();
          break;
        }
        case 'forEach': {
          const items = params[step.param];
          if (!Array.isArray(items)) throw new Error(`forEach needs params.${step.param} to be a list.`);
          entry.items = items.length;
          for (const item of items) {
            for (const child of step.steps) await runStep(child, { ...scope, item });
          }
          break;
        }
        default: throw new Error(`Unknown action "${step.action}".`);
      }
      entry.status = 'ok';
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message;
      throw err;
    } finally {
      if (step.action !== 'forEach' && step.screenshot !== false) {
        const shot = `${id}-${name.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`;
        await page.screenshot({ path: path.join(runDir, shot) }).then(() => { entry.screenshot = shot; }, () => {});
      }
      entry.finished = new Date().toISOString();
      saveLog();
    }
  }

  try {
    for (const step of flow.steps) await runStep(step, params);
    log.status = 'ok';
  } catch (err) {
    log.status = 'failed';
    log.error = err.message;
    throw err;
  } finally {
    log.finished = new Date().toISOString();
    saveLog();
    console.log(`Run folder: ${runDir}`);
    await browser.close(); // detaches from the operator's Chrome; does not close it
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
