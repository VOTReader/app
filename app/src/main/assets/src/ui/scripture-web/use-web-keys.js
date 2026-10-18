/* ═══════════════════════════════════════════════════════════════════════
   useWebKeys — Escape, Android Back and the Scripture Web's own keys.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the one
   close-the-top-layer rule Escape and Back share (the guide, then the
   empty-web notice, then the cards and the hover chip), its registration
   with the app's modal registry (useModalRegistry, the bundle-d free
   global), and onKeyDown for the root: the arrows pan and climb, + and -
   zoom, 0 resets, Escape closes a layer or leaves. */

import { clampCamera, zoomAbout } from '../../utils/scripture-web/geometry.js';
import { refOfVerse } from '../../utils/scripture-web/pick.js';
import { votNodeName, ZOOM_MAX_MESSAGE } from '../../utils/scripture-web/describe.js';

/**
 * @param {any} p  what is open (the guide, the notice, the cards and chip)
 *   and how each closes; the cameras' refs and callbacks; My Web's
 *   personalRef; resetView and onBack; dropHover, the live region and the
 *   frame loop
 * @returns {{ onKeyDown: (e: any) => void }}
 */
export function useWebKeys({
  graph, guideOpen, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards,
  camRef, camVRef, lastRailRef, viewRef, modeRef, personalRef, zoomCapFor, yFrameFor,
  resetView, onBack, dropHover, setAnnounce, schedule, cancelFly,
}) {
  /** Close whatever is on top of the web, one layer a call: the guide, then
   * the empty-web notice, then the panels and the hover chip together.
   * Escape and Android Back both come here (v08-03), so they agree.
   * @returns {boolean} whether there was anything to close */
  const closeTopOverlay = React.useCallback(() => {
    if (guideOpen) { closeGuide(); return true; }
    if (emptyShown) { dismissEmpty(); return true; }
    if (listOpen || choices || detail || tip) { closeCards(); return true; }
    return false;
  }, [guideOpen, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards]);
  // Android Back and the app's Escape dispatcher close the top overlay first
  // instead of leaving the web (the hover chip alone is not worth a Back).
  useModalRegistry({ id: 'scripture-web-overlay', dismiss: closeTopOverlay,
    active: !!(guideOpen || emptyShown || listOpen || choices || detail) });

  // ── keyboard (PWA desktop) ──────────────────────────────────────────────
  const onKeyDown = React.useCallback((e) => {
    // The web's keys are the web's while the web itself has focus. Keydown bubbles here from
    // every control inside .sw-root: ArrowRight on the density <select> panned the camera and
    // preventDefault cancelled the select's own change, and a Nearby row's arrows panned the web
    // behind the list (sweep v72). Escape is the one key taken from anywhere: it closes the top
    // layer, or leaves.
    if (e.key !== 'Escape' && e.target !== e.currentTarget) return;
    const v = viewRef.current;
    // r2: the keys drive the rail the pointer last touched (the Bible rail
    // until a gesture says otherwise); Reset (0) resets both
    const onTop = modeRef.current === 'personal' && lastRailRef.current === 'top' && camVRef.current;
    const cam = onTop ? camVRef.current : camRef.current;
    if (!cam || !v.W) return;
    const step = (v.W / cam.ppv) * 0.12;
    const ceiling = zoomCapFor(cam);
    const yf = yFrameFor(cam);
    let atCeiling = false;
    if (e.key === 'ArrowLeft') { cam.x -= step; }
    else if (e.key === 'ArrowRight') { cam.x += step; }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // 0.12 of the frame a press, like the x keys; a rail has no height.
      // Up looks up: the picture moves down the frame, y grows.
      if (!yf) return;
      cam.y = (cam.y > 0 ? cam.y : 0) + (e.key === 'ArrowUp' ? 1 : -1) * 0.12 * yf.base;
    }
    else if (e.key === '+' || e.key === '=') {
      const before = cam.ppv;
      zoomAbout(cam, v.W, v.W / 2, 1.6, ceiling, yf || undefined);
      atCeiling = cam.ppv === before;
    }
    else if (e.key === '-' || e.key === '_') { zoomAbout(cam, v.W, v.W / 2, 1 / 1.6, ceiling, yf || undefined); }
    else if (e.key === '0') { resetView(); return; }
    else if (e.key === 'Escape') {
      // The notice is an overlay like the five below and goes first for the
      // same reason they do: Escape dismisses what is on top before it leaves
      // the screen. It lives HERE rather than in a handler of its own on the
      // panel \u2014 a second handler closed the notice and let the keystroke
      // through to onBack(), so one press both dismissed the tip and threw the
      // reader out to the Library.
      // v08-03: the app's own Escape dispatcher listens on the document; the
      // keystroke stops here so it cannot close a panel AND leave the web,
      // or leave twice when nothing is open.
      e.preventDefault(); e.stopPropagation();
      if (!closeTopOverlay() && onBack) onBack();
      return;
    } else return;
    e.preventDefault();
    dropHover();
    // a key that moves the camera takes it: a fly running stops where the key found it (the
    // fly only moves in a frame, so none runs between the key's move and this)
    if (cancelFly) cancelFly();
    clampCamera(cam, v.W, ceiling, yf);
    const centre = Math.round(cam.x);
    if (atCeiling) setAnnounce(ZOOM_MAX_MESSAGE);
    // the Volumes rail's x is a rail position, not a verse id: name its own node (sweep v55)
    else if (onTop) {
      const name = votNodeName(personalRef.current && personalRef.current.votRail, centre);
      if (name) setAnnounce(name);
    }
    else if (graph && centre >= 0 && centre < graph.total) setAnnounce(refOfVerse(graph, centre).label);
    schedule();
  }, [viewRef, lastRailRef, camVRef, camRef, zoomCapFor, yFrameFor, graph, schedule, resetView, closeTopOverlay, onBack, dropHover,
    personalRef, modeRef, setAnnounce, cancelFly]);

  return { onKeyDown };
}
