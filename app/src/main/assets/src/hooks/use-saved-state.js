/* ═══════════════════════════════════════════════════════════════════════
   useSavedState — load + validate vot-state on mount
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.
   First mechanical hook extraction of P6 (App() decomposition).

   Reads localStorage['vot-state'] exactly once on mount (useMemo []),
   coerces stale screen values back to safe defaults, and hands the
   validated object to App() — which then distributes its fields
   (saved.theme, saved.tabs, saved.settings, saved.activeReadKey …) to
   useTabs / useSettings / useReadingDwell / App-local useState.

   OWNS:
     - the single-evaluation read + JSON.parse of localStorage['vot-state']
     - the parse-error fallback ({} on JSON.parse throw)

   DOES NOT OWN:
     - _validateTabState — the screen-coercion POLICY (13 rules that
       rewrite a no-longer-valid screen string to 'home' or its parent
       index). It is a pure EXPORTED helper colocated in this file, not a
       hook: useSavedState merely CALLS it — over the legacy top-level
       state AND each entry in s.tabs[] — so the same rules apply
       uniformly. Kept standalone so it can be unit-tested and reused
       independently of the hook.
     - the consumption / distribution of the returned object — App() owns
       which subsystem each field is routed to.

   PARAMS: none.

   RETURNS: the validated saved-state object (or {} on JSON.parse failure).

   STORAGE: reads localStorage['vot-state']; never writes — usePersistedState
            (P6k+1) owns the write side.

   WINDOW: none.

   Why a hook and not a plain function call?
     useMemo([]) gives a single-evaluation guarantee tied to the component
     lifecycle and documents intent ("read once on mount"). A plain
     function called during render would re-evaluate every render — same
     logical outcome, extra work.

   Test contract preserved exactly:
     - same screen-validation rules (no behavior change)
     - same parse-error fallback ({} on JSON.parse throw)
     - same single-pass evaluation (useMemo([]) → once per mount)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The persisted state shape (subset that the validator touches). Many
 * other fields are read by useSavedState's caller — they pass through
 * unchanged.
 *
 * @typedef {{
 *   screen?: string,
 *   chapterNum?: number | null,
 *   letterId?: string | null,
 *   studyId?: string | null,
 *   studyChapterId?: string | null,
 *   bookId?: string,
 *   genreId?: string,
 *   gardenPage?: number | null,
 *   tabs?: any[],
 *   [key: string]: any
 * }} SavedState
 */

/**
 * Coerce a stale screen value back to a safe default. 13 rules — each
 * rule rewrites a screen string that can't be honored without supporting
 * state (e.g. matthew-ch without a chapterNum) back to 'home' or the
 * appropriate index. Mutates `s` in place AND returns it for chaining.
 *
 * Applied to both the top-level legacy state object AND each tab in
 * s.tabs[], so the same rules govern multi-tab layouts.
 *
 * @param {SavedState} s
 * @returns {SavedState}
 */
export function _validateTabState(s) {
  if ((s.screen === "matthew-ch" || s.screen === "bible-ch") && s.chapterNum == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-letter$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "vot-letter" && !s.letterId) s.screen = "home";
  if (s.screen === "hm-letter" && !s.letterId) s.screen = "home";
  if (/^(wtlb-one-entry|wtlb-two-entry|blessed-entry|holy-days-entry)$/.test(s.screen) && !s.letterId) s.screen = "home";
  if (s.screen === "garden-view" && s.gardenPage == null) s.screen = "home";
  if (/^vot-(one|three|four|five|six|seven|timothy|flock|rebuke)-index$/.test(s.screen)) s.screen = "volumes-home";
  if ((s.screen === "matthew-idx" || s.screen === "bible-idx") && !s.bookId) s.screen = "home";
  if (s.screen === "search") s.screen = "home";
  if (s.screen === "scripture-genre" && !s.genreId) s.screen = "scriptures-home";
  if (s.screen === "bible-study-chapter" && (!s.studyId || !s.studyChapterId)) s.screen = "studies-home";
  if (s.screen === "bible-study-index" && !s.studyId) s.screen = "studies-home";
  // Journal screens require entryId which lives in local state (not tab
  // state), so they can't be reliably restored on reload. Bounce to hub.
  if (s.screen === "journal-viewer" || s.screen === "journal-editor") s.screen = "journal-home";
  return s;
}

import { StateStore } from '../stores/state-store.js';

/**
 * Read + validate vot-state exactly once on mount. Source-of-truth
 * pre-W2.3b was localStorage; post-W2.3b is StateStore (IDB-backed via
 * the W2.2 state machine). HydrationGate has already resolved by the
 * time this hook runs, so StateStore.get() returns the in-memory cache
 * synchronously. The legacy-LS-fallback path inside CachedStore handles
 * the migration boundary (first boot post-W2.3b: empty IDB →
 * StateStore reads vot-state from LS, seeds IDB, populates cache).
 *
 * Returns the validated state (with stale screens coerced via
 * _validateTabState) or {} when the store is empty. Caller distributes
 * the fields to the appropriate subsystems (useTabs / useSettings /
 * useReadingDwell / App-local useState).
 *
 * usePersistedState (P6k+1) owns the matching WRITE side via
 * StateStore.set().
 *
 * @returns {SavedState}
 */
export function useSavedState() {
  return React.useMemo(() => {
    try {
      const raw = StateStore.get();
      // Defensive copy — _validateTabState mutates in place, and the
      // live store cache reference shouldn't be silently rewritten by
      // a read.
      const s = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
      if (Array.isArray(s.tabs)) s.tabs = s.tabs.map((t) => Object.assign({}, t));
      // E4: crash-loop recovery. The root ErrorBoundary sets this one-shot flag
      // when a screen crashes repeatedly; the crashing screen is the persisted
      // one, so coerce it (and every tab) to home BEFORE validation. The next
      // durable write (usePersistedState) then persists the safe shape, ending
      // the loop. Wrapped — sessionStorage may be unavailable.
      try {
        if (sessionStorage.getItem('vot-crash-recover')) {
          sessionStorage.removeItem('vot-crash-recover');
          sessionStorage.removeItem('vot-crash-count');
          sessionStorage.removeItem('vot-crash-first-ms');
          s.screen = 'home';
          if (Array.isArray(s.tabs)) s.tabs.forEach((t) => { t.screen = 'home'; });
        }
      } catch (_e) { /* sessionStorage unavailable — nothing to recover */ }
      _validateTabState(s);
      if (Array.isArray(s.tabs)) s.tabs.forEach(_validateTabState);
      return s;
    } catch (_e) { return {}; }
  }, []);
}
