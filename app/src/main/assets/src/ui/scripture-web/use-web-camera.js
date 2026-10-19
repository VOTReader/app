/* ═══════════════════════════════════════════════════════════════════════
   useWebCamera — the Scripture Web's cameras, view and focus.
   Cluster F (bundle-d since lz1), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen (v15-code-health-06): the per-frame state
   the draw loop, the gestures and the tap test all share — the canon camera,
   the Volumes rail's own camera, the view size, the focused thread — and the
   callbacks that read it. Everything here is a REF or an identity-stable
   callback, deliberately NOT React state: gestures move the camera hundreds
   of times a second and a re-render per move would drop frames. The maths
   is in utils/scripture-web/web-frame.js, pure and tested.

   The shared contracts held here (CONTRACTS.md §2, §3, §5):
     focusRef       the focus (utils/scripture-web/focus-state.js): what is
                    chosen, hovered and lit; viewFor() hands it to the renderer
     panelInsetRef  { right, bottom }, CSS px the open panel covers; the panel
                    stream writes it, flyTo frames around it, the overlay keeps
                    its labels out of it
     flyTo          the one way code moves the camera to a place (go-to, Follow,
                    a book name, the panel's framing); cancelFly stops one
     slackFor       the camera clamp's room for the docked panel (geometry.js
                    clampCamera's `right`): flyTo, the gestures, the keys and
                    the resize all clamp with it, so the canon's end stops at
                    the canvas area's right edge, not under the panel (and, in
                    My Web, each rail's end: w4); settleInset brings the
                    camera back inside the view's own bound once the panel
                    stops covering the right
     settledAt      (the navigation stream, A6) the chapter in the lens where the
                    camera last came to rest: state, set once no frame has moved
                    the camera for SETTLE_MS, and only when the chapter changes,
                    so what reads "near here" (Nearby) re-derives on arrival,
                    never per frame. -1 until the first rest. Needs onFrame. */

import { maxSpanOf } from '../../utils/scripture-web/decode.js';
import { maxZoomFor, fitPPV, clampCamera } from '../../utils/scripture-web/geometry.js';
import { webFrame, webViewArgs, webYFrame, maxZoomOf } from '../../utils/scripture-web/web-frame.js';
import { focusState } from '../../utils/scripture-web/focus-state.js';
import { flyPath, flyMs, easeInOutCubic } from '../../utils/scripture-web/fly-path.js';
import { prefersReducedMotion } from '../../utils/reduced-motion.js';
import { railFrame, chromeInset } from './rail-renderer.js';
import { nearbyChapter } from '../../utils/scripture-web/pick.js';

/** How long the camera must go unmoved to count as at rest (A6): past a fling's last frames and a
 * key's repeat, short enough that Nearby has caught up by the time the eye has. */
export const SETTLE_MS = 180;

/**
 * Where flyTo takes the camera: a canon x range to frame across the canvas area (edge to edge;
 * pad it yourself: the spec's 10 % margins for a connection, ~70 % for a chapter), or a canon x
 * to centre at a zoom (a multiple of fit; absent keeps the zoom). Canon x is the verse axis:
 * verse v spans [v, v + 1). `y` is the camera height, device px (absent keeps it).
 * @typedef {{ x0: number, x1: number, y?: number } | { x: number, zoom?: number, y?: number }} FlyTarget
 */
/**
 * insetRight / insetBottom: CSS px the panel covers (default panelInsetRef's); the canvas area is
 * the view minus them. ms: the ease's length (the spec's 450 for a connection, 600-900 for a
 * go-to). reduceMotion: jump, no ease (default: the reader's prefers-reduced-motion). anchor (the
 * navigation stream's addition, optional): a view x, CSS px, to zoom about on the way - the verse
 * under it stays under it, as a double-tap's zoom does - instead of the zoom-out-then-in path.
 * @typedef {{ insetRight?: number, insetBottom?: number, ms?: number, reduceMotion?: boolean,
 *   anchor?: number }} FlyOpts
 */

/**
 * @param {object} args
 * @param {any} args.graph  the decoded graph, or null while it loads
 * @param {import('../../utils/scripture-web/decode.js').Density} args.density  the density setting the shader draws
 * @param {{ current: string }} args.modeRef  'canonical' | 'personal', read per frame
 * @param {() => void} [args.schedule]  the frame loop's (use-frame-scheduler.js): flyTo draws through it
 * @param {{ current: any }} [args.topbarRef]  the top chrome, whose bottom edge the Volumes rail clears
 *   (camFor splits the rails where the draw places them)
 * @param {(step: (ms: number) => (boolean | void), onEnd?: (arrived: boolean) => void) => () => void} [args.animate]
 *   the frame loop's one motion (use-frame-scheduler.js): flyTo eases through it; without it a fly is instant
 * @param {(fn: () => void) => () => void} [args.onFrame]  the frame loop's after-draw listeners
 *   (use-frame-scheduler.js): settledAt watches the camera through it; without it settledAt stays -1
 */
