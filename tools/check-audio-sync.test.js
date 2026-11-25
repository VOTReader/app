/* check-audio-sync — the read-along offsets address the right characters.
   ─────────────────────────────────────────────────────────────────────────
   tools/check-audio-sync.js exports nothing: every check lives in a top-level
   script that reads the shipped data at import. These tests drive it as a CLI
   via child_process.spawnSync, exactly as pre-commit and CI do — asserting
   exit code plus the --json report (failures, byKind, lost, detail).

   SEAMS (all read at import; the gate resolves them itself):
     AUDIO_SYNC_FILE           fixture name resolved under the real data dir —
                               an ABSOLUTE path works, so fixtures live in a
                               temp dir and never touch the shipped data.
     AUDIO_SYNC_SECTIONS_FILE  same; the shipped WTLB fixture drives the
                               sections leg (tools/fixtures/audio-sync-sections.fixture.js).
     AUDIO_SYNC_PROVENANCE_FILE resolved under tools/ — an absolute path works.

   THE COVERAGE FLOOR (lostTimings) reads git HEAD:app/.../audio-sync.js, so a
   fixture that covers one letter would report every other shipped timeline
   as LOST. Fixture runs neutralize that with the sidecar's own `excluded`
   record (every HEAD key not in the fixture), and one test asserts the floor
   itself by running WITHOUT the exclusion. The real-data tests exercise the
   floor for real (lost must be []).

   PROBE-VERIFIED FIXTURE FACTS (2026-11-18, against this tree):
     AKEY five:a-bruised-reed-swaying-in-the-wind — Format A, 6 blocks, block 0
       is a para, 94 chars: "Thus says The Lord: One who sits upon the fence
       between two "; manifest part [["1wDCfnWQ_SOdodxY9Rmtr9rlpiEomGh5b","V"]];
       real rows [25.86,0,0,19,0] [27.87,0,20,94,0] [33.14,1,0,40,0].
     BKEY blessed:blessed-are-those-who-believe-in-me — Format B, 1 paragraph,
       2593 spoken chars; manifest part [["1LHdgPGb0mLYk2HQgjnpwnLUWfATNh4iu","V"]];
       real rows [16.62,0,1,44,0] [18.86,0,48,83,0].
     STALE-DOMAIN span [23,26) on AKEY block 0: "who" is word-clean in the
       LEGACY domain (no collision-guard space after the colon) and dirty in
       the real one — the one span that separates the two classifications.
     DRIFTED-OTHER span [1,10) on the same block: mid-word in BOTH domains.
     OVERLAP pair [0,37) + [20,94): both word-clean alone, sharing [20,37).
     STUDY_KEY study:more-than-a-man-ch0 is in the corpus but has no manifest
       row — the isolated NO-MANIFEST-ROW case.
     SECTION_ASSET 1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g is a real AUDIO_SECTIONS id.
     ALT_ASSET 10YOeEUf9I2MnOb2yuV0oQBBPNvMvZFXW belongs to one:christmas;
       real alt rows [23.69,0,0,36,0] [26.14,0,37,98,0].

   NOT TESTED HERE, and why:
     - The stale.allow register (waived STALE-DOMAIN rows; a key the register
       lists that now passes FAILS the gate): tools/audio-sync-stale.allow does
       not exist in this tree and its path is fixed — no env seam — so neither
       the waived path nor the still-listed path is reachable from a fixture.
     - --release: that flag belongs to check-audio-manifest.js, not this gate.

   WIRING (pinned by the wiring tests below, verified 2026-11-18): the
   pre-commit hook (.githooks/pre-commit, via core.hooksPath) runs this gate
   when tools/(check-audio-sync|audio-fragments-lib|extract-audio-fragments)
   is staged, plus the sections-fixture leg, and runs check-audio-manifest.js
   when the manifest, coverage or renditions lib is staged; .githooks/pre-push
   runs vitest (npm run test:hook) when app source or tools change, so this
   file runs before a push lands. CI names both gates too. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runInNewContext } from 'vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = resolve(ROOT, 'app', 'src', 'main', 'assets', 'src', 'data');
const GATE = resolve(HERE, 'check-audio-sync.js');
const SECTIONS_FIXTURE = resolve(HERE, 'fixtures', 'audio-sync-sections.fixture.js');
const PROBE_TEXT = resolve(HERE, '_align-work', 'sync-probe-text.json');
const SPAWN_TIMEOUT_MS = 30_000;

const AKEY = 'five:a-bruised-reed-swaying-in-the-wind';
const BKEY = 'blessed:blessed-are-those-who-believe-in-me';
const STUDY_KEY = 'study:more-than-a-man-ch0';
const A_ASSET = '1wDCfnWQ_SOdodxY9Rmtr9rlpiEomGh5b';
const SECTION_ASSET = '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g';
const ALT_ASSET = '10YOeEUf9I2MnOb2yuV0oQBBPNvMvZFXW';

// Real rows, copied verbatim from the shipped audio-sync.js (the gate passes
// on them today, so they are the clean-row fixtures).
const A_ROWS = [[25.86, 0, 0, 19, 0], [27.87, 0, 20, 94, 0]];
const B_ROWS = [[16.62, 0, 1, 44, 0], [18.86, 0, 48, 83, 0]];
const ALT_ROWS = [[23.69, 0, 0, 36, 0], [26.14, 0, 37, 98, 0]];

const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (existsSync(PROBE_TEXT)) rmSync(PROBE_TEXT, { force: true });
});

/** Read one `var NAME = {...};` global out of a shipped data file, the way the gate does. */
function readDataGlobal(file, name) {
  const ctx = {};
  runInNewContext(readFileSync(resolve(DATA, file), 'utf8'), ctx, { filename: file });
  return ctx[name] || {};
}

