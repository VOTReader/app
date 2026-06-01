/* ═══════════════════════════════════════════════════════════════════════
   useHistorySync — push browser history on every meaningful navigation
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   THE PROBLEM W1.5(d) NEEDS THIS TO SOLVE:
     Today the app navigates via React state only — no browser history
     entries are created. popstate would never fire because there's
     nothing to pop. The PWA's browser back button becomes inert
     (Chrome's back navigates the browser tab; with empty history that
     means "exit the PWA," silently bypassing the app's nav logic).

   FIX:
     Watch a tuple representing the per-active-tab nav state. On every
     change, push an empty-state history entry. The internal nav stack
     stays the source of truth; the browser history is a parallel
     "events to consume" log that popstate dispatches against.

   OPTION B PUSHSTATE (locked in PLAN.txt + [[root-of-history-pwa]]):
     The state object passed to pushState is empty ({}). popstate
     handlers in W1.5(d) do NOT try to restore state from event.state
     — they call handleAndroidBack and let the app's internal nav stack
     do the work. Trade-off: browser forward-button is dead (no state
     to forward into). Matches Android behavior (no forward button on
     phones either). Avoids a second source of truth that could
     disagree with the in-memory tab state.

   OWNS:
     - A useRef-backed init/idempotency check so the FIRST mount (or
       StrictMode's mount-cleanup-mount cycle) doesn't push a redundant
       entry on top of the bootstrap state.
     - The window.__historyReady flag, set after the first mount-skip,
       used by W1.5(d)'s popstate listener to ignore Firefox's
       popstate-on-load (Firefox fires popstate on initial page load
       per older HTML5 spec; Chrome doesn't). Without this guard,
       handleAndroidBack would fire at boot on Firefox.
     - A module-level _suppressNextPush flag + suppressNextHistoryPush()
       helper for use by W1.5(c)/(d). Set the flag BEFORE invoking a
       back-induced navigation (Escape or popstate routing through
       handleAndroidBack); the next effect run consumes and clears
       it without pushing. Prevents the "back-button doubles back-stack"
       bug where popstate consumes an entry, handleAndroidBack mutates
       state, the effect fires, and a new pushState restores the
       entry — back navigation now requires two presses.

   DOES NOT OWN:
     - The popstate listener (W1.5(d), in useAndroidBack).
     - The Escape key listener (W1.5(c), in useAndroidBack).
     - The root-of-stack double-tap exit handling (W1.5(d)).
     - Replacement-entry pushes performed by (d)'s root-exit branch —
       those are explicit, not nav-key-triggered.

   PARAMS:
     A nav-key object. Every field is a per-tab nav state slot. When
     any field changes, the effect re-runs and may push. Add new fields
     here ONLY for screen-level transitions; do NOT add sub-screen
     state (tab switches within a screen, scroll position, etc.) or
     the back stack will bloat (rapid taps = many entries = many
     back-presses to return).

   PLATFORM GUARD:
     Skips entirely on Android (PlatformBridge.isAndroid). The
     Android back button is handled by Kotlin's MainActivity routing
     through window.handleAndroidBack; browser history would be
     pointless overhead and could interfere with WebView lifecycle.

   KNOWN UX ROUGH EDGES (documented in PLAN.txt):
     - Rapid navigation = inflated back-stack. Tapping through 10
       screens fast = 10 history entries = 10 back-presses to return.
       Acceptable for W1.5; future polish could replaceState for
       sub-screen state and pushState for meaningful jumps.
     - Forward button is dead under Option B (empty state objects).
       Matches Android. Polish phase could land Option A if anyone
       misses it.
   ═══════════════════════════════════════════════════════════════════════ */

import { disarm as _disarmRootExit } from '../utils/root-exit-toast.js';
import { PlatformBridge } from '../utils/platform-bridge.js';

// Module-level suppress flag — set by suppressNextHistoryPush(), consumed
// by the next effect run. Persists across renders intentionally; the
// effect always reads-and-clears in one step so a stale flag can't strand.
let _suppressNextPush = false;

