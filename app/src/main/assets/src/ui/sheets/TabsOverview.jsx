/* ═══════════════════════════════════════════════════════════════════════
   TabsOverview — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function TabsOverview({ tabs, activeTabIdx, onSelect, onClose, onNewTab, onLongPress, onClearAll, onDedupe, MAX_TABS, thumbnails }) {
  const total = tabs.length;
  const [confirmingClearAll, setConfirmingClearAll] = React.useState(false);
  const handleLongPress = React.useRef(null);
  const startLongPress = (idx) => (_e) => {
    handleLongPress.current = setTimeout(() => {
      onLongPress && onLongPress(idx);
      handleLongPress.current = null;
    }, 520);
  };
  const cancelLongPress = () => {
    if (handleLongPress.current) {clearTimeout(handleLongPress.current);handleLongPress.current = null;}
  };
  // Count duplicates (same content signature) — surface the number on the button
  const dupeCount = React.useMemo(() => {
    const seen = new Map();
    let dupes = 0;
    tabs.forEach((t) => {
      const k = tabContentKey(t);
      if (seen.has(k)) dupes++;else
      seen.set(k, true);
    });
    return dupes;
  }, [tabs]);

  return (
    <div className="tabs-overview">
      <div className="tabs-overview-header">
        <div className="tabs-overview-eyebrow">Reading Places</div>
        <h1 className="tabs-overview-title">Tabs</h1>
        <div className="tabs-overview-ornament">
          <div className="tabs-overview-ornament-line" />
          <div className="tabs-overview-ornament-diamond">{"✦"}</div>
          <div className="tabs-overview-ornament-line r" />
        </div>
        <div className="tabs-overview-meta">{total} / {MAX_TABS} {total === 1 ? 'tab' : 'tabs'} open</div>
        <div className="tabs-overview-actions">
          {confirmingClearAll ? (
            <ConfirmStrip
              question={`Close all ${total} tabs?`}
              yesLabel="Yes, close all"
              onCancel={() => setConfirmingClearAll(false)}
              onConfirm={() => { onClearAll(); setConfirmingClearAll(false); }}
            />
          ) : (
            <button
              className="settings-clear-btn"
              onClick={(e) => { e.stopPropagation(); setConfirmingClearAll(true); }}
              disabled={total <= 1}
            >Clear All</button>
          )}
          <button
            className="tabs-action-btn"
            onClick={(e) => {e.stopPropagation();onDedupe();}}
            disabled={dupeCount === 0}
            title={dupeCount === 0 ? 'No duplicate tabs' : `Merge ${dupeCount} duplicate ${dupeCount === 1 ? 'tab' : 'tabs'}`}
          >Deduplicate{dupeCount > 0 ? ` · ${dupeCount}` : ''}</button>
        </div>
      </div>
      <div className="tabs-overview-grid">
        {tabs.map((t, i) => {
          const { title, subtitle } = describeTab(t);
          const scrollKey = scrollKeyForTab(t);
          const saved = t.scrollPositions && t.scrollPositions[scrollKey];
          const pctLive = saved == null ? 0 :
            typeof saved === 'object' && typeof saved.pct === 'number' ? saved.pct : 0;
          const isActive = i === activeTabIdx;
          const thumb = thumbnails ? thumbnails[tabContentKey(t)] : null;
          return (
            <div
              key={i}
              className={`tab-card${isActive ? ' active' : ''}${thumb ? ' has-thumb' : ''}`}
              onClick={() => onSelect(i)}
              onTouchStart={startLongPress(i)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
              onMouseDown={startLongPress(i)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
            >
              <button
                className="tab-card-close"
                onClick={(e) => {e.stopPropagation();onClose(i);}}
                title="Close tab"
                aria-label="Close tab"
              >{"\xD7"}</button>
              <div className="tab-card-thumb-wrap">
                {thumb
                  ? <img className="tab-card-thumb" src={thumb} alt="" />
                  : <div className="tab-card-thumb-placeholder">
                      <div className="tab-card-thumb-sigil">{"✦"}</div>
                    </div>
                }
                <div className="tab-card-thumb-scrim" />
              </div>
              <div className="tab-card-body">
                <div className="tab-card-eyebrow">Tab {i + 1} / {total}</div>
                <div className="tab-card-title">{title}</div>
                <div className="tab-card-subtitle">{subtitle}</div>
                {/* UX8: only show the progress bar once there's REAL progress.
                    A 0%-wide bar read as "unread" even for a short tab the user
                    had read fully (it never scrolled, so pct stayed 0); an absent
                    bar is the honest signal for "no tracked progress yet". */}
                {tabHasProgressBar(t) && pctLive > 0 && (
                  <div className="tab-card-progress">
                    <div className="tab-card-progress-fill" style={{ width: `${Math.round(pctLive * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {total < MAX_TABS && (
          <button
            className="tab-card tab-card-new"
            onClick={() => onNewTab()}
            title="New tab"
            aria-label="New tab"
          >
            <span className="tab-card-new-plus">+</span>
            <span className="tab-card-new-label">New Tab</span>
          </button>
        )}
      </div>
    </div>
  );
}
