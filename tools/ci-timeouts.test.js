/* n7-05 / n7-06 (sweep 2026-09-25): every workflow job carries a timeout, The fresh-profile restore walk is a CI gate too. Without a timeout a hung browser step holds a runner - and the
   deploy that waits for CI - for GitHub's 6-hour default. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = (name) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8').replace(/\r\n/g, '\n');

/** Each job's text under `jobs:`, by id. */
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + 7);
  const out = {};
  let id = null;
  for (const line of body.split('\n')) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) { id = m[1]; out[id] = ''; continue; }
    if (/^\S/.test(line) && !line.startsWith('#')) break;
    if (id) out[id] += line + '\n';
  }
  return out;
}

describe('workflow job timeouts', () => {
  for (const [file, expected] of [['ci.yml', { build: 30, 'kotlin-tests': 20 }], ['deploy-web.yml', { gate: 5, build: 15, deploy: 10 }]]) {
    it(`${file}: every job has one`, () => {
      const js = jobs(wf(file));
      expect(Object.keys(js).sort()).toEqual(Object.keys(expected).sort());
      for (const [id, mins] of Object.entries(expected)) {
        expect(js[id], `${file} ${id}`).toMatch(new RegExp(`\\n {4}timeout-minutes: ${mins}\\b`));
      }
    });
  }
});

describe('the restore walk is a CI gate (n7-06)', () => {
  it('ci.yml runs npm run e2e:restore-fresh', () => {
    expect(wf('ci.yml')).toMatch(/\n {8}run: npm run e2e:restore-fresh\n/);
  });
});