export function useWebCamera({ graph, density, modeRef, schedule, topbarRef, animate, onFrame }) {
  const camRef = React.useRef(null);
  /* r2: the Volumes rail has a camera of its own, so the top and bottom halves
     zoom and pan independently (Corbin: "zoom into Rebuke [top] and on the
     bottom half zoom into Isaiah, both at once"). Seeded when the personal
     graph is built; clamped on every personal frame. */
  const camVRef = React.useRef(null);
  const lastRailRef = React.useRef('bottom');
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  // The focus (focus-state.js has the shape and who writes what): replaced
  // whole through focusState()/withLit(), except hover, hoverProphecy and
  // hoverUnderlay, which the hover rAF writes in place. range2 is reserved and always null
  // (focus-state.js).
  const focusRef = React.useRef(/** @type {import('../../utils/scripture-web/focus-state.js').Focus} */ (focusState()));
  // CSS px the open panel covers (right: docked; bottom: the sheet under 560 px).
  // The panel stream writes it; nothing else does. Zero while no panel is open.
  const panelInsetRef = React.useRef({ right: 0, bottom: 0 });

  /** The vertical frame (web-frame.webFrame) for the current view and mode. */
  const frame = React.useCallback(() => webFrame(viewRef.current, modeRef.current === 'personal'), [modeRef]);

  /** What the web renderer is told for this frame. */
  const viewFor = React.useCallback(
    () => webViewArgs(viewRef.current, camRef.current, frame(), density, focusRef.current),
    [density, frame],
  );

  /** The ceiling for whichever camera is asked about: the Bible's is a
   * relation on the canon (44 CSS px a verse); the Volumes' the same
   * relation on its own rail. */
  const zoomCapFor = React.useCallback((c) => {
    const v = viewRef.current;
    if (c && c === camVRef.current) return maxZoomFor(c.total, (v.W || 1) / (v.DPR || 1));
    return maxZoomOf(graph, v);
  }, [graph]);

  /** The widest thread's span, verses: the y camera's ceiling reads the law
   * at it. Once per graph. */
  const maxSpan = React.useMemo(() => (graph ? maxSpanOf(graph) : 0), [graph]);

  /** The frame the canon camera moves its y inside (geometry.YFrame); null
   * for a My Web rail, whose world is exactly the frame. Absence is the
   * signal: clampCamera without a frame holds y at 0. */
  const yFrameFor = React.useCallback((c) => {
    if (modeRef.current === 'personal' || !c || c !== camRef.current) return null;
    return webYFrame(viewRef.current, frame(), maxSpan);
  }, [frame, maxSpan, modeRef]);

  /** The camera under a device-px y: above the gap's midline the Volumes
   * rail, below it the Bible rail; the canon web has one camera for all. */
  const camFor = React.useCallback((yDevice) => {
    const cv = camVRef.current;
    if (modeRef.current !== 'personal' || !cv) return camRef.current;
    const v = viewRef.current;
    // the rails as the draw places them, the top chrome's inset included (fix-review #7)
    const rails = railFrame({ H: v.H, DPR: v.DPR, inset: chromeInset(topbarRef && topbarRef.current, v.DPR) }, frame().base);
    const top = yDevice < (rails.topY + rails.bottomY) / 2;
    lastRailRef.current = top ? 'top' : 'bottom';
    return top ? cv : camRef.current;
  }, [frame, modeRef, topbarRef]);

  /**
   * The clamp's slack for the docked panel (geometry.clampCamera's `right`), device px: what the
   * panel covers on the right now, or what a fly is told it will (`flyRight`, device px, before the
   * panel renders), whichever is more. The canon camera has one, and in My Web both rails' cameras
   * (w4: through w3 My Web's rails kept the view's own edges, so the Bible rail's last verses and the
   * Volumes rail's last collections stayed under a docked panel at any zoom). A camera the screen
   * does not hold has none.
   * @param {any} c  the camera being clamped
   * @param {number} [flyRight]
   */
  const slackFor = React.useCallback((/** @type {any} */ c, flyRight = 0) => {
    if (!c || (c !== camRef.current && !(modeRef.current === 'personal' && c === camVRef.current))) return 0;
    const v = viewRef.current;
    const now = (panelInsetRef.current && panelInsetRef.current.right > 0 ? panelInsetRef.current.right : 0) * (v.DPR || 1);
    return Math.max(now, flyRight > 0 ? flyRight : 0);
  }, [modeRef]);

  /** Where a target puts the camera, read against the view and the inset now (CONTRACTS.md §3):
   * the zoom clamped to [fit, fit x cap], the centre of the CANVAS AREA (the view less the panel on
   * the right). Null for a target that names no place. */
  const destination = React.useCallback((cam, target, rightCss) => {
    const v = viewRef.current;
    const right = rightCss * (v.DPR || 1);
    const areaW = Math.max(1, v.W - right);
    const fit = fitPPV(cam, v.W);
    const cap = zoomCapFor(cam);
    let ppv = cam.ppv, cx;
    if ('x0' in target && target.x1 > target.x0) {
      ppv = areaW / (target.x1 - target.x0);
      cx = (target.x0 + target.x1) / 2;
    } else if ('x' in target && Number.isFinite(target.x)) {
      if (target.zoom > 0) ppv = fit * target.zoom;
      cx = target.x;
    } else {
      return null;
    }
    return { cx, ppv: Math.min(Math.max(ppv, fit), fit * cap), right, areaW, cap };
  }, [zoomCapFor]);

  /** Put the camera at a destination: the arrival every fly ends on, exactly. */
  const land = React.useCallback((cam, d, target) => {
    cam.ppv = d.ppv;
    // the canvas area's centre, not the view's: the panel covers the right
    cam.x = d.cx + d.right / (2 * cam.ppv);
    if (typeof target.y === 'number') cam.y = target.y;
    clampCamera(cam, viewRef.current.W, d.cap, yFrameFor(cam) || undefined, slackFor(cam, d.right));
  }, [yFrameFor, slackFor]);

  // the running fly's stop (the frame loop's motion), so cancelFly and a newer fly can end it
  const flyStopRef = React.useRef(/** @type {null | (() => void)} */ (null));

  /**
   * Move the canon camera to a place (CONTRACTS.md §3). Resolves true on arrival, false when
   * there was nowhere to go or a newer fly or a gesture (cancelFly) took over. In My Web it moves
   * the Bible rail's camera, the one camRef holds.
   *
   * A3 (the navigation stream): it EASES, through the frame loop's one motion (animate): along
   * van Wijk and Nuij's path (fly-path.js), so a long hop zooms out then in, for opts.ms or
   * 600-900 ms by the hop's length. The panel's inset is read every frame, so a panel that opens
   * while the camera flies is flown around. Under reduced motion (the reader's setting, or
   * opts.reduceMotion), or with no frame loop, it jumps there at once.
   * @param {FlyTarget} target
   * @param {FlyOpts} [opts]
   * @returns {Promise<boolean>}
   */
  const flyTo = React.useCallback((target, opts = {}) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !target || !v.W) return Promise.resolve(false);
    const o = /** @type {FlyOpts} */ (opts || {});
    const rightCss = () => (o.insetRight != null ? o.insetRight : panelInsetRef.current.right);
    const d0 = destination(cam, target, rightCss());
    if (!d0) return Promise.resolve(false);
    // a newer fly takes over from one running
    if (flyStopRef.current) flyStopRef.current();
    const reduce = o.reduceMotion != null ? o.reduceMotion : prefersReducedMotion();
    // the path in the canvas area's own terms: its centre and its width in verses
    const c0 = cam.x - d0.right / (2 * cam.ppv);
    const path = flyPath(c0, d0.areaW / cam.ppv, d0.cx, d0.areaW / d0.ppv);
    if (!animate || reduce || !(Math.abs(path.S) > 1e-3)) {
      // a jump still ends whatever motion was running (a fling must not carry on from here)
      if (animate) animate(() => false);
      land(cam, d0, target);
      if (schedule) schedule();
      return Promise.resolve(true);
    }
    const ms = o.ms > 0 ? o.ms : flyMs(path.S);
    const y0 = cam.y > 0 ? cam.y : 0;
    // a zoom about a point: the zoom eases in log space with the anchor's verse held under it,
    // and what the clamp moves at the end is spread along the way, so the arrival never jumps
    const ppv0 = cam.ppv;
    const ax = typeof o.anchor === 'number' ? o.anchor * (v.DPR || 1) : null;
    const aVerse = ax == null ? 0 : cam.x + (ax - v.W / 2) / ppv0;
    const xEnd = d0.cx + d0.right / (2 * d0.ppv);
    const xDrift = ax == null ? 0 : xEnd - (aVerse - (ax - v.W / 2) / d0.ppv);
    let t = 0, lost = false;
    return new Promise((resolve) => {
      const stop = animate((dt) => {
        // the camera was replaced under the fly (a rebuild, a mode switch): it has nowhere to land
        if (camRef.current !== cam) { lost = true; return false; }
        t = Math.min(1, t + dt / ms);
        if (t >= 1) {
          // the arrival read now (the inset may have moved), at the zoom a zoomless target kept
          // when the fly began, not the one the fly passes through
          const d = destination({ x: cam.x, ppv: ppv0, total: cam.total }, target, rightCss());
          if (d) land(cam, d, target);
          return false;
        }
        const e = easeInOutCubic(t);
        const vNow = viewRef.current;
        const fit = fitPPV(cam, vNow.W), cap = zoomCapFor(cam);
        const right = rightCss() * (vNow.DPR || 1);
        if (ax != null) {
          cam.ppv = Math.min(Math.max(ppv0 * Math.pow(d0.ppv / ppv0, e), fit), fit * cap);
          cam.x = aVerse - (ax - vNow.W / 2) / cam.ppv + xDrift * e;
        } else {
          const [c, w] = path.at(e);
          cam.ppv = Math.min(Math.max(Math.max(1, vNow.W - right) / w, fit), fit * cap);
          cam.x = c + right / (2 * cam.ppv);
        }
        if (typeof target.y === 'number') cam.y = y0 + (target.y - y0) * e;
        clampCamera(cam, vNow.W, cap, yFrameFor(cam) || undefined, slackFor(cam, right));
        return true;
      }, (arrived) => {
        if (flyStopRef.current === stop) flyStopRef.current = null;
        resolve(arrived && !lost);
      });
      flyStopRef.current = stop;
    });
  }, [destination, land, animate, schedule, zoomCapFor, yFrameFor, slackFor]);

  /** Stop a running fly where it is (a drag, pinch, wheel or key pan takes the camera); its
   * promise resolves false. Safe with nothing running. */
  const cancelFly = React.useCallback(() => {
    if (flyStopRef.current) flyStopRef.current();
  }, []);

  /**
   * The panel stopped covering the right (it closed, or became the bottom sheet): a camera its
   * slack let stand past the view's own bound eases back inside it, at the same zoom, rather than
   * jumping there at the reader's next drag. usePanelInset calls it once the inset has shrunk. A fly
   * running already clamps with the new inset every frame, so it is left to land. My Web's Volumes
   * rail (w4) has no fly: it steps back inside at once, as its per-frame clamp would on the next frame.
   */
  const settleInset = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    const cv = modeRef.current === 'personal' ? camVRef.current : null;
    if (cv && v.W) {
      const was = cv.x;
      clampCamera(cv, v.W, zoomCapFor(cv), undefined, slackFor(cv));
      if (cv.x !== was && schedule) schedule();
    }
    if (!cam || !v.W || flyStopRef.current) return;
    const to = clampCamera({ x: cam.x, ppv: cam.ppv, total: cam.total, y: cam.y }, v.W, zoomCapFor(cam),
      yFrameFor(cam) || undefined, slackFor(cam));
    if (!(Math.abs(to.x - cam.x) * cam.ppv > 0.5)) return;
    // flyTo centres x in the canvas area: what the panel still covers is added back on landing
    const right = (panelInsetRef.current && panelInsetRef.current.right > 0 ? panelInsetRef.current.right : 0) * (v.DPR || 1);
    flyTo({ x: to.x - right / (2 * to.ppv) });
  }, [zoomCapFor, yFrameFor, slackFor, flyTo, modeRef, schedule]);

  // A6: where the camera came to rest. Each drawn frame compares the camera with the last one;
  // a move restarts the wait, and SETTLE_MS without one reads the chapter in the lens.
  const [settledAt, setSettledAt] = React.useState(-1);
  React.useEffect(() => {
    if (typeof onFrame !== 'function' || !graph) return undefined;
    let timer = 0, seen = '';
    const rest = () => {
      timer = 0;
      const c = camRef.current, v = viewRef.current;
      if (!c || !v.W) return;
      const ci = nearbyChapter(graph, c, v.W);
      setSettledAt((was) => (was === ci ? was : ci));
    };
    const off = onFrame(() => {
      const c = camRef.current;
      if (!c) return;
      const now = c.x + ',' + c.ppv + ',' + viewRef.current.W;
      if (now === seen) return;
      seen = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(rest, SETTLE_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [onFrame, graph]);

  return {
    camRef, camVRef, lastRailRef, viewRef, focusRef, panelInsetRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor, flyTo, cancelFly, settledAt, slackFor, settleInset,
  };
}