/**
 * Suppress the NEXT pushState that would otherwise fire from the
 * useHistorySync effect. Call this immediately BEFORE invoking a back-
 * induced navigation (handleAndroidBack from W1.5(c)'s Escape handler
 * or W1.5(d)'s popstate handler). Without this guard, the effect run
 * triggered by the resulting state mutation would re-push a history
 * entry, restoring the user's back action as forward — back button
 * would require two presses per nav step.
 *
 * One-shot: cleared on consumption (read-and-clear in the effect).
 * Idempotent: multiple calls in the same render are equivalent to one.
 *
 * STRANDING GUARD: if handleAndroidBack returns "false" (root of stack
 * — no state change → effect never fires → flag stays set), the caller
 * MUST call clearSuppressNextHistoryPush() to avoid stranding the flag
 * onto the next legitimate user navigation. (c)/(d) handlers handle
 * this in their "false" branches; the root-of-stack double-tap flow
 * does its own explicit pushState anyway.
 *
 * @returns {void}
 */
export function suppressNextHistoryPush() {
  _suppressNextPush = true;
}

/**
 * Clear the pending pushState suppression. Use ONLY when you called
 * suppressNextHistoryPush() but the resulting handleAndroidBack
 * returned "false" (no state change → effect never fires → flag would
 * strand). See the stranding-guard note on suppressNextHistoryPush.
 *
 * @returns {void}
 */
export function clearSuppressNextHistoryPush() {
  _suppressNextPush = false;
}

/**
 * Sync the per-active-tab nav state into browser history. Pushes an
 * empty-state entry every time the nav-key tuple changes (with the
 * suppression carve-out above for back-induced navigations).
 *
 * Skips on Android (PlatformBridge.isAndroid). Skips on the very
 * first mount so the bootstrap state doesn't create a redundant
 * entry. Sets window.__historyReady after first-mount-skip for the
 * Firefox popstate-on-load guard in W1.5(d).
 *
 * Per [[root-of-history-pwa]] Option B: state object is always {}.
 * popstate handlers do not try to restore from event.state.
 *
 * @param {{
 *   screen: any,
 *   bookId: any,
 *   chapterNum: any,
 *   letterId: any,
 *   studyId: any,
 *   studyChapterId: any,
 *   genreId: any,
 *   gardenPage: any,
 * }} navKey
 * @returns {void}
 */
export function useHistorySync({
  screen, bookId, chapterNum, letterId, studyId, studyChapterId, genreId, gardenPage,
}) {
  // Track the last-serialized nav-key. Compare-and-skip on equality so
  // React StrictMode's setup-cleanup-setup-on-mount cycle doesn't
  // produce a spurious push on the second invocation (same deps, but
  // useEffect still re-runs because mount is mount). Also serves as
  // the initial-mount guard: lastKeyRef.current === null on first run.
  const lastKeyRef = React.useRef(null);
  React.useEffect(() => {
    // Android: Kotlin MainActivity handles back via window.handleAndroidBack.
    // No browser back button to consume history entries; pushState would
    // be pure overhead. (U14: via the bridge, not a direct AndroidBridge probe.)
    if (PlatformBridge.isAndroid) return;
    if (typeof history === 'undefined' || typeof history.pushState !== 'function') return;

    const key = `${screen}|${bookId}|${chapterNum}|${letterId}|${studyId}|${studyChapterId}|${genreId}|${gardenPage}`;

    if (lastKeyRef.current === null) {
      // Initial mount. Don't push — the bootstrap state is already the
      // current browser entry. Record the key + flip __historyReady so
      // W1.5(d)'s popstate listener can ignore Firefox's spurious
      // popstate-on-load (older HTML5 spec interpretation).
      lastKeyRef.current = key;
      window.__historyReady = true;
      return;
    }

    if (lastKeyRef.current === key) {
      // Same key as last commit — StrictMode re-invocation, or a
      // re-render that didn't actually change the watched deps. No-op.
      return;
    }

    lastKeyRef.current = key;

    if (_suppressNextPush) {
      // This nav was triggered by Escape or popstate via handleAndroidBack
      // (W1.5(c)/(d)). Don't double-push or back would require N+1 presses.
      _suppressNextPush = false;
      return;
    }

    // Forward navigation about to push → disarm any pending root-exit
    // toast per the TIMER-CLEAR-ON-FORWARD-NAV invariant
    // ([[root-of-history-pwa]]). Without this, a user who pressed back
    // at root (arming the timer), then navigated forward via a tile,
    // then returned to root, would silently exit on a single back press
    // because the earlier timer was still armed.
    _disarmRootExit();

    try {
      history.pushState({}, '', '');
    } catch (_e) {
      // Iframe sandbox / unusual hosting may block pushState. Non-fatal:
      // the app continues to work, just without browser-back support
      // (handleAndroidBack still routes via the in-app back affordances).
    }
  }, [screen, bookId, chapterNum, letterId, studyId, studyChapterId, genreId, gardenPage]);
}
