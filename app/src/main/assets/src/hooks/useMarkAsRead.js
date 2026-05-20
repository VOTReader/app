/* ═══════════════════════════════════════════════════════════════════════
   useMarkAsRead — shared hook for mark-as-read window bridge
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   First custom hook extracted from the inline pre-App scope — serves as
   the P6 warmup, proving the hook-extraction pipeline on the smallest
   isolated hook. App() will follow once P6 begins.

   Wires `window.__onReadingComplete` to a callback while `enabled` is
   true; clears the bridge when the consumer unmounts or `enabled` flips
   to false. Called from each reading-view (LetterView, WtlbEntryView,
   BibleChapterView, ChapterView).
   ═══════════════════════════════════════════════════════════════════════ */

function useMarkAsRead(enabled, onMarkRead) {
  React.useEffect(() => {
    if (!enabled) return;
    window.__onReadingComplete = onMarkRead;
    return () => { window.__onReadingComplete = null; };
  }, [enabled, onMarkRead]);
}
