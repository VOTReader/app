/* home-facts.js - what v2's Home shows (mw5; pictures 0a-home, 0b-home-more): Continue reading, Recent, the collections.

   Saved data is re-shown, never migrated (v2-build-plan rule 5): Continue is main's "you are here" (StateStore's
   activeReadKey with lastReadLetterMap / lastReadChapters, as goToLastRead resumes it) and Recent is main's reading
   history (HistoryStore, newest first) with main's open pages (vot-state tabs: v2 has no tabs, so the pages a reader
   kept open come back here; Corbin's v2-map call let Open pages go only if they show up in the new places). A gate boot
   seeds the same shapes in memory. Everything here is read only.

   An item is one place a reader was:
     { kind: 'letter', collection, n } or { kind: 'letter', collection, letterId } (main stores letter ids)
     { kind: 'chapter', book, bookTitle?, chapter }      (a Bible chapter; book is main's bookId, 'john')
     { kind: 'study', studyId, chapterId, title }         (a Bible letter study's chapter) */

const g = /** @type {any} */ (globalThis);

/** The seven volumes, in Home's two columns (I-IV left, V-VII right). */
export const VOLUMES = [
  { key: 'one', n: 'I' }, { key: 'two', n: 'II' }, { key: 'three', n: 'III' }, { key: 'four', n: 'IV' },
  { key: 'five', n: 'V' }, { key: 'six', n: 'VI' }, { key: 'seven', n: 'VII' },
];

/** "More letters", in the picture's order. */
export const MORE_LETTERS = ['timothy', 'flock', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'holydays'];

/** Recent chips' short names; a volume reads "Vol. One". */
const SHORT = { timothy: 'Timothy', flock: 'Little Flock', rebuke: "The Lord's Rebuke" };

/**
 * @typedef {{ kind: 'letter', collection: string, n?: number, letterId?: string }
 *   | { kind: 'chapter', book: string, bookTitle?: string, chapter: number }
 *   | { kind: 'study', studyId: string, chapterId: string, title?: string }} HomeItem
 * @typedef {{ continue: HomeItem | null, recent: HomeItem[] }} HomeFacts
 */

/** The collection record (scripture-resolution COLLECTIONS) for a key, or null. @param {string} key */
export function colOf(key, gl = g) {
  const map = gl.COL_BY_KEY;
  return map && typeof map.get === 'function' ? map.get(key) || null : null;
}

/** A collection's letters once its corpus is loaded, else null. */
export function lettersOf(col, gl = g) {
  return col && Array.isArray(gl[col.globalName]) ? gl[col.globalName] : null;
}

/** Main's "you are here", from vot-state (StateStore). @returns {HomeItem | null} */
export function continueFromState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const key = typeof s.activeReadKey === 'string' ? s.activeReadKey : '';
  if (!key) return null;
  if (key.startsWith('vol:')) {
    const collection = key.slice(4);
    const id = s.lastReadLetterMap && s.lastReadLetterMap[collection];
    return id ? { kind: 'letter', collection, letterId: String(id) } : null;
  }
  const chapters = s.lastReadChapters || {};
  if (key.startsWith('bible-study-')) {
    const chapterId = chapters[key];
    return chapterId ? { kind: 'study', studyId: key.slice('bible-study-'.length), chapterId: String(chapterId) } : null;
  }
  const ch = Number(chapters[key]);
  return ch > 0 ? { kind: 'chapter', book: key, chapter: ch } : null;
}

/** One history entry (main's use-nav-history-tracking shapes) as an item; null for what Home never lists. @returns {HomeItem | null} */
export function itemFromHistory(e, gl = g) {
  if (!e || typeof e !== 'object') return null;
  if (e.type === 'chapter' && e.bookId && Number(e.chapterNum) > 0) {
    return { kind: 'chapter', book: String(e.bookId), bookTitle: e.bookTitle || undefined, chapter: Number(e.chapterNum) };
  }
  if (e.type === 'study-chapter' && e.studyId && e.studyChapterId) {
    return { kind: 'study', studyId: String(e.studyId), chapterId: String(e.studyChapterId), title: e.studyTitle || undefined };
  }
  if (e.type !== 'letter' || !e.letterId) return null;
  // Hidden Manna is reachable only through the Matthew study chain: its visits (volumeScreen null) never show.
  if (e.volumeScreen === null) return null;
  const byIndex = gl.COL_BY_INDEX_SC;
  let col = e.volumeScreen && byIndex && typeof byIndex.get === 'function' ? byIndex.get(e.volumeScreen) : null;
  if (!col && Array.isArray(gl.COLLECTIONS)) {
    col = gl.COLLECTIONS.find((c) => (lettersOf(c, gl) || []).some((x) => x && x.id === e.letterId)) || null;
  }
  if (!col || col.volKey === 'hm') return null;
  return e.letterNum ? { kind: 'letter', collection: col.volKey, n: Number(e.letterNum), letterId: String(e.letterId) }
    : { kind: 'letter', collection: col.volKey, letterId: String(e.letterId) };
}

