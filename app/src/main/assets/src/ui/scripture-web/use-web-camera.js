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
import { railFrame } from './rail-renderer.js';

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
 * go-to). reduceMotion: jump, no ease (default: the reader's prefers-reduced-motion).
 * @typedef {{ insetRight?: number, insetBottom?: number, ms?: number, reduceMotion?: boolean }} FlyOpts
 */

/**
 * @param {object} args
 * @param {any} args.graph  the decoded graph, or null while it loads
 * @param {import('../../utils/scripture-web/decode.js').Density} args.density  the density setting the shader draws
 * @param {{ current: string }} args.modeRef  'canonical' | 'personal', read per frame
 * @param {() => void} [args.schedule]  the frame loop's (use-frame-scheduler.js): flyTo draws through it
 */
export function useWebCamera({ graph, density, modeRef, schedule }) {
  const camRef = React.useRef(null);
  /* r2: the Volumes rail has a camera of its own, so the top and bottom halves
     zoom and pan independently (Corbin: "zoom into Rebuke [top] and on the
     bottom half zoom into Isaiah, both at once"). Seeded when the personal
     graph is built; clamped on every personal frame. */
  const camVRef = React.useRef(null);
  const lastRailRef = React.useRef('bottom');
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  // The focus (focus-state.js has the shape and who writes what): replaced
  // whole through focusState()/withLit(), except hover, which the hover rAF
  // writes in place. range2 is the group chosen inside a range (chooseGroup).
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
    const rails = railFrame({ H: v.H, DPR: v.DPR }, frame().base);
    const top = yDevice < (rails.topY + rails.bottomY) / 2;
    lastRailRef.current = top ? 'top' : 'bottom';
    return top ? cv : camRef.current;
  }, [frame, modeRef]);

  /**
   * Move the canon camera to a place (CONTRACTS.md §3). Resolves true on arrival, false when
   * there was nowhere to go or a newer fly or a gesture (cancelFly) took over. In My Web it moves
   * the Bible rail's camera, the one camRef holds.
   *
   * THE STUB IS INSTANT: it sets the camera, clamps it, schedules one frame and resolves. The
   * navigation stream gives it the ease (zoom out then in for a long hop; instant under reduced
   * motion) without changing this signature; every other stream only calls it.
   * @param {FlyTarget} target
   * @param {FlyOpts} [opts]
   * @returns {Promise<boolean>}
   */
  const flyTo = React.useCallback((target, opts = {}) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !target || !v.W) return Promise.resolve(false);
    const o = /** @type {FlyOpts} */ (opts || {});
    const right = (o.insetRight != null ? o.insetRight : panelInsetRef.current.right) * (v.DPR || 1);
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
      return Promise.resolve(false);
    }
    cam.ppv = Math.min(Math.max(ppv, fit), fit * cap);
    // the canvas area's centre, not the view's: the panel covers the right
    cam.x = cx + right / (2 * cam.ppv);
    if (typeof target.y === 'number') cam.y = target.y;
    clampCamera(cam, v.W, cap, yFrameFor(cam) || undefined);
    if (schedule) schedule();
    return Promise.resolve(true);
  }, [zoomCapFor, yFrameFor, schedule]);

  /** Stop a running fly where it is (a drag, pinch, wheel or key pan takes the camera). The
   * instant stub has nothing running; the gestures already call this through the screen. */
  const cancelFly = React.useCallback(() => {}, []);

  return {
    camRef, camVRef, lastRailRef, viewRef, focusRef, panelInsetRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor, flyTo, cancelFly,
  };
}
