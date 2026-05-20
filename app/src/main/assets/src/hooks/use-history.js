/* ═══════════════════════════════════════════════════════════════════════
   useHistory — app-global reading-history state + mutators
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js via tools/build.py.

   OWNS:
     - readHistory state (persisted to localStorage['vot-history'])
     - addToHistory(entry)       gated by historyEnabled
     - clearHistory()
     - pruneHistoryDay(y, m, d)  dedupes within one calendar day

   DOES NOT OWN:
     - The auto-track useEffect that decides WHEN to call addToHistory
       (it reads screen/bookId/chapterNum/letterId/studyId/studyChapterId
       and App-local helpers _findLetter / getStudyById / getStudyChapter,
       so it stays in App() right next to its triggers). The hook is a
       state container + API; the effect is policy that lives at the
       call site.

   PARAMS:
     historyEnabled — current value of settings.historyEnabled. Read
                      through a ref so the addToHistory closure always
                      sees the latest setting without needing a fresh
                      closure each render.

   RETURNS: { readHistory, addToHistory, clearHistory, pruneHistoryDay }

   STORAGE: localStorage 'vot-history' (JSON array of entries, newest
            first, cap 2000). The 2000 cap is enforced on every add.

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

function useHistory(historyEnabled) {
  const [readHistory, setReadHistory] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('vot-history') || '[]'); }
    catch { return []; }
  });
  // Mirror so addToHistory's closure sees the latest gate value without
  // having to re-create the function each render or accept the param
  // explicitly at each call site.
  const enabledRef = useRefMirror(historyEnabled);

  const addToHistory = (entry) => {
    // Don't record anything while History is disabled. Existing entries
    // are preserved (user can re-enable and still have their past trail).
    if (enabledRef.current === false) return;
    const key = entry.type === 'letter'
      ? 'lt:' + entry.letterId
      : 'ch:' + entry.bookId + ':' + entry.chapterNum;
    setReadHistory((prev) => {
      // No dedup: every visit is recorded. User prunes per-day manually.
      const next = [{ ...entry, key, ts: Date.now() }, ...prev].slice(0, 2000);
      localStorage.setItem('vot-history', JSON.stringify(next));
      return next;
    });
  };

  const clearHistory = () => {
    setReadHistory([]);
    localStorage.setItem('vot-history', '[]');
  };

  const pruneHistoryDay = (year, month, day) => {
    const dayStart = new Date(year, month, day).getTime();
    const dayEnd = new Date(year, month, day + 1).getTime();
    setReadHistory((prev) => {
      // History is newest-first, so the first occurrence IS the most-recent visit.
      const seen = new Set();
      const out = [];
      for (const e of prev) {
        const inDay = e.ts >= dayStart && e.ts < dayEnd;
        if (inDay) {
          if (seen.has(e.key)) continue;
          seen.add(e.key);
        }
        out.push(e);
      }
      localStorage.setItem('vot-history', JSON.stringify(out));
      return out;
    });
  };

  return { readHistory, addToHistory, clearHistory, pruneHistoryDay };
}
