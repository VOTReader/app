/* reading-record.js - v2 records reading the way main does (mw5; a walk on 10-14 found v2 wrote no history, place or read
   mark, so Home's Continue and Recent, The Bible's "Reading", a book's ring and a collection's "Finished" showed only what
   was read in main).

   Main's own records in main's own shapes, through main's stores (window globals: importing a store module would bundle
   a second copy of it):
   - history (use-nav-history-tracking): one HistoryStore entry per visit, once the text is on the page; none while
     settings.historyEnabled is false; a Hidden Manna letter never.
   - place (use-reading-position-nav's arm): activeReadKey with lastReadLetterMap[volKey] = the letter's id, or with
     lastReadChapters[bookId] = the chapter, at once; the reading-day streak after settings.dwellMs (20 s) of visible
     time on the page (use-reading-dwell).
   - read marks (use-read-tracker, useReadProgress): main's own detector over the shell's scroller; a completed read adds
     one to vot-state readItems['v1:<readKey>:<id>'] and records ReadingStatsStore.recordCompletion and the streak day; a
     recording heard to the end adds one through window.__votAudioListened. None while settings.markAsRead is false.
   vot-state is changed key by key and saved whole (StateStore.set, as main's usePersistedState does); nothing is written
   before the stores have loaded, and a gate boot (?gate=) writes nothing at all. */
import { useReadTracker } from '../hooks/use-read-tracker.js';

const g = /** @type {any} */ (globalThis);

/** main's dwell before a visit counts as a reading day (use-reading-dwell, when settings.dwellMs is unset). */
export const DWELL_MS = 20000;

/** main's read-mark key (useReadProgress getReadKey). @param {string} bid @param {string | number} cid */
export const readKey = (bid, cid) => 'v1:' + bid + ':' + cid;

/**
 * One visit to a reading page: its identity, main's place for it, its read-mark key and its history entry.
 * @typedef {{ key: string, active: string, slot: 'lastReadLetterMap' | 'lastReadChapters', at: string, value: any,
 *   read: string | null, entry: Record<string, any> | null }} Visit
 */

/**
 * The visit a route is once its text is loaded; null for a page that records nothing, or while its text has not loaded.
 * @param {any} route @returns {Visit | null}
 */
export function visitOf(route, gl = g) {
  if (!route) return null;
  if (route.place === 'letter') {
    const map = gl.COL_BY_KEY;
    const col = map && typeof map.get === 'function' ? map.get(route.collection) : null;
    if (!col) return null;
    let letter = null;
    if (route.preface) letter = col.prefaceGlobal ? gl[col.prefaceGlobal] : null;
    else if (Array.isArray(gl[col.globalName])) letter = gl[col.globalName].find((l) => l && l.num === route.n) || null;
    if (!letter || !letter.id) return null;
    return {
      key: 'lt:' + col.volKey + ':' + letter.id, active: 'vol:' + col.volKey, slot: 'lastReadLetterMap', at: col.volKey, value: letter.id,
      read: col.readKey ? readKey(col.readKey, letter.id) : null,
      // hm1: Hidden Manna is reachable only through the Matthew study chain, so its visits never enter the history
      entry: col.volKey === 'hm' ? null
        : { type: 'letter', letterId: letter.id, letterTitle: letter.title, letterNum: letter.num || null, volumeScreen: col.indexScreen },
    };
  }
  if (route.place === 'bible-chapter') {
    const books = gl.BOOKS && typeof gl.BOOKS === 'object' ? gl.BOOKS : null;
    const book = books && route.book ? books[route.book] : null;
    const n = Number(route.chapter);
    const ch = book && Array.isArray(book.chapters) ? book.chapters.find((c) => c && c.num === n) : null;
    if (!ch) return null;
    const bookId = String(route.book);
    return {
      key: 'ch:' + bookId + ':' + n, active: bookId, slot: 'lastReadChapters', at: bookId, value: n, read: readKey(bookId, n),
      entry: { type: 'chapter', bookId, bookTitle: book.title || bookId, chapterNum: n, chapterTitle: ch.title || null },
    };
  }
  // a Matthew Study Bible chapter (main's selectMatthewCh + use-nav-history-tracking's matthew-ch): the place 'matthew' at
  // the chapter's number, read marks 'v1:matthew:<n>', and the history entry main writes, a chapter of the book 'matthew'
  if (route.place === 'study-chapter' && route.study === 'matthew-study') {
    const book = gl.MATTHEW && Array.isArray(gl.MATTHEW.chapters) ? gl.MATTHEW : null;
    const n = Number(route.chapter);
    const ch = book ? book.chapters.find((c) => c && c.num === n) : null;
    if (!ch) return null;
    return {
      key: 'mt:' + n, active: 'matthew', slot: 'lastReadChapters', at: 'matthew', value: n, read: readKey('matthew', n),
      entry: { type: 'chapter', bookId: 'matthew', bookTitle: 'Matthew', chapterNum: n, chapterTitle: ch.title || null },
    };
  }
  // a Bible study's chapter (main's selectStudyChapter + use-nav-history-tracking): the study's read key
  // 'bible-study-<slug>' is the place, lastReadChapters under it the chapter's id, read marks 'v1:bible-study-<slug>:<id>'
  if (route.place === 'study-chapter') {
    const studies = Array.isArray(gl.BIBLE_STUDIES) ? gl.BIBLE_STUDIES : [];
    const study = studies.find((s) => s && s.id === route.study) || null;
    const ch = study && Array.isArray(study.chapters) ? study.chapters.find((c) => c && c.id === String(route.chapter)) : null;
    if (!ch) return null;
    const key = 'bible-study-' + study.slug;
    return {
      key: 'st:' + study.id + ':' + ch.id, active: key, slot: 'lastReadChapters', at: key, value: ch.id, read: readKey(key, ch.id),
      entry: { type: 'study-chapter', studyId: study.id, studyChapterId: ch.id, studyTitle: study.title, studySlug: study.slug,
        chapterTitle: ch.title, chapterNum: ch.num },
    };
  }
  return null;
}

