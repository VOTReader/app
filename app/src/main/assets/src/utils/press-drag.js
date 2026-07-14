/* ═══════════════════════════════════════════════════════════════════════
   createPressDrag — the shared press→hold→drag pointer-gesture lifecycle
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js.

   Extracted VERBATIM from the TabsOverview drag v2 redesign (2026-07-13,
   device-validated by the owner) so HomeScreen / LibraryScreen /
   JournalEditorScreen ride the SAME machinery instead of three hand-copied
   touch-event variants that each re-grew the "works once, then never until
   an app restart" family of bugs. The factory owns the LIFECYCLE; hosts own
   geometry and visuals via callbacks.

   Guarantees (the redesign's invariants):
     ONE GESTURE OBJECT — created at start(), destroyed by a single
       idempotent endGesture() used by every exit path. start()
       UNCONDITIONALLY force-resets whatever a previous gesture leaked, so
       no wedged state can ever refuse future grabs.
     POINTER EVENTS at document CAPTURE — one event model for mouse+touch;
       capture is first in propagation (the WebView's non-bubbling delivery
       can't starve it); pointercancel (the browser claiming the stream)
       EXPLICITLY commits the drag at its current state and traces.
     SCROLL SUPPRESSION — a non-passive capture touchmove listener cancels
       native scrolling while the drag is live (pointermove can't, and
       touch-action can't change mid-gesture).
     LANDING — the post-drop ghost glide is owned here too: land() parks the
       ghost + the hidden real element; flushLanding() (idempotent) swaps
       them 1:1, and runs automatically on any new start() / forceReset().
     CLICK SUPPRESSION — suppressed() is true while dragging, for 300ms
       after a drag ends, and for 300ms after a >400ms press that never
       became a drag; hosts guard their onClick with it.

   Host callbacks (all optional; each is wrapped — a throwing callback is
   traced, never allowed to wedge the machine):
     trace(msg)            abnormal-path reporting ("[tabdrag] …" etc.)
     onGlow(idx)           the "pressing" visual, after glowMs of stillness
     onGlowClear()         remove the pressing visual
     onEngage(g)           drag began — capture geometry, build the ghost
                           (stash host state on g.data)
     onDragMove(g, x, y)   pointer moved while dragging
     onCommit(g)           released/cancelled WHILE dragging — reorder +
                           hand the ghost to land()
     onAbortDrag(g)        a force-reset killed a live drag — remove the
                           ghost, clear shifts

   Config: holdMs (default 1380; 0 = instant drag — the journal grip),
   glowMs (280), driftPx (10; pre-drag drift beyond this cancels the press —
   it was a scroll).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   holdMs?: number, glowMs?: number, driftPx?: number,
 *   trace?: (msg: string) => void,
 *   onGlow?: (idx: number) => void,
 *   onGlowClear?: () => void,
 *   onEngage?: (g: any) => void,
 *   onDragMove?: (g: any, x: number, y: number) => void,
 *   onCommit?: (g: any) => void,
 *   onAbortDrag?: (g: any) => void,
 * }} cfg
 * @returns {{
 *   start: (idx: number, x: number, y: number, pointerId: any, captureEl?: any) => void,
 *   land: (ghost: any, revealEl: any, ms?: number) => void,
 *   flushLanding: () => void,
 *   forceReset: (traceMsg?: string) => void,
 *   destroy: () => void,
 *   suppressed: () => boolean,
 *   isDragging: () => boolean,
 * }}
 */
