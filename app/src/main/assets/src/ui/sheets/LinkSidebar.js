/* ═══════════════════════════════════════════════════════════════════════
   LinkSidebar — extracted React screen component
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html via <script src>.
   Self-contained — uses React.useX hooks directly (no dependency on the
   inline script's `const { useState, ... } = React` destructuring).
   All other call-time dependencies (Segments, FootnoteSheet, ScreenLayout,
   findEntryContext, applyDOMHighlights, etc.) are global-lexical and
   resolve at render time from the surrounding scripts.
   ═══════════════════════════════════════════════════════════════════════ */

export function LinkSidebar({ hlKey, hlTick, setHlTick, onClose, onNavigate }) {
  // Letter/WTLB/Blessed/Holy-Days blocks anchor links by block-index, but
  // excerpts append ":start-end" to the stored endpoint key. Use prefix
  // matching for those scopes so the sidebar finds excerpt-scoped links from
  // the bare block hlKey. Bible verses stay exact-match (verse N is N).
  const isBlockScope = hlKey && (hlKey.startsWith('letter:') || hlKey.startsWith('wtlb:') || hlKey.startsWith('blessed:') || hlKey.startsWith('holy-days:'));
  const links = React.useMemo(
    () => isBlockScope ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getForKey(hlKey),
    [hlKey, hlTick, isBlockScope]
  );
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
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "link-sidebar-overlay", onClick: onClose }),
    React.createElement("div", { className: "link-sidebar" },
      React.createElement("div", { className: "link-sidebar-header" },
        React.createElement("button", { className: "link-sidebar-close", onClick: onClose, title: "Close" }, "×"),
        React.createElement("span", { className: "link-sidebar-title" }, "Links")
      ),
      React.createElement("div", { className: "link-sidebar-date" }, countStr),
      React.createElement("div", { className: "link-sidebar-body" },
        links.length === 0 && React.createElement("div", { className: "link-sidebar-empty" }, "No links yet"),
        links.map(lnk => React.createElement(LinkCard, { key: lnk.id, lnk, hlKey, isBlockScope, onNavigate, setHlTick }))
      )
    )
  );
}
