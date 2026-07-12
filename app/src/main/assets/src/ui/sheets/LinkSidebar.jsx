/* ═══════════════════════════════════════════════════════════════════════
   LinkSidebar — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkSidebar({ hlKey, onClose, onNavigate }) {
  // Subscribe to LinkStore — sidebar re-renders when any link is created
  // or removed.
  React.useSyncExternalStore(
    React.useCallback((cb) => LinkStore.subscribe(cb), []),
    () => LinkStore.getVersion()
  );
  // Letter/WTLB/Blessed/Holy-Days blocks anchor links by block-index, but
  // excerpts append ":start-end" to the stored endpoint key. Use prefix
  // matching for those scopes so the sidebar finds excerpt-scoped links from
  // the bare block hlKey. Bible verses stay exact-match (verse N is N).
  const isBlockScope = hlKey && (hlKey.startsWith('letter:') || hlKey.startsWith('wtlb:') || hlKey.startsWith('blessed:') || hlKey.startsWith('holy-days:'));
  const links = isBlockScope ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey);
  React.useEffect(() => {
    if (!hlKey) return;
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [hlKey, onClose]);
  if (!hlKey) return null;
  // Show a count subtitle instead of a hardcoded date. The sidebar can contain
  // links created on different days (multiple links on one passage), so a
  // fixed "today" date would be actively misleading. A count is always correct
  // and tells the user at a glance how many links are on this passage.
  const countStr = links.length === 0 ? 'No links' : (links.length === 1 ? '1 link' : links.length + ' links');
  return (
    <>
      <div className="link-sidebar-overlay" onClick={onClose} />
      <div className="link-sidebar">
        {/* Close on the RIGHT, matching every other sheet in the app. */}
        <div className="link-sidebar-header">
          <span className="link-sidebar-title">Links</span>
          <button className="link-sidebar-close" onClick={onClose} aria-label="Close links" title="Close">×</button>
        </div>
        {/* Count only when there are links — the empty body message below
            already says "No links yet", so a "No links" line here was redundant. */}
        {links.length > 0 && <div className="link-sidebar-date link-sidebar-count">{countStr}</div>}
        <div className="link-sidebar-body">
          {links.length === 0 && <div className="link-sidebar-empty">No links yet</div>}
          {links.map(lnk => <LinkCard key={lnk.id} lnk={lnk} hlKey={hlKey} isBlockScope={isBlockScope} onNavigate={onNavigate} />)}
        </div>
      </div>
    </>
  );
}
