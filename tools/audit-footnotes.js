/* ─────────────────────────────────────────────────────────────────────────
   audit-footnotes.js — READ-ONLY diagnostic; with --check, a CI gate
   (`npm run check:footnotes`, ci.yml "Audit footnote rendering").

   Runs the REAL renderer logic (parseRefRange + splitIntoVerses from
   scripture-parse.js) over every Format A footnote `nkjv` value across the
   corpus and categorises how each one renders TODAY, so we can size the
   gold-verse-number normalisation precisely before touching any data.

   Buckets:
     single        — single-verse ref → no verse number rendered (fine as-is)
     compound      — `A | B` multi-part value (separate render path; skip)
     goldMarkers   — multi-verse, splits cleanly, data HAS explicit markers → clean GOLD ✅
     goldHeuristic — multi-verse, splits cleanly but data has NO markers (sentence-split guess) → gold, but mapping is heuristic ⚠️
     dup           — multi-verse, splits but a segment text still starts with its own number → GOLD sup + WHITE number (duplication) ❌
     whiteBadKey   — ref key has an apparent range but parseRefRange can't read it (label-suffixed key) → all WHITE ❌
     whiteFallback — multi-verse range but split collapsed to one block → all WHITE ❌

   COVERAGE (corrected 2026-09-04, data-corpus-7): the FILES table below — the
   seven volumes, lords-rebuke, letters-timothy, letters-flock, hidden-manna and
   holy-days — plus the flat dicts in DICT_SOURCES. holy-days.js was in NEITHER
   list, so its 21 values (18 of them in the two Passover entries) went
   unchecked; it is mixed-format, so the walk reads `nkjv` or `scriptures`.

   A data file that fails to load fails --check: its values went unchecked.

   Usage: node tools/audit-footnotes.js [--check]
   The tests call main() in-process (exported; the CLI runs it behind isMain):
   a spawned cold node per case timed out under a loaded pre-push (nw27).
   ───────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRefRange, splitIntoVerses } from '../app/src/main/assets/src/utils/scripture-parse.js';

// AUDIT_FOOTNOTES_DATA_DIR points the walk at another data directory.
const DATA_DIR = process.env.AUDIT_FOOTNOTES_DATA_DIR
  || resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'src', 'data');

const FILES = [
  { file: 'volume-one.js',      arrayVar: 'LETTERS_V1',      prefaceVar: 'LETTERS_V1_PREFACE' },
  { file: 'volume-two.js',      arrayVar: 'LETTERS',         prefaceVar: null },
  { file: 'volume-three.js',    arrayVar: 'LETTERS_V3',      prefaceVar: 'LETTERS_V3_PREFACE' },
  { file: 'volume-four.js',     arrayVar: 'LETTERS_V4',      prefaceVar: 'LETTERS_V4_PREFACE' },
  { file: 'volume-five.js',     arrayVar: 'LETTERS_V5',      prefaceVar: 'LETTERS_V5_PREFACE' },
  { file: 'volume-six.js',      arrayVar: 'LETTERS_V6',      prefaceVar: 'LETTERS_V6_PREFACE' },
  { file: 'volume-seven.js',    arrayVar: 'LETTERS_V7',      prefaceVar: 'LETTERS_V7_PREFACE' },
  { file: 'lords-rebuke.js',    arrayVar: 'LETTERS_REBUKE',  prefaceVar: 'LETTERS_REBUKE_PREFACE' },
  { file: 'letters-timothy.js', arrayVar: 'LETTERS_TIMOTHY', prefaceVar: 'LETTERS_TIMOTHY_PREFACE' },
  { file: 'letters-flock.js',   arrayVar: 'LETTERS_FLOCK',   prefaceVar: 'LETTERS_FLOCK_PREFACE' },
  { file: 'hidden-manna.js',    arrayVar: 'HIDDEN_MANNA',    prefaceVar: null },
  // Holy Days is a MIXED-format collection — each entry inherits Format A or
  // Format B from its `type`, so an entry carries `nkjv` or `scriptures` and
  // the walk below reads either. Its 21 values were unchecked until 2026-09-04
  // (data-corpus-7); the two Passover entries alone hold 18 of them.
  { file: 'holy-days.js',       arrayVar: 'HOLY_DAYS',       prefaceVar: null },
];

function loadVar(dataDir, file, varName) {
  const code = readFileSync(resolve(dataDir, file), 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  return sandbox[varName];
}

/** How many of the verse numbers appear as explicit markers (N. / N / superscript) in the text. */
function markerCount(text, verseNums) {
  let n = 0;
  for (const v of verseNums) {
    const decimal = new RegExp(`(?:^|\\s)${v}\\.?\\s`);
    if (decimal.test(text)) { n++; continue; }
    const sup = String(v).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join('');
    if (text.includes(sup)) n++;
  }
  return n;
}

