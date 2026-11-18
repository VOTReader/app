/* check-audio-manifest — every reader who recorded a letter is offered it.
   ─────────────────────────────────────────────────────────────────────────
   tools/check-audio-manifest.js exports nothing: it reads two committed files
   (app/src/main/assets/src/data/audio-manifest.js and
   tools/audio-manifest-coverage.json) and exits non-zero on any drift between
   them. It has NO env seams — every path is fixed under the repo root — so
   each case mirrors the gate plus the minimum real data into a throwaway repo
   tree and runs it as a child process, exactly as pre-commit and CI do (the
   check-corpus-version.test.js harness pattern). The mirror copies the REAL
   manifest (65 KB) and coverage file (197 KB), so mutations start from data
   the gate passes on today; a mutation that breaks the gate's expectation
   fails here first.

   MUTATION STRATEGY: coverage is JSON, so its mutations are object edits;
   the manifest is a `var X = {...};` classic script, so its mutations parse
   it in a vm, edit the object, and write it back as JSON (formatting does
   not matter — the gate runs it in a vm too). No test edits the real files.

   The independent listing leg (_audio-drive-listing.json) is absent in the
   mirror, as in CI: the baseline asserts the 'sidecar totals only' line.

   NOT TESTED HERE, and why:
     - --release: needs the gh CLI plus network (a hardcoded Windows gh path
       and the votreader-assets audio-v1 release). Not a CI gate; excluded.
     - The independent listing leg itself: it needs _audio-drive-listing.json,
       which lives on the generating machine, not in the repo. The sidecar
       totals leg (which the mirror does exercise) is the CI shape. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runInNewContext } from 'vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const GATE = resolve(HERE, 'check-audio-manifest.js');
const RENDITIONS_LIB = resolve(HERE, 'audio-renditions-lib.mjs');
const REAL_MANIFEST = resolve(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data', 'audio-manifest.js');
const REAL_COVERAGE = resolve(HERE, 'audio-manifest-coverage.json');
const SPAWN_TIMEOUT_MS = 30_000;

const mirrors = [];
afterEach(() => { for (const m of mirrors.splice(0)) rmSync(m, { recursive: true, force: true }); });

/** A throwaway repo tree with the real gate, its one lib, and the real data. */
function mirror() {
  const root = mkdtempSync(join(tmpdir(), 'vot-audio-manifest-'));
  mirrors.push(root);
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  const toolsDir = join(root, 'tools');
  mkdirSync(toolsDir, { recursive: true });
  copyFileSync(GATE, join(toolsDir, 'check-audio-manifest.js'));
  copyFileSync(RENDITIONS_LIB, join(toolsDir, 'audio-renditions-lib.mjs'));
  copyFileSync(REAL_COVERAGE, join(toolsDir, 'audio-manifest-coverage.json'));
  const dataDir = join(root, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  copyFileSync(REAL_MANIFEST, join(dataDir, 'audio-manifest.js'));
  return root;
}

function manifestPath(root) { return join(root, 'app', 'src', 'main', 'assets', 'src', 'data', 'audio-manifest.js'); }
function coveragePath(root) { return join(root, 'tools', 'audio-manifest-coverage.json'); }

function readManifest(root) {
  const ctx = {};
  runInNewContext(readFileSync(manifestPath(root), 'utf8'), ctx, { filename: 'audio-manifest.js' });
  return { AUDIO_MANIFEST: ctx.AUDIO_MANIFEST || {}, AUDIO_ALTERNATES: ctx.AUDIO_ALTERNATES || {}, AUDIO_SECTIONS: ctx.AUDIO_SECTIONS || {} };
}

function writeManifest(root, obj) {
  writeFileSync(manifestPath(root),
    `var AUDIO_MANIFEST = ${JSON.stringify(obj.AUDIO_MANIFEST)};\n` +
    `var AUDIO_ALTERNATES = ${JSON.stringify(obj.AUDIO_ALTERNATES)};\n` +
    `var AUDIO_SECTIONS = ${JSON.stringify(obj.AUDIO_SECTIONS)};\n`);
}

function readCoverage(root) { return JSON.parse(readFileSync(coveragePath(root), 'utf8')); }
function writeCoverage(root, obj) { writeFileSync(coveragePath(root), JSON.stringify(obj, null, 2)); }

function runGate(root) {
  const r = spawnSync(process.execPath, [join(root, 'tools', 'check-audio-manifest.js')],
    { encoding: 'utf8', cwd: root });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

/** First letter whose coverage lists exactly one reader (V), for the lost-leg cases. */
function findSingleReaderLetter(coverage) {
  for (const [key, v] of Object.entries(coverage.letters || {})) {
    const readers = Object.keys(v.readers || {});
    if (readers.length === 1 && readers[0] === 'V') return key;
  }
  throw new Error('no single-V-reader letter in coverage');
}

/** A complete composed alternate rendition: every row labeled (Part/Section),
 * mine == the letter's longest. The shipped data carries NO completeness note
 * on any rendition (54 alternates, 0 noted — probed 2026-11-18), so both NOTE
 * legs are triggered by construction: shorten one (drop a row) for the missing
 * note, or add a note to a complete one for the wrong note. */
function findCompleteComposedRendition(manifest, coverage) {
  for (const [key, pairs] of Object.entries(manifest.AUDIO_ALTERNATES)) {
    const longest = (coverage.letters[key] && coverage.letters[key].slots) || 1;
    for (const pair of pairs) {
      const [, rows, note] = pair;
      if (note) continue;
      const mine = rows.filter((r) => r[1] !== 'Addendum').length;
      const allLabeled = rows.length >= 2 && rows.every((r) => r[1] && r[1] !== 'Addendum');
      if (mine === longest && allLabeled) return { key, pair, mine, longest };
    }
  }
  throw new Error('no complete composed rendition in the manifest');
}

/** Any complete unnoted rendition (mine >= longest) — adding a note to it is wrong. */
function findCompleteRendition(manifest, coverage) {
  for (const [key, pairs] of Object.entries(manifest.AUDIO_ALTERNATES)) {
    const longest = (coverage.letters[key] && coverage.letters[key].slots) || 1;
    for (const pair of pairs) {
      const [, rows, note] = pair;
      if (note) continue;
      const mine = rows.filter((r) => r[1] !== 'Addendum').length;
      if (mine >= longest) return { key, pair, mine, longest };
    }
  }
  throw new Error('no complete rendition in the manifest');
}

describe('check-audio-manifest — the real gate on the shipped data', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('passes the shipped manifest and coverage: OK line, report counts, sidecar totals only', () => {
    const root = mirror();
    const r = runGate(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[audio-manifest] OK');
    expect(r.stdout).toMatch(/\[audio-manifest\] \d+ letters, \d+ primary tracks/);
    expect(r.stdout).toMatch(/\[audio-manifest\] \d+ study chapters with their own recording/);
    expect(r.stdout).toMatch(/\[audio-manifest\] \d+ letters with a reader choice, \d+ renditions \/ \d+ tracks/);
    expect(r.stdout).toMatch(/\[audio-manifest\] \d+ letters mapped, \d+ candidate recordings, \d+ distinct assets emitted/);
    expect(r.stdout).toContain('books balance — sidecar totals only; _audio-drive-listing.json not present (CI)');
  });

  it('fails when the coverage file is missing, and names the generator', () => {
    const root = mirror();
    rmSync(coveragePath(root), { force: true });
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('tools/audio-manifest-coverage.json is missing');
    expect(r.all).toContain('node tools/gen-audio-manifest.mjs');
  });

  it('fails when the coverage file has no totals: the books cannot balance', () => {
    const root = mirror();
    const cov = readCoverage(root);
    delete cov.totals;
    writeCoverage(root, cov);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('has no `totals`');
  });
});

describe('check-audio-manifest — nothing lost / not stale', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('NOTHING LOST: a reader the coverage records but the manifest never offers', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const key = findSingleReaderLetter(cov);
    cov.letters[key].readers.T = 1;
    writeCoverage(root, cov);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('recorded but never offered');
    expect(r.all).toContain(`${key} [T]`);
  });

  it('NOT STALE: the manifest offers a letter the coverage file never heard of', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const key = findSingleReaderLetter(cov);
    delete cov.letters[key];
    writeCoverage(root, cov);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`${key}: the manifest offers audio the coverage file has never heard of`);
  });

  it('a letter whose every rendition vanished ships no audio at all', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const key = findSingleReaderLetter(cov);
    const m = readManifest(root);
    delete m.AUDIO_MANIFEST[key];
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`${key}: every reader's rendition vanished`);
  });

  it('study family: a chapter the coverage mapped but the manifest does not offer', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const id = Object.keys(cov.studies || {})[0];
    expect(id).toBeTruthy();
    delete cov.studies[id];
    writeCoverage(root, cov);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`study:${id}: offered but the coverage file never mapped it`);
  });

  it('study family: a chapter offered by the wrong reader', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const id = Object.keys(cov.studies || {})[0];
    const want = cov.studies[id];
    const other = want === 'B' ? 'V' : 'B';
    const m = readManifest(root);
    m.AUDIO_MANIFEST['study:' + id][0][1] = other;
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`study:${id}: offered by ${other}, mapped from ${want}`);
  });
});

