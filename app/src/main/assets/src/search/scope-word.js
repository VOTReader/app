/* ═══════════════════════════════════════════════════════════════════════
   search/scope-word.js — a book or collection named beside the words (search200 sweep)
   ═══════════════════════════════════════════════════════════════════════
   A reader types where a thing is with what it says: "malachi tithes", "faith in hebrews", "answers only god can
   give hell", "does suicide get saved volume 2". The book's or the collection's name was searched as a word the text
   must hold, so only texts saying "Malachi" or "Answers Only God Can Give" scored on it, never the verses in that book
   or the topics in that collection: Nehemiah 10:38 led "malachi tithes", the Answers front page led its topics. The
   edge reading (ref-edge.js) reads a reference with a chapter only.

   scopeWord reads a book's name (as the Bible titles it) or a collection's full name at the query's start or end, and
   the rest of the words. The engine (engine.js search) searches the rest kept to that book or collection beside the
   query as typed, and the kept search's best leads only when it holds as many of the rest's words as the plain
   lead and the plain lead is not already in the book: a soft scope, the plain reading its fallback. A book name that is
   an English word in this corpus's prose (the mark of the beast, a revelation, acts, numbers) needs more than a tie.
   ═══════════════════════════════════════════════════════════════════════ */

import { searchData } from './search-data.js';

/** The ordinals typed before a numbered book. */
const ORDINALS = /** @type {Record<string, string>} */ ({ first: '1', '1st': '1', second: '2', '2nd': '2', ii: '2', third: '3', '3rd': '3', iii: '3' });
/** Book names typed in another form than the Bible's title. */
const BOOK_FORMS = /** @type {Record<string, string>} */ ({ psalm: 'psalms', revelations: 'revelation', 'song of songs': 'songofsolomon', 'acts of the apostles': 'acts' });
/* Book names that are English words in the texts' prose ("the mark of the beast", "a revelation of", "acts of
   faith", "the numbers", "judges", "job"): beside other words the book leads only on more of them held. */
const WORDISH_BOOKS = new Set(['mark', 'acts', 'numbers', 'judges', 'job', 'revelation', 'lamentations']);
/** A collection's full name, as typed (words lower case, apostrophes off), and the volumes it names. */
const COLLECTIONS = (() => {
  /** @type {Array<[string, string[]]>} */ const list = [];
  const NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  for (let n = 1; n <= 7; n++) for (const head of ['volume', 'vol']) { list.push([head + ' ' + n, ['v' + n]]); list.push([head + ' ' + NUM[n - 1], ['v' + n]]); }
  for (const [n, id] of [['1', 'wtlb1'], ['one', 'wtlb1'], ['2', 'wtlb2'], ['two', 'wtlb2']]) {
    list.push(['words to live by part ' + n, [id]]); list.push(['words to live by ' + n, [id]]);
  }
  list.push(['words to live by', ['wtlb1', 'wtlb2']]);
  list.push(['answers only god can give', ['answers']]);
  list.push(['letters from timothy', ['timothy']]);
  for (const p of ['letters to the lords little flock', 'lords little flock']) list.push([p, ['flock']]);
  list.push(['a testament against the world', ['rebuke']]);
  return list.map(([p, ids]) => ({ w: p.split(' '), ids })).sort((a, b) => b.w.length - a.w.length);
})();
/** The small words joining a name to the rest ("faith in hebrews", "answers only god can give about christmas"). */
const JOINS = new Set(['in', 'from', 'of', 'about', 'on', 'regarding', 'concerning', 'according', 'to', 'the', 'book', 'says', 'say']);

/** A typed token as a word: lower case, apostrophes and edge punctuation off. @param {string} t */
const wordOf = (t) => t.toLowerCase().replace(/['‘’]/g, '').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

/** @type {WeakMap<object, Map<string, string>>} each book table's names, by their words */
const NAMES = new WeakMap();
/** The book names a reader types, each its book id: the Bible's titles, their ordinals spelled out, BOOK_FORMS. */
function bookNames() {
  const D = searchData();
  const display = D.BOOK_DISPLAY || {};
  let names = NAMES.get(display);
  if (!names) {
    names = new Map();
    for (const [id, title] of Object.entries(display)) {
      const w = String(title).toLowerCase().split(/\s+/).map(wordOf).join(' ');
      names.set(w, id);
      const m = /^([123]) (.+)$/.exec(w);
      if (m) for (const [o, n] of Object.entries(ORDINALS)) if (n === m[1]) names.set(o + ' ' + m[2], id);
    }
    for (const [form, id] of Object.entries(BOOK_FORMS)) if (Object.prototype.hasOwnProperty.call(display, id)) names.set(form, id);
    NAMES.set(display, names);
  }
  return names;
}

/**
 * A book's name or a collection's full name at the query's start or end, beside other words; null when none.
 * `rest` is the query's other words as typed (the joining small words off), `book` the book id or `volumes` the
 * collection's volume ids, `name` the name's words, `wordish` a book named by an English word.
 * @param {string} query
 * @returns {{ book?: string, volumes?: string[], rest: string, name: string, wordish: boolean }|null}
 */
export function scopeWord(query) {
  const raw = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (raw.length < 2 || /["“”+]|(?:^|\s)-\S/.test(query)) return null;
  const words = raw.map(wordOf);
  const names = bookNames();
  /** @param {number} a @param {number} b the name's tokens [a, b) @returns {any} */
  const nameAt = (a, b) => {
    const w = words.slice(a, b).join(' ');
    for (const c of COLLECTIONS) if (c.w.join(' ') === w) return { volumes: c.ids, name: w, wordish: false };
    const id = names.get(w);
    return id ? { book: id, name: w, wordish: WORDISH_BOOKS.has(w) } : null;
  };
  const rest = (/** @type {string[]} */ toks) => {
    let a = 0; let b = toks.length;
    while (a < b && JOINS.has(wordOf(toks[a]))) a++;
    while (b > a && JOINS.has(wordOf(toks[b - 1]))) b--;
    return toks.slice(a, b).join(' ');
  };
  const longest = Math.min(raw.length - 1, 6);
  for (let k = longest; k >= 1; k--) {
    const at = nameAt(0, k);
    // a number after a book is a reference's (the edge reading's call), not words beside it
    if (at && !(at.book && /^\d/.test(words[k] || ''))) { const r = rest(raw.slice(k)); if (r) return { ...at, rest: r }; }
  }
  for (let k = longest; k >= 1; k--) {
    const at = nameAt(raw.length - k, raw.length);
    if (at && !(at.book && /^\d/.test(words[raw.length - k - 1] || ''))) { const r = rest(raw.slice(0, raw.length - k)); if (r) return { ...at, rest: r }; }
  }
  return null;
}
