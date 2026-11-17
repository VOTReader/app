/* ═══════════════════════════════════════════════════════════════════════
   useHistory — app-global reading-history state + mutators
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - readHistory state (persisted to localStorage['vot-history'])
     - addToHistory(entry)       gated by historyEnabled
     - clearHistory()

   DOES NOT OWN:
     - The auto-track useEffect that decides WHEN to call addToHistory.
       Originally lived in App() right next to its triggers; during the
       App() decomposition (P7a, 2026-05-24) it was extracted to its own
       hook: src/hooks/use-nav-history-tracking.js. The split is
       deliberate — useHistory is the state-and-API layer; the trigger
       policy (reads nav state + 3 App-local lookup helpers) sits on top
       as a separate hook. App() now just threads both into place.

   PARAMS:
     historyEnabled — current value of settings.historyEnabled (useSettings).
                      Read through a ref so the addToHistory closure always
                      sees the latest setting without needing a fresh
                      closure each render.

   RETURNS: { readHistory, addToHistory, clearHistory }

   STORAGE: localStorage 'vot-history' (JSON array of entries, newest
            first, cap 2000). The 2000 cap is enforced on every add.

   WINDOW: none — wires no window.__* handler bridges.

   ENTRY SHAPE (newest-first, per existing schema):
     { type: 'chapter' | 'letter' | 'study-chapter',
       ...type-specific fields...,
       key: stable identity key (NOT used for dedup on add; HistoryScreen
            folds a day's repeats of one key into one row at display time),
       ts: Date.now() at record time }

   THE KEY HELPER:
     entry.type === 'letter'        → 'lt:' + entry.letterId
     entry.type === 'study-chapter' → 'st:' + entry.studyId + ':' + entry.studyChapterId
     entry.type === 'chapter'       → 'ch:' + entry.bookId + ':' + entry.chapterNum
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { HistoryStore } from '../stores/history-store.js';
import { COL_BY_KEY, colLetterArr } from '../data/scripture-resolution.js';

/**
 * hm1: a Hidden Manna visit, which no list may show (CLAUDE.md: reachable only
 * through the Matthew study chain). Visits are no longer recorded
 * (use-nav-history-tracking.js); ones stored before that are filtered here, on
 * read, never deleted. Hidden Manna is the one collection with no index screen,
 * so its visits carry `volumeScreen: null`; an older entry without the field is
 * matched by the Hidden Manna letter ids once that corpus has loaded.
 * @param {any} e
 * @returns {boolean}
 */
export function isHiddenMannaVisit(e) {
  if (!e || e.type !== 'letter') return false;
  const hm = COL_BY_KEY.get('hm');
  if (!hm) return false;
  if (e.volumeScreen != null) return false;
  if (e.volumeScreen === null && !hm.indexScreen) return true;
  return colLetterArr(hm).some((x) => x && x.id === e.letterId);
}

// Stable subscribe + getSnapshot for useSyncExternalStore so React
// doesn't think the source changed each render. Defined at module
// scope; both call HistoryStore's methods on HistoryStore itself.
// The filtered list is rebuilt only when the store hands out a new array
// (or the corpus version moves, W43), so the snapshot stays referentially
// stable between changes.
// W43: an older Hidden Manna entry is known only by the letter ids the VOT corpus
// brings, so the snapshot is also keyed on that corpus's version (index.html's lazy
// loader, window.__votCorpus), and the hook listens to it: a list built before the
// corpus landed is rebuilt when it does, even while History is showing.
/** @returns {any} */
const _votCorpus = () => (typeof window !== 'undefined' && /** @type {any} */ (window).__votCorpus) || null;
/** @param {() => void} cb @returns {() => void} */
const _subscribeHistory = (cb) => {
  const offStore = HistoryStore.subscribe(cb);
  const corpus = _votCorpus();
  const offCorpus = corpus && typeof corpus.subscribe === 'function' ? corpus.subscribe(cb) : null;
  return () => { offStore(); if (typeof offCorpus === 'function') offCorpus(); };
};
/** @type {any} */ let _snapSource = null;
/** @type {any} */ let _snapCorpus = null;
/** @type {HistoryEntry[]} */ let _snapList = [];
const _getHistorySnapshot = () => {
  const src = HistoryStore.list();
  const corpus = _votCorpus();
  const corpusVersion = corpus && typeof corpus.getVersion === 'function' ? corpus.getVersion() : null;
  if (src !== _snapSource || corpusVersion !== _snapCorpus) {
    _snapSource = src;
    _snapCorpus = corpusVersion;
    _snapList = Array.isArray(src) && src.some(isHiddenMannaVisit) ? src.filter((e) => !isHiddenMannaVisit(e)) : src;
  }
  return _snapList;
};

/**
 * One reading-history entry. The `key` field is computed at add() time
 * and names the reading (HistoryScreen folds a day's repeats by it). `ts` is the
 * visit timestamp. Other fields are type-specific:
 *   - 'chapter' carries bookId/chapterNum/... title fields
 *   - 'study-chapter' carries studyId/studyChapterId/... title fields
 *   - 'letter' carries letterId/letterTitle/letterNum/volumeScreen
 *
 * @typedef {{
 *   type: 'chapter' | 'letter' | 'study-chapter',
 *   key?: string,
 *   ts?: number,
 *   [k: string]: any
 * }} HistoryEntry
 */

/**
 * App-global reading-history hook. Owns the state container + 2 mutators
 * (addToHistory / clearHistory) and the localStorage
 * persistence. Does NOT own the "when to record" decision — that lives
 * in the App()-local auto-track useEffect that calls addToHistory based
 * on nav state.
 *
 * historyEnabled is mirrored via useRefMirror so addToHistory's closure
 * always sees the latest setting without recreating the function each
 * render.
 *
 * @param {boolean} historyEnabled
 * @returns {{
 *   readHistory: HistoryEntry[],
 *   addToHistory: (entry: HistoryEntry) => void,
 *   clearHistory: () => void
 * }}
 */
export function useHistory(historyEnabled) {
  // W2.3b: HistoryStore (IDB-backed) is the source of truth.
  // useSyncExternalStore wires this hook's render to the store's
  // version bump — every add/clear/pruneDay triggers a re-render
  // automatically; React state is no longer needed at this layer.
  const readHistory = React.useSyncExternalStore(
    _subscribeHistory, _getHistorySnapshot
  );

  // Mirror so addToHistory's closure sees the latest gate value
  // without having to re-create the function each render.
  const enabledRef = useRefMirror(historyEnabled);

  const addToHistory = (entry) => {
    // Don't record while History is disabled. Existing entries are
    // preserved (user can re-enable and still see their past trail).
    if (enabledRef.current === false) return;
    HistoryStore.add(entry);
  };

  const clearHistory = () => { HistoryStore.clear(); };

  // pruneHistoryDay left with the Deduplicate button (journey row 3, 2026-09-12): the screen folds
  // a day's repeats into one row itself, so nobody is asked to clean their own trail. The store's
  // pruneDay stays for its own tests and for any future import-time repair; no screen reaches it.
  return { readHistory, addToHistory, clearHistory };
}
