/* ─────────────────────────────────────────────────────────────────────────
   corpus-links.js — every cross-reference in the corpus, resolved the way the
   app resolves it at runtime. The walk behind tools/corpus-links.test.js.

   A link that does not resolve is rarely loud: openInAppLetter returns when
   resolveVotLetter finds nothing, a Matthew note whose letter is missing
   renders as a plain row, a WTLB source line whose collection is unknown
   renders as text, a cite missing from its dict quietly shows the NKJV under
   another translation's label. So this walk reads the data with the app's
   OWN lookups (imported where a module exports them; mirrored, and held to
   the original by a test, where it lives inside a component or index.html)
   and lists every link that would not land where its words say it goes.

   KINDS (what is walked, and what "resolves" means for it):
     letter-link     every {collection, letterTitle} object anywhere (footnote
                     link / seeAlso, metaAddendumLink, addendumLink, a
                     bibleStudies row, a letter-link segment at any depth in
                     the studies and the Matthew preface) and every Answers
                     sidecar letter link → the registry index.html builds.
                     Lookup is by exact title, so "target exists" and "its
                     real title matches letterTitle" are one test.
     letter-id       a letter-link segment's letterId + screen: the path a
                     segment WITHOUT a `link` takes (Segments' onLetterClick).
                     With a `link`, the tap follows the link (LetterView hands
                     every study chapter onInAppLink), so letterId must name
                     the same letter or one of the two is a misattribution;
                     and a label must not name a different letter.
     excerpt         the words a link quotes (a study excerpt, a Matthew note,
                     an Answers or WTLB passage, a footnote excerpt, a Holy
                     Days copy) are in the letter it opens. Flagged only on
                     positive evidence: the words are (all but) absent from the
                     target AND most of them are in one other original letter
                     — which is then what the link should open.
     also-read       metaAddendum / addendum ("Addendum to" / "Also Read"): it
                     has a target (link, same-volume id, or URL), and the words
                     the reader taps name the letter it opens.
     attribution     a Format B source line [From "Title" ~ Collection] (WTLB,
                     The Blessed, Holy Days, Answers): the collection is one the
                     reader maps, and that collection holds the title.
     holy-days-source  each Holy Days entry's sourceLabel names a collection
                     that holds an item of the same title (the original).
     footnote        an fn bubble's footnote exists; a scripture footnote's ref
                     finds its verse text the way FootnoteSheet does: the
                     owner's nkjv dict, key exact (translation tag included),
                     then for an untagged ref the bundled NKJV Bible.
     inline-cite     a {{ref:…}} cite, the way its reader looks it up
                     (WtlbEntryView: entry.scriptures, WTLB_SCRIPTURES;
                     LetterView: the item's nkjv), then the bundled Bible for an
                     untagged ref. A ref tagged with another translation and
                     missing from those dicts shows NKJV text under the tag.
     bible-nav       {{nav:bookId:chapter}} → BOOKS[bookId] has that chapter.
     matthew-note    a Matthew Study Bible VOT note → resolveVotLetter(vol,
                     letter): a note that misses renders as a plain row.
     matthew-cite    a Matthew scripture row whose cite is a reference → a
                     MATTHEW_NKJV key (StudyPanels: else untappable commentary).
     hidden-manna    each Hidden Manna letter is reached from the Matthew study
                     chain, nothing else links to it, its collection stays out
                     of every public index, and index.html's
                     HIDDEN_MANNA_TITLES names every Hidden Manna letter.
     verse-range     every reference at a link site (footnote refs, cites, dict
                     keys, Matthew anchors) parses with the app's own parser:
                     ASCII hyphen, an ascending range, and the book, chapter
                     and verses exist in the bundled Bible. Once per item.
     nav-chain       a stored prevLetter / nextLetter / prevEntry / nextEntry
                     names its neighbour's real title (validateChain checks the
                     ids, not the titles the bottom cards print).

   NOT re-checked here (owned elsewhere, see the test's header): schema shapes
   (validate-schemas.js), footnote verse-marker rendering (audit-footnotes.js,
   validateFootnoteMarkers), dashes and smart quotes in raw text
   (check_balance.py), bundled-translation wording (validateTaggedDictValues),
   Answers site URLs (answers-links.test.js), note footnotes' source letters
   and site pages (footnote-note.test.js), OCR attribution
   (misattribution_check.py).

   Usage: node tools/corpus-links.js        prints counts and every break
   ───────────────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLLECTIONS, COL_BY_LETTER_SC, READING_CHAIN,
  parseRefStr, splitCompoundRef, findBook, lookupVersesFromBooks,
} from '../app/src/main/assets/src/data/scripture-resolution.js';
import { parseRefRange } from '../app/src/main/assets/src/utils/scripture-parse.js';
import { splitFormatBInline } from '../app/src/main/assets/src/utils/format-b-inline.js';
import { titleKey } from '../app/src/main/assets/src/utils/footnote-note.js';
import { passageTextBefore } from '../app/src/main/assets/src/utils/answers-contents.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
export const DATA_DIR = resolve(ASSETS_DIR, 'src', 'data');

export const KINDS = Object.freeze([
  'letter-link', 'letter-id', 'excerpt', 'also-read', 'attribution', 'holy-days-source',
  'footnote', 'inline-cite', 'bible-nav', 'matthew-note', 'matthew-cite',
  'hidden-manna', 'verse-range', 'nav-chain',
]);

/** The data file that defines each COLLECTIONS global. A collection added to
    COLLECTIONS without a row here fails loadCorpus, so it cannot go unwalked. */
export const COLLECTION_FILES = Object.freeze({
  LETTERS_V1: 'volume-one.js', LETTERS: 'volume-two.js', LETTERS_V3: 'volume-three.js',
  LETTERS_V4: 'volume-four.js', LETTERS_V5: 'volume-five.js', LETTERS_V6: 'volume-six.js',
  LETTERS_V7: 'volume-seven.js', LETTERS_TIMOTHY: 'letters-timothy.js', LETTERS_FLOCK: 'letters-flock.js',
  LETTERS_REBUKE: 'lords-rebuke.js', WTLB_ONE: 'wtlb-one.js', WTLB_TWO: 'wtlb-two.js',
  THE_BLESSED: 'the-blessed.js', HOLY_DAYS: 'holy-days.js', ANSWERS: 'answers.js',
  HIDDEN_MANNA: 'hidden-manna.js',
});

