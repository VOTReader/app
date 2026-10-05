/* Seeded, stratified pick of the 500 search-benchmark targets (2026-10-05).
   ─────────────────────────────────────────────────────────────────
   What a reader might remember, by collection and by the way people search
   (search-plan.md §3). Writes targets.json: each target names what it is, the
   one query STYLE its blind writer must use, and the text the writer is shown.
   The queries themselves are written by agents that never see the engine
   (writer-brief.md); this file only decides WHAT is remembered.

     node tools/search-bench/make-targets.mjs [--seed 20261005]

   Re-running with the same seed and corpus gives the same targets.
   ─────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docs as buildDocs, blocks as buildBlocks, kjvVerses, unitKey, norm, sentences } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const seedArg = process.argv.indexOf('--seed');
let seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20261005;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const words = (s) => (String(s).match(/\S+/g) || []).length;

const D = await buildDocs('nkjv');
const B = await buildBlocks();
const KJV = kjvVerses();

// One string per side for fast containment counts (how many units hold a sentence).
const prose = D.filter((d) => d.kind !== 'verse');
const proseNorm = prose.map((d) => norm(d.text));
const PROSE = proseNorm.join('\u0001');
const unitsHolding = (s) => {
  const n = norm(s); const out = new Set();
  let p = PROSE.indexOf(n);
  while (p >= 0) { out.add(PROSE.slice(0, p).split('\u0001').length - 1); p = PROSE.indexOf(n, p + 1); if (out.size > 20) break; }
  return out.size;
};

const COL_LABEL = {
  v1: 'Volume One', v2: 'Volume Two', v3: 'Volume Three', v4: 'Volume Four', v5: 'Volume Five', v6: 'Volume Six',
  v7: 'Volume Seven', timothy: 'Letters from Timothy', flock: "Letters to The Lord's Little Flock", rebuke: "The Lord's Rebuke",
  wtlb1: 'Words To Live By: Part One', wtlb2: 'Words To Live By: Part Two', blessed: 'The Blessed', holydays: 'Holy Days',
  answers: 'Answers Only God Can Give', 'bible-studies': 'Bible / Letter Studies',
};
const byCol = {};
for (const b of B) (byCol[b.col] || (byCol[b.col] = [])).push(b);
const unitBlocks = {};
for (const b of B) (unitBlocks[b.uk] || (unitBlocks[b.uk] = [])).push(b);
const STOCK = /^(thus says the lord|says the lord|behold|the word of the lord|this question was asked)[^.:!?]*[:.!?]?\s*/i;
// Apparatus, not text a reader remembers: Answers' source footers ("~ [From “Offerings” ~ ...]") and the dated
// header lines ("7/5/10 From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy ...").
const APPARATUS = /~|^\[?from\b.*(volume|words to live by|letters|rebuke|blessed|holy days)|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|word of the lord spoken to timothy/i;

// ── style quotas per collection group (search-plan.md §3: 500 targets, 10 styles) ──
const PLAN = {
  bible: { crossover: 40, exact: 15, misremembered: 15, paraphrase: 20, rare: 10, typos: 10 },
  letters: { middle: 25, title: 15, firstwords: 25, exact: 30, misremembered: 30, paraphrase: 30, rare: 20, gist: 10, typos: 5 },
  words: { title: 8, exact: 15, misremembered: 15, paraphrase: 15, rare: 10, gist: 10, typos: 7 },
  answers: { middle: 25, title: 7, exact: 7, misremembered: 7, paraphrase: 5, rare: 5, gist: 4 },
  studies: { title: 5, exact: 8, misremembered: 8, paraphrase: 5, rare: 5, gist: 6, typos: 3 },
  cross: { unitgist: 20 },
};
const LETTER_SPLIT = { v7: 50, rebuke: 22, v3: 18, flock: 18, v2: 16, v1: 16, v4: 14, v6: 12, v5: 10, timothy: 9 }; // + 5 prefaces (there are only 5, mostly short poetry lines)
const WORD_SPLIT = { wtlb1: 25, wtlb2: 30, blessed: 10, holydays: 15 };
const expand = (o) => Object.entries(o).flatMap(([k, n]) => Array(n).fill(k));

const used = new Set();
const targets = [];
const add = (t) => { targets.push({ id: 't' + String(targets.length + 1).padStart(3, '0'), ...t }); };

/** A sentence target in one block: 8-40 words, held by at most `maxUnits` units, not used before. */
function sentenceTarget(pool, { minBlockWords = 10, maxUnits = 3, middle = false, only = false } = {}) {
  for (let tries = 0; tries < 4000; tries++) {
    const b = pick(pool);
    if (words(b.text) < minBlockWords) continue;
    let ss = sentences(b.text).filter((s) => { const w = words(s.text); return w >= 8 && w <= 40 && !APPARATUS.test(s.text); });
    if (middle) ss = ss.filter((s) => s.start > b.text.length * 0.3 && s.end < b.text.length * 0.8);
    if (!ss.length) continue;
    const s = pick(ss);
    const key = b.uk + '#' + s.start;
    if (used.has(key)) continue;
    const n = unitsHolding(s.text);
    const cap = tries < 400 ? maxUnits : tries < 800 ? maxUnits * 2 : 12; // heavily reprinted collections relax
    if (n < 1 || n > cap || (only && n !== 1)) continue;
    used.add(key);
    return { b, s, holders: n };
  }
  throw new Error('no sentence target found in ' + (pool[0] && pool[0].col));
}

const proseTarget = (group, col, style, b, s, holders) => add({
  group, col, collection: COL_LABEL[col], style, level: 'sentence', uk: b.uk, unit: b.unit, title: b.title, num: b.num ?? null,
  blockIdx: b.idx, blockText: b.text, sentence: s.text, holders,
});

// ── Bible: 60 OT, 50 NT; 30 KJV wording, 10 restored names, 10 Matthew Study ──
{
  const verses = D.filter((d) => d.kind === 'verse' && d.volumeId === 'bible' && d.bookId !== 'matthew-plain' && words(d.text) >= 8 && words(d.text) <= 40);
  const ot = verses.filter((v) => v.testament === 'ot');
  const nt = verses.filter((v) => v.testament === 'nt');
  const study = D.filter((d) => d.kind === 'verse' && d.volumeId === 'matthew-study' && words(d.text) >= 8 && words(d.text) <= 40);
  const kjvOf = (v) => { const ch = KJV[v.bookId] && KJV[v.bookId][String(v.chapterNum)]; const r = ch && ch.find((x) => x.n === v.verseNum); return r ? r.text : null; };
  const differs = (v) => { const k = kjvOf(v); if (!k) return false; const a = new Set(norm(v.text).trim().split(' ')); const kw = norm(k).trim().split(' '); return kw.filter((w) => !a.has(w)).length >= 3; };
  const styles = shuffle(expand(PLAN.bible).filter((s) => s !== 'crossover'));
  const slots = [];
  for (let i = 0; i < 30; i++) slots.push({ style: 'crossover', variant: 'kjv' });
  for (let i = 0; i < 10; i++) slots.push({ style: 'crossover', variant: 'restored-names' });
  styles.forEach((st, i) => slots.push({ style: st, variant: i < 10 ? 'matthew-study' : null }));
  let otLeft = 60;
  const seen = new Set();
  for (const sl of slots) {
    let v;
    for (let t = 0; t < 5000; t++) {
      if (sl.variant === 'matthew-study') v = pick(study);
      else if (sl.variant === 'restored-names') v = pick(nt.filter((x) => /\bJesus\b/.test(x.text) && x.bookId !== 'matthew'));
      else v = otLeft > 0 && (rnd() < 0.55 || sl.style === 'crossover') ? pick(ot) : pick(nt);
      const k = unitKey(v);
      if (seen.has(k)) continue;
      if (sl.variant === 'kjv' && !differs(v)) continue;
      seen.add(k); break;
    }
    if (v.testament === 'ot' && v.volumeId === 'bible') otLeft--;
    add({
      group: 'bible', col: v.volumeId, collection: v.volumeId === 'matthew-study' ? 'The Scriptures of Truth (Matthew Study Bible)' : 'Bible (NKJV)',
      style: sl.style, variant: sl.variant, level: 'verse', uk: unitKey(v), ref: v.ref, bookId: v.bookId, chapter: v.chapterNum, verse: v.verseNum,
      sentence: v.text, kjv: sl.variant === 'kjv' ? kjvOf(v) : undefined,
    });
  }
}

// ── Letters: 190 = per-volume split + 5 prefaces ──
{
  const prefaceUnits = B.filter((b) => b.num == null && LETTER_SPLIT[b.col] != null);
  const slots = [];
  for (const [col, n] of Object.entries(LETTER_SPLIT)) for (let i = 0; i < n; i++) slots.push({ col });
  for (let i = 0; i < 5; i++) slots.push({ col: 'preface' });
  const st = expand(PLAN.letters);
  const middle = st.filter((s) => s === 'middle');
  const rest = shuffle(st.filter((s) => s !== 'middle'));
  const v7 = slots.filter((s) => s.col === 'v7');
  v7.slice(0, middle.length).forEach((s) => { s.style = 'middle'; });
  // The prefaces are short poetry: only sentence styles fit them.
  for (const [i, pst] of ['firstwords', 'exact', 'misremembered', 'paraphrase', 'typos'].entries()) {
    rest.splice(rest.indexOf(pst), 1);
    slots.filter((s) => s.col === 'preface')[i].style = pst;
  }
  slots.filter((s) => !s.style).forEach((s, i) => { s.style = rest[i]; });
  for (const sl of slots) {
    const pool = sl.col === 'preface' ? prefaceUnits : byCol[sl.col].filter((b) => b.num != null);
    letterLike('letters', sl.col === 'preface' ? null : sl.col, sl.style, pool);
  }
}

function letterLike(group, col, style, pool) {
  if (style === 'title') {
    for (let n = 0; ; n++) {
      if (n > 20000) throw new Error('no title target in ' + col);
      const b = pick(pool);
      if (used.has('title:' + b.uk) || !b.title || words(b.title) < 2) continue;
      used.add('title:' + b.uk);
      return add({ group, col: b.col, collection: COL_LABEL[b.col], style, level: 'unit', uk: b.uk, unit: b.unit, title: b.title, num: b.num ?? null,
        blockText: (unitBlocks[b.uk] || []).slice(0, 3).map((x) => x.text).join('\n\n').slice(0, 1500) });
    }
  }
  if (style === 'firstwords') {
    for (let n = 0; ; n++) {
      if (n > 20000) throw new Error('no firstwords target in ' + col);
      const b = pick(pool);
      // The first block that opens with real text (Timothy's letters open on a dated header block).
      const opening = (x) => sentences(x.text).map((s) => ({ ...s, text: s.text.replace(STOCK, '') })).filter((s) => words(s.text) >= 6 && !APPARATUS.test(s.text));
      const first = (unitBlocks[b.uk] || []).find((x) => words(x.text) >= 8 && opening(x).length);
      if (!first || used.has('first:' + b.uk)) continue;
      const ss = opening(first);
      const s = ss[0];
      used.add('first:' + b.uk);
      return proseTarget(group, first.col, style, first, s, unitsHolding(s.text));
    }
  }
  if (style === 'gist') {
    for (let n = 0; ; n++) {
      if (n > 20000) throw new Error('no gist target in ' + col);
      const b = pick(pool);
      if (words(b.text) < 40 || used.has('gist:' + b.uk + b.idx)) continue;
      const longest = sentences(b.text).filter((x) => !APPARATUS.test(x.text)).sort((x, y) => y.text.length - x.text.length)[0];
      if (!longest || unitsHolding(longest.text) > 6) continue;
      used.add('gist:' + b.uk + b.idx);
      return add({ group, col: b.col, collection: COL_LABEL[b.col], style, level: 'block', uk: b.uk, unit: b.unit, title: b.title, num: b.num ?? null,
        blockIdx: b.idx, blockText: b.text, sentence: longest.text });
    }
  }
  if (style === 'middle') {
    const big = pool.filter((b) => words(b.text) > 150);
    const { b, s, holders } = sentenceTarget(big, { middle: true, maxUnits: group === 'answers' ? 1 : 3 });
    return proseTarget(group, b.col, style, b, s, holders);
  }
  const { b, s, holders } = sentenceTarget(pool, { maxUnits: group === 'answers' ? 1 : col === 'holydays' ? 8 : 3 });
  return proseTarget(group, b.col, style, b, s, holders);
}

// ── Words collections: 80 ──
{
  const slots = [];
  for (const [col, n] of Object.entries(WORD_SPLIT)) for (let i = 0; i < n; i++) slots.push(col);
  const st = shuffle(expand(PLAN.words));
  slots.forEach((col, i) => letterLike('words', col, st[i], byCol[col]));
}
// ── Answers: 60 (sentences found nowhere else) ──
for (const st of shuffle(expand(PLAN.answers))) letterLike('answers', 'answers', st, byCol.answers);
// ── Studies: 40 (their own commentary) ──
for (const st of shuffle(expand(PLAN.studies))) letterLike('studies', 'bible-studies', st, byCol['bible-studies']);
// ── Cross-cutting: 20 whole-letter "the letter about ..." ──
{
  const units = Object.keys(unitBlocks).filter((uk) => /^(v[1-7]|timothy|flock|rebuke|wtlb1|wtlb2)\//.test(uk));
  for (let i = 0; i < PLAN.cross.unitgist; i++) {
    let uk;
    do { uk = pick(units); } while (used.has('unit:' + uk) || unitBlocks[uk].reduce((n, b) => n + words(b.text), 0) < 120);
    used.add('unit:' + uk);
    const bl = unitBlocks[uk];
    add({ group: 'cross', col: bl[0].col, collection: COL_LABEL[bl[0].col], style: 'unitgist', level: 'unit', uk, unit: bl[0].unit, title: bl[0].title,
      num: bl[0].num ?? null, blockText: bl.map((b) => b.text).join('\n\n').slice(0, 6000) });
  }
}

// 100 held out: seeded, reported in CI, never read while tuning.
const held = new Set(shuffle(targets.map((t) => t.id)).slice(0, 100));
for (const t of targets) t.held = held.has(t.id);

// --replace <targets.json>: keep that file's targets and swap out the invalid ones (an apparatus line), each
// for the first target of this run with the same group, collection, style and variant not already in it. The
// kept targets keep their ids, queries and held-out flags (2026-10-05: 26 apparatus targets, --seed 20261006).
const repArg = process.argv.indexOf('--replace');
if (repArg > 0) {
  const old = JSON.parse(fs.readFileSync(process.argv[repArg + 1], 'utf8'));
  const have = new Set(old.targets.map((t) => t.uk + '#' + (t.sentence || '')));
  const replaced = [];
  for (const t of old.targets) {
    if (!(t.sentence && APPARATUS.test(t.sentence))) continue;
    const fresh = (n) => n.group === t.group && n.col === t.col && (n.variant || null) === (t.variant || null) && !have.has(n.uk + '#' + (n.sentence || ''));
    // Same style first; else any sentence target of the collection, given the old one's style.
    let i = targets.findIndex((n) => fresh(n) && n.style === t.style);
    if (i < 0) i = targets.findIndex((n) => fresh(n) && n.level === 'sentence' && n.style !== 'firstwords' && n.style !== 'middle');
    if (i < 0) throw new Error('no replacement for ' + t.id);
    const n = { ...targets.splice(i, 1)[0], style: t.style };
    have.add(n.uk + '#' + (n.sentence || ''));
    for (const k of Object.keys(t)) if (k !== 'id' && k !== 'held') delete t[k];
    Object.assign(t, { ...n, id: t.id, held: t.held, replaced: true });
    replaced.push(t.id);
  }
  old.replacedSeed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20261005;
  fs.writeFileSync(path.join(HERE, 'targets.json'), JSON.stringify(old, null, 1));
  console.log('replaced', replaced.length, replaced.join(' '));
  process.exit(0);
}
fs.writeFileSync(path.join(HERE, 'targets.json'), JSON.stringify({ seed: seedArg > 0 ? Number(process.argv[seedArg + 1]) : 20261005, targets }, null, 1));
const tally = (k) => targets.reduce((o, t) => ((o[t[k]] = (o[t[k]] || 0) + 1), o), {});
console.log(targets.length, 'targets'); console.log(tally('group')); console.log(tally('style')); console.log(tally('col'));
