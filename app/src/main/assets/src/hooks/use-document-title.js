/* ═══════════════════════════════════════════════════════════════════════
   useDocumentTitle — keep the tab/window title in sync with the screen (W4.6)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The app is a single-URL SPA, so document.title was always just "VOTReader"
   — unhelpful for browser tabs, history, and PWA window identification on
   desktop. This derives a per-screen title from describeTab (the canonical
   screen→label function reused from the tab cards / history), giving e.g.
   "Genesis · Ch. 1 — VOTReader", "The Wide Path — VOTReader". Home and any
   screen describeTab doesn't label fall back to the bare app name.

   describeTab is a cross-bundle global (set by bundle-d); it's available by
   the time App() runs. It reads lazy corpus globals, so the call is guarded.

   PARAMS: activeTab — the active tab's state object (App()'s tabState.activeTab).
   RETURNS: nothing.
   ═══════════════════════════════════════════════════════════════════════ */

const APP_NAME = 'VOTReader';

/**
 * @param {{ activeTab: any }} args
 * @returns {void}
 */
export function useDocumentTitle({ activeTab }) {
  let title = APP_NAME;
  try {
    const d = describeTab(activeTab || { screen: 'home' });
    // describeTab's Home/default label → just the app name; otherwise prefix it.
    if (d && d.title && d.title !== 'Home') title = `${d.title} — ${APP_NAME}`;
  } catch (_e) { /* describeTab reads lazy corpus globals; fall back to app name */ }

  // Effect keyed on the resolved string, so it only writes when the title
  // actually changes (not on every render).
  React.useEffect(() => { document.title = title; }, [title]);
}