/** The other corpus globals the walk reads, and their files. */
const OTHER_FILES = Object.freeze({
  WTLB_SCRIPTURES: 'wtlb-scriptures.js', BIBLE_STUDIES: 'bible-studies.js', MATTHEW: 'matthew.js',
  MATTHEW_NKJV: 'matthew-nkjv.js', MATTHEW_PLAIN: 'matthew-plain.js', BOOKS: 'books.js',
  ANSWERS_META: 'answers-meta.js',
});

/** The Blessed's introduction answers a note whose vol is null (index.html). */
export const BLESSED_INTRO_KEY = 'null::The Blessed: More Declarations of Blessedness From The Lord, Our God and Savior';

// ── loading ──────────────────────────────────────────────────────────────

/**
 * Every global the walk reads, each file run once in a fresh VM context (the
 * way validate-schemas.js and audit-footnotes.js load the corpus), plus
 * index.html's HIDDEN_MANNA_TITLES.
 * @param {{ dataDir?: string, indexHtml?: string | null }} [opts]
 */
export function loadCorpus({ dataDir = DATA_DIR, indexHtml = null } = {}) {
  /** @type {Record<string, Record<string, any>>} */
  const byFile = {};
  const fileGlobals = (/** @type {string} */ file) => {
    if (!byFile[file]) {
      const sandbox = {};
      runInNewContext(readFileSync(resolve(dataDir, file), 'utf8'), sandbox, { filename: file });
      byFile[file] = sandbox;
    }
    return byFile[file];
  };
  /** @type {Record<string, any>} */
  const globals = {};
  for (const col of COLLECTIONS) {
    const file = COLLECTION_FILES[col.globalName];
    if (!file) throw new Error(`corpus-links: COLLECTIONS has "${col.globalName}" but COLLECTION_FILES does not say which file defines it`);
    const fg = fileGlobals(file);
    globals[col.globalName] = fg[col.globalName];
    if (col.prefaceGlobal) globals[col.prefaceGlobal] = fg[col.prefaceGlobal];
  }
  for (const [name, file] of Object.entries(OTHER_FILES)) globals[name] = fileGlobals(file)[name];
  const html = indexHtml != null ? indexHtml : readFileSync(resolve(ASSETS_DIR, 'index.html'), 'utf8');
  return { globals, hiddenMannaTitles: hiddenMannaTitlesIn(html) };
}

/** index.html's `const HIDDEN_MANNA_TITLES = new Set([...])`, as a list (null when not found). */
export function hiddenMannaTitlesIn(html) {
  const m = /const HIDDEN_MANNA_TITLES = new Set\(\[([\s\S]*?)\]\s*\)/.exec(String(html || ''));
  if (!m) return null;
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse('"' + x[1] + '"'));
}

/** index.html's `window.__finishVotInit = function () {…};` source, for the drift test. */
export function finishVotInitSource(html) {
  const s = String(html || '');
  const at = s.indexOf('window.__finishVotInit = function');
  const end = at < 0 ? -1 : s.indexOf('\n};', at);
  return at < 0 || end < 0 ? null : s.slice(at + 'window.__finishVotInit = '.length, end + 2);
}

// ── the registry (index.html window.__finishVotInit, step 3) ─────────────

/**
 * VOT_LETTER_REGISTRY, built as index.html builds it: every collection's
 * preface and items keyed "<registryLabel>::<title>", Hidden Manna also
 * "<title>::<title>", The Blessed's introduction under BLESSED_INTRO_KEY, each
 * study "<title>::<title>" (its first chapter). `dupes` lists keys two items
 * share: the registry keeps the last, so a link can never reach the first.
 * @param {Record<string, any>} g corpus globals
 */
export function buildRegistry(g) {
  /** @type {Map<string, any>} */
  const reg = new Map();
  /** @type {string[]} */
  const dupes = [];
  const set = (key, val) => { if (reg.has(key)) dupes.push(key); reg.set(key, val); };
  for (const col of COLLECTIONS) {
    const letters = g[col.globalName];
    if (!letters) continue;
    const pref = col.prefaceGlobal ? g[col.prefaceGlobal] : null;
    const add = (/** @type {any} */ l) => {
      if (!l || !l.title || !l.id) return;
      set(col.registryLabel + '::' + l.title, { id: l.id, title: l.title, screen: col.letterScreen, volKey: col.volKey, col, item: l });
    };
    if (pref) [].concat(pref).forEach(add);
    [].concat(letters).forEach(add);
    if (col.volKey === 'hm') {
      for (const l of [].concat(letters)) {
        if (l && l.title && l.id) set(l.title + '::' + l.title, { id: l.id, title: l.title, screen: col.letterScreen, volKey: col.volKey, col, item: l });
      }
    }
  }
  const blessed = g.THE_BLESSED;
  const intro = Array.isArray(blessed) ? blessed.find((e) => e && e.id === 'introduction') : null;
  const bcol = COLLECTIONS.find((c) => c.volKey === 'blessed');
  if (intro) set(BLESSED_INTRO_KEY, { id: intro.id, title: intro.title, screen: 'blessed-entry', volKey: 'blessed', col: bcol, item: intro });
  for (const study of g.BIBLE_STUDIES || []) {
    if (!study || !study.title || !study.slug) continue;
    const first = study.chapters && study.chapters[0];
    if (!first) continue;
    set(study.title + '::' + study.title, { id: first.id, title: study.title, screen: 'bible-study-chapter', studyId: study.slug, isStudy: true, item: study });
  }
  return { reg, dupes };
}

/** letter-linking.js resolveVotLetter, over a given registry. */
export function resolveIn(reg, vol, letter) {
  if (!letter) return null;
  return reg.get((vol || 'null') + '::' + letter) || null;
}

/**
 * WtlbEntryView's _attrCollectionLabel: a source line's collection words
 * ("7", "Seven", "Volume 7", a COLLECTIONS label or registryLabel, any case)
 * → the registryLabel the tap resolves under, or null (the line renders as
 * plain text). The test runs the component's own function beside this one.
 * @param {string | null | undefined} volStr
 * @returns {string | null}
 */
export function attrCollectionLabel(volStr) {
  if (!volStr) return null;
  const s = String(volStr).trim().toLowerCase();
  const NUMS = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven' };
  if (NUMS[s]) return 'Volume ' + NUMS[s];
  const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  if (WORDS.includes(s)) return 'Volume ' + s.charAt(0).toUpperCase() + s.slice(1);
  const vm = s.match(/^volume\s+(\d|[a-z]+)$/);
  if (vm) return attrCollectionLabel(vm[1]);
  const col = COLLECTIONS.find((c) => c.registryLabel && (c.registryLabel.toLowerCase() === s || (c.label || '').toLowerCase() === s));
  return col ? col.registryLabel : null;
}

