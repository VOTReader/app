/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/vot-citations — the Volumes' own citations of scripture
   Cluster F (bundle-d since lz1). Pure: every corpus read goes through the
   `corpus` argument, never a global.

   The Scripture Web asset ships a few thousand curated edges between a Bible verse
   and a place in the Volumes of Truth (a letter's footnote, a Matthew Study
   Bible note, a {{ref:}} in Words To Live By, a Bible Study's citation). Since
   2026-10-18 each edge also says WHERE it was cited: the paragraph (block) of
   the letter, the footnote number, the n-th inline reference in that block,
   or the span a study note quotes. This module turns those anchors into what
   a reader wants on a card:

     citationsForVerse(graph, verseId, corpus)  the Volumes' words that cite
       this verse, in reading order (collection, then letter, then paragraph),
       each with the citing sentence(s) and a reader key that opens the letter
       AT that paragraph;
     letterCiteSites(graph, key)  every place one letter (or study chapter)
       cites a verse, in reading order;
     excerptFor(corpus, letterKey, paragraph, cite)  the sentence(s) around
       one citation, clean (no footnote numbers, no inline references, no
       emphasis markers), at most EXCERPT_MAX characters.

   The asset stores anchors, never text: the words are read at runtime from
   the corpus the reader already loaded (the Volumes bundle and the Bible
   Studies), so a corrected letter never leaves a stale quotation behind and
   the asset stays small (the measurement is in the generator's header).
   When the corpus has not landed yet every citation still comes back, with
   its title from the asset's own index and `excerpt: ''`; re-run once it has.

   THE TEXT DOMAIN. Offsets in the asset (a votNote's quoted span) are offsets
   into `formatAText` / `formatBText` below, and tools/gen-scripture-web.mjs
   imports these same functions to compute them, so the two cannot drift. The
   domain is the reader's text (utils/segment-dom-text.js segmentsReadText:
   the collision guard, letter-link labels, no footnote numbers) with every
   {{ref:}} token removed and poetry lines joined by '\n'.
   ═══════════════════════════════════════════════════════════════════════ */

import { segmentRenderText } from '../segment-dom-text.js';
import { splitFormatBInline } from '../format-b-inline.js';
import { entryHlBase } from '../hl-keys.js';

/** The longest excerpt a card is given, in characters (ellipses included). */
export const EXCERPT_MAX = 280;
/** A single short sentence ("Kiss the Son.") borrows the one before it while the pair fits. */
const EXCERPT_MIN = 90;

/** Site kinds, as the asset numbers them (the order is the shipped format). */
export const CITE_KINDS = ['footnote', 'votNote', 'wtlb', 'study'];

/** Collection order for sorting and naming. READING_CHAIN order, then the
 *  Bible Studies, then Hidden Manna (never surfaced publicly, kept last). */
export const COLLECTION_ORDER = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke',
  'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays', 'studies', 'hm'];
/** What a reader calls each collection (data/scripture-resolution.js COLLECTIONS labels). */
export const COLLECTION_NAMES = {
  one: 'Volume One', two: 'Volume Two', three: 'Volume Three', four: 'Volume Four',
  five: 'Volume Five', six: 'Volume Six', seven: 'Volume Seven',
  timothy: 'Letters from Timothy', flock: "Letters to The Lord's Little Flock",
  rebuke: "The Lord's Rebuke", wtlb1: 'Words To Live By: Part One',
  wtlb2: 'Words To Live By: Part Two', blessed: 'The Blessed',
  holydays: 'Regarding The Holy Days', hm: 'Hidden Manna', studies: 'Bible Studies',
};
/** The reader screen each letter collection opens on (COLLECTIONS letterScreen). */
const LETTER_SCREENS = {
  one: 'vot-one-letter', two: 'vot-letter', three: 'vot-three-letter', four: 'vot-four-letter',
  five: 'vot-five-letter', six: 'vot-six-letter', seven: 'vot-seven-letter',
  timothy: 'vot-timothy-letter', flock: 'vot-flock-letter', rebuke: 'vot-rebuke-letter',
  hm: 'hm-letter', wtlb1: 'wtlb-one-entry', wtlb2: 'wtlb-two-entry',
  blessed: 'blessed-entry', holydays: 'holy-days-entry',
};

/** The name a reader knows a collection by; '' for an unknown key. */
export function collectionName(volKey) {
  return Object.prototype.hasOwnProperty.call(COLLECTION_NAMES, volKey) ? COLLECTION_NAMES[volKey] : '';
}

/* ── the text domain ───────────────────────────────────────────────────── */

const REF_TOKEN = /\{\{ref:([^}]+)\}\}/g;

