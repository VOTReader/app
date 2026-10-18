#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   tools/build-slips.mjs — the words one English Bible says where another says
   a different one (search200 B7, 2026-10-18)
   ═══════════════════════════════════════════════════════════════════════
   A reader quoting a verse from memory often has another translation's word
   in it: amazed for astonished, dish for platter, children for sons. Those
   swaps are attested: line the translations up verse by verse and they show.
   This writes those word pairs as a lexicon file (search/lexicon.js's format,
   tools/lexicon-lib.mjs lexiconAsset), for align.js to credit as a
   substitution (never a query term, never recall).

   NOT SHIPPED (measured 2026-10-18, search200 B7): the slips lift the Bible's
   verses as much as the quotes they were meant for, being mined from them, and
   a letter quoted with a Bible word in it lost to the verse (tri open 590 of
   600 against 591 with no lexicon and 593 with WordNet's, the shipped one:
   tools/build-wordnet-lex.mjs). Kept as the measured alternative.

   Method (Barzilay & McKeown, ACL 2001, single-word paraphrases from parallel
   translations; research-lexical.md section 3):
     1. Each verse in every translation the app ships, tokenized as the index
        tokenizes (kjvEncode, a possessive's s joined).
     2. For every verse and every pair of translations, the token LCS. Between
        two consecutive anchors (the verse's ends count as anchors), a gap of
        exactly one token on each side is a swap, unless either word's lemma is
        in the other verse too (the word moved, it was not traded): lexicon-lib.mjs
        swaps, movedIn.
     3. A swap counts when both words are content words (not stop words, no
        digits, 3+ letters), their light lemmas (passage.js) differ, and both
        occur in the corpus the app searches (buildDocs), and neither lemma belongs
        to another word (lexicon-lib.mjs: "not" is not's, not note's). Swaps aggregate
        by the pair of lemmas, so walked/trod and walk/tread are one pair.
     4. Kept: pairs seen at least MIN_COUNT times in at least MIN_VPAIRS
        translation pairs, with a positive association, and where align.js's own
        classes (forms, register table, SYNONYM_MAP, one-letter slips) do not
        already credit the pair as well.
     5. Credit = 0.5 + 0.4 x NPMI (normalized PMI over swap observations; an
        exclusive pair is 1, independence 0), rounded to a tenth: 0.5..0.9
        (lexicon-lib.mjs npmi, slipCredit).
   Deterministic: fixed orders everywhere, integer counts, no randomness.

   Sources (all under app/src/main/assets/src/data/, already shipped):
     KJV (bible-kjv.js)  public domain (Crown rights in the UK only)
     ASV (bible-asv.js)  1901, public domain
     WEB (bible-web.js)  World English Bible, public domain (ebible.org/eng-web/copyright.htm)
     BSB (bible-bsb.js)  Berean Standard Bible, public domain since 2023-04-30 (berean.bible/terms.htm)
     YLT (bible-ylt.js)  Young's Literal Translation 1898, public domain
     LSV (bible-lsv.js)  Literal Standard Version, Covenant Press, CC BY-SA 4.0
     HNV (bible-hnv.js)  Hebrew Names Version of the WEB, public domain
     NKJV (books.js + matthew-plain.js)  (c) Thomas Nelson; the text the app already ships
   Only word-pair counts leave this tool: no verse text is copied into the output.

   Usage:  node tools/build-slips.mjs --out <file.json>           (write the lexicon file)
           node tools/build-slips.mjs --out <file.json> --stats   (also print the strongest pairs)
   and measure it: SEARCH_LEXICON=<file.json> npm run bench:tri (tools/search-bench/corpus.mjs lexicons).
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { loadCorpus, ASSETS } from './search-bench/corpus.mjs';
import { corpusVocabulary, underOtherWord, swaps, movedIn, npmi, slipCredit, lexiconAsset } from './lexicon-lib.mjs';

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
if (!OUT) {
  console.error('usage: node tools/build-slips.mjs --out <file.json> [--stats]');
  process.exit(2);
}
const DATA = path.join(ASSETS, 'src/data');
const mod = (/** @type {string} */ p) => import(pathToFileURL(path.join(ASSETS, 'src/search', p)).href);
const { kjvEncode } = await mod('tokenize.js');
const { joinApostropheS } = await mod('ranking.js');
const { lemma } = await mod('passage.js');
const { alignClasses } = await mod('align.js');
const { formatLexicon } = await mod('lexicon.js');

/** A pair is kept when seen this often, in this many translation pairs. */
const MIN_COUNT = 3;
const MIN_VPAIRS = 2;

loadCorpus();
const g = /** @type {any} */ (globalThis);
const STOP = g.VotSearchData.STOP_WORDS_TRIMMED;
const toks = (/** @type {string} */ s) => joinApostropheS(kjvEncode(s));

/* ── the translations, verse key "book:chapter:verse" -> tokens ── */
/** @param {string} file @param {string} name */
function loadVar(file, name) {
  if (!g[name]) vm.runInThisContext(fs.readFileSync(path.join(DATA, file), 'utf8'), { filename: file });
  return g[name];
}
/** bible-*.js shape: { book: { chapter: [{ n, text }] } } */
function flat(/** @type {any} */ B) {
  /** @type {Map<string, string[]>} */
  const m = new Map();
  for (const b of Object.keys(B)) for (const c of Object.keys(B[b])) for (const v of B[b][c]) m.set(`${b}:${c}:${v.n}`, toks(String(v.text || '')));
  return m;
}
/** books.js shape: { book: { chapters: [{ num, sections: [{ verses: [{ n, text }] }] }] } } */
function flatBooks(/** @type {any} */ book, /** @type {string} */ id, /** @type {Map<string, string[]>} */ m) {
  for (const ch of book.chapters || []) for (const s of ch.sections || []) for (const v of s.verses || []) m.set(`${id}:${ch.num}:${v.n}`, toks(String(v.text || '')));
}
const VERSIONS = [
  ['kjv', flat(loadVar('bible-kjv.js', 'BIBLE_KJV'))],
  ['asv', flat(loadVar('bible-asv.js', 'BIBLE_ASV'))],
  ['web', flat(loadVar('bible-web.js', 'BIBLE_WEB'))],
  ['bsb', flat(loadVar('bible-bsb.js', 'BIBLE_BSB'))],
  ['ylt', flat(loadVar('bible-ylt.js', 'BIBLE_YLT'))],
  ['lsv', flat(loadVar('bible-lsv.js', 'BIBLE_LSV'))],
  ['hnv', flat(loadVar('bible-hnv.js', 'BIBLE_HNV'))],
];
{
  /** @type {Map<string, string[]>} */
  const nkjv = new Map();
  const kjvBooks = new Set(Object.keys(g.BIBLE_KJV));
  for (const id of Object.keys(g.BOOKS).sort()) if (kjvBooks.has(id) && id !== 'matthew') flatBooks(g.BOOKS[id], id, nkjv);
  flatBooks(g.MATTHEW_PLAIN, 'matthew', nkjv);
  VERSIONS.push(['nkjv', nkjv]);
}

/* ── the corpus vocabulary: every token any searched text holds ── */
const vocab = await corpusVocabulary(toks);

const content = (/** @type {string} */ w) => w.length >= 3 && /^[a-z]+$/.test(w) && !STOP.has(w) && vocab.has(w);

/** @type {Map<string, number>} "lemA lemB" (sorted) -> observations */
const pairCount = new Map();
/** @type {Map<string, Set<number>>} "lemA lemB" -> the translation pairs it was seen in */
const pairVp = new Map();
/** @type {Map<string, Map<string, number>>} "lemA lemB" -> the surface pairs behind it */
const surface = new Map();
let verses = 0;
let moved = 0;
let shared = 0;
/** @type {Map<string, string>} */
const LEM = new Map();
const lem = (/** @type {string} */ w) => { let l = LEM.get(w); if (l === undefined) LEM.set(w, (l = lemma(w))); return l; };
const keys = [...VERSIONS[0][1].keys()];
for (const key of keys) {
  verses++;
  for (let x = 0; x < VERSIONS.length; x++) {
    const a = /** @type {Map<string, string[]>} */ (VERSIONS[x][1]).get(key);
    if (!a || !a.length) continue;
    for (let y = x + 1; y < VERSIONS.length; y++) {
      const b = /** @type {Map<string, string[]>} */ (VERSIONS[y][1]).get(key);
      if (!b || !b.length) continue;
      /** @type {((la: string, lb: string) => boolean)|null} */
      let moves = null;
      for (const [p, q] of swaps(a, b)) {
        if (!content(p) || !content(q)) continue;
        const lp = lem(p);
        const lq = lem(q);
        if (lp === lq || /\d/.test(lp + lq)) continue;
        if (underOtherWord(p, vocab, lem) || underOtherWord(q, vocab, lem)) { shared++; continue; }
        // a word the other verse says elsewhere moved; it was not traded
        if (!moves) moves = movedIn(a, b, lem);
        if (moves(lp, lq)) { moved++; continue; }
        const k = lp < lq ? lp + ' ' + lq : lq + ' ' + lp;
        pairCount.set(k, (pairCount.get(k) || 0) + 1);
        let vs = pairVp.get(k);
        if (!vs) pairVp.set(k, (vs = new Set()));
        vs.add(x * 16 + y);
        let sf = surface.get(k);
        if (!sf) surface.set(k, (sf = new Map()));
        const sk = p < q ? p + ' ' + q : q + ' ' + p;
        sf.set(sk, (sf.get(sk) || 0) + 1);
      }
    }
  }
}

/* ── association: NPMI over all swap observations ── */
let N = 0;
/** @type {Map<string, number>} lemma -> observations it is in */
const single = new Map();
for (const [k, c] of pairCount) {
  N += c;
  for (const l of k.split(' ')) single.set(l, (single.get(l) || 0) + c);
}
/** Does align.js already credit typed `a` against text `b` at least `s`? (forms, register, SYNONYM_MAP, one-letter) */
function known(/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ s) {
  const e = alignClasses([a], { stop: STOP }).entry(b);
  for (let i = 0; i < e.c.length; i += 2) if (e.c[i + 1] >= s) return true;
  return false;
}
/** @type {Array<[string, string, number]>} */
const kept = [];
const stats = { candidates: pairCount.size, rare: 0, narrow: 0, unassociated: 0, known: 0 };
for (const k of [...pairCount.keys()].sort()) {
  const c = /** @type {number} */ (pairCount.get(k));
  if (c < MIN_COUNT) { stats.rare++; continue; }
  if (/** @type {Set<number>} */ (pairVp.get(k)).size < MIN_VPAIRS) { stats.narrow++; continue; }
  const [x, y] = k.split(' ');
  const s = slipCredit(npmi(c, /** @type {number} */ (single.get(x)), /** @type {number} */ (single.get(y)), N));
  if (s === null) { stats.unassociated++; continue; }
  // the most frequent surface pair stands for the lemmas in the check against align.js's own classes
  const sf = [...(/** @type {Map<string, number>} */ (surface.get(k))).entries()].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0][0].split(' ');
  if (known(sf[0], sf[1], s) && known(sf[1], sf[0], s)) { stats.known++; continue; }
  kept.push([x, y, s]);
}

const lex = formatLexicon(kept);
const body = lexiconAsset({
  name: 'slips',
  about: `The words one English Bible says where another says a different one (search200 B7; measured, not shipped): `
    + `pairs of light lemmas (search/passage.js lemma), each with the credit align.js gives the one typed for the other `
    + `(0.5..0.9, by how exclusively the two trade places). Mined from one-for-one swaps between LCS anchors over ${verses} `
    + `verses in KJV, ASV, WEB, BSB, YLT, LSV, HNV and NKJV; seen ${MIN_COUNT}+ times in ${MIN_VPAIRS}+ translation pairs. `
    + 'Word-pair counts only: no verse text. Format: search/lexicon.js.',
  source: 'The translations under app/src/main/assets/src/data/ (tools/build-slips.mjs header)',
  license: 'KJV, ASV, WEB, BSB, YLT and HNV public domain; LSV CC BY-SA 4.0 (Covenant Press); NKJV (c) Thomas Nelson. '
    + 'Only word-pair counts are taken from them.',
  generator: 'tools/build-slips.mjs',
}, lex);

const report = `[slips] ${verses} verses, ${N} swaps (${moved} moved words and ${shared} under another word's lemma left out), ${stats.candidates} lemma pairs: ${stats.rare} under ${MIN_COUNT}, ${stats.narrow} in under ${MIN_VPAIRS} translation pairs, ${stats.unassociated} unassociated, ${stats.known} already credited -> ${kept.length} kept, ${body.length} bytes -> ${OUT}`;
if (process.argv.includes('--stats')) {
  const hist = new Map();
  for (const [, , s] of kept) hist.set(s, (hist.get(s) || 0) + 1);
  console.log('[slips] credit histogram', JSON.stringify([...hist.entries()].sort()));
  const top = kept.slice().sort((p, q) => (pairCount.get(q[0] + ' ' + q[1]) || 0) - (pairCount.get(p[0] + ' ' + p[1]) || 0)).slice(0, 60);
  for (const [x, y, s] of top) console.log(`  ${x} ${y} ${s} n=${pairCount.get(x + ' ' + y)} vp=${(/** @type {Set<number>} */ (pairVp.get(x + ' ' + y))).size}`);
}
fs.writeFileSync(OUT, body);
console.log(report);
