// Loads API keys from the environment or from local.env in the project folder.
// Keys are never printed or written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromFile = (re) => {
  const file = path.join(root, 'local.env');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(re)?.[1] ?? null : null;
};

// Gemini: GEMINI_API_KEY, else the line "gemini=<key>". Null when absent.
export function geminiKey() {
  return process.env.GEMINI_API_KEY?.trim() || fromFile(/^\s*gemini(?:_api_key)?\s*[=:]\s*(\S+)/im);
}

// Anthropic: ANTHROPIC_API_KEY, else the line "ANTHROPIC_API_KEY=<key>" or "anthropic=<key>".
// Only a value that looks like an Anthropic key counts (that line once held another provider's key).
export function anthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || fromFile(/^\s*anthropic(?:_api_key)?\s*[=:]\s*(\S+)/im);
  return key?.startsWith('sk-ant-') ? key : null;
}
