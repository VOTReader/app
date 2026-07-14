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
  // Current theme for thumbnail theme-normalization (see the map below).
  // Read from the body class — the authoritative live-theme signal — so no
  // new prop threads through AppShellOverlays; the overview remounts per
  // open, and the theme can't change while it covers the screen.
  const currentTheme = (typeof document !== 'undefined' && document.body.classList.contains('light')) ? 'light' : 'dark';
  const [confirmingClearAll, setConfirmingClearAll] = React.useState(false);

  /* ── Drag-to-reorder — v2, a pointer-events state machine ────────────────
     REDESIGNED (owner-reported, after two rounds of touch-event lifecycle
     patches still left device-only failures): "first drag works, then none
     until an app restart" + "the real card visibly moves again after the
     ghost lands". Principles:

     ONE GESTURE OBJECT — every per-gesture value lives in gestureRef.current,
       created at pointerdown and destroyed by a single idempotent endGesture()
       from EVERY exit path. A new pointerdown FORCE-resets whatever survived,
       so no leaked state can ever refuse grabs until restart (the old code
       only healed a zombie after 2.5s of event silence — anything else wedged
       it permanently).

     POINTER EVENTS at document CAPTURE — one event model for mouse + touch
       (no dual paths, no touch-identifier bookkeeping), still first-in-line
       in propagation (the WebView's non-bubbling touchend delivery can't
       starve capture), and pointercancel is an EXPLICIT signal: the browser
       claiming the stream used to just go silent — now it commits the drag
       at the current slot, tears down, and traces "[tabdrag] …" so a device
       failure names itself (F12 / DiagnosticLog).

     SEAMLESS DROP — the reorder and the sibling-transform clear happen in the
       SAME synchronous task at release (one paint: final order, no leftover
       transforms) while the ghost glides to the target rect ABOVE the real
       card, which stays hidden until the ghost lands and swaps 1:1. The old
       sequence cleared transforms → painted the OLD arrangement → reordered
       240ms later — the visible double-move.

     The scroll suppressor stays a NON-PASSIVE capture touchmove listener
     (pointermove can't preventDefault native scrolling and touch-action can't
     change mid-gesture), active only while the drag is live. */
  const [pressingIdx, setPressingIdx] = React.useState(-1);
  const [dragIdx, setDragIdx] = React.useState(-1);

  const cardRefs = React.useRef([]);            // REAL tab cards only (not the New-Tab sentinel)
  const gestureRef = React.useRef(/** @type {any} */ (null)); // the ONE live gesture, or null
  const landingRef = React.useRef(/** @type {any} */ (null)); // post-drop ghost glide {ghost,timer,tgtEl}
  const justDraggedRef = React.useRef(false);   // suppresses the post-drag click
  const tabsLenRef = React.useRef(total);
  React.useEffect(() => {tabsLenRef.current = total;}, [total]);

  // Abnormal-path trace — mirrors the [thumb] pattern: console.warn for a
  // live devtools look + DiagnosticLog for the offline trail.
  const _dragTrace = (msg) => {
    try { console.warn('[tabdrag] ' + msg); } catch (_e) { /* ignore */ }
    try {
      if (typeof DiagnosticLog !== 'undefined' && DiagnosticLog && typeof DiagnosticLog.error === 'function') {
        DiagnosticLog.error('tabdrag', msg);
      }
    } catch (_e) { /* ignore */ }
  };

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

  // Land the in-flight ghost NOW: remove it and reveal the real card beneath.
  // Idempotent; runs from its own glide timer, from a superseding grab, and
  // from unmount — the ghost can never outlive its moment.
  const flushLanding = () => {
    const L = landingRef.current;
    if (!L) return;
    landingRef.current = null;
    clearTimeout(L.timer);
    if (L.ghost && L.ghost.parentNode) L.ghost.parentNode.removeChild(L.ghost);
    if (L.tgtEl) L.tgtEl.style.opacity = "";
  };

  // Drop commit — runs SYNCHRONOUSLY at release/cancel. The grid reaches its
  // final state in this one task (sibling transforms cleared + reorder →
  // ONE paint of the final order) while the ghost glides to the target rect
  // above the real card, which stays hidden until the ghost lands.
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
      if (to !== from && onReorder) onReorder(from, to);
    } catch (err) {
      _dragTrace('reorder commit threw: ' + String(err).slice(0, 120));
    }
    const ghost = g.ghost;
    if (ghost) {
      const snap = g.rects && (g.rects[to] || g.rects[from]);
      if (snap) {
        ghost.style.transition = "left 0.22s cubic-bezier(0.2,0.8,0.3,1), top 0.22s cubic-bezier(0.2,0.8,0.3,1), transform 0.22s cubic-bezier(0.2,0.8,0.3,1)";
        ghost.style.left = snap.left + "px";
        ghost.style.top = snap.top + "px";
        ghost.style.transform = "scale(1)";
      }
      landingRef.current = { ghost, tgtEl, timer: setTimeout(flushLanding, 230) };
    } else if (tgtEl) {
      tgtEl.style.opacity = "";
    }
  };

  // The ONE exit for a gesture — idempotent (gestureRef identity check), used
  // by every path: lift (commit), drift-cancel, pointercancel, force-reset,
  // unmount. Nothing else mutates gesture lifecycle state.
  const endGesture = (g, commit, trace) => {
    if (gestureRef.current !== g) return;
    gestureRef.current = null;
    clearTimeout(g.pressTimer);
    clearTimeout(g.glowTimer);
    if (g.cleanup) g.cleanup();
    if (trace) _dragTrace(trace);
    if (g.drag) {
      if (commit) {
        commitDrop(g); // ghost ownership moves to landingRef
      } else {
        if (g.ghost && g.ghost.parentNode) g.ghost.parentNode.removeChild(g.ghost);
        clearInlineTransforms();
        setDragIdx(-1);
        setPressingIdx(-1);
      }
      justDraggedRef.current = true;
      setTimeout(() => {justDraggedRef.current = false;}, 300);
    } else {
      setPressingIdx(-1);
      // A long-but-undragged press isn't a tap — suppress the trailing click.
      if (Date.now() - g.startTs > 400) {
        justDraggedRef.current = true;
        setTimeout(() => {justDraggedRef.current = false;}, 300);
      }
    }
  };

  // Destroy whatever the last gesture left behind — unconditionally. Called
  // by every new pointerdown and by unmount, so no wedged state (lost events,
  // an in-flight landing, a stray ghost) can ever refuse future grabs.
  const forceReset = (trace) => {
    const g = gestureRef.current;
    if (g) endGesture(g, false, g.drag ? trace : null);
    flushLanding();
  };

  // The overview is an overlay — it can unmount mid-gesture (Back / tab
  // switch). One call tears down timers, listeners, ghost, and landing.
  React.useEffect(() => () => { forceReset(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- unmount-only; forceReset reads refs + stable setters, so the first render's closure stays correct.

  // pointerdown on a card — begins the ONE gesture. Everything the gesture
  // needs lives on `g`; every exit path funnels through endGesture(g, …).
  const startPress = (idx, clientX, clientY, pointerId) => {
    // UNCONDITIONAL heal: whatever a previous gesture left behind (a lost end
    // event on-device, an in-flight landing, a stray ghost) dies here — a
    // fresh grab must never be refused. The old machinery only healed a
    // zombie after 2.5s of silence; any other leaked state refused every
    // future grab until an app restart (owner-reported).
    if (gestureRef.current) forceReset('force-reset of a live gesture at new pointerdown');
    else flushLanding();

    const g = {
      pointerId, idx,
      startX: clientX, startY: clientY, startTs: Date.now(),
      drag: false, targetIdx: idx,
      rects: /** @type {any[]} */ (null),
      ghost: /** @type {any} */ (null), offX: 0, offY: 0,
      pressTimer: /** @type {any} */ (null), glowTimer: /** @type {any} */ (null),
      cleanup: /** @type {any} */ (null),
    };
    gestureRef.current = g;

    const onPointerMove = (e) => {
      if (gestureRef.current !== g || e.pointerId !== g.pointerId) return;
      const x = e.clientX, y = e.clientY;
      if (g.drag) {
        // ACTIVE DRAG: the ghost follows the finger in both axes.
        const ghost = g.ghost;
        if (ghost) {
          ghost.style.transition = "none";
          ghost.style.left = (x - g.offX) + "px";
          ghost.style.top = (y - g.offY) + "px";
          ghost.style.transform = "scale(1.05)";
        }
        const r0 = g.rects && g.rects[g.idx];
        const cx = (x - g.offX) + (r0 ? r0.w * 0.5 : 0);
        const cy = (y - g.offY) + (r0 ? r0.h * 0.5 : 0);
        const t = pickTarget(cx, cy, g.rects || []);
        if (t !== g.targetIdx) {
          g.targetIdx = t;
          applySiblingShifts(g.idx, t, g.rects || []);
        }
      } else if (Math.abs(x - g.startX) > 10 || Math.abs(y - g.startY) > 10) {
        // PRESSING (pre-drag): the finger drifted — it's a scroll, not a hold.
        endGesture(g, false);
      }
    };
    const onPointerUp = (e) => {
      if (gestureRef.current !== g || e.pointerId !== g.pointerId) return;
      endGesture(g, true);
    };
    const onPointerCancel = (e) => {
      if (gestureRef.current !== g || e.pointerId !== g.pointerId) return;
      // The browser/native layer claimed the pointer stream. Pre-drag that's
      // a normal scroll takeover; MID-drag it's abnormal — commit at the
      // current slot (the user had positioned the card) and say so.
      endGesture(g, true, g.drag ? 'pointercancel mid-drag (browser claimed the stream)' : null);
    };
    // Scroll suppressor: pointermove can't preventDefault native scrolling
    // and touch-action can't change mid-gesture, so while the DRAG is live
    // every cancelable touchmove is cancelled here (non-passive, capture).
    const onTouchMoveSuppress = (e) => {
      if (gestureRef.current === g && g.drag && e.cancelable) {
        try { e.preventDefault(); } catch (_err) { /* passive — ignore */ }
      }
    };
    // Document CAPTURE — first in propagation; nothing between the card and
    // the document can starve these (the old tabs lock-up's root cause).
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("touchmove", onTouchMoveSuppress, { passive: false, capture: true });
    g.cleanup = () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("touchmove", onTouchMoveSuppress, { capture: true });
      g.cleanup = null;
    };
    // Pointer capture (hardening, best-effort): keeps this pointer's stream
    // retargeted to the card even mid-scroll/off-element on engines that
    // support it. Document-capture listeners above are the real guarantee.
    const cardEl = cardRefs.current[idx];
    if (cardEl && cardEl.setPointerCapture) {
      try { cardEl.setPointerCapture(pointerId); } catch (_e) { /* inactive pointer etc. — ignore */ }
    }

    // Visible "pressing" glow only once the press looks intentional (~280ms)
    // so quick taps never flash it…
    g.glowTimer = setTimeout(() => {
      if (gestureRef.current === g && !g.drag) setPressingIdx(idx);
    }, 280);

    // …and DRAG MODE after ~1.4s of holding still (280ms buffer + 1100ms
    // hold — same feel as the Home/Library tiles).
    g.pressTimer = setTimeout(() => {
      if (gestureRef.current !== g) return;
      g.drag = true;
      justDraggedRef.current = true;
      setPressingIdx(-1);
      setDragIdx(idx);
      // Capture every real card's natural rect (real 2D coords of each slot).
      g.rects = cardRefs.current.map((el) => {
        if (!el) return { left: 0, top: 0, cx: 0, cy: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
      });
      // The "pop": the card lifts off as a fixed-position ghost that follows
      // the finger; the original becomes invisible, holding its grid space.
      const el = cardRefs.current[idx];
      if (el) {
        const rect = el.getBoundingClientRect();
        g.offX = g.startX - rect.left;
        g.offY = g.startY - rect.top;
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
        g.ghost = ghost;
      }
      if (navigator.vibrate) {try {navigator.vibrate(55);} catch (_e) { /* unsupported — ignore */ }}
    }, 1380);
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
              onClick={(e) => { if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); return; } onSelect(i); }}
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
