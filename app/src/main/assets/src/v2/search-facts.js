/* search-facts.js - what v2's Search shows (zv1; pictures 3a-search, 3b-search-results, 5c-search-match; zs26: design dz19
   3b redrawn, 3e-3h, main's Search after sr10-sr13).

   One box over main's engine (window.VotSearchMini, bundle-d: the same index, parse and ranking as main's Search), its
   hits drawn the way the pictures draw them: Go to (a reference typed, a collection named, the songs that match), main's
   count, Relevance | Book order, Best matches (main's five), then In the letters, In the Bible, In Answers and In your notes
   (the reader's own marks, matched here in memory); in Book order main's collections in reading order instead. Results
   open in the Search tab, so Back comes back to them: the query, scope, order and place are kept in this module's memory
   (never in storage). A gate boot never calls the engine: it reads the engine's rows from _gate/search-rows.json. */
import { matchExcerpt, morePlaces, snippet, snippetAt, highlightSpans } from '../search/snippet.js';
import { srchGroupKey, srchSortCanonical, SRCH_CANONICAL_BOOK_INDEX } from '../utils/search.js';
import { bookTitle } from './home-facts.js';

const g = /** @type {any} */ (globalThis);

/** The examples under the empty box (3a). */
export const TRY = ['born again', 'set apart', 'Chosen by God', 'John 3', 'Volume Three'];

/** The scope chips (3b), in the picture's order. */
export const SCOPES = [
  { id: 'all', label: 'All' },
  { id: 'letters', label: 'Letters' },
  { id: 'bible', label: 'Bible' },
  { id: 'answers', label: 'Answers' },
  { id: 'notes', label: 'Notes' },
];

/** Each result group: its label, and how many show under All before "More in ..." hands over to its scope. */
export const GROUPS = [
  { id: 'letters', label: 'In the letters', more: 'More in the letters' },
  { id: 'bible', label: 'In the Bible', more: 'More in the Bible' },
  { id: 'answers', label: 'In Answers', more: 'More in Answers' },
  { id: 'notes', label: 'In your notes', more: 'More in your notes' },
];
export const ALL_CAP = 3;
export const GOTO_CAP = 3;
/** A scope shows this many, then "Show more" adds as many again. */
export const PAGE = 30;
/** Book order opens each collection with its first ten (main's SRCH_BOOK_FIRST_PAGE), then "Show N more" by fifty. */
export const BOOK_FIRST = 10;
export const BOOK_PAGE = 50;
/** main's Best Matches: this many, one per text. */
export const TOP_N = 5;
/** Recent searches shown under the empty box (the store keeps 20). */
export const RECENT_SHOWN = 12;

const LETTER_KINDS = new Set(['letter', 'letter-title', 'wtlb', 'wtlb-title', 'blessed', 'blessed-title', 'holy-day', 'holy-day-title']);
const BIBLE_KINDS = new Set(['verse', 'heading', 'chapter-title']);
const ANSWER_KINDS = new Set(['answers', 'answers-title']);
/** The parses that put a card above the words' matches (main's directEntries): no Best matches under one. */
const REF_KINDS = new Set(['ref-bible', 'named-passage', 'ref-letter', 'ref-book']);

/** The group an engine doc belongs to, or null for what v2 has no place for yet (Study Bible notes, Hidden Manna). */
export function groupOf(doc) {
  if (!doc) return null;
  if (BIBLE_KINDS.has(doc.kind)) return 'bible';
  if (LETTER_KINDS.has(doc.kind)) return 'letters';
  if (ANSWER_KINDS.has(doc.kind)) return 'answers';
  return null;
}

/** main's collection for a search volume id ('v1', 'answers'...), from COL_BY_KEY (bundle-a). */
export function colBySearchId(id, gl = g) {
  const map = gl.COL_BY_KEY;
  if (!id || !map || typeof map.values !== 'function') return null;
  for (const c of map.values()) if (c && c.searchVolId === id) return c;
  return null;
}

