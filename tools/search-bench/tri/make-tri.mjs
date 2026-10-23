/* The tri bench's targets: 200 exact, 200 misremembered, 200 title per style open, plus held and fresh (search200, 2026-10-18).
   ─────────────────────────────────────────────────────────────────
   PLAN 1.3 (D:/Swarm/lanes/search200/out/w1/PLAN.md). Seeded (mulberry32, as make-targets.mjs); this file decides
   WHAT is remembered and in which FORM. The queries are written by blind writers (write.py) and checked from the query
   alone (check-tri.mjs, Gate A), so no tier is ever set from an engine result.
     - Good sentences only (bench-design §0, the gram index of w1/tri/sents.mjs): the sentence's class (texts holding 80%
       of its word 4-grams) holds at most 8 prose texts, no parallel verse holds 80% of it, it has at least 3 class-only
       4-grams, and under half its 4-grams are common to 12 or more texts; not a recurring line. Hard tiers also need 3
       class-only 3-grams with 2+ content words; misremembered needs 10+ words. Verses: no flagged parallel, no
       matthew-plain. Answers and studies: their own sentences (no letter, Words or verse in the class).
     - Excluded everywhere: Hidden Manna (never loaded), apparatus and stock openers (make-targets.mjs), any class
       overlapping a target of the 500 or of its fresh set, any class already holding a tri target (so exact and
       misremembered never share one). A class is matched by its rare 4-grams (in 8 texts or fewer).
     - Titles: unit titles, study chapter titles typed alone, and Answers section headings that are no unit's title;
       not Holy Days, Introduction/Preface-type titles, titles different texts share, near-twins (content-word Jaccard
       0.6+ with another text's title) or titles that are a verse's own words; a reprinted title only from its original.
     - Collection mixes per style (200 open), tiers 60/70/70; held 60 and fresh 30 per style, flagged by seed now;
       a 25% reserve per stratum (style x tier x group; fresh 3 per style x tier). A stratum that runs short takes its
       gap from letters. Forms per tier by the PLAN quotas, held and fresh in proportion (largest remainder), each
       form only on a target where a query of it can pass Gate A as the brief words it (sentFormOk, titleFormOk).
     - Not prose (tri/prose-filter.mjs, tested): sign-offs, link/PDF/download lines, footers, editor's notes,
       glossary lines, source lines, reference lines, cross-references, outline points, headings and all-caps lines
       never become targets; speaker tags and quoted formula openers ("[The Lord answered] ", "\"Thus says The Lord: ")
       are cut before the stock-opener rule. The counts per rule and collection are printed first.
   Writes tools/search-bench/tri/targets.json, the open and held packets (20 targets, one style x tier, collections
   shuffled), the reserve packets, and the 9 fresh packets (packets/fresh/: one per style x tier, its 10 targets and
   3 reserves shuffled together). Prints every tally and checks it against PLAN 1.3.

     node --max-old-space-size=8192 tools/search-bench/tri/make-tri.mjs [--seed 20261018] [--packets <dir>] [--out <targets.json>]
       [--tallies <file>] [--dry] [--eligible]      --dry writes nothing; --eligible prints how many targets each form can take
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, kjvVerses, norm, sentences, loadCorpus } from '../corpus.mjs';
import { heldShare, titleForms } from '../rules.mjs';
import { BRIEF_SMALL, toks, isContent, holdsNumber, typedStrength, swappableCount, ARTICLE } from './lex.mjs';
import { nonProse, stripLead, RULES as PROSE_RULES } from './prose-filter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const SEED = Number(val('--seed') || 20261018);
const PACKETS = val('--packets') || 'D:/Swarm/lanes/search200/out/tri/packets';
const OUT = val('--out') || path.join(HERE, 'targets.json');
const TALLIES = val('--tallies') || path.join(path.dirname(PACKETS), 'tallies.txt');
const DRY = argv.includes('--dry');
let seed = SEED;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const wc = (s) => (String(s).match(/\S+/g) || []).length;
const t0 = Date.now();
const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

// ── the spec (PLAN 1.2-1.3) ──
const SPLITS = ['open', 'held', 'fresh'];
const TIERS = ['easy', 'medium', 'hard'];
const STYLES = ['exact', 'misremembered', 'title'];
const TIER_N = { open: { easy: 60, medium: 70, hard: 70 }, held: { easy: 20, medium: 20, hard: 20 }, fresh: { easy: 10, medium: 10, hard: 10 } };
const FORMS = {
  exact: { easy: { 'long-run': 48, 'short-sentence': 6, 'pasted-quoted': 6 }, medium: { start: 20, middle: 30, end: 20 },
    hard: { 'rare-short': 20, 'common-words': 15, boundary: 20, 'typed-forms': 15 } },
  misremembered: { easy: { 'one-slip': 60 }, medium: { 'two-three-slips': 70 },
    hard: { 'many-slips': 18, reordered: 14, register: 12, merged: 14, half: 12 } },
  title: { easy: { lowercase: 48, 'as-written': 12 },
    medium: { 'article-dropped': 18, 'word-dropped': 18, 'memorable-part': 18, 'number-swap': 8, 'punct-swap': 8 },
    hard: { 'words-wrong': 22, reordered: 12, typo: 12, 'collection-word': 12, 'dropped-wrong': 12 } },
};
const SENT_MIX = { v1: 8, v2: 7, v3: 9, v4: 6, v5: 4, v6: 5, v7: 24, timothy: 4, flock: 9, rebuke: 14, ot: 22, nt: 20, 'matthew-study': 8,
  wtlb1: 12, wtlb2: 10, blessed: 4, holydays: 4, answers: 15, 'bible-studies': 15 };
const MIX = { exact: SENT_MIX, misremembered: SENT_MIX, title: { v1: 8, v2: 7, v3: 8, v4: 7, v5: 7, v6: 8, v7: 18, timothy: 4, flock: 15,
  rebuke: 10, wtlb1: 25, wtlb2: 37, answers: 18, 'answers-heading': 8, 'bible-studies': 16, blessed: 4 } };
const GROUP_N = { exact: { letters: 90, bible: 50, words: 30, answers: 15, studies: 15 }, title: { letters: 92, wtlb: 62, answers: 26, studies: 16, blessed: 4 } };
GROUP_N.misremembered = GROUP_N.exact;
const LETTERS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'timothy', 'flock', 'rebuke'];
const groupOf = (style, col) => {
  if (LETTERS.includes(col)) return 'letters';
  if (style === 'title') return col.startsWith('wtlb') ? 'wtlb' : col.startsWith('answers') ? 'answers' : col === 'bible-studies' ? 'studies' : col;
  if (['ot', 'nt', 'matthew-study'].includes(col)) return 'bible';
  if (['wtlb1', 'wtlb2', 'blessed', 'holydays'].includes(col)) return 'words';
  return col === 'answers' ? 'answers' : 'studies';
};
const ONE_WORD_CAP = { open: 10, held: 3, fresh: 2 }; // 10 of 200, in proportion
const RESERVE = 0.25;
const FRESH_RESERVE = 3; // per style x tier: "10 + 3 reserves"
const COL_LABEL = {
  v1: 'Volume One', v2: 'Volume Two', v3: 'Volume Three', v4: 'Volume Four', v5: 'Volume Five', v6: 'Volume Six',
  v7: 'Volume Seven', timothy: 'Letters from Timothy', flock: "Letters to The Lord's Little Flock", rebuke: "The Lord's Rebuke",
  wtlb1: 'Words To Live By: Part One', wtlb2: 'Words To Live By: Part Two', blessed: 'The Blessed', holydays: 'Holy Days',
  answers: 'Answers Only God Can Give', 'answers-heading': 'Answers Only God Can Give', 'bible-studies': 'Bible / Letter Studies',
  ot: 'Bible (NKJV)', nt: 'Bible (NKJV)', 'matthew-study': 'The Scriptures of Truth (Matthew Study Bible)',
};
const STOCK = /^(thus says the lord|says the lord|behold|the word of the lord|this question was asked)[^.:!?]*[:.!?]?\s*/i;
const APPARATUS = /~|^\[?from\b.*(volume|words to live by|letters|rebuke|blessed|holy days)|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|word of the lord spoken to timothy/i;
// ...and the Answers' signposts (found by the 30-target smoke, 2026-10-18): "Also See: <topic>", "False Doctrine: ...
// The Truth: <topic>", and a bulleted link line (a bullet and no sentence end: "• Regarding the Mistranslation of...")
const SIGNPOST = /\balso (?:see|read)\s*[:\-–]|^\W*(?:also (?:see|read)|see also)\b|^\W*false doctrine:|\bthe truth:\s/i;
const LINKLINE = /^\s*(?:[•·▪◦‣]|\p{Extended_Pictographic})[^]*[^.!?…"”’)\]\s]\s*$/u;
const notProse = (t) => APPARATUS.test(t) || SIGNPOST.test(t) || LINKLINE.test(t);
const CITE_LINE = /^~\s*\[From\s*[“"](.+)[”"]\s*~\s*(.+?)\]\s*$/;
const INTRO = /^(introduction|preface|foreword|prologue|epilogue|afterword|table of contents|contents|dedication|acknowledg|appendix|glossary|index|a note|note to|about (this|the) (book|author|study))\b/i;

/** Largest remainder: split `total` over the keys of `w` in proportion to its weights (ties: key order). */
function lr(w, total) {
  const keys = Object.keys(w); const sum = keys.reduce((a, k) => a + w[k], 0);
  const out = {}; const rem = [];
  for (const k of keys) { const e = (w[k] * total) / (sum || 1); out[k] = Math.floor(e); rem.push([k, e - out[k]]); }
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  rem.sort((a, b) => b[1] - a[1] || keys.indexOf(a[0]) - keys.indexOf(b[0]));
  for (const [k] of rem) { if (left <= 0) break; out[k]++; left--; }
  return out;
}
/** Both margins fixed: rows (tier -> n) by columns (col -> n), cells in proportion, largest remainder, then any cell
    with room in its row and column until both margins are met. */
function lr2(rows, cols) {
  const R = Object.keys(rows); const C = Object.keys(cols);
  const total = R.reduce((a, r) => a + rows[r], 0);
  const cell = {}; const fr = [];
  for (const r of R) { cell[r] = {}; for (const c of C) { const e = (rows[r] * cols[c]) / total; cell[r][c] = Math.floor(e); fr.push([r, c, e - cell[r][c]]); } }
  const rowLeft = (r) => rows[r] - C.reduce((a, c) => a + cell[r][c], 0);
  const colLeft = (c) => cols[c] - R.reduce((a, r) => a + cell[r][c], 0);
  fr.sort((a, b) => b[2] - a[2] || R.indexOf(a[0]) - R.indexOf(b[0]) || C.indexOf(a[1]) - C.indexOf(b[1]));
  for (const [r, c] of fr) if (rowLeft(r) > 0 && colLeft(c) > 0) cell[r][c]++;
  for (const r of R) for (const c of C) while (rowLeft(r) > 0 && colLeft(c) > 0) cell[r][c]++;
  return cell;
}

// ── corpus ──
const D = await buildDocs('nkjv');
const B = await buildBlocks();
const KJV = kjvVerses();
loadCorpus();
const STOP = globalThis.VotSearchData.STOP_WORDS_TRIMMED;
const unitBlocks = {};
for (const b of B) (unitBlocks[b.uk] || (unitBlocks[b.uk] = [])).push(b);
const unitKeys = Object.keys(unitBlocks);
const TIER_OF = (col) => (['bible', 'matthew-study', 'ot', 'nt', 'verse', 'kjv'].includes(col) || LETTERS.includes(col) ? 0
  : ['wtlb1', 'wtlb2', 'blessed'].includes(col) ? 1 : col === 'holydays' ? 2 : col === 'bible-studies' ? 3 : 4);

// The gram index's documents (w1/tri/sents.mjs): every prose unit, every NKJV verse (Matthew Study and plain Matthew
// included), every KJV verse.
const docs = [];
for (const k of unitKeys) docs.push({ key: k, kind: 'prose', col: unitBlocks[k][0].col, w: toks(unitBlocks[k].map((b) => b.text).join(' ')) });
const verseDoc = new Map();
for (const d of D) if (d.kind === 'verse') { const k = d.volumeId + '/' + d.bookId + ':' + d.chapterNum + ':' + d.verseNum; verseDoc.set(k, d); docs.push({ key: k, kind: 'verse', col: d.volumeId, w: toks(d.text) }); }
for (const [book, chs] of Object.entries(KJV)) for (const [ch, vs] of Object.entries(chs)) for (const v of vs) docs.push({ key: 'kjv/' + book + ':' + ch + ':' + v.n, kind: 'kjv', col: 'kjv', w: toks(v.text) });
const isVerseDoc = (i) => docs[i].kind !== 'prose';
const isLetterDoc = (i) => docs[i].kind === 'prose' && LETTERS.includes(docs[i].col);
const twinOf = (key) => { const m = /^(?:bible|matthew-study|kjv)\/([\w-]+):(\d+):(\d+)$/.exec(key); return m ? 'v:' + (m[1] === 'matthew-plain' ? 'matthew' : m[1]) + ':' + m[2] + ':' + m[3] : null; };
const verseId = (i) => twinOf(docs[i].key);
say(`corpus: ${docs.length} documents (${unitKeys.length} prose units), ${docs.reduce((n, d) => n + d.w.length, 0)} words`);

// ── candidate sentences: prose 8-40 words (stock opener cut, no apparatus), and verses 8-40 words ──
const cands = [];
const removed = {}; // rule -> col -> prose lines of 8-40 words it keeps out (tri/prose-filter.mjs, plus the apparatus rules above)
const proseRule = (t, b, whole) => (APPARATUS.test(t) ? 'apparatus' : SIGNPOST.test(t) ? 'signpost' : LINKLINE.test(t) ? 'link-line' : nonProse(t, { type: b.type, whole }));
for (const b of B) {
  const ss = sentences(b.text);
  ss.forEach((s, si) => {
    const t = stripLead(s.text).replace(STOCK, '');
    const n = wc(t);
    if (n < 8 || n > 40) return;
    const why = proseRule(t, b, ss.length === 1);
    if (why) { const r = removed[why] || (removed[why] = {}); r[b.col] = (r[b.col] || 0) + 1; return; }
    const off = s.end - t.length;
    if (b.text.slice(off, s.end) !== t) throw new Error('offset drift in ' + b.uk);
    const nx = ss[si + 1];
    cands.push({ src: 'prose', col: b.col, uk: b.uk, blockIdx: b.idx, off, end: s.end, text: t, w: toks(t),
      nxt: nx && !proseRule(nx.text, b, false) ? { start: nx.start, end: nx.end, text: nx.text } : null });
  });
}
{
  const ruleNames = ['apparatus', 'signpost', 'link-line', ...PROSE_RULES];
  const total = ruleNames.reduce((a, r) => a + Object.values(removed[r] || {}).reduce((x, y) => x + y, 0), 0);
  say(`not prose (prose lines of 8-40 words kept out, ${total} in all; tri/prose-filter.mjs and the apparatus rules), by rule and collection:`);
  for (const r of ruleNames) {
    const by = removed[r] || {}; const n = Object.values(by).reduce((x, y) => x + y, 0);
    say(`  ${r.padEnd(10)} ${String(n).padStart(4)}${n ? '  ' + Object.entries(by).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`);
  }
}
for (const d of D) {
  if (d.kind !== 'verse' || d.bookId === 'matthew-plain') continue;
  const n = wc(d.text);
  if (n < 8 || n > 40) continue;
  const uk = d.volumeId + '/' + d.bookId + ':' + d.chapterNum + ':' + d.verseNum;
  const nd = verseDoc.get(d.volumeId + '/' + d.bookId + ':' + d.chapterNum + ':' + (d.verseNum + 1));
  cands.push({ src: 'verse', col: d.volumeId === 'bible' ? d.testament : 'matthew-study', uk, bookId: d.bookId, chapter: d.chapterNum, verse: d.verseNum, ref: d.ref,
    text: d.text, w: toks(d.text), nxtVerse: nd ? { uk: d.volumeId + '/' + nd.bookId + ':' + nd.chapterNum + ':' + nd.verseNum, verse: nd.verseNum, ref: nd.ref, text: nd.text } : null });
}
say(`candidates: ${cands.length} sentences of 8-40 words (${cands.filter((c) => c.src === 'prose').length} prose, ${cands.filter((c) => c.src === 'verse').length} verses)`);

// ── n-gram index: gram -> doc ids, capped at 12 (-1 = common) ──
const CAP = 12;
function index(n) {
  const M = new Map();
  docs.forEach((d, i) => {
    const w = d.w;
    for (let j = 0; j + n <= w.length; j++) {
      const gm = w.slice(j, j + n).join(' ');
      const a = M.get(gm);
      if (a === undefined) M.set(gm, i);
      else if (a === -1) continue;
      else if (typeof a === 'number') { if (a !== i) M.set(gm, [a, i]); }
      else if (a[a.length - 1] !== i) { if (a.length >= CAP) M.set(gm, -1); else a.push(i); }
    }
  });
  return M;
}
const list = (a) => (a === undefined ? [] : a === -1 ? null : typeof a === 'number' ? [a] : a);
const gramsAt = (w, n) => { const g = []; for (let j = 0; j + n <= w.length; j++) g.push(w.slice(j, j + n).join(' ')); return g; };
/** The longest run of words two token lists share. */
function longestRun(a, b) {
  let best = 0; let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    prev = cur;
  }
  return best;
}
const h32 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
let M = index(4);
/** The rare 4-grams of a text (in 8 documents or fewer), hashed: what marks its class. */
const rare4 = (text) => [...new Set(gramsAt(toks(text), 4))].filter((gm) => { const l = list(M.get(gm)); return l !== null && l.length <= 8; }).map(h32);
for (const c of cands) {
  const pos = gramsAt(c.w, 4);
  const g4 = [...new Set(pos)];
  const cnt = new Map(); let common = 0;
  for (const gm of g4) { const l = list(M.get(gm)); if (l === null) { common++; continue; } for (const i of l) cnt.set(i, (cnt.get(i) || 0) + 1); }
  c.common4 = common / g4.length;
  const cls = new Set([...cnt].filter(([, k]) => k >= 0.8 * g4.length).map(([i]) => i));
  // A prose line that quotes a verse whole, or that a verse holds, has the verse in its class (classes.mjs
  // versesQuoted, His name restored too): the 80% rule alone misses it when the verse's 4-grams are common ones
  // ("Then He said to them..."), and a study or Answers line must be its own words, not a quoted verse.
  if (c.src === 'prose') {
    const sw = c.w.map((x) => (/^(?:yahushua|yeshua|yahshua|yahusha|yeshu)$/.test(x) ? 'jesus' : x));
    const sN = ' ' + sw.join(' ') + ' ';
    const own = c.col === 'answers' || c.col === 'bible-studies';
    for (const [i, k] of cnt) {
      if (k < 2 || cls.has(i) || !isVerseDoc(i)) continue;
      const v = docs[i]; const vN = v.wn || (v.wn = ' ' + v.w.join(' ') + ' ');
      if ((v.w.length >= 8 && sN.includes(vN)) || vN.includes(sN)) cls.add(i);
      // ...and a study or Answers line that quotes a verse in its own spelling ("home born", "unto ages of ages") is
      // still a quoted verse, not the writing's own words: a run of 6+ words, 40% of the line, held by one verse
      else if (own && longestRun(sw, v.w) >= Math.max(6, 0.4 * sw.length)) c.quotesVerse = true;
    }
  }
  const vids = new Set([...cls].filter(isVerseDoc).map(verseId));
  if (c.src === 'verse') { vids.clear(); vids.add(twinOf(c.uk)); }
  const inCls = (i) => cls.has(i) || (isVerseDoc(i) && vids.has(verseId(i)));
  c.clsProse = [...cls].filter((i) => !isVerseDoc(i)).length;
  c.clsCols = [...new Set([...cls].filter((i) => !isVerseDoc(i)).map((i) => docs[i].col))];
  c.clsVerse = [...cls].some(isVerseDoc);
  c.recurring = c.clsVerse && [...cls].filter(isLetterDoc).length >= 3;
  c.parallel = c.src === 'verse' ? [...cls].filter((i) => isVerseDoc(i) && verseId(i) !== twinOf(c.uk)).length : 0;
  const okDoc = c.src === 'verse' ? (i) => inCls(i) && !(isVerseDoc(i) && verseId(i) !== twinOf(c.uk)) : inCls;
  const uniq = new Set(g4.filter((gm) => { const l = list(M.get(gm)); return l !== null && l.every(okDoc); }));
  c.uniq4 = uniq.size;
  c.u4pos = pos.map((gm, j) => (uniq.has(gm) ? j : -1)).filter((j) => j >= 0);
  c.rare4 = g4.filter((gm) => { const l = list(M.get(gm)); return l !== null && l.length <= 8; }).map(h32);
  c.okDoc = okDoc;
  if (c.nxt) c.nxtRare4 = rare4(c.nxt.text);
  if (c.nxtVerse) c.nxtRare4 = rare4(c.nxtVerse.text);
}
// What the 500 and its fresh set already ask for (make-fresh.mjs's `taken`, by class): their rare 4-grams, their verses,
// their whole-unit targets (titles, the letter about...) and the blocks of their block targets.
const oldUsed = new Set(); const oldVerse = new Set(); const oldUnits = new Set(); const oldBlocks = new Set(); const oldSent = new Set();
for (const f of ['targets.json', 'fresh-targets.json']) {
  for (const t of JSON.parse(fs.readFileSync(path.join(BENCH, f), 'utf8')).targets) {
    if (t.level === 'unit') { oldUnits.add(t.uk); continue; }
    for (const s of [t.sentence, t.kjv].filter(Boolean)) { for (const h of rare4(s)) oldUsed.add(h); oldSent.add(norm(s)); }
    if (t.level === 'verse') oldVerse.add(twinOf(t.uk));
    if (t.level === 'block') oldBlocks.add(t.uk + '#' + t.blockIdx);
  }
}
M.clear();
M = index(3);
for (const c of cands) {
  const pos = gramsAt(c.w, 3);
  const ok = (gm) => { const l = list(M.get(gm)); return l !== null && l.every(c.okDoc) && gm.split(' ').filter((x) => !STOP.has(x)).length >= 2; };
  const okSet = new Set([...new Set(pos)].filter(ok));
  c.uniq3c = okSet.size;
  c.u3pos = pos.map((gm, j) => (okSet.has(gm) ? j : -1)).filter((j) => j >= 0);
  delete c.okDoc;
}
M.clear(); M = null;

// ── what makes a candidate good, and the pools ──
for (const c of cands) {
  c.nTok = c.w.length;
  c.nContent = c.w.filter(isContent).length;
  c.good = c.clsProse <= 8 && !c.parallel && c.uniq4 >= 3 && c.common4 < 0.5 && !c.recurring;
  c.hard = c.good && c.uniq3c >= 3;
}
{ // the counts bench-design §0 reports: distinct texts, reprints counted once in tier order
  const seen = new Set(); let good = 0; let hard = 0;
  for (const c of cands) { const k = norm(c.text); if (seen.has(k)) continue; seen.add(k); if (c.recurring) continue; if (c.good) good++; if (c.hard) hard++; }
  say(`good sentences (distinct texts): ${good}; hard-capable ${hard} (bench-design §0 counted 33,638 and 27,086, with KJV Matthew,
    keyed matthew-plain in bible-kjv.js, as a different verse from Matthew's own)`);
}
const ownOk = (c) => {
  if (c.col === 'answers') return !c.clsVerse && !c.quotesVerse && c.clsCols.every((x) => x === 'answers');
  if (c.col === 'bible-studies') return !c.clsVerse && !c.quotesVerse && c.clsCols.every((x) => x === 'bible-studies' || x === 'answers');
  if (LETTERS.includes(c.col)) return unitBlocks[c.uk][0].num != null; // not a volume's preface
  return true;
};
const blockedOld = (c) => oldUnits.has(c.uk) || oldBlocks.has(c.uk + '#' + c.blockIdx) || oldSent.has(norm(c.text)) || c.rare4.some((h) => oldUsed.has(h))
  || (c.src === 'verse' && oldVerse.has(twinOf(c.uk)));
const sentPools = {};
let excludedOld = 0;
for (const c of cands) {
  if (!c.good || !ownOk(c)) continue;
  if (blockedOld(c)) { excludedOld++; continue; }
  (sentPools[c.col] || (sentPools[c.col] = [])).push(c);
}
for (const k of Object.keys(sentPools).sort()) sentPools[k] = shuffle(sentPools[k]);
say(`study and Answers lines kept out as quoted verses (a 6+ word run, 40% of the line, held by one verse): ${cands.filter((c) => c.good && c.quotesVerse && !c.clsVerse).length}`);
say(`sentence pools after exclusions (${excludedOld} good sentences overlap a 500 or fresh target): ` + Object.keys(SENT_MIX).map((k) => `${k} ${(sentPools[k] || []).length}`).join(', '));

// ── titles ──
const contentToks = (t) => toks(t).filter(isContent);
const jacc = (a, b) => { const A = new Set(a); const Bs = new Set(b); if (!A.size || !Bs.size) return 0; let i = 0; for (const x of A) if (Bs.has(x)) i++; return i / new Set([...A, ...Bs]).size; };
const unitTitle = (k) => unitBlocks[k][0].title || '';
const studyShort = (k) => { const f = titleForms(unitTitle(k), true); return f[f.length - 1]; };
const typedTitle = (k) => (k.startsWith('bible-studies/') ? studyShort(k) : unitTitle(k));
// classes of titles: units filed under the same normalized title (the bench's titleNorm, short study titles included)
const titleNorm = {};
for (const k of unitKeys) for (const f of titleForms(unitTitle(k), k.startsWith('bible-studies/'))) { const t = norm(f); const a = titleNorm[t] || (titleNorm[t] = []); if (!a.includes(k)) a.push(k); }
const unitWords = Object.fromEntries(unitKeys.map((k) => [k, toks(unitBlocks[k].map((b) => b.text).join(' '))]));
const reprints = (a, b) => Math.max(heldShare(unitWords[a], unitWords[b]), heldShare(unitWords[b], unitWords[a])) >= 0.5;
const verseNormAll = docs.filter((d) => d.kind !== 'prose').map((d) => ' ' + d.w.join(' ') + ' ').join('|');
const verseWords = (t) => { const n = norm(t); return n.trim().split(' ').length >= 3 && verseNormAll.includes(n); };
// Answers section headings: a short block of its own after a ✦ (or opening the topic), over passages
const headings = [];
{
  const all = [];
  for (const k of unitKeys.filter((x) => x.startsWith('answers/'))) {
    const bl = unitBlocks[k];
    bl.forEach((b, i) => {
      const t = b.text.trim();
      if (i > 0 && bl[i - 1].text.trim() !== '✦') return;
      if (!t || t === '✦' || t.length > 120 || wc(t) < 2 || wc(t) > 16 || CITE_LINE.test(t) || notProse(t)) return;
      if (/^["“'‘•([]/.test(t) || /[:;,]$/.test(t) || /^(the blessed:|words to live by|volume|see\b)/i.test(t)) return;
      const nx = bl[i + 1];
      if (!nx || nx.text.trim() === '✦' || CITE_LINE.test(nx.text.trim())) return;
      all.push({ uk: k, blockIdx: b.idx, at: i, text: t });
    });
  }
  const times = {}; for (const h of all) times[norm(h.text)] = (times[norm(h.text)] || 0) + 1;
  for (const h of all) if (times[norm(h.text)] === 1 && !titleNorm[norm(h.text)] && !titleNorm[norm(h.text.replace(/\s*\([^()]*\)$/, ''))]) headings.push(h);
}
// the title universe for near-twins: every unit's typed title and every heading
const universe = unitKeys.map((k) => ({ key: k, cls: titleNorm[norm(typedTitle(k))].concat(titleNorm[norm(unitTitle(k))] || []), cw: contentToks(typedTitle(k)) }))
  .concat(headings.map((h) => ({ key: 'h:' + h.uk + '#' + h.blockIdx, cls: ['h:' + h.uk + '#' + h.blockIdx], cw: contentToks(h.text) })));
const twinOfTitle = (key, cls, cw) => universe.find((u) => u.key !== key && !cls.includes(u.key) && !u.cls.some((x) => cls.includes(x)) && jacc(cw, u.cw) >= 0.6);
// punct-swap needs a mark inside a word (an apostrophe, a possessive s', a hyphen): a comma, colon or spaced dash typed
// as a space is just the lowercase form (Gate A: equals-easy), and & typed "and" changes the letters.
const PUNCT_SWAP = /\p{L}['’‘]\p{L}|\p{L}s['’‘](?!\p{L})|\p{L}[-‐‑]\p{L}/u;
const titleCands = [];
const titleWhy = {};
const drop = (why) => { titleWhy[why] = (titleWhy[why] || 0) + 1; return null; };
const oldTitleUnits = new Set([...oldUnits].flatMap((k) => [k, ...(titleNorm[norm(unitTitle(k))] || [])]));
function titleCand(kind, key, col, title, extra) {
  const cw = contentToks(title);
  if (!cw.length) return drop('no content word');
  if (INTRO.test(title.trim())) return drop('introduction/preface');
  if (verseWords(title)) return drop("a verse's own words");
  const cls = kind === 'heading' ? [key] : titleNorm[norm(title)];
  if (kind !== 'heading') {
    if (cls.some((k) => oldTitleUnits.has(k))) return drop('a 500/fresh unit target');
    if (cls.some((k) => k.startsWith('holydays/') && k === key)) return drop('holy days');
    const others = cls.filter((k) => k !== key);
    if (kind === 'study' && others.length) return drop('study chapter title equals another title');
    if (others.some((k) => !reprints(key, k))) return drop('a title different texts share');
    if (others.some((k) => TIER_OF(k.slice(0, k.indexOf('/'))) < TIER_OF(col === 'answers-heading' ? 'answers' : col))) return drop('a reprint of a better-tier original');
  }
  if (twinOfTitle(kind === 'heading' ? 'h:' + key : key, cls, cw)) return drop('near-twin title');
  const tt = toks(title);
  return {
    kind, key, col, title, cls, ...extra, nTok: tt.length, nContent: cw.length,
    oneContent: cw.length === 1, number: holdsNumber(title), article: ARTICLE.test(title), words3: tt.length >= 3,
    long: cw.length >= 5 || /[:—–(]|\.\.\.|…| - /.test(title), punct: PUNCT_SWAP.test(title),
    has5: tt.some((w) => w.replace(/(?:ing|ed|s)$/, '').length >= 5), // the brief: 5+ letters even without -s/-ed/-ing
  };
}
for (const k of unitKeys) {
  const col = k.slice(0, k.indexOf('/'));
  if (col === 'holydays') { drop('holy days'); continue; }
  if (LETTERS.includes(col) && unitBlocks[k][0].num == null) { drop('introduction/preface'); continue; }
  const kind = col === 'bible-studies' ? 'study' : 'unit';
  const c = titleCand(kind, k, col, typedTitle(k), { uk: k, fullTitle: unitTitle(k) });
  if (c) titleCands.push(c);
}
for (const h of headings) {
  if (oldSent.has(norm(h.text))) { drop('a 500/fresh heading target'); continue; }
  const c = titleCand('heading', h.uk + '#' + h.blockIdx, 'answers-heading', h.text, { uk: h.uk, blockIdx: h.blockIdx, at: h.at });
  if (c) titleCands.push(c);
}
const titlePools = {};
for (const c of titleCands) (titlePools[c.col] || (titlePools[c.col] = [])).push(c);
for (const k of Object.keys(titlePools).sort()) titlePools[k] = shuffle(titlePools[k]);
say(`title candidates: ${titleCands.length} (${headings.length} Answers headings no unit's title before filters); dropped: ` + Object.entries(titleWhy).map(([k, v]) => `${k} ${v}`).join(', '));
say('title pools: ' + Object.keys(MIX.title).map((k) => `${k} ${(titlePools[k] || []).length}`).join(', '));

// ── form eligibility ──
const blockOf = (c) => unitBlocks[c.uk].find((b) => b.idx === c.blockIdx);
// Each form is given only to a sentence where a query of that form can exist under Gate A's own counts (content = not
// in lex FUNCTION) and the brief's (common-words: the brief's small-word list); a second instrument checks it by
// enumerating runs through gateA itself.
function commonWindow(c) {
  for (let n = 5; n <= 7; n++) for (let i = 0; i + n <= c.nTok; i++) {
    if (!c.u4pos.some((p) => p >= i && p + 4 <= i + n)) continue;
    const win = c.w.slice(i, i + n); const f = win.filter((x) => BRIEF_SMALL.has(x)).length;
    if (f >= 0.6 * n && f < n) return true;
  }
  return false;
}
const content2 = (w, i, n) => i >= 0 && n > 0 && i + n <= w.length && w.slice(i, i + n).filter(isContent).length >= 2;
/** A 5-8 word run with 2+ content words where the form puts it: from the first word (start), onto the last (end), or
    touching neither (middle). The longest window is enough: a shorter one never holds more content words. */
function placedRun(c, form) {
  const N = c.nTok;
  if (form === 'start') return N >= 5 && content2(c.w, 0, Math.min(8, N));
  if (form === 'end') return N >= 5 && content2(c.w, Math.max(0, N - 8), Math.min(8, N));
  for (let i = 1; i + 5 <= N - 1; i++) if (content2(c.w, i, Math.min(8, N - 1 - i))) return true;
  return false;
}
/** rare-short: a class-only 3-gram that, alone or with one word either side, holds 2+ content words. */
const rareShort = (c) => c.u3pos.some((j) => content2(c.w, j, 3) || content2(c.w, j - 1, 4) || content2(c.w, j, 4));
/** The two-sentence span a boundary or merged target names: prose, this sentence and the next in its block; a verse,
    two sentences inside it (boundary) or it and the next verse (merged). */
function span(c, form) {
  if (c.src === 'prose') {
    if (!c.nxt) return null;
    const n2 = toks(c.nxt.text).length;
    if (n2 < (form === 'merged' ? 6 : 3)) return null;
    const text = blockOf(c).text.slice(c.off, c.nxt.end);
    return { text, first: c.text, second: c.nxt.text, rare: c.nxtRare4 };
  }
  if (form === 'boundary') {
    const ss = sentences(c.text);
    for (let i = 0; i + 1 < ss.length; i++) if (toks(ss[i].text).length >= 3 && toks(ss[i + 1].text).length >= 3) return { text: c.text.slice(ss[i].start, ss[i + 1].end), first: ss[i].text, second: ss[i + 1].text, rare: [] };
    return null;
  }
  const nv = c.nxtVerse;
  if (!nv || toks(nv.text).length < 6) return null;
  return { text: c.text + ' ' + nv.text, first: c.text, second: nv.text, rare: c.nxtRare4, pair: nv };
}
function sentFormOk(c, style, tier, form, relax) {
  if (style === 'misremembered' && wc(c.text) < 10) return false;
  if (tier === 'hard' && !c.hard) return false;
  switch (form) {
    case 'long-run': return c.nTok >= 13 && c.nContent >= 6;
    case 'short-sentence': return c.nTok >= 9 && c.nTok <= 14 && c.nContent >= 4;
    case 'pasted-quoted': return c.nTok >= 9 && c.nContent >= 4 && /[,;:!?’'"“”—–-]/.test(c.text.slice(0, -1));
    case 'start': case 'end': return c.nTok >= 8 && c.nContent >= 3 && placedRun(c, form);
    case 'middle': return c.nTok >= 10 && c.nContent >= 3 && placedRun(c, form);
    case 'rare-short': return rareShort(c);
    case 'common-words': return commonWindow(c);
    case 'boundary': case 'merged': return !!span(c, form);
    case 'typed-forms': return typedStrength(c.text) >= (relax ? 1 : 2);
    case 'one-slip': case 'two-three-slips': case 'many-slips': case 'half': return c.nTok >= 10;
    case 'reordered': return /[,;:]/.test(c.text.slice(0, -1)) || / (and|but|for|that|because|when|if|so|which|who) /i.test(c.text);
    case 'register': return swappableCount(c.text) >= 2;
    default: throw new Error('form ' + form);
  }
}
function titleFormOk(c, tier, form) {
  if (tier !== 'easy' && c.oneContent) return false;
  switch (form) {
    case 'lowercase': case 'as-written': return true;
    case 'article-dropped': return c.article && c.words3;
    case 'word-dropped': return c.words3;
    case 'memorable-part': return c.long && c.nTok >= 4;
    case 'number-swap': return c.number;
    case 'punct-swap': return c.punct && c.nTok <= 10; // typed whole (Gate A), so short enough to type whole
    case 'words-wrong': case 'collection-word': return true;
    case 'reordered': return c.nTok >= 3;
    case 'typo': return c.has5;
    case 'dropped-wrong': return c.words3;
    default: throw new Error('form ' + form);
  }
}

if (argv.includes('--eligible')) {
  for (const tier of TIERS) for (const f of Object.keys(FORMS.title[tier])) say(`title ${tier} ${f}: ` + Object.keys(MIX.title).map((col) => `${col} ${(titlePools[col] || []).filter((c) => titleFormOk(c, tier, f)).length}`).join(' '));
  for (const style of ['exact', 'misremembered']) for (const tier of TIERS) for (const f of Object.keys(FORMS[style][tier])) say(`${style} ${tier} ${f}: ` + Object.keys(SENT_MIX).map((col) => `${col} ${(sentPools[col] || []).filter((c) => sentFormOk(c, style, tier, f, false)).length}`).join(' '));
}
// ── slots: every target to draw, by style, split, tier, collection; forms assigned with eligibility in view ──
const ELIGIBLE = new Map(); // style|tier|col|form -> how many in the pool can take it
const PLANNED = new Map(); // style|col|form -> slots given that form so far (over every split and the reserves)
const slots = [];
const plan = {}; // style -> split -> tier -> col -> n (allocation, for the tallies)
for (const style of STYLES) {
  plan[style] = {};
  for (const split of SPLITS) {
    const n = Object.values(TIER_N[split]).reduce((a, b) => a + b, 0);
    const colsN = split === 'open' ? MIX[style] : lr(MIX[style], n);
    const cells = lr2(TIER_N[split], colsN);
    plan[style][split] = cells;
    for (const tier of TIERS) {
      const bucket = [];
      for (const [col, k] of Object.entries(cells[tier])) for (let i = 0; i < k; i++) bucket.push({ style, split, tier, col, group: groupOf(style, col), reserve: false });
      // reserves: 25% per stratum (style x tier x group) of open and held; fresh 3 per style x tier
      const res = [];
      const byGroup = {};
      for (const s of bucket) (byGroup[s.group] || (byGroup[s.group] = [])).push(s.col);
      const rN = split === 'fresh' ? lr(Object.fromEntries(Object.entries(byGroup).map(([gname, cs]) => [gname, cs.length])), FRESH_RESERVE)
        : Object.fromEntries(Object.entries(byGroup).map(([gname, cs]) => [gname, Math.ceil(RESERVE * cs.length)]));
      for (const [gname, k] of Object.entries(rN)) {
        const colW = {}; for (const cName of byGroup[gname]) colW[cName] = (colW[cName] || 0) + 1;
        for (const [col, m] of Object.entries(lr(colW, k))) for (let i = 0; i < m; i++) res.push({ style, split, tier, col, group: gname, reserve: true });
      }
      for (const set of [bucket, res]) {
        if (!set.length) continue;
        const forms = lr(FORMS[style][tier], set.length);
        assignForms(style, tier, shuffle(set), forms);
        slots.push(...set);
      }
    }
  }
}
function eligibleCount(style, tier, col, form) {
  const key = style + '|' + tier + '|' + col + '|' + form;
  if (ELIGIBLE.has(key)) return ELIGIBLE.get(key);
  const pool = style === 'title' ? titlePools[col] || [] : sentPools[col] || [];
  const n = pool.filter((c) => (style === 'title' ? titleFormOk(c, tier, form) : sentFormOk(c, style, tier, form, false))).length;
  ELIGIBLE.set(key, n);
  return n;
}
function assignForms(style, tier, set, forms) {
  const multiset = Object.entries(forms).flatMap(([f, k]) => Array(k).fill(f));
  const scarcity = (f) => set.reduce((a, s) => a + eligibleCount(style, tier, s.col, f), 0);
  const sc = Object.fromEntries(Object.keys(forms).map((f) => [f, scarcity(f)]));
  multiset.sort((a, b) => sc[a] - sc[b] || (a < b ? -1 : 1));
  for (const f of multiset) {
    const k = (x) => style + '|' + x.col + '|' + f;
    let s = set.find((x) => !x.form && eligibleCount(style, tier, x.col, f) > (PLANNED.get(k(x)) || 0));
    if (!s) s = set.find((x) => !x.form);
    s.form = f;
    PLANNED.set(k(s), (PLANNED.get(k(s)) || 0) + 1);
  }
}

// ── draw: all slots in one seeded order; a class at most once ──
const used = new Set(); // rare 4-gram hashes of drawn sentence targets (and their spans)
const usedVerse = new Set();
const usedTitle = new Set(); // title class keys
const oneWord = { open: 0, held: 0, fresh: 0 };
const taken = new Set();
const free = (c) => !taken.has(c) && !c.rare4.some((h) => used.has(h)) && !(c.src === 'verse' && usedVerse.has(twinOf(c.uk)));
function drawSentence(slot, col, relax) {
  for (const c of sentPools[col] || []) {
    if (!free(c) || !sentFormOk(c, slot.style, slot.tier, slot.form, relax)) continue;
    let sp = null;
    if (slot.form === 'boundary' || slot.form === 'merged') {
      sp = span(c, slot.form);
      if (sp.rare.some((h) => used.has(h) || oldUsed.has(h))) continue;
      if (sp.pair && (usedVerse.has(twinOf(sp.pair.uk)) || oldVerse.has(twinOf(sp.pair.uk)))) continue;
    }
    taken.add(c);
    for (const h of c.rare4) used.add(h);
    if (c.src === 'verse') usedVerse.add(twinOf(c.uk));
    if (sp) { for (const h of sp.rare) used.add(h); if (sp.pair) usedVerse.add(twinOf(sp.pair.uk)); }
    return { c, sp, rare: [...new Set(c.rare4.concat(sp ? sp.rare : []))] };
  }
  return null;
}
// A title only a few forms can use (a number, a long or punctuated one) is kept for those forms while others are left.
const precious = (c, form) => (c.number && form !== 'number-swap') || (c.long && c.nTok >= 4 && form !== 'memorable-part');
function drawTitle(slot, col) {
  return drawTitle1(slot, col, true) || drawTitle1(slot, col, false);
}
function drawTitle1(slot, col, keep) {
  for (const c of titlePools[col] || []) {
    if (taken.has(c) || c.cls.some((k) => usedTitle.has(k)) || !titleFormOk(c, slot.tier, slot.form)) continue;
    if (keep && precious(c, slot.form)) continue;
    if (c.oneContent && oneWord[slot.split] >= ONE_WORD_CAP[slot.split]) continue;
    taken.add(c);
    for (const k of c.cls) usedTitle.add(k);
    if (c.oneContent) oneWord[slot.split]++;
    return { c };
  }
  return null;
}
const gaps = [];
// Seeded order, scarce forms first (number-swap, memorable-part, register, typed-forms...), so a common form never
// takes the few targets a scarce one can use.
const scarce = (s) => Object.keys(MIX[s.style]).reduce((a, col) => a + eligibleCount(s.style, s.tier, col, s.form), 0);
// Cases before reserves and open before held before fresh, so a collection with too few (Blessed has 4 titles) fills
// the open mix first and a short split takes its gap from letters.
const order = shuffle(slots).map((s, i) => [s, (s.reserve ? 3 : 0) + SPLITS.indexOf(s.split), scarce(s), i])
  .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]).map(([s]) => s);
for (const slot of order) {
  const draw = (col, relax) => (slot.style === 'title' ? drawTitle(slot, col) : drawSentence(slot, col, relax));
  let got = draw(slot.col, false) || (slot.form === 'typed-forms' ? draw(slot.col, true) : null);
  if (!got) {
    // A stratum that runs short takes its gap from letters: the letter collection with the most left for this form.
    const left = (col) => (slot.style === 'title' ? (titlePools[col] || []).filter((c) => !taken.has(c) && titleFormOk(c, slot.tier, slot.form)).length
      : (sentPools[col] || []).filter((c) => free(c) && sentFormOk(c, slot.style, slot.tier, slot.form, true)).length);
    const from = slot.col;
    for (const col of LETTERS.slice().sort((a, b) => left(b) - left(a) || (a < b ? -1 : 1))) { got = draw(col, false) || draw(col, true); if (got) { slot.col = col; slot.group = 'letters'; break; } }
    // letters have none for this form either (number-swap): the collection with the most left
    if (!got) for (const col of Object.keys(MIX[slot.style]).sort((a, b) => left(b) - left(a) || (a < b ? -1 : 1))) { got = draw(col, false) || draw(col, true); if (got) { slot.col = col; slot.group = groupOf(slot.style, col); break; } }
    if (!got) throw new Error(`no target for ${slot.style}/${slot.split}/${slot.tier}/${from}/${slot.form}`);
    slot.gapFrom = from;
    gaps.push(`${slot.style}/${slot.split}${slot.reserve ? '-reserve' : ''}/${slot.tier} ${from} -> ${slot.col} (${slot.form})`);
  }
  slot.got = got;
}

// ── target records ──
function passageOf(c, sp) {
  if (c.src === 'verse') {
    const [vol] = c.uk.split('/');
    const at = (v) => verseDoc.get(vol + '/' + c.bookId + ':' + c.chapter + ':' + v);
    const parts = [c.text].concat(sp && sp.pair ? [sp.pair.text] : []);
    let lo = c.verse - 1; let hi = c.verse + (sp && sp.pair ? 2 : 1);
    for (let grow = true; grow;) {
      grow = false;
      const a = at(lo); if (a && parts.join(' ').length + a.text.length < 1200) { parts.unshift(a.text); lo--; grow = true; }
      const b = at(hi); if (b && parts.join(' ').length + b.text.length < 1200) { parts.push(b.text); hi++; grow = true; }
    }
    return parts.join(' ');
  }
  const text = blockOf(c).text;
  if (text.length <= 1200) return text;
  const ss = sentences(text);
  const rem = sp ? sp.text : c.text;
  let i = ss.findIndex((s) => s.end > c.off); let j = ss.findIndex((s) => s.end >= c.off + rem.length);
  if (i < 0) i = 0; if (j < 0) j = ss.length - 1;
  for (let grow = true; grow;) {
    grow = false;
    if (i > 0 && ss[j].end - ss[i - 1].start <= 1200) { i--; grow = true; }
    if (j + 1 < ss.length && ss[j + 1].end - ss[i].start <= 1200) { j++; grow = true; }
  }
  return text.slice(ss[i].start, ss[j].end);
}
function openingOf(c) {
  const bl = unitBlocks[c.uk];
  const from = c.kind === 'heading' ? c.at + 1 : 0;
  const parts = [];
  for (let i = from; i < bl.length; i++) {
    const t = bl[i].text.trim();
    if (c.kind === 'heading' && t === '✦') break;
    if (!t || t === '✦' || CITE_LINE.test(t) || /^\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t) || /image$/.test(bl[i].type)) continue;
    parts.push(t);
    if (parts.join(' ').length >= 300) break;
  }
  // a study chapter of prophecy groups only (More Than a Man) has no prose block: its labels and verses, in order
  if (!parts.length && c.uk.startsWith('bible-studies/')) {
    const ch = globalThis.BIBLE_STUDIES.flatMap((S) => S.chapters || []).find((x) => 'bible-studies/' + x.id === c.uk);
    const walk = (o) => { if (parts.join(' ').length >= 300 || o == null) return; if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o !== 'object') return;
      if (typeof o.label === 'string' && o.label.trim()) parts.push(o.label.trim()); if (typeof o.v === 'string' && o.v.trim()) parts.push(o.v.replace(/\{\{(?:ref:)?([^}]*)\}\}/g, '$1').trim());
      for (const [k, v] of Object.entries(o)) if (k !== 'label' && k !== 'v' && typeof v === 'object') walk(v); };
    walk(ch && ch.blocks);
  }
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 300);
}
const targets = [];
for (const s of slots) {
  const { c, sp } = s.got;
  const t = { id: null, split: s.split, reserve: s.reserve, style: s.style, tier: s.tier, form: s.form, group: s.group, col: s.col, collection: COL_LABEL[s.col] };
  if (s.gapFrom) t.gapFrom = s.gapFrom;
  Object.defineProperty(t, 'rare', { value: s.got.rare || [], enumerable: false });
  if (s.style === 'title') {
    if (c.kind === 'heading') Object.assign(t, { level: 'sentence', col: 'answers', titleCol: 'answers-heading', uk: c.uk, unit: c.uk.slice(8), blockIdx: c.blockIdx, title: c.title, sentence: c.title });
    else Object.assign(t, { level: 'unit', col: c.uk.slice(0, c.uk.indexOf('/')), titleCol: s.col, uk: c.uk, unit: unitBlocks[c.uk][0].unit, title: c.title, fullTitle: c.fullTitle, num: unitBlocks[c.uk][0].num ?? null });
    t.opening = openingOf(c);
    t.meta = { words: c.nTok, content: c.nContent, oneContent: c.oneContent, number: c.number, article: c.article, long: c.long, punct: c.punct, classSize: c.cls.length };
  } else {
    const remembered = sp ? sp.text : c.text;
    if (c.src === 'verse') {
      Object.assign(t, { level: 'verse', col: c.uk.slice(0, c.uk.indexOf('/')), sentCol: s.col, uk: c.uk, ref: c.ref, bookId: c.bookId, chapter: c.chapter, verse: c.verse, sentence: remembered });
      if (sp && sp.pair) Object.assign(t, { uk2: sp.pair.uk, verse2: sp.pair.verse, ref2: sp.pair.ref });
    } else {
      const b = blockOf(c);
      Object.assign(t, { level: 'sentence', uk: c.uk, unit: b.unit, title: b.title, num: b.num ?? null, blockIdx: c.blockIdx, sentence: remembered });
    }
    t.remembered = remembered;
    if (sp) t.span = { first: sp.first, second: sp.second };
    t.passage = passageOf(c, sp);
    t.meta = { words: c.nTok, content: c.nContent, classProse: c.clsProse, uniq4: c.uniq4, uniq3c: c.uniq3c, swappable: swappableCount(c.text), typed: typedStrength(c.text) };
  }
  targets.push(t);
}
// ids: one sequence per style over every split and the reserves, in seeded order, so an id does not tell its split
for (const style of STYLES) {
  const pre = { exact: 'e', misremembered: 'm', title: 'n' }[style];
  shuffle(targets.filter((t) => t.style === style)).forEach((t, i) => { t.id = pre + String(i + 1).padStart(3, '0'); });
}
targets.sort((a, b) => (a.id < b.id ? -1 : 1));

