/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/gestures — Cluster F (esbuild bundle-f.js)

   The pointer/wheel wiring for the Scripture Web's pan/pinch/tap/zoom
   surface. Extracted verbatim out of ScriptureWebScreen's gesture effect
   (same closures, same order, same comments) so a real dispatched DOM
   event — not a screenshot — can prove it: jsdom builds a `.sw-root` with
   a `.sw-list`/`.sw-goto` inside it, fires pointerdown/wheel, and reads
   back whether the camera moved.

   Gesture doctrine copied from GardenView: nothing that runs per frame
   touches React state. `deps.cam()`/`deps.view()`/`deps.handlers()` read
   the caller's mutable refs fresh on every call; this module keeps no
   camera or view state of its own, only the pointer bookkeeping
   (`pointers`/`drag`/`pinch`) a gesture needs between its own events.

   SW_CHROME_SELECTOR is the one list of "this is a UI panel, not the web
   canvas". `down` uses it so a press on real chrome never starts a drag;
   `wheel` uses it so a panel with its own scroll (Nearby's list, a
   dialog's padding) scrolls or selects natively instead of the wheel
   zooming the canon out from under it. A selector missing an entry here
   IS the scripture-web-2/8 defect, not a symptom of something else.
   `.sw-empty`/`.sw-legend`/`.sw-credit` are deliberately NOT listed: all
   three are `pointer-events: none` in app.css, so they can never be
   `e.target` in the first place — adding them here would be dead code.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Chrome the gesture surface must leave alone: controls, the topbar, every
 * dialog/sheet/list the screen opens, and any native form control wherever
 * it appears (the Go-to field lives inside `.sw-goto`, but a bare `input`
 * entry keeps this correct even if a future control lands outside a
 * `.sw-*` wrapper).
 */
export const SW_CHROME_SELECTOR =
  '.sw-controls, .sw-topbar, .sw-sheet, .sw-tip, .sw-goto, .sw-choice, .sw-list, button, input, select, textarea';

/** True when `target` is the chrome itself, or nested inside it. */
export function isChromeTarget(target) {
  return !!(target && target.closest && target.closest(SW_CHROME_SELECTOR));
}

/**
 * Wires pan/pinch/tap/double-tap/wheel-zoom onto `el`.
 *
 * @param {HTMLElement} el
 * @param {{
 *   loc: (e: PointerEvent) => {x:number, y:number},
 *   dpr: () => number,
 *   cam: () => {x:number, ppv:number, total:number},
 *   view: () => {W:number, H:number, DPR:number},
 *   handlers: () => {hover:Function, tap:Function, doubleTap:Function},
 *   schedule: () => void,
 *   maxZoom: () => number,
 *   clampCamera: (cam:object, width:number, maxZoom:number) => void,
 *   zoomAbout: (cam:object, width:number, x:number, factor:number, maxZoom:number) => void,
 *   xToVerse: (cam:object, width:number, x:number) => number,
 * }} deps
 * @returns {() => void} detach
 */
export function attachWebGestures(el, deps) {
  const { loc, dpr, cam, view, handlers, schedule, maxZoom, clampCamera, zoomAbout, xToVerse } = deps;
  const pointers = new Map();
  let drag = null, pinch = null, moved = false, lastTap = 0;

  const down = (e) => {
    // A tap on the chrome is the chrome's alone. Without this, pressing
    // "Essential" also picked whatever thread happened to run beneath the
    // button — the pointer events bubble up from the button into this
    // root-level gesture surface (the on-device double-activation report).
    if (isChromeTarget(e.target)) return;
    // setPointerCapture throws NotFoundError if the pointer is already gone
    // (or synthetic). Losing capture costs us nothing — the document-level
    // listeners still see the move — but letting it throw here would abort
    // the handler and leave the gesture dead.
    try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch (_e) { /* capture is optional */ }
    const pt = loc(e);
    pointers.set(e.pointerId, pt);
    moved = false;
    if (pointers.size === 2) {
      const [p, q] = Array.from(pointers.values());
      const mid = (p.x + q.x) / 2;
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), ppv: cam().ppv,
                mid, verse: xToVerse(cam(), view().W, mid * dpr()) };
      drag = null;
    } else {
      drag = { x: pt.x, camx: cam().x };
    }
  };
  const move = (e) => {
    const pt = loc(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
    const c = cam(), W = view().W;
    if (pinch && pointers.size === 2) {
      const [p, q] = Array.from(pointers.values());
      c.ppv = pinch.ppv * (Math.hypot(p.x - q.x, p.y - q.y) / Math.max(pinch.d, 1));
      clampCamera(c, W, maxZoom());
      c.x = pinch.verse - (pinch.mid * dpr() - W / 2) / c.ppv;
      clampCamera(c, W, maxZoom());
      moved = true; schedule(); return;
    }
    if (drag) {
      if (Math.abs(pt.x - drag.x) > 3) moved = true;
      c.x = drag.camx - (pt.x - drag.x) * dpr() / c.ppv;
      clampCamera(c, W, maxZoom());
      schedule(); return;
    }
    if (e.pointerType === 'mouse') handlers().hover(pt.x, pt.y);
  };
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !moved) {
      const pt = loc(e);
      const now = Date.now();
      if (now - lastTap < 300) { handlers().doubleTap(pt.x); lastTap = 0; }
      else { lastTap = now; handlers().tap(pt.x, pt.y); }
    }
    drag = null;
  };
  const cancel = (e) => { pointers.delete(e.pointerId); drag = null; pinch = null; };
  const wheel = (e) => {
    // A panel with its own scroll must scroll (or its text must select)
    // natively — the old unconditional preventDefault zoomed the canon out
    // from under a wheel or two-finger drag reading Nearby's list, a
    // dialog's padding, or a chooser row (scripture-web-2/8). Returning
    // WITHOUT preventDefault is the point: it lets the browser's own
    // scroll/selection run instead of substituting our own.
    if (isChromeTarget(e.target)) return;
    e.preventDefault();
    const c = cam(), W = view().W;
    zoomAbout(c, W, loc(e).x * dpr(), Math.exp(-e.deltaY * (e.ctrlKey ? 0.011 : 0.0021)), maxZoom());
    schedule();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
  };
}
