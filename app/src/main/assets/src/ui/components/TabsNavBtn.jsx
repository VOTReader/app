/* ═══════════════════════════════════════════════════════════════════════
   TabsNavBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function TabsNavBtn() {
  const ctx = React.useContext(TabsContext);
  if (!ctx || !ctx.enabled) return null;
  const { count, onOpen, isOnTabsScreen } = ctx;
  const label = count > 99 ? '99+' : String(count);
  return (
    <button
      className={`tabs-nav-btn${isOnTabsScreen ? ' active' : ''}`}
      onClick={onOpen}
      title={`${count} tab${count === 1 ? '' : 's'} open`}
      aria-label={`Open tabs (${count} open)`}
    >
      <span className="tabs-nav-btn-glyph">{"▢"}</span>
      <span className="tabs-nav-btn-count">{label}</span>
    </button>
  );
}