/**
 * One run of Format A segments as the reader reads it, with every footnote
 * marker and inline {{ref:}} removed and the place each stood recorded.
 * Mirrors segmentsReadText (segment-dom-text.js): the collision guard runs
 * over the run without its footnote markers, a letter-link prints its label,
 * a stanza break reads as a space.
 * @param {Array<any>} segments
 * @param {{text:string, fn:Array<[string, number]>, refs:Array<[string, number]>}} acc
 */
function appendRun(segments, acc) {
  const run = [];
  /** @type {Array<[string, number]>} footnote number, index in `run` it precedes */
  const marks = [];
  for (const seg of segments || []) {
    if (!seg) continue;
    if (seg.t === 'fn') marks.push([String(seg.v == null ? '' : seg.v), run.length]);
    else run.push(seg);
  }
  let m = 0;
  for (let i = 0; i < run.length; i++) {
    while (m < marks.length && marks[m][1] === i) acc.fn.push([marks[m++][0], acc.text.length]);
    const seg = run[i];
    if (seg.t === 'stanza-break') { acc.text += ' '; continue; }
    if (seg.t === 'letter-link') { acc.text += String(seg.label == null ? '' : seg.label); continue; }
    const piece = String(segmentRenderText(run, i));
    let last = 0;
    for (const hit of piece.matchAll(REF_TOKEN)) {
      acc.text += piece.slice(last, hit.index);
      acc.refs.push([hit[1].trim(), acc.text.length]);
      last = hit.index + hit[0].length;
    }
    acc.text += piece.slice(last);
  }
  while (m < marks.length) acc.fn.push([marks[m++][0], acc.text.length]);
}

/**
 * A Format A block (a letter's or a Bible Study's) in the citation text domain.
 * @param {any} block
 * @returns {{text:string, fn:Array<[string, number]>, refs:Array<[string, number]>}}
 *   fn: [footnote number, offset]; refs: [reference, offset], in document order
 */
export function formatAText(block) {
  const acc = { text: '', fn: [], refs: [] };
  if (!block) return acc;
  if (Array.isArray(block.segments)) appendRun(block.segments, acc);
  else if (Array.isArray(block.lines)) {
    block.lines.forEach((line, li) => {
      if (li > 0) acc.text += '\n';
      if (Array.isArray(line)) appendRun(line, acc);
    });
  } else if (typeof block.text === 'string') acc.text = block.text;
  else if (typeof block.caption === 'string') acc.text = block.caption;
  return acc;
}

/**
 * A Format B paragraph (Words To Live By, The Blessed, Holy Days) in the
 * citation text domain: emphasis markers gone, {{ref:}} and {{nav:}} tokens
 * removed, a source line ("[From “…” ~ Volume 7]") removed, line breaks kept.
 * @param {string} raw paragraph text
 * @returns {{text:string, fn:Array<[string, number]>, refs:Array<[string, number]>}}
 */
export function formatBText(raw) {
  const acc = { text: '', fn: [], refs: [] };
  const emit = (src) => {
    for (const seg of splitFormatBInline(src)) {
      if (!seg) continue;
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) { emit(seg.slice(2, -2)); continue; }
      if (seg.startsWith('_') && seg.endsWith('_') && seg.length >= 2) { emit(seg.slice(1, -1)); continue; }
      const ref = /^\{\{ref:(.+)\}\}$/.exec(seg);
      if (ref) { acc.refs.push([ref[1].trim(), acc.text.length]); continue; }
      if (/^\{\{nav:[^}]+\}\}$/.test(seg) || /^\[From [^\]]+\]$/.test(seg)) continue;
      acc.text += seg;
    }
  };
  if (typeof raw === 'string') emit(raw);
  return acc;
}

/* ── addressing a block ────────────────────────────────────────────────── */

/**
 * The block a citation sits in. `p` is the block index in a Format A entry's
 * `blocks` (or the paragraph index in a Format B entry's `paragraphs`); `sub`
 * reaches inside a Bible Study's prophecy group: [part, index] with part one
 * of intro / ot / nt / vot.
 * @param {any} entry @param {number} p @param {[string, number]|null|undefined} [sub]
 * @returns {{text:string, fn:Array<[string, number]>, refs:Array<[string, number]>}|null}
 */
