/* search-facts.js - what v2's Search shows (zv1; pictures 3a-search, 3b-search-results, 5c-search-match).

   One box over main's engine (window.VotSearchMini, bundle-d: the same index, parse and ranking as main's Search), its
   hits re-grouped the way the picture draws them: Go to (a reference typed, a collection named, or a title that holds the
   words), then In the letters, In the Bible, In Answers and In your notes (the reader's own marks, matched here in memory).
   Results open in the Search tab, so Back comes back to them: the query, scope and place are kept in this module's memory
   (never in storage). A gate boot never calls the engine: states.json's hits are seeded. */

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

const LETTER_KINDS = new Set(['letter', 'letter-title', 'wtlb', 'wtlb-title', 'blessed', 'blessed-title', 'holy-day', 'holy-day-title']);
const BIBLE_KINDS = new Set(['verse', 'heading', 'chapter-title']);
const ANSWER_KINDS = new Set(['answers', 'answers-title']);

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
 * Where a hit opens, in this tab: a verse on its chapter (marked there), a letter, WTLB / Blessed / Holy Days entry or
 * Answers topic as its collection's item. null when v2 has no place for it.
 * @param {any} doc @param {string[]} [terms]
 */
export function hitRoute(doc, terms, gl = g) {
  const grp = groupOf(doc);
  if (grp === 'bible') {
    const r = { place: 'bible-chapter', book: doc.bookId, chapter: doc.chapterNum };
    if (doc.kind === 'verse' && doc.verseNum) Object.assign(r, { verse: doc.verseNum, match: terms || [] });
    return r;
  }
  if (grp === 'letters' || grp === 'answers') {
    const col = colBySearchId(doc.volumeId, gl);
    const n = doc.letterNum || doc.num;
    return col && n ? { place: 'letter', collection: col.volKey, n, match: terms || [] } : null;
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

/**
 * The Go to rows: what the query names (a Bible reference or book, a letter by number, a collection), then up to
 * GOTO_CAP hits whose own title holds the whole query. Each row is { key, where, title, route }.
 * @param {string} query @param {any} parsed the engine's parse @param {Array<{doc:any}>} hits
 */
export function gotoRows(query, parsed, hits, gl = g) {
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
  const f = fold(query);
  if (f.length >= 3) {
    for (const h of hits || []) {
      if (out.length >= GOTO_CAP) break;
      const d = h && h.doc;
      const grp = groupOf(d);
      if (!d || !d.title || (grp !== 'letters' && grp !== 'answers') || !fold(d.title).includes(f)) continue;
      const route = hitRoute(d, [], gl);
      if (route) add({ key: 'l/' + route.collection + '/' + route.n, where: d.ref || '', title: d.title, route });
    }
  }
  return out.slice(0, GOTO_CAP + 2);
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
  };
}

/**
 * What a Search tab returns to (module memory, gone on reload): the query, the scope, how far down the list was, and the
 * last answer for that query so Back shows it at once instead of searching again.
 * @type {{ query: string, scope: string, top: number, memo: string, found: any }}
 */
export const kept = { query: '', scope: 'all', top: 0, memo: '', found: null };

/** Forget the kept search (tests). */
export function forgetSearch() {
  Object.assign(kept, { query: '', scope: 'all', top: 0, memo: '', found: null });
}

/* The 3b picture's results (states.json 3b-search-results: 'chosen', All): Volume One's Letter 1 and Letter 4, then John
   13:18, with the excerpts as drawn. Engine-shaped docs, so Go to and the groups come out of the same code a real search
   runs; only the excerpt is given (the engine's snippet window is the engine's business, not the picture's). */
export const GATE_CHOSEN = {
  query: 'chosen',
  scope: 'all',
  focus: true,
  parsed: { kind: 'text', phrase: '', terms: ['chosen'] },
  terms: ['chosen'],
  hits: [
    { doc: { kind: 'letter', volumeId: 'v1', letterNum: 1, title: 'Chosen by God', ref: 'Volume One · Letter 1' },
      excerpt: '…stone for My name. For I am your God, and you are one of My chosen sons of the…' },
    { doc: { kind: 'letter', volumeId: 'v1', letterNum: 4, title: 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ',
      ref: 'Volume One · Letter 4' },
    excerpt: '…of Abraham, even unto Moses, did I establish My people as the chosen to give sacrifice for the cleansing of sin... Behold, I gave unto them My Only Begotten…' },
    { doc: { kind: 'verse', bookId: 'john', chapterNum: 13, verseNum: 18, ref: 'John 13:18',
      text: '“I do not speak concerning all of you. I know whom I have chosen; but that the Scripture may be fulfilled, ‘He who eats bread with Me has lifted up his heel against Me.’' } },
  ],
  marks: [],
};
