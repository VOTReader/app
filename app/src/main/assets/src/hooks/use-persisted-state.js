/* ═══════════════════════════════════════════════════════════════════════
   usePersistedState — the vot-state persistence sink (P6k+1), now with
   write COALESCING at the composition level.
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   One effect: serialize the 8-value app-persistence union to
   StateStore (IDB-backed; the lsShim mirrors theme + fontStyle +
   fontScale to localStorage for the boot script) whenever any of them
   changes. It is the last thing App() composes.

   ── WHY THE DEBOUNCE (per-keystroke full-write defect) ──────────────
   The chain SearchScreen onChange → setSearchQuery → tabField
   ('searchQuery') → updateActiveTab (new tabs array) → THIS effect →
   StateStore.set → CachedStore._save used to run a FULL JSON.stringify
   of the entire vot-state union + an IDB put + an LS shim write PER
   KEYSTROKE, with no debounce or coalescing anywhere. The coalescing
   lives HERE, at the sink, and NOT inside CachedStore._save, by
   deliberate design:

     - CachedStore._save is the shared write path for ALL 11 IDB-backed
       stores, including the "precious" crossTabMerge stores whose
       _saveMerged serializes a read-merge-write under navigator.locks
       and whose _lastWrite / whenSaved() durability contract the
       import path awaits before reloading. Deferring writes there
       would change cross-tab merge ordering and break the
       "every mutation initiates a write now" assumption — a blast
       radius covering every store and both documented data-loss
       vectors.
     - StateStore's op granularity is full-replacement set() with
       last-write-wins rebase semantics, and its only live reader is
       useSavedState at boot (everything else reads via React state).
       Coalescing N intermediate unions into the latest one therefore
       loses NOTHING — the intermediate unions were never observable.

   ── THE CONTRACT ────────────────────────────────────────────────────
     1. TRAILING-EDGE DEBOUNCE (PERSIST_DEBOUNCE_MS): rapid unions
        inside the window coalesce to ONE StateStore.set carrying the
        LATEST union. Each new union resets the window.
     2. GUARANTEED FLUSH — a pending union is written synchronously on
        visibilitychange→hidden, pagehide, beforeunload, and unmount.
        No union that reached this hook is ever dropped on tab
        background/close or App teardown. Flush clears the pending
        timer, so no duplicate trailing write follows.
     3. BOOT-CRITICAL IMMEDIACY: index.html:73 reads the LS shim
        SYNCHRONOUSLY pre-mount (theme class, @font-face toggle,
        --font-scale var). A change to theme / settings.fontStyle /
        settings.fontScale therefore BYPASSES the debounce and writes
        immediately, so a quick reload after a theme change can never
        reintroduce a wrong-theme FOUC. The immediate write carries the
        full latest union, superseding (not dropping) any pending
        debounced union.
     4. The initial mount write stays immediate (unchanged boot
        semantics: during pre-hydration 'pending', StateStore.set
        simply queues the op for rebase).

   OWNS:
     - the persist effect(s) that write the vot-state union, including
       the debounce timer, the pending-union ref, and the
       flush-on-hide/close/unmount listeners. Owns NO state of its own
       — it is a pure SINK.

   DOES NOT OWN:
     - any of the 8 values it writes — they originate in useTabs /
       useReadingDwell / useSettings / App()-local useState (see PARAMS).
       This is a COMPOSITION-LEVEL SINK: it writes the union and is
       deliberately provenance-agnostic.
     - the READ side — useSavedState (P6a) loads vot-state on mount.
     - body-class + AndroidBridge mirroring — split out into useSettings
       (P6g); this hook is ONLY the persistence write.
     - durability below StateStore.set — hydration rebase, write retry,
       and the cross-tab merge stay in cached-store.js, untouched.

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

   STORAGE: IDB 'vot-state' via StateStore (+ reduced LS shim) — the
            WRITE side. useSavedState owns the READ side.

   WINDOW: PERSIST_DEBOUNCE_MS trailing debounce (below); flush listeners
           on window (pagehide, beforeunload) + document
           (visibilitychange) for the life of App().
   ═══════════════════════════════════════════════════════════════════════ */

import { StateStore } from '../stores/state-store.js';

