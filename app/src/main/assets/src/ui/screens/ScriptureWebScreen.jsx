/* ═══════════════════════════════════════════════════════════════════════
   ScriptureWebScreen — Cluster F (bundle-d since lz1; lazy bundle-f before)
   ═══════════════════════════════════════════════════════════════════════
   The Scripture Web: every cross-reference in scripture as one zoomable,
   tappable instrument — and the same instrument turned on the reader's own
   links across the Volumes.

   Two canvases stacked over a DOM chrome layer:
     #gl  WebGL2, every arc in a handful of instanced draws (web-renderer.js)
     #ui  Canvas2D ruler, book names, chapter and verse numerals
     DOM  tooltip, detail sheet, controls — real buttons, real tab order

   Gesture doctrine copied from GardenView: nothing that runs per frame
   touches React state. The camera is a mutable ref, gestures write it
   directly, and a dirty-flag rAF redraws. React state is only for things
   that genuinely change the UI (mode, density, the open sheet).

   Free globals (PlatformBridge, ScreenLayout, LinkStore, …) are resolved at
   call time, the free-global pattern the other bundle-d screens use (from
   when this rode lazy bundle-f), so this file imports only the feature's own code.

   This file composes the screen; the pieces live beside it (F0, 2026-10-18):
     ui/scripture-web/use-frame-scheduler.js   the one rAF loop, the gesture ease, the revive
     ui/scripture-web/use-forced-landscape.js  landscape always, immersive, loc()
     ui/scripture-web/use-web-camera.js        the cameras, the view, the focus, flyTo
     ui/scripture-web/use-web-renderer.js      the graph's load, the colours, the GL renderer
                                               and the frame's draw
     ui/scripture-web/overlay-renderer.js      the Canvas2D overlay's painters
     ui/scripture-web/use-personal-web.js      My Web's build and railOpts()
     ui/scripture-web/use-web-selection.js     the hit test, the hover chip, the open cards,
                                               the panel API (openPanel / closePanel)
     ui/scripture-web/use-web-keys.js          Escape, Back and the keys
     ui/scripture-web/goto.jsx                 the go-to and its header slot; overlay taps
     ui/scripture-web/use-journey.js           the Back trail through the web
     ui/scripture-web/gestures.js              pointer, wheel and pinch wiring
     ui/scripture-web/panels.jsx               the hover chip, the guide, the notices, the key
     ui/scripture-web/web-panel.jsx            the docked panel (every mode) and its rows
     ui/scripture-web/use-panel-layout.js      where the panel docks, the inset it covers, the
                                               controls' collapse
     utils/scripture-web/describe.js           every word the web says
     utils/scripture-web/focus-state.js        the focus's one shape (chosen, hovered, lit)
     utils/scripture-web/sw-ink.js             every ink the canvas draws
     utils/scripture-web/personal-build.js     My Web's inputs from the live stores
     utils/scripture-web/web-data.js           the graph asset's loader
   The shared contracts the feature streams build on (the CONTRACTS.md the
   spine wrote, D:/Swarm/lanes/sweb/out/w3) are named where they live.
   ═══════════════════════════════════════════════════════════════════════ */

