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