// ── packets: one style x tier, 20 targets, collections shuffled; reserves in their own packets ──
const packetTarget = (t) => (t.style === 'title' ? { id: t.id, form: t.form, collection: t.collection, title: t.title, opening: t.opening }
  : { id: t.id, form: t.form, collection: t.collection, remembered: t.remembered, passage: t.passage });
const packets = [];
for (const split of ['open', 'held']) for (const style of STYLES) for (const tier of TIERS) for (const reserve of [false, true]) {
  const ts = shuffle(targets.filter((t) => t.split === split && t.style === style && t.tier === tier && t.reserve === reserve));
  for (let i = 0; i < ts.length; i += 20) {
    const name = `${style}-${tier}-${reserve ? 'r' : ''}${String(i / 20 + 1).padStart(2, '0')}`;
    packets.push({ dir: reserve ? path.join(PACKETS, 'reserve', split) : path.join(PACKETS, split), body: { packet: name, split, style, tier, targets: ts.slice(i, i + 20).map(packetTarget) } });
  }
}
// fresh (PLAN 1.4): one packet per style x tier, its 10 targets and its 3 reserves shuffled together (one writer call
// each); targets.json, not the packet, says which are reserves, so the writer cannot tell
for (const style of STYLES) for (const tier of TIERS) {
  const ts = shuffle(targets.filter((t) => t.split === 'fresh' && t.style === style && t.tier === tier));
  packets.push({ dir: path.join(PACKETS, 'fresh'), body: { packet: `${style}-${tier}-01`, split: 'fresh', style, tier, targets: ts.map(packetTarget) } });
}
for (const p of packets) for (const t of p.body.targets) targets.find((x) => x.id === t.id).packet = p.body.packet;

