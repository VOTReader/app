/**
 * Gate wiring (c43, read-along-3): a gate that exists but is run by nothing is
 * a gate that lies. tools/validate-bible-sync.py was written for c42 and
 * committed with it, yet neither the pre-commit hook nor CI ever called it —
 * the Bible verse timings (src/data/bible-sync-*.js) shipped with no check of
 * any kind. This pins the wiring so it cannot silently drop out again.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

  it('CI runs it against the committed audio facts, not merely --structural', () => {
    // --structural was passed here deliberately for a real reason -- the belts
    // and the mp3s are outside the repo -- and the cost was that NO landing gate
    // ever checked a shipped timing against its audio. tools/audio-facts.json
    // closes that leg, so CI must run the mode that reads it; pinning the flag
    // is the only thing that stops a future edit quietly reverting to the
    // weaker mode, which would look identical in a green log.
    expect(ci).toMatch(/python tools\/validate-bible-sync\.py --audio-facts/);
    expect(ci).not.toMatch(/validate-bible-sync\.py --structural/);
  });

  it('the sidecar CI depends on is committed, and its generator with it', () => {
    // A gate wired to a file that is not in the repo is red on every clone, and
    // a generator that is not committed makes the file unregenerable -- which is
    // how an artifact becomes something nobody dares touch.
    expect(existsSync(resolve(ROOT, 'tools', 'audio-facts.json'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'tools', 'build-audio-facts.py'))).toBe(true);
  });

  it('the unittest list names the sidecar test (it is hand-maintained)', () => {
    // A python test not named on this line is run by nothing in CI.
    expect(ci).toMatch(/python -m unittest[^\n]*\btest_audio_facts\b/);
  });

  it('the hook offers the case-only restamp, never a hand edit of the generated file', () => {
    expect(hook).toMatch(/restamp-bible-belts\.py/);
    expect(hook).toMatch(/NEVER hand-edit src\/data\/bible-sync-\*\.js/);
  });
});
