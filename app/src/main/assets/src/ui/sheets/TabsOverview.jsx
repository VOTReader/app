/* ═══════════════════════════════════════════════════════════════════════
   TabsOverview — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Long-press a tab card to GRAB it, then drag to reorder — the other cards
   rearrange around it (like home-screen icons), in 2D (the grid wraps rows).

   Architecture mirrors HomeScreen's drag (the 1D reference): all drag
   visuals are IMPERATIVE DOM (direct .style writes via refs), NOT React
   state — React re-render is too slow on Android WebView to follow a
   finger. React state only tracks pressingIdx/dragIdx (CSS classes). The
   2D generalization: we capture every card's real natural rect at drag
   start (naturalRectsRef) and animate siblings with a FLIP translate to
   the slot they'd occupy in the reordered layout — because the rects hold
   true 2D coordinates, a card moving from end-of-row to start-of-next-row
   tweens diagonally for free. The dragged tab's NEW position is committed
   via onReorder(from,to); usePersistedState writes the order for free.

   The post-drag click is suppressed via the factory's suppressed() — its
   absence on the OLD timer-only long-press was the bug where a long-press
   both opened the action sheet AND (via the synthesized click) switched
   tabs + closed the overview, stranding the sheet over a reading screen.
   "Tab actions" (Close others / to the right) live on the ⋮ button.
   ═══════════════════════════════════════════════════════════════════════ */

// Abnormal-path trace — mirrors the [thumb] pattern: console.warn for a
// live devtools look + DiagnosticLog for the offline trail.
function _tabsDragTrace(msg) {
  try { console.warn('[tabdrag] ' + msg); } catch (_e) { /* ignore */ }
  try {
    if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && typeof DiagnosticLog.error === 'function') {
      DiagnosticLog.error('tabdrag', msg);
    }
  } catch (_e) { /* ignore */ }
}