/** Lower case, accents and curly quotes folded, runs of space made one. */
export function fold(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'")
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** main's stop words (search-data.js), else the few a picture shows ('of', 'the', 'to', 'from'). @returns {Set<string>} */
export function stopWords(gl = g) {
  const D = gl.VotSearchData;
  return D && D.STOP_WORDS_TRIMMED instanceof Set ? D.STOP_WORDS_TRIMMED : new Set(['the', 'a', 'an', 'and', 'of', 'to', 'from', 'in', 'is']);
}

/**
 * The words a hit's excerpt marks: the phrase or run the engine read, then the typed words, stop words dropped when real
 * words were typed too (main's expandSnippetTerms without the synonym fan-out).
 * @param {any} parsed the engine's parse (r.textQuery || r.parsed) @param {string[]} parsedTerms @param {Set<string>} [stop]
 */
export function markTerms(parsed, parsedTerms, stop) {
  if (!parsed || parsed.kind !== 'text') return [];
  const words = (parsedTerms || []).filter(Boolean);
  const real = stop ? words.filter((t) => !stop.has(fold(t))) : words;
  return [parsed.phrase, parsed.run].filter(Boolean).concat(real.length ? real : words);
}

/**
 * The words one hit marks: the query's, then the engine's for this hit (its other forms, a typo it corrected), a stop word
 * among them left unmarked while the query has a real word (3h marks "churches" and "men", not "of").
 * @param {string[]} terms markTerms' @param {string[] | undefined} hitTerms @param {Set<string>} [stop]
 */
export function hitWords(terms, hitTerms, stop) {
  const extra = (hitTerms || []).filter((t) => terms.indexOf(t) < 0 && !(stop && terms.length && stop.has(fold(t))));
  return terms.concat(extra);
}

/**
 * The words around a match as the row shows them (dz19; .ex shows two lines): main's 180-character snippet, opened at the
 * sentence that holds the first marked word when it starts within 70 characters of it, else about 50 characters before
 * it, so the mark is in the two lines; one ellipsis at each cut.
 * @param {string} text the doc's text @param {string[]} words
 */
export function excerptOf(text, words) {
  return exWindow(snippet(text || '', words, 180), words);
}

/**
 * A hit's words as its row shows them: a verse whole, a heading's heading, a title hit none (its title is the row's title),
 * else excerptOf's cut, opened where the engine's meaning search placed it (`placeStart`, main's SrchSnippet start).
 * @param {any} doc @param {string[]} words @param {number} [placeStart]
 */
export function hitExcerpt(doc, words, placeStart) {
  const d = doc || {};
  if (groupOf(d) === 'bible') return d.kind === 'heading' ? d.heading || d.text || '' : d.text || '';
  if (/-title$/.test(d.kind || '')) return '';
  const text = String(d.text || '');
  return typeof placeStart === 'number' ? exWindow(snippetAt(text, placeStart, 180), words) : excerptOf(text, words);
}

/** The engine's meaning-search start for a hit when it is inside the doc's text (main's SrchCard placeStart). */
export function placeStartOf(hit) {
  const n = hit && hit.placeStart;
  const len = hit && hit.doc ? String(hit.doc.text || '').length : 0;
  return typeof n === 'number' && n >= 0 && n < len ? n : undefined;
}

/** One key per doc, for React and for the places a reader opened. */
export function docKey(doc) {
  const d = doc || {};
  return d.id || [d.kind, d.volumeId, d.bookId, d.letterNum || d.num, d.chapterNum, d.verseNum].join('/');
}

/** excerptOf's cut, on a snippet already made. @param {string} ex @param {string[]} words */
export function exWindow(ex, words) {
  let t = String(ex || '').replace(/\s+/g, ' ').trim();
  let first = -1;
  let at = 0;
  for (const s of highlightSpans(t, words)) {
    if (s.hit && s.text.trim()) { first = at; break; }
    at += s.text.length;
  }
  if (first < 0) return t;
  let b = -1;
  for (const e of ['. ', '! ', '? ', '… ']) if (first - e.length >= 0) b = Math.max(b, t.lastIndexOf(e, first - e.length));
  if (b >= 0 && first - b <= 70) t = '…' + t.slice(b + 2).replace(/^[.\s]+/, '');
  else if (first > 60) t = '…' + t.slice(t.lastIndexOf(' ', first - 51) + 1);
  return t.replace(/(\.\.\.|…)[.…]+/g, '…');
}

/** What one unit of a kind is called in "1 more place in this letter" (main's SrchCard PLACE_UNIT). */
const PLACE_UNIT = { letter: 'letter', wtlb: 'entry', blessed: 'entry', 'holy-day': 'entry', answers: 'topic', 'bible-study': 'chapter' };

/**
 * The other places a letter, entry or topic says the words (main's morePlaces), each { start, clip }, and what one unit is
 * called. None for a verse (one place by definition) or a title. `shownAt` is where the row's words were cut from when
 * the engine placed them (main passes it so the row's own place is not offered again).
 * @param {any} doc @param {string[]} words @param {number} [shownAt]
 * @returns {{ unit: string, list: Array<{ start: number, clip: string }> }}
 */
export function placesOf(doc, words, shownAt) {
  const unit = doc ? PLACE_UNIT[doc.kind] : undefined;
  if (!unit || !doc.text) return { unit: '', list: [] };
  return { unit, list: morePlaces(String(doc.text), words, undefined, shownAt) };
}

/** "1 more place in this letter", "7 more places in this topic". */
export function placesLabel(n, unit) {
  return n + ' more ' + (n === 1 ? 'place' : 'places') + ' in this ' + unit;
}

/**
 * Where a hit opens, in this tab: a verse on its chapter (marked there), a letter, WTLB / Blessed / Holy Days entry or
 * Answers topic as its collection's item. null when v2 has no place for it.
 * `terms` are the words the reader typed, `hitTerms` the engine's for this hit (its other forms, a typo it corrected): both
 * are marked where it opens. A letter's route also carries `excerpt`, the words it was found by, cut as main's
 * excerptAnchor cuts them (use-search.js): the typed words first, the engine's forms only breaking ties, its words alone
 * when the typed ones find nothing; or, for one of its other places (`placeStart`), the 48 characters there, as main's
 * dispatcher reads a place (use-search.js:380). The letter lands there (search-landing.js).
 * @param {any} doc @param {string[]} [terms] @param {any} [gl] @param {string[]} [hitTerms] @param {number} [placeStart]
 */
export function hitRoute(doc, terms, gl = g, hitTerms, placeStart) {
  const own = terms || [];
  const extra = (hitTerms || []).filter((t) => own.indexOf(t) < 0);
  const match = own.concat(extra);
  const grp = groupOf(doc);
  if (grp === 'bible') {
    const r = { place: 'bible-chapter', book: doc.bookId, chapter: doc.chapterNum };
    if (doc.kind === 'verse' && doc.verseNum) Object.assign(r, { verse: doc.verseNum, match });
    return r;
  }
  if (grp === 'letters' || grp === 'answers') {
    const col = colBySearchId(doc.volumeId, gl);
    const n = doc.letterNum || doc.num;
    if (!col || !n) return null;
    const r = { place: 'letter', collection: col.volKey, n, match };
    const text = doc.text ? String(doc.text) : '';
    if (text && typeof placeStart === 'number' && placeStart >= 0 && placeStart < text.length) {
      return Object.assign(r, { excerpt: text.slice(placeStart, placeStart + 48) });
    }
    const excerpt = text && ((own.length ? matchExcerpt(text, own, undefined, extra) : '')
      || (extra.length ? matchExcerpt(text, match) : ''));
    return excerpt ? Object.assign(r, { excerpt }) : r;
  }
  return null;
}

/** "Volume Three", "volume 3", "v3": the collection named, else null. */
export function collectionNamed(q, gl = g) {
  const f = fold(q);
  const map = gl.COL_BY_KEY;
  if (!f || !map || typeof map.values !== 'function') return null;
  const num = f.match(/^(?:volume|vol\.?|v) ?([1-7])$/);
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  for (const c of map.values()) {
    if (!c || c.volKey === 'hm' || c.indexed === false) continue;
    if (fold(c.label) === f) return c;
    if (num && c.volKey === words[Number(num[1]) - 1]) return c;
  }
  return null;
}

/** A letter's title when its volume is loaded. */
function letterTitle(col, n, gl = g) {
  const list = col && Array.isArray(gl[col.globalName]) ? gl[col.globalName] : null;
  const l = list ? list.find((x) => x && x.num === n) : null;
  return l ? l.title : '';
}

/** main's songs row words: "1 song matches “chosen”", "3 songs match “born again”". */
export function songsLabel(n, q) {
  return n.toLocaleString('en-US') + (n === 1 ? ' song matches ' : ' songs match ') + '“' + q + '”';
}

/** How many song families the loaded catalog finds for `q` (main's findSongFamilies; 0 before the catalog loads). */
export function songsFound(q, gl = g) {
  const w = String(q || '').trim();
  if (w.length < 2 || typeof gl.findSongFamilies !== 'function') return 0;
  try { return gl.findSongFamilies(w).length; } catch (_e) { return 0; }
}

/**
 * The Go to rows: what the query names (a Bible reference or book, a letter by number, a collection), then the songs that
 * match (main's songs row, opening Songs with the words in its Find). Titles that hold the words are not here: the engine
 * ranks them into Best matches (dz19). Each row is { key, where, title, route }.
 * @param {string} query @param {any} parsed the engine's parse @param {number} [songs] songsFound's count
 */
export function gotoRows(query, parsed, songs = 0, gl = g) {
  const out = [];
  const add = (row) => { if (row.route && !out.some((o) => o.key === row.key)) out.push(row); };
  const p = parsed || {};
  if ((p.kind === 'ref-bible' || p.kind === 'named-passage') && p.bookId && p.chapter) {
    const title = p.bookTitle + ' ' + p.chapter + (p.verseStart ? ':' + p.verseStart : '');
    const route = { place: 'bible-chapter', book: p.bookId, chapter: p.chapter };
    if (p.verseStart) route.verse = p.verseStart;
    add({ key: 'b/' + p.bookId + '/' + p.chapter + '/' + (p.verseStart || ''), where: 'The Bible', title, route });
  } else if (p.kind === 'ref-book' && p.bookId) {
    add({ key: 'book/' + p.bookId, where: 'The Bible', title: p.bookTitle, route: { place: 'bible-book', book: p.bookId } });
  } else if (p.kind === 'ref-letter' && !p.isPreface && p.letterNum) {
    const col = colBySearchId(p.volumeId, gl);
    if (col) {
      const title = letterTitle(col, p.letterNum, gl) || 'Letter ' + p.letterNum;
      add({ key: 'l/' + col.volKey + '/' + p.letterNum, where: col.label + ' · Letter ' + p.letterNum, title,
        route: { place: 'letter', collection: col.volKey, n: p.letterNum } });
    }
  }
  const col = collectionNamed(query, gl);
  if (col) add({ key: 'c/' + col.volKey, where: 'The letters', title: col.label, route: { place: 'collection', collection: col.volKey } });
  const q = String(query || '').trim();
  if (songs > 0) add({ key: 'songs', where: 'Songs of the Letters', title: songsLabel(songs, q), route: { place: 'songs', q } });
  return out;
}

/** True when the query named something the Go to rows open (main's directEntries): no Best matches then. */
export function namesAPlace(parsed) {
  return !!(parsed && REF_KINDS.has(parsed.kind));
}

/** The engine's hits by group, each keeping the engine's own order. @param {Array<{doc:any}>} hits */
export function groupHits(hits) {
  /** @type {Record<string, any[]>} */
  const by = { letters: [], bible: [], answers: [] };
  for (const h of hits || []) {
    const grp = h && groupOf(h.doc);
    if (grp) by[grp].push(h);
  }
  return by;
}

/** main's count: "432", "669+" when the engine cut the results short (matchCountLabel). */
export function matchCount(n, more) {
  return n.toLocaleString('en-US') + (more ? '+' : '');
}

/**
 * main's summary line's numbers for `hits`: how many, in how many sections (main's groups, srchGroupKey), and whether the
 * engine cut any of them short (a collection at its cap, or the total).
 * @param {Array<{doc:any}>} hits @param {{ capped?: string[], truncated?: boolean }} [cut]
 * @returns {{ count: number, sections: number, more: boolean }}
 */
export function summaryOf(hits, cut = {}) {
  const list = hits || [];
  const capped = new Set(cut.capped || []);
  return {
    count: list.length,
    sections: new Set(list.map((h) => srchGroupKey(h && h.doc))).size,
    more: !!cut.truncated || list.some((h) => h && h.doc && capped.has(h.doc.volumeId)),
  };
}

/**
 * main's Best Matches: the engine's best five, one card per text (a reprint and its original are two texts; a Holy Days
 * entry reprinting its letter word for word is one), none when the query named a place or the hits sit in one section.
 * Only rows v2 can open.
 * @param {Array<{doc:any}>} hits @param {number} sections @param {boolean} [named]
 */
export function topResults(hits, sections, named = false) {
  if (!hits || !hits.length || named || sections <= 1) return [];
  const seen = new Set();
  const top = [];
  for (const h of hits) {
    const d = (h && h.doc) || {};
    if (!groupOf(d)) continue;
    const k = (d.title || d.ref || '') + '|' + String(d.text || '').slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    top.push(h);
    if (top.length === TOP_N) break;
  }
  return top;
}

/* main's sections in the site's order (index.html SRCH_GROUP_META `order`): the Bible, then the collections as
   trumpetcallofgodonline.com lists them, then Answers. */
const SITE_ORDER = ['bible', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy',
  'holydays', 'matthew', 'matthew-study', 'bible-studies', 'answers', 'letters'];
/** What a section counts (main's SrchGroup GROUP_UNIT): "1 letter", "2 entries". */
const SECTION_UNIT = {
  bible: ['verse', 'verses'], matthew: ['verse', 'verses'], answers: ['topic', 'topics'], 'bible-studies': ['chapter', 'chapters'],
  wtlb1: ['entry', 'entries'], wtlb2: ['entry', 'entries'], blessed: ['entry', 'entries'], holydays: ['entry', 'entries'],
};
const SECTION_LABEL = { bible: 'The Bible', matthew: 'Matthew Study Bible' };

/**
 * Book order (3e; main's sr12): the hits v2 can open as main's sections in the site's order, each in reading order
 * (main's srchSortCanonical): { key, label, unit, items }. `label` is the collection's own name; `unit` names its count.
 * @param {Array<{doc:any}>} hits
 */
export function bookSections(hits, gl = g) {
  /** @type {Map<string, any[]>} */
  const by = new Map();
  for (const h of hits || []) {
    if (!h || !groupOf(h.doc)) continue;
    const k = srchGroupKey(h.doc);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(h);
  }
  const rank = (k) => { const i = SITE_ORDER.indexOf(k); return i < 0 ? 99 : i; };
  return [...by.keys()].sort((a, b) => rank(a) - rank(b)).map((k) => {
    const items = srchSortCanonical(by.get(k), SRCH_CANONICAL_BOOK_INDEX);
    const d = /** @type {any} */ (items[0]).doc;
    const col = groupOf(d) === 'bible' ? null : colBySearchId(d.volumeId, gl);
    const label = SECTION_LABEL[k] || (col && col.label) || d.heading || k;
    return { key: k, label, unit: SECTION_UNIT[k] || ['letter', 'letters'], items };
  });
}

/** main's SrchGroup page button: "Show 7 more", "Show 50 more of 1,204". @param {number} left */
export function moreLabel(left) {
  return left <= BOOK_PAGE ? 'Show ' + left + ' more' : 'Show ' + BOOK_PAGE + ' more of ' + left.toLocaleString('en-US');
}

/** "Volume Seven · 1 letter" (main's SrchGroup header, the kit's .sr-col). */
export function sectionCount(sec) {
  const n = sec.items.length;
  return n.toLocaleString('en-US') + ' ' + sec.unit[n === 1 ? 0 : 1];
}

/**
 * A passage search in Book order (main's sr13): the engine marks each hit close (the typed words together) or not; the
 * close ones come first, each section in reading order, the rest behind one button. null when nothing is marked or every
 * hit is on one side (a keyword, a quote): all are listed as before.
 * @param {Array<{doc:any, close?: boolean}>} hits
 */
export function closeSplit(hits, gl = g) {
  const list = hits || [];
  if (!list.some((h) => h.close === true) || !list.some((h) => h.close === false)) return null;
  const close = list.filter((h) => h.close === true);
  const loose = list.filter((h) => h.close !== true);
  return { close: bookSections(close, gl), loose: bookSections(loose, gl), looseCount: loose.length };
}

/** The switch shows when some section has two or more to order, or there is a Best matches row (main's sortToggleVisible). */
export function sortShown(top, hits) {
  if (top.length) return true;
  const seen = new Set();
  for (const h of hits || []) {
    const k = srchGroupKey(h && h.doc);
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/**
 * The place Search was opened from, as main's goSearch reads it (searchContext): a Bible book (its chapter or its index)
 * or a collection searched by the index (a letter or the collection's page). null elsewhere: no scope chip.
 * @param {any} from the route on top when the Search tab opened (App.jsx openTab)
 * @returns {{ kind: 'book' | 'volume', key: string, bookId?: string, volumeId?: string, label: string } | null}
 */
export function searchContext(from, gl = g) {
  if (!from) return null;
  if ((from.place === 'bible-chapter' || from.place === 'bible-book') && from.book) {
    return { kind: 'book', key: 'b:' + from.book, bookId: from.book, label: bookTitle({ book: from.book }, gl) };
  }
  if ((from.place === 'letter' || from.place === 'collection') && from.collection) {
    const map = gl.COL_BY_KEY;
    const col = map && typeof map.get === 'function' ? map.get(from.collection) : null;
    if (col && col.indexed !== false && col.searchVolId) return { kind: 'volume', key: 'v:' + col.searchVolId, volumeId: col.searchVolId, label: col.label };
  }
  return null;
}

/** The engine's scope for a context (engine.js options.scope). */
export function engineScope(ctx) {
  if (!ctx) return null;
  return ctx.kind === 'book' ? { bookId: ctx.bookId } : { volumeId: ctx.volumeId };
}

/** The reader's marks that hold every word of the query (Notes' rows: journal, highlights, notes, bookmarks, links). */
export function notesMatching(query, marks) {
  const words = fold(query).split(' ').filter((w) => w.length > 1);
  if (!words.length) return [];
  return (marks || []).filter((m) => {
    const hay = fold([m.title, m.text, m.quote, m.note, m.where].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** The engine's settings from the reader's saved settings (read only; main's defaults when unknown). */
export function searchSettings(gl = g) {
  let s = null;
  try {
    const store = gl.StateStore;
    s = store && typeof store.isReady === 'function' && store.isReady() ? (store.get() || {}).settings : null;
  } catch (_e) { /* the defaults */ }
  s = s || {};
  return {
    translation: typeof s.translation === 'string' ? s.translation : 'nkjv',
    useStopWords: s.searchUseStopWords !== false,
    synonyms: s.searchSynonyms !== false,
    history: s.historyEnabled !== false,
  };
}

/**
 * main's "did you mean" for a mistyped book name (SearchScreen didYouMean): one word of 4 to 15 letters with no digits or
 * punctuation that found nothing; the book main's fuzzyBookSuggest names, unless it is what was typed.
 * @param {string} query @param {any} parsed @param {number} found how many results
 */
export function didYouMean(query, parsed, found, gl = g) {
  if (!parsed || parsed.kind !== 'text' || found) return null;
  const q = String(query || '').trim();
  if (q.length < 4 || q.length > 15 || /\s/.test(q) || /[0-9:.,;-]/.test(q)) return null;
  const E = gl.VotSearchMini;
  const D = gl.VotSearchData;
  const guess = E && typeof E.fuzzyBookSuggest === 'function' ? E.fuzzyBookSuggest(q) : null;
  if (!guess) return null;
  const name = (D && D.BOOK_DISPLAY && D.BOOK_DISPLAY[guess]) || guess;
  return name.toLowerCase() === q.toLowerCase() ? null : name;
}

/** A query's own view of its results: the order, the partial matches shown, the places opened, each list's length. */
export function freshView(q) {
  return { q, book: false, loose: false, opened: /** @type {string[]} */ ([]), shown: /** @type {Record<string, number>} */ ({}) };
}

/**
 * What a Search tab returns to (module memory, gone on reload): the query, the chip, how far down the list was, the last
 * answer for that query so Back shows it at once instead of searching again, that query's view (order, partial matches,
 * open places, list lengths; a new query starts a fresh one, main :395), and the scope chip's key when it is on.
 * @type {{ query: string, scope: string, top: number, memo: string, found: any, view: ReturnType<typeof freshView>, scoped: string | null }}
 */
export const kept = { query: '', scope: 'all', top: 0, memo: '', found: null, view: freshView(''), scoped: null };

/** Forget the kept search (tests). */
export function forgetSearch() {
  Object.assign(kept, { query: '', scope: 'all', top: 0, memo: '', found: null, view: freshView(''), scoped: null });
}

/** Where a gate boot reads the engine's rows for a picture (gen-gate.mjs writes it from main's engine). Not _gate/: the APK
   drops every _* folder (aapt), and the S22 gate boots the APK. */
export const GATE_ROWS_URL = 'src/v2/gate-data/search-rows.json';

/**
 * A gate picture's engine answer from its rows (search-rows.json[id]): main's parse, its marked words, the seeded hits and
 * the engine's own summary (the seeded hits are only what the picture can show).
 * @param {any} rows one picture's rows
 */
export function gateFound(rows, gl = g) {
  const terms = markTerms(rows.parsed, rows.parsedTerms || [], stopWords(gl));
  return {
    phase: 'done', parsed: rows.parsed, hits: rows.hits || [], terms, error: null, corrections: rows.corrections || [],
    unquoted: rows.unquoted || null, stopWordsOnly: false, capped: [], truncated: false, summary: rows.summary || null,
  };
}
