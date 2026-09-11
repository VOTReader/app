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
     5. EXPORT-TAP RACE CLOSER: buildV3Manifest / buildExportPayload
        read vot-state STRAIGHT FROM IDB after a whenSaved() barrier —
        but a union sitting in this debounce window has NOT initiated a
        StateStore.set, so whenSaved() has nothing to await and the
        change would be missing from the ONLY backup. The flush is
        therefore published on window.__flushPersistState for the life
        of App(); SettingsScreen calls it synchronously before building
        the manifest, and the existing whenSaved() barrier then awaits
        the flushed write. A window bridge (not a module-level export)
        because esbuild compiles bundle-b (this hook) and bundle-d
        (SettingsScreen) as separate IIFEs — each bundle would get its
        own copy of any module-scope registration, exactly the gap
        nav-handoff.js documents. No-op when nothing is pending; clears
        the pending timer so no duplicate trailing write follows.
     6. THE UPDATE RELOAD (2026-09-11): sw-register fires
        `vot:before-update-reload` one call before location.reload(), and
        useScrollMemory answers with __flushPersistState(patch, { reload:
        true }) — the live scroll record folded into the latest union.
        StateStore.set is asynchronous by construction (a Web Lock, an IDB
        read, the 3-way merge, then the put) and a document that is one
        call from reload() is not owed its completion: a self-initiated
        reload may abort the transaction, and a restore built on the
        browser finishing it during unload is a manufactured survivor
        (Orchestrator's ruling, 2026-09-11). The walk's boot-time read has
        seen that put land 12 of 12 times on one machine; that is a fact
        about one machine, which is exactly why nothing is built on it.
        So the reload flush ALSO writes the union to sessionStorage
        (RESUME_STATE_KEY, synchronous, same tab only) and the next boot
        takes that record FIRST — useSavedState → takeResumeState() —
        applies it through the same validation as the store, and clears
        it, so a second boot never replays it; the mount write (item 4)
        then makes it durable. IDB stays the path for every other write;
        the record is a two-minute bridge across one self-reload. A flush
        that must survive a reload uses a synchronous store; IDB is never
        that store.

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
           (visibilitychange) for the life of App(). Publishes
           window.__flushPersistState (contract 5) for the export path.
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
 * The update reload's record (header item 6): `{ at, state }` in sessionStorage,
 * written by flush(patch, { reload: true }) and consumed once by takeResumeState().
 * Same tab only, by sessionStorage's nature — which is the tab that reloads.
 */
export const RESUME_STATE_KEY = 'vot-state-resume-after-update';
/** Older than this and the record is not from the reload that just happened. */
export const RESUME_STATE_MAX_AGE_MS = 120000;

/**
 * Take the update reload's record: the state it carries, or null when there is
 * none, it is malformed, undated, stale, or not an object. Whatever the answer,
 * the key is cleared — a record is read by exactly one boot. `getItem` returning
 * null is tested for explicitly: JSON.parse(null) is null too, and a null must
 * never be able to impersonate a state.
 * @returns {Record<string, any> | null}
 */
export function takeResumeState() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(RESUME_STATE_KEY);
    if (raw != null) sessionStorage.removeItem(RESUME_STATE_KEY);
  } catch (_e) { return null; }                   // sessionStorage unavailable
  if (raw == null) return null;
  let rec;
  try { rec = JSON.parse(raw); } catch (_e) { return null; }
  if (!rec || typeof rec !== 'object' || typeof rec.at !== 'number') return null;
  if (Date.now() - rec.at > RESUME_STATE_MAX_AGE_MS) return null;
  const s = rec.state;
  return s && typeof s === 'object' ? s : null;
}

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
  // The last union rendered, written or still pending — the base a patched
  // flush (the update reload) applies to.
  const latestRef = React.useRef(null);

  // ── Mount-only: install the guaranteed-flush listeners + unmount flush.
  React.useEffect(() => {
    /* `patch` is the update reload's door (sw-register's `vot:before-update-reload`):
       a function applied to the LATEST union — pending or already written — and
       written at once. useScrollMemory folds the live scroller position in this
       way, because a state update at that instant would need a render the
       document will never get before reload(). Without a patch the old contract
       holds: nothing pending, nothing written.
       `opts.reload` (header item 6) is the caller saying "this document is about
       to reload": the union ALSO goes to sessionStorage, synchronously, because the
       StateStore.set below is asynchronous and may never land. Explicit, not
       inferred from the patch — a default must not be able to impersonate a
       choice. A sessionStorage that throws (quota, unavailable) must not stop the
       store write or the reload behind it. */
    const flush = (patch, opts) => {
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
      const pending = pendingRef.current;
      const base = pending != null ? pending : (typeof patch === 'function' ? latestRef.current : null);
      if (base == null) return;                  // nothing coalesced → no-op
      const union = typeof patch === 'function' ? patch(base) : base;
      pendingRef.current = null;
      writtenRef.current = union;
      latestRef.current = union;
      if (opts && opts.reload === true) {
        try { sessionStorage.setItem(RESUME_STATE_KEY, JSON.stringify({ at: Date.now(), state: union })); }
        catch (_e) { /* the IDB write below is still made; the reload still happens */ }
      }
      // W2.3b: persistence routes through StateStore (IDB-backed). The
      // store's lsShim hook continues to write the reduced theme +
      // fontStyle + fontScale copy to localStorage for the boot-script
      // sync read at index.html:73 — no boot FOUC.
      StateStore.set(union);
    };
    flushRef.current = flush;
    // Contract 5: publish the SAME flush for the export path (see header).
    // SettingsScreen calls window.__flushPersistState() synchronously before
    // buildV3Manifest / buildExportPayload, so a union still inside the
    // debounce window is written BEFORE the manifest's whenSaved() barrier
    // + IDB read. Registered (not stubbed in vitest.setup) because this hook
    // is the sole owner; callers guard with typeof === 'function'.
    window.__flushPersistState = flush;
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
      // Only clear the bridge if it's still mine (the guarded-cleanup
      // pattern) — a racing second registration must not be clobbered.
      if (window.__flushPersistState === flush) window.__flushPersistState = null;
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
    latestRef.current = union;
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