describe('check-audio-manifest — well formed', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('a non-Drive id fails the well-formed check', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_MANIFEST).find((k) => !k.startsWith('study:'));
    m.AUDIO_MANIFEST[key][0][0] = 'short';
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('emitted asset id is not a Drive file id: "short"');
  });

  it('one rendition per reader per letter: a duplicated reader fails', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_ALTERNATES)[0];
    const pairs = m.AUDIO_ALTERNATES[key];
    pairs.push(JSON.parse(JSON.stringify(pairs[0])));
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`reader ${pairs[0][0]} has more than one rendition`);
  });

  it('an unknown reader code fails', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_ALTERNATES)[0];
    m.AUDIO_ALTERNATES[key][0][0] = 'X';
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('unknown reader code "X"');
  });

  it('a repeated asset inside one rendition fails', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_ALTERNATES)[0];
    const rows = m.AUDIO_ALTERNATES[key][0][1];
    const id = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    rows.push(rows[0]);
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`repeats asset ${id} inside one rendition`);
  });

  it('an empty rendition fails', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_ALTERNATES)[0];
    const reader = m.AUDIO_ALTERNATES[key][0][0];
    m.AUDIO_ALTERNATES[key][0][1] = [];
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`reader ${reader} has an empty rendition`);
  });

  it('a non-array AUDIO_ALTERNATES value fails', () => {
    const root = mirror();
    const m = readManifest(root);
    const key = Object.keys(m.AUDIO_ALTERNATES)[0];
    m.AUDIO_ALTERNATES[key] = 'not-an-array';
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('AUDIO_ALTERNATES value is not an array');
  });
});