import { clampCamera, fitPPV, xToVerse, zoomAbout } from '../../utils/scripture-web/geometry.js';
import { lensRange } from '../../utils/scripture-web/pick.js';
import { DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { useWebCamera } from '../scripture-web/use-web-camera.js';
import { useFrameScheduler } from '../scripture-web/use-frame-scheduler.js';
import { useForcedLandscape } from '../scripture-web/use-forced-landscape.js';
import { useWebGraph, useChromeTokens, useWebRenderer } from '../scripture-web/use-web-renderer.js';
import { usePersonalWeb } from '../scripture-web/use-personal-web.js';
import { useWebSelection } from '../scripture-web/use-web-selection.js';
import { usePanelLayout, usePanelInset, collapsedFor } from '../scripture-web/use-panel-layout.js';
import { WebPanel } from '../scripture-web/web-panel.jsx';
import { useWebKeys, WEB_KEYS_HELP } from '../scripture-web/use-web-keys.js';
import { useJourney } from '../scripture-web/use-journey.js';
import { useGoTo } from '../scripture-web/goto.jsx';
import { focusState } from '../../utils/scripture-web/focus-state.js';
/** @typedef {import('../../utils/scripture-web/decode.js').Density} Density */
import { attachWebGestures } from '../scripture-web/gestures.js';
import { WebFallbackList } from '../scripture-web/WebFallbackList.jsx';
import { TipChip, HowToReadGuide, EmptyWebNotice, loadErrorPanel, legendFor } from '../scripture-web/panels.jsx';
import { startChapter } from '../../utils/scripture-web/chapter-connections.js';
import { graphStats, densityLine, myWebHeadline, myWebSkippedLine } from '../../utils/scripture-web/describe.js';
import { verseText } from '../../utils/scripture-web/panel-model.js';
import { ensureScriptureWebData } from '../../utils/scripture-web/web-data.js';

/* The zoom ceiling (maxZoomOf), the frame, the render arguments and the y
   frame live in utils/scripture-web/web-frame.js, pure and tested; the
   cameras and view that feed them in ui/scripture-web/use-web-camera.js. */

/* HIDE ALL. One session-scoped flag, not a profile setting: the reader hides
   the chrome to look at the web, and the next visit should open with the
   controls back. Absence is the signal — the key is removed, never set to
   '0' — so a default can never impersonate a choice. sessionStorage is not
   swept by the vot-* localStorage migration and is per-tab, which is the
   scope the flag means. */
const CHROME_HIDDEN_KEY = 'vot-sw-chrome-hidden';

/* Where the reader was when they opened a verse from the web (sw1 B3, 2026-10-05). The screen
   unmounts while the reader is up, and its camera, focus and card live in refs, so "Back to The
   Scripture Web" used to land at fit with nothing chosen. In memory only, never stored, and
   one-shot: the next mount takes it, the way WebFallbackList keeps its chapter. */
let resumeWeb = null;
/** Tests only: forget the resume point between cases. */
export function _resetWebPlace() { resumeWeb = null; }
/** Tests only: stand a resume point, as leaving for the reader does. @param {any} place */
export function _setWebPlace(place) { resumeWeb = place; }
function readChromeHidden() {
  try { return sessionStorage.getItem(CHROME_HIDDEN_KEY) === '1'; } catch (_e) { return false; }
}

/**
 * @param {object} props
 * @param {(endpoint:object, meta?:object) => void} props.navigateToLink
 * @param {() => void} props.onBack
 * @param {{webDensity?:string, theme?:string, swEmptyDismissed?:boolean, swGuideSeen?:boolean, translation?:string}} props.settings
 *   (translation is read, never written: the reader's own Bible, for the panel's verse text)
 * @param {(key:string, value:any) => void} props.updateSetting
 * @param {{ verse: { bookId: string, chapter: number, verse: number } }
 *   | { book: string, chapter?: number } | { letterKey: string }} [props.start]
 *   where the web opens (additive; absent opens as it always has): at a verse
 *   (the camera on it, the panel in verse mode), at a book or one of its
 *   chapters, or on a letter's citations (vot-citations' key). A start wins
 *   over the resume point. The go-to (goto.jsx) takes it; the stub ignores it.
 */
export function ScriptureWebScreen({ navigateToLink, onBack, settings, updateSetting, start }) {
  // Taken once per mount (a ref survives StrictMode's second render; the module slot does not).
  // A start wins over it (a door in from the reader): the mode, the camera and the open card all
  // start fresh on the canon, and the resume point is spent either way. Seeding the mode from it
  // opened My Web from a verse's "Show in Scripture Web" (w4 interaction hunt).
  const resumeRef = React.useRef(/** @type {any} */ (undefined));
  if (resumeRef.current === undefined) { resumeRef.current = start ? null : resumeWeb; resumeWeb = null; }
  const glRef = React.useRef(null);
  const uiRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  // the one frame loop (use-frame-scheduler.js) and landscape, always
  // (use-forced-landscape.js): rotation, orientation lock, immersive, loc()
  const { drawRef, schedule, live, capFractionNow, animate, onFrame } = useFrameScheduler();
  const { rotated, loc } = useForcedLandscape(schedule);

  // the graph asset, loaded once (use-web-renderer.js); Try again refetches
  const { graph, loadError, setLoadError, retryLoad } = useWebGraph();
  const [mode, setMode] = React.useState(() => (resumeRef.current && resumeRef.current.mode) || 'canonical');   // 'canonical' | 'personal'
  // The empty-web notice hands focus back here when it closes, so a keyboard
  // reader stays in the control they were using instead of at the document top.
  const myWebBtnRef = React.useRef(null);
  const [emptyDismissed, setEmptyDismissed] = React.useState(false);
  /* The one-screen "how to read this web" card (landing 13). Open on the
     first visit to the canon web until the reader closes it; the ? button
     brings it back. The seen flag rides `settings` like swEmptyDismissed. */
  const [guideOpen, setGuideOpen] = React.useState(() => !(settings && settings.swGuideSeen));
  // The card waits for the web (w4): on a first visit it opened over the loader and hid
  // "Weaving the web…" behind a card about a web that was not there yet.
  const guideShown = guideOpen && !!graph;
  const closeGuide = React.useCallback(() => {
    setGuideOpen(false);
    if (typeof updateSetting === 'function') updateSetting('swGuideSeen', true);
  }, [updateSetting]);
  // THE DENSITY IS THE READER'S CHOICE AND NOTHING ELSE MOVES IT. From 09-06
  // to 09-11 (9aa0cfa9) the web switched itself to Essential past 22 CSS px
  // per verse; Corbin, 2026-09-11: "verify that fully zoomed in, the full
  // corpus and all 63000 lines are visible and interactable, UNLESS the user
  // has it set to essential." The stored setting is the whole state.
  /** @returns {Density} */
  const storedDensity = () => {
    // `classic` was the old internal name; accept it once so existing
    // settings migrate naturally while the feature speaks in user terms.
    const saved = settings && settings.webDensity === 'classic' ? 'famous' : settings && settings.webDensity;
    return DENSITY_STEPS.indexOf(saved) >= 0 ? /** @type {Density} */ (saved) : 'famous';
  };
  const [density, setDensity] = React.useState(storedDensity);
  const [chromeHidden, setChromeHidden] = React.useState(readChromeHidden);
  /* THE ONE LIVE REGION (.sw-live, polite): everything the web says to a screen reader goes
     through here, and nothing else on the screen is a status region (the density hint was a
     second one). The same words twice are said twice: a region whose text did not change is
     not read again, so a repeat toggles a trailing no-break space (trim() reads the words). */
  const [announce, setAnnounceText] = React.useState('');
  const setAnnounce = React.useCallback((/** @type {string} */ msg) => {
    setAnnounceText((prev) => (msg && prev === msg ? msg + ' ' : msg));
  }, []);
  // A transient line under the title on a density switch, so the reader is TOLD what Essential
  // and Famous mean (the on-device report); out of the header's flow (item 21) and said once,
  // through the live region.
  const [hint, setHint] = React.useState('');
  const hintTimer = React.useRef(0);
  const flashHint = React.useCallback((/** @type {string} */ text) => {
    setHint(text);
    setAnnounce(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 3600);
  }, [setAnnounce]);
  const [showUnderlay, setShowUnderlay] = React.useState(true);

  // ── everything below here is per-frame state; deliberately NOT React ──
  const topbarRef = React.useRef(null);
  // frame() runs per draw and must stay identity-stable, so it reads the mode
  // from a ref rather than closing over the state value.
  const modeRef = React.useRef(mode);
  // The cameras (canon + Volumes rail), the view, the focus and the frame
  // maths that reads them (v15-code-health-06); flyTo moves the camera to a
  // place, and panelInsetRef is what the open panel covers; slackFor is the
  // clamp's room for it, which every clamp below takes. Hover (the focus's
  // hover) is a LIGHT touch: it brightens the thread under the pointer and
  // names it, but never dims the rest of the web. Only a tap focuses.
  const {
    camRef, camVRef, lastRailRef, viewRef, focusRef, panelInsetRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor, flyTo, cancelFly, settledAt, slackFor, settleInset,
  } = useWebCamera({ graph, density, modeRef, schedule, topbarRef, animate, onFrame });
  const theme = settings && settings.theme;

  // the canvas's colours, re-read when the theme flips (use-web-renderer.js)
  const chromeRef = useChromeTokens(theme, schedule);

  // frame() reads the mode from a ref so it can stay identity-stable across
  // renders; keep that ref in step with the state it mirrors.
  React.useEffect(() => { modeRef.current = mode; schedule(); }, [mode, schedule]);

  // My Web (use-personal-web.js): the reader's links built into the dual
  // rail, rebuilt live; railOpts() is what the rail renderer places them by
  const { personalRef, personalCount, contextCount, skippedCount, pendingCount, railOpts, relink } = usePersonalWeb({
    graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule, resumeRef, focusRef, topbarRef,
  });

  /**
   * Close the empty-web notice for good.
   *
   * The dismissal rides `settings` (vot-state — already exported, counted and
   * shape-checked by the backup) rather than a sixth flag store, so there is no
   * schema bump and no seven-legged registration; and it comes back on a fresh
   * profile because a fresh profile has no key. Local state as well, so the
   * notice goes the moment it is tapped rather than after the settings write
   * round-trips, and so a host with no updateSetting still closes it.
   */
  /* Whether the empty-web notice is on screen. ONE definition: the render
     below and the Escape branch above both read it, because two spellings of
     "is the notice up" is how a keystroke came to dismiss it and leave the
     screen in the same breath. */
  const emptyShown = mode === 'personal' && !!graph && personalCount === 0
    && !emptyDismissed && !(settings && settings.swEmptyDismissed);

  const dismissEmpty = React.useCallback(() => {
    setEmptyDismissed(true);
    if (typeof updateSetting === 'function') updateSetting('swEmptyDismissed', true);
    if (myWebBtnRef.current) myWebBtnRef.current.focus();
  }, [updateSetting]);

  // the WebGL renderer, its lifecycle and the frame's draw (use-web-renderer.js):
  // it writes the elevator's track, the pills' boxes and the overlay's frame
  // (with the targets it drew) that the tap test reads
  // the go-to's verse chip over the canvas (CSS px boxes, goto.jsx writes them): the overlay's labels keep off it
  const keepOutRef = React.useRef(/** @type {any} */ (null));
  const { noWebGL, glRetry, retryGL, railZoom, elevatorRef, badgeBoxesRef, overlayFrameRef } = useWebRenderer({
    graph, mode, density, setLoadError, resumeRef, glRef, uiRef, wrapRef, topbarRef,
    camRef, camVRef, viewRef, focusRef, panelInsetRef, viewFor, zoomCapFor, yFrameFor,
    chromeRef, personalRef, railOpts, drawRef, schedule, capFractionNow, slackFor, keepOutRef,
  });
  // without WebGL2 the canon web is read as a list; My Web draws in Canvas2D
  // and stays up (w3 item 31)
  const listShown = noWebGL && mode !== 'personal';

  // where the reader has been (use-journey.js): the navigation stream pushes,
  // the panel shows it and its Back
  const journey = useJourney({ flyTo });

  // where the docked panel sits (use-panel-layout.js): the root's own size as a layout, and what
  // the panel will cover once open (insetFor), so a choice is framed before the panel renders
  const { layout, insetFor } = usePanelLayout(wrapRef);

  // what the pointer is on and what is open (use-web-selection.js): the hover
  // chip, the chooser, Nearby and the open card; the tap test and the handlers the
  // gestures call; the cards' close, Follow, a row's Follow and the zoom row; the
  // panel API (openPanel, closePanel, panel) and the lit set (lightThreads)
  const {
    tip, choices, choiceChapter, choiceCut, detail, listOpen, setTip, setChoices, setDetail, setListOpen,
    handlersRef, dropHover, liftAt, listItems, commitFound, closeCards, followThread, followRow, zoomTo,
    openPanel, lightThreads, panel,
  } = useWebSelection({
    graph, mode, density, showUnderlay, resumeRef, camRef, viewRef, focusRef, viewFor, yFrameFor,
    personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo, journey, schedule, setAnnounce, relink, settledAt,
    insetFor, slackFor,
  });

  // the docked panel is open while anything is: the inset's one writer (CONTRACTS.md section 5)
  // records what it covers and the controls right-align to its edge; under 1000 px of canvas
  // area they collapse to the go-to and a "more" menu (spec section 3)
  const panelOpen = listOpen || !!choices || !!detail;
  usePanelInset({ layout, open: panelOpen, panelInsetRef, wrapRef, schedule, onShrink: settleInset });
  const collapse = collapsedFor(layout, panelOpen);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const controlsRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const moreBtnRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  React.useEffect(() => { if (!collapse) setMenuOpen(false); }, [collapse]);
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    // a press anywhere outside the controls closes the menu
    const onDown = (/** @type {Event} */ e) => {
      const el = controlsRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);
  /** A control in the menu closes the menu as it acts. @param {() => void} act */
  const fromMenu = (act) => () => { act(); setMenuOpen(false); };
  const translation = settings && settings.translation;

  // the go-to (goto.jsx): its header slot (goTo.button, first in the control
  // row) and what it puts over the canvas (goTo.box: the box, its verse chip, its edge chips)
  const goTo = useGoTo({ graph, flyTo, openPanel, journey, lightThreads, setAnnounce, start,
    closePanel: closeCards, panel, density, mode, camRef, viewRef, focusRef, panelInsetRef, viewFor, onFrame, rootRef: wrapRef,
    keepOutRef, schedule });

  // ── gestures — imperative, never React state per frame ──────────────────
  // Wiring itself lives in gestures.js (attachWebGestures) — a pure move, so
  // it can be exercised with real dispatched DOM events instead of only a
  // screenshot. This effect just owns the mount guard and hands over refs.
  // W52: listShown and glRetry are deps because the fallback unmounts .sw-root
  // and Try again mounts a NEW one; without them the listeners stayed on the
  // first, detached root and the web came back dead to every drag and pinch.
  // loadError likewise (refactor bug #2): the error panel reused the root's node,
  // and a drag on it reached a camera the failed build never made.
  // the gestures clamp with the panel's slack (use-web-camera slackFor), as flyTo lands
  const clampWithSlack = React.useCallback((c, w, z, yf) => clampCamera(c, w, z, yf, slackFor(c)), [slackFor]);
  const zoomWithSlack = React.useCallback((c, w, x, f, z, yf, ay) => zoomAbout(c, w, x, f, z, yf, ay, slackFor(c)), [slackFor]);
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph || listShown || loadError) return;
    return attachWebGestures(el, {
      loc, dpr: () => viewRef.current.DPR, cam: () => camRef.current, camFor,
      view: () => viewRef.current, handlers: () => handlersRef.current,
      // a gesture takes the camera: the chip drops and a running fly stops
      live: () => { live(); dropHover(); cancelFly(); },
      schedule, maxZoom: (c) => zoomCapFor(c || camRef.current), clampCamera: clampWithSlack, zoomAbout: zoomWithSlack, xToVerse,
      yFrame: yFrameFor, lift: liftAt, animate,
    });
  }, [graph, listShown, loadError, glRetry, schedule, loc, camFor, zoomCapFor, live, dropHover, cancelFly, yFrameFor, liftAt, viewRef, camRef,
    handlersRef, animate, clampWithSlack, zoomWithSlack]);

  /** Reset one rail's camera to fit (r2: each rail has its own). */
  const resetRail = React.useCallback((which) => {
    const v = viewRef.current;
    const c = which === 'top' ? camVRef.current : camRef.current;
    if (!c) return;
    // a running fly would carry on over the reset (w4); resetView flies after this, not before
    cancelFly();
    c.ppv = fitPPV(c, v.W);
    c.x = c.total / 2;
    clampCamera(c, v.W, zoomCapFor(c));
    schedule();
  }, [camRef, camVRef, schedule, viewRef, zoomCapFor, cancelFly]);

  const resetView = React.useCallback(() => {
    const cam = camRef.current;
    if (!cam) return;
    // A4 (the navigation stream): Reset flies home, eased (instant under reduced motion), to the
    // whole canon at fit across the whole view, on the baseline: y 0 is explicit, Reset MEANS
    // the baseline whatever clamp a later edit puts after it
    if (camVRef.current) resetRail('top');
    flyTo({ x0: 0, x1: cam.total, y: 0 }, { insetRight: 0 });
    focusRef.current = focusState();
    journey.clear();
    setDetail(null); setChoices(null); setListOpen(false); setTip(null); schedule();
  }, [camRef, flyTo, camVRef, resetRail, focusRef, journey, schedule, setChoices, setDetail, setListOpen, setTip]);

  const toggleChrome = React.useCallback(() => {
    const next = !chromeHidden;
    try {
      if (next) sessionStorage.setItem(CHROME_HIDDEN_KEY, '1');
      else sessionStorage.removeItem(CHROME_HIDDEN_KEY);
    } catch (_e) { /* private mode: the toggle still works for this mount */ }
    setChromeHidden(next);
  }, [chromeHidden]);

  /** Scripture / My Web. The chosen line goes with the cards: a link's index and a canon thread's
   * index number two different graphs, so a focus kept across the switch spotlit an unrelated
   * line in the other web, with nothing open for Escape or Back to close (sweep v5, 2026-10-14). */
  const switchMode = React.useCallback((next) => {
    // w4: a fly under way (a go-to, a Follow, Reset) stops where it is: it drives camRef, which is
    // My Web's Bible rail too, so it carried on into the other web; and the canon's density hint
    // goes with the canon (My Web has no density)
    cancelFly();
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = 0; }
    setHint('');
    closeCards();
    journey.clear();
    setMode(next);
  }, [closeCards, journey, cancelFly]);

  // Escape, Android Back and the web's own keys (use-web-keys.js): one layer
  // closes a press, then the keys pan, climb, zoom and reset
  const { onKeyDown } = useWebKeys({
    graph, guideOpen: guideShown, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards,
    camRef, camVRef, lastRailRef, viewRef, modeRef, personalRef, zoomCapFor, yFrameFor,
    resetView, onBack, dropHover, setAnnounce, schedule, cancelFly, goTo, slackFor,
  });

  const openEndpoint = React.useCallback((endpoint) => {
    if (!endpoint || typeof navigateToLink !== 'function') return;
    // meta.sourceLetterTitle is what the reader's back pill is labelled with,
    // and the hook snapshots the current screen as the return target — so a
    // jump from here comes back HERE.
    const cam = camRef.current;
    resumeWeb = cam ? { mode: modeRef.current, cam: Object.assign({}, cam), focus: Object.assign({}, focusRef.current), detail } : null;
    navigateToLink(endpoint, { sourceLetterTitle: 'The Scripture Web' });
  }, [navigateToLink, camRef, focusRef, modeRef, detail]);

  // ── render ──────────────────────────────────────────────────────────────
  if (loadError) return loadErrorPanel(loadError, retryLoad, onBack, !!(layout && layout.compact));
  if (listShown && graph) {
    // A7: the web read as a list instead of a dead end (WebFallbackList.jsx).
    // It opens on the reader's last Bible chapter (HistoryStore, newest first).
    const hist = typeof HistoryStore !== 'undefined' ? HistoryStore.list() : [];
    const lastCh = (hist || []).find((h) => h && h.type === 'chapter' && h.bookId && h.chapterNum);
    return (
      <WebFallbackList graph={graph}
        initialChapter={startChapter(graph, lastCh && lastCh.bookId, lastCh && lastCh.chapterNum)}
        onOpen={(ref) => navigateToLink && navigateToLink({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse })}
        onRetry={retryGL} onMyWeb={() => switchMode('personal')}
        onBack={onBack} verseText={(ref) => verseText(ref, translation)} />
    );
  }
  // (noWebGL is only ever set by the renderer effect, which needs the graph,
  // and the graph is never cleared once loaded: the list above is the one
  // no-WebGL face.)

  const stats = graph ? graphStats(graph, density) : null;
  const famousCount = graph ? graphStats(graph, 'famous').shown : 0;
  const essentialCount = graph ? graphStats(graph, 'essential').shown : 0;

  return (
    <div className={'sw-root' + (rotated ? ' sw-rotated' : '') + (chromeHidden ? ' sw-chrome-hidden' : '')
      // the layout classes from the root's own box (use-panel-layout.js); sw-narrow agrees with the
      // renderer's classList toggle, so a re-render cannot drop it
      + (layout && layout.narrow ? ' sw-narrow' : '') + (layout && layout.compact ? ' sw-compact' : '')
      + (panelOpen ? ' sw-panel-open' : '') + (collapse ? ' sw-collapse' : '') + (collapse && menuOpen ? ' sw-menu-open' : '')}
      ref={wrapRef} data-panel={panelOpen ? (layout && layout.sheet ? 'sheet' : 'dock') : undefined}
      tabIndex={0} onKeyDown={onKeyDown}
      role="application"
      aria-label="The Scripture Web — an interactive map of cross-references"
      aria-describedby="sw-a11y-help">
      <canvas className="sw-canvas sw-canvas-gl" ref={glRef} aria-hidden="true" />
      <canvas className="sw-canvas sw-canvas-ui" ref={uiRef} aria-hidden="true" />

      {!graph && <div className="sw-loading">Weaving the web…</div>}

      <div className="sw-topbar" ref={topbarRef}>
        {/* with the go-to open, Back puts it away first, as Escape does (it is the top layer; w4) */}
        <button type="button" className="sw-btn sw-btn-icon" data-sw-goto-back=""
          onClick={() => (goTo.isOpen ? goTo.close() : onBack())} aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="sw-title">
          <h1>{mode === 'personal' ? 'My Web' : 'The Scripture Web'}</h1>
          {mode === 'personal'
            /* "N links · M from Timothy's notes" (r2-05), the invitation with no
               links (R3), and the links not on the web said, never dropped (item
               27): describe.js, the My Web stream's words */
            ? <>
              <p>{myWebHeadline(personalCount, contextCount)}</p>
              {skippedCount > 0 && <p>{myWebSkippedLine(skippedCount, pendingCount)}</p>}
            </>
            /* The count shown, alone: "15,402 of 63,418" read as a fraction of
               something the reader had not asked about (Corbin, 2026-09-11:
               "just keep x connections"); the density hint that flashes on a
               switch is where the two densities are explained. */
            : (stats && <p>{stats.shown.toLocaleString()} connections</p>)}
          {/* the density's line after a switch: seen here, said by .sw-live (one live region) */}
          {hint ? <div className="sw-hint" aria-hidden="true">{hint}</div> : null}
        </div>
      </div>

      <div className="sw-controls" ref={controlsRef}
        onKeyDown={(e) => {
          // Escape in the open menu closes the menu, not the panel or the web
          if (e.key !== 'Escape' || !(collapse && menuOpen)) return;
          e.stopPropagation();
          setMenuOpen(false);
          if (moreBtnRef.current) moreBtnRef.current.focus();
        }}>
        {/* THE HEADER SLOT: the go-to's search button, first in the row (spec
            section 4.1). goto.jsx owns it (null in My Web, where nothing renders) */}
        {goTo.button}
        {/* THE MENU: the controls in the row or, collapsed (spec section 3), the drop-down the
            more button opens; the same buttons either way */}
        <div className="sw-menu" id="sw-menu">
        <div className="sw-seg" role="group" aria-label="Which web">
          <button type="button" className={'sw-seg-btn' + (mode === 'canonical' ? ' is-on' : '')}
            aria-pressed={mode === 'canonical'} onClick={fromMenu(() => switchMode('canonical'))}>Scripture</button>
          <button type="button" ref={myWebBtnRef} className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={fromMenu(() => switchMode('personal'))}>My Web</button>
        </div>
        <button type="button" className={'sw-btn' + (listOpen ? ' is-on' : '')}
          onClick={fromMenu(() => { setListOpen(!listOpen); setChoices(null); })}
          aria-expanded={listOpen} aria-haspopup="dialog">Nearby</button>
        {mode === 'canonical' ? (
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Connection density</span>
              <select className="sw-select" value={density} aria-label="Connection density"
                onChange={(e) => {
                  const next = /** @type {Density} */ (e.target.value);
                  setDensity(next);
                  flashHint(densityLine(next, graphStats(graph, next).shown));
                  if (typeof updateSetting === 'function') updateSetting('webDensity', next);
                  setMenuOpen(false);
                }}>
                {/* each density with its count and one line (Q6); closed, the face reads its name */}
                {/* the count only once the graph is here: no "Famous · 0" while the web is woven */}
                <option value="famous">{graph ? densityLine('famous', famousCount) : 'Famous'}</option>
                <option value="essential">{graph ? densityLine('essential', essentialCount) : 'Essential'}</option>
              </select>
              <span className="sw-select-face" aria-hidden="true">
                {density === 'essential' ? 'Essential' : 'Famous'}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </label>
        ) : (
          <button type="button" className={'sw-btn sw-toggle' + (showUnderlay ? ' is-on' : '')} aria-pressed={showUnderlay}
            onClick={fromMenu(() => { setShowUnderlay(!showUnderlay); schedule(); })}
            aria-label={'Timothy’s notes · ' + (contextCount > 0 ? contextCount.toLocaleString() : '…') + ' citations'}>
            Timothy&rsquo;s notes · {contextCount > 0 ? contextCount.toLocaleString() : '…'}
          </button>
        )}
        <button type="button" className="sw-btn" onClick={fromMenu(resetView)} aria-label="Reset the view">Reset</button>
        </div>
        {collapse ? (
          <button type="button" ref={moreBtnRef} className={'sw-btn sw-btn-icon sw-more-btn' + (menuOpen ? ' is-on' : '')}
            aria-label="More controls" aria-expanded={menuOpen} aria-controls="sw-menu" onClick={() => setMenuOpen(!menuOpen)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* HIDE THE CONTROLS — outside everything it hides, because it is the way
          back; bottom-right, the one free corner on the smallest frame (app.css
          says why). Hidden means the topbar and the strip (the pills, Reset, the
          counter); the book rail on the UI canvas and the colour key stay, because
          they are how the web is read, not how it is driven (Corbin, 2026-09-11:
          "keep the web legend (the books at the bottom, etc) but just hide the
          interactable UI"). Its label flips with its name (the a11y pass, w3): "Hide
          controls" (a round icon, the words for a screen reader and a tooltip) and, hidden,
          "Show controls" in words, because then it is the only way back. */}
      <button type="button" className="sw-btn sw-btn-icon sw-hide-all"
        aria-label={chromeHidden ? 'Show controls' : 'Hide controls'}
        title={chromeHidden ? undefined : 'Hide controls'} onClick={toggleChrome}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d={chromeHidden ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
        </svg>
        <span className="sw-hide-label">{chromeHidden ? 'Show controls' : 'Hide controls'}</span>
      </button>

      {/* the how-to-read card's button: the corner above the hide-all
          button, off the controls strip (which it overflowed on a phone). It waits for the web
          as the card does (w4 review: pressed during the load it showed nothing, then opened the
          card late and unasked when the web arrived) */}
      {graph && (
        <button type="button" className={'sw-btn sw-btn-icon sw-guide-btn' + (guideShown ? ' is-on' : '')}
          onClick={() => (guideShown ? closeGuide() : setGuideOpen(true))}
          aria-label="How to read this web" aria-expanded={guideShown} aria-haspopup="dialog">?</button>
      )}
      {guideShown && <HowToReadGuide onClose={closeGuide} canSearch={!!goTo.button} credit={graph && graph.attribution} mode={mode} />}
      {goTo.box}
      {emptyShown && <EmptyWebNotice onDismiss={dismissEmpty} />}
      {tip && <TipChip info={tip} viewport={viewRef.current} inset={panelInsetRef.current} />}
      {/* THE DOCKED PANEL (web-panel.jsx): one panel at the right edge while anything is open; Nearby
          over the chooser over the open card, the precedence the state has */}
      {panelOpen && graph ? (
        <WebPanel graph={graph} mode={mode} density={density} translation={translation}
          compact={!!(layout && layout.compact)}
          listOpen={listOpen} listItems={listItems} choices={choices} choiceChapter={choiceChapter} choiceCut={choiceCut}
          detail={detail} journey={journey}
          lensOn={listOpen && mode !== 'personal' && !!(camRef.current && viewRef.current.W && lensRange(graph, camRef.current, viewRef.current.W))}
          onClose={closeCards} onChoose={commitFound} openPanel={openPanel} followThread={followThread}
          followRow={followRow} zoomTo={zoomTo} onOpen={openEndpoint} lightThreads={lightThreads} />
      ) : null}

      {/* the key, and the OpenBible.info credit as its tail (Q5): read, not hidden; its glyphs are */}
      <div className="sw-legend"><div className="sw-legend-line">{legendFor(mode, graph && graph.attribution)}</div></div>
      {mode === 'personal' && railZoom.top ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-top" aria-label="Reset the Volumes rail"
          data-wheel-through="1" onClick={() => resetRail('top')}>Reset Volumes</button>
      ) : null}
      {mode === 'personal' && railZoom.bottom ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-bottom" aria-label="Reset the Bible rail"
          data-wheel-through="1" onClick={() => resetRail('bottom')}>Reset Bible</button>
      ) : null}
      <div className="sw-live" role="status" aria-live="polite">{announce}</div>
      <div id="sw-a11y-help" className="sw-sr-only">{WEB_KEYS_HELP}</div>
    </div>
  );
}

/* The graph asset's loader lives in utils/scripture-web/web-data.js; it is
   still exported from here, where _entry-d.js imports it. */
export { ensureScriptureWebData };
