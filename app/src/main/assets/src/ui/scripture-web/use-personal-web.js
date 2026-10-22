/* ═══════════════════════════════════════════════════════════════════════
   usePersonalWeb — My Web: the reader's own links on the dual rail.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the built web
   (personalRef, from utils/scripture-web/personal-build.js) and its counts,
   rebuilt whenever the mode, the links (LinkStore's version), the VOT corpus
   (window.__votCorpus's version) or the lazily loaded Bible studies change; and railOpts(), everything the rail renderer
   needs to place a personal endpoint in this frame.

   w3 (the My Web stream): a rebuild keeps what the reader has. The Volumes
   camera is the same camera with the rail's new length (bug #9: it was
   replaced by a fresh one, so the top rail jumped to fit when a link or the
   studies landed); the chosen link is found again by its LinkStore id, in
   the focus and in the resume from the reader (item 30, bug #7: kept by
   index, a deletion before it moved the spotlight onto a neighbour); a
   studies load that fails is caught (bug #8); and the header's counts are
   state of the build, so a render never reads a half-landed ref.

   Fix-review #8: the found-again choice is written through focusState (the
   focus is replaced, never patched in place), and the open card follows it
   through `relink` ({kind, id, at}: 'link' and the chosen link's record id,
   or 'underlay' and the chosen Timothy thread's key, and its index in the
   rebuilt list, -1 when it is gone), which the selection reads to move its
   card's index or close the card. Fix-review 2 #4: a Timothy thread is kept
   by its key the same way (the studies landing insert rows before it). */

import { createCamera, verseToX, fitPPV, clampCamera } from '../../utils/scripture-web/geometry.js';
import { buildPersonal } from '../../utils/scripture-web/personal-build.js';
import { linkIndexById, underlayIndexByKey, railSpan, railUnit, railPosition } from '../../utils/scripture-web/personal-graph.js';
import { focusState } from '../../utils/scripture-web/focus-state.js';
import { chromeInset } from './rail-renderer.js';

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

/** The VOT corpus's version (window.__votCorpus, as use-lazy-bundles reads it): the
 *  Volumes rail is built from the letters, so the web rebuilds when they land
 *  (fix-review #9: a My Web opened before the corpus left every link skipped). */
