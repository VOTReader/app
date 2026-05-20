/* ═══════════════════════════════════════════════════════════════════════
   SCRIPTURE / COLLECTION RESOLUTION — single source of truth for
   the collection registry (COLLECTIONS + COL_BY_* derived maps) AND
   the scripture-reference primitives (parseRefStr / findBook /
   parseScriptureRef / lookupVersesFromBooks / resolveVerseText /
   findEntryContext).
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src> —
   every name below is a global the rest of the app calls by bare name
   (same pattern as dom-links.js, dom-bookmarks.js, annotation-engine.js).

   Loaded right after the journal modules and BEFORE the inline <script>
   block that consumes these. Nothing here executes at module-load time
   except the COLLECTIONS.forEach() that attaches `short` / `shortFromOutside`
   properties to its own array entries — that uses only this module's own
   data (no external globals). All other functions are pure or read data
   globals (BOOKS / MATTHEW / LETTERS_* / BIBLE_STUDIES / window.BIBLE_*) at
   CALL time, by which point every data <script src> has already loaded.

   Exposed globals (all reachable by bare name across script blocks):
     COLLECTIONS  + COL_BY_KEY / _CARD / _LETTER_SC / _INDEX_SC /
                    _SEARCH_ID / _READ_KEY
     _NAV_ICONS, COL_NAV_ICON, _BOUNDARY_SHORT, _BOUNDARY_SHORT_OUTSIDE
     READING_CHAIN, _isWtlbFamily, _boundaryShort
     colLetters, colPreface, colLetterArr, LETTER_SCREEN_SET
     _allBooks, _matthew, _studies
     parseRefStr, findBook, parseScriptureRef
     resolveVerseText, findEntryContext, lookupVersesFromBooks
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   COLLECTION REGISTRY
   Single source of truth for every content collection in the app.
   Every volume/letter-collection/entry-collection is defined here
   once; all navigation, back-routing, search, last-read tracking,
   and data loading derive from this table.
═══════════════════════════════════════════════════════════════ */
export const COLLECTIONS = [
  { volKey: 'one',     cardId: 'volume-one',        readKey: 'volume-one',      globalName: 'LETTERS_V1',      prefaceGlobal: 'LETTERS_V1_PREFACE',      letterScreen: 'vot-one-letter',     indexScreen: 'vot-one-index',     label: 'Volume One',                                              registryLabel: 'Volume One',                                              searchVolId: 'v1',            kind: 'letter',     surpriseType: 'vot-one' },
  { volKey: 'two',     cardId: 'volume-two',        readKey: 'volume-two',      globalName: 'LETTERS',         prefaceGlobal: null,                       letterScreen: 'vot-letter',         indexScreen: 'vot-index',         label: 'Volume Two',                                              registryLabel: 'Volume Two',                                              searchVolId: 'v2',            kind: 'letter',     surpriseType: 'vot' },
  { volKey: 'three',   cardId: 'volume-three',      readKey: 'volume-three',    globalName: 'LETTERS_V3',      prefaceGlobal: 'LETTERS_V3_PREFACE',      letterScreen: 'vot-three-letter',   indexScreen: 'vot-three-index',   label: 'Volume Three',                                            registryLabel: 'Volume Three',                                            searchVolId: 'v3',            kind: 'letter',     surpriseType: 'vot-three' },
  { volKey: 'four',    cardId: 'volume-four',       readKey: 'volume-four',     globalName: 'LETTERS_V4',      prefaceGlobal: 'LETTERS_V4_PREFACE',      letterScreen: 'vot-four-letter',    indexScreen: 'vot-four-index',    label: 'Volume Four',                                             registryLabel: 'Volume Four',                                             searchVolId: 'v4',            kind: 'letter',     surpriseType: 'vot-four' },
  { volKey: 'five',    cardId: 'volume-five',       readKey: 'volume-five',     globalName: 'LETTERS_V5',      prefaceGlobal: 'LETTERS_V5_PREFACE',      letterScreen: 'vot-five-letter',    indexScreen: 'vot-five-index',    label: 'Volume Five',                                             registryLabel: 'Volume Five',                                             searchVolId: 'v5',            kind: 'letter',     surpriseType: 'vot-five' },
  { volKey: 'six',     cardId: 'volume-six',        readKey: 'volume-six',      globalName: 'LETTERS_V6',      prefaceGlobal: 'LETTERS_V6_PREFACE',      letterScreen: 'vot-six-letter',     indexScreen: 'vot-six-index',     label: 'Volume Six',                                              registryLabel: 'Volume Six',                                              searchVolId: 'v6',            kind: 'letter',     surpriseType: 'vot-six' },
  { volKey: 'seven',   cardId: 'volume-seven',      readKey: 'volume-seven',    globalName: 'LETTERS_V7',      prefaceGlobal: 'LETTERS_V7_PREFACE',      letterScreen: 'vot-seven-letter',   indexScreen: 'vot-seven-index',   label: 'Volume Seven',                                            registryLabel: 'Volume Seven',                                            searchVolId: 'v7',            kind: 'letter',     surpriseType: 'vot-seven' },
  { volKey: 'timothy', cardId: 'letters-timothy',   readKey: 'letters-timothy', globalName: 'LETTERS_TIMOTHY', prefaceGlobal: 'LETTERS_TIMOTHY_PREFACE', letterScreen: 'vot-timothy-letter', indexScreen: 'vot-timothy-index', label: 'Letters from Timothy',                                    registryLabel: 'Letters from Timothy',                                    searchVolId: 'timothy',       kind: 'letter',     surpriseType: 'vot-timothy' },
  { volKey: 'flock',   cardId: 'little-flock',      readKey: 'little-flock',    globalName: 'LETTERS_FLOCK',   prefaceGlobal: 'LETTERS_FLOCK_PREFACE',   letterScreen: 'vot-flock-letter',   indexScreen: 'vot-flock-index',   label: "Letters to The Lord's Little Flock",                       registryLabel: "Letters to The Lord's Little Flock",                       searchVolId: 'flock',         kind: 'letter',     surpriseType: 'vot-flock' },
  { volKey: 'rebuke',  cardId: 'lords-rebuke',      readKey: 'lords-rebuke',    globalName: 'LETTERS_REBUKE',  prefaceGlobal: 'LETTERS_REBUKE_PREFACE',  letterScreen: 'vot-rebuke-letter',  indexScreen: 'vot-rebuke-index',  label: "The Lord's Rebuke",                                       registryLabel: "A Testament Against The World: The Lord's Rebuke",        searchVolId: 'rebuke',        kind: 'letter',     surpriseType: 'vot-rebuke' },
  { volKey: 'wtlb1',   cardId: 'words-to-live-by-1',readKey: 'wtlb-one',        globalName: 'WTLB_ONE',       prefaceGlobal: null,                       letterScreen: 'wtlb-one-entry',     indexScreen: 'wtlb-one-index',    label: 'Words To Live By: Part One',                              registryLabel: 'Words To Live By: Part One',                              searchVolId: 'wtlb1',         kind: 'wtlb',       surpriseType: 'wtlb1' },
  { volKey: 'wtlb2',   cardId: 'words-to-live-by-2',readKey: 'wtlb-two',        globalName: 'WTLB_TWO',       prefaceGlobal: null,                       letterScreen: 'wtlb-two-entry',     indexScreen: 'wtlb-two-index',    label: 'Words To Live By: Part Two',                              registryLabel: 'Words To Live By: Part Two',                              searchVolId: 'wtlb2',         kind: 'wtlb',       surpriseType: 'wtlb2' },
  { volKey: 'blessed', cardId: 'the-blessed',       readKey: 'the-blessed',     globalName: 'THE_BLESSED',     prefaceGlobal: null,                       letterScreen: 'blessed-entry',      indexScreen: 'blessed-index',     label: 'The Blessed',                                             registryLabel: 'The Blessed',                                             searchVolId: 'blessed',       kind: 'blessed',    surpriseType: 'blessed' },
  { volKey: 'holydays',cardId: 'holy-days',         readKey: 'holy-days',       globalName: 'HOLY_DAYS',       prefaceGlobal: null,                       letterScreen: 'holy-days-entry',    indexScreen: 'holy-days-index',   label: 'Regarding The Holy Days',                                 registryLabel: 'Regarding The Holy Days',                                 searchVolId: 'holydays',      kind: 'holy-days',  surpriseType: null },
  { volKey: 'hm',      cardId: null,                readKey: 'hidden-manna',    globalName: 'HIDDEN_MANNA',    prefaceGlobal: null,                       letterScreen: 'hm-letter',          indexScreen: null,                label: 'Hidden Manna',                                            registryLabel: 'Hidden Manna',                                            searchVolId: 'hidden-manna',  kind: 'letter',     surpriseType: null }
];