export function TabsOverview({ tabs, activeTabIdx, onSelect, onClose, onNewTab, onMenu, onReorder, onClearAll, onDedupe, MAX_TABS, thumbnails }) {
  const total = tabs.length;
  // Current theme for thumbnail theme-normalization (see the map below).
  // Read from the body class — the authoritative live-theme signal — so no
  // new prop threads through AppShellOverlays; the overview remounts per
  // open, and the theme can't change while it covers the screen.
  const currentTheme = (typeof document !== 'undefined' && document.body.classList.contains('light')) ? 'light' : 'dark';
  const [confirmingClearAll, setConfirmingClearAll] = React.useState(false);

  /* ── Drag-to-reorder — v2, a pointer-events state machine ────────────────
     The LIFECYCLE (one gesture object, document-capture pointer listeners,
     force-reset on every new grab, explicit pointercancel commit, landing
     glide, click suppression) lives in utils/press-drag.js — createPressDrag,
     extracted verbatim from this screen's device-validated redesign so
     Home/Library/Journal share the same machinery. This component owns only
     GEOMETRY + VISUALS: the 2D grid rects, sibling FLIP shifts, the ghost,
     and the SEAMLESS DROP — the reorder and the sibling-transform clear
     happen in the SAME synchronous task at release (one paint: final order)
     while the ghost glides to the target rect ABOVE the real card, hidden
     until the ghost lands and swaps 1:1. */
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]);            // REAL tab cards only (not the New-Tab sentinel)
  const tabsLenRef = React.useRef(total);
  React.useEffect(() => {tabsLenRef.current = total;}, [total]);
  // onReorder is a per-render prop; the factory callbacks are created once,
  // so they read it through this mirror (call-time fresh, never stale).
  const onReorderRef = React.useRef(onReorder);
  onReorderRef.current = onReorder;

  const setCardRef = (i) => (el) => {cardRefs.current[i] = el;};

  const clearInlineTransforms = () => {
    cardRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transform = ""; el.style.transition = ""; el.style.zIndex = ""; el.style.opacity = "";
    });
  };

  // Shift siblings out of the dragged card's way. For each non-dragged card at
  // original index i, find the slot it occupies once `from` is removed and
  // re-inserted at `to`, then translate it there (FLIP on captured 2D rects —
  // handles row-wrap diagonals because the rects are real grid coordinates).
  const applySiblingShifts = (from, to, rects) => {
    cardRefs.current.forEach((el, i) => {
      if (!el || i === from) return;
      let visualIdx = i;
      if (from < to) { if (i > from && i <= to) visualIdx = i - 1; }   // moved down/right
      else           { if (i >= to && i < from) visualIdx = i + 1; }   // moved up/left
      const tgt = rects[visualIdx] || rects[i];
      const src = rects[i];
      if (!tgt || !src) return;
      el.style.transition = "transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
      el.style.transform = `translate(${tgt.cx - src.cx}px, ${tgt.cy - src.cy}px)`;
    });
  };

  // Drop slot = the card whose natural center is nearest the dragged ghost's
  // center (squared distance; clamped to the real tabs, never the New-Tab card).
  const pickTarget = (cx, cy, rects) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const dx = cx - rects[i].cx, dy = cy - rects[i].cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return Math.max(0, Math.min(tabsLenRef.current - 1, best));
  };

  // The shared lifecycle (utils/press-drag.js) — created once. Every callback
  // below reads only refs + stable setters, so first-render closures stay
  // correct for the component's lifetime.
  const dragRef = React.useRef(/** @type {any} */ (null));

  // Drop commit — runs SYNCHRONOUSLY at release/cancel (the factory's
  // onCommit). The grid reaches its final state in this one task (sibling
  // transforms cleared + reorder → ONE paint of the final order) while the
  // ghost glides to the target rect above the real card, which stays hidden
  // until drag.land swaps them 1:1.
  const commitDrop = (g) => {
    const from = g.idx;
    const to = g.targetIdx >= 0 ? Math.min(g.targetIdx, tabsLenRef.current - 1) : from;
    clearInlineTransforms();
    setDragIdx(-1);
    setPressingIdx(-1);
    // Cards are keyed by INDEX, so after the reorder the node at `to` shows
    // the dragged tab. Hide it inline (React doesn't manage these nodes'
    // style) so only the gliding ghost is visible until it lands.
    const tgtEl = cardRefs.current[to] || null;
    if (tgtEl) tgtEl.style.opacity = "0";
    try {
      if (to !== from && onReorderRef.current) onReorderRef.current(from, to);
    } catch (err) {
      _tabsDragTrace('reorder commit threw: ' + String(err).slice(0, 120));
    }
    const ghost = g.data.ghost;
    if (ghost) {
      const snap = g.data.rects && (g.data.rects[to] || g.data.rects[from]);
      if (snap) {
        ghost.style.transition = "left 0.22s cubic-bezier(0.2,0.8,0.3,1), top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
        ghost.style.left = snap.left + "px";
        ghost.style.top = snap.top + "px";
        ghost.style.transform = "scale(1)";
      }
    }
    dragRef.current.land(ghost, tgtEl, 230);
  };

  if (!dragRef.current) {
    dragRef.current = createPressDrag({
      trace: _tabsDragTrace,
      onGlow: (idx) => setPressingIdx(idx),
      onGlowClear: () => setPressingIdx(-1),
      // DRAG MODE (after the factory's ~1.4s hold): capture the grid
      // geometry and lift the card off as a fixed-position ghost.
      onEngage: (g) => {
        setDragIdx(g.idx);
        // Every real card's natural rect (real 2D coords of each slot).
        g.data.rects = cardRefs.current.map((el) => {
          if (!el) return { left: 0, top: 0, cx: 0, cy: 0, w: 0, h: 0 };
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
        });
        const el = cardRefs.current[g.idx];
        if (el) {
          const rect = el.getBoundingClientRect();
          g.data.offX = g.startX - rect.left;
          g.data.offY = g.startY - rect.top;
          const ghost = el.cloneNode(true);
          ghost.className = "tab-card drag-flying";
          ghost.style.cssText = [
            "position:fixed",
            "top:" + rect.top + "px",
            "left:" + rect.left + "px",
            "width:" + rect.width + "px",
            "height:" + rect.height + "px",
            "z-index:9999",
            "pointer-events:none",
            "margin:0",
            "box-sizing:border-box",
            "transition:transform 0.16s cubic-bezier(0.2,0.8,0.3,1)",
            "transform:scale(1.05)",
          ].join(";");
          document.body.appendChild(ghost);
          g.data.ghost = ghost;
        }
        if (navigator.vibrate) {try {navigator.vibrate(55);} catch (_e) { /* unsupported — ignore */ }}
      },
      // ACTIVE DRAG: the ghost follows the finger in both axes; the nearest
      // slot becomes the target and siblings FLIP out of the way.
      onDragMove: (g, x, y) => {
        const ghost = g.data.ghost;
        if (ghost) {
          ghost.style.transition = "none";
          ghost.style.left = (x - g.data.offX) + "px";
          ghost.style.top = (y - g.data.offY) + "px";
          ghost.style.transform = "scale(1.05)";
        }
        const r0 = g.data.rects && g.data.rects[g.idx];
        const cx = (x - g.data.offX) + (r0 ? r0.w * 0.5 : 0);
        const cy = (y - g.data.offY) + (r0 ? r0.h * 0.5 : 0);
        const t = pickTarget(cx, cy, g.data.rects || []);
        if (t !== g.targetIdx) {
          g.targetIdx = t;
          applySiblingShifts(g.idx, t, g.data.rects || []);
        }
      },
      onCommit: commitDrop,
      onAbortDrag: (g) => {
        if (g.data.ghost && g.data.ghost.parentNode) g.data.ghost.parentNode.removeChild(g.data.ghost);
        clearInlineTransforms();
        setDragIdx(-1);
      },
    });
  }

  // The overview is an overlay — it can unmount mid-gesture (Back / tab
  // switch). One call tears down timers, listeners, ghost, and landing.
  React.useEffect(() => () => { dragRef.current.destroy(); }, []);

  const startPress = (idx, clientX, clientY, pointerId) =>
    dragRef.current.start(idx, clientX, clientY, pointerId, cardRefs.current[idx]);

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

  // Drop stale refs from a shrunk array (after a close/dedupe) so a future
  // naturalRects capture never reads a dead node. Ref callbacks repopulate 0..n-1.
  cardRefs.current.length = total;

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
          // Prefer the live describeTab label; but if its corpus isn't loaded
          // this session (resolved:false → a generic "Reading"/"Entry"
          // fallback), use the label remembered on the tab from when it was
          // last viewed (useTabTitleMemo) so a tab never forgets what it was.
          const _d = describeTab(t);
          const title = _d.resolved ? _d.title : (t.title || _d.title);
          const subtitle = _d.resolved ? _d.subtitle : (t.subtitle || _d.subtitle);
          const scrollKey = scrollKeyForTab(t);
          const saved = t.scrollPositions && t.scrollPositions[scrollKey];
          const pctLive = saved == null ? 0 :
            typeof saved === 'object' && typeof saved.pct === 'number' ? saved.pct : 0;
          const isActive = i === activeTabIdx;
          // Thumbnail entries are DUAL-THEME variant maps ({ dark?, light?,
          // unknown? } — {@link useThumbnails}): prefer the variant matching
          // the CURRENT theme (true pixels, instant on a theme switch). When
          // only the other theme exists yet, render it through
          // .thumb-theme-flip (invert+hue-rotate) as a transitional
          // approximation; `unknown` legacy rows (awaiting the luminance
          // probe) render as-is. Garden tabs never flip (photographs).
          const thumbEntry = thumbnails ? thumbnails[tabContentKey(t)] : null;
          let thumb = null;
          let thumbFlip = false;
          if (typeof thumbEntry === 'string') {
            thumb = thumbEntry; // pre-migration transient — render as-is
          } else if (thumbEntry) {
            const other = currentTheme === 'light' ? thumbEntry.dark : thumbEntry.light;
            if (thumbEntry[currentTheme]) {
              thumb = thumbEntry[currentTheme];
            } else if (thumbEntry.unknown) {
              thumb = thumbEntry.unknown;
            } else if (other) {
              thumb = other;
              thumbFlip = t.screen !== 'garden-view';
            } else if (thumbEntry.url) {
              // interim { url, theme } rows not yet migrated by the hook
              thumb = thumbEntry.url;
              thumbFlip = !!(thumbEntry.theme && thumbEntry.theme !== currentTheme && t.screen !== 'garden-view');
            }
          }
          return (
            <div
              key={i}
              ref={setCardRef(i)}
              className={`tab-card${isActive ? ' active' : ''}${thumb ? ' has-thumb' : ''}${i === pressingIdx ? ' pressing' : ''}${i === dragIdx ? ' dragging' : ''}`}
              onClick={(e) => { if (dragRef.current.suppressed()) { e.preventDefault(); e.stopPropagation(); return; } onSelect(i); }}
              onPointerDown={(e) => {
                if (e.isPrimary === false) return; // a second finger never owns a gesture
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                startPress(i, e.clientX, e.clientY, e.pointerId);
              }}
              onDragStart={(e) => e.preventDefault()}
            >
              <button
                className="tab-card-menu"
                onClick={(e) => {e.stopPropagation();onMenu && onMenu(i);}}
                onPointerDown={(e) => e.stopPropagation()}
                title="Tab actions"
                aria-label="Tab actions"
              >{"⋮"}</button>
              <button
                className="tab-card-close"
                onClick={(e) => {e.stopPropagation();onClose(i);}}
                onPointerDown={(e) => e.stopPropagation()}
                title="Close tab"
                aria-label="Close tab"
              >{"\xD7"}</button>
              <div className="tab-card-thumb-wrap">
                {/* draggable=false: a long-press/drag landing on the thumbnail
                    IMAGE otherwise starts the browser's native image drag,
                    which cancels the touch stream and killed the reorder
                    gesture (desktop mouse drags too). */}
                {thumb
                  ? <img className={`tab-card-thumb${thumbFlip ? ' thumb-theme-flip' : ''}`} src={thumb} alt="" draggable={false} />
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
