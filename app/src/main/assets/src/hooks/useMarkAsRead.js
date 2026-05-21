/* ═══════════════════════════════════════════════════════════════════════
   useMarkAsRead — shared hook for the mark-as-read window bridge
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.
   First custom hook extracted (the P6 warmup — proved the hook-extraction
   pipeline on the smallest isolated hook before App() decomposition began).

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

export function useMarkAsRead(enabled, onMarkRead) {
  React.useEffect(() => {
    if (!enabled) return;
    window.__onReadingComplete = onMarkRead;
    return () => { window.__onReadingComplete = null; };
  }, [enabled, onMarkRead]);
}
