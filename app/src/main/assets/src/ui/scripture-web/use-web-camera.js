/* ═══════════════════════════════════════════════════════════════════════
   useWebCamera — the Scripture Web's cameras, view and focus.
   Cluster F (bundle-f), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen (v15-code-health-06): the per-frame state
   the draw loop, the gestures and the tap test all share — the canon camera,
   the Volumes rail's own camera, the view size, the focused thread — and the
   callbacks that read it. Everything here is a REF or an identity-stable
   callback, deliberately NOT React state: gestures move the camera hundreds
   of times a second and a re-render per move would drop frames. The maths
   is in utils/scripture-web/web-frame.js, pure and tested. */

import { maxSpanOf } from '../../utils/scripture-web/decode.js';
import { maxZoomFor } from '../../utils/scripture-web/geometry.js';
import { webFrame, webViewArgs, webYFrame, maxZoomOf } from '../../utils/scripture-web/web-frame.js';
import { railFrame } from './rail-renderer.js';

/**
 * @param {object} args
 * @param {any} args.graph  the decoded graph, or null while it loads
 * @param {import('../../utils/scripture-web/decode.js').Density} args.density  the density setting the shader draws
 * @param {{ current: string }} args.modeRef  'canonical' | 'personal', read per frame
 */
export function useWebCamera({ graph, density, modeRef }) {
  const camRef = React.useRef(null);
  /* r2: the Volumes rail has a camera of its own, so the top and bottom halves
     zoom and pan independently (Corbin: "zoom into Rebuke [top] and on the
     bottom half zoom into Isaiah, both at once"). Seeded when the personal
     graph is built; clamped on every personal frame. */
  const camVRef = React.useRef(null);
  const lastRailRef = React.useRef('bottom');
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  // range2: the group chosen inside a range (chooseGroup), drawn as a second band.
  const focusRef = React.useRef(/** @type {{ arc: number, range: any, range2?: [number, number] | null }} */ ({ arc: -1, range: null }));

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

  return { camRef, camVRef, lastRailRef, viewRef, focusRef, frame, viewFor, zoomCapFor, yFrameFor, camFor };
}