export function blockTextAt(entry, p, sub) {
  if (!entry || !(p >= 0)) return null;
  if (Array.isArray(entry.paragraphs)) {
    const para = entry.paragraphs[p];
    return para ? formatBText(para.text) : null;
  }
  if (!Array.isArray(entry.blocks)) return null;
  let block = entry.blocks[p];
  if (block && sub) {
    const part = sub[0] === 'intro' ? block.intro : block[sub[0]] && block[sub[0]].blocks;
    block = Array.isArray(part) ? part[sub[1]] : null;
  }
  return block ? formatAText(block) : null;
}

/* ── excerpts ──────────────────────────────────────────────────────────── */

/** Sentence ends: terminal punctuation, any closing quotes or brackets, then space. */
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/g;

/** Has letters or digits: a piece without (a lone "()" a removed reference leaves) is no sentence. */
const WORDY = /[\p{L}\p{N}]/u;

/** [start, end) of every sentence of `text`, whitespace between them excluded;
 *  a wordless piece joins the sentence before it. */
function sentences(text) {
  /** @type {Array<[number, number]>} */
  const out = [];
  let start = 0;
  const add = (end) => {
    const piece = text.slice(start, end);
    if (!piece.trim()) return;
    if (!WORDY.test(piece) && out.length) out[out.length - 1][1] = end;
    else out.push([start, end]);
  };
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    add(end);
    start = end;
  }
  add(text.length);
  return out.map(([s, e]) => {
    while (s < e && /\s/.test(text[s])) s++;
    return [s, e];
  });
}

/**
 * Tidy a slice of the citation domain for a card: line breaks become a space
 * after a sentence's end and " / " inside one (the way verse is quoted in
 * prose), the separators a removed reference leaves (" - ", " · ", "()") go,
 * and whitespace collapses.
 * @param {string} s
 */
export function cleanExcerpt(s) {
  return String(s)
    .replace(/\(\s*\)/g, '')
    .replace(/\s+[-–—·]\s*(?=[\s,.;:!?)\]]|$)/g, '')
    .replace(/\s*\n[\s\n]*/g, (m, off, all) => (/[.!?:;…,”’"]$/.test(all.slice(0, off)) ? ' ' : ' / '))
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s/]+|[\s/]+$/g, '')
    .trim();
}

/** Cut `s` to at most `max` characters on a word boundary, keeping the side `keep` names. */
function clip(s, max, keep) {
  if (s.length <= max) return s;
  if (keep === 'end') {
    let cut = s.slice(s.length - (max - 1));
    const sp = cut.search(/\s/);
    if (sp >= 0 && sp < 40) cut = cut.slice(sp + 1);
    return '…' + cut.replace(/^[\s,;:.-]+/, '');
  }
  let cut = s.slice(0, max - 1);
  const sp = cut.search(/\s\S*$/);
  if (sp > max - 60) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:-]+$/, '') + '…';
}

/**
 * The excerpt for a cite point in one block's text: the sentence the cite
 * closes (the words a footnote marker or an inline reference follows), with
 * the sentence before it when that one is short and the pair fits, clipped to
 * EXCERPT_MAX on a word boundary with an ellipsis on the side that was cut.
 * @param {string} text @param {number} at offset of the cite in `text`
 * @param {number} [max]
 */
export function excerptAround(text, at, max = EXCERPT_MAX) {
  const t = String(text || '');
  if (!t.trim()) return '';
  let p = Math.max(0, Math.min(at, t.length));
  while (p > 0 && /\s/.test(t[p - 1])) p--;
  const ss = sentences(t);
  if (!ss.length) return '';
  let k = ss.findIndex(([s, e]) => p > s && p <= e);
  if (k < 0) k = ss.findIndex(([s]) => s >= p);
  if (k < 0) k = ss.length - 1;
  let [s, e] = ss[k];
  // a cite in the middle of a sentence quotes the words before it: the
  // sentence still ends where it ends, but the clip keeps the cite's side
  const mid = p < e - 1;
  let out = cleanExcerpt(t.slice(s, e));
  while (k > 0 && out.length < EXCERPT_MIN) {
    const [ps] = ss[k - 1];
    const wider = cleanExcerpt(t.slice(ps, e));
    if (wider.length > max) break;
    out = wider; s = ps; k--;
  }
  if (out.length <= max) return out;
  if (mid) {
    // keep a window that ends shortly after the cite
    const head = cleanExcerpt(t.slice(s, p));
    if (head.length > max - 1) return clip(head, max, 'end');
    return clip(out, max, 'start');
  }
  return clip(out, max, 'end');
}

/**
 * The excerpt for a quoted span (a Matthew Study Bible note quotes the
 * letter's own words): those words, clipped to EXCERPT_MAX.
 * @param {string} text @param {number} at @param {number} len
 */