/** A stable identity for "is this the same place?". */
export function itemKey(it) {
  if (!it) return '';
  if (it.kind === 'chapter') return 'ch:' + it.book + ':' + it.chapter;
  if (it.kind === 'study') return 'st:' + it.studyId + ':' + it.chapterId;
  return 'lt:' + it.collection + ':' + (it.n != null ? 'n' + it.n : 'id' + it.letterId);
}

/** Recent's history places (the row scrolls sideways; main's open pages come on top of these). */
export const RECENT_MAX = 8;

/**
 * One of main's open pages (a vot-state tab; utils/tabs.js describeTab reads the same fields) as an item: a Bible or
 * Matthew chapter, a letter by its collection's letter screen, a study chapter; null for every other page (Home, an
 * index, Search, Settings) and for Hidden Manna. @returns {HomeItem | null}
 */
export function itemFromTab(t, gl = g) {
  if (!t || typeof t !== 'object') return null;
  const s = t.screen;
  if ((s === 'bible-ch' || s === 'matthew-ch') && t.bookId && Number(t.chapterNum) > 0) {
    return { kind: 'chapter', book: t.bookId === 'matthew-plain' ? 'matthew' : String(t.bookId), chapter: Number(t.chapterNum) };
  }
  if (s === 'bible-study-chapter' && t.studyId && t.studyChapterId) {
    return { kind: 'study', studyId: String(t.studyId), chapterId: String(t.studyChapterId) };
  }
  const byScreen = gl.COL_BY_LETTER_SC;
  const col = s && t.letterId && byScreen && typeof byScreen.get === 'function' ? byScreen.get(s) : null;
  if (!col || col.volKey === 'hm') return null;
  return { kind: 'letter', collection: col.volKey, letterId: String(t.letterId) };
}

/**
 * Recent: the newest distinct places in the history, not the one Continue already offers, `max` of them plus any
 * further back that is an open page; then the open pages never in the history, in main's tab order.
 * @param {any[]} entries newest first @param {HomeItem | null} cont @param {number} [max] @param {any} [gl]
 * @param {any[]} [tabs] main's open pages (vot-state tabs)
 */
export function recentItems(entries, cont, max = RECENT_MAX, gl = g, tabs = []) {
  const out = [];
  const seen = new Set();
  const contKeys = cont ? sameKeys(cont, gl) : [];
  const open = (Array.isArray(tabs) ? tabs : []).map((t) => itemFromTab(t, gl)).filter(Boolean);
  const openKeys = new Set(open.flatMap((it) => sameKeys(it, gl)));
  const add = (it, keys) => {
    if (keys.some((k) => seen.has(k) || contKeys.includes(k))) return;
    keys.forEach((k) => seen.add(k));
    out.push(it);
  };
  for (const e of Array.isArray(entries) ? entries : []) {
    const it = itemFromHistory(e, gl);
    if (!it) continue;
    const keys = sameKeys(it, gl);
    if (out.length >= max && !keys.some((k) => openKeys.has(k))) continue;
    add(it, keys);
  }
  for (const it of open) add(it, sameKeys(it, gl));
  return out;
}

/** Both of a letter's keys (by number and by id, whichever are known) so an id-only and a numbered entry match. */
function sameKeys(it, gl) {
  if (it.kind !== 'letter') return [itemKey(it)];
  const r = resolveLetter(it, gl);
  const keys = [];
  if (it.letterId || (r && r.letter && r.letter.id)) keys.push('lt:' + it.collection + ':id' + (it.letterId || r.letter.id));
  const n = it.n != null ? it.n : r && r.letter ? r.letter.num : null;
  if (n != null) keys.push('lt:' + it.collection + ':n' + n);
  return keys.length ? keys : [itemKey(it)];
}