function useCorpusVersion() {
  const corpus = () => /** @type {any} */ (globalThis).__votCorpus;
  const subscribe = React.useCallback((cb) => { const c = corpus(); return c ? c.subscribe(cb) : () => {}; }, []);
  const snapshot = React.useCallback(() => { const c = corpus(); return c ? c.getVersion() : 0; }, []);
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The Volumes camera across a rebuild. Its axis is the rail's own unit
 * (personal-graph's slots, w4), so a rebuild that re-shares the rail (the
 * studies land and every collection's slot narrows) moves every letter: the
 * same camera object is kept (a gesture in flight holds it), with the
 * rail's new span, the letter that was at the middle of the view still
 * there and its letters as far apart as they were. A rebuild that keeps the
 * slots (a new link) keeps the camera as it is. A rail at fit stays at fit,
 * the NEW fit (ppv 0: the frame's clamp fits it).
 * @param {any} cam the camera so far, or null
 * @param {any} rail the rebuilt rail (personal-graph's VotRail), or null
 * @param {number} W the view width, device px (0 before the first resize)
 * @param {any} [prev] the rail the camera was on (the last build's), or null
 * @returns {any} the camera to use, or null when there is no rail
 */
export function keepRailCamera(cam, rail, W, prev) {
  const span = rail && rail.total > 0 ? railSpan(rail) : 0;
  if (!(span > 0)) return null;
  if (!cam) return createCamera(span);
  const moved = !!prev && prev !== rail && slotsMoved(prev, rail);
  if (cam.total === span && !moved) return cam;
  const atFit = !(cam.ppv > 0) || !(W > 0) || cam.ppv <= fitPPV(cam, W) * 1.001;
  if (atFit) { cam.total = span; cam.ppv = 0; cam.x = span / 2; return cam; }
  if (prev && prev.total > 0) {
    // the letter at the middle, and the units one letter takes there, then and now
    const pos = railPosition(prev, cam.x);
    const i = Math.min(Math.max(Math.floor(pos), 0), prev.total - 1);
    const was = railUnit(prev, i + 1) - railUnit(prev, i), now = railUnit(rail, i + 1) - railUnit(rail, i);
    cam.x = railUnit(rail, pos);
    if (was > 0 && now > 0) cam.ppv *= was / now;
  }
  cam.total = span;
  clampCamera(cam, W, undefined);      // the frame re-clamps with the rail's own zoom cap
  return cam;
}

/** Whether a rebuild moved any collection on the rail (its letters or its slot). */
function slotsMoved(a, b) {
  const p = a.segments || [], q = b.segments || [];
  if (p.length !== q.length || a.total !== b.total) return true;
  for (let k = 0; k < p.length; k++) {
    if (p[k].start !== q[k].start || p[k].count !== q[k].count || p[k].u0 !== q[k].u0 || p[k].uw !== q[k].uw) return true;
  }
  return false;
}

/**
 * The chosen line, by what it is: a reader's link by its LinkStore id, or one
 * of Timothy's threads by its key (personal-graph's underlayKey; fix-review 2
 * #4: kept by index, the studies landing before it moved the spotlight and
 * its card onto another thread). From the last build's focus when there was
 * one, else (a mount's first build) from the resume the reader brought back.
 * @param {any} prev the last build, or null
 * @param {any} focusRef
 * @param {any} resumeRef
 * @returns {{kind:'link'|'underlay', id:string, arc:number}|null}
 */
function chosenLine(prev, focusRef, resumeRef) {
  if (prev) {
    const f = focusRef && focusRef.current;
    const arc = f && f.arc >= 0 ? f.arc : -1;
    if (arc < 0) return null;
    if (f.underlay) {
      const key = prev.underlay && prev.underlay.keys && prev.underlay.keys[arc];
      return key ? { kind: 'underlay', id: key, arc } : null;
    }
    const rec = prev.graph && prev.graph.records[arc];
    return rec && rec.id ? { kind: 'link', id: rec.id, arc } : null;
  }
  const back = resumeRef && resumeRef.current;
  const d = back && back.mode === 'personal' && back.detail;
  if (!d) return null;
  const underlay = d.kind === 'underlay';
  const id = underlay ? d.key : d.kind === 'link' && d.record ? d.record.id : null;
  if (!id) return null;
  const f = back.focus;
  const arc = f && f.arc >= 0 && !!f.underlay === underlay ? f.arc : d.index;
  return { kind: underlay ? 'underlay' : 'link', id, arc };
}

/**
 * @param {any} p  the graph and mode, showUnderlay, the cameras' refs and
 *   frame() (use-web-camera.js), the chrome tokens' ref, the frame loop;
 *   the resume (resumeRef) and the focus (focusRef), so a choice is kept by id
 *   and the top chrome (topbarRef), whose bottom edge the Volumes rail clears
 */
export function usePersonalWeb({ graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule, resumeRef, focusRef, topbarRef }) {
  const personalRef = React.useRef(null);
  const [counts, setCounts] = React.useState({ links: 0, timothy: 0, skipped: 0, pending: 0 });
  const [relink, setRelink] = React.useState(/** @type {{kind:'link'|'underlay', id:string, at:number}|null} */ (null));

  /** Everything the rail renderer needs to place a personal endpoint. */
  const railOpts = React.useCallback(() => {
    const v = viewRef.current, cam = camRef.current;
    const f = frame();
    // the top chrome's bottom edge, device px (the canon overlay measures it
    // the same way): the Volumes rail keeps its names clear of it
    const inset = chromeInset(topbarRef && topbarRef.current, v.DPR);
    return {
      width: v.W, height: v.H, DPR: v.DPR, base: f.base, inset,
      chrome: chromeRef.current,
      votRail: personalRef.current && personalRef.current.votRail,
      // Both rails ride this one camera. The top rail's own axis is even
      // across the corpus, but it is spread across the SAME verse span the
      // bottom rail uses, so a pinch moves both halves (rail-renderer's
      // votRailX). Without verseTotal every top-rail x is NaN, by design.
      verseTotal: cam.total,
      verseX: (verse) => verseToX(cam, v.W, verse),
      // r2: the Volumes rail through ITS camera when one exists; the camera's
      // axis is the rail's own unit (w4, the slots: votRailX converts a letter)
      votX: camVRef.current ? (u) => verseToX(/** @type {any} */ (camVRef.current), v.W, u) : undefined,
      showUnderlay,
    };
  }, [camRef, camVRef, frame, showUnderlay, viewRef, chromeRef, topbarRef]);

  // ── the personal web ────────────────────────────────────────────────────
  const linkVersion = useLinkVersion();
  const corpusVersion = useCorpusVersion();
  const [studiesTick, setStudiesTick] = React.useState(0);
  React.useEffect(() => {
    if (!graph || mode !== 'personal') return;
    const prev = personalRef.current;
    const chosen = chosenLine(prev, focusRef, resumeRef);
    const built = buildPersonal(graph);
    personalRef.current = built;
    camVRef.current = keepRailCamera(camVRef.current, built && built.votRail, viewRef.current ? viewRef.current.W : 0, prev && prev.votRail);
    if (chosen) {
      const thread = chosen.kind === 'underlay';
      const at = thread ? underlayIndexByKey(built && built.underlay, chosen.id) : linkIndexById(built && built.graph, chosen.id);
      // the choice found again, or (deleted, or no longer placed) let go whole
      const follow = (f) => (at >= 0 ? focusState(Object.assign({}, f, { arc: at, underlay: thread })) : focusState());
      const focus = focusRef && focusRef.current;
      if (!prev) {
        // the mount's first build: the renderer restores focusRef from the
        // resume (after this effect, or before it on a later graph); follow
        // in both so the order does not matter
        const back = resumeRef.current;
        back.focus = follow(back.focus);
        if (back.detail) back.detail = at >= 0 ? Object.assign({}, back.detail, { index: at }) : null;
      }
      // a thread that kept its row keeps its focus object (nothing moved)
      if (focus && !!focus.underlay === thread && focus.arc === chosen.arc && (!thread || at !== chosen.arc)) focusRef.current = follow(focus);
      // the open card follows by what it is (the selection's own state)
      if (!prev || at !== chosen.arc) setRelink({ kind: chosen.kind, id: chosen.id, at });
    }
    const pg = built && built.graph;
    setCounts({
      links: pg ? pg.count : 0,
      timothy: built && built.underlay ? built.underlay.count : 0,
      skipped: pg ? pg.skipped : 0,
      pending: pg ? pg.pending : 0,
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
  }, [graph, mode, linkVersion, corpusVersion, studiesTick, schedule, camVRef, viewRef, focusRef, resumeRef]);

  return {
    personalRef, personalCount: counts.links, contextCount: counts.timothy, skippedCount: counts.skipped, pendingCount: counts.pending, railOpts, relink,
  };
}
