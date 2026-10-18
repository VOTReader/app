/* ═══════════════════════════════════════════════════════════════════════
   usePersonalWeb — My Web: the reader's own links on the dual rail.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the built web
   (personalRef, from utils/scripture-web/personal-build.js) and its link
   count, rebuilt whenever the mode, the links (LinkStore's version) or the
   lazily loaded Bible studies change, with a fresh camera for the Volumes
   rail; and railOpts(), everything the rail renderer needs to place a
   personal endpoint in this frame. */

import { createCamera, verseToX } from '../../utils/scripture-web/geometry.js';
import { buildPersonal } from '../../utils/scripture-web/personal-build.js';

/** Subscribe to LinkStore so the personal web follows new links live. */
function useLinkVersion() {
  const subscribe = React.useCallback((cb) => {
    if (typeof LinkStore === 'undefined') return () => {};
    return LinkStore.subscribe(cb);
  }, []);
  const snapshot = React.useCallback(
    () => (typeof LinkStore === 'undefined' ? 0 : LinkStore.getVersion()), []);
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * @param {any} p  the graph and mode, showUnderlay, the cameras' refs and
 *   frame() (use-web-camera.js), the chrome tokens' ref, the frame loop
 */
export function usePersonalWeb({ graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule }) {
  const personalRef = React.useRef(null);
  const [personalCount, setPersonalCount] = React.useState(0);

  /** Everything the rail renderer needs to place a personal endpoint. */
  const railOpts = React.useCallback(() => {
    const v = viewRef.current, cam = camRef.current;
    const f = frame();
    return {
      width: v.W, height: v.H, DPR: v.DPR, base: f.base,
      chrome: chromeRef.current,
      votRail: personalRef.current && personalRef.current.votRail,
      // Both rails ride this one camera. The top rail's own axis is even
      // across the corpus, but it is spread across the SAME verse span the
      // bottom rail uses, so a pinch moves both halves (rail-renderer's
      // votRailX). Without verseTotal every top-rail x is NaN, by design.
      verseTotal: cam.total,
      verseX: (verse) => verseToX(cam, v.W, verse),
      // r2: the Volumes rail through ITS camera when one exists
      votX: camVRef.current ? (pos) => verseToX(/** @type {any} */ (camVRef.current), v.W, pos) : undefined,
      showUnderlay,
    };
  }, [camRef, camVRef, frame, showUnderlay, viewRef, chromeRef]);

  // ── the personal web ────────────────────────────────────────────────────
  const linkVersion = useLinkVersion();
  const [studiesTick, setStudiesTick] = React.useState(0);
  React.useEffect(() => {
    if (!graph || mode !== 'personal') return;
    const built = buildPersonal(graph);
    personalRef.current = built;
    camVRef.current = built && built.votRail && built.votRail.total > 0 ? createCamera(built.votRail.total) : null;
    setPersonalCount(built && built.graph ? built.graph.count : 0);
    schedule();
    // The studies corpus is lazy; when it lands after the first build, the
    // study rail segments and their underlay threads appear on the re-run.
    if (typeof BIBLE_STUDIES === 'undefined' && typeof loadBibleStudies === 'function') {
      loadBibleStudies().then((ok) => { if (ok) setStudiesTick((n) => n + 1); });
    }
  }, [graph, mode, linkVersion, studiesTick, schedule, camVRef]);

  return { personalRef, personalCount, railOpts };
}