let headCache = null;
function headKeys() {
  if (!headCache) {
    const sync = readDataGlobal('audio-sync.js', 'AUDIO_SYNC');
    const alt = readDataGlobal('audio-sync.js', 'AUDIO_SYNC_ALT');
    headCache = { syncKeys: Object.keys(sync), altKeys: Object.keys(alt) };
  }
  return headCache;
}

let manifestCache = null;
function manifestAssets(key) {
  if (!manifestCache) manifestCache = readDataGlobal('audio-manifest.js', 'AUDIO_MANIFEST');
  return (manifestCache[key] || []).map((r) => r[0]);
}

/** The sidecar's `excluded` record for every HEAD timeline NOT in this fixture:
 * without it the coverage floor reports the whole shipped catalog as lost. */
function excludedFor(syncKeys, altKeys) {
  const head = headKeys();
  const ex = {};
  for (const k of head.syncKeys) if (!syncKeys.includes(k)) ex[k] = 'test fixture: key not in this fixture';
  for (const a of head.altKeys) if (!altKeys.includes(a)) ex['alt:' + a] = 'test fixture: alt not in this fixture';
  return ex;
}

/** Provenance for a fixture: every fixture key names exactly the assets the
 * manifest plays as primary today; every other HEAD timeline is excluded. */
function autoProvenance(sync, alt) {
  const primary = {};
  for (const key of Object.keys(sync)) {
    const assets = manifestAssets(key);
    if (assets.length) primary[key] = assets;
  }
  return { primary, excluded: excludedFor(Object.keys(sync), Object.keys(alt)) };
}

/** Run the gate as a child process against temp-dir fixtures.
 * sections: 'empty' ({}), 'fixture' (the shipped WTLB fixture), or an object.
 * provenance: 'auto', 'none' (path that does not exist), or an explicit object. */
