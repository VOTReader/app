/* ═══════════════════════════════════════════════════════════════════════
   answers-search — the Answers landing page's "What does The Lord say
   about…" box. Pure functions over the ANSWERS corpus; no DOM, no React.
   ═══════════════════════════════════════════════════════════════════════
   A topic page is a run of PASSAGES, each ending in its "~ [From …]"
   attribution. A query finds, per topic (answersSearch, one group each):
     - whether its TITLE holds every word    → title matches lead
     - the passages whose TEXT holds every word → counted, then the site's order
   (U2, the AOGCG Browse stage: no topic is ranked by its passage count).
   A word matches at a word start ("pray" finds prayer, praying), case- and
   curly-quote-insensitive. Dated header lines ("From The Lord, Our God and
   Savior…") and the attribution line itself are not searched: "spoken of"
   counts only what the passage says.

   Folding is LENGTH-PRESERVING (lower-case + one-for-one quote swaps), so an
   index found in the folded text is the same index in the display text —
   answersSnippet relies on it to cut and mark the plain text directly.

   READING A QUESTION (2026-09-25, improvement sweep n5-02 / n5-07). The box
   says "What does The Lord say about…", and "what does the lord say about
   prayer" found nothing: every word had to match. The query runs as typed
   first, so an exact title ("day of the lord") keeps its precision; when that
   finds no topic, it runs again without QUESTION_WORDS. A topic's title also
   matches through the site's own alternate names (ANSWERS_URL_INDEX: "regarding
   miracles" -> Healing, "regarding the anti christ" -> The Antichrist) and a
   short hand list of everyday words (TOPIC_SYNONYMS: christmas -> Holidays of
   Men, tithe -> Tithing), and a long number finds its comma form ("144000" ->
   "144,000").
   ═══════════════════════════════════════════════════════════════════════ */

import { isAttribution, isDateHead, isTrumpetSection, answersShortTitle, ANSWERS_SUBJECTS } from './answers-shelves.js';
import { ANSWERS_URL_INDEX } from './answers-url-index.js';

/** What a question wraps around its subject; dropped only in the second pass. */
export const QUESTION_WORDS = new Set([
  'what', 'whats', "what's", 'does', 'do', 'did', 'the', 'lord', "lord's", 'god', "god's", 'say', 'says', 'said',
  'saying', 'about', 'regarding', 'concerning', 'is', 'are', 'was', 'were', 'be', 'a', 'an', 'of', 'to', 'in', 'on',
  'for', 'and', 'or', 'should', 'can', 'could', 'would', 'will', 'shall', 'we', 'i', 'me', 'my', 'you', 'your', 'us',
  'our', 'how', 'why', 'when', 'who', 'where', 'which', 'there', 'it', 'its', 'this', 'that', 'these', 'those',
  'tell', 'teach', 'teaches', 'his', 'him', 'he',
]);

/** Everyday words readers type for a topic the site titles otherwise; matched like its title. */
export const TOPIC_SYNONYMS = {
  'regarding-the-holidays-of-men': 'christmas easter halloween thanksgiving',
  'regarding-tithing': 'tithe tithes',
  'regarding-homosexuality': 'gay lesbian',
  'regarding-the-wearing-of-jewelry': 'jewellery',
  'regarding-marriage': 'divorce',
  'regarding-the-ten-commandments': '10 commandments',
};

/** topic id -> the site's alternate names for it (the URL index's keys), built once. */
let _aliasesById = null;
function aliasesFor(id) {
  if (!_aliasesById) {
    _aliasesById = new Map();
    for (const [key, tid] of Object.entries(ANSWERS_URL_INDEX || {})) {
      if (!_aliasesById.has(tid)) _aliasesById.set(tid, []);
      _aliasesById.get(tid).push(key);
    }
  }
  return (_aliasesById.get(id) || []).concat(TOPIC_SYNONYMS[id] ? [TOPIC_SYNONYMS[id]] : []);
}

/* The app's nine subjects (answers-shelves.js ANSWERS_SUBJECTS) as search words
   (aogcg brief 3.1): the subjects retire as a browse view, and a reader who
   remembers one ("The End of This Age") still finds its topics. A subject
   answers only a query holding EVERY word of its name, joining words aside,
   so one word of it ("salvation", "lord") still finds only the topics titled
   with it. topic id -> the word lists of the subjects that file it. */
