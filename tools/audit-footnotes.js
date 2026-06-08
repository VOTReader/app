/* ─────────────────────────────────────────────────────────────────────────
   audit-footnotes.js — READ-ONLY diagnostic (not wired into any gate).

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

   Usage: node tools/audit-footnotes.js
   ───────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRefRange, splitIntoVerses } from '../app/src/main/assets/src/utils/scripture-parse.js';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'main', 'assets', 'src', 'data');

// CORP6: `--check` turns this read-only diagnostic into a CI gate — concise output,
// exit 1 if any footnote renders with a duplicated or white verse number (the
// dup / whiteBadKey / whiteFallback "hard problem" classes). validate-schemas'
// validateFootnoteMarkers covers the no-marker case; the dup + bad-key cases are
// this tool's unique signal. No-arg mode keeps the full human worklist.
const CHECK = process.argv.includes('--check');

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
];

function loadVar(file, varName) {
  const code = readFileSync(resolve(dataDir, file), 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  return sandbox[varName];
}

const cats = { single: [], compound: [], goldMarkers: [], goldHeuristic: [], dup: [], whiteBadKey: [], whiteFallback: [] };

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

let total = 0;
for (const f of FILES) {
  let letters, preface = null;
  try {
    letters = loadVar(f.file, f.arrayVar);
    if (f.prefaceVar) preface = loadVar(f.file, f.prefaceVar);
  } catch (e) { console.error(`LOAD ERROR ${f.file}: ${e.message}`); continue; }
  const all = Array.isArray(letters) ? letters.slice() : [];
  if (preface && typeof preface === 'object') all.push(preface);
  for (const letter of all) {
    const nkjv = letter && letter.nkjv;
    if (!nkjv || typeof nkjv !== 'object') continue;
    for (const ref of Object.keys(nkjv)) {
      total++;
      cats[categorize(ref, nkjv[ref])].push({ file: f.file, ref, sample: String(nkjv[ref]).replace(/\s+/g, ' ') });
    }
  }
}

// ── Other footnote/scripture dict sources (ref->text), same render path ──
const DICT_SOURCES = [
  { file: 'wtlb-scriptures.js', varName: 'WTLB_SCRIPTURES', label: 'WTLB' },
  { file: 'the-blessed.js',     varName: 'THE_BLESSED_SCRIPTURES', label: 'Blessed' },
  { file: 'matthew-nkjv.js',    varName: 'MATTHEW_NKJV', label: 'Matthew' },
];
const dictCats = {};
for (const src of DICT_SOURCES) {
  const c = { single: 0, compound: 0, goldMarkers: 0, goldHeuristic: 0, dup: 0, whiteBadKey: 0, whiteFallback: 0 };
  let dict;
  try { dict = loadVar(src.file, src.varName); } catch (e) { console.error(`LOAD ERROR ${src.file}: ${e.message}`); continue; }
  if (!dict || typeof dict !== 'object') { console.error(`  (${src.label}: ${src.varName} not an object)`); continue; }
  for (const ref of Object.keys(dict)) {
    const cat = categorize(ref, dict[ref]);
    c[cat]++;
    if (cat === 'dup' || cat === 'whiteBadKey' || cat === 'whiteFallback' || cat === 'goldHeuristic') {
      cats[cat].push({ file: src.label, ref, sample: String(dict[ref]).replace(/\s+/g, ' ') });
    }
  }
  dictCats[src.label] = c;
}

const problems = cats.dup.length + cats.whiteBadKey.length + cats.whiteFallback.length;
const fixable = cats.goldHeuristic.length;
let dictHard = 0;
for (const label of Object.keys(dictCats)) {
  const c = dictCats[label];
  dictHard += c.dup + c.whiteBadKey + c.whiteFallback;
}
const hardTotal = problems + dictHard;

// CORP6 gate: concise output + nonzero exit on any hard problem.
if (CHECK) {
  console.log(`audit-footnotes: ${total} Format A values + ${Object.keys(dictCats).length} dict sources — hard problems (dup + white): ${hardTotal}`);
  if (hardTotal > 0) {
    console.error('audit-footnotes: FAIL — ' + hardTotal + ' footnote value(s) render a duplicated or white verse number.');
    console.error('Run `node tools/audit-footnotes.js` (no --check) for the full worklist, then fix the DATA (markers / keys).');
    process.exit(1);
  }
  process.exit(0);
}

console.log(`\nFORMAT A footnote nkjv values audited: ${total}\n`);
const order = ['goldMarkers', 'goldHeuristic', 'single', 'compound', 'dup', 'whiteBadKey', 'whiteFallback'];
for (const k of order) console.log(`  ${k.padEnd(15)} ${String(cats[k].length).padStart(4)}`);
console.log(`\n  → hard problems (dup + white): ${problems}`);
console.log(`  → soft (gold but heuristic/marker-less): ${fixable}\n`);

console.log('Other dict sources (same VerseWithNumbers render path):');
for (const label of Object.keys(dictCats)) {
  const c = dictCats[label];
  const probs = c.dup + c.whiteBadKey + c.whiteFallback;
  const tot = c.single + c.compound + c.goldMarkers + c.goldHeuristic + probs;
  console.log(`  ${label.padEnd(9)} total ${String(tot).padStart(4)} | gold ${c.goldMarkers} · heuristic ${c.goldHeuristic} · single ${c.single} · compound ${c.compound} | PROBLEMS ${probs} (dup ${c.dup}, badkey ${c.whiteBadKey}, fallback ${c.whiteFallback})`);
}
console.log('');

// Full worklist for the WHITE cases (the visible eyesores) — every one, full text.
for (const k of ['whiteBadKey', 'whiteFallback']) {
  console.log(`\n=== ${k} (${cats[k].length}) — FULL ===`);
  for (const s of cats[k]) console.log(`  [${s.file}] "${s.ref}"\n      ${s.sample}\n`);
}
// Heuristic (render gold but guessed) — refs only for now.
console.log(`\n=== goldHeuristic (${cats.goldHeuristic.length}) — FULL ===`);
for (const s of cats.goldHeuristic) console.log(`  [${s.file}] "${s.ref}"\n      ${s.sample}\n`);