/** vot-state once the stores have loaded, else null. */
function loadedState(gl) {
  const store = gl.StateStore;
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') return null;
  if (typeof store.isReady === 'function' && !store.isReady()) return null;
  return store.get() || {};
}

/** The reader's settings (vot-state.settings), {} when none are saved. */
function settingsOf(gl) {
  let s = null;
  try { s = loadedState(gl); } catch (_e) { /* not loaded: main's defaults */ }
  return s && s.settings && typeof s.settings === 'object' ? s.settings : {};
}

/**
 * Changes vot-state with `fn` and saves it whole; nothing before the stores have loaded, or when `fn` changes nothing.
 * @param {(s: Record<string, any>) => Record<string, any>} fn @returns {boolean} whether it was written
 */
export function changeState(fn, gl = g) {
  try {
    const cur = loadedState(gl);
    if (!cur) return false;
    const next = fn(cur);
    if (!next || next === cur) return false;
    gl.StateStore.set(next);
    return true;
  } catch (_e) {
    return false;
  }
}

/** vot-state with the reader's place at `v` (the same object when it is there already). @param {Visit} v */
export function withPlace(s, v) {
  const was = s[v.slot] && typeof s[v.slot] === 'object' ? s[v.slot] : {};
  if (s.activeReadKey === v.active && was[v.at] === v.value) return s;
  return { ...s, activeReadKey: v.active, [v.slot]: { ...was, [v.at]: v.value } };
}

/** vot-state with one more read of `key` (counts since 2026-08-03; a legacy `true` reads as 1). @param {string} key */
export function withRead(s, key) {
  const was = s.readItems && typeof s.readItems === 'object' ? s.readItems : {};
  return { ...s, readItems: { ...was, [key]: (Number(was[key]) || 0) + 1 } };
}

/** Today is a reading day (ReadingStreakStore; same-day repeats are the store's no-ops). */
function readingDay(gl) {
  const store = gl.ReadingStreakStore;
  try { if (store && typeof store.recordReadingDay === 'function') store.recordReadingDay(Date.now()); } catch (_e) { /* the streak waits */ }
}

/**
 * The history entry for a visit, unless the reader turned history off; nothing until vot-state has loaded, since
 * "history off" lives there (a loaded history beside an unloaded vot-state would write past it).
 * @param {Visit} v
 */
export function recordVisit(v, gl = g) {
  let s = null;
  try { s = loadedState(gl); } catch (_e) { /* not loaded */ }
  if (!v.entry || !s) return false;
  if (s.settings && typeof s.settings === 'object' && s.settings.historyEnabled === false) return false;
  const hist = gl.HistoryStore;
  if (!hist || typeof hist.add !== 'function') return false;
  try { hist.add(v.entry); return true; } catch (_e) { return false; }
}

