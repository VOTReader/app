/* ═══════════════════════════════════════════════════════════════════════
   useTabTitleMemo — remember the active tab's resolved card label
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   The Tabs overview labels each card via describeTab(), which resolves the
   title from the lazy-loaded corpora (BOOKS / MATTHEW / the VOT collections /
   bible studies). A background tab whose corpus isn't loaded THIS session
   resolves to a generic fallback ("Reading", "Scripture", "Entry", …) — the
   owner-reported "my tabs forget what I was reading" bug.

   This hook makes the label sticky: while a tab is ACTIVE its corpus is
   necessarily loaded (you're reading it), so describeTab resolves a real
   title — we write it back onto the tab (title/subtitle fields, persisted in
   vot-state). The overview then prefers that stored label whenever the live
   lookup can't resolve. Net effect: once a tab has ever been viewed, its
   label is remembered forever (until the tab is closed), across corpus
   unloads AND app restarts.

   WHY AN EFFECT (not capture-at-navigation): the corpus loads ASYNC after you
   navigate, so the title isn't resolvable on the navigation tick. App
   re-renders when the lazy corpus arrives (useLazyBundles); describeTab then
   resolves, this effect's `resolved`/`title` deps change, and the write fires.
   The equality guard makes it idempotent — no write when nothing changed, so
   no render loop.

   PARAMS: { activeTab, updateActiveTab } — both from useTabs.
   RETURNS: nothing.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{ activeTab: any, updateActiveTab: (patch: any) => void }} args
 * @returns {void}
 */
export function useTabTitleMemo({ activeTab, updateActiveTab }) {
  let d = null;
  // describeTab reads lazy corpus globals; guard like useDocumentTitle does.
  try { d = describeTab(activeTab || { screen: 'home' }); } catch (_e) { d = null; }
  const resolved = !!(d && d.resolved);
  const title = d ? d.title : null;
  const subtitle = d ? d.subtitle : null;
  const curTitle = activeTab ? activeTab.title : null;
  const curSubtitle = activeTab ? activeTab.subtitle : null;

  React.useEffect(() => {
    // Only persist a CONFIDENT (corpus-backed) label, and only when it differs
    // from what's already stored — never overwrite a good remembered title with
    // a generic one, and never loop.
    if (!resolved) return;
    if (curTitle === title && curSubtitle === subtitle) return;
    updateActiveTab({ title, subtitle });
  }, [resolved, title, subtitle, curTitle, curSubtitle, updateActiveTab]);
}