export function excerptSpan(text, at, len, max = EXCERPT_MAX) {
  const t = String(text || '');
  if (!(at >= 0) || !(len > 0) || at >= t.length) return '';
  const lead = at > 0 && !/[.!?…”’"]\s*$/.test(t.slice(0, at)) ? '…' : '';
  const raw = t.slice(at, at + len);
  const end = at + len >= t.length || /[.!?…]["'”’)\]]*$/.test(raw) ? '' : '…';
  const out = cleanExcerpt(raw);
  if (!out) return '';
  if ((lead + out + end).length <= max) return lead + out + end;
  return lead ? clip(lead + out, max, 'start') : clip(out, max, 'start');
}

/* ── the corpus ────────────────────────────────────────────────────────── */

/**
 * @typedef {{
 *   letter?: (volKey:string, id:string) => any,
 *   studyChapter?: (studyId:string, chapterId:string) => any,
 * }} CitationCorpus
 * Two lookups, both optional, both returning null until their corpus lands:
 * `letter` finds an entry (a letter, a preface, a WTLB / Blessed / Holy Days
 * entry) by collection and id; `studyChapter` a Bible Study's chapter.
 * windowCorpus() builds one from the reader's globals.
 */

/**
 * Parse a letter key: "two/the-wide-path", "wtlb1/devotion",
 * "study:more-than-a-man/mtm-ch5". The shape the edges are indexed by.
 * @param {string} key
 * @returns {{volKey?:string, id?:string, studyId?:string, chapterId?:string}|null}
 */
export function parseLetterKey(key) {
  const s = String(key || '');
  const study = /^study:([^/]+)\/(.+)$/.exec(s);
  if (study) return { studyId: study[1], chapterId: study[2] };
  const at = s.indexOf('/');
  if (at <= 0 || at === s.length - 1) return null;
  return { volKey: s.slice(0, at), id: s.slice(at + 1) };
}

/** The letter key of an edge (or a votLink / prophecy pair's study chapter). */
export function letterKeyOf(edge) {
  if (!edge) return '';
  if (edge.studyId) return 'study:' + edge.studyId + '/' + edge.chapterId;
  const id = edge.letterId || edge.entryId;
  return edge.volKey && id ? edge.volKey + '/' + id : '';
}

/** @param {CitationCorpus|null|undefined} corpus @param {string} key */
function entryFor(corpus, key) {
  const k = parseLetterKey(key);
  if (!corpus || !k) return null;
  try {
    if (k.studyId) return typeof corpus.studyChapter === 'function' ? corpus.studyChapter(k.studyId, k.chapterId) || null : null;
    return typeof corpus.letter === 'function' ? corpus.letter(k.volKey, k.id) || null : null;
  } catch (_e) { return null; }
}

/**
 * The sentence(s) around one citation, or '' when the corpus has not landed
 * (or the anchor no longer fits the text: the asset is regenerated with the
 * corpus, so that means the reader holds a newer letter than the asset).
 *
 * @param {CitationCorpus|null|undefined} corpus
 * @param {string} letterKey  as letterKeyOf builds it
 * @param {number} paragraph  the block (Format A) or paragraph (Format B) index
 * @param {{fn?:string, r?:number, o?:number, n?:number, sub?:[string, number]}} [cite]
 *   which citation in that block: a footnote number, the r-th inline
 *   reference, or a quoted span [o, o+n); none means the block's opening
 * @returns {string}
 */
export function excerptFor(corpus, letterKey, paragraph, cite) {
  const entry = entryFor(corpus, letterKey);
  const c = cite || {};
  const bt = entry ? blockTextAt(entry, paragraph, c.sub) : null;
  if (!bt) return '';
  if (!WORDY.test(bt.text)) {
    // a block of no words (a letter's closing footnote line) marks the words
    // of the block before it: quote that block's end
    for (let back = 1; back <= 2; back++) {
      const prev = c.sub
        ? (c.sub[1] - back >= 0 ? blockTextAt(entry, paragraph, [c.sub[0], c.sub[1] - back]) : null)
        : (paragraph - back >= 0 ? blockTextAt(entry, paragraph - back) : null);
      if (prev && WORDY.test(prev.text)) return excerptAround(prev.text, prev.text.length);
    }
    return '';
  }
  if (c.n > 0 && c.o >= 0) return excerptSpan(bt.text, c.o, c.n);
  if (c.fn != null) {
    const hit = bt.fn.find(([num]) => num === String(c.fn));
    return hit ? excerptAround(bt.text, hit[1]) : '';
  }
  if (c.r >= 0) {
    const hit = bt.refs[c.r];
    return hit ? excerptAround(bt.text, hit[1]) : '';
  }
  return excerptSpan(bt.text, 0, EXCERPT_MAX + 1);
}

/* ── the shipped citations ─────────────────────────────────────────────── */

/** Collections whose entries are addressed by `entryId` (Format B and the Holy Days album). */
export const ENTRY_COLLECTIONS = new Set(['wtlb1', 'wtlb2', 'blessed', 'holydays']);

/**
 * One shipped site tuple `[v, k, p, extra?, sub?, ve?]` (encodeCites in
 * tools/scripture-web-cites.mjs) as the cite excerptFor takes: extra is a
 * footnote number (string), an inline-ref ordinal (number) or a quoted span
 * [o, n].
 * @param {Array<any>} site
 * @returns {{fn?:string, r?:number, o?:number, n?:number, sub?:[string, number]}}
 */
export function siteCite(site) {
  /** @type {{fn?:string, r?:number, o?:number, n?:number, sub?:[string, number]}} */
  const cite = {};
  const extra = site ? site[3] : null;
  if (typeof extra === 'string') cite.fn = extra;
  else if (typeof extra === 'number') cite.r = extra;
  else if (Array.isArray(extra) && extra.length === 2) { cite.o = extra[0]; cite.n = extra[1]; }
  if (site && Array.isArray(site[4]) && site[4].length === 2) cite.sub = [String(site[4][0]), Number(site[4][1])];
  return cite;
}

/**
 * @typedef {{ kind:string, p:number, ve:number, fn?:string, r?:number,
 *   o?:number, n?:number, sub?:[string, number] }} CiteSite
 *   one place a verse is cited: kind, block / paragraph, the last verse the
 *   cite covers, and which citation in the block
 * @typedef {{ v:number, ve:number, kind:string, key:string, title:string,
 *   ord:number, volKey?:string, letterId?:string, entryId?:string,
 *   studyId?:string, chapterId?:string, studyTitle?:string,
 *   at:CiteSite[] }} CuratedEdge
 *   one edge per (verse, letter), the shape graph.votEdges has carried since
 *   2026-08 (v, kind, volKey + letterId / entryId, or studyId + chapterId)
 *   plus its anchors; `kind` is the first of its sites' kinds in CITE_KINDS
 *   order, `ord` the letter's place in reading order
 */

/**
 * The asset's votCites rows expanded to one edge per (verse, letter), in
 * reading order. decodeGraph calls this; a row it cannot read is skipped.
 * @param {Array<any>|null|undefined} rows
 * @returns {CuratedEdge[]}
 */
export function expandCites(rows) {
  /** @type {CuratedEdge[]} */
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach((row, ord) => {
    if (!row || !Array.isArray(row.s) || !row.c || !row.id) return;
    /** @type {any} */
    const base = row.c === 'studies' ? { studyId: String(row.sid || ''), chapterId: String(row.id) }
      : ENTRY_COLLECTIONS.has(row.c) ? { volKey: row.c, entryId: String(row.id) }
        : { volKey: row.c, letterId: String(row.id) };
    if (row.c === 'studies' && !base.studyId) return;
    const key = letterKeyOf(base);
    /** @type {Map<number, any>} */
    const byV = new Map();
    for (const site of row.s) {
      if (!Array.isArray(site) || !(site[0] >= 0)) continue;
      const v = site[0];
      const kind = CITE_KINDS[site[1]] || CITE_KINDS[0];
      const ve = site[5] > v ? site[5] : v;
      /** @type {CiteSite} */
      const at = { kind, p: site[2] >= 0 ? site[2] : 0, ve, ...siteCite(site) };
      let e = byV.get(v);
      if (!e) {
        e = { v, ve, kind, ...base, key, title: String(row.t || ''), ord, at: [] };
        if (row.st) e.studyTitle = String(row.st);
        byV.set(v, e);
        out.push(e);
      } else {
        if (CITE_KINDS.indexOf(kind) < CITE_KINDS.indexOf(e.kind)) e.kind = kind;
        if (ve > e.ve) e.ve = ve;
      }
      e.at.push(at);
    }
  });
  return out;
}

/** The edges of a graph, or [] (a graph decoded from a pre-2026-10 asset or a test fixture still works). */
function edgesOf(graph) {
  return graph && Array.isArray(graph.votEdges) ? graph.votEdges : [];
}

/** An edge's sites; an edge with none (a pre-anchor fixture) opens its letter at the top. */
function sitesOf(e) {
  return Array.isArray(e.at) && e.at.length ? e.at : [{ kind: e.kind, p: 0, ve: e.v }];
}

/** @type {WeakMap<object, Map<number, Array<[any, any]>>>} */
const VERSE_INDEX = new WeakMap();
/** verse id -> [edge, site] for every verse each site covers, built once per edge list. */
function verseIndex(edges) {
  let idx = VERSE_INDEX.get(edges);
  if (idx) return idx;
  idx = new Map();
  for (const e of edges) {
    if (!e || !(e.v >= 0)) continue;
    for (const at of sitesOf(e)) {
      const end = Math.max(e.v, at.ve >= 0 ? at.ve : e.v);
      for (let v = e.v; v <= end; v++) {
        let list = idx.get(v);
        if (!list) idx.set(v, (list = []));
        list.push([e, at]);
      }
    }
  }
  VERSE_INDEX.set(edges, idx);
  return idx;
}

/** @type {Record<string, number>} */
const SUB_RANK = { intro: 0, ot: 1, nt: 2, vot: 3 };
/** @param {[string, number]|null|undefined} sub */
const subRank = (sub) => (sub ? ((SUB_RANK[sub[0]] || 0) + 1) * 10000 + sub[1] : 0);
/** @param {string} c */
const collectionRank = (c) => {
  const i = COLLECTION_ORDER.indexOf(c);
  return i < 0 ? COLLECTION_ORDER.length : i;
};

/**
 * @typedef {{
 *   letterKey:string, title:string, collection:string, collectionName:string,
 *   paragraph:number, sub:[string, number]|null, kind:string, kinds:string[],
 *   verse:number, verseEnd:number, excerpt:string,
 *   volKey?:string, letterId?:string, entryId?:string, studyId?:string, chapterId?:string,
 *   cite:{fn?:string, r?:number, o?:number, n?:number, sub?:[string, number]},
 * }} VotCitation
 *   collection: a volKey, or 'studies' (collectionName is then the study's
 *   title); kinds: every kind of citation at that paragraph (a footnote and a
 *   Study Bible note on the same words are one citation); verse..verseEnd:
 *   the passage the citation names, which contains the asked verse
 */

/**
 * The Volumes' words that cite one verse, one per (letter, paragraph), in
 * reading order: collection (READING_CHAIN order, then the Bible Studies),
 * then the letter's place in its collection, then the paragraph. A cite of a
 * range or a whole chapter counts for every verse it covers. A Holy Days
 * entry that re-presents a letter already listed is left out (the album is
 * the same words). Without a corpus (or before it lands) every citation
 * still comes back, with `excerpt: ''`.
 *
 * @param {any} graph  decodeGraph output
 * @param {number} verseId
 * @param {CitationCorpus|null} [corpus]
 * @returns {VotCitation[]}
 */
export function citationsForVerse(graph, verseId, corpus) {
  const edges = edgesOf(graph);
  if (!edges.length || !(verseId >= 0)) return [];
  const hits = verseIndex(edges).get(verseId) || [];
  /** @type {Map<string, any>} */
  const byPlace = new Map();
  /** @type {any[]} */
  const out = [];
  for (const [e, at] of hits) {
    const key = e.key || letterKeyOf(e);
    if (!key) continue;
    const place = key + '#' + at.p + (at.sub ? ':' + at.sub.join(':') : '');
    const seen = byPlace.get(place);
    if (seen) {
      if (!seen.kinds.includes(at.kind)) seen.kinds.push(at.kind);
      continue;
    }
    const collection = e.studyId ? 'studies' : String(e.volKey || '');
    /** @type {any} */
    const cite = {};
    for (const f of ['fn', 'r', 'o', 'n']) if (at[f] != null) cite[f] = at[f];
    if (at.sub) cite.sub = at.sub;
    /** @type {any} */
    const c = {
      letterKey: key,
      title: String(e.title || ''),
      collection,
      collectionName: e.studyId ? String(e.studyTitle || COLLECTION_NAMES.studies) : collectionName(collection),
      paragraph: at.p,
      sub: at.sub || null,
      kind: at.kind,
      kinds: [at.kind],
      verse: e.v,
      verseEnd: Math.max(e.v, at.ve >= 0 ? at.ve : e.v),
      excerpt: excerptFor(corpus, key, at.p, cite),
      cite,
      _ord: e.ord >= 0 ? e.ord : Infinity,
    };
    for (const f of ['volKey', 'letterId', 'entryId', 'studyId', 'chapterId']) if (e[f]) c[f] = e[f];
    byPlace.set(place, c);
    out.push(c);
  }
  const mirrors = (graph && graph.mirrors) || {};
  const listed = new Set(out.map((c) => c.letterKey));
  const kept = out.filter((c) => !(Object.prototype.hasOwnProperty.call(mirrors, c.letterKey) && listed.has(mirrors[c.letterKey])));
  kept.sort((a, b) => collectionRank(a.collection) - collectionRank(b.collection)
    || a._ord - b._ord || (a.letterKey < b.letterKey ? -1 : a.letterKey > b.letterKey ? 1 : 0)
    || a.paragraph - b.paragraph || subRank(a.sub) - subRank(b.sub));
  return kept.map(({ _ord, ...c }) => /** @type {VotCitation} */ (c));
}

/** @type {WeakMap<object, Map<string, any[]>>} */
const LETTER_INDEX = new WeakMap();
/** letter key -> its edges, built once per edge list. */
function letterIndex(edges) {
  let idx = LETTER_INDEX.get(edges);
  if (idx) return idx;
  idx = new Map();
  for (const e of edges) {
    const key = e && (e.key || letterKeyOf(e));
    if (!key) continue;
    let list = idx.get(key);
    if (!list) idx.set(key, (list = []));
    list.push(e);
  }
  LETTER_INDEX.set(edges, idx);
  return idx;
}

/**
 * Every citation site of one letter in reading order (paragraph, then the
 * place in it): what a "verses this letter cites" list draws, each row able
 * to open the letter at its paragraph.
 * @param {any} graph @param {string} letterKey
 * @returns {Array<{verse:number, verseEnd:number, paragraph:number, sub:[string, number]|null, kind:string}>}
 */
export function letterCiteSites(graph, letterKey) {
  const edges = edgesOf(graph);
  if (!edges.length) return [];
  const rows = [];
  for (const e of letterIndex(edges).get(String(letterKey || '')) || []) {
    for (const at of sitesOf(e)) {
      rows.push({ verse: e.v, verseEnd: Math.max(e.v, at.ve >= 0 ? at.ve : e.v), paragraph: at.p, sub: at.sub || null, kind: at.kind });
    }
  }
  return rows.sort((a, b) => a.paragraph - b.paragraph || subRank(a.sub) - subRank(b.sub) || a.verse - b.verse);
}

/* ── opening a citation ────────────────────────────────────────────────── */

/**
 * The navigateToLink endpoint that opens a citation's letter AT its
 * paragraph: the endpoint's `key` is the reader's block key for that
 * paragraph (letter:<id>:<block>, wtlb:<id>:<paragraph>, a Bible Study's
 * letter:<chapterId>:<block>, or inside a prophecy group
 * letter:<chapterId>:<group>:<part>:<index>), which the reader scrolls to on
 * open. `collection` is the name a reader knows, never the raw volKey.
 * @param {any} c  a VotCitation (or any object with its address fields)
 * @returns {any}
 */
export function endpointFor(c) {
  if (!c) return null;
  const p = c.paragraph >= 0 ? c.paragraph : 0;
  const label = c.title || '';
  if (c.studyId && c.chapterId) {
    const tail = c.sub ? p + ':' + c.sub[0] + ':' + c.sub[1] : String(p);
    return {
      type: 'study-letter', key: 'letter:' + c.chapterId + ':' + tail,
      studyId: c.studyId, studyChapterId: c.chapterId, screen: 'bible-study-chapter',
      label, collection: c.collectionName || COLLECTION_NAMES.studies,
    };
  }
  const volKey = c.volKey || c.collection;
  const collection = c.collectionName || collectionName(volKey);
  // The landing a search hit makes (the hub's seam walk F1, 2026-10-22): the citation's own
  // block, pulsed, with its citing sentence placing the words in it. The key alone centred the
  // block, and a sentence near a long paragraph's end sat under the bottom edge, unmarked.
  const landing = (unit) => ({
    type: 'excerpt', text: String(c.excerpt || '').replace(/^…|…$/g, ''), letterId: unit, para: p,
  });
  if (c.entryId) {
    const type = volKey === 'blessed' ? 'blessed' : volKey === 'holydays' ? 'holy-days' : 'wtlb';
    return {
      type, key: entryHlBase(type, c.entryId) + ':' + p, entryId: c.entryId,
      screen: LETTER_SCREENS[volKey] || 'wtlb-one-entry', volKey, collection, label,
      surpriseAnchor: landing(c.entryId),
    };
  }
  if (c.letterId) {
    return {
      type: 'letter', key: 'letter:' + c.letterId + ':' + p, letterId: c.letterId,
      screen: LETTER_SCREENS[volKey] || 'vot-letter', volKey, collection, label,
      surpriseAnchor: landing(c.letterId),
    };
  }
  return null;
}

/* ── the reader's corpus ───────────────────────────────────────────────── */

/**
 * Each public collection's globals: [letters, preface]. Held to
 * data/scripture-resolution.js COLLECTIONS by vot-citations.test.js. Hidden
 * Manna is not here: it is never cited publicly.
 * @type {Record<string, [string, string|null]>}
 */
export const CORPUS_GLOBALS = {
  one: ['LETTERS_V1', 'LETTERS_V1_PREFACE'], two: ['LETTERS', null],
  three: ['LETTERS_V3', 'LETTERS_V3_PREFACE'], four: ['LETTERS_V4', 'LETTERS_V4_PREFACE'],
  five: ['LETTERS_V5', 'LETTERS_V5_PREFACE'], six: ['LETTERS_V6', 'LETTERS_V6_PREFACE'],
  seven: ['LETTERS_V7', 'LETTERS_V7_PREFACE'], timothy: ['LETTERS_TIMOTHY', 'LETTERS_TIMOTHY_PREFACE'],
  flock: ['LETTERS_FLOCK', 'LETTERS_FLOCK_PREFACE'], rebuke: ['LETTERS_REBUKE', 'LETTERS_REBUKE_PREFACE'],
  wtlb1: ['WTLB_ONE', null], wtlb2: ['WTLB_TWO', null], blessed: ['THE_BLESSED', null],
  holydays: ['HOLY_DAYS', null],
};

/** @type {WeakMap<object, Map<string, any>>} */
const BY_ID = new WeakMap();
/** @param {any} list @param {string} id */
function findById(list, id) {
  if (!Array.isArray(list)) return null;
  let m = BY_ID.get(list);
  if (!m) {
    m = new Map();
    for (const x of list) if (x && x.id != null && !m.has(String(x.id))) m.set(String(x.id), x);
    BY_ID.set(list, m);
  }
  return m.get(String(id)) || null;
}

/**
 * A CitationCorpus over the reader's globals (the Volumes bundle's letter
 * arrays and prefaces, the lazily loaded BIBLE_STUDIES). Reads them at call
 * time, so one corpus object keeps working as bundles land.
 * @param {any} [win] the global object (window); defaults to globalThis
 * @returns {CitationCorpus}
 */
export function windowCorpus(win) {
  const w = win || globalThis;
  return {
    letter(volKey, id) {
      const g = Object.prototype.hasOwnProperty.call(CORPUS_GLOBALS, volKey) ? CORPUS_GLOBALS[volKey] : null;
      if (!g) return null;
      const hit = findById(w[g[0]], id);
      if (hit) return hit;
      const pre = g[1] ? w[g[1]] : null;
      return pre && String(pre.id) === String(id) ? pre : null;
    },
    studyChapter(studyId, chapterId) {
      const study = findById(w.BIBLE_STUDIES, studyId);
      return study ? findById(study.chapters, chapterId) : null;
    },
  };
}

/**
 * The asset's studyLinks rows (encodeStudyLinks in tools/scripture-web-cites.mjs)
 * expanded to the graph's prophecy pairs and study letter-links.
 * @param {Array<any>|null|undefined} rows
 * @returns {{ prophecy: Array<{a:number, b:number, studyId:string, chapterId:string, p:number}>,
 *   votLinks: Array<{kind:'studyLetter', studyId:string, chapterId:string, volKey:string,
 *     letterId:string, p:number, sub?:[string, number]}> }}
 */
export function expandStudyLinks(rows) {
  /** @type {any[]} */
  const prophecy = [];
  /** @type {any[]} */
  const votLinks = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.sid || !row.id) continue;
    const studyId = String(row.sid), chapterId = String(row.id);
    for (const t of Array.isArray(row.pr) ? row.pr : []) {
      if (Array.isArray(t) && t[1] >= 0 && t[2] >= 0) prophecy.push({ a: t[1], b: t[2], studyId, chapterId, p: t[0] });
    }
    for (const t of Array.isArray(row.l) ? row.l : []) {
      if (!Array.isArray(t) || !t[1] || !t[2]) continue;
      /** @type {any} */
      const link = { kind: 'studyLetter', studyId, chapterId, volKey: String(t[1]), letterId: String(t[2]), p: t[0] };
      if (Array.isArray(t[3]) && t[3].length === 2) link.sub = [String(t[3][0]), Number(t[3][1])];
      votLinks.push(link);
    }
  }
  return { prophecy, votLinks };
}
