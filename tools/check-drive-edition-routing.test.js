/* check-drive-edition-routing — a gate that cannot form its question must not answer it.
   ─────────────────────────────────────────────────────────────────────────────
   The gate proves every drive-sourced Bible edition routes to its DECLARED
   releaseTag. Its exit codes are a contract the CI step reads out loud:

     0  every drive edition routes correctly (or there are none)
     1  a drive edition exists whose assets would 404
     2  the check could not run

   The original refused to PASS on an unevaluable tree — two `exit 2` paths guard
   the manifest — and did not refuse to ACCUSE one. That is the expensive
   direction: an exit 1 is reported as a real routing defect against a tree the
   gate never measured, and the next reader hunts a 404 that does not exist
   (drive-routing-crash-1, found by the Verifier in the c48 landing).

   Two shapes reached it, and only one of them throws:

     books undefined  `e.books[0]` throws, node exits 1, and the step says
                      "a drive edition exists whose assets would 404".
     books: 'all'     does NOT throw. The string indexes to 'a', the key becomes
                      `<volKey>:a`, no rows are found, and the gate accuses the
                      MANIFEST of being unregenerated. Nothing ships this today —
                      gen-bible-audio-manifest.mjs hard-errors on it — which is
                      exactly why a test has to carry the case instead.

   A missing volKey is the same family with no throw either: the key becomes the
   literal "undefined:<book>".

   HOW: the gate resolves its paths from its own import.meta.url and exports
   nothing, so each case copies it VERBATIM into a temp mirror of the repo layout
   and runs it as a child process — the way the landing path runs it. Three
   positive controls prove the harness drives the real gate (a clean tree passes
   and reports its count, a bad releaseTag still exits 1, an unevaluable manifest
   still exits 2), so the RED cases cannot pass vacuously: an exit 2 from a
   harness that never reached the loop would look identical to the fix working. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, 'check-drive-edition-routing.mjs');
const TRACK = resolve(HERE, '../app/src/main/assets/src/utils/audio-track.js');
const MANIFEST = resolve(HERE, '../app/src/main/assets/src/data/bible-audio-manifest.js');

/**
 * Why this file needs its own timeout, and why it is not a global bump.
 *
 * Every case mkdtemps a repo mirror, writes the real gate and the real
 * audio-track.js into it, then spawnSyncs a fresh node process and waits. The
 * gate resolves ROOT from import.meta.url and exports nothing, so driving it any
 * other way would stop testing what the landing path runs. Same shape and same
 * measurement as tools/check-apk-assets.test.js, which has been seen past the
 * 5 s default under a full suite twice on different branches — load, not a hang.
 * 30 s is far above the idle worst case and still fails fast on a real hang.
 *
 * Do NOT raise testTimeout globally: every pure suite here should keep failing
 * at 5 s.
 */
const SPAWN_TIMEOUT_MS = 30_000;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

const REAL_TRACK = readFileSync(TRACK, 'utf8');
const REAL_MANIFEST = readFileSync(MANIFEST, 'utf8');

/** The shipped drive edition, as the registry declares it today. */
const TSOT = `  'tsot-matthew': Object.freeze({`;

/**
 * A throwaway repo mirror. `track` and `manifest` default to the real files, so
 * a case names only what it perturbs and the rest is the shipped truth.
 */
function mirror({ track = REAL_TRACK, manifest = REAL_MANIFEST } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-drive-routing-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  mkdirSync(join(root, 'tools'), { recursive: true });
  copyFileSync(GATE, join(root, 'tools', 'check-drive-edition-routing.mjs'));
  const src = join(root, 'app', 'src', 'main', 'assets', 'src');
  mkdirSync(join(src, 'utils'), { recursive: true });
  mkdirSync(join(src, 'data'), { recursive: true });
  writeFileSync(join(src, 'utils', 'audio-track.js'), track);
  writeFileSync(join(src, 'data', 'bible-audio-manifest.js'), manifest);
  return root;
}

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-drive-edition-routing.mjs')],
                      { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '',
           all: (r.stdout || '') + (r.stderr || '') };
}

