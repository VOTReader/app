/* check-audio-manifest — the unmapped bucket must justify itself.
   ─────────────────────────────────────────────────────────────────────────
   The gate proves nothing the generator MAPPED quietly fails to reach the
   app, by balancing the books per reader:

     rows in letters + range compilations + unmapped  ==  letter-side files

   `unmapped` is the only free variable in that identity, and the Verifier
   showed on 2026-09-04 that naming the ids does not pin it. Their complete
   forgery: pick a reader whose CANDIDATE count equals the rows it ships,
   delete it from the manifest AND the coverage file, and move its ids into
   the unmapped bucket. Every check passed — because a stolen id IS a real
   listing record, and once deleted from the manifest it reaches no rendition
   either. That is exactly what an unmapped file looks like.

   So each unmapped file now states WHY, and the gate holds the reason to
   evidence a forger cannot mint:
     'bonus'       the name says "Bonus Track"; the corpus has no letter for
                   one. A stolen letter recording carries an ordinal instead.
     'unresolved'  the resolver could not place it — pinned by id, because a
                   recording no listener can reach should stop the line.

   HOW: the gate resolves ROOT from its own import.meta.url and exports no
   functions, so each case builds a small temp mirror of the repo layout and
   runs it as a child process, the way pre-commit does. Deliberately WITHOUT
   tools/_audio-drive-listing.json: the listing is gitignored, so CI only
   ever gets this half of the gate, and this half has to hold alone.

   Two positive controls (an honest tree, and a genuine bonus track) prove
   the harness drives the real gate, so the RED cases cannot pass vacuously. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-audio-manifest.js');
const LIB = resolve(HERE, 'audio-renditions-lib.mjs');

/* File-scoped, and sized from measurement — same reasoning as
   check-apk-assets.test.js, which has the identical shape: mkdtemp a repo
   mirror, write files, spawn a node process. Alone this file runs its seven
   cases in 1.04 s (~150 ms each). Inside the full 244-file suite the first
   case blew past the 5 s default on a 24-core machine, which is load, not a
   hang — the third independent sighting of that shape.

   The disk work and the child process are the point: driving the gate any
   other way would stop testing what pre-commit and CI actually run. So the
   work stays and the ceiling moves.

   Do NOT raise testTimeout globally: every pure suite here should keep
   failing at 5 s. */
const SPAWN_TIMEOUT_MS = 30_000;

const ID = (n) => `1${String(n).padStart(4, '0')}abcdefghijklmnopqrstuvw`;   // 25+ chars, Drive-shaped
const V_NAME = 'V3.009_A Letter (read by text-to-speech).mp3';
const T_NAME = 'V3.010_Another Letter (read by Timothy).mp3';
const BONUS_NAME = 'V4.Bonus Track_Poured Out (read by Timothy).mp3';

/**
 * An honest little corpus: one letter read by V (primary) and T (alternate),
 * plus one file of each reader that never mapped.
 *   listing = letters + unmapped, per reader, so the books balance.
 */
function honest() {
  return {
    manifest: {
      AUDIO_MANIFEST: { 'three:a-letter': [[ID(1), 'V']] },
      AUDIO_ALTERNATES: { 'three:a-letter': [['T', [[ID(2)]]]] },
      AUDIO_SECTIONS: {},
    },
    coverage: {
      letters: { 'three:a-letter': { readers: { V: 1, T: 1 }, slots: 1 } },
      totals: { listing: { V: 2, T: 2 }, unmapped: { V: 1, T: 1 }, compilations: {} },
      unmappedFiles: [
        { id: ID(3), name: BONUS_NAME, why: 'bonus' },
        { id: ID(4), name: 'V5.Bonus Track_Amplified (read by text-to-speech).mp3', why: 'bonus' },
      ],
      collapsedByHash: [],
    },
  };
}