export const COL_BY_KEY       = new Map(COLLECTIONS.map(c => [c.volKey, c]));
export const COL_BY_CARD      = new Map(COLLECTIONS.filter(c => c.cardId).map(c => [c.cardId, c]));
export const COL_BY_LETTER_SC = new Map(COLLECTIONS.map(c => [c.letterScreen, c]));
export const COL_BY_INDEX_SC  = new Map(COLLECTIONS.filter(c => c.indexScreen).map(c => [c.indexScreen, c]));
export const COL_BY_SEARCH_ID = new Map(COLLECTIONS.filter(c => c.searchVolId).map(c => [c.searchVolId, c]));
export const COL_BY_READ_KEY  = new Map(COLLECTIONS.filter(c => c.readKey).map(c => [c.readKey, c]));
export const _NAV_ICONS = {one:'V1',two:'V2',three:'V3',four:'V4',five:'V5',six:'V6',seven:'V7',timothy:'LT',flock:'LF',rebuke:'LR',wtlb1:'W1',wtlb2:'W2',blessed:'TB',holydays:'HD',hm:'HM'};
export const COL_NAV_ICON = new Map(COLLECTIONS.map(c => [c.label, _NAV_ICONS[c.volKey] || '?']));

/* Boundary-card short labels (default to .label when same). Used by the
   boundaryConfig() helper inside App() to compute prev/next reading-chain
   transitions. shortFromOutside is the label shown when crossing in from a
   different "family" (Rebuke→WTLB1 shows "Words To Live By", not "Part One"). */