/**
 * Replace one field of the tsot-matthew entry. Asserts the substitution ACTUALLY
 * APPLIED: a fixture builder that silently misses produces a tree identical to
 * the pristine one, and the arm then passes for the wrong reason — indistinguishable
 * from the fix working.
 */
function withField(field, replacement) {
  const i = REAL_TRACK.indexOf(TSOT);
  expect(i, 'the tsot-matthew entry moved; this fixture is dead, not the test').toBeGreaterThan(-1);
  const re = new RegExp(`(${TSOT.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')}[\\s\\S]*?)^\\s*${field}:[^\\n]*\\n`, 'm');
  expect(re.test(REAL_TRACK), `no \`${field}:\` line inside tsot-matthew; the fixture is dead`).toBe(true);
  const out = REAL_TRACK.replace(re, (_m, head) => head + replacement);
  expect(out, `the ${field} substitution did not change the file`).not.toBe(REAL_TRACK);
  return out;
}

describe('check-drive-edition-routing — the harness drives the real gate (positive controls)',
         { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('PASSES the shipped tree and reports the count it checked', () => {
    const r = runGate(mirror());
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/\[drive-routing\] OK — \d+ asset\(s\) across \d+ drive edition\(s\)/);
    expect(r.stdout).not.toMatch(/OK — 0 asset\(s\)/);   // a zero-asset pass is vacuous
  });

  it('still exits 1 for the routing failure it exists to catch (a tag outside RELEASE_PREFIXES)', () => {
    const track = withField('releaseTag',
      "    releaseTag: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v9/',\n");
    const r = runGate(mirror({ track }));
    expect(r.status, r.all).toBe(1);
    expect(r.stderr).toMatch(/releaseTag that is not one of/);
  });

  it('still exits 2 when the manifest cannot be evaluated', () => {
    const r = runGate(mirror({ manifest: 'var BIBLE_AUDIO_MANIFEST = {' }));
    expect(r.status, r.all).toBe(2);
    expect(r.stderr).toMatch(/INSTRUMENT DEAD/);
  });
});

describe('check-drive-edition-routing — refuses to ACCUSE a tree it could not evaluate',
         { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('exits 2, not 1, when a drive edition declares no books at all (the crash path)', () => {
    const track = withField('books', '');
    const r = runGate(mirror({ track }));
    expect(r.status, 'a missing `books` was reported as a routing 404:\n' + r.all).toBe(2);
    expect(r.stderr).toMatch(/INSTRUMENT DEAD/);
    expect(r.stderr).toMatch(/cannot be keyed/);
    expect(r.stderr, 'the gate named a routing failure it never measured').not.toMatch(/would 404/);
  });

  it("exits 2, not 1, when a drive edition declares books: 'all' (indexes the string, no throw)", () => {
    const track = withField('books', "    books: 'all',\n");
    const r = runGate(mirror({ track }));
    expect(r.status, "books: 'all' was reported as an unregenerated manifest:\n" + r.all).toBe(2);
    expect(r.stderr).toMatch(/INSTRUMENT DEAD/);
    expect(r.stderr, 'the gate blamed the manifest for a declaration defect')
      .not.toMatch(/regenerate with gen-bible-audio-manifest/);
  });

  it('exits 2, not 1, when a drive edition declares no volKey (key becomes "undefined:<book>")', () => {
    const track = withField('volKey', '');
    const r = runGate(mirror({ track }));
    expect(r.status, 'a missing volKey was reported as an unregenerated manifest:\n' + r.all).toBe(2);
    expect(r.stderr).toMatch(/INSTRUMENT DEAD/);
    expect(r.stderr).not.toMatch(/undefined:/);
  });
});
