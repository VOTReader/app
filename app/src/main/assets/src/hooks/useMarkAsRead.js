/* ═══════════════════════════════════════════════════════════════════════
   useMarkAsRead + useReadProgress — mark-as-read domain
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js. Two exports, same
   domain, distinct responsibilities:

     - useMarkAsRead(enabled, onMarkRead)   per-reading-view bridge.
                                            Called from each of the 4
                                            reading views (LetterView,
                                            WtlbEntryView, BibleChapterView,
                                            ChapterView). Wires the
                                            window.__onReadingComplete
                                            bridge so the view's dwell/
                                            scroll trigger reaches App().
                                            ORIGINAL hook (P6 warmup).

     - useReadProgress({ savedReadItems,    App-level state container
                         markAsReadEnabled }) for the per-collection read
                                            cursor map. Owns readItems +
                                            VERSION_ID + getReadKey +
                                            isRead/markRead/unmarkRead +
                                            clearReadForBook +
                                            clearAllProgress. Called ONCE
                                            from App(). Added P7g.

   OWNS:
     - the window.__onReadingComplete bridge effect — binds onMarkRead onto
       window while `enabled` is true; clears it on unmount or when
       `enabled` flips false. Called from each of the 4 reading views
       (LetterView, WtlbEntryView, BibleChapterView, ChapterView).

   DOES NOT OWN:
     - the actual mark-as-read writes (per-collection markRead /
       setLastReadForVol etc.) — those live in App() and the reading
       views; this hook only owns the bridge wiring.
     - the decision of WHEN reading is "complete" — the reading view, via
       its dwell/scroll check, is what fires window.__onReadingComplete.

   PARAMS:
     enabled    — boolean; whether THIS consumer is the active reading
                  view. Each of the 4 reading views passes its own
                  `markAsReadEnabled` prop (App() → sharedViewProps).
     onMarkRead — callback invoked when the reading view reports completion.

   RETURNS: nothing — pure side-effect hook.

   STORAGE: none.

   WINDOW:
     __onReadingComplete — set to `onMarkRead` while `enabled` is true;
       cleanup sets it back to null (runs on unmount and whenever
       `enabled` / `onMarkRead` change).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Wire the `window.__onReadingComplete` bridge for one of the 4 reading
 * views (LetterView, WtlbEntryView, BibleChapterView, ChapterView). When
 * `enabled` is true, sets the bridge to `onMarkRead`; cleanup clears the
 * bridge on unmount or when either param changes.
 *
 * The decision of WHEN reading is "complete" lives in the reading view's
 * dwell/scroll logic — this hook only owns the bridge wiring, not the
 * "fire mark-read" trigger.
 *
 * @param {boolean} enabled    true iff THIS consumer is the active reading view
 * @param {() => void} onMarkRead  callback to invoke on completion
 * @returns {void}
 */
export function useMarkAsRead(enabled, onMarkRead, trackKey) {
  React.useEffect(() => {
    if (!enabled) return;
    window.__onReadingComplete = onMarkRead;
    // Identity for the read tracker's frontier reporting: the SAME key
    // useReadProgress writes (routes build it with getReadKey), so a
    // completion's ReadingStatsStore record clears exactly the frontier
    // this visit accumulated.
    window.__readTrackerMeta = trackKey ? { key: trackKey } : null;
    return () => { window.__onReadingComplete = null; window.__readTrackerMeta = null; };
  }, [enabled, onMarkRead, trackKey]);
}