// ── tallies, checked against PLAN 1.3 ──
const checks = [];
const check = (ok, what) => { checks.push([ok, what]); say(`  ${ok ? 'OK  ' : 'FAIL'} ${what}`); };
const count = (f) => targets.filter(f).length;
say('');
say(`TRI TARGETS seed ${SEED}: ${targets.length} (${count((t) => !t.reserve)} cases + ${count((t) => t.reserve)} reserves); ${packets.length} packets`);
for (const style of STYLES) {
  say(`\n== ${style} ==`);
  for (const split of SPLITS) {
    const main = (t) => t.style === style && t.split === split && !t.reserve;
    const tierN = Object.fromEntries(TIERS.map((tier) => [tier, count((t) => main(t) && t.tier === tier)]));
    check(TIERS.every((tier) => tierN[tier] === TIER_N[split][tier]), `${split} tiers ${TIERS.map((x) => x + ' ' + tierN[x]).join(', ')} (PLAN ${TIERS.map((x) => TIER_N[split][x]).join('/')})`);
    for (const tier of TIERS) {
      const want = split === 'open' ? FORMS[style][tier] : lr(FORMS[style][tier], TIER_N[split][tier]);
      const got = Object.fromEntries(Object.keys(want).map((f) => [f, count((t) => main(t) && t.tier === tier && t.form === f)]));
      check(Object.keys(want).every((f) => got[f] === want[f]), `${split} ${tier} forms: ${Object.keys(want).map((f) => `${f} ${got[f]}`).join(', ')}${split === 'open' ? '' : ' (in proportion: ' + Object.values(want).join('/') + ')'}`);
    }
    const colWant = split === 'open' ? MIX[style] : lr(MIX[style], Object.values(TIER_N[split]).reduce((a, b) => a + b, 0));
    const colOf = (t) => (style === 'title' ? t.titleCol : t.sentCol || t.col);
    const colGot = Object.fromEntries(Object.keys(colWant).map((k) => [k, count((t) => main(t) && colOf(t) === k)]));
    const gapN = count((t) => main(t) && t.gapFrom);
    check(Object.keys(colWant).every((k) => colGot[k] + count((t) => main(t) && t.gapFrom === k) - count((t) => main(t) && t.gapFrom && colOf(t) === k) === colWant[k]),
      `${split} collections: ${Object.keys(colWant).map((k) => `${k} ${colGot[k]}`).join(', ')}${gapN ? ` (${gapN} gaps taken from letters)` : ''}`);
    if (split === 'open') {
      const gN = Object.fromEntries(Object.keys(GROUP_N[style]).map((gname) => [gname, count((t) => main(t) && groupOf(style, colOf(t)) === gname)]));
      say(`       groups: ${Object.entries(gN).map(([k, v]) => `${k} ${v}`).join(', ')} (PLAN ${Object.entries(GROUP_N[style]).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    }
    const res = targets.filter((t) => t.style === style && t.split === split && t.reserve);
    const resWant = split === 'fresh' ? FRESH_RESERVE * 3 : TIERS.reduce((a, tier) => { const byG = {}; for (const t of targets.filter((x) => main(x) && x.tier === tier)) byG[t.gapFrom ? groupOf(style, t.gapFrom) : t.group] = (byG[t.gapFrom ? groupOf(style, t.gapFrom) : t.group] || 0) + 1; return a + Object.values(byG).reduce((s, n) => s + Math.ceil(RESERVE * n), 0); }, 0);
    check(res.length === resWant, `${split} reserves ${res.length} (${split === 'fresh' ? '3 per tier' : '25% per style x tier x group, rounded up'}: ${resWant}); by tier ${TIERS.map((tier) => res.filter((t) => t.tier === tier).length).join('/')}`);
  }
  if (style === 'title') {
    for (const split of SPLITS) {
      const one = targets.filter((t) => t.style === 'title' && t.split === split && t.meta.oneContent);
      check(one.every((t) => t.tier === 'easy') && one.filter((t) => !t.reserve).length <= ONE_WORD_CAP[split], `${split} one-content-word titles ${one.filter((t) => !t.reserve).length} (+${one.filter((t) => t.reserve).length} reserve), all easy, cap ${ONE_WORD_CAP[split]}`);
    }
    check(count((t) => t.style === 'title' && t.col === 'holydays') === 0, 'no Holy Days title');
    check(count((t) => t.style === 'title' && t.form === 'number-swap' && !t.meta.number) === 0 && count((t) => t.style === 'title' && t.form === 'article-dropped' && !t.meta.article) === 0, 'number-swap only on numbered titles, article-dropped only on The/A/Regarding');
  } else {
    const ts = targets.filter((t) => t.style === style);
    check(ts.every((t) => t.level === 'verse' || ['sentence'].includes(t.level)), 'every target a sentence or a verse');
    check(ts.filter((t) => t.form === 'boundary' || t.form === 'merged').every((t) => t.span), 'every boundary and merged target names its two-sentence span');
    if (style === 'misremembered') {
      check(ts.every((t) => wc(t.span ? t.span.first : t.remembered) >= 10), 'misremembered sentences of 10+ words');
      check(ts.filter((t) => t.form === 'register').every((t) => t.meta.swappable >= 2), 'register only where 2+ words can swap');
    }
    check(ts.filter((t) => t.tier === 'hard').every((t) => t.meta.uniq3c >= 3), 'hard targets hard-capable (3+ class-only 3-grams with 2 content words)');
    const cs = (t) => (t.meta.classProse <= 1 ? '1' : t.meta.classProse <= 3 ? '2-3' : '4-8');
    const csN = {}; for (const t of ts.filter((x) => x.level === 'sentence')) csN[cs(t)] = (csN[cs(t)] || 0) + 1;
    say(`       prose class sizes: ${Object.entries(csN).sort().map(([k, v]) => `${k} text${k === '1' ? '' : 's'} ${v}`).join(', ')}`);
  }
}
say('\n== exclusions ==');
{
  const sentT = targets.filter((t) => t.style !== 'title');
  const seenH = new Map(); let clash = 0; let old = 0;
  for (const t of sentT) for (const h of t.rare) { if (seenH.has(h) && seenH.get(h) !== t.id) clash++; seenH.set(h, t.id); if (oldUsed.has(h)) old++; }
  check(clash === 0 && old === 0, `no class twice across exact and misremembered, none a 500/fresh class (rare 4-grams, in 8 texts or fewer, shared by two targets: ${clash}; with a 500/fresh target: ${old})`);
  check(sentT.every((t) => !oldSent.has(norm(t.remembered)) && !(t.level === 'verse' && oldVerse.has(twinOf(t.uk))) && !oldUnits.has(t.uk)), 'no sentence target in a 500/fresh class (sentence, verse, unit)');
  const ttl = targets.filter((t) => t.style === 'title');
  check(new Set(ttl.map((t) => t.uk + '#' + (t.blockIdx ?? ''))).size === ttl.length && ttl.every((t) => !oldTitleUnits.has(t.uk) || t.level === 'sentence'), 'no title twice, none a 500/fresh unit target');
  check(targets.every((t) => !/hidden|manna/i.test(t.col) && !/^hidden/i.test(t.uk)), 'no Hidden Manna');
  check(new Set(targets.map((t) => t.id)).size === targets.length, 'ids unique');
  check(packets.every((p) => p.body.targets.length <= 20 && new Set(p.body.targets.map((x) => x.id)).size === p.body.targets.length), `packets of at most 20: ${packets.map((p) => p.body.targets.length).join(' ')}`);
  check(packets.every((p) => p.body.targets.every((x) => { const t = targets.find((y) => y.id === x.id); return t.split === p.body.split && t.style === p.body.style && t.tier === p.body.tier; })), 'every packet one split x style x tier');
  const fp = packets.filter((p) => p.body.split === 'fresh');
  const fpOk = fp.length === 9 && fp.every((p) => p.body.targets.length === 13 && p.body.targets.filter((x) => targets.find((y) => y.id === x.id).reserve).length === FRESH_RESERVE);
  check(fpOk, `fresh packets: ${fp.length} (one per style x tier), each 10 targets + ${FRESH_RESERVE} reserves: ${fp.map((p) => p.body.targets.length).join(' ')}`);
  check(packets.filter((p) => p.body.split !== 'fresh').every((p) => p.body.targets.every((x) => targets.find((y) => y.id === x.id).reserve === /-r\d+$/.test(p.body.packet))), 'open and held packets hold cases or reserves, never both');
  check(targets.filter((t) => t.passage).every((t) => t.passage.length <= 1200 && t.passage.includes(t.style === 'title' ? '' : (t.span ? t.span.first : t.remembered).slice(0, 40))), 'passages at most 1,200 characters, holding the remembered text');
  check(targets.filter((t) => t.opening != null).every((t) => t.opening.length <= 300 && t.opening.length > 0), 'title openings 1-300 characters');
}
if (gaps.length) { say('gaps taken from letters:'); for (const gline of gaps) say('  ' + gline); }
const failed = checks.filter(([ok]) => !ok).length;
say(`\n${failed ? 'TALLY CHECKS FAILED: ' + failed : 'ALL TALLY CHECKS OK'} (${checks.length} checks, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

if (!DRY) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, made: 'make-tri.mjs, PLAN 1.3 (search200, 2026-10-18)', counts: { targets: targets.length, cases: count((t) => !t.reserve), reserves: count((t) => t.reserve) }, targets }, null, 1) + '\n');
  for (const d of [path.join(PACKETS, 'open'), path.join(PACKETS, 'held'), path.join(PACKETS, 'fresh'), path.join(PACKETS, 'reserve', 'open'), path.join(PACKETS, 'reserve', 'held')]) {
    fs.mkdirSync(d, { recursive: true });
    for (const f of fs.readdirSync(d)) if (/^(exact|misremembered|title)-(easy|medium|hard)-r?\d+\.json$/.test(f)) fs.unlinkSync(path.join(d, f));
  }
  for (const p of packets) fs.writeFileSync(path.join(p.dir, p.body.packet + '.json'), JSON.stringify(p.body, null, 1) + '\n');
  fs.mkdirSync(path.dirname(TALLIES), { recursive: true });
  fs.writeFileSync(TALLIES, log.join('\n') + '\n');
  console.log(`wrote ${OUT}, ${packets.length} packets under ${PACKETS}, tallies ${TALLIES}`);
}
process.exit(failed ? 1 : 0);
