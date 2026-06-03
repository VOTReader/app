/* ═══════════════════════════════════════════════════════════════════════
   TabsNavBtn — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

const TABS_HINT_SEEN_KEY = 'vot-tabs-hint-seen';

/* UX5 — the tab switcher is a single glyph with no affordance, so first-time
   users don't discover that it switches between open reading places. Show a
   one-time coachmark the first time more than one tab exists, persisted via a
   plain localStorage flag. (A new IDB flag store would need a DB_VERSION bump
   to actually persist on existing installs — overkill for a non-precious hint.)
   On any storage error, default to "already seen" so we never nag. */
function _tabsHintSeen() {
  try { return !!localStorage.getItem(TABS_HINT_SEEN_KEY); } catch (_e) { return true; }
}

export function TabsNavBtn() {
  const ctx = React.useContext(TabsContext);
  const [showHint, setShowHint] = React.useState(function () { return !_tabsHintSeen(); });
  const dismissHint = React.useCallback(function () {
    try { localStorage.setItem(TABS_HINT_SEEN_KEY, '1'); } catch (_e) { /* non-fatal */ }
    setShowHint(false);
  }, []);
  if (!ctx || !ctx.enabled) return null;
  const { count, onOpen, isOnTabsScreen } = ctx;
  const label = count > 99 ? '99+' : String(count);
  // Only coach once there's actually something to switch between — a lone tab
  // needs no switcher, so the hint would just be noise on a fresh first boot.
  const hintVisible = showHint && count > 1;
  return (
    <span className="tabs-hint-wrap">
      <button
        className={`tabs-nav-btn${isOnTabsScreen ? ' active' : ''}`}
        onClick={() => { dismissHint(); onOpen(); }}
        title={`${count} tab${count === 1 ? '' : 's'} open`}
        aria-label={`Open tabs (${count} open)`}
      >
        <span className="tabs-nav-btn-glyph">{"▢"}</span>
        <span className="tabs-nav-btn-count">{label}</span>
      </button>
      {hintVisible ? (
        <span className="tabs-hint" role="status">
          <span className="tabs-hint-text">Tap to switch tabs</span>
          <button
            className="tabs-hint-dismiss"
            aria-label="Dismiss hint"
            onClick={dismissHint}
          >{"×"}</button>
        </span>
      ) : null}
    </span>
  );
}