describe('check-audio-manifest — notes are honest, books balance', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('a short composed rendition with no completeness note fails', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const m = readManifest(root);
    const { key, pair, mine, longest } = findCompleteComposedRendition(m, cov);
    const reader = pair[0];
    // Shorten the complete rendition by one labeled row: still composed,
    // now shorter than the letter's longest, and still unnoted.
    pair[1].pop();
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`${key}: reader ${reader} carries ${mine - 1} of ${longest} main tracks but ships NO completeness note`);
  });

  it('a completeness note on a complete rendition is wrong', () => {
    const root = mirror();
    const cov = readCoverage(root);
    const m = readManifest(root);
    const { key, pair, mine, longest } = findCompleteRendition(m, cov);
    pair[2] = 'Partial';
    writeManifest(root, m);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain(`${key}: reader ${pair[0]} is marked "Partial" but carries ${mine} of the letter's ${longest} main tracks — the note is wrong`);
  });

  it('BOOKS BALANCE: a hand-edited listing total fails', () => {
    const root = mirror();
    const cov = readCoverage(root);
    cov.totals.listing.V = (cov.totals.listing.V || 0) + 1;
    writeCoverage(root, cov);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.all).toContain('reader V:');
    expect(r.all).toContain('but the listing holds');
  });
});