const SUBJECT_JOINERS = new Set(['the', 'and', 'a', 'an', 'of', 'his']);
let _subjectsById = null;
function subjectWordsFor(id) {
  if (!_subjectsById) {
    _subjectsById = new Map();
    for (const s of ANSWERS_SUBJECTS) {
      const ws = queryWords(s.title).filter((w) => !SUBJECT_JOINERS.has(w));
      for (const tid of s.topics) {
        if (!_subjectsById.has(tid)) _subjectsById.set(tid, []);
        _subjectsById.get(tid).push(ws);
      }
    }
  }
  return _subjectsById.get(id) || [];
}

const DIVIDER_RE = /^\s*(?:✦|~|†)\s*$/;
/** A topic's closing links: a bold heading alone ("**Also See**", "**Audio**"), a link line ("• …", "📖 …"), a bare URL. */
const NAV_PARA_RE = /^\s*(?:\*\*[^*]+\*\*|(?:•|\u{1F4D6}).*|https?:\/\/\S+)\s*$/u;

/** Display text for a Format B paragraph: {{markers}} out, **bold** / _italic_ marks out. */
export function answersPlainText(text) {
  return String(text || '')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/_/g, '')
    .replace(/‗/g, '_')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Lower-case + curly quotes to straight ones — one char in, one char out. */
