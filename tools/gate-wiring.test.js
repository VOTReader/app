/**
 * Gate wiring (c43, read-along-3): a gate that exists but is run by nothing is
 * a gate that lies. tools/validate-bible-sync.py was written for c42 and
 * committed with it, yet neither the pre-commit hook nor CI ever called it —
 * the Bible verse timings (src/data/bible-sync-*.js) shipped with no check of
 * any kind. This pins the wiring so it cannot silently drop out again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(resolve(ROOT, '.githooks', 'pre-commit'), 'utf-8');
const ci = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');

describe('tools/validate-bible-sync.py is wired into the gates', () => {
  it('pre-commit runs it in FULL mode when a Bible timings file, a Bible translation, or the pipeline is staged', () => {
    expect(hook).toMatch(/tools\/validate-bible-sync\.py/);
    const step = hook.slice(hook.indexOf('Step 1b3'));
    expect(step).toMatch(/bible-\(sync-\[a-z-\]\+\|kjv/);          // timings + translations trigger it
    expect(step).toMatch(/validate-bible-sync\|batch-align-bible/); // so does the pipeline it reads
    expect(step).not.toMatch(/validate-bible-sync\.py --structural/); // the aligning machine runs the full proof
  });

  it('CI runs it in --structural mode (no belts, no audio on the runner)', () => {
    expect(ci).toMatch(/python tools\/validate-bible-sync\.py --structural/);
  });

  it('the hook offers the case-only restamp, never a hand edit of the generated file', () => {
    expect(hook).toMatch(/restamp-bible-belts\.py/);
    expect(hook).toMatch(/NEVER hand-edit src\/data\/bible-sync-\*\.js/);
  });
});

/* v12-06 (improvement sweep 2026-09-22): CI's `python-version: '3.x'` floated to 3.14 while
   requirements-dev.txt is measured on 3.13, pip re-downloaded everything on every run, and the
   data gate without esprima only warned. Every place that runs the gate pins 3.13 and runs it
   --strict, so a runner that lost esprima fails instead of passing on the brace count. CI
   installs requirements-dev.txt on every run, so it caches pip; the deploy installs it only on
   its manual path, where a cache would have nothing to save. The hook's own interpreter is
   proven by running it (pre-commit-wiring). */
const deploy = readFileSync(resolve(ROOT, '.github', 'workflows', 'deploy-web.yml'), 'utf-8');
const setupPython = (wf) => {
  const at = wf.indexOf('actions/setup-python');
  expect(at).toBeGreaterThan(-1);
  return wf.slice(at, at + 400);
};
describe('the data gate runs strict on the pinned Python 3.13 (v12-06)', () => {
  it('ci.yml caches pip, keyed on requirements-dev.txt', () => {
    expect(setupPython(ci)).toMatch(/cache:\s*'pip'/);
    expect(setupPython(ci)).toMatch(/cache-dependency-path:\s*requirements-dev\.txt/);
  });

  for (const [name, wf] of [['ci.yml', ci], ['deploy-web.yml', deploy]]) {
    it(`${name} sets up Python 3.13`, () => {
      expect(setupPython(wf)).toMatch(/python-version:\s*'3\.13'/);
    });

    it(`${name} runs check_balance.py --strict`, () => {
      expect(wf).toMatch(/python check_balance\.py --strict/);
      expect(wf).not.toMatch(/python check_balance\.py(?! --strict)/);
    });
  }

  it('the hook runs check_balance.py --strict', () => {
    const calls = hook.split('\n').filter((l) => /check_balance\.py/.test(l) && !/^\s*(#|echo\b)/.test(l));
    expect(calls.length).toBeGreaterThan(0);
    for (const l of calls) expect(l.trim()).toMatch(/check_balance\.py --strict/);
  });
});