// ── helpers ──────────────────────────────────────────────────────────────

const REF_RE = /\{\{ref:([^}]*)\}\}/g;
const NAV_RE = /\{\{nav:([^}]*)\}\}/g;
// WtlbEntryView.renderLine's source-line match, on a splitFormatBInline segment.
const ATTR_SEG_RE = /^\[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/;
// AnswersTopic's source chip (act.source): the whole paragraph is the line.
const ATTR_PARA_RE = /^~ \[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/;
// A study letter-link label: "\"Title\" - Collection" (the title may be cut with "...").
const LABEL_RE = /^["“](.+?)["”](?:\s*[-–—]\s*(.+))?$/;
const TAG_RE = /\(([A-Za-z0-9]+)\)\s*$/;
// The keys a letter's own words live under, for the excerpt check: links,
// dicts, neighbours and media are not the letter's text.
const NOT_TEXT = new Set(['footnotes', 'nkjv', 'scriptures', 'prevLetter', 'nextLetter', 'prevEntry', 'nextEntry',
  'relatedTopics', 'bibleStudies', 'link', 'seeAlso', 'metaAddendumLink', 'addendumLink', 'videos', 'id', 'url',
  'audioUrl', 'soundcloudUrl', 'videoVoiceUrl', 'videoMusicUrl', 'metaAddendumUrl', 'addendumUrl', 'nextLetterExternal']);
// Excerpt evidence: 5-word shingles; at least 8 of them to judge; "absent" below
// 15 % of them in the target; "present" from 60 % in one other original letter.
// The fix is named only when it is clear: that letter has the link's own title
// (a right title in the wrong collection), or it holds 75 % of the words (a
// passage stitched from two letters, the one case below that, names neither).
const SHINGLE = 5;
const MIN_SHINGLES = 8;
const ABSENT = 0.15;
const PRESENT = 0.6;
const DECISIVE = 0.75;
// Anthologies quote the letters, so they never count as where words come from.
const ANTHOLOGIES = new Set(['answers', 'holydays']);

/** Every item of one collection, preface first. */
function itemsOf(g, col) {
  const out = [];
  const pref = col.prefaceGlobal ? g[col.prefaceGlobal] : null;
  if (pref) out.push(...[].concat(pref));
  const arr = g[col.globalName];
  if (Array.isArray(arr)) out.push(...arr);
  return out.filter(Boolean);
}

/** Strip the quote marks a metaAddendum / addendum carries around its title. */
function unquote(s) {
  return String(s || '').trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
}

/** Same title, as the reader would read it (case, quotes, punctuation aside). */
function sameTitle(a, b) { return titleKey(a) === titleKey(b); }

/** Words as compared for excerpts: markup, case, accents and punctuation aside. */
function words(s) {
  return String(s || '').replace(/\{\{[^}]*\}\}/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** An item's own words (blocks, paragraphs, headers), as one string. */
function textOf(item) {
  const out = [];
  (function walk(n) {
    if (typeof n === 'string') { out.push(n); return; }
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    for (const k of Object.keys(n)) if (!NOT_TEXT.has(k)) walk(n[k]);
  })(item);
  return out.join(' ');
}

/** An excerpt's shingles, never across an omission ("...", "…", "[…]"). */
function excerptShingles(text) {
  const out = [];
  for (const chunk of String(text || '').split(/\.\.\.|…|\[[^\]]*\]/)) {
    const w = words(chunk);
    for (let i = 0; i + SHINGLE <= w.length; i++) out.push(w.slice(i, i + SHINGLE).join(' '));
  }
  return out;
}

/** Suggest the item a broken (collection, title) most likely meant, or null. */
function suggest(reg, collection, title) {
  const want = titleKey(title);
  if (!want) return null;
  const hits = [];
  for (const key of reg.keys()) {
    const at = key.indexOf('::');
    const c = key.slice(0, at);
    if (c === 'null') continue;
    const t = key.slice(at + 2);
    if (titleKey(t) === want) hits.push({ c, t, score: c === collection ? 0 : 1 });
  }
  if (!hits.length) {
    // A cut title ("Title..."), or one missing its tail, in the same collection.
    const cut = want.replace(/\s*(?:\.\.\.|…)$/, '');
    for (const key of reg.keys()) {
      const at = key.indexOf('::');
      const c = key.slice(0, at);
      if (c === 'null' || (collection && c !== collection)) continue;
      if (cut.length >= 12 && titleKey(key.slice(at + 2)).startsWith(cut)) hits.push({ c, t: key.slice(at + 2), score: 2 });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.score - b.score);
  const best = hits.filter((h) => h.score === hits[0].score);
  return best.length === 1 ? `${best[0].c}::${best[0].t}` : null;
}

/** A chapter's verse numbers, or null. Sectioned (BOOKS) or flat (MATTHEW). */
function chapterVerses(books, bookKey, chapter) {
  const b = books[bookKey];
  const ch = b && Array.isArray(b.chapters) ? b.chapters.find((c) => c.num === chapter) : null;
  if (!ch) return null;
  const vs = ch.sections ? ch.sections.flatMap((s) => s.verses || []) : (ch.verses || []);
  return new Set(vs.map((v) => v.n));
}

/** A Matthew anchor's verse list ("18-21", "32, 36") against its chapter's verses. */
function anchorProblem(ref, chNum, verses) {
  const m = /^(\d+):(.+)$/.exec(String(ref || '').trim());
  if (!m) return 'does not parse as chapter:verse';
  if (/[–—]/.test(m[2])) return 'an en/em dash in the reference (Permanent Rule 1: ASCII hyphen)';
  if (Number(m[1]) !== chNum) return `names chapter ${m[1]} under chapter ${chNum}`;
  for (const part of m[2].split(',').map((s) => s.trim()).filter(Boolean)) {
    const r = /^(\d+)(?:\s*-\s*(\d+))?[a-c]?$/.exec(part);
    if (!r) return `"${part}" is not a verse or range`;
    const a = Number(r[1]), b = r[2] ? Number(r[2]) : a;
    if (b <= a && r[2]) return `range ${a}-${b} does not ascend`;
    for (const v of [a, b]) if (!verses.has(v)) return `chapter ${chNum} has no verse ${v}`;
  }
  return null;
}

/** A short, stable name for where in an item a link sits. */
function locusOf(path) {
  const p = path.map(String);
  const fi = p.indexOf('footnotes');
  if (fi >= 0) return `footnote ${p[fi + 1]} ${p.slice(fi + 2).filter((x) => !/^\d+$/.test(x)).join(' ')}`.trim();
  const pi = p.indexOf('paragraphs');
  if (pi >= 0) return `¶${p[pi + 1]}`;
  if (p.includes('segments') || p.includes('lines')) return 'letter-link';
  const named = p.filter((x) => !/^\d+$/.test(x));
  return named.length ? named.join(' ') : 'text';
}

// ── the walk ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ kind: string, where: string, target: string, why: string, should?: string }} Break
 */

/**
 * Walk every cross-reference in the corpus.
 * @param {{ globals: Record<string, any>, hiddenMannaTitles: string[] | null }} corpus
 * @returns {{ checked: Record<string, number>, breaks: Break[] }}
 */
export function checkCorpusLinks(corpus) {
  const g = corpus.globals;
  const { reg, dupes } = buildRegistry(g);
  /** @type {Record<string, number>} */
  const checked = Object.fromEntries(KINDS.map((k) => [k, 0]));
  /** @type {Break[]} */
  const breaks = [];
  const brk = (/** @type {Break} */ b) => { breaks.push(b.should ? b : { kind: b.kind, where: b.where, target: b.target, why: b.why }); };

  // The Bible the sheets fall back to: index.html's BOOKS (+ matthew-plain)
  // under active-content.js's ALL_BOOKS (the Matthew Study Bible first).
  const books = { ...(g.MATTHEW ? { matthew: g.MATTHEW } : {}), ...(g.BOOKS || {}), ...(g.MATTHEW_PLAIN ? { 'matthew-plain': g.MATTHEW_PLAIN } : {}) };
  const hadWindow = typeof globalThis.window !== 'undefined';
  if (!hadWindow) globalThis.window = /** @type {any} */ (globalThis);
  const prevAll = globalThis.window.__ALL_BOOKS;
  globalThis.window.__ALL_BOOKS = books;
  try {
    walk();
  } finally {
    if (prevAll === undefined) delete globalThis.window.__ALL_BOOKS; else globalThis.window.__ALL_BOOKS = prevAll;
    if (!hadWindow) delete globalThis.window;
  }
  return { checked, breaks };

  function walk() {
    for (const key of new Set(dupes)) {
      checked['letter-link']++;
      brk({ kind: 'letter-link', where: 'registry', target: key, why: 'two items share this collection and title; the registry keeps the last, so no link can reach the first' });
    }

    // Everything that can carry links, with its file and a stable name.
    /** @type {Array<{ file: string, id: string, owner: any, col: any, fmt: 'A' | 'B' | 'study' }>} */
    const owners = [];
    for (const col of COLLECTIONS) {
      const file = COLLECTION_FILES[col.globalName];
      for (const item of itemsOf(g, col)) {
        const fmt = col.kind === 'letter' || (col.kind === 'holy-days' && item.type === 'letter') ? 'A' : 'B';
        owners.push({ file, id: item.id || item.title || '?', owner: item, col, fmt });
      }
    }
    for (const study of g.BIBLE_STUDIES || []) {
      for (const ch of (study && study.chapters) || []) {
        owners.push({ file: 'bible-studies.js', id: String(ch.id), owner: ch, col: null, fmt: 'study' });
      }
    }

    // ── excerpt evidence ──
    const originals = [...reg.values()].filter((v) => !v.isStudy && v.col && !ANTHOLOGIES.has(v.col.volKey));
    /** @type {Map<any, Set<string>>} */
    const shingleCache = new Map();
    const shinglesOf = (item) => {
      let s = shingleCache.get(item);
      if (!s) {
        const w = words(textOf(item));
        s = new Set();
        for (let i = 0; i + SHINGLE <= w.length; i++) s.add(w.slice(i, i + SHINGLE).join(' '));
        shingleCache.set(item, s);
      }
      return s;
    };
    const share = (sh, item) => { const set = shinglesOf(item); let n = 0; for (const x of sh) if (set.has(x)) n++; return n / sh.length; };
    const pct = (x) => `${Math.round(x * 100)}%`;
    /** Judge quoted words against the letter a link opens (`hit`, titled `title`). */
    const checkExcerpt = (quoted, hit, where, target, title) => {
      if (!hit || hit.isStudy) return;
      const sh = excerptShingles(quoted);
      if (sh.length < MIN_SHINGLES) return;
      checked.excerpt++;
      const own = share(sh, hit.item);
      if (own >= ABSENT) return;
      const holders = [];
      for (const v of originals) {
        if (v.item === hit.item) continue;
        const s = share(sh, v.item);
        if (s >= PRESENT) holders.push({ v, s });
      }
      if (!holders.length) return;
      holders.sort((a, b) => b.s - a.s);
      const named = holders.find((h) => sameTitle(h.v.title, title || hit.title));
      const best = named || holders[0];
      const at = `${best.v.col.registryLabel}::${best.v.title}`;
      brk({ kind: 'excerpt', where, target, why: `the words it quotes are not in this letter (${pct(own)}); ${pct(best.s)} of them are in ${at}`, ...(named || best.s >= DECISIVE ? { should: at } : {}) });
    };

    // ── letter-link + letter-id (+ excerpt): every {collection, letterTitle} object ──
    const whyUnresolved = (collection) => {
      if (COLLECTIONS.some((c) => c.registryLabel === collection)) return 'no item of this title in the collection';
      const low = String(collection).toLowerCase();
      const byLabel = COLLECTIONS.find((c) => c.label.toLowerCase() === low || c.registryLabel.toLowerCase() === low);
      if (byLabel) return `"${collection}" is not the registryLabel ("${byLabel.registryLabel}")`;
      return 'no collection or study by this name';
    };
    const linkTo = (node, where, latent) => {
      checked['letter-link']++;
      const hit = resolveIn(reg, node.collection, node.letterTitle);
      if (!hit) {
        const should = suggest(reg, node.collection, node.letterTitle);
        brk({ kind: 'letter-link', where, target: `${node.collection}::${node.letterTitle}`, why: whyUnresolved(node.collection) + (latent ? ` (${latent})` : ', so the tap does nothing'), ...(should ? { should } : {}) });
      } else if (typeof node.excerpt === 'string') {
        checkExcerpt(node.excerpt, hit, where, `${node.collection}::${node.letterTitle}`, node.letterTitle);
      }
      return hit;
    };
    const checkSegment = (seg, where, quoted) => {
      const viaLink = seg.link ? resolveIn(reg, seg.link.collection, seg.link.letterTitle) : null;
      const col = COL_BY_LETTER_SC.get(seg.screen);
      const item = col ? itemsOf(g, col).find((l) => l.id === seg.letterId) : null;
      if (seg.letterId != null || seg.screen != null) {
        checked['letter-id']++;
        const target = `${seg.screen}/${seg.letterId}`;
        // Without a link this is the live path (Segments' onLetterClick); with
        // one the tap follows the link, and letterId is latent but must agree.
        const latent = seg.link ? ' (latent: the tap follows the link)' : ', so the tap goes nowhere';
        if (!col) brk({ kind: 'letter-id', where, target, why: `no letter screen "${seg.screen}"${latent}`, ...(viaLink ? { should: `${viaLink.screen}/${viaLink.id}` } : {}) });
        else if (!item) brk({ kind: 'letter-id', where, target, why: `no letter "${seg.letterId}" in ${col.registryLabel}${latent}`, ...(viaLink ? { should: `${viaLink.screen}/${viaLink.id}` } : {}) });
        else if (viaLink && item !== viaLink.item) {
          // Which of the two holds the words the segment quotes?
          const sh = excerptShingles(quoted || '');
          const judged = sh.length >= MIN_SHINGLES;
          const sLink = judged ? share(sh, viaLink.item) : 0;
          const sId = judged ? share(sh, item) : 0;
          const words_ = judged ? `; the quoted words are ${pct(sLink)} in the link's letter, ${pct(sId)} in letterId's` : '';
          const fixId = !judged || sLink >= sId;
          brk({ kind: 'letter-id', where, target, why: `letterId names ${col.registryLabel}::${item.title}, the link (which the tap follows) ${seg.link.collection}::${seg.link.letterTitle}${words_}`,
            should: fixId ? `${viaLink.screen}/${viaLink.id}` : `link ${col.registryLabel}::${item.title}` });
        }
      }
      // What the tap opens, and whether the label names a different letter.
      const opens = seg.link ? viaLink : (item ? { item, title: item.title, col } : null);
      const lm = LABEL_RE.exec(String(seg.label || '').trim());
      if (opens && lm) {
        checked['letter-id']++;
        const labelCol = lm[2] ? attrCollectionLabel(lm[2]) : null;
        const other = !sameTitle(lm[1], opens.title) ? suggest(reg, labelCol, lm[1]) : null;
        if (labelCol && opens.col && labelCol !== opens.col.registryLabel) {
          brk({ kind: 'letter-id', where, target: `${opens.col.registryLabel}::${opens.title}`, why: `the label says ${lm[2]}, the tap opens ${opens.col.registryLabel}` });
        } else if (other && other !== `${opens.col && opens.col.registryLabel}::${opens.title}`) {
          brk({ kind: 'letter-id', where, target: `${opens.col ? opens.col.registryLabel : '?'}::${opens.title}`, why: `the label names another letter (${other}) than the tap opens` });
        }
      }
      if (opens && quoted != null) {
        checkExcerpt(quoted, opens, where, seg.link ? `${seg.link.collection}::${seg.link.letterTitle}` : `${seg.screen}/${seg.letterId}`, seg.link ? seg.link.letterTitle : opens.title);
      }
    };
    /** A run of segments: each letter-link quotes the text since the previous one.
        A poem's lines are read as one run first, so a segment is checked once. */
    const segsDone = new Set();
    const walkSegments = (segs, where) => {
      let quoted = '';
      for (const s of segs) {
        if (s && s.t === 'letter-link') {
          if (!segsDone.has(s)) checkSegment(s, where, quoted.replace(/[(“"\s]*(?:(?:an\s+)?excerpts?\s+from\s*)?["“]?\s*$/i, ''));
          segsDone.add(s);
          quoted = '';
        } else if (s && typeof s.v === 'string') {
          quoted += s.v;
        }
      }
    };
    const walkLinks = (node, file, id, path, latent) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        // A segment run (or a poem's lines, one run) is read in order, for its excerpts.
        if (node.some((x) => x && x.t === 'letter-link')) walkSegments(node, `${file} ${id} letter-link`);
        else if (node.length && node.every((l) => Array.isArray(l)) && node.some((l) => l.some((x) => x && x.t === 'letter-link'))) {
          walkSegments(node.flatMap((l) => [...l, { t: 'text', v: ' ' }]), `${file} ${id} letter-link`);
        }
        node.forEach((x, i) => walkLinks(x, file, id, path.concat(i), latent));
        return;
      }
      if (typeof node.collection === 'string' && typeof node.letterTitle === 'string') {
        linkTo(node, `${file} ${id} ${locusOf(path)}`, latent);
      }
      for (const k of Object.keys(node)) {
        if (k === 'nkjv' || k === 'scriptures' || k === 'prevLetter' || k === 'nextLetter' || k === 'prevEntry' || k === 'nextEntry') continue;
        walkLinks(node[k], file, id, path.concat(k), latent);
      }
    };
    for (const o of owners) walkLinks(o.owner, o.file, o.id, [], null);
    if (g.MATTHEW && g.MATTHEW.preface) walkLinks(g.MATTHEW.preface, 'matthew.js', 'preface', [], 'latent: the Matthew preface is not rendered today');
    // Answers sidecar links ({kind:'letter'}, attr.inApp): act.letter maps the
    // collection words through _attrCollectionLabel first (WtlbEntryView).
    for (const [tid, m] of Object.entries(g.ANSWERS_META || {})) {
      (function walkMeta(n, path) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach((x, i) => walkMeta(x, path.concat(i))); return; }
        const L = n.kind === 'letter' && typeof n.title === 'string' ? { collection: n.collection, title: n.title }
          : n.inApp && typeof n.inApp.title === 'string' ? { collection: n.inApp.collection, title: n.inApp.title } : null;
        if (L) {
          checked['letter-link']++;
          checked['hidden-manna']++;
          const collection = attrCollectionLabel(L.collection) || L.collection;
          const where = `answers-meta.js ${tid} ¶${path[1]} ${n.kind === 'letter' ? 'letter link' : 'attribution'}`;
          const hit = resolveIn(reg, collection, L.title);
          if (!hit) {
            const should = suggest(reg, collection, L.title);
            brk({ kind: 'letter-link', where, target: `${L.collection}::${L.title}`, why: whyUnresolved(collection) + ', so the tap does nothing', ...(should ? { should } : {}) });
          } else if (hit.volKey === 'hm') {
            brk({ kind: 'hidden-manna', where, target: `${L.collection}::${L.title}`, why: 'a public link to Hidden Manna, which only the Matthew study chain may reach' });
          }
          return;
        }
        for (const k of Object.keys(n)) walkMeta(n[k], path.concat(k));
      })(m, []);
    }

    // ── also-read: metaAddendum (the header's "Addendum to") and addendum (the "Also Read" card) ──
    for (const o of owners) {
      if (o.fmt === 'study') continue;
      for (const [text, link, internal, url, name] of [
        ['metaAddendum', 'metaAddendumLink', 'metaAddendumInternal', 'metaAddendumUrl', 'Addendum to'],
        ['addendum', 'addendumLink', 'addendumInternal', 'addendumUrl', 'Also Read'],
      ]) {
        const words_ = o.owner[text];
        if (!words_) continue;
        checked['also-read']++;
        const where = `${o.file} ${o.id} ${text}`;
        let real = null;
        let opens = '';
        if (o.owner[link]) {
          const hit = resolveIn(reg, o.owner[link].collection, o.owner[link].letterTitle);
          if (!hit) continue;          // reported under letter-link
          real = hit.title;
          opens = `${o.owner[link].collection}::${o.owner[link].letterTitle}`;
        } else if (o.owner[internal]) {
          const item = itemsOf(g, o.col).find((l) => l.id === o.owner[internal]);
          if (!item) { brk({ kind: 'also-read', where, target: `${o.col.registryLabel} id ${o.owner[internal]}`, why: `"${name}" opens a letter id the collection does not have` }); continue; }
          real = item.title;
          opens = `${o.col.registryLabel}::${item.title}`;
        } else if (o.owner[url]) {
          continue;                     // an outside page: nothing in the corpus to resolve
        } else {
          brk({ kind: 'also-read', where, target: unquote(words_), why: `"${name}" has no link, no same-volume id and no URL, so the tap goes nowhere` });
          continue;
        }
        if (!sameTitle(unquote(words_), real)) {
          brk({ kind: 'also-read', where, target: opens, why: `the words "${unquote(words_)}" name another letter than the one the tap opens ("${real}")` });
        }
      }
    }

    // ── attribution (+ excerpt): Format B source lines ──
    for (const o of owners) {
      if (o.fmt !== 'B') continue;
      const isAnswers = o.col.volKey === 'answers';
      const paras = o.owner.paragraphs || [];
      paras.forEach((para, pi) => {
        const text = String((para && para.text) || '');
        /** @type {Array<[string, string, string]>} */
        const lines = [];
        if (isAnswers) {
          const m = ATTR_PARA_RE.exec(text.trim());
          if (m) lines.push([m[1], m[2], '']);
        } else {
          let before = '';
          for (const seg of splitFormatBInline(text)) {
            const m = seg && ATTR_SEG_RE.exec(seg);
            if (m) { lines.push([m[1], m[2], before.replace(/~\s*$/, '')]); before = ''; } else before += seg || '';
          }
        }
        for (const [title, colWords, before] of lines) {
          checked.attribution++;
          const where = `${o.file} ${o.id} ¶${pi}`;
          const collection = attrCollectionLabel(colWords);
          if (!collection) {
            brk({ kind: 'attribution', where, target: `${colWords}::${title}`, why: `"${colWords}" is not a collection the reader maps, so the source line is ${isAnswers ? 'a chip whose tap does nothing' : 'plain text'}` });
            continue;
          }
          const hit = resolveIn(reg, collection, title);
          if (!hit) {
            const should = suggest(reg, collection, title);
            brk({ kind: 'attribution', where, target: `${collection}::${title}`, why: 'no item of this title in the collection, so the tap does nothing', ...(should ? { should } : {}) });
            continue;
          }
          checkExcerpt(`${passageTextBefore(paras, pi)} ${before}`, hit, where, `${collection}::${title}`, title);
        }
      });
    }

    // ── holy-days-source (+ excerpt): each ghost entry names its original ──
    for (const e of g.HOLY_DAYS || []) {
      if (!e) continue;
      checked['holy-days-source']++;
      const where = `holy-days.js ${e.id}`;
      const col = COLLECTIONS.find((c) => c.registryLabel === e.sourceLabel || c.label === e.sourceLabel);
      if (!col || col.volKey === 'holydays') {
        brk({ kind: 'holy-days-source', where, target: String(e.sourceLabel), why: 'sourceLabel names no other collection' });
        continue;
      }
      const items = itemsOf(g, col);
      const original = items.find((l) => l.title === e.title);
      if (original) {
        checkExcerpt(textOf(e), { item: original, title: original.title }, where, `${col.registryLabel}::${e.title}`, e.title);
        continue;
      }
      const near = items.find((l) => sameTitle(l.title, e.title));
      brk({ kind: 'holy-days-source', where, target: `${col.registryLabel}::${e.title}`, why: near ? 'the original carries the title with other capitals or punctuation' : 'the collection it names holds no item of this title', ...(near ? { should: `${col.registryLabel}::${near.title}` } : {}) });
    }

    // ── verse-range: a reference at a link site, parsed the app's way ──
    /** @type {Map<string, string | null>} */
    const rangeMemo = new Map();
    const rangeProblem = (ref) => {
      if (rangeMemo.has(ref)) return rangeMemo.get(ref);
      let why = null;
      const s = String(ref);
      if (/[–—]/.test(s)) why = 'an en/em dash in the reference (Permanent Rule 1: ASCII hyphen)';
      else {
        const parts = /[;,]/.test(s) ? splitCompoundRef(s) : [];
        for (const part of parts.length > 1 ? parts.map((p) => p.ref) : [s]) {
          const p = parseRefStr(part);
          if (!p) { why = `"${part}" does not parse as a reference, so the sheet has no Go to Scripture`; break; }
          const bookKey = findBook(p.rawBook);
          const vs = bookKey ? chapterVerses(books, bookKey, p.chapter) : null;
          if (!bookKey) { why = `no book "${p.rawBook}"`; break; }
          if (!vs || vs.size === 0) { why = `${p.rawBook} has no chapter ${p.chapter}`; break; }
          if (p.verse == null) continue;
          if (p.verseEnd != null && p.verseEnd <= p.verse) { why = `range ${p.verse}-${p.verseEnd} does not ascend`; break; }
          const range = parseRefRange(part);
          const nums = range && range.verses ? range.verses : [p.verse, ...(p.verseEnd != null ? [p.verseEnd] : [])];
          const missing = nums.filter((n) => !vs.has(n));
          if (missing.length) { why = `${p.rawBook} ${p.chapter} has no verse ${missing.join(', ')}`; break; }
        }
      }
      rangeMemo.set(ref, why);
      return why;
    };
    /** The reference a malformed one plainly means: a bare trailing tag put in
        parentheses, or the passage behind a prose prefix. Null when unsure. */
    const rangeFix = (ref) => {
      const s = String(ref).replace(/[–—]/g, '-');
      const bare = /^(.*\d)\s+([A-Z]{2,6})$/.exec(s);
      const tries = [s, bare ? `${bare[1]} (${bare[2]})` : null, (/(?:^|[\s:-])((?:[1-3]\s)?[A-Z][a-z]+(?: [A-Z][a-z]+)* \d+(?::\d+(?:-\d+)?)?)$/.exec(s) || [])[1]];
      const fix = tries.find((t) => t && t !== ref && !rangeProblem(t));
      return fix || null;
    };
    /** One check per (item, reference): a footnote's ref is also its dict key. */
    const rangeSeen = new Set();
    const checkRange = (ref, ownerKey, where) => {
      const k = ownerKey + '\u0000' + ref;
      if (rangeSeen.has(k)) return;
      rangeSeen.add(k);
      checked['verse-range']++;
      const why = rangeProblem(ref);
      if (!why) return;
      const should = rangeFix(ref);
      brk({ kind: 'verse-range', where, target: ref, why, ...(should ? { should } : {}) });
    };

    /**
     * A cite's verse text the way the sheets find it: the dicts in order (exact
     * key), then lookupVersesFromBooks, which shows the NKJV for a ref tagged
     * with another translation unless that translation is already in memory.
     * @returns {string | null} why it fails, or null
     */
    const citeProblem = (ref, dicts) => {
      for (const d of dicts) if (d && typeof d === 'object' && String(d[ref] || '').trim()) return null;
      const tag = TAG_RE.exec(String(ref));
      if (tag && tag[1].toUpperCase() !== 'NKJV') {
        return `not in the dict this reader reads, so the sheet shows the bundled NKJV under the (${tag[1]}) label`;
      }
      if (!lookupVersesFromBooks(ref)) return 'no verse text: not in the dict this reader reads and not in the bundled Bible';
      return null;
    };

    // ── footnote + inline-cite + bible-nav (+ verse-range at each site) ──
    const wtlbDict = g.WTLB_SCRIPTURES || {};
    for (const o of owners) {
      const L = o.owner;
      const ownerKey = `${o.file} ${o.id}`;
      const fns = L.footnotes && typeof L.footnotes === 'object' ? L.footnotes : null;
      // The dicts this item's reader consults, in order, for an inline cite.
      const citeDicts = o.fmt === 'B' ? [L.scriptures, wtlbDict] : [L.nkjv];
      /** @type {string[]} */
      const fnUsed = [];
      (function collectFn(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(collectFn); return; }
        if (n.t === 'fn' && typeof n.v === 'string') fnUsed.push(n.v);
        for (const k of Object.keys(n)) if (k !== 'nkjv' && k !== 'footnotes' && k !== 'scriptures') collectFn(n[k]);
      })(L);
      for (const v of fnUsed) {
        checked.footnote++;
        if (!fns || !fns[v]) brk({ kind: 'footnote', where: ownerKey, target: `footnote ${v}`, why: 'an fn bubble names a footnote the item does not have' });
      }
      for (const [num, fn] of Object.entries(fns || {})) {
        if (!fn || fn.type !== 'scripture' || typeof fn.ref !== 'string' || !fn.ref || !fnUsed.includes(num)) continue;
        checked.footnote++;
        const where = `${ownerKey} footnote ${num}`;
        checkRange(fn.ref, ownerKey, where);
        const why = citeProblem(fn.ref, [L.nkjv]);
        if (why) brk({ kind: 'footnote', where, target: fn.ref, why });
      }
      // {{ref:…}} / {{nav:…}} anywhere in the item's rendered strings
      const seen = new Set();
      (function walkStr(n, path) {
        if (n == null) return;
        if (typeof n === 'string') {
          if (n.indexOf('{{') < 0) return;
          const where = `${ownerKey} ${locusOf(path)}`;
          for (const m of n.matchAll(REF_RE)) {
            const ref = m[1].trim();
            checked['inline-cite']++;
            if (!ref) { brk({ kind: 'inline-cite', where, target: '{{ref:}}', why: 'an empty cite' }); continue; }
            checkRange(ref, ownerKey, where);
            const why = citeProblem(ref, citeDicts);
            if (why) brk({ kind: 'inline-cite', where, target: ref, why });
          }
          for (const m of n.matchAll(NAV_RE)) {
            checked['bible-nav']++;
            const [bookId, ch, ...rest] = m[1].split(':');
            const book = (g.BOOKS || {})[bookId];
            const chapter = book && Array.isArray(book.chapters) && /^\d+$/.test(ch || '') && !rest.length ? book.chapters.find((c) => c.num === Number(ch)) : null;
            if (!chapter) brk({ kind: 'bible-nav', where, target: `{{nav:${m[1]}}}`, why: !book ? `BOOKS has no "${bookId}"` : `${book.title} has no chapter ${ch}` });
          }
          return;
        }
        if (typeof n !== 'object' || seen.has(n)) return;
        seen.add(n);
        if (Array.isArray(n)) { n.forEach((x, i) => walkStr(x, path.concat(i))); return; }
        for (const k of Object.keys(n)) if (k !== 'nkjv' && k !== 'scriptures' && k !== 'footnotes') walkStr(n[k], path.concat(k));
      })(L, []);
      // dict keys are lookup keys: each must be a real passage
      for (const [dname, d] of [['nkjv', L.nkjv], ['scriptures', L.scriptures]]) {
        if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
        for (const key of Object.keys(d)) checkRange(key, ownerKey, `${ownerKey} ${dname} key`);
      }
    }
    for (const [file, d] of [['wtlb-scriptures.js', wtlbDict], ['matthew-nkjv.js', g.MATTHEW_NKJV]]) {
      for (const key of Object.keys(d || {})) checkRange(key, file, `${file} key`);
    }

    // ── Matthew Study Bible: notes, cites, anchors, and Hidden Manna ──
    const M = g.MATTHEW;
    const hmCol = COLLECTIONS.find((c) => c.volKey === 'hm');
    const hmLetters = hmCol ? itemsOf(g, hmCol) : [];
    const hmReached = new Set();
    const anchor = (ref, ch, where, verses) => {
      checked['verse-range']++;
      const why = anchorProblem(ref, ch.num, verses);
      if (why) brk({ kind: 'verse-range', where, target: String(ref), why });
    };
    for (const ch of (M && M.chapters) || []) {
      const verses = new Set((ch.verses || []).map((v) => v.n));
      for (const n of ch.votNotes || []) {
        checked['matthew-note']++;
        const where = `matthew.js chapter ${ch.num} note ${n.ref}`;
        anchor(n.ref, ch, where, verses);
        const hit = resolveIn(reg, n.vol, n.letter);
        if (!hit) {
          const hm = (corpus.hiddenMannaTitles || []).includes(String(n.letter || '').trim());
          const should = hm ? null : suggest(reg, n.vol, n.letter);
          brk({ kind: 'matthew-note', where, target: `${n.vol}::${n.letter}`, why: hm ? 'a Hidden Manna letter hidden-manna.js does not carry: the note shows the badge and has no tap' : 'no such letter, so the note renders as a plain row', ...(should ? { should } : {}) });
          continue;
        }
        if (hit.volKey === 'hm') hmReached.add(hit.item);
        if (n.excerpt) checkExcerpt(n.excerpt, hit, where, `${n.vol}::${n.letter}`, n.letter);
      }
      for (const s of ch.scriptures || []) {
        const where = `matthew.js chapter ${ch.num} scripture ${s.ref}`;
        anchor(s.ref, ch, where, verses);
        const cite = String(s.cite || '').trim();
        // A cite that is ENTIRELY a reference (a compound list included); prose rows are commentary.
        const chunks = cite.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
        const isRef = chunks.length > 0 && !!parseRefStr(chunks[0]) && splitCompoundRef(cite).length >= 1
          && chunks.every((c) => /^(?:[1-3]?\s?[A-Za-z][A-Za-z. ']*\s)?\d+(?::\d+(?:\s*-\s*\d+)?)?(?:\s*\([A-Za-z0-9]+\))?$/.test(c));
        if (!isRef) continue;
        checked['matthew-cite']++;
        if (!String((g.MATTHEW_NKJV || {})[s.cite] || '').trim()) {
          brk({ kind: 'matthew-cite', where, target: cite, why: 'not a MATTHEW_NKJV key, so the row renders as commentary with no tap' });
        }
        checkRange(cite, 'matthew.js', where);
      }
    }
    // Hidden Manna: reached from the Matthew chain, and from nowhere public.
    for (const l of hmLetters) {
      checked['hidden-manna']++;
      if (!hmReached.has(l)) brk({ kind: 'hidden-manna', where: `hidden-manna.js ${l.id}`, target: l.title, why: 'no Matthew Study Bible note reaches it, so no reader can' });
      if (!corpus.hiddenMannaTitles || !corpus.hiddenMannaTitles.includes(l.title)) {
        brk({ kind: 'hidden-manna', where: 'index.html HIDDEN_MANNA_TITLES', target: l.title, why: 'a Hidden Manna letter its Matthew notes would not badge' });
      }
    }
    checked['hidden-manna']++;
    if (hmCol && (hmCol.indexed !== false || hmCol.cardId || hmCol.indexScreen || hmCol.surpriseType || READING_CHAIN.includes(hmCol.volKey))) {
      brk({ kind: 'hidden-manna', where: 'scripture-resolution.js COLLECTIONS', target: 'Hidden Manna', why: 'indexed, or given a home card, an index, a surprise entry or a place in the reading chain' });
    }
    const hmKeys = new Set([...reg].filter(([, v]) => v.volKey === 'hm').map(([k]) => k));
    const leak = (where, key) => brk({ kind: 'hidden-manna', where, target: key, why: 'a public link to Hidden Manna, which only the Matthew study chain may reach' });
    for (const o of owners.concat(M && M.preface ? [{ file: 'matthew.js', id: 'preface', owner: M.preface, col: null, fmt: 'study' }] : [])) {
      if (o.col && o.col.volKey === 'hm') continue;
      (function walkHm(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walkHm); return; }
        if (typeof n.collection === 'string' && typeof n.letterTitle === 'string') {
          checked['hidden-manna']++;
          if (hmKeys.has(n.collection + '::' + n.letterTitle) || n.collection === (hmCol && hmCol.registryLabel)) leak(`${o.file} ${o.id}`, `${n.collection}::${n.letterTitle}`);
        }
        if (n.t === 'letter-link' && hmCol && n.screen === hmCol.letterScreen) { checked['hidden-manna']++; leak(`${o.file} ${o.id}`, `${n.screen}/${n.letterId}`); }
        for (const k of Object.keys(n)) if (k !== 'nkjv' && k !== 'scriptures') walkHm(n[k]);
      })(o.owner);
      for (const para of (o.owner && o.owner.paragraphs) || []) {
        for (const seg of splitFormatBInline(String((para && para.text) || ''))) {
          const m = seg && ATTR_SEG_RE.exec(seg);
          if (m && attrCollectionLabel(m[2]) === (hmCol && hmCol.registryLabel)) { checked['hidden-manna']++; leak(`${o.file} ${o.id}`, `${m[2]}::${m[1]}`); }
        }
      }
    }

    // ── nav-chain: the titles the bottom cards print ──
    for (const col of COLLECTIONS) {
      const items = itemsOf(g, col);
      const byId = new Map(items.map((l) => [l.id, l]));
      for (const l of items) {
        for (const k of ['prevLetter', 'nextLetter', 'prevEntry', 'nextEntry']) {
          const nb = l[k];
          if (!nb || typeof nb !== 'object' || typeof nb.id !== 'string') continue;
          checked['nav-chain']++;
          const real = byId.get(nb.id);
          const where = `${COLLECTION_FILES[col.globalName]} ${l.id} ${k}`;
          if (!real) brk({ kind: 'nav-chain', where, target: nb.id, why: 'no item with this id in the collection' });
          else if (real.title !== nb.title) brk({ kind: 'nav-chain', where, target: `${nb.id} "${nb.title}"`, why: `the card prints "${nb.title}"; the item is "${real.title}"`, should: real.title });
        }
      }
    }
  }
}

// ── CLI: the worklist ────────────────────────────────────────────────────

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const t0 = Date.now();
  const { checked, breaks } = checkCorpusLinks(loadCorpus());
  for (const k of KINDS) {
    const n = breaks.filter((b) => b.kind === k).length;
    console.log(`${k.padEnd(17)} ${String(checked[k]).padStart(6)} checked  ${String(n).padStart(4)} broken`);
  }
  console.log(`(${Date.now() - t0} ms)\n`);
  for (const b of breaks) console.log(`[${b.kind}] ${b.where} → ${b.target} — ${b.why}${b.should ? ` (should be: ${b.should})` : ''}`);
}