export function answersFold(s) {
  return String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function queryWords(query) {
  const words = answersFold(query).split(/[^a-z0-9']+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  // "144000" -> "144 000", the groups the site's "144,000" splits into (years, under 5 digits, stay whole).
  return words.flatMap((w) => (/^\d{5,}$/.test(w) ? w.replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ') : [w]));
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function wordRe(word, flags) { return new RegExp('(^|[^a-z0-9])' + escapeRe(word), flags || ''); }

/**
 * One-time index: per topic, its folded title and its passages' searchable text. A passage
 * remembers the source line that closes it (`src`, -1 for the words after the last one or a
 * page of prose) and the date its header carries.
 * @param {any[]} entries ANSWERS
 */
export function buildAnswersIndex(entries) {
  const out = [];
  for (const entry of entries || []) {
    if (!entry || !Array.isArray(entry.paragraphs)) continue;
    const passages = [];
    let cur = { paras: [], src: -1, date: '' };
    entry.paragraphs.forEach((p, i) => {
      const raw = p && p.text;
      if (isAttribution(raw)) {
        if (cur.paras.length) passages.push({ ...cur, src: i });
        cur = { paras: [], src: -1, date: '' };
        return;
      }
      if (isDateHead(raw)) { if (!cur.date) cur.date = raw.slice(1, raw.indexOf('_', 1)); return; }
      if (typeof raw !== 'string' || DIVIDER_RE.test(raw)) return;
      const plain = answersPlainText(raw);
      if (plain) cur.paras.push({ index: i, plain, fold: answersFold(plain) });
    });
    // A page of prose with no attributions still searches as one passage. After the last
    // attribution, a passage its own "From: Poured Out" line closes is a passage too (sweep W31:
    // "Why withhold, My son?" closes three topics, unsearchable); the notes and the link section
    // many topics close with are not ("N of M passages" counts what The Lord says).
    const prose = passages.length === 0;
    if (cur.paras.length && prose) passages.push(cur);
    else {
      let k = cur.paras.length - 1;
      while (k >= 0 && !isSourceLine(cur.paras[k].plain)) k--;
      const tail = cur.paras.slice(0, Math.max(k, 0)).filter((p) => !NAV_PARA_RE.test(entry.paragraphs[p.index].text));
      if (k > 0 && tail.length) passages.push({ paras: tail, src: cur.paras[k].index, date: cur.date });
    }
    out.push({ entry, short: answersShortTitle(entry.title), titleFold: answersFold(entry.title),
      aliasFolds: aliasesFor(entry.id).map((a) => answersFold(a)), subjectWords: subjectWordsFor(entry.id), passages, prose });
  }
  return out;
}

/* The index costs tens of ms on a phone and the corpus is a fixed array once loaded, so it is built
   once per array for every screen that reads it (the landing's search, Saved answers, a card's source). */
let _index = { of: /** @type {any} */ (null), v: /** @type {ReturnType<typeof buildAnswersIndex>} */ ([]) };
/** @param {any[]} list ANSWERS */
export function answersIndexOf(list) {
  if (!list || !list.length) return [];
  if (_index.of !== list) _index = { of: list, v: buildAnswersIndex(list) };
  return _index.v;
}

/**
 * @typedef {object} AnswersSearchGroup
 * @property {any} entry
 * @property {number} n         passages (a page of prose: its level-1 sections) holding every word
 * @property {number} total     the passages (or sections) the topic has
 * @property {boolean} titleHit its title, an alternate name of the site's, or a retired subject's whole name holds every word
 * @property {boolean} prose    a page with no source lines (the False Doctrines index): n counts its sections
 * @property {{ index: number, src: number, date: string, sec: string } | null} first  the first matching paragraph
 * @property {number} pos       its place in the site's order
 */

/**
 * The search box: one group per topic that answers, TITLE MATCHES FIRST, THEN THE SITE'S
 * ORDER (U2: no topic is ranked by how much it says). A group counts the passages that hold
 * every word; the header's total is the sum of the groups (`matches`).
 * A question that finds no title as typed runs again without its QUESTION_WORDS.
 * @param {ReturnType<typeof buildAnswersIndex>} index
 * @param {string} query
 * @param {{ pos?: (id: string) => number, sections?: (id: string) => any[] | null }} [opts]
 *   pos: a topic's place in the site's order; sections: a page's sidecar sections, for prose
 * @returns {null | { words: string[], groups: AnswersSearchGroup[], matches: number }}
 */
export function answersSearch(index, query, opts) {
  const words = queryWords(query);
  if (!words.length) return null;
  const full = searchPass(index, words, opts || {});
  if (full.groups.some((g) => g.titleHit)) return full;
  const core = words.filter((w) => !QUESTION_WORDS.has(w));
  if (!core.length || core.length === words.length) return full;
  const lean = searchPass(index, core, opts || {});
  return (lean.groups.some((g) => g.titleHit) || (!full.groups.length && lean.groups.length)) ? lean : full;
}

/**
 * Only the title matches, at once (the full text waits for the deferred pass: f06d).
 * @param {ReturnType<typeof buildAnswersIndex>} index
 * @param {string} query
 * @param {{ pos?: (id: string) => number }} [opts]
 * @returns {AnswersSearchGroup[]}
 */
export function answersTitleMatches(index, query, opts) {
  const words = queryWords(query);
  if (!words.length) return [];
  const pass = (ws) => (index || []).filter((t) => titleHolds(t, ws)).map((t) => group(t, 0, 0, true, null, opts || {}));
  const full = pass(words);
  const core = words.filter((w) => !QUESTION_WORDS.has(w));
  const out = full.length || !core.length || core.length === words.length ? full : pass(core);
  return out.sort((a, b) => a.pos - b.pos);
}

function titleHolds(t, words) {
  const res = words.map((w) => wordRe(w));
  const all = (s) => res.every((re) => re.test(s));
  const subject = (t.subjectWords || []).some((ws) => ws.length > 0 && ws.every((w) => words.includes(w)));
  return all(t.titleFold) || (t.aliasFolds || []).some(all) || subject;
}

function group(t, n, total, titleHit, first, opts) {
  const pos = typeof opts.pos === 'function' ? opts.pos(t.entry.id) : 0;
  return { entry: t.entry, n, total, titleHit, prose: !!t.prose, first, pos: Number.isFinite(pos) ? pos : 1e6 };
}

/**
 * One pass over the index with these folded words.
 * @param {ReturnType<typeof buildAnswersIndex>} index
 * @param {string[]} words
 * @param {{ pos?: (id: string) => number, sections?: (id: string) => any[] | null }} opts
 */
function searchPass(index, words, opts) {
  const res = words.map((w) => wordRe(w));
  const all = (s) => res.every((re) => re.test(s));
  /** @type {AnswersSearchGroup[]} */
  const groups = [];
  for (const t of index || []) {
    let n = 0, total = 0;
    /** @type {AnswersSearchGroup['first']} */
    let first = null;
    if (t.prose) {
      // A page of prose counts its level-1 sections (the index's categories) that hold every word.
      const tops = ((typeof opts.sections === 'function' && opts.sections(t.entry.id)) || []).filter((s) => s.level === 1);
      const secs = tops.filter((s) => !isTrumpetSection(s));
      const paras = t.passages.length ? t.passages[0].paras : [];
      if (secs.length) {
        total = secs.length;
        secs.forEach((s) => {
          const next = tops[tops.indexOf(s) + 1];
          const end = next ? next.at : Infinity;
          const inSec = paras.filter((p) => p.index >= s.at && p.index < end);
          if (!inSec.length || !all(inSec.map((p) => p.fold).join(' '))) return;
          n++;
          if (!first) {
            const at = inSec.find((p) => res[0].test(p.fold)) || inSec[0];
            first = { index: at.index, src: -1, date: '', sec: s.title };
          }
        });
      } else if (paras.length && all(paras.map((p) => p.fold).join(' '))) {
        n = 1; total = 1;
        const at = paras.find((p) => res[0].test(p.fold)) || paras[0];
        first = { index: at.index, src: -1, date: '', sec: '' };
      }
    } else {
      // "N of M passages": M counts the passages a source line closes.
      total = t.passages.length;
      for (const psg of t.passages) {
        if (!all(psg.paras.map((p) => p.fold).join(' '))) continue;
        n++;
        if (!first) {
          // Land on the paragraph that holds the first word (a phrase can span two).
          const at = psg.paras.find((p) => res[0].test(p.fold)) || psg.paras[0];
          first = { index: at.index, src: psg.src, date: psg.date || '', sec: '' };
        }
      }
    }
    const titleHit = titleHolds(t, words);
    if (n || titleHit) groups.push(group(t, n, total, titleHit, first, opts));
  }
  groups.sort((a, b) => (Number(b.titleHit) - Number(a.titleHit)) || (a.pos - b.pos));
  return { words, groups, matches: groups.reduce((s, g) => s + g.n, 0) };
}

/**
 * A hit's words as segments to render with the matches marked: the paragraph from at most
 * `before` characters ahead of the first matching word (cut at a word start, "…" in front);
 * the end is left to the 3-line clamp.
 * @param {string} plain
 * @param {string[]} words folded query words
 * @param {number} [before]
 * @returns {{ text: string, hit: boolean }[]}
 */
export function answersSnippet(plain, words, before = 40) {
  const text = String(plain || '');
  const fold = answersFold(text);
  let first = -1;
  for (const w of words || []) {
    const m = wordRe(w).exec(fold);
    if (m) {
      const at = m.index + m[1].length;
      if (first < 0 || at < first) first = at;
    }
  }
  let start = 0;
  if (first > before) {
    start = first - before;
    const sp = text.indexOf(' ', start);
    if (sp !== -1 && sp < first) start = sp + 1;
  }
  const cut = text.slice(start);
  const cutFold = fold.slice(start);
  const segs = [];
  if (start > 0) segs.push({ text: '…', hit: false });
  const marks = [];
  for (const w of words || []) {
    const re = wordRe(w, 'g');
    let m;
    while ((m = re.exec(cutFold))) {
      const s = m.index + m[1].length;
      // Mark the term itself where a word begins with it ("<mark>Sabbath</mark>s", f06).
      marks.push([s, s + w.length]);
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    if (s > pos) segs.push({ text: cut.slice(pos, s), hit: false });
    segs.push({ text: cut.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < cut.length) segs.push({ text: cut.slice(pos), hit: false });
  return segs;
}

/** A passage's closing line in the site's other form: "From: Poured Out", "Excerpt from: …". */
function isSourceLine(plain) {
  const s = String(plain || '');
  return s.startsWith('From:') || s.startsWith('Excerpt from:');
}

/**
 * A prose paragraph's lines joined with " · " for a snippet: the False Doctrines entries put one
 * title per line, and joined by spaces they would run together ("…Another MessiahGod Speaks…").
 * @param {string} text
 */
export function answersPlainLines(text) {
  return String(text || '').split('\n').map((l) => answersPlainText(l)).filter(Boolean).join(' · ');
}