/**
 * The Verifier's theft: T's whole rendition of the letter disappears from both
 * files and its id is re-labelled unmapped. The books still balance.
 * @param {'bonus'|'unresolved'|string} why  the excuse written for the stolen id
 */
function stolen(why) {
  const t = honest();
  delete t.manifest.AUDIO_ALTERNATES['three:a-letter'];
  delete t.coverage.letters['three:a-letter'].readers.T;
  t.coverage.totals.unmapped.T += 1;
  t.coverage.unmappedFiles.push({ id: ID(2), name: T_NAME, why });
  return t;
}

const dirs = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

/** Write a tree and run the real gate in it. */
function runGate({ manifest, coverage }) {
  const root = mkdtempSync(join(tmpdir(), 'vot-audio-gate-'));
  dirs.push(root);
  mkdirSync(join(root, 'tools'), { recursive: true });
  mkdirSync(join(root, 'app', 'src', 'main', 'assets', 'src', 'data'), { recursive: true });
  copyFileSync(GATE, join(root, 'tools', 'check-audio-manifest.js'));
  copyFileSync(LIB, join(root, 'tools', 'audio-renditions-lib.mjs'));
  writeFileSync(join(root, 'tools', 'audio-manifest-coverage.json'), JSON.stringify(coverage, null, 1));
  writeFileSync(join(root, 'app', 'src', 'main', 'assets', 'src', 'data', 'audio-manifest.js'),
    Object.entries(manifest).map(([k, v]) => `var ${k} = ${JSON.stringify(v)};`).join('\n') + '\n');
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-audio-manifest.js')], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

describe('check-audio-manifest: the unmapped bucket', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('passes on an honest tree, with the books balanced (positive control)', () => {
    const r = runGate(honest());
    expect(r.out).toMatch(/every reader the coverage file records is offered/);
    expect(r.code).toBe(0);
  });

  it('refuses the theft the Verifier forged: a mapped reading re-labelled unmapped', () => {
    const r = runGate(stolen('unresolved'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/reaches no listener and is not a known unresolved recording/);
    expect(r.out).toContain(T_NAME);
  });

  it('refuses the same theft excused as a bonus track', () => {
    const r = runGate(stolen('bonus'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/is dropped as a "bonus" track but its name is not a bonus track/);
  });

  it('accepts a real bonus track, so the refusal above is about the NAME (positive control)', () => {
    // Same shape as the theft, but the file genuinely is a bonus track: it was
    // never a candidate for any letter, so no rendition goes missing with it.
    const t = honest();
    t.coverage.totals.listing.T += 1;
    t.coverage.totals.unmapped.T += 1;
    t.coverage.unmappedFiles.push({ id: ID(5), name: 'V7.Bonus Track_My Anger Runs Deep (read by Timothy).mp3', why: 'bonus' });
    const r = runGate(t);
    expect(r.out).toMatch(/every reader the coverage file records is offered/);
    expect(r.code).toBe(0);
  });

  it('refuses a reason it cannot check', () => {
    const r = runGate(stolen('duplicate-upload'));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/carries an unknown reason "duplicate-upload"/);
  });

  it('refuses a coverage file written before reasons existed, rather than skipping the check', () => {
    const t = stolen('unresolved');
    delete t.coverage.unmappedFiles;              // the pre-2026-09-04 sidecar
    t.coverage.totals.unmappedIds = [ID(2)];      // ...which named ids and nothing more
    const r = runGate(t);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/has no `unmappedFiles`/);
  });

  it('still refuses the theft when the unmapped count is left unbalanced', () => {
    // The blunt forgery: move the reading out of the manifest but forget the
    // arithmetic. 2b catches this one; 2c must not be the only thing standing.
    const t = honest();
    delete t.manifest.AUDIO_ALTERNATES['three:a-letter'];
    delete t.coverage.letters['three:a-letter'].readers.T;
    const r = runGate(t);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/reader T: 0 in letters \+ 1 unmapped \+ 0 compilations = 1, but the listing holds 2/);
  });
});
