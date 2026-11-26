/**
 * tools/gen-audio-manifest.test.js — tests for tools/gen-audio-manifest.mjs.
 *
 * The script runs at import, exports nothing, reads the corpus data files,
 * the Drive listing and the study cut plan from paths fixed to its own
 * location, and writes audio-manifest.js + audio-manifest-coverage.json, so
 * it cannot be imported into vitest. Each case mirrors the real script +
 * audio-renditions-lib.mjs into a throwaway repo tree with fixture corpus
 * data (one letter per collection, a V1 preface, one study with four
 * chapters), a fixture Drive listing and a fixture cut plan, then runs the
 * script as a child process, exactly as the pipeline does. The generator
 * resolves everything from the script's own location, so the mirror's
 * layout is the whole trick: nothing is read from or written to the real
 * tree. Fully offline, deterministic. Precedent:
 * tools/gen-restored-nt.test.js (votreader-tests-3 item 5a).
 *
 * The listing below is the whole fixture: every record exists to exercise
 * one rule in the generator's header comment (owner directives 2026-08-05
 * and 2026-08-09, FlockSync v2 §5).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'gen-audio-manifest.mjs');
const LIB = resolve(HERE, 'audio-renditions-lib.mjs');

// One letter per collection (the generator FATAL-exits on an empty one),
// a V1 preface, and one study with four chapters. Only id/num/title are
// read; the rest of a real letter's fields are never touched.
const DATA_FILES = {
  'volume-one.js': `var LETTERS_V1_PREFACE = { id: 'a-word-of-warning', num: 0, title: 'A Word of Warning' };
var LETTERS_V1 = [
  { id: 'first-letter', num: 1, title: 'First Letter Title' },
  { id: 'second-letter', num: 2, title: 'Second Letter Title' },
  { id: 'third-letter', num: 3, title: 'Third Letter Title' },
];`,
  'volume-two.js': `var LETTERS = [
  { id: 'wrong-number', num: 5, title: 'Wrong Number But Right Title' },
  { id: 'truncated-title', num: 6, title: 'Truncated Title With Ellipsis And More Words Here' },
  { id: 'all-letters-only', num: 7, title: 'All Letters Only' },
  { id: 'sectioned-letter', num: 8, title: 'Sectioned Letter Title' },
];`,
  'volume-three.js': `var LETTERS_V3_PREFACE = { id: 'v3-preface', num: 0, title: 'Volume Three Preface' };
var LETTERS_V3 = [ { id: 'v3-one', num: 1, title: 'Volume Three Letter One' } ];`,
  'volume-four.js': `var LETTERS_V4_PREFACE = { id: 'v4-preface', num: 0, title: 'Volume Four Preface' };
var LETTERS_V4 = [ { id: 'v4-one', num: 1, title: 'Volume Four Letter One' } ];`,
  'volume-five.js': `var LETTERS_V5_PREFACE = { id: 'v5-preface', num: 0, title: 'Volume Five Preface' };
var LETTERS_V5 = [ { id: 'v5-one', num: 1, title: 'Volume Five Letter One' } ];`,
  'volume-six.js': `var LETTERS_V6_PREFACE = { id: 'v6-preface', num: 0, title: 'Volume Six Preface' };
var LETTERS_V6 = [ { id: 'v6-one', num: 1, title: 'Volume Six Letter One' } ];`,
  'volume-seven.js': `var LETTERS_V7_PREFACE = { id: 'v7-preface', num: 0, title: 'Volume Seven Preface' };
var LETTERS_V7 = [ { id: 'v7-one', num: 1, title: 'Volume Seven Letter One' } ];`,
  'letters-timothy.js': `var LETTERS_TIMOTHY_PREFACE = { id: 'tim-preface', num: 0, title: 'Timothy Preface' };
var LETTERS_TIMOTHY = [ { id: 'tim-one', num: 1, title: 'Timothy Letter One' } ];`,
  'letters-flock.js': `var LETTERS_FLOCK_PREFACE = { id: 'flock-preface', num: 0, title: 'Flock Preface' };
var LETTERS_FLOCK = [ { id: 'flock-one', num: 1, title: 'Flock Letter One' } ];`,
  'lords-rebuke.js': `var LETTERS_REBUKE_PREFACE = { id: 'rebuke-preface', num: 0, title: 'Rebuke Preface' };
var LETTERS_REBUKE = [ { id: 'rebuke-one', num: 1, title: 'Rebuke Letter One' } ];`,
  'wtlb-one.js': `var WTLB_ONE = [
  { id: 'wtlb1-one', num: 1, title: 'Words To Live By One' },
  { id: 'garden-return', num: 125, title: 'A Return to the Garden' },
];`,
  'wtlb-two.js': `var WTLB_TWO = [
  { id: 'other-125', num: 125, title: 'A Different Letter One Hundred Twenty Five' },
];`,
  'the-blessed.js': `var THE_BLESSED = [ { id: 'blessed-one', num: 1, title: 'Blessed Letter One' } ];`,
  'holy-days.js': `var HOLY_DAYS = [
  { id: 'i-am-risen', num: 1, title: 'I AM RISEN' },
  { id: 'holy-day-two', num: 2, title: 'Second Holy Day Title' },
];`,
  'bible-studies.js': `var BIBLE_STUDIES = [ { id: 'test-study', title: 'Test Study', chapters: [
  { id: 'alpha-ch', title: 'Alpha Chapter Title' },
  { id: 'beta-ch', title: 'Beta Chapter Title' },
  { id: 'delta-ch', title: 'Delta Chapter Title' },
  { id: 'gamma-ch', title: 'Gamma Chapter Title' },
] } ];`,
};

const LISTING = [
  // V1.001: Benjamin full vs TTS full vs TTS sections — rank decides.
  { id: 'drv-v1-001-tts-full', path: '1. Volume One/V1.001_First Letter Title (Full Letter) (read by text-to-speech).mp3', hash: 'hash-first-tts' },
  { id: 'drv-v1-001-ben-full', path: '1. Volume One/V1.001_First Letter Title (Full Letter) (read by Benjamin).mp3' },
  { id: 'drv-v1-001-tts-sec1', path: '1. Volume One/V1.001_First Letter Title - Section 1_The Opening (read by text-to-speech).mp3' },
  { id: 'drv-v1-001-tts-sec2', path: '1. Volume One/V1.001_First Letter Title - Section 2_The Middle (read by text-to-speech).mp3' },
  // V1.002: two parts.
  { id: 'drv-v1-002-part1', path: '1. Volume One/V1.002.1_Second Letter Title (read by text-to-speech).mp3' },
  { id: 'drv-v1-002-part2', path: '1. Volume One/V1.002.2_Second Letter Title (read by text-to-speech).mp3' },
  // V1.003: a full letter plus an addendum.
  { id: 'drv-v1-003-add', path: '1. Volume One/V1.003_Addendum to Third Letter Title (read by Timothy).mp3' },
  { id: 'drv-v1-003-full', path: '1. Volume One/V1.003_Third Letter Title (Full Letter) (read by text-to-speech).mp3' },
  // V1 preface, plus a bonus track naming the same preface.
  { id: 'drv-v1-preface', path: '1. Volume One/V1-7.000_A Word of Warning (read by text-to-speech).mp3' },
  { id: 'drv-v1-preface-bonus', path: '1. Volume One/V1.Bonus Track_A Word of Warning (read by text-to-speech).mp3' },
  // V2: misnumbered file rescued by exact title; fuzzy (truncated) title.
  { id: 'drv-v2-099-misnum', path: '2. Volume Two/V2.099_Wrong Number But Right Title (read by text-to-speech).mp3' },
  { id: 'drv-v2-006-fuzzy', path: '2. Volume Two/V2.006_Truncated Title With Ellipsis\u2026 (read by text-to-speech).mp3' },
  // V2.007 lives ONLY in 0. ALL LETTERS — fills the gap.
  { id: 'drv-v2-007-all', path: '0. ALL LETTERS/V2.007_All Letters Only (read by Timothy).mp3' },
  // V2.008: sections, Timothy's section 1 outranks the TTS one.
  { id: 'drv-v2-008-sec1-tts', path: '2. Volume Two/V2.008_Sectioned Letter Title - Section 1_First Part (read by text-to-speech).mp3' },
  { id: 'drv-v2-008-sec2-tts', path: '2. Volume Two/V2.008_Sectioned Letter Title - Section 2_Second Part (read by text-to-speech).mp3' },
  { id: 'drv-v2-008-sec1-tim', path: '2. Volume Two/V2.008_Sectioned Letter Title - Section 1_First Part (read by Timothy).mp3' },
  // WTLB range compilation, and a WTLB2 file that is really a WTLB1 letter.
  { id: 'drv-wtlb-comp', path: 'Words to Live By/WTLB_Part 3_040-059 (read by text-to-speech).mp3' },
  { id: 'drv-wtlb2-sister', path: 'Words to Live By/WTLB2.125_A Return to the Garden (read by Benjamin).mp3' },
  // Holy Days folder: matched by title, V3.013 stripped.
  { id: 'drv-holy-1', path: '16. Regarding The Holy Days/10_V3.013_I AM RISEN (read by Timothy).mp3' },
  // Same audio as the TTS full of V1.001, under a second Drive id in
  // 0. ALL LETTERS — the hash dedup must collapse it onto the first.
  { id: 'drv-all-001-dup', path: '0. ALL LETTERS/V1.001_First Letter Title (Full Letter) (read by text-to-speech).mp3', hash: 'hash-first-tts' },
  // Excluded surfaces and non-audio.
  { id: 'drv-ai-song', path: 'AI Songs of the Letters/Some Song Title.mp3' },
  { id: 'drv-readme', path: '1. Volume One/readme.txt' },
  // Unmatched and unparseable: dropped, named in the coverage sidecar.
  { id: 'drv-unmatched', path: '1. Volume One/V1.404_No Such Letter Title Here (read by text-to-speech).mp3' },
  { id: 'drv-unparseable', path: '1. Volume One/Random File Name.mp3' },
  // Studies: one chapter mapped, one naming nothing, one naming two.
  { id: 'drv-study-alpha', path: '17. Bible-Letter Studies/Alpha Chapter Title (read by Timothy).mp3' },
  { id: 'drv-study-unresolved', path: '17. Bible-Letter Studies/Some Unmapped Recording.mp3' },
  { id: 'drv-study-multi', path: '17. Bible-Letter Studies/Alpha Chapter Title Beta Chapter Title Combined.mp3' },
];

const CUT_PLAN = {
  note: 'fixture cut plan',
  'test-study': {
    sourceId: 'SRCID',
    reader: 'T',
    chapters: [
      { id: 'beta-ch', startSec: 10.5, cut: { asset: 'SRCID_ch00' } },
      { id: 'delta-ch', startSec: 42.0 },
      { id: 'gamma-ch', startSec: null },
    ],
  },
};

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function buildMirror(listing = LISTING, cutPlan = CUT_PLAN) {
  const dir = mkdtempSync(join(tmpdir(), 'gam-test-'));
  dirs.push(dir);
  const toolsDir = join(dir, 'tools');
  const dataDir = join(dir, 'app', 'src', 'main', 'assets', 'src', 'data');
  mkdirSync(toolsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  copyFileSync(SCRIPT, join(toolsDir, 'gen-audio-manifest.mjs'));
  copyFileSync(LIB, join(toolsDir, 'audio-renditions-lib.mjs'));
  for (const [name, src] of Object.entries(DATA_FILES)) {
    writeFileSync(join(dataDir, name), src);
  }
  writeFileSync(join(toolsDir, '_audio-drive-listing.json'), JSON.stringify(listing, null, 2));
  writeFileSync(join(toolsDir, 'study-cut-plan.json'), JSON.stringify(cutPlan, null, 2));
  return dir;
}

function runManifest(dir) {
  const run = spawnSync('node', ['tools/gen-audio-manifest.mjs'], { cwd: dir, encoding: 'utf8' });
  const out = { status: run.status, stdout: run.stdout || '', stderr: run.stderr || '' };
  if (run.status !== 0) return out;
  const ctx = {};
  runInNewContext(
    readFileSync(join(dir, 'app', 'src', 'main', 'assets', 'src', 'data', 'audio-manifest.js'), 'utf8'),
    ctx,
  );
  out.manifest = ctx.AUDIO_MANIFEST;
  out.sections = ctx.AUDIO_SECTIONS;
  out.alternates = ctx.AUDIO_ALTERNATES;
  out.coverage = JSON.parse(readFileSync(join(dir, 'tools', 'audio-manifest-coverage.json'), 'utf8'));
  return out;
}

describe('gen-audio-manifest', () => {
  it('maps full letters, parts, addenda and the preface, with Benjamin superseding', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    // Benjamin's full letter is the primary; the TTS full and sections lose.
    expect(out.manifest['one:first-letter']).toEqual([['drv-v1-001-ben-full', 'B']]);
    // Parts keep their order and labels.
    expect(out.manifest['one:second-letter']).toEqual([
      ['drv-v1-002-part1', 'V', 'Part 1'],
      ['drv-v1-002-part2', 'V', 'Part 2'],
    ]);
    // The addendum rides after the full letter, labelled.
    expect(out.manifest['one:third-letter']).toEqual([
      ['drv-v1-003-full', 'V'],
      ['drv-v1-003-add', 'T', 'Addendum'],
    ]);
    // V1-7.000 is the preface.
    expect(out.manifest['one:a-word-of-warning']).toEqual([['drv-v1-preface', 'V']]);
  });

  it('keeps the beaten TTS full as an alternate, and drops exact-duplicate renditions', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    // The TTS full of V1.001 is a real alternate beside Benjamin's primary.
    expect(out.alternates['one:first-letter']).toEqual([
      ['V', [['drv-v1-001-tts-full']]],
    ]);
    // V1.003's TTS full is the primary's first row, so V offers it as an
    // alternate beside the primary that also carries Timothy's addendum.
    expect(out.alternates['one:third-letter']).toEqual([
      ['V', [['drv-v1-003-full']]],
    ]);
    // The two TTS parts ARE the primary — no alternate to offer.
    expect(out.alternates['one:second-letter']).toBeUndefined();
    // The bonus track is the same reader's same file as the preface primary.
    expect(out.alternates['one:a-word-of-warning']).toBeUndefined();
  });

  it('rescues misnumbered and fuzzy titles, and the sister WTLB volume', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    expect(out.manifest['two:wrong-number']).toEqual([['drv-v2-099-misnum', 'V']]);
    expect(out.manifest['two:truncated-title']).toEqual([['drv-v2-006-fuzzy', 'V']]);
    expect(out.manifest['wtlb1:garden-return']).toEqual([['drv-wtlb2-sister', 'B']]);
    expect(out.stdout).toContain('matched by title: V2.099_Wrong Number But Right Title');
    expect(out.stdout).toContain('matched by title in the sister WTLB volume: WTLB2.125_A Return to the Garden');
  });

  it('uses sections in order, with per-section reader rank, and notes partial alternates', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    // Timothy's section 1 outranks the TTS one; section 2 is TTS only.
    expect(out.manifest['two:sectioned-letter']).toEqual([
      ['drv-v2-008-sec1-tim', 'T', 'Section 1'],
      ['drv-v2-008-sec2-tts', 'V', 'Section 2'],
    ]);
    // Timothy read 1 of 2 sections — that ships with a completeness note;
    // the TTS rendition covers both sections, so it has none.
    expect(out.alternates['two:sectioned-letter']).toEqual([
      ['T', [['drv-v2-008-sec1-tim', 'Section 1']], '1 of 2 sections'],
      ['V', [['drv-v2-008-sec1-tts', 'Section 1'], ['drv-v2-008-sec2-tts', 'Section 2']]],
    ]);
  });

  it('fills gaps only from 0. ALL LETTERS and collapses same-audio duplicates by hash', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    // V2.007 has no collection-folder file; the ALL LETTERS copy is its primary.
    expect(out.manifest['two:all-letters-only']).toEqual([['drv-v2-007-all', 'T']]);
    // The ALL LETTERS twin of the TTS full is the same audio under a second
    // id: it collapses onto the collection-folder copy and never reaches
    // the manifest or the alternates.
    expect(out.coverage.collapsedByHash).toEqual([
      { kept: 'drv-v1-001-tts-full', dropped: 'drv-all-001-dup', hash: 'hash-first-tts' },
    ]);
    expect(JSON.stringify(out.manifest)).not.toContain('drv-all-001-dup');
    expect(JSON.stringify(out.alternates)).not.toContain('drv-all-001-dup');
  });

  it('emits WTLB range compilations as sections and matches Holy Days by title', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    expect(out.sections).toEqual({
      wtlb1: [['Part 3 \u00b7 40\u201359', 'drv-wtlb-comp', 'V']],
    });
    expect(out.manifest['holydays:i-am-risen']).toEqual([['drv-holy-1', 'T']]);
  });

  it('maps study chapters, cuts from the plan, and leaves pending chapters unemitted', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    expect(out.manifest['study:alpha-ch']).toEqual([['drv-study-alpha', 'T']]);
    // Named cut asset from the plan.
    expect(out.manifest['study:beta-ch']).toEqual([['SRCID_ch00', 'T']]);
    // No cut.asset in the plan: the generated <sourceId>_ch<NN> name.
    expect(out.manifest['study:delta-ch']).toEqual([['SRCID_ch01', 'T']]);
    // No startSec yet: nothing is emitted for gamma.
    expect(out.manifest['study:gamma-ch']).toBeUndefined();
    expect(out.coverage.studies).toEqual({ 'alpha-ch': 'T', 'beta-ch': 'T', 'delta-ch': 'T' });
    expect(out.coverage.studiesUnresolved).toEqual([
      'Alpha Chapter Title Beta Chapter Title Combined.mp3',
      'Some Unmapped Recording.mp3',
    ]);
  });

  it('writes the coverage sidecar from the mapping stage', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    expect(out.coverage.listingRecords).toBe(27);
    expect(out.coverage.totals.listing).toEqual({ B: 2, T: 4, V: 16 });
    expect(out.coverage.totals.unmapped).toEqual({ V: 2 });
    expect(out.coverage.totals.unmappedIds).toEqual(['drv-unmatched', 'drv-unparseable']);
    expect(out.coverage.totals.compilations).toEqual({ V: 1 });
    // Raw candidate counts, before the hash dedup: the ALL LETTERS twin
    // still counts as a V candidate for V1.001.
    expect(out.coverage.letters['one:first-letter']).toEqual({ readers: { B: 1, V: 4 }, slots: 2 });
    expect(out.coverage.letters['one:a-word-of-warning']).toEqual({ readers: { V: 2 }, slots: 1 });
    expect(out.coverage.letters['two:sectioned-letter']).toEqual({ readers: { V: 2, T: 1 }, slots: 2 });
    expect(out.coverage.letters['wtlb1:garden-return']).toEqual({ readers: { B: 1 }, slots: 1 });
  });

  it('reports the run: counts, reader totals, problems, and letters without audio', () => {
    const out = runManifest(buildMirror());
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('audio-manifest: 10 letters with audio (20 files used, 5 non-letter files excluded)');
    expect(out.stdout).toContain('  studies:  1 of 4 study chapters have their own recording');
    expect(out.stdout).toContain('    from the cut plan: 2 chapter asset(s) emitted, 1 awaiting an offset');
    expect(out.stdout).toContain('  same-audio duplicates collapsed: 1');
    expect(out.stdout).toContain('  primary:  13 tracks (B\u00d72, T\u00d74, V\u00d77)');
    expect(out.stdout).toContain('  alternates: 3 letters offer a reader choice \u2014 4 renditions, 5 extra assets (T\u00d71, V\u00d74)');
    expect(out.stdout).toContain('  of those, 1 are PARTIAL and ship a completeness note');
    expect(out.stdout).toContain('  UNMATCHED  V1.404_No Such Letter Title Here (read by text-to-speech).mp3');
    expect(out.stdout).toContain('  UNPARSEABLE  Random File Name.mp3');
    expect(out.stdout).toContain('  bonus track matched: V1.Bonus Track_A Word of Warning');
    expect(out.stdout).toContain('Letters without audio:');
    expect(out.stdout).toContain('1:Volume Three Letter One');
    expect(out.stdout).toMatch(/wtlb1\s+1\/2\s+MISSING 1/);
    expect(out.stdout).toContain('  sections: wtlb1 \u00d71');
  });

  it('fails loudly when a cut chapter also has its own recording', () => {
    const listing = [
      ...LISTING,
      { id: 'drv-study-beta', path: '17. Bible-Letter Studies/Beta Chapter Title (read by Timothy).mp3' },
    ];
    const out = runManifest(buildMirror(listing));
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('FATAL: two recordings claim one study chapter');
  });
});
