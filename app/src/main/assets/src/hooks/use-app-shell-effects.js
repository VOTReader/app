/* ═══════════════════════════════════════════════════════════════════════
   useAppShellEffects — leftover AppShell-level effects + small state (P7k)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Closes Phase 1 of the App() decomposition. Bundles two small
   concerns that didn't fit anywhere else:

     1. The first-run welcome modal state + dismissWelcome handler.
        Reads/writes 'vot-welcomed' + 'vot-about-seen' localStorage
        keys. The dismissal can optionally redirect to the About
        screen on FIRST run (subsequent runs go straight to home).

     2. The online-status ping check. Polls a known URL when the
        welcome modal is showing (so the splash can render an
        "offline" notice when relevant). The fetch uses 'no-cors'
        so any 2xx OR opaque response counts as online.

   (W7.3 removed the former window.__bumpHlTick bridge — the DOM
   annotation layer now re-applies off store subscriptions in
   useDomAnnotationSync, so no inline component pokes a global counter.)

   OWNS:
     - showWelcome state + setShowWelcome
     - isOnline state
     - the online-check useEffect (deps on [showWelcome])
     - dismissWelcome — writes 'vot-welcomed', clears state, optionally
       routes to About on first run

   DOES NOT OWN:
     - theme state — App-local useState; consumed widely in the render
       tree and not bundled here (just state, no effect).
     - The Welcome modal render — render tree.

   PARAMS:
     setNavOrigin     For dismissWelcome's About-redirect path. Snapshots
                      home as the origin so back from About goes home.
     setScreen        For dismissWelcome's About-redirect.

   RETURNS: { showWelcome, setShowWelcome, isOnline, dismissWelcome }

   STORAGE:
     - 'vot-welcomed'   '1' once dismissed; absence triggers showWelcome
                        on next boot.
     - 'vot-about-seen' Read (not written) by dismissWelcome to decide
                        whether to redirect to About on first dismissal.
   ═══════════════════════════════════════════════════════════════════════ */

import { WelcomedFlagStore, AboutSeenFlagStore } from '../stores/app-flag-stores.js';

/**
 * @param {{
 *   setNavOrigin: (v: any) => void,
 *   setScreen: (v: any) => void
 * }} args
 * @returns {{
 *   showWelcome: boolean,
 *   setShowWelcome: (v: any) => void,
 *   isOnline: boolean,
 *   dismissWelcome: () => void
 * }}
 */
export function useAppShellEffects({ setNavOrigin, setScreen }) {
  // First-run welcome state. WelcomedFlagStore is IDB-backed (W2.3b);
  // HydrationGate has already resolved by the time this hook runs, so
  // the read is sync from the in-memory cache.
  const [showWelcome, setShowWelcome] = React.useState(() => !WelcomedFlagStore.is());

  // Online-status ping. Re-runs when showWelcome flips (so the splash
  // gets a fresh check at dismissal time; non-welcome paths don't poll).
  const [isOnline, setIsOnline] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch('https://www.thevolumesoftruth.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' }).
        then(() => { if (!cancelled) setIsOnline(true); }).
        catch(() => { if (!cancelled) setIsOnline(false); });
    };
    check();
    return () => { cancelled = true; };
  }, [showWelcome]);

  const dismissWelcome = () => {
    WelcomedFlagStore.set();
    setShowWelcome(false);
    // First-time users see the About intro right after the splash. After
    // CONTINUE marks the about-seen flag, this path becomes a no-op and
    // the splash just dismisses straight to home on subsequent uses.
    if (!AboutSeenFlagStore.is()) {
      setNavOrigin({ screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
      setScreen('about');
    }
  };

  return { showWelcome, setShowWelcome, isOnline, dismissWelcome };
}
