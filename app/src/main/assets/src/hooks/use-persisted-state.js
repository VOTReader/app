/* ═══════════════════════════════════════════════════════════════════════
   usePersistedState — the vot-state localStorage persistence sink (P6k+1)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   One effect: serialize the 8-value app-persistence union to
   localStorage['vot-state'] whenever any of them changes. This is a
   COMPOSITION-LEVEL SINK — it does not own any state; it writes the union
   of values that originate in several different places. It is the last
   thing App() composes.

   THE 8 PARAMS — 4 are hook returns, 4 are still App-local useState:
     tabs, activeTabIdx   ← useTabs (P6k)
     activeReadKey        ← useReadingDwell (P6f)
     settings             ← useSettings (P6g)
     theme, lastReadChapters, lastReadLetterMap, readItems
                          ← still plain App() useState (no cluster owns
                            them; a future useAppGlobals hook could, but
                            that is not P6). They are passed in as params
                            exactly like the hook-return four — the sink
                            does not care about provenance.

   Body-class + AndroidBridge mirroring was split out into useSettings
   (P6g); this hook is ONLY the localStorage write.

   PARAMS: { tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
             activeReadKey, settings, readItems }
   RETURNS: nothing.
   STORAGE: localStorage 'vot-state' (JSON).
   ═══════════════════════════════════════════════════════════════════════ */

export function usePersistedState({
  tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
  activeReadKey, settings, readItems,
}) {
  React.useEffect(() => {
    try {
      localStorage.setItem("vot-state", JSON.stringify({
        tabs, activeTabIdx,
        theme, lastReadChapters, lastReadLetterMap,
        activeReadKey, settings, readItems
      }));
    } catch (e) { console.warn('localStorage write failed for vot-state', e); }
  }, [tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap, activeReadKey, settings, readItems]);
}
