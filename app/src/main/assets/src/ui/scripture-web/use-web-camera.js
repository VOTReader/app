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
                    a book name, the panel's framing); cancelFly stops one */

import { maxSpanOf } from '../../utils/scripture-web/decode.js';
import { maxZoomFor, fitPPV, clampCamera } from '../../utils/scripture-web/geometry.js';
import { webFrame, webViewArgs, webYFrame, maxZoomOf } from '../../utils/scripture-web/web-frame.js';
import { focusState } from '../../utils/scripture-web/focus-state.js';
import { flyPath, flyMs, easeInOutCubic } from '../../utils/scripture-web/fly-path.js';
import { prefersReducedMotion } from '../../utils/reduced-motion.js';
import { railFrame, chromeInset } from './rail-renderer.js';

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
 */
export function useWebCamera({ graph, density, modeRef, schedule, topbarRef, animate }) {
  const camRef = React.useRef(null);
  /* r2: the Volumes rail has a camera of its own, so the top and bottom halves
     zoom and pan independently (Corbin: "zoom into Rebuke [top] and on the
     bottom half zoom into Isaiah, both at once"). Seeded when the personal
     graph is built; clamped on every personal frame. */
  const camVRef = React.useRef(null);
  const lastRailRef = React.useRef('bottom');
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  // The focus (focus-state.js has the shape and who writes what): replaced
  // whole through focusState()/withLit(), except hover and hoverProphecy,
  // which the hover rAF writes in place. range2 is the group chosen inside a range (chooseGroup).
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
    clampCamera(cam, viewRef.current.W, d.cap, yFrameFor(cam) || undefined);
  }, [yFrameFor]);

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
        if (ax != null) {
          cam.ppv = Math.min(Math.max(ppv0 * Math.pow(d0.ppv / ppv0, e), fit), fit * cap);
          cam.x = aVerse - (ax - vNow.W / 2) / cam.ppv + xDrift * e;
        } else {
          const [c, w] = path.at(e);
          const right = rightCss() * (vNow.DPR || 1);
          cam.ppv = Math.min(Math.max(Math.max(1, vNow.W - right) / w, fit), fit * cap);
          cam.x = c + right / (2 * cam.ppv);
        }
        if (typeof target.y === 'number') cam.y = y0 + (target.y - y0) * e;
        clampCamera(cam, vNow.W, cap, yFrameFor(cam) || undefined);
        return true;
      }, (arrived) => {
        if (flyStopRef.current === stop) flyStopRef.current = null;
        resolve(arrived && !lost);
      });
      flyStopRef.current = stop;
    });
  }, [destination, land, animate, schedule, zoomCapFor, yFrameFor]);

  /** Stop a running fly where it is (a drag, pinch, wheel or key pan takes the camera); its
   * promise resolves false. Safe with nothing running. */
  const cancelFly = React.useCallback(() => {
    if (flyStopRef.current) flyStopRef.current();
  }, []);

  return {
    camRef, camVRef, lastRailRef, viewRef, focusRef, panelInsetRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor, flyTo, cancelFly,
  };
}