function categorize(ref, text) {
  if (typeof text !== 'string') return 'single';
  if (text.includes(' | ')) return 'compound';
  const range = parseRefRange(ref);
  if (!range) {
    return /:\s*\d+\s*[-,]\s*\d+/.test(ref) ? 'whiteBadKey' : 'single';
  }
  const verseNums = range.verses || Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  if (verseNums.length < 2) return 'single';
  const segs = splitIntoVerses(text, ref);
  if (!segs || segs.length <= 1) return 'whiteFallback';
  const dup = segs.some((s) => new RegExp(`^\\s*${s.vNum}\\b`).test(s.text));
  if (dup) return 'dup';
  return markerCount(text, verseNums) >= verseNums.length - 1 ? 'goldMarkers' : 'goldHeuristic';
}

// ── Other footnote/scripture dict sources (ref->text), same render path ──
const DICT_SOURCES = [
  { file: 'wtlb-scriptures.js', varName: 'WTLB_SCRIPTURES', label: 'WTLB' },
  { file: 'the-blessed.js',     varName: 'THE_BLESSED_SCRIPTURES', label: 'Blessed' },
  { file: 'matthew-nkjv.js',    varName: 'MATTHEW_NKJV', label: 'Matthew' },
];

/** The walk; returns the exit code. CORP6: `--check` turns this read-only diagnostic into a CI gate — concise
 *  output, exit 1 if any footnote renders with a duplicated or white verse number (the dup / whiteBadKey /
 *  whiteFallback "hard problem" classes). validate-schemas' validateFootnoteMarkers covers the no-marker case; the
 *  dup + bad-key cases are this tool's unique signal. No-arg mode keeps the full human worklist. */