export function createPressDrag(cfg) {
  const holdMs = cfg.holdMs != null ? cfg.holdMs : 1380;
  const glowMs = cfg.glowMs != null ? cfg.glowMs : 280;
  const driftPx = cfg.driftPx != null ? cfg.driftPx : 10;

  /** @type {any} */ let gesture = null;
  /** @type {any} */ let landing = null;
  let suppressUntil = 0;

  const trace = (msg) => {
    try { if (cfg.trace) cfg.trace(msg); } catch (_e) { /* ignore */ }
  };
  // Host callbacks can never wedge the machine — a throw is traced and the
  // lifecycle continues.
  const safe = (fn, ...args) => {
    if (!fn) return undefined;
    try { return fn(...args); } catch (e) { trace('host callback threw: ' + String(e).slice(0, 120)); }
  };

  const suppressed = () => !!(gesture && gesture.drag) || Date.now() < suppressUntil;
  const suppress = () => { suppressUntil = Date.now() + 300; };

  // ── Landing (post-drop ghost glide) ─────────────────────────────────────
  const flushLanding = () => {
    if (!landing) return;
    const L = landing;
    landing = null;
    clearTimeout(L.timer);
    if (L.ghost && L.ghost.parentNode) L.ghost.parentNode.removeChild(L.ghost);
    if (L.revealEl) L.revealEl.style.opacity = '';
  };
  const land = (ghost, revealEl, ms) => {
    flushLanding();
    if (!ghost) { if (revealEl) revealEl.style.opacity = ''; return; }
    landing = { ghost, revealEl, timer: setTimeout(flushLanding, ms != null ? ms : 230) };
  };

  // ── The ONE exit ────────────────────────────────────────────────────────
  const endGesture = (g, commit, traceMsg) => {
    if (gesture !== g) return;
    gesture = null;
    clearTimeout(g.pressTimer);
    clearTimeout(g.glowTimer);
    if (g.cleanup) g.cleanup();
    if (traceMsg) trace(traceMsg);
    safe(cfg.onGlowClear);
    if (g.drag) {
      if (commit) safe(cfg.onCommit, g);
      else safe(cfg.onAbortDrag, g);
      suppress();
    } else if (Date.now() - g.startTs > 400) {
      // A long-but-undragged press isn't a tap — suppress the trailing click.
      suppress();
    }
  };

  const engage = (g) => {
    if (gesture !== g || g.drag) return;
    g.drag = true;
    safe(cfg.onGlowClear);
    safe(cfg.onEngage, g);
  };

  const forceReset = (traceMsg) => {
    const g = gesture;
    if (g) endGesture(g, false, g.drag ? traceMsg : null);
    flushLanding();
  };

  const start = (idx, x, y, pointerId, captureEl) => {
    // UNCONDITIONAL heal: whatever a previous gesture left behind (a lost
    // end event on-device, an in-flight landing, a stray ghost) dies here —
    // a fresh grab must never be refused.
    if (gesture) forceReset('force-reset of a live gesture at new pointerdown');
    else flushLanding();

    const g = {
      pointerId, idx,
      startX: x, startY: y, startTs: Date.now(),
      drag: false, targetIdx: idx,
      data: /** @type {any} */ ({}), // host scratch: rects, ghost, offsets…
      pressTimer: /** @type {any} */ (null),
      glowTimer: /** @type {any} */ (null),
      cleanup: /** @type {any} */ (null),
    };
    gesture = g;

    const onPointerMove = (e) => {
      if (gesture !== g || e.pointerId !== g.pointerId) return;
      if (g.drag) {
        safe(cfg.onDragMove, g, e.clientX, e.clientY);
      } else if (Math.abs(e.clientX - g.startX) > driftPx || Math.abs(e.clientY - g.startY) > driftPx) {
        endGesture(g, false); // pre-drag drift — it's a scroll, not a hold
      }
    };
    const onPointerUp = (e) => {
      if (gesture !== g || e.pointerId !== g.pointerId) return;
      endGesture(g, true);
    };
    const onPointerCancel = (e) => {
      if (gesture !== g || e.pointerId !== g.pointerId) return;
      // The browser/native layer claimed the pointer stream. Pre-drag that's
      // a normal scroll takeover; MID-drag it's abnormal — commit at the
      // current slot (the user had positioned the element) and say so.
      endGesture(g, true, g.drag ? 'pointercancel mid-drag (browser claimed the stream)' : null);
    };
    const onTouchMoveSuppress = (e) => {
      if (gesture === g && g.drag && e.cancelable) {
        try { e.preventDefault(); } catch (_err) { /* passive — ignore */ }
      }
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('touchmove', onTouchMoveSuppress, { passive: false, capture: true });
    g.cleanup = () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('touchmove', onTouchMoveSuppress, { capture: true });
      g.cleanup = null;
    };
    // Pointer capture (hardening, best-effort): keeps this pointer's stream
    // retargeted to the element on engines that support it. The document-
    // capture listeners above are the real guarantee.
    if (captureEl && captureEl.setPointerCapture) {
      try { captureEl.setPointerCapture(pointerId); } catch (_e) { /* inactive pointer — ignore */ }
    }

    if (holdMs <= 0) {
      engage(g); // instant-drag hosts (the journal grip)
      return;
    }
    g.glowTimer = setTimeout(() => {
      if (gesture === g && !g.drag) safe(cfg.onGlow, idx);
    }, glowMs);
    g.pressTimer = setTimeout(() => {
      if (gesture === g) engage(g);
    }, holdMs);
  };

  const destroy = () => forceReset();

  return {
    start, land, flushLanding, forceReset, destroy, suppressed,
    isDragging: () => !!(gesture && gesture.drag),
  };
}
