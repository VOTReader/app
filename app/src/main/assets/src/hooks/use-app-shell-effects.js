/* ═══════════════════════════════════════════════════════════════════════
   useAppShellEffects — leftover AppShell-level effects + small state (P7k)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Closes Phase 1 of the App() decomposition (12 of 12 concerns out).
   Bundles three small concerns that didn't fit anywhere else:

     1. The window.__bumpHlTick bridge effect — a lightweight escape
        hatch for inline components (e.g. the chapter bookmark button)
        to trigger a hlTick bump without prop-drilling. Mount-only.

     2. The first-run welcome modal state + dismissWelcome handler.
        Reads/writes 'vot-welcomed' + 'vot-about-seen' localStorage
        keys. The dismissal can optionally redirect to the About
        screen on FIRST run (subsequent runs go straight to home).

     3. The online-status ping check. Polls a known URL when the
        welcome modal is showing (so the splash can render an
        "offline" notice when relevant). The fetch uses 'no-cors'
        so any 2xx OR opaque response counts as online.

   OWNS:
     - __bumpHlTick bridge useEffect (mount-only)
     - showWelcome state + setShowWelcome
     - isOnline state
     - the online-check useEffect (deps on [showWelcome])
     - dismissWelcome — writes 'vot-welcomed', clears state, optionally
       routes to About on first run

   DOES NOT OWN:
     - hlTick itself — App-local useState; passed via setHlTick.
     - theme state — App-local useState; consumed widely in the render
       tree and not bundled here (just state, no effect).
     - The Welcome modal render — render tree.

   PARAMS:
     setHlTick        From App() useState. Wrapped in the __bumpHlTick
                      bridge body (each call increments by 1).
     setNavOrigin     For dismissWelcome's About-redirect path. Snapshots
                      home as the origin so back from About goes home.
     setScreen        For dismissWelcome's About-redirect.

   RETURNS: { showWelcome, setShowWelcome, isOnline, dismissWelcome }

   STORAGE:
     - 'vot-welcomed'   '1' once dismissed; absence triggers showWelcome
                        on next boot.
     - 'vot-about-seen' Read (not written) by dismissWelcome to decide
                        whether to redirect to About on first dismissal.

   WINDOW:
     - __bumpHlTick     Bound mount-only to a setHlTick increment;
                        cleaned up at unmount via `delete`.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   setHlTick: (updater: (prev: number) => number) => void,
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
export function useAppShellEffects({ setHlTick, setNavOrigin, setScreen }) {
  // __bumpHlTick bridge — mount-only.
  React.useEffect(() => {
    window.__bumpHlTick = () => setHlTick((t) => t + 1);
    return () => { delete window.__bumpHlTick; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bridge; setHlTick is a useState setter (identity-stable per React invariant).
  }, []);

  // First-run welcome state.
  const [showWelcome, setShowWelcome] = React.useState(() => {
    try { return !localStorage.getItem('vot-welcomed'); } catch (_e) { return true; }
  });

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
    try { localStorage.setItem('vot-welcomed', '1'); } catch (_e) { /* localStorage — non-fatal */ }
    setShowWelcome(false);
    // First-time users see the About intro right after the splash. After
    // CONTINUE marks `vot-about-seen`, this path becomes a no-op and the
    // splash just dismisses straight to home on subsequent uses.
    try {
      if (!localStorage.getItem('vot-about-seen')) {
        setNavOrigin({ screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });
        setScreen('about');
      }
    } catch (_e) { /* localStorage — non-fatal */ }
  };

  return { showWelcome, setShowWelcome, isOnline, dismissWelcome };
}