function runGate({ sync = {}, alt = {}, sections = 'empty', provenance = 'auto', args = ['--json'] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vot-audio-sync-'));
  tmpDirs.push(dir);
  const syncFile = join(dir, 'audio-sync-fixture.js');
  writeFileSync(syncFile, `var AUDIO_SYNC = ${JSON.stringify(sync)};\nvar AUDIO_SYNC_ALT = ${JSON.stringify(alt)};\n`);
  let sectionsFile;
  if (sections === 'fixture') {
    sectionsFile = SECTIONS_FIXTURE;
  } else {
    sectionsFile = join(dir, 'audio-sync-sections-fixture.js');
    writeFileSync(sectionsFile, `var AUDIO_SYNC_SECTIONS = ${JSON.stringify(sections === 'empty' ? {} : sections)};\n`);
  }
  let provFile;
  if (provenance === 'none') {
    provFile = join(dir, 'no-such-provenance.json');
  } else {
    provFile = join(dir, 'audio-sync-provenance.json');
    const p = provenance === 'auto' ? autoProvenance(sync, alt) : provenance;
    writeFileSync(provFile, JSON.stringify(p));
  }
  const env = {
    ...process.env,
    AUDIO_SYNC_FILE: syncFile,
    AUDIO_SYNC_SECTIONS_FILE: sectionsFile,
    AUDIO_SYNC_PROVENANCE_FILE: provFile,
  };
  const r = spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', env, cwd: ROOT });
  let json = null;
  if (args.includes('--json')) {
    try { json = JSON.parse(r.stdout || ''); } catch { json = null; }
  }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', json };
}

/** Run the gate with no env overrides — the shipped data, as CI runs it. */
function runGateReal(args = ['--json']) {
  const r = spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', cwd: ROOT });
  let json = null;
  if (args.includes('--json')) {
    try { json = JSON.parse(r.stdout || ''); } catch { json = null; }
  }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', json };
}

function kindsOf(report) {
  return report.json ? report.json.byKind : null;
}

describe('check-audio-sync — the real gate on the shipped data', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('passes the shipped catalog: no failures, nothing lost, coverage reported', () => {
    const r = runGateReal();
    expect(r.status).toBe(0);
    expect(r.json).not.toBeNull();
    expect(r.json.failures).toBe(0);
    expect(r.json.byKind).toEqual({});
    expect(r.json.detail).toEqual([]);
    expect(r.json.lost).toEqual([]);
    expect(r.json.rowsChecked).toBeGreaterThan(10000);
    expect(r.json.timelines).toBeGreaterThan(100);
    expect(r.json.coverage).toBeGreaterThan(0.9);
    expect(r.json.coverage).toBeLessThanOrEqual(1);
    expect(r.json.provenanceChecked).toBeGreaterThan(100);
    expect(r.json.staleKeys).toEqual([]);
    expect(r.json.otherKeys).toEqual([]);
  });

  it('prints the OK line in text mode', () => {
    const r = runGateReal([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('[audio-sync] OK');
    expect(r.stdout).toContain('every shipped span starts and ends on a word boundary');
  });

  it('accepts the shipped WTLB sections fixture: 6 letters in 2 compilations', () => {
    const r = runGate({ sections: 'fixture', args: [] });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('6 letters in 2 compilations');
  });
});

describe('check-audio-sync — fixture timelines (env seams)', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('clean fixture (one Format-A + one Format-B letter) exits 0 with no failures', () => {
    const r = runGate({ sync: { [AKEY]: A_ROWS, [BKEY]: B_ROWS } });
    expect(r.status).toBe(0);
    expect(r.json.failures).toBe(0);
    expect(r.json.byKind).toEqual({});
    expect(r.json.rowsChecked).toBe(4);
    expect(r.json.timelines).toBe(2);
    expect(r.json.lost).toEqual([]);
    expect(r.json.coverage).not.toBeNull();
  });

  it('a valid alternate timeline (asset-keyed) passes on its own', () => {
    const r = runGate({ sync: {}, alt: { [ALT_ASSET]: ALT_ROWS } });
    expect(r.status).toBe(0);
    expect(r.json.failures).toBe(0);
    expect(r.json.rowsChecked).toBe(2);
    expect(r.json.timelines).toBe(1);
  });

  it('MALFORMED-ROW: a short array and a non-array row, neither counted', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0], 'not-a-row'] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'MALFORMED-ROW': 2 });
    expect(r.json.rowsChecked).toBe(0);
  });

  it('BAD-TIME: negative and non-numeric times', () => {
    const r = runGate({ sync: { [AKEY]: [[-1, 0, 0, 19, 0], ['x', 0, 0, 19, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'BAD-TIME': 2 });
    expect(r.json.rowsChecked).toBe(2);
  });

  it('NON-MONOTONIC is per part: decreasing times fail in one part, not across a part boundary', () => {
    const same = runGate({ sync: { [AKEY]: [[1.0, 0, 0, 19, 0], [0.5, 0, 20, 94, 0]] } });
    expect(kindsOf(same)).toEqual({ 'NON-MONOTONIC': 1 });
    const reset = runGate({ sync: { [AKEY]: [[1.0, 0, 0, 19, 0], [0.5, 0, 20, 94, 1]] } });
    expect(kindsOf(reset)).toEqual({ 'PART-OUT-OF-RANGE': 1 });
    expect(kindsOf(reset)['NON-MONOTONIC']).toBeUndefined();
  });

  it('PART-OUT-OF-RANGE: a part index with no track in the manifest', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, 0, 19, 1]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'PART-OUT-OF-RANGE': 1 });
  });

  it('PARA-OUT-OF-RANGE: a Format-B paragraph index past the letter', () => {
    const r = runGate({ sync: { [BKEY]: [[1.0, 5, 0, 10, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'PARA-OUT-OF-RANGE': 1 });
  });

  it('HALF-SENTINEL: only one end of a Format-B whole-paragraph sentinel', () => {
    const r = runGate({ sync: { [BKEY]: [[1.0, 0, -1, 44, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'HALF-SENTINEL': 1 });
  });

  it('OUT-OF-BOUNDS: a Format-A span past the end of the block text', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, 0, 999, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'OUT-OF-BOUNDS': 1 });
  });

  it('SENTINEL-ON-FORMAT-A: the -1/-1 sentinel on a Format-A letter', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, -1, -1, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'SENTINEL-ON-FORMAT-A': 1 });
  });

  it('NO-SUCH-BLOCK: a block index the letter does not have', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 99, 0, 10, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-SUCH-BLOCK': 1 });
  });

  it('a key in neither the corpus nor the manifest reports NO-MANIFEST-ROW and NO-SUCH-ITEM (and no belt can vouch for it)', () => {
    const r = runGate({ sync: { 'one:does-not-exist': [[1.0, 0, 0, 10, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-MANIFEST-ROW': 1, 'NO-SUCH-ITEM': 1, 'UNKNOWN-PROVENANCE': 1 });
  });

  it('NO-MANIFEST-ROW alone for a corpus item with no recording (provenance cannot vouch for it either)', () => {
    const r = runGate({ sync: { [STUDY_KEY]: [] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-MANIFEST-ROW': 1, 'UNKNOWN-PROVENANCE': 1 });
  });

  it('OVERLAP: two word-clean spans claiming the same characters in one block', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, 0, 37, 0], [2.0, 0, 20, 94, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ OVERLAP: 1 });
  });

  it('STALE-DOMAIN: a span word-clean in the legacy domain and dirty in the real one', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, 23, 26, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'STALE-DOMAIN': 1 });
    expect(r.json.staleKeys).toEqual([AKEY]);
  });

  it('DRIFTED-OTHER: a mid-word span is dirty in both domains, so it is not stale', () => {
    const r = runGate({ sync: { [AKEY]: [[1.0, 0, 1, 10, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'DRIFTED-OTHER': 1 });
    expect(r.json.staleKeys).toEqual([]);
    expect(r.json.otherKeys).toEqual([AKEY]);
  });

  it('NO-ALTERNATE-OWNER: an alt timeline for an asset no rendition owns', () => {
    const r = runGate({ sync: {}, alt: { 'bogus-asset-id-123': [[1.0, 0, 0, 10, 0]] } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-ALTERNATE-OWNER': 1 });
  });

  it('NO-SECTION-ASSET: a compilation timeline for an asset AUDIO_SECTIONS never plays', () => {
    const r = runGate({
      sync: {},
      sections: { 'bogus-section-asset': { [AKEY]: [A_ROWS[0]] } },
    });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-SECTION-ASSET': 1 });
  });

  it('EMPTY-LETTER: a compilation letter with no rows has no start', () => {
    const r = runGate({ sync: {}, sections: { [SECTION_ASSET]: { [AKEY]: [] } } });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'EMPTY-LETTER': 1 });
  });

  it('SECTION-ORDER: compilation letters must start in key order', () => {
    const r = runGate({
      sync: {},
      sections: { [SECTION_ASSET]: { [AKEY]: [[5.0, 0, 0, 19, 0]], [BKEY]: [[1.0, 0, 1, 44, 0]] } },
    });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'SECTION-ORDER': 1 });
  });

  it('UNKNOWN-PROVENANCE: a primary timeline no belt names', () => {
    const r = runGate({
      sync: { [AKEY]: A_ROWS },
      provenance: { primary: {}, excluded: excludedFor([AKEY], []) },
    });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'UNKNOWN-PROVENANCE': 1 });
    expect(r.json.provenanceChecked).toBe(1);
  });

  it('PROVENANCE-MISMATCH: the belt names a recording the manifest no longer plays', () => {
    const r = runGate({
      sync: { [AKEY]: A_ROWS },
      provenance: {
        primary: { [AKEY]: ['bogus-asset-id-12345678901234567890'] },
        excluded: excludedFor([AKEY], []),
      },
    });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'PROVENANCE-MISMATCH': 1 });
    const f = r.json.detail.find((d) => d.kind === 'PROVENANCE-MISMATCH');
    expect(f.belt).toEqual(['bogus-asset-id-12345678901234567890']);
    expect(f.manifest).toEqual([A_ASSET]);
  });

  it('NO-PROVENANCE-SIDECAR: a missing sidecar fails, and the floor loses its exclusion record too', () => {
    const r = runGate({ sync: { [AKEY]: A_ROWS }, provenance: 'none' });
    expect(r.status).toBe(1);
    expect(kindsOf(r)).toEqual({ 'NO-PROVENANCE-SIDECAR': 1 });
    expect(r.json.lost.length).toBeGreaterThan(100);
  });

  it('--emit-probe-text writes the exact characters the app will wash', () => {
    const r = runGate({
      sync: { [AKEY]: A_ROWS, [BKEY]: B_ROWS },
      args: ['--json', '--emit-probe-text'],
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('wrote _align-work/sync-probe-text.json');
    expect(existsSync(PROBE_TEXT)).toBe(true);
    const probe = JSON.parse(readFileSync(PROBE_TEXT, 'utf8'));
    expect(probe[AKEY].some((row) => row[5] === 'Thus says The Lord:')).toBe(true);
    expect(probe[BKEY].length).toBe(2);
  });

  it('the coverage floor: without the sidecar exclusion, a one-letter fixture reports the catalog as lost', () => {
    const head = headKeys();
    const someOtherKey = head.syncKeys.find((k) => k !== AKEY);
    const r = runGate({
      sync: { [AKEY]: A_ROWS },
      provenance: { primary: { [AKEY]: [A_ASSET] }, excluded: {} },
    });
    expect(r.json.failures).toBe(0);
    expect(r.status).toBe(1);
    expect(r.json.lost.length).toBeGreaterThan(100);
    expect(r.json.lost).toContain(someOtherKey);
  });
});

describe('check-audio-sync — wiring', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('CI runs the gate and the manifest gate, and npm has check scripts for both', () => {
    const ci = readFileSync(resolve(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('node tools/check-audio-sync.js');
    expect(ci).toContain('node tools/check-audio-manifest.js');
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['check:audio-sync']).toContain('check-audio-sync.js');
    expect(pkg.scripts['check:audio-manifest']).toContain('check-audio-manifest.js');
  });

  it('the pre-commit hook runs both gates on staged changes', () => {
    const hook = readFileSync(resolve(ROOT, '.githooks', 'pre-commit'), 'utf8');
    expect(hook).toContain('node tools/check-audio-sync.js');
    expect(hook).toContain('node tools/check-audio-manifest.js');
    expect(hook).toContain('check-audio-sync|audio-fragments-lib|extract-audio-fragments');
    expect(hook).toContain('audio-sync-sections.fixture.js');
  });

  it('the pre-push hook runs vitest, so this file runs before a push lands', () => {
    const push = readFileSync(resolve(ROOT, '.githooks', 'pre-push'), 'utf8');
    expect(push).toContain('test-hook');
    const hook = readFileSync(resolve(HERE, 'test-hook.sh'), 'utf8');
    expect(hook).toContain('vitest run');
  });
});
