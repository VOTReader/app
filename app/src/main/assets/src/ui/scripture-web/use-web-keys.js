/* ═══════════════════════════════════════════════════════════════════════
   useWebKeys — Escape, Android Back and the Scripture Web's own keys.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the one
   close-the-top-layer rule Escape and Back share (the guide, then the
   empty-web notice, then the cards and the hover chip), its registration
   with the app's modal registry (useModalRegistry, the bundle-d free
   global), and onKeyDown for the root: the arrows pan and climb, + and -
   zoom, 0 resets, Escape closes a layer or leaves.

   The navigation stream (w3, G2) adds the go-to's keys: / and Ctrl+K (Cmd+K)
   open it from anywhere on the screen but a text field (a document listener
   in the capture phase, so it goes ahead of the app's own "/ opens Search" in
   use-desktop-keyboard.js; My Web has no go-to and leaves / to the app);
   Enter or Space choose the line at the centre and [ ] step through the lines
   at the chosen verse while the web itself has the keyboard; Escape and Back
   close the go-to before anything else. WEB_KEYS_HELP is the screen's help
   text, naming every key. */

import { clampCamera, zoomAbout } from '../../utils/scripture-web/geometry.js';
import { refOfVerse } from '../../utils/scripture-web/pick.js';
import { votNodeName, ZOOM_MAX_MESSAGE } from '../../utils/scripture-web/describe.js';

/** The screen's #sw-a11y-help: what each key does, for the screen reader (G2). */
export const WEB_KEYS_HELP = 'Drag to move through scripture; pinch or scroll to zoom. '
  + 'The arrow keys move, the plus and minus keys zoom, and 0 resets the view. '
  + 'Enter or Space selects the line nearest the centre; [ and ] step through the lines at the chosen verse. '
  + 'Slash or Control+K opens Go to, for a book, chapter or verse. '
  + 'Escape closes what is on top, then leaves the web. Nearby opens a keyboard-friendly list.';

const TEXT_FIELD = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };

/**
 * @param {any} p  what is open (the guide, the notice, the cards and chip)
 *   and how each closes; the cameras' refs and callbacks; My Web's
 *   personalRef; resetView and onBack; dropHover, the live region and the
 *   frame loop; goTo (additive, the navigation stream): goto.jsx's answer, whose
 *   box Escape closes first and whose open, selectCentre and step the keys call
 * @returns {{ onKeyDown: (e: any) => void }}
 */
export function useWebKeys({
  graph, guideOpen, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards,
  camRef, camVRef, lastRailRef, viewRef, modeRef, personalRef, zoomCapFor, yFrameFor,
  resetView, onBack, dropHover, setAnnounce, schedule, cancelFly, goTo,
}) {
  const goToOpen = !!(goTo && goTo.isOpen);
  /** Close whatever is on top of the web, one layer a call: the guide, then
   * the empty-web notice, then the panels and the hover chip together.
   * Escape and Android Back both come here (v08-03), so they agree.
   * @returns {boolean} whether there was anything to close */
  const closeTopOverlay = React.useCallback(() => {
    // the go-to box is the newest layer, over the panel it may have opened
    if (goToOpen) { goTo.close(); return true; }
    if (guideOpen) { closeGuide(); return true; }
    if (emptyShown) { dismissEmpty(); return true; }
    if (listOpen || choices || detail || tip) { closeCards(); return true; }
    return false;
  }, [goToOpen, goTo, guideOpen, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards]);
  // Android Back and the app's Escape dispatcher close the top overlay first
  // instead of leaving the web (the hover chip alone is not worth a Back).
  useModalRegistry({ id: 'scripture-web-overlay', dismiss: closeTopOverlay,
    active: !!(goToOpen || guideOpen || emptyShown || listOpen || choices || detail) });

  // / and Ctrl+K: the go-to, from anywhere on the screen but a text field. The capture phase puts
  // it ahead of the app's document listener, which reads defaultPrevented and leaves / alone.
  const goToRef = React.useRef(goTo);
  goToRef.current = goTo;
  React.useEffect(() => {
    const onKey = (e) => {
      const g = goToRef.current;
      if (!g || !g.button || g.isOpen || e.altKey) return;
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey;
      const k = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');
      if (!slash && !k) return;
      const el = /** @type {any} */ (e.target);
      if (el && (TEXT_FIELD[el.tagName] || el.isContentEditable)) return;
      e.preventDefault();
      g.open();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // ── keyboard (PWA desktop) ──────────────────────────────────────────────
  const onKeyDown = React.useCallback((e) => {
    // The web's keys are the web's while the web itself has focus. Keydown bubbles here from
    // every control inside .sw-root: ArrowRight on the density <select> panned the camera and
    // preventDefault cancelled the select's own change, and a Nearby row's arrows panned the web
    // behind the list (sweep v72). Escape is the one key taken from anywhere: it closes the top
    // layer, or leaves.
    if (e.key !== 'Escape' && e.target !== e.currentTarget) return;
    // G2: Enter or Space take the line at the centre, [ and ] step through the lines at a verse
    if (goTo && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo.selectCentre(); return; }
      if (e.key === '[' || e.key === ']') { e.preventDefault(); goTo.step(e.key === ']' ? 1 : -1); return; }
    }
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
    personalRef, modeRef, setAnnounce, cancelFly, goTo]);

  return { onKeyDown };
}