/** The reader's saved Continue + Recent (history and open pages), read only (a real boot, under HydrationGate). @returns {HomeFacts} */
export function savedHome(gl = g) {
  let state = null;
  let entries = [];
  try {
    const store = gl.StateStore;
    if (store && typeof store.isReady === 'function' && store.isReady()) state = store.get();
  } catch (_e) { /* no saved state: nothing to continue */ }
  try {
    const hist = gl.HistoryStore;
    if (hist && typeof hist.isReady === 'function' && hist.isReady()) entries = hist.list() || [];
  } catch (_e) { /* no history: no Recent row */ }
  const cont = continueFromState(state);
  const tabs = state && Array.isArray(state.tabs) ? state.tabs : [];
  return { continue: cont, recent: recentItems(entries, cont, RECENT_MAX, gl, tabs) };
}

/** The letter an item points at, once its corpus is loaded: { col, letter } (letter null when not found). */
export function resolveLetter(it, gl = g) {
  const col = colOf(it.collection, gl);
  const list = lettersOf(col, gl);
  if (!col) return null;
  if (!list) return { col, letter: null };
  const letter = (it.letterId && list.find((l) => l && l.id === it.letterId))
    || (it.n != null && list.find((l) => l && l.num === it.n)) || null;
  return { col, letter };
}

/** "Volume One" -> "Vol. One"; other collections by a short name. */
function shortCol(col) {
  if (/^Volume /.test(col.label)) return col.label.replace(/^Volume /, 'Vol. ');
  return SHORT[col.volKey] || col.label;
}

const titleCase = (id) => String(id).replace(/(^|[-\s])([a-z])/g, (_m, p, c) => (p === '-' ? ' ' : p) + c.toUpperCase());

/** A Bible book's name: the item's own, the loaded Bible's, else its id in title case ('1john' -> '1john'). */
export function bookTitle(it, gl = g) {
  if (it.bookTitle) return it.bookTitle;
  const books = gl.__ALL_BOOKS || gl.BOOKS;
  const b = books && books[it.book];
  return b && b.title ? b.title : titleCase(it.book);
}

/**
 * How an item reads: { title, where, chip } (title "Chosen by God", where "Volume One, Letter 1", chip "Vol. One, Letter 2"),
 * or null while its letter is not loaded or no longer exists.
 * @param {HomeItem} it
 */
export function describeItem(it, gl = g) {
  if (!it) return null;
  if (it.kind === 'chapter') {
    const name = bookTitle(it, gl) + ' ' + it.chapter;
    return { title: name, where: 'The Scriptures of Truth', chip: name };
  }
  if (it.kind === 'study') {
    const name = it.title || 'Bible study';
    return { title: name, where: 'Studies', chip: name };
  }
  const r = resolveLetter(it, gl);
  if (!r || !r.letter) return null;
  const n = r.letter.num;
  if (r.col.kind === 'letter') {
    return { title: r.letter.title, where: r.col.label + ', Letter ' + n, chip: shortCol(r.col) + ', Letter ' + n };
  }
  return { title: r.letter.title, where: r.col.label, chip: r.letter.title };
}

/**
 * The history V2App pushes to open an item: a letter under its collection, a chapter under The Bible and its book.
 * @param {HomeItem} it @returns {Array<import('./gate.js').Route & Record<string, any>>}
 */
export function itemRoutes(it, gl = g) {
  if (it.kind === 'chapter') {
    return [{ place: 'bible' }, { place: 'bible-book', book: it.book }, { place: 'bible-chapter', book: it.book, chapter: it.chapter }];
  }
  if (it.kind === 'study') return [{ place: 'study-chapter', study: it.studyId, chapter: it.chapterId }];
  const r = resolveLetter(it, gl);
  const n = r && r.letter ? r.letter.num : it.n;
  return [{ place: 'collection', collection: it.collection }, { place: 'letter', collection: it.collection, n }];
}

/** A collection's letter count once loaded (Home's numbers come from the corpus itself), else null. */
export function letterCount(key, gl = g) {
  const list = lettersOf(colOf(key, gl), gl);
  return list ? list.length : null;
}
