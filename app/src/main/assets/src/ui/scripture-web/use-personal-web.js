/* ═══════════════════════════════════════════════════════════════════════
   usePersonalWeb — My Web: the reader's own links on the dual rail.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the built web
   (personalRef, from utils/scripture-web/personal-build.js) and its counts,
   rebuilt whenever the mode, the links (LinkStore's version) or the lazily
   loaded Bible studies change; and railOpts(), everything the rail renderer
   needs to place a personal endpoint in this frame.

   w3 (the My Web stream): a rebuild keeps what the reader has. The Volumes
   camera is the same camera with the rail's new length (bug #9: it was
   replaced by a fresh one, so the top rail jumped to fit when a link or the
   studies landed); the chosen link is found again by its LinkStore id, in
   the focus and in the resume from the reader (item 30, bug #7: kept by
   index, a deletion before it moved the spotlight onto a neighbour); a
   studies load that fails is caught (bug #8); and the header's counts are
   state of the build, so a render never reads a half-landed ref. */

import { createCamera, verseToX, fitPPV, clampCamera } from '../../utils/scripture-web/geometry.js';
import { buildPersonal } from '../../utils/scripture-web/personal-build.js';
import { linkIndexById } from '../../utils/scripture-web/personal-graph.js';

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
 * The Volumes camera across a rebuild. The rail only ever GROWS at its end
 * (the studies are appended after READING_CHAIN) or keeps its length (a new
 * link), so every position the camera knows keeps its place: the same
 * camera object is kept (a gesture in flight holds it) with the new length.
 * A rail at fit stays at fit, the NEW fit (ppv 0: the frame's clamp fits it).
 * @param {any} cam the camera so far, or null
 * @param {number} total the rebuilt rail's length
 * @param {number} W the view width, device px (0 before the first resize)
 * @returns {any} the camera to use, or null when there is no rail
 */
export function keepRailCamera(cam, total, W) {
  if (!(total > 0)) return null;
  if (!cam) return createCamera(total);
  if (cam.total === total) return cam;
  const atFit = !(cam.ppv > 0) || !(W > 0) || cam.ppv <= fitPPV(cam, W) * 1.001;
  cam.total = total;
  if (atFit) { cam.ppv = 0; cam.x = total / 2; return cam; }
  clampCamera(cam, W, undefined);      // the frame re-clamps with the rail's own zoom cap
  return cam;
}

/**
 * The chosen link's id: from the last build's focus when there was one, else
 * (a mount's first build) from the resume the reader brought back.
 * @param {any} prev the last build, or null
 * @param {any} focusRef
 * @param {any} resumeRef
 * @returns {{id:string, arc:number}|null}
 */
function chosenLink(prev, focusRef, resumeRef) {
  if (prev) {
    const arc = focusRef && focusRef.current ? focusRef.current.arc : -1;
    const rec = arc >= 0 && prev.graph && prev.graph.records[arc];
    return rec && rec.id ? { id: rec.id, arc } : null;
  }
  const back = resumeRef && resumeRef.current;
  const d = back && back.mode === 'personal' && back.detail;
  if (!d || d.kind !== 'link' || !d.record || !d.record.id) return null;
  return { id: d.record.id, arc: back.focus && back.focus.arc >= 0 ? back.focus.arc : d.index };
}

/**
 * @param {any} p  the graph and mode, showUnderlay, the cameras' refs and
 *   frame() (use-web-camera.js), the chrome tokens' ref, the frame loop;
 *   the resume (resumeRef) and the focus (focusRef), so a choice is kept by id
 */
export function usePersonalWeb({ graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule, resumeRef, focusRef }) {
  const personalRef = React.useRef(null);
  const [counts, setCounts] = React.useState({ links: 0, timothy: 0, skipped: 0 });

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
    const prev = personalRef.current;
    const chosen = chosenLink(prev, focusRef, resumeRef);
    const built = buildPersonal(graph);
    personalRef.current = built;
    const total = built && built.votRail ? built.votRail.total : 0;
    camVRef.current = keepRailCamera(camVRef.current, total, viewRef.current ? viewRef.current.W : 0);
    if (chosen) {
      const at = linkIndexById(built && built.graph, chosen.id);
      const focus = focusRef && focusRef.current;
      if (prev) {
        if (focus && focus.arc === chosen.arc) focus.arc = at;
      } else {
        // the mount's first build: the renderer restores focusRef from the
        // resume (after this effect, or before it on a later graph); patch
        // both so the order does not matter, and the open card the
        // selection took from the same resume
        const back = resumeRef.current;
        back.focus = Object.assign({}, back.focus, { arc: at });
        if (back.detail) back.detail.index = at;
        if (focus && focus.arc === chosen.arc) focus.arc = at;
      }
    }
    const pg = built && built.graph;
    setCounts({
      links: pg ? pg.count : 0,
      timothy: built && built.underlay ? built.underlay.count : 0,
      skipped: pg ? pg.skipped : 0,
    });
    schedule();
    // The studies corpus is lazy; when it lands after the first build, the
    // study rail segments and their underlay threads appear on the re-run.
    // A load that fails leaves the web up without them (bug #8: uncaught).
    let live = true;
    if (typeof BIBLE_STUDIES === 'undefined' && typeof loadBibleStudies === 'function') {
      Promise.resolve()
        .then(() => loadBibleStudies())
        .then((ok) => { if (ok && live) setStudiesTick((n) => n + 1); })
        .catch(() => { /* the web stands without the studies; the next build tries again */ });
    }
    return () => { live = false; };
  }, [graph, mode, linkVersion, studiesTick, schedule, camVRef, viewRef, focusRef, resumeRef]);

  return {
    personalRef, personalCount: counts.links, contextCount: counts.timothy, skippedCount: counts.skipped, railOpts,
  };
}
