/* ═══════════════════════════════════════════════════════════════════════
   useHistory — app-global reading-history state + mutators
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   OWNS:
     - readHistory state (persisted to localStorage['vot-history'])
     - addToHistory(entry)       gated by historyEnabled
     - clearHistory()
     - pruneHistoryDay(y, m, d)  dedupes within one calendar day

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

   RETURNS: { readHistory, addToHistory, clearHistory, pruneHistoryDay }

   STORAGE: localStorage 'vot-history' (JSON array of entries, newest
            first, cap 2000). The 2000 cap is enforced on every add.

   WINDOW: none — wires no window.__* handler bridges.

   ENTRY SHAPE (newest-first, per existing schema):
     { type: 'chapter' | 'letter' | 'study-chapter',
       ...type-specific fields...,
       key: stable dedup key (NOT used for dedup on add; pruneHistoryDay
            uses it per-calendar-day),
       ts: Date.now() at record time }

   THE KEY HELPER:
     entry.type === 'letter'  → 'lt:' + entry.letterId
     other                    → 'ch:' + entry.bookId + ':' + entry.chapterNum
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { HistoryStore } from '../stores/history-store.js';

// Stable subscribe + getSnapshot for useSyncExternalStore so React
// doesn't think the source changed each render. Bound at module
// scope; both functions retain HistoryStore as `this` via the bind.
const _subscribeHistory = HistoryStore.subscribe.bind(HistoryStore);
const _getHistorySnapshot = () => HistoryStore.list();

/**
 * One reading-history entry. The `key` field is computed at add() time
 * and used by pruneHistoryDay for per-calendar-day dedup. `ts` is the
 * visit timestamp. Other fields are type-specific:
 *   - 'chapter' / 'study-chapter' carry bookId/chapterNum/... title fields
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
 * App-global reading-history hook. Owns the state container + 3 mutators
 * (addToHistory / clearHistory / pruneHistoryDay) and the localStorage
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
 *   clearHistory: () => void,
 *   pruneHistoryDay: (year: number, month: number, day: number) => void
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

  const pruneHistoryDay = (year, month, day) => {
    HistoryStore.pruneDay(year, month, day);
  };

  return { readHistory, addToHistory, clearHistory, pruneHistoryDay };
}