export const _BOUNDARY_SHORT = { flock: 'Little Flock', holydays: 'Holy Days', wtlb1: 'Part One', wtlb2: 'Part Two' };
export const _BOUNDARY_SHORT_OUTSIDE = { wtlb1: 'Words To Live By', wtlb2: 'Words To Live By' };
COLLECTIONS.forEach(c => {
  c.short = _BOUNDARY_SHORT[c.volKey] || c.label;
  c.shortFromOutside = _BOUNDARY_SHORT_OUTSIDE[c.volKey] || null;
});

/* Reading chain — order in which collections appear in the prev/next nav.
   Optional members (blessed) are skipped when their global is empty. */
export const READING_CHAIN = ['one','two','three','four','five','six','seven','rebuke','wtlb1','wtlb2','blessed','flock','timothy','holydays'];
export function _isWtlbFamily(col) { return !!col && (col.kind === 'wtlb' || col.kind === 'blessed'); }
export function _boundaryShort(sourceCol, targetCol) {
  if (targetCol.shortFromOutside && _isWtlbFamily(sourceCol) !== _isWtlbFamily(targetCol)) return targetCol.shortFromOutside;
  return targetCol.short;
}

export function colLetters(col)  { return col && typeof window[col.globalName] !== 'undefined' ? window[col.globalName] : null; }
export function colPreface(col)  { return col && col.prefaceGlobal && typeof window[col.prefaceGlobal] !== 'undefined' ? window[col.prefaceGlobal] : null; }
export function colLetterArr(col) { if (!col) return []; const arr = colLetters(col); return Array.isArray(arr) ? arr : []; }

export const LETTER_SCREEN_SET = new Set(COLLECTIONS.map(c => c.letterScreen).concat(['bible-study-chapter']));

/* ═══════════════════════════════════════════════════════════════
   SCRIPTURE REFERENCE PRIMITIVES
   Shared by parseScriptureRef, lookupVersesFromBooks, searchNavIndex.
═══════════════════════════════════════════════════════════════ */