/**
 * Trailing-edge debounce window for non-boot-critical unions. 250ms is
 * below human pause-typing perception and far above the keystroke
 * inter-arrival time, so continuous typing coalesces to ~1 write per
 * pause instead of 1 per character.
 */
const PERSIST_DEBOUNCE_MS = 250;

/**
 * Extract the fields the boot script (index.html:73) reads synchronously
 * from the LS shim pre-mount. Changes to these must NEVER sit in the
 * debounce window — see contract item 3 in the header.
 * @param {any} s
 * @returns {{ theme: any, fontStyle: any, fontScale: any }}
 */
function _bootFields(s) {
  return {
    theme: s && s.theme,
    fontStyle: s && s.settings && s.settings.fontStyle,
    fontScale: s && s.settings && s.settings.fontScale,
  };
}

/**
 * Composition-level persistence WRITE sink for `vot-state`. Persists
 * the 8-value union whenever any of them changes, coalescing rapid
 * unions (per-keystroke tabs churn) into a single trailing write while
 * guaranteeing flush-on-hide/close/unmount and immediate writes for
 * boot-script-critical fields. Owns no state — pure sink, deliberately
 * provenance-agnostic. The matching READ side lives in useSavedState
 * (P6a).
 *
 * @param {{
 *   tabs: any[],
 *   activeTabIdx: number,
 *   theme: string,
 *   lastReadChapters: any,
 *   lastReadLetterMap: any,
 *   activeReadKey: string | null,
 *   settings: any,
 *   readItems: any
 * }} args
 * @returns {void}
 */
export function usePersistedState({
  tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap,
  activeReadKey, settings, readItems,
}) {
  // Latest union awaiting a debounced write (null = nothing pending).
  const pendingRef = React.useRef(null);
  // Latest union actually handed to StateStore — the baseline for the
  // boot-critical change comparison.
  const writtenRef = React.useRef(null);
  // The single pending debounce timer (null = none).
  const timerRef = React.useRef(null);
  // Indirection so the debounce effect's timer and the mount effect's
  // listeners share ONE flush implementation without a stale closure.
  const flushRef = React.useRef(null);

  // ── Mount-only: install the guaranteed-flush listeners + unmount flush.
  React.useEffect(() => {
    const flush = () => {
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
      const pending = pendingRef.current;
      if (pending == null) return;               // nothing coalesced → no-op
      pendingRef.current = null;
      writtenRef.current = pending;
      // W2.3b: persistence routes through StateStore (IDB-backed). The
      // store's lsShim hook continues to write the reduced theme +
      // fontStyle + fontScale copy to localStorage for the boot-script
      // sync read at index.html:73 — no boot FOUC.
      StateStore.set(pending);
    };
    flushRef.current = flush;
    const onVisibility = () => {
      // Only 'hidden' flushes — a return to 'visible' must not cut a
      // still-accumulating debounce window short.
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      flushRef.current = null;
      flush();   // App teardown never strands a pending union
    };
  }, []);

  // ── The persist effect: schedule / supersede / write-immediately.
  React.useEffect(() => {
    const union = {
      tabs, activeTabIdx,
      theme, lastReadChapters, lastReadLetterMap,
      activeReadKey, settings, readItems,
    };
    const prev = writtenRef.current;
    const boot = _bootFields(union);
    const prevBoot = _bootFields(prev);
    const bootCritical = prev === null ||
      boot.theme !== prevBoot.theme ||
      boot.fontStyle !== prevBoot.fontStyle ||
      boot.fontScale !== prevBoot.fontScale;

    if (bootCritical) {
      // Contract 3 + 4: boot-script fields (and the mount write) go
      // straight through — the LS shim must reflect a theme change
      // before any quick reload, and hydration expects the initial
      // union queued without delay. Carries the FULL latest union, so
      // any pending debounced union is superseded, not dropped.
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
      pendingRef.current = null;
      writtenRef.current = union;
      StateStore.set(union);
      return;
    }

    // Contract 1: trailing-edge debounce. Keep only the LATEST union —
    // full-replacement semantics make the intermediate ones dead on
    // arrival (no live reader below React state).
    pendingRef.current = union;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const flush = flushRef.current;
      if (flush) flush();
    }, PERSIST_DEBOUNCE_MS);
  }, [tabs, activeTabIdx, theme, lastReadChapters, lastReadLetterMap, activeReadKey, settings, readItems]);
}
