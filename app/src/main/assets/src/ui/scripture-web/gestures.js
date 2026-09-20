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
 *   cam: () => {x:number, y?:number, ppv:number, total:number},
 *   camFor?: (yDevice:number) => {x:number, y?:number, ppv:number, total:number},
 *   live?: () => void,
 *   view: () => {W:number, H:number, DPR:number},
 *   handlers: () => {hover:Function, tap:Function, doubleTap:Function},
 *   schedule: () => void,
 *   maxZoom: (cam?:object) => number,
 *   clampCamera: (cam:object, width:number, maxZoom:number, yf?:object) => void,
 *   zoomAbout: (cam:object, width:number, x:number, factor:number, maxZoom:number, yf?:object) => void,
 *   xToVerse: (cam:object, width:number, x:number) => number,
 *   yFrame?: (cam:object) => (object|null),
 * }} deps
 * @returns {() => void} detach
 */
export function attachWebGestures(el, deps) {
  const { loc, dpr, cam, view, handlers, schedule, maxZoom, clampCamera, zoomAbout, xToVerse } = deps;
  // r2: two rails, two cameras. deps.camFor(yDevice) names the camera under
  // the pointer (the Volumes rail above the gap's midline, the Bible rail
  // below); a surface without it (the canon web) has one camera for all.
  const camAt = (yCss) => (deps.camFor ? deps.camFor(yCss * dpr()) : cam());
  const zoomCap = (c) => maxZoom(c);
  // The y axis: the frame a camera moves its y inside (geometry.YFrame) —
  // the canon web's camera has one, a My Web rail has none and its y stays
  // 0. A finger moving DOWN shows what is higher, as a page does: the
  // picture follows the finger, so y (device px) grows with dy.
  const yFrameOf = (c) => (deps.yFrame ? deps.yFrame(c) : null);
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
      const pc = camAt((p.y + q.y) / 2);
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), ppv: pc.ppv, cam: pc,
                mid, verse: xToVerse(pc, view().W, mid * dpr()) };
      drag = null;
    } else {
      const dc = camAt(pt.y);
      drag = { x: pt.x, y: pt.y, camx: dc.x, camy: dc.y || 0, cam: dc };
    }
  };
  const move = (e) => {
    const pt = loc(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
    const W = view().W;
    if (pinch && pointers.size === 2) {
      const c = pinch.cam;
      const [p, q] = Array.from(pointers.values());
      const yf = yFrameOf(c);
      c.ppv = pinch.ppv * (Math.hypot(p.x - q.x, p.y - q.y) / Math.max(pinch.d, 1));
      clampCamera(c, W, zoomCap(c), yf);
      c.x = pinch.verse - (pinch.mid * dpr() - W / 2) / c.ppv;
      clampCamera(c, W, zoomCap(c), yf);
      moved = true; if (deps.live) deps.live(); schedule(); return;
    }
    if (drag) {
      const c = drag.cam;
      // Motion on EITHER axis is a gesture, not a tap. The web pans along x
      // (and along y once its camera has a y frame, below), but before that
      // a finger that travelled 100 px across the canon did not
      // tap: read from x alone, that swipe ended in handlers().tap, opened
      // the thread chooser over the canvas, and every drag after it began on
      // the sheet and moved nothing (Corbin, 2026-09-11: "you can't grab the
      // screen … and move around"; measured on the rotated phone frame).
      // The camera is the one under the finger when it went down (drag.cam,
      // the two-rail My Web's per-rail camera); a swipe across the gap
      // between the rails is likewise a gesture and not a tap.
      if (Math.hypot(pt.x - drag.x, pt.y - drag.y) > 3) moved = true;
      c.x = drag.camx - (pt.x - drag.x) * dpr() / c.ppv;
      const yf = yFrameOf(c);
      if (yf) c.y = drag.camy + (pt.y - drag.y) * dpr();
      clampCamera(c, W, zoomCap(c), yf);
      if (deps.live) deps.live(); schedule(); return;
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
    // A per-rail reset pill sits INSIDE the gap at the rail's left end,
    // exactly where a reader wheels to zoom the leftmost book (Vol I, Genesis):
    // it has no scroll of its own, so it declares the wheel passes through it
    // (data-wheel-through) and the rail beneath zooms. Its taps stay its own.
    if (isChromeTarget(e.target) && !(e.target.closest && e.target.closest('[data-wheel-through]'))) return;
    e.preventDefault();
    const pt = loc(e), W = view().W;
    const c = camAt(pt.y);
    zoomAbout(c, W, pt.x * dpr(), Math.exp(-e.deltaY * (e.ctrlKey ? 0.011 : 0.0021)), zoomCap(c), yFrameOf(c) || undefined);
    if (deps.live) deps.live();
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