export function _allBooks() { return window.__ALL_BOOKS || (typeof BOOKS !== 'undefined' ? BOOKS : {}); }
export function _matthew() { return (typeof window !== 'undefined' && window.MATTHEW) || (typeof MATTHEW !== 'undefined' ? MATTHEW : null); }
export function _studies() { return typeof BIBLE_STUDIES !== 'undefined' ? BIBLE_STUDIES : []; }

export function parseRefStr(str) {
  if (!str) return null;
  const s = str.trim();
  const tagM = s.match(/\s*\(([A-Za-z]+)\)\s*$/);
  const clean = tagM ? s.slice(0, tagM.index).trim() : s;
  const m = clean.match(/^(\d?\s*[A-Za-z][A-Za-z\s]+?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  return {
    rawBook: m[1].trim(),
    chapter: parseInt(m[2], 10),
    verse: m[3] ? parseInt(m[3], 10) : null,
    verseEnd: m[4] ? parseInt(m[4], 10) : null,
    tag: tagM ? tagM[1] : null
  };
}

export function findBook(rawName) {
  if (rawName == null) return null;
  const books = _allBooks();
  const q = String(rawName).toLowerCase().replace(/\s+/g, '');
  if (!q) return null;
  for (const k of Object.keys(books)) {
    const b = books[k];
    if (!b || !b.title) continue;
    const t = b.title.toLowerCase().replace(/\s+/g, '');
    if (t === q || t.startsWith(q) || b.id === q ||
        t === q + 's' || t.replace(/s$/, '') === q.replace(/s$/, ''))
      return k;
  }
  return null;
}

export function parseScriptureRef(str) {
  const p = parseRefStr(str);
  if (!p || p.verse == null) return null;
  const bookKey = findBook(p.rawBook);
  if (!bookKey) return null;
  const books = _allBooks();
  const book = books[bookKey];
  const ch = book.chapters && book.chapters.find(c => c.num === p.chapter);
  if (!ch) return null;
  const v = ch.sections && ch.sections.flatMap(s => s.verses).find(v => v.n === p.verse);
  const label = book.title + ' ' + p.chapter + ':' + p.verse + (p.verseEnd ? '-' + p.verseEnd : '');
  return { bookId: bookKey, bookTitle: book.title, chapter: p.chapter, verse: p.verse, verseEnd: p.verseEnd, label, text: v ? v.text : '' };
}

/* Resolve verse text for a link endpoint */
export function resolveVerseText(endpoint) {
  if (endpoint.type === 'bible') {
    const book = _allBooks()[endpoint.bookId];
    if (!book) return endpoint.preview || '';
    const ch = book.chapters && book.chapters.find(c => c.num === endpoint.chapter);
    if (!ch) return endpoint.preview || '';
    const v = ch.sections && ch.sections.flatMap(s => s.verses).find(v => v.n === endpoint.verse);
    return v ? v.text : endpoint.preview || '';
  }
  if (endpoint.type === 'study') {
    const M = _matthew();
    if (!M) return endpoint.preview || '';
    const ch = M.chapters && M.chapters.find(c => c.num === endpoint.chapter);
    if (!ch) return endpoint.preview || '';
    if (endpoint.verse) {
      const v = ch.verses && ch.verses.find(v => v.n === endpoint.verse);
      return v ? v.text : endpoint.preview || '';
    }
    return ch.title || endpoint.preview || '';
  }
  // Letter/WTLB/Blessed/Holy-Days endpoint — preview already carries excerpt
  // text or preview text saved at link-creation time.
  return endpoint.text || endpoint.preview || '';
}

/* Resolve any letter/WTLB/Blessed/Holy-Days/Bible-Study chapter id back to
   its rendering context — collection name, screen route, and (for studies)
   the parent study slug. Used by:
   - buildSourceEndpoint:  to set screen + studyId on link source endpoints
                           so LinkSidebar can navigate back from anywhere
   - openLinkPicker:       to resolve the source label from a hlKey
   - LinkSidebar:          to show category text for non-Bible endpoints
   - LetterExcerptPicker:  to find the entry data for excerpt selection
   `kindHint` lets the caller restrict the search to a specific scope when
   the source key prefix already tells us where to look (e.g. a `blessed:`
   hlKey should never match a WTLB One entry that happens to share an id).
   Returns null if no match found. */
export function findEntryContext(id, kindHint) {
  if (!id) return null;
  const cols = kindHint ? COLLECTIONS.filter(c => c.kind === kindHint) : COLLECTIONS;
  for (const col of cols) {
    const pref = colPreface(col);
    if (pref && pref.id === id) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: pref.title || id, entry: pref };
    const arr = colLetters(col);
    if (!Array.isArray(arr)) continue;
    const f = arr.find(e => e && e.id === id);
    if (f) return { kind: col.kind, screen: col.letterScreen, collection: col.label, title: f.title || id, entry: f };
  }
  // Holy Days letter-type entries are rendered via LetterView and produce
  // hlKeys with the `letter:<id>:N` prefix — so notes anchored to them
  // arrive here with kindHint === 'letter'. But their ids only exist in
  // HOLY_DAYS, not in any letter-kind collection. Fall back to a HD lookup
  // so the source label resolves and noteSourceNav can return a navigable
  // endpoint (screen === 'holy-days-entry').
  if (kindHint === 'letter') {
    const hdCol = COL_BY_KEY && COL_BY_KEY.get ? COL_BY_KEY.get('holydays') : null;
    if (hdCol) {
      const arr = colLetters(hdCol);
      if (Array.isArray(arr)) {
        const f = arr.find(e => e && e.id === id);
        if (f) return { kind: 'holy-days', screen: hdCol.letterScreen, collection: hdCol.label, title: f.title || id, entry: f };
      }
    }
  }
  if (kindHint && kindHint !== 'letter') return null;
  var _bs = _studies();
  if (_bs.length > 0) {
    for (const study of _bs) {
      if (!study || !Array.isArray(study.chapters)) continue;
      const f = study.chapters.find(c => c && c.id === id);
      if (f) return { kind: 'study-letter', screen: 'bible-study-chapter', collection: study.title || 'Bible Study', title: f.title || id, entry: f, studyId: study.slug || study.id, studyChapterId: f.id };
    }
  }
  return null;
}

export function lookupVersesFromBooks(ref) {
  const p = parseRefStr(ref);
  if (!p || p.verse == null) return null;
  const bookKey = findBook(p.rawBook);
  if (!bookKey) return null;
  const vEnd = p.verseEnd || p.verse;

  // Translation-tagged refs (e.g. "John 14:6 (KJV)") read from the matching
  // alt-translation when it's already loaded. If the user hasn't activated
  // that translation yet, trigger a lazy load and fall back to NKJV for
  // this render — the next time the sheet is opened, the tagged data is in
  // memory and the correct translation renders. (Previously the tag was
  // parsed and silently dropped → every tagged inline ref showed NKJV
  // forever.)
  if (p.tag) {
    const code = String(p.tag).toLowerCase();
    if (code !== 'nkjv') {
      const data = (typeof window !== 'undefined') ? window['BIBLE_' + code.toUpperCase()] : null;
      if (data && data[bookKey] && data[bookKey][p.chapter]) {
        const altList = data[bookKey][p.chapter].filter(v => v.n >= p.verse && v.n <= vEnd);
        if (altList.length) {
          return altList.length === 1 ? altList[0].text : altList.map(v => `${v.n}. ${v.text}`).join(' ');
        }
      } else if (typeof loadTranslation === 'function') {
        // Fire-and-forget; user re-tap shows correct text next time.
        try { loadTranslation(code); } catch (e) {}
      }
    }
  }

  // Default NKJV path
  const books = _allBooks();
  const book = books[bookKey];
  const chapter = (book && book.chapters || []).find(c => c.num === p.chapter);
  if (!chapter) return null;
  const allVerses = chapter.sections ?
    chapter.sections.flatMap(s => s.verses || []) :
    chapter.verses || [];
  const verses = allVerses.filter(v => v.n >= p.verse && v.n <= vEnd);
  if (!verses.length) return null;
  return verses.length === 1 ? verses[0].text : verses.map(v => `${v.n}. ${v.text}`).join(' ');
}