/* ═══════════════════════════════════════════════════════════════════════
   useReadProgress — App-level per-collection read-cursor state (P7g)
   ═══════════════════════════════════════════════════════════════════════
   OWNS:
     - readItems state (Record<string, number> read COUNTS since
       2026-08-03 — legacy `true` values read as 1 via Number coercion
       and are never migrated in place; persisted via vot-state
       through usePersistedState)
     - VERSION_ID constant — currently "v1"; future format changes get
       their own version
     - getReadKey, isRead helpers (pure lookups)
     - markRead, unmarkRead (state mutators; markRead respects the
       markAsReadEnabled gate — when settings.markAsRead is false, we
       never ADD new marks, but existing ones survive)
     - clearAllProgress — wipe-all helper
     - clearReadForBook(bid) — selective wipe scoped to a single bookId
       (folded in from the inline `onClearBook` arrow at the consumer
       site so VERSION_ID stays internal to the hook)

   PARAMS:
     savedReadItems     hydrate from useSavedState's restored payload
     markAsReadEnabled  settings.markAsRead — the gate that controls
                        whether new marks get ADDED. Mirrored via a ref
                        so markRead's closure always sees the latest
                        value without recreating the function each
                        render.

   RETURNS: { readItems, isRead, markRead, unmarkRead, clearAllProgress,
              clearReadForBook }
            (setReadItems intentionally NOT returned — encapsulated.
             Consumers go through the named helpers or clearReadForBook.)

   STORAGE: localStorage 'vot-state' (via usePersistedState; readItems
            is one slot of the App-level saved state).

   WINDOW: none.

   KEY FORMAT: "v1:<bookOrVolumeId>:<chapterOrLetterId>"
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';

/**
 * App-level read-progress state. Owns readItems (the per-collection
 * cursor map) + the mark/unmark/clear helpers. Returns readItems for
 * consumers (sharedViewProps + the bookmarks sheet) but NOT setReadItems
 * — mutations go through the named helpers.
 *
 * @param {{
 *   savedReadItems: Record<string, number | true> | undefined,
 *   markAsReadEnabled: boolean
 * }} args
 * @returns {{
 *   readItems: Record<string, number | true>,
 *   isRead: (bid: string, cid: string | number) => boolean,
 *   markRead: (bid: string, cid: string | number, payload?: { words: number, activeMs: number }) => void,
 *   unmarkRead: (bid: string, cid: string | number) => void,
 *   clearAllProgress: () => void,
 *   clearReadForBook: (bid: string) => void,
 *   getReadKey: (bid: string, cid: string | number) => string
 * }}
 */
export function useReadProgress({ savedReadItems, markAsReadEnabled }) {
  const [readItems, setReadItems] = React.useState(savedReadItems || {});
  // Mirror the markAsRead gate so markRead's closure sees the latest
  // value without recreating the function each render.
  const enabledRef = useRefMirror(markAsReadEnabled);

  const VERSION_ID = 'v1';
  const getReadKey = (bid, cid) => `${VERSION_ID}:${bid}:${cid}`;
  const isRead = (bid, cid) => !!readItems[getReadKey(bid, cid)];

  const markRead = (bid, cid, payload) => {
    if (enabledRef.current === false) return;
    const key = getReadKey(bid, cid);
    const prev = readItems[key];
    // Count-valued since 2026-08-03: `true` (legacy) reads as 1 via
    // Number-coercion; every `!!readItems[key]` truthiness check is
    // unaffected. A detector-fired completion INCREMENTS (re-reads are
    // real data); a manual toggle only sets the first mark — tapping
    // "mark read" twice is a UI bounce, not a second read-through.
    if (payload) {
      setReadItems((p) => ({ ...p, [key]: (Number(p[key]) || 0) + 1 }));
      // The stats ledger records only DETECTOR-verified completions —
      // payload carries the measured words + visibility-honest time.
      // Manual toggles are a claim, not a measurement, and skip it.
      if (typeof ReadingStatsStore !== 'undefined' && ReadingStatsStore) {
        try {
          ReadingStatsStore.recordCompletion({
            key,
            words: payload.words,
            activeMs: payload.activeMs,
            wasReadBefore: !!prev,
          });
        } catch (e) { console.warn('reading-stats record failed', e); }
      }
      // Streak coherence (2026-08-03 UX walk): a VERIFIED completed read is
      // at least as strong a "read today" signal as the 20-second dwell
      // timer — a short letter completes in ~9s and must not leave the
      // streak claiming the user didn't read. Same-day repeats are
      // store-side no-ops; the dwell path still covers long partial
      // reading that never completes anything.
      if (typeof ReadingStreakStore !== 'undefined' && ReadingStreakStore) {
        try { ReadingStreakStore.recordReadingDay(Date.now()); }
        catch (e) { console.warn('reading-streak record failed', e); }
      }
    } else if (!prev) {
      setReadItems((p) => ({ ...p, [key]: 1 }));
    }
  };

  const unmarkRead = (bid, cid) => {
    const key = getReadKey(bid, cid);
    setReadItems((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const clearAllProgress = () => setReadItems({});

  // Folded in from the inline `onClearBook` arrow at the consumer site so
  // VERSION_ID stays internal to the hook.
  const clearReadForBook = (bid) => {
    setReadItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${VERSION_ID}:${bid}:`)) delete next[k]; });
      return next;
    });
  };

  // getReadKey is exported (2026-08-03) so routes can hand the SAME key to
  // the read tracker (readTrackKey) that markRead's stats record will use —
  // one key space, or the completion couldn't clear its own frontier.
  return { readItems, isRead, markRead, unmarkRead, clearAllProgress, clearReadForBook, getReadKey };
}