export function main(argv = process.argv.slice(2), { dataDir = DATA_DIR, log = console.log, error = console.error } = {}) {
  const CHECK = argv.includes('--check');
  const cats = { single: [], compound: [], goldMarkers: [], goldHeuristic: [], dup: [], whiteBadKey: [], whiteFallback: [] };
  let total = 0;
  // A file that fails to load hides every value in it, so it fails the gate (W74):
  // logging it and moving on let a deleted or unparsable volume pass with exit 0.
  let loadFailures = 0;
  for (const f of FILES) {
    let letters, preface = null;
    try {
      letters = loadVar(dataDir, f.file, f.arrayVar);
      if (f.prefaceVar) preface = loadVar(dataDir, f.file, f.prefaceVar);
    } catch (e) { error(`LOAD ERROR ${f.file}: ${e.message}`); loadFailures++; continue; }
    const all = Array.isArray(letters) ? letters.slice() : [];
    if (preface && typeof preface === 'object') all.push(preface);
    for (const letter of all) {
      // `nkjv` (Format A) and `scriptures` (Format B) are the same ref -> text
      // dict down the same VerseWithNumbers render path. Read both, so a
      // mixed-format collection cannot hide half its values from this gate.
      for (const bag of [letter && letter.nkjv, letter && letter.scriptures]) {
        if (!bag || typeof bag !== 'object') continue;
        for (const ref of Object.keys(bag)) {
          total++;
          cats[categorize(ref, bag[ref])].push({ file: f.file, ref, sample: String(bag[ref]).replace(/\s+/g, ' ') });
        }
      }
    }
  }

  // NOT audited here, deliberately (checked 2026-09-04, data-corpus-7): the
  // Matthew Study Bible's per-chapter `scriptures` look like a fourth dict but
  // are an ARRAY of { ref, cite } — a verse anchor plus either a KEY INTO
  // MATTHEW_NKJV (already audited above) or plain commentary. There is no verse
  // text in them to render a gold number from, so running them through
  // categorize() would only manufacture 193 meaningless "single" rows. Their
  // shape is gated by validate-schemas.js (validateStudyBible ->
  // validateAnnotationArray) and their refs by its Bible-ref resolution pass.
  const dictCats = {};
  for (const src of DICT_SOURCES) {
    const c = { single: 0, compound: 0, goldMarkers: 0, goldHeuristic: 0, dup: 0, whiteBadKey: 0, whiteFallback: 0 };
    let dict;
    try { dict = loadVar(dataDir, src.file, src.varName); } catch (e) { error(`LOAD ERROR ${src.file}: ${e.message}`); loadFailures++; continue; }
    if (!dict || typeof dict !== 'object') { error(`LOAD ERROR ${src.file}: ${src.varName} is not an object`); loadFailures++; continue; }
    for (const ref of Object.keys(dict)) {
      const cat = categorize(ref, dict[ref]);
      c[cat]++;
      if (cat === 'dup' || cat === 'whiteBadKey' || cat === 'whiteFallback' || cat === 'goldHeuristic') {
        cats[cat].push({ file: src.label, ref, sample: String(dict[ref]).replace(/\s+/g, ' ') });
      }
    }
    dictCats[src.label] = c;
  }
  // The dict pass pushes its hard rows into `cats` too, so `problems` already
  // holds them; adding the per-dict counts again counted each one twice (W74).
  const problems = cats.dup.length + cats.whiteBadKey.length + cats.whiteFallback.length;
  const fixable = cats.goldHeuristic.length;
  const hardTotal = problems;

  // CORP6 gate: concise output + nonzero exit on any hard problem.
  if (CHECK) {
    log(`audit-footnotes: ${total} Format A values + ${Object.keys(dictCats).length} dict sources — hard problems (dup + white): ${hardTotal}`);
    if (loadFailures > 0) {
      error(`audit-footnotes: FAIL — ${loadFailures} data file(s) did not load, so their footnotes went unchecked.`);
      return 1;
    }
    if (hardTotal > 0) {
      error('audit-footnotes: FAIL — ' + hardTotal + ' footnote value(s) render a duplicated or white verse number.');
      error('Run `node tools/audit-footnotes.js` (no --check) for the full worklist, then fix the DATA (markers / keys).');
      return 1;
    }
    return 0;
  }

  log(`\nFORMAT A footnote nkjv values audited: ${total}\n`);
  const order = ['goldMarkers', 'goldHeuristic', 'single', 'compound', 'dup', 'whiteBadKey', 'whiteFallback'];
  for (const k of order) log(`  ${k.padEnd(15)} ${String(cats[k].length).padStart(4)}`);
  log(`\n  → hard problems (dup + white): ${problems}`);
  log(`  → soft (gold but heuristic/marker-less): ${fixable}\n`);
  if (loadFailures > 0) log(`  → ${loadFailures} data file(s) did not load (LOAD ERROR above): their values are not counted\n`);

  log('Other dict sources (same VerseWithNumbers render path):');
  for (const label of Object.keys(dictCats)) {
    const c = dictCats[label];
    const probs = c.dup + c.whiteBadKey + c.whiteFallback;
    const tot = c.single + c.compound + c.goldMarkers + c.goldHeuristic + probs;
    log(`  ${label.padEnd(9)} total ${String(tot).padStart(4)} | gold ${c.goldMarkers} · heuristic ${c.goldHeuristic} · single ${c.single} · compound ${c.compound} | PROBLEMS ${probs} (dup ${c.dup}, badkey ${c.whiteBadKey}, fallback ${c.whiteFallback})`);
  }
  log('');

  // Full worklist for the WHITE cases (the visible eyesores) — every one, full text.
  for (const k of ['whiteBadKey', 'whiteFallback']) {
    log(`\n=== ${k} (${cats[k].length}) — FULL ===`);
    for (const s of cats[k]) log(`  [${s.file}] "${s.ref}"\n      ${s.sample}\n`);
  }
  // Heuristic (render gold but guessed) — refs only for now.
  log(`\n=== goldHeuristic (${cats.goldHeuristic.length}) — FULL ===`);
  for (const s of cats.goldHeuristic) log(`  [${s.file}] "${s.ref}"\n      ${s.sample}\n`);
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) process.exitCode = main();
