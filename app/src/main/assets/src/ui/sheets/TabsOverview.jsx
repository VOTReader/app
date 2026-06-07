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

   The post-drag click is suppressed via justDraggedRef (the same guard
   HomeScreen uses) — its absence on the OLD timer-only long-press was the
   bug where a long-press both opened the action sheet AND (via the
   synthesized click) switched tabs + closed the overview, stranding the
   sheet over a reading screen. "Tab actions" (Close others / to the right)
   now live on the ⋮ button, not on long-press.
   ═══════════════════════════════════════════════════════════════════════ */

export function TabsOverview({ tabs, activeTabIdx, onSelect, onClose, onNewTab, onMenu, onReorder, onClearAll, onDedupe, MAX_TABS, thumbnails }) {
  const total = tabs.length;
  const [confirmingClearAll, setConfirmingClearAll] = React.useState(false);

  /* ── Drag-to-reorder state (CSS-class drivers only) + imperative refs ── */
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]);            // REAL tab cards only (not the New-Tab sentinel)
  const pressTimerRef = React.useRef(null);
  const visualDelayTimerRef = React.useRef(null);
  const pressStartXRef = React.useRef(0);
  const pressStartYRef = React.useRef(0);
  const pressStartTsRef = React.useRef(0);
  const dragIdxRef = React.useRef(-1);
  const targetIdxRef = React.useRef(-1);
  const pressingIdxRef = React.useRef(-1);
  const justDraggedRef = React.useRef(false);   // suppresses the post-drag click (the bug fix)
  const activeCleanupRef = React.useRef(null);
  const dragCloneRef = React.useRef(null);
  const fingerOffsetXRef = React.useRef(0);
  const fingerOffsetYRef = React.useRef(0);
  const naturalRectsRef = React.useRef([]);     // [{left,top,cx,cy,w,h}] per real card, captured at drag start
  const tabsLenRef = React.useRef(total);

  React.useEffect(() => {dragIdxRef.current = dragIdx;}, [dragIdx]);
  React.useEffect(() => {pressingIdxRef.current = pressingIdx;}, [pressingIdx]);
  React.useEffect(() => {tabsLenRef.current = total;}, [total]);

  // The overview is an overlay — it can unmount mid-press (Back / tab switch).
  // Tear down any timers, document listeners, and the flying clone so nothing leaks.
  React.useEffect(() => () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(visualDelayTimerRef.current);
    if (activeCleanupRef.current) activeCleanupRef.current();
    if (dragCloneRef.current && dragCloneRef.current.parentNode)
      dragCloneRef.current.parentNode.removeChild(dragCloneRef.current);
  }, []);

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
  const applySiblingShifts = (to) => {
    const from = dragIdxRef.current;
    const rects = naturalRectsRef.current;
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

  // Drop slot = the card whose natural center is nearest the dragged clone's
  // center (squared distance; clamped to the real tabs, never the New-Tab card).
  const pickTarget = (cx, cy) => {
    const rects = naturalRectsRef.current;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const dx = cx - rects[i].cx, dy = cy - rects[i].cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return Math.max(0, Math.min(tabsLenRef.current - 1, best));
  };

  const startPress = (idx, clientX, clientY) => {
    if (pressingIdxRef.current >= 0 || dragIdxRef.current >= 0) return;
    pressStartXRef.current = clientX; pressStartYRef.current = clientY;
    pressStartTsRef.current = Date.now();
    // Track intent immediately (drift detection); delay the visible "pressing"
    // glow until the press looks intentional (~280ms) so quick taps never flash it.
    pressingIdxRef.current = idx;
    clearTimeout(visualDelayTimerRef.current);
    visualDelayTimerRef.current = setTimeout(() => {
      if (pressingIdxRef.current === idx && dragIdxRef.current < 0) setPressingIdx(idx);
    }, 280);

    // Attach document listeners SYNCHRONOUSLY — no useEffect gap, no missed moves.
    const onMove = (e) => {
      const x = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const y = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      if (dragIdxRef.current >= 0 && e.cancelable) {
        try {e.preventDefault();} catch (_err) { /* passive/unsupported — ignore */ }
      }
      if (dragIdxRef.current >= 0) {
        // ACTIVE DRAG: move the fixed clone to follow the finger in both axes.
        const clone = dragCloneRef.current;
        if (clone) {
          clone.style.transition = "none";
          clone.style.left = (x - fingerOffsetXRef.current) + "px";
          clone.style.top = (y - fingerOffsetYRef.current) + "px";
          clone.style.transform = "scale(1.05)";
        }
        const r0 = naturalRectsRef.current[dragIdxRef.current];
        const cx = (x - fingerOffsetXRef.current) + (r0 ? r0.w * 0.5 : 0);
        const cy = (y - fingerOffsetYRef.current) + (r0 ? r0.h * 0.5 : 0);
        const newTarget = pickTarget(cx, cy);
        if (newTarget !== targetIdxRef.current) {
          targetIdxRef.current = newTarget;
          applySiblingShifts(newTarget);
        }
      } else if (pressingIdxRef.current >= 0) {
        // PRESSING (pre-drag): cancel if the finger drifts (it's a scroll, not a hold).
        if (Math.abs(x - pressStartXRef.current) > 10 || Math.abs(y - pressStartYRef.current) > 10) {
          clearTimeout(pressTimerRef.current);
          clearTimeout(visualDelayTimerRef.current);
          setPressingIdx(-1);
          pressingIdxRef.current = -1;
          if (Date.now() - pressStartTsRef.current > 400) {
            justDraggedRef.current = true;
            setTimeout(() => {justDraggedRef.current = false;}, 300);
          }
        }
      }
    };
    const onEnd = () => { if (activeCleanupRef.current) activeCleanupRef.current(); endPress(); };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    activeCleanupRef.current = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      activeCleanupRef.current = null;
    };

    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      // ~1.4s tap → ENTER DRAG MODE (280ms buffer + 1100ms hold — same as Home).
      justDraggedRef.current = true;
      setPressingIdx(-1);
      setDragIdx(idx);
      targetIdxRef.current = idx;
      // Capture every real card's natural rect (real 2D coords of each slot).
      naturalRectsRef.current = cardRefs.current.map((el) => {
        if (!el) return { left: 0, top: 0, cx: 0, cy: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
      });
      // The "pop": the card lifts off as a fixed-position clone that follows the
      // finger; the original becomes an invisible ghost holding its grid space.
      const el = cardRefs.current[idx];
      if (el) {
        const rect = el.getBoundingClientRect();
        fingerOffsetXRef.current = pressStartXRef.current - rect.left;
        fingerOffsetYRef.current = pressStartYRef.current - rect.top;
        const clone = el.cloneNode(true);
        clone.className = "tab-card drag-flying";
        clone.style.cssText = [
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
        document.body.appendChild(clone);
        dragCloneRef.current = clone;
      }
      if (navigator.vibrate) {try {navigator.vibrate(55);} catch (_e) { /* unsupported — ignore */ }}
    }, 1380);
  };

  const endPress = () => {
    clearTimeout(pressTimerRef.current);
    clearTimeout(visualDelayTimerRef.current);
    const wasPressing = pressingIdxRef.current >= 0;
    const wasDragging = dragIdxRef.current >= 0;
    setPressingIdx(-1);
    pressingIdxRef.current = -1;

    if (wasDragging) {
      const from = dragIdxRef.current;
      const to = targetIdxRef.current >= 0 ? targetIdxRef.current : from;
      const clone = dragCloneRef.current;
      const rects = naturalRectsRef.current;
      // Snap the flying clone to the target slot's natural position, then remove it.
      if (clone) {
        const snap = rects[to] || rects[from];
        clone.style.transition =
          "left 0.22s cubic-bezier(0.2,0.8,0.3,1), top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
        clone.style.left = (snap ? snap.left : 0) + "px";
        clone.style.top = (snap ? snap.top : 0) + "px";
        clone.style.transform = "scale(1)";
      }
      setTimeout(() => {
        // Snap done — remove clone, wipe sibling transforms, commit the new order.
        if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        dragCloneRef.current = null;
        clearInlineTransforms();
        if (to !== from && to >= 0) onReorder && onReorder(from, to);
        setDragIdx(-1);
        targetIdxRef.current = -1;
        setTimeout(() => {justDraggedRef.current = false;}, 120);
      }, 240);
    } else if (wasPressing) {
      if (Date.now() - pressStartTsRef.current > 400) {
        justDraggedRef.current = true;
        setTimeout(() => {justDraggedRef.current = false;}, 300);
      }
    }
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
              ref={setCardRef(i)}
              className={`tab-card${isActive ? ' active' : ''}${thumb ? ' has-thumb' : ''}${i === pressingIdx ? ' pressing' : ''}${i === dragIdx ? ' dragging' : ''}`}
              onClick={(e) => { if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); return; } onSelect(i); }}
              onTouchStart={(e) => { if (e.touches && e.touches[0]) startPress(i, e.touches[0].clientX, e.touches[0].clientY); }}
              onMouseDown={(e) => { if (e.button === 0) startPress(i, e.clientX, e.clientY); }}
            >
              <button
                className="tab-card-menu"
                onClick={(e) => {e.stopPropagation();onMenu && onMenu(i);}}
                onTouchStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Tab actions"
                aria-label="Tab actions"
              >{"⋮"}</button>
              <button
                className="tab-card-close"
                onClick={(e) => {e.stopPropagation();onClose(i);}}
                onTouchStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
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
