/* ═══════════════════════════════════════════════════════════════════════
   LinkSidebar — Cluster D (esbuild bundle-d.js)
   r-links (the UI pass, mock v2 readers): a tap on a link mark opens "Links here", a bottom sheet with
   the count and a close, then one card per link (To / From, the place, where it sits and when, its
   words) with Open <place> | My Web | Remove under it. (The name is the old right-hand panel's.)
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from '../components/UiIcon.jsx';

export function LinkSidebar({ hlKey, onClose, onNavigate }) {
  // Subscribe to LinkStore — sidebar re-renders when any link is created
  // or removed.
  React.useSyncExternalStore(
    React.useCallback((cb) => LinkStore.subscribe(cb), []),
    () => LinkStore.getVersion()
  );
  const trapRef = useFocusTrap(!!hlKey);
  // Letter/WTLB/Blessed/Holy-Days blocks anchor links by block-index, but
  // excerpts append ":start-end" to the stored endpoint key. Use prefix
  // matching for those scopes so the sidebar finds excerpt-scoped links from
  // the bare block hlKey. A verse lists what its icon counts (mw17 s29.4): the
  // whole verse, a part of it ("...:16:12-40") and a span covering it.
  const isBlockScope = hlKey && (hlKey.startsWith('letter:') || hlKey.startsWith('wtlb:') || hlKey.startsWith('blessed:') || hlKey.startsWith('holy-days:'));
  const links = hlKey ? (isBlockScope ? LinkStore.getForKeyPrefix(hlKey) : LinkStore.getTouching(hlKey)) : [];
  React.useEffect(() => {
    if (!hlKey) return;
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [hlKey, onClose]);
  if (!hlKey) return null;
  // "See in My Web": the Scripture Web opens in My Web (the reader's door, window.__openScriptureWeb).
  const onMyWeb = typeof window.__openScriptureWeb === 'function'
    ? () => { onClose(); window.__openScriptureWeb(null, { mine: true }); }
    : null;
  const countStr = links.length === 1 ? '1 link' : links.length + ' links';
  return (
    <div className="link-sidebar-overlay" onClick={onClose}>
      <div className="link-sidebar rd-form-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="link-sidebar-title" onClick={e => e.stopPropagation()}>
        <div className="link-sidebar-header">
          <h2 className="ui-sheet-title link-sidebar-title" id="link-sidebar-title">Links here</h2>
          {/* Count only when there are links: the empty line below already says so. */}
          {links.length > 0 && <span className="link-sidebar-count">{countStr}</span>}
          <button type="button" className="rd-field-clear link-sidebar-close" onClick={onClose} aria-label="Close links"><UiIcon name="x" /></button>
        </div>
        <div className="link-sidebar-body">
          {links.length === 0 && <p className="rd-note link-sidebar-empty">No links yet</p>}
          {links.map(lnk => <LinkCard key={lnk.id} lnk={lnk} hlKey={hlKey} isBlockScope={isBlockScope} onNavigate={onNavigate} onMyWeb={onMyWeb} />)}
        </div>
      </div>
    </div>
  );
}