/** The reader is at `v` (Continue, The Bible's "Reading", a book's ring). @param {Visit} v */
export function recordPlace(v, gl = g) {
  return changeState((s) => withPlace(s, v), gl);
}

/**
 * A finished read of `key` (main's markRead): one more in readItems; a read the detector measured (`payload`) also goes
 * to the reading record; either is a reading day. Nothing while the reader turned marking off.
 * @param {string} key @param {{ words: number, activeMs: number } | null} payload
 */
export function recordRead(key, payload, gl = g) {
  if (!key || settingsOf(gl).markAsRead === false) return false;
  let before = 0;
  const written = changeState((s) => { before = Number((s.readItems || {})[key]) || 0; return withRead(s, key); }, gl);
  if (!written) return false;
  const stats = gl.ReadingStatsStore;
  if (payload && stats && typeof stats.recordCompletion === 'function') {
    try { stats.recordCompletion({ key, words: payload.words, activeMs: payload.activeMs, wasReadBefore: before > 0 }); } catch (_e) { /* the mark stands */ }
  }
  readingDay(gl);
  return true;
}

/**
 * A recording heard to the end (the player's __votAudioListened): a letter under its collection's read key, a Bible
 * chapter under its book's (a whole-book recording names no chapter, so it marks none).
 * @param {string} volKey @param {string} itemId @param {number} chapterNum
 */
export function recordListen(volKey, itemId, chapterNum, gl = g) {
  if (!itemId) return false;
  if (typeof volKey === 'string' && volKey.indexOf('bible-') === 0) {
    const ch = Math.floor(Number(chapterNum) || 0);
    return ch > 0 ? recordRead(readKey(itemId, ch), null, gl) : false;
  }
  const map = gl.COL_BY_KEY;
  const col = map && typeof map.get === 'function' ? map.get(volKey) : null;
  return col && col.readKey ? recordRead(readKey(col.readKey, itemId), null, gl) : false;
}

/** The dwell before a visit counts as a reading day: visible time only, as main's. */
function useReadingDay(key, gl) {
  React.useEffect(() => {
    if (!key) return undefined;
    const doc = gl.document;
    const ms = Number(settingsOf(gl).dwellMs) || DWELL_MS;
    let left = ms;
    let since = 0;
    let timer = /** @type {any} */ (null);
    const run = () => {
      if (timer || left <= 0) return;
      since = Date.now();
      timer = setTimeout(() => { timer = null; left = 0; readingDay(gl); }, left);
    };
    const pause = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      left -= Date.now() - since;
    };
    const onVis = () => { if (doc.visibilityState === 'hidden') pause(); else run(); };
    if (doc.visibilityState !== 'hidden') run();
    doc.addEventListener('visibilitychange', onVis);
    return () => { if (timer) clearTimeout(timer); doc.removeEventListener('visibilitychange', onVis); };
  }, [key, gl]);
}

/**
 * The shell's reading record: called once by V2App with the top route, whether its page has said it is ready, the
 * page's scroller, and `live` (false on a gate boot: nothing is written).
 * @param {{ route: any, ready: boolean, scrollRef: { current: Element | null }, live: boolean }} args
 */
export function useReadingRecord({ route, ready, scrollRef, live }, gl = g) {
  const visit = live && ready ? visitOf(route, gl) : null;
  const key = visit ? visit.key : null;
  const visitRef = React.useRef(visit);
  visitRef.current = visit;

  // the history entry and the place, once per visit
  React.useEffect(() => {
    const v = visitRef.current;
    if (!key || !v) return;
    recordVisit(v, gl);
    recordPlace(v, gl);
  }, [key, gl]);
  useReadingDay(key, gl);

  // main's detector: it measures only while a reading page holds the completion bridge
  const read = visit ? visit.read : null;
  React.useEffect(() => {
    if (!read) return undefined;
    gl.__onReadingComplete = (/** @type {any} */ payload) => { recordRead(read, payload || null, gl); };
    gl.__readTrackerMeta = { key: read };
    return () => { gl.__onReadingComplete = null; gl.__readTrackerMeta = null; };
  }, [read, gl]);
  useReadTracker(scrollRef, !read, key || '');

  // a recording heard to the end, wherever the reader is
  React.useEffect(() => {
    if (!live) return undefined;
    gl.__votAudioListened = (/** @type {string} */ volKey, /** @type {string} */ itemId, /** @type {number} */ ch) => { recordListen(volKey, itemId, ch, gl); };
    return () => { gl.__votAudioListened = null; };
  }, [live, gl]);
}
