/* ═══════════════════════════════════════════════════════════════════════
   usePersistedState — the vot-state localStorage persistence sink (P6k+1)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   One effect: serialize the 8-value app-persistence union to
   localStorage['vot-state'] whenever any of them changes. It is the last
   thing App() composes.

   OWNS:
     - the single persist useEffect (deps = all 8 params) that writes the
       vot-state JSON. Owns NO state of its own — it is a pure SINK.

   DOES NOT OWN:
     - any of the 8 values it writes — they originate in useTabs /
       useReadingDwell / useSettings / App()-local useState (see PARAMS).
       This is a COMPOSITION-LEVEL SINK: it writes the union and is
       deliberately provenance-agnostic.
     - the READ side — useSavedState (P6a) loads vot-state on mount.
     - body-class + AndroidBridge mirroring — split out into useSettings
       (P6g); this hook is ONLY the localStorage write.

   PARAMS: { tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
             activeReadKey, settings, readItems } — 4 are hook returns,
     4 are still App-local useState:
       tabs, activeTabIdx   ← useTabs (P6k)
       activeReadKey        ← useReadingDwell (P6f)
       settings             ← useSettings (P6g)
       theme, lastReadChapters, lastReadLetterMap, readItems
                            ← still plain App() useState (no cluster owns
                              them; a future useAppGlobals hook could, but
                              that is not P6). Passed in exactly like the
                              hook-return four — the sink does not care
                              about provenance.

   RETURNS: nothing — pure side-effect hook.

   STORAGE: localStorage 'vot-state' (JSON) — the WRITE side.
            useSavedState owns the READ side.

   WINDOW: none.
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
