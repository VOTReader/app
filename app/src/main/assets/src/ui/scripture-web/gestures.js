/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/gestures — Cluster F (bundle-d since lz1; lazy bundle-f before)

   The pointer/wheel wiring for the Scripture Web's pan/pinch/tap/zoom
   surface. Extracted verbatim out of ScriptureWebScreen's gesture effect
   (same closures, same order, same comments) so a real dispatched DOM
   event — not a screenshot — can prove it: jsdom builds a `.sw-root` with
   a `.sw-list` and a bare `input` inside it, fires pointerdown/wheel, and reads
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
   `e.target` in the first place — adding them here would be dead code
   (the legend's filter chips are buttons, listed as every button is).
   ═══════════════════════════════════════════════════════════════════════ */

import { prefersReducedMotion } from '../../utils/reduced-motion.js';

/**
 * Chrome the gesture surface must leave alone: controls, the topbar, every
 * dialog/sheet/list the screen opens, and any native form control wherever
 * it appears (a bare `input` entry keeps this correct even if a future
 * control lands outside a `.sw-*` wrapper).
 */
export const SW_CHROME_SELECTOR =
  '.sw-controls, .sw-topbar, .sw-sheet, .sw-tip, .sw-choice, .sw-list, .sw-goto, .sw-filter-sheet, .sw-filter-pill, '
  + 'button, input, select, textarea';

/** True when `target` is the chrome itself, or nested inside it. */
export function isChromeTarget(target) {
  return !!(target && target.closest && target.closest(SW_CHROME_SELECTOR));
}

/* A1 (w2 digest): how far a pointer may wander, CSS px, and still be a tap. A fingertip is wide
   and trembles; a stylus less; a mouse barely at all. One 3 px rule for every pointer made a
   finger's ordinary tap read as a drag on the phone, so the tap was lost. Until the pointer
   leaves its slop the camera holds still (a tap never nudges the web); once it does, the pan
   catches up to the finger in one step, from where the press began. */
const SLOP = { mouse: 3, pen: 6, touch: 10 };
/** The slop for a pointer type; an unknown one is treated as a finger. */
export function slopFor(pointerType) {
  return SLOP[pointerType] || SLOP.touch;
}
/** A second tap is a double only this soon after the first, and this close to it, CSS px: two
 * quick taps on two different lines are two choices, not a zoom. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 24;
/** One wheel line in CSS px (deltaMode 1, Firefox's mouse wheel); a page is the view's height.
 * A single event zooms by at most this much pixel delta, so a page-mode notch is not a leap. */
const WHEEL_LINE_PX = 16;
const WHEEL_MAX_PX = 300;
/* A4: a drag let go while moving glides on and slows (fling inertia), as a page does under a
   flicked finger. The speed is read over the last FLING_WINDOW_MS of the drag up to the lift (a
   finger that rested before it lifted has none left); it decays with FLING_TAU_MS and stops under
   FLING_STOP (CSS px per ms) or against the canon's ends. None under reduced motion. */
const FLING_WINDOW_MS = 100;
const FLING_MIN = 0.35;
const FLING_STOP = 0.02;
const FLING_TAU_MS = 325;

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
 *   handlers: () => {hover:Function, tap:Function, doubleTap:Function, leave?:Function, snapshot?:() => (() => void)},
 *   schedule: () => void,
 *   maxZoom: (cam?:object) => number,
 *   clampCamera: (cam:object, width:number, maxZoom:number, yf?:object) => void,
 *   zoomAbout: (cam:object, width:number, x:number, factor:number, maxZoom:number, yf?:object, anchorY?:number) => void,
 *   xToVerse: (cam:object, width:number, x:number) => number,
 *   yFrame?: (cam:object) => (object|null),
 *   lift?: (xCss:number, yCss:number) => (((yCss:number) => void)|null),
 *   animate?: (step:(ms:number) => (boolean|void), onEnd?:((arrived:boolean) => void)|null) => (() => void),
 *   reduceMotion?: () => boolean,
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
  // The elevator (landing 14): deps.lift(xCss, yCss) answers a function of
  // yCss when the pointer went down on the track, and that function, not the
  // pan, follows the finger until it lifts; a tap on the track is the same
  // function called once. Absent, or null, the pointer is the web's.
  const liftAt = (x, y) => (deps.lift ? deps.lift(x, y) : null);
  const pointers = new Map();
  // drag: the one pointer that pans (its id, where it went down, its slop); pinch: the two
  // pointers that zoom (their ids). lastTap: the first tap of a possible double, with the undo
  // of what it opened.
  let drag = null, pinch = null, moved = false, lastTap = null;
  // caught: the press now down stopped a glide (w4 device check). Like a native scroller's
  // catch it is no tap, and no first tap of a double, however still it lifts.
  let caught = false;
  // the running fling's stop (deps.animate's), or null
  let stopFling = null;
  const endFling = () => { if (stopFling) { const stop = stopFling; stopFling = null; stop(); } };
  const reduced = () => (deps.reduceMotion ? deps.reduceMotion() : prefersReducedMotion());
  /** Where the dragging pointer was over the last FLING_WINDOW_MS, for the speed it lifts at. */
  const sample = (d, pt) => {
    const t = performance.now();
    d.samples.push({ t, x: pt.x, y: pt.y });
    while (d.samples.length > 2 && t - d.samples[0].t > FLING_WINDOW_MS) d.samples.shift();
  };
  /** A drag let go while moving glides on (A4). */
  const fling = (d) => {
    if (!deps.animate || reduced() || d.samples.length < 2) return;
    const last = d.samples[d.samples.length - 1], first = d.samples[0];
    const span = last.t - first.t;
    if (span <= 0) return;
    let vx = (last.x - first.x) / span, vy = (last.y - first.y) / span;
    if (Math.hypot(vx, vy) < FLING_MIN) return;
    const c = d.cam;
    const stop = deps.animate((ms) => {
      const yf = yFrameOf(c);
      const k = Math.exp(-ms / FLING_TAU_MS);
      // the travel this frame: the decaying speed's integral over it
      const tx = vx * FLING_TAU_MS * (1 - k), ty = vy * FLING_TAU_MS * (1 - k);
      const bx = c.x, by = c.y;
      c.x -= (tx * dpr()) / c.ppv;
      if (yf) c.y = (c.y > 0 ? c.y : 0) + ty * dpr();
      clampCamera(c, view().W, zoomCap(c), yf);
      vx *= k; vy *= k;
      if (deps.live) deps.live();
      return Math.hypot(vx, vy) >= FLING_STOP && (c.x !== bx || c.y !== by);
    }, () => { if (stopFling === stop) stopFling = null; });
    stopFling = stop;
  };

  /** Two fingers pinch: the first two still down. A third finger rides along without steering;
   * if one of the two lifts while it is down, it and the one left pinch on from where they are. */
  const seedPinch = () => {
    const ids = Array.from(pointers.keys()).slice(0, 2);
    const p = pointers.get(ids[0]), q = pointers.get(ids[1]);
    const mid = (p.x + q.x) / 2;
    const pc = camAt((p.y + q.y) / 2);
    pinch = { ids, d: Math.hypot(p.x - q.x, p.y - q.y), ppv: pc.ppv, y: pc.y > 0 ? pc.y : 0, cam: pc,
              mid, midY: (p.y + q.y) / 2, verse: xToVerse(pc, view().W, mid * dpr()) };
    drag = null;
    // a second finger down means this press is no tap
    moved = true;
  };

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
    // a press catches a gliding web where it is, and that catch is no tap
    const gliding = !!stopFling;
    endFling();
    // the first pointer of a new gesture: anything still recorded is a ghost whose up never came
    if (e.isPrimary && pointers.size) { pointers.clear(); drag = null; pinch = null; }
    const pt = loc(e);
    pointers.set(e.pointerId, pt);
    // a third finger while two pinch is registered (its up must not tap) but steers nothing
    if (pinch) return;
    if (pointers.size >= 2) { seedPinch(); return; }
    moved = false;
    caught = gliding;
    const dc = camAt(pt.y);
    drag = { id: e.pointerId, x: pt.x, y: pt.y, camx: dc.x, camy: dc.y || 0, cam: dc,
             lift: liftAt(pt.x, pt.y), slop: slopFor(e.pointerType), samples: [] };
    sample(drag, pt);
  };
  // W52: a pointer that went down on the chrome (or anywhere this code did
  // not register it) is the chrome's for its whole life: its move must not
  // pan, its up must not tap, and its cancel must not end another finger's
  // drag. A mouse moving with no button down still hovers the web, but not
  // through the chrome: over a control or the topbar it lets go of what it
  // hovered (a reach for Reset lit the threads under the button and put a
  // chip beside it), as it does when it leaves the web.
  const leave = () => { const h = handlers(); if (h && typeof h.leave === 'function') h.leave(); };
  const move = (e) => {
    if (!pointers.has(e.pointerId)) {
      if (drag || pinch || e.pointerType !== 'mouse') return;
      if (isChromeTarget(e.target)) { leave(); return; }
      const pt = loc(e);
      handlers().hover(pt.x, pt.y);
      return;
    }
    const pt = loc(e);
    pointers.set(e.pointerId, pt);
    const W = view().W;
    if (pinch) {
      // the pinch reads its own two fingers: a third one moving steers nothing (it once panned
      // the web from the third finger's press while the other two zoomed it)
      if (!pinch.ids.includes(e.pointerId)) return;
      const c = pinch.cam;
      const p = pointers.get(pinch.ids[0]), q = pointers.get(pinch.ids[1]);
      const yf = yFrameOf(c);
      c.ppv = pinch.ppv * (Math.hypot(p.x - q.x, p.y - q.y) / Math.max(pinch.d, 1));
      clampCamera(c, W, zoomCap(c), yf);
      // in the sky the world height under the pinch's centre stays under it
      // (heights scale with the zoom, geometry.zoomAbout); at rest the
      // baseline is sticky
      if (yf && pinch.y > 0) {
        const ay = pinch.midY * dpr();
        const baseY = /** @type {{base:number}} */ (yf).base;
        c.y = (c.ppv / pinch.ppv) * (baseY + pinch.y - ay) + ay - baseY;
      }
      c.x = pinch.verse - (pinch.mid * dpr() - W / 2) / c.ppv;
      clampCamera(c, W, zoomCap(c), yf);
      moved = true; if (deps.live) deps.live(); schedule(); return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.lift) {
      if (Math.hypot(pt.x - drag.x, pt.y - drag.y) > drag.slop) moved = true;
      drag.lift(pt.y);
      if (deps.live) deps.live(); schedule(); return;
    }
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
    // Inside the slop it is still a tap and the camera holds (slopFor, above).
    if (!moved && Math.hypot(pt.x - drag.x, pt.y - drag.y) <= drag.slop) return;
    moved = true;
    sample(drag, pt);
    c.x = drag.camx - (pt.x - drag.x) * dpr() / c.ppv;
    const yf = yFrameOf(c);
    if (yf) c.y = drag.camy + (pt.y - drag.y) * dpr();
    clampCamera(c, W, zoomCap(c), yf);
    if (deps.live) deps.live(); schedule();
  };
  // sweep v074: a pinch that ends with one finger still down hands the pan
  // to that finger. down() nulled `drag` when the pinch began, so the finger
  // left behind sat in `pointers` with neither a pinch nor a drag, and every
  // move it made did nothing until all fingers lifted and the reader pressed
  // again. It picks up from where it rests now (no jump), on the camera
  // under it, the shape down() seeds; never on the elevator (a pinch is not
  // a press on the track), and with `moved` set so its lift is not a tap.
  const handOff = () => {
    if (pointers.size !== 1) return;
    const [[id, pt]] = Array.from(pointers.entries());
    const dc = camAt(pt.y);
    drag = { id, x: pt.x, y: pt.y, camx: dc.x, camy: dc.y || 0, cam: dc, lift: null, slop: 0, samples: [] };
    sample(drag, pt);
    moved = true;
  };
  /** A pinch finger left (up or cancel): with two still down they pinch on, with one it pans. */
  const pinchFingerGone = () => {
    pinch = null;
    if (pointers.size >= 2) seedPinch();
    else handOff();
  };
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pinch.ids.includes(e.pointerId)) pinchFingerGone(); return; }
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.lift) {
      // a tap on the track jumps there; never a web tap, never a double-tap zoom
      if (!moved) { drag.lift(loc(e).y); schedule(); }
      lastTap = null;
    } else if (!moved && caught) {
      // the press only stopped the glide
      lastTap = null;
    } else if (!moved) {
      const pt = loc(e);
      const now = Date.now();
      const first = lastTap;
      if (first && now - first.t < DOUBLE_TAP_MS && Math.hypot(pt.x - first.x, pt.y - first.y) <= DOUBLE_TAP_PX) {
        // A1: the double takes back what its first tap opened (the card, the chosen line), so a
        // double-tap only zooms
        lastTap = null;
        if (first.undo) first.undo();
        handlers().doubleTap(pt.x, pt.y);
      } else {
        const h = handlers();
        lastTap = { t: now, x: pt.x, y: pt.y, undo: h.snapshot ? h.snapshot() : null };
        h.tap(pt.x, pt.y);
      }
    } else {
      sample(drag, loc(e));
      fling(drag);
    }
    drag = null;
    caught = false;
  };
  const cancel = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pinch) { if (pinch.ids.includes(e.pointerId)) pinchFingerGone(); return; }
    if (drag && drag.id === e.pointerId) drag = null;
  };
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
    endFling();
    const pt = loc(e), v = view(), W = v.W;
    const c = camAt(pt.y);
    // A1: every wheel in CSS px: a line wheel (deltaMode 1) and a page wheel (2) read as their
    // pixel travel, so one notch zooms alike in every browser. A sideways wheel (a trackpad's
    // two-finger swipe, a tilt wheel, shift+wheel) pans along the canon; up and down zoom; a
    // trackpad pinch (ctrlKey) always zooms.
    const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? (v.H / (v.DPR || 1) || 600) : 1;
    let dx = (e.deltaX || 0) * unit, dy = (e.deltaY || 0) * unit;
    if (e.shiftKey && !e.ctrlKey && !dx) { dx = dy; dy = 0; }
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) {
      c.x += (dx * dpr()) / c.ppv;
      clampCamera(c, W, zoomCap(c), yFrameOf(c));
    } else {
      dy = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, dy));
      zoomAbout(c, W, pt.x * dpr(), Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0021)), zoomCap(c), yFrameOf(c) || undefined, pt.y * dpr());
    }
    if (deps.live) deps.live();
    schedule();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  const out = (e) => { if (e.pointerType === 'mouse') leave(); };
  el.addEventListener('pointerleave', out);
  return () => {
    endFling();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('pointerleave', out);
  };
}
