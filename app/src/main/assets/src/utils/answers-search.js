/* ═══════════════════════════════════════════════════════════════════════
   answers-search — the Answers landing page's "What does The Lord say
   about…" box. Pure functions over the ANSWERS corpus; no DOM, no React.
   ═══════════════════════════════════════════════════════════════════════
   A topic page is a run of PASSAGES, each ending in its "~ [From …]"
   attribution. A query finds:
     - topics whose TITLE holds every word   → "The topic" cards
     - passages whose TEXT holds every word  → counted per topic
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

import { isAttribution, answersShortTitle } from './answers-shelves.js';
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

const HEADER_RE = /^_\d{1,2}\/\d{1,2}\/\d{2,4}_/;
const DIVIDER_RE = /^\s*(?:✦|~|†)\s*$/;

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
 * One-time index: per topic, its folded title and its passages' searchable text.
 * @param {any[]} entries ANSWERS
 */
export function buildAnswersIndex(entries) {
  const out = [];
  for (const entry of entries || []) {
    if (!entry || !Array.isArray(entry.paragraphs)) continue;
    const passages = [];
    let cur = { paras: [] };
    entry.paragraphs.forEach((p, i) => {
      const raw = p && p.text;
      if (isAttribution(raw)) {
        if (cur.paras.length) passages.push(cur);
        cur = { paras: [] };
        return;
      }
      if (typeof raw !== 'string' || HEADER_RE.test(raw) || DIVIDER_RE.test(raw)) return;
      const plain = answersPlainText(raw);
      if (plain) cur.paras.push({ index: i, plain, fold: answersFold(plain) });
    });
    // A page of prose with no attributions still searches as one passage.
    if (cur.paras.length && passages.length === 0) passages.push(cur);
    out.push({ entry, short: answersShortTitle(entry.title), titleFold: answersFold(entry.title),
      aliasFolds: aliasesFor(entry.id).map((a) => answersFold(a)), passages });
  }
  return out;
}

/**
 * @param {ReturnType<typeof buildAnswersIndex>} index
 * @param {string} query
 * @returns {null | { words: string[], topics: any[], mentions: any[], mentionPassages: number }}
 *   topics   — title matches: { entry, short, hits, firstPara, firstText }
 *   mentions — every other topic with a matching passage, most hits first
 */
export function searchAnswers(index, query) {
  const words = queryWords(query);
  if (!words.length) return null;
  const full = runSearch(index, words);
  if (full.topics.length) return full;
  // A question: try again with only its subject words, and keep that when it finds a topic
  // (or when the question as typed found nothing at all).
  const core = words.filter((w) => !QUESTION_WORDS.has(w));
  if (!core.length || core.length === words.length) return full;
  const lean = runSearch(index, core);
  return (lean.topics.length || (!full.mentions.length && lean.mentions.length)) ? lean : full;
}

/**
 * One pass: topics whose title (or an alternate name) holds every word, then every other
 * topic whose passages do.
 * @param {ReturnType<typeof buildAnswersIndex>} index
 * @param {string[]} words folded query words
 */
function runSearch(index, words) {
  const res = words.map((w) => wordRe(w));
  const all = (s) => res.every((re) => re.test(s));
  const topics = [];
  const mentions = [];
  let mentionPassages = 0;
  for (const t of index || []) {
    let hits = 0;
    let firstPara = -1;
    let firstText = '';
    for (const psg of t.passages) {
      if (!all(psg.paras.map((p) => p.fold).join(' '))) continue;
      hits++;
      if (firstPara < 0) {
        // Land on the paragraph that holds the first word (a phrase can span two).
        const at = psg.paras.find((p) => res[0].test(p.fold)) || psg.paras[0];
        firstPara = at.index;
        firstText = at.plain;
      }
    }
    // A title match whose passages never use the word still shows how it opens.
    const lead = t.passages.length ? t.passages[0].paras[0] : null;
    const row = { entry: t.entry, short: t.short, hits, firstPara, firstText, leadPara: lead ? lead.index : -1, leadText: lead ? lead.plain : '' };
    if (all(t.titleFold) || (t.aliasFolds || []).some(all)) topics.push(row);
    else if (hits) { mentions.push(row); mentionPassages += hits; }
  }
  const q = words.join(' ');
  topics.sort((a, b) => (answersFold(b.short).startsWith(q) ? 1 : 0) - (answersFold(a.short).startsWith(q) ? 1 : 0) || b.hits - a.hits);
  mentions.sort((a, b) => b.hits - a.hits || a.short.localeCompare(b.short));
  return { words, topics, mentions, mentionPassages };
}

/**
 * A window of `plain` around the first matching word, as segments to render
 * with the matches marked. Cut at word boundaries, "…" where it was cut.
 * @param {string} plain
 * @param {string[]} words folded query words
 * @param {number} [radius]
 * @returns {{ text: string, hit: boolean }[]}
 */
export function answersSnippet(plain, words, radius = 90) {
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
  let end = text.length;
  if (first >= 0 && text.length > radius * 2.4) {
    start = Math.max(0, first - radius);
    end = Math.min(text.length, first + Math.round(radius * 1.4));
    if (start > 0) { const sp = text.indexOf(' ', start); if (sp > 0 && sp < first) start = sp + 1; }
    if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > first) end = sp; }
  } else if (first < 0 && text.length > radius * 2.4) {
    end = text.lastIndexOf(' ', radius * 2) > 0 ? text.lastIndexOf(' ', radius * 2) : radius * 2;
  }
  const cut = text.slice(start, end);
  const cutFold = fold.slice(start, end);
  const segs = [];
  if (start > 0) segs.push({ text: '…', hit: false });
  const marks = [];
  for (const w of words || []) {
    const re = wordRe(w, 'g');
    let m;
    while ((m = re.exec(cutFold))) {
      const s = m.index + m[1].length;
      // Mark the whole word the prefix begins.
      let e = s + w.length;
      while (e < cutFold.length && /[a-z0-9']/.test(cutFold[e])) e++;
      marks.push([s, e]);
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
  if (end < text.length) segs.push({ text: '…', hit: false });
  return segs;
}
