/* useLazyBundles — subscribe App() to every lazily-loaded bundle's load signal
   so its routes re-evaluate the moment a corpus or the lazy screen bundle (PF6)
   arrives. Each is a __makeLazyLoader corpus object on window (the three
   scripture corpora + screens-e); every access is typeof-guarded so the hook is
   inert when a loader isn't registered (e.g. unit tests, or before index.html's
   loader IIFE has run). Folds the three corpus subscriptions that used to live
   inline in App() and ADDS the bundle-e one — keeping App() under its 800-line
   canary while still re-rendering on a lazy-screen load.

   Q8 lazy-load: BOOKS / MATTHEW / the VOT corpora may be undefined until their
   __load*Corpus() loaders resolve; PF6: SettingsScreen / SearchScreen /
   GardenView likewise until __loadScreensE() resolves. Subscribing here makes
   App() re-render when any of them flips, so the loading routes swap to the real
   screen. */
export function useLazyBundles() {
  // #1: signal the native splash to release the frame the React tree first paints —
  // a DETERMINISTIC app-ready handshake (AppInterface.onAppReady), replacing the
  // hopeful post-onPageFinished delay that could dismiss to a black background on a
  // slow device. This hook is called once at App mount; the trigger lives HERE
  // rather than in a dedicated app.jsx call because app.jsx is at its 800-line
  // canary. requestAnimationFrame ensures a painted frame; onAppReady is a no-op on
  // web (no native splash) + typeof-guarded so this is inert in unit tests.
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { if (window.PlatformBridge) window.PlatformBridge.onAppReady(); } catch (_e) { /* best-effort */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__bibleCorpus !== 'undefined' ? window.__bibleCorpus.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__matthewCorpus !== 'undefined' ? window.__matthewCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__matthewCorpus !== 'undefined' ? window.__matthewCorpus.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(cb) : () => {}), []),
    () => (typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__screensE !== 'undefined' ? window.__screensE.subscribe(cb) : () => {}), []),
    () => (typeof window.__screensE !== 'undefined' ? window.__screensE.getVersion() : 0)
  );
  React.useSyncExternalStore(
    React.useCallback((cb) => (typeof window.__screensF !== 'undefined' ? window.__screensF.subscribe(cb) : () => {}), []),
    () => (typeof window.__screensF !== 'undefined' ? window.__screensF.getVersion() : 0)
  );
}
