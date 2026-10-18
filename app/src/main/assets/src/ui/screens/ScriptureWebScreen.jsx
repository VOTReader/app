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
   ═══════════════════════════════════════════════════════════════════════ */

import {
  clampCamera, fitPPV, xToVerse, zoomAbout,
} from '../../utils/scripture-web/geometry.js';
import {
  pickArcs, pickChapter, pickVerse, refOfVerse, chapterRange,
  lensRange, nearbyChapter, nearbyThreads,
} from '../../utils/scripture-web/pick.js';
import { DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { useWebCamera } from '../scripture-web/use-web-camera.js';
import { useFrameScheduler } from '../scripture-web/use-frame-scheduler.js';
import { useForcedLandscape } from '../scripture-web/use-forced-landscape.js';
import { useWebGraph, useChromeTokens, useWebRenderer } from '../scripture-web/use-web-renderer.js';
import { usePersonalWeb } from '../scripture-web/use-personal-web.js';
import { maxZoomOf } from '../../utils/scripture-web/web-frame.js';
/** @typedef {import('../../utils/scripture-web/decode.js').Density} Density */
import { attachWebGestures } from '../scripture-web/gestures.js';
import { WebFallbackList } from '../scripture-web/WebFallbackList.jsx';
import {
  TipChip, HowToReadGuide, ConnectionChooser, ConnectionList, DetailSheet, EmptyWebNotice,
  loadErrorPanel, legendFor,
} from '../scripture-web/panels.jsx';
import { startChapter } from '../../utils/scripture-web/chapter-connections.js';
import {
  describeFound, summaryOf, votNodeName, verseTextFor, graphStats, densityHint,
  chooserAnnouncement, followAnnouncement, groupAnnouncement, ZOOM_MAX_MESSAGE,
} from '../../utils/scripture-web/describe.js';
import { ensureScriptureWebData } from '../../utils/scripture-web/web-data.js';
import { pickPersonalLinks, pickUnderlayLinks } from '../scripture-web/rail-renderer.js';

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
function readChromeHidden() {
  try { return sessionStorage.getItem(CHROME_HIDDEN_KEY) === '1'; } catch (_e) { return false; }
}

/**
 * @param {object} props
 * @param {(endpoint:object, meta?:object) => void} props.navigateToLink
 * @param {() => void} props.onBack
 * @param {{webDensity?:string, theme?:string, swEmptyDismissed?:boolean, swGuideSeen?:boolean}} props.settings
 * @param {(key:string, value:any) => void} props.updateSetting
 */
export function ScriptureWebScreen({ navigateToLink, onBack, settings, updateSetting }) {
  // Taken once per mount (a ref survives StrictMode's second render; the module slot does not).
  const resumeRef = React.useRef(/** @type {any} */ (undefined));
  if (resumeRef.current === undefined) { resumeRef.current = resumeWeb; resumeWeb = null; }
  const glRef = React.useRef(null);
  const uiRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  // the one frame loop (use-frame-scheduler.js) and landscape, always
  // (use-forced-landscape.js): rotation, orientation lock, immersive, loc()
  const { drawRef, schedule, live, capFractionNow } = useFrameScheduler();
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
  const [detail, setDetail] = React.useState(() => (resumeRef.current && resumeRef.current.detail) || null);      // the open sheet
  const [choices, setChoices] = React.useState(null);    // overlapped line chooser
  const [listOpen, setListOpen] = React.useState(false); // accessible nearby list
  const [chromeHidden, setChromeHidden] = React.useState(readChromeHidden);
  const [tip, setTip] = React.useState(null);            // hover chip
  const [announce, setAnnounce] = React.useState('');
  // A transient explanation under the title — set on control cycles so the
  // reader is TOLD what Essential/Famous and the colour modes mean
  // instead of having to guess (the on-device report).
  const [hint, setHint] = React.useState('');
  const hintTimer = React.useRef(0);
  const flashHint = React.useCallback((text) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 3600);
  }, []);
  const [showUnderlay, setShowUnderlay] = React.useState(true);

  // ── everything below here is per-frame state; deliberately NOT React ──
  const topbarRef = React.useRef(null);
  // Hover is a LIGHT touch: it brightens the thread under the pointer and
  // names it, but never dims the rest of the web. Only a tap focuses.
  const hoverRef = React.useRef(-1);
  // frame() runs per draw and must stay identity-stable, so it reads the mode
  // from a ref rather than closing over the state value.
  const modeRef = React.useRef(mode);
  // The cameras (canon + Volumes rail), the view, the focused thread and the
  // frame maths that reads them (v15-code-health-06).
  const {
    camRef, camVRef, lastRailRef, viewRef, focusRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor,
  } = useWebCamera({ graph, density, modeRef });
  const theme = settings && settings.theme;

  // The pointer handlers are reached through a ref for the reason draw is
  // (use-frame-scheduler.js): the gesture listeners bind once and call the
  // LATEST handlers, not the ones of the render that attached them.
  const handlersRef = React.useRef(/** @type {any} */ ({}));
  const hoverRafRef = React.useRef(0);
  const hoverPointRef = React.useRef(null);

  /* The hover chip names what is under a resting mouse. A drag, pinch, wheel or key pan moves the
     web out from under it, so each one drops it (sw1 B4: it stayed put over different lines). */
  const tipOnRef = React.useRef(false);
  React.useEffect(() => { tipOnRef.current = !!tip; }, [tip]);
  const dropHover = React.useCallback(() => {
    if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = 0; }
    hoverPointRef.current = null;
    hoverRef.current = -1;
    if (tipOnRef.current) { tipOnRef.current = false; setTip(null); }
  }, []);
  // the canvas's colours, re-read when the theme flips (use-web-renderer.js)
  const chromeRef = useChromeTokens(theme, schedule);

  // frame() reads the mode from a ref so it can stay identity-stable across
  // renders; keep that ref in step with the state it mirrors.
  React.useEffect(() => { modeRef.current = mode; schedule(); }, [mode, schedule]);

  // My Web (use-personal-web.js): the reader's links built into the dual
  // rail, rebuilt live; railOpts() is what the rail renderer places them by
  const { personalRef, personalCount, railOpts } = usePersonalWeb({
    graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule,
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
  // it writes the elevator's track and the pills' boxes the tap test reads
  const { noWebGL, glRetry, retryGL, railZoom, elevatorRef, badgeBoxesRef } = useWebRenderer({
    graph, mode, density, setLoadError, resumeRef, glRef, uiRef, wrapRef, topbarRef,
    camRef, camVRef, viewRef, focusRef, viewFor, zoomCapFor, yFrameFor,
    chromeRef, personalRef, hoverRef, railOpts, drawRef, schedule, capFractionNow,
  });

  /**
   * The elevator's lift (landing 14): for a pointer going down on the track
   * (device-px box in elevatorRef, kept by drawElevator), the function of a
   * CSS y that sets the camera's height - the track's top is the tallest
   * apex, its foot the baseline. Null off the track, so the web pans.
   */
  const liftAt = React.useCallback((cx, cy) => {
    const lift = elevatorRef.current, v = viewRef.current;
    if (!lift || !v.W) return null;
    const px = cx * v.DPR, py = cy * v.DPR;
    if (px < lift.x0 || px > lift.x1 || py < lift.y0 || py > lift.y1) return null;
    return (yCss) => {
      const cam = camRef.current;
      if (!cam) return;
      const f = lift.y1 > lift.y0 ? (lift.y1 - yCss * v.DPR) / (lift.y1 - lift.y0) : 0;
      cam.y = Math.max(0, Math.min(1, f)) * lift.maxY;
    };
  }, [camRef, viewRef, elevatorRef]);

  // ── gestures — imperative, never React state per frame ──────────────────
  // Wiring itself lives in gestures.js (attachWebGestures) — a pure move, so
  // it can be exercised with real dispatched DOM events instead of only a
  // screenshot. This effect just owns the mount guard and hands over refs.
  // W52: noWebGL and glRetry are deps because the fallback unmounts .sw-root
  // and Try again mounts a NEW one; without them the listeners stayed on the
  // first, detached root and the web came back dead to every drag and pinch.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph || noWebGL) return;
    return attachWebGestures(el, {
      loc, dpr: () => viewRef.current.DPR, cam: () => camRef.current, camFor,
      view: () => viewRef.current, handlers: () => handlersRef.current,
      live: () => { live(); dropHover(); },
      schedule, maxZoom: (c) => zoomCapFor(c || camRef.current), clampCamera, zoomAbout, xToVerse,
      yFrame: yFrameFor, lift: liftAt,
    });
  }, [graph, noWebGL, glRetry, schedule, loc, camFor, zoomCapFor, live, dropHover, yFrameFor, liftAt, viewRef, camRef]);

  // Verse and chapter candidates carry no distance: they only ever come alone.
  const hitCandidatesAt = React.useCallback(/** @returns {Array<{ kind: string, distance?: number } & Record<string, any>>} */ (cx, cy) => {
    const g = graph, cam = camRef.current, v = viewRef.current;
    if (!g || !cam || !v.W) return [];
    const px = cx * v.DPR, py = cy * v.DPR;
    const view = viewFor();
    if (mode !== 'personal') {
      // a badge is a real target: the bundle it counts
      for (const box of badgeBoxesRef.current) {
        if (px < box.x0 || px > box.x1 || py < box.y0 || py > box.y1) continue;
        if (box.cell) return [{ kind: 'bundle', cell: box.cell, distance: 0 }];
      }
    }
    if (mode === 'personal') {
      const p = personalRef.current;
      const opts = railOpts();
      const userHits = pickPersonalLinks(p && p.graph, opts, px, py, 14 * v.DPR, 4);
      if (userHits.length) return userHits.map((hit) => ({
        kind: 'link', index: hit.index, distance: hit.distance,
      }));
      if (showUnderlay) {
        const contextHits = pickUnderlayLinks(p && p.underlay, opts, px, py, 14 * v.DPR, 4);
        if (contextHits.length) return contextHits.map((hit) => ({
          kind: 'underlay', index: hit.index, distance: hit.distance,
        }));
      }
      const ci = pickChapter(g, cam, view, px, py);
      return ci >= 0 ? [{ kind: 'chapter', chapterIndex: ci }] : [];
    }
    const ci = pickChapter(g, cam, view, px, py);
    if (ci >= 0) {
      const zoomed = cam.ppv > 26 * v.DPR;
      if (zoomed) {
        const verse = pickVerse(g, cam, view, px, py);
        if (verse >= 0) return [{ kind: 'verse', verse }];
      }
      return [{ kind: 'chapter', chapterIndex: ci }];
    }
    return pickArcs(g, cam, view, px, py, 14 * v.DPR, 4)
      .map((hit) => ({ kind: 'arc', hit, distance: hit.distance }));
  }, [graph, camRef, viewRef, viewFor, mode, railOpts, showUnderlay, badgeBoxesRef, personalRef]);

  const hitAt = React.useCallback((cx, cy) => hitCandidatesAt(cx, cy)[0] || null,
    [hitCandidatesAt]);

  // what a hit is, in the panels' terms (describe.js), read in this frame
  const describe = React.useCallback((found) => describeFound(found, {
    g: graph, personal: personalRef.current, cam: camRef.current, v: viewRef.current, viewFor, density,
  }), [graph, camRef, viewRef, density, viewFor, personalRef]);

  const listItems = React.useMemo(() => {
    if (!graph || !listOpen) return [];
    const found = [];
    if (mode === 'personal') {
      const p = personalRef.current;
      const count = p && p.graph ? p.graph.count : 0;
      for (let i = 0; i < Math.min(count, 36); i++) found.push({ kind: 'link', index: i });
      if (!found.length && showUnderlay && p && p.underlay) {
        for (let i = 0; i < Math.min(p.underlay.count, 36); i++) found.push({ kind: 'underlay', index: i });
      }
    } else {
      // the list reads the lens (landing 15): the lit chapter leads - its
      // sheet says where its threads go, by chapter - then its threads,
      // strongest first, so the sky is walked from a list as well as by eye
      const cam = camRef.current, v = viewRef.current;
      if (!cam || !v.W) return [];
      const chapterIndex = nearbyChapter(graph, cam, v.W);
      if (chapterIndex < 0) return [];
      const [lo, hi] = chapterRange(graph, chapterIndex);
      found.push({ kind: 'chapter', chapterIndex });
      for (const index of nearbyThreads(graph, lo, hi, density, 36)) {
        found.push({ kind: 'arc', hit: {
          index, from: graph.from[index], to: graph.to[index], votes: graph.votes[index],
        } });
      }
    }
    return found.map(describe).filter(Boolean);
  }, [graph, listOpen, mode, describe, showUnderlay, camRef, viewRef, density, personalRef]);

  const commitFound = React.useCallback((found) => {
    if (!found) return;
    // the far foot is the one further from the camera: what Follow pans to
    if (found.kind === 'arc' && camRef.current) {
      const x = camRef.current.x;
      found = Object.assign({}, found, { far: Math.abs(found.to - x) >= Math.abs(found.from - x) ? 'to' : 'from' });
    }
    focusRef.current = found.kind === 'arc' || found.kind === 'link'
      ? { arc: found.index, range: null }
      : { arc: -1, range: found.kind === 'chapter' || found.kind === 'bundle' ? [found.lo, found.hi]
        : found.kind === 'verse' ? [found.verse, found.verse] : null };
    hoverRef.current = -1;
    setTip(null);
    setChoices(null);
    setListOpen(false);
    setDetail(found);
    setAnnounce(summaryOf(found));
    schedule();
  }, [camRef, focusRef, schedule]);

  const hover = React.useCallback((cx, cy) => {
    hoverPointRef.current = { cx, cy };
    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      const point = hoverPointRef.current;
      if (!point) return;
      const found = describe(hitAt(point.cx, point.cy));
      const nextHover = found && found.kind === 'arc' ? found.index : -1;
      if (nextHover !== hoverRef.current) { hoverRef.current = nextHover; schedule(); }
      setTip((previous) => {
        if (!found) return previous ? null : previous;
        if (previous && previous.info.kind === found.kind &&
            (found.kind !== 'arc' || previous.info.index === found.index) &&
            Math.abs(previous.x - point.cx) < 4 && Math.abs(previous.y - point.cy) < 4) {
          return previous;
        }
        return { info: found, x: point.cx, y: point.cy };
      });
    });
  }, [describe, hitAt, schedule]);

  React.useEffect(() => () => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
  }, []);

  const tap = React.useCallback((cx, cy) => {
    // the elevator (landing 9): a tap on the track sets the camera's height -
    // the top of the track is the tallest apex, the bottom the baseline
    const lift = liftAt(cx, cy);
    if (lift) { lift(cy); schedule(); return; }
    const candidates = hitCandidatesAt(cx, cy);
    const described = candidates.map(describe).filter(Boolean);
    if (!described.length) {
      focusRef.current = { arc: -1, range: null };
      hoverRef.current = -1;
      setTip(null); setChoices(null); setDetail(null); setListOpen(false); schedule(); return;
    }
    const closeEnough = candidates.length > 1 && candidates[1].distance <= 8 * viewRef.current.DPR;
    if (closeEnough && described.length > 1 && described.every((item) => item.kind === 'arc' ||
        item.kind === 'link' || item.kind === 'underlay')) {
      setChoices(described);
      setDetail(null);
      setListOpen(false);
      // nothing is chosen while the chooser asks, and its rows replace the hover chip
      focusRef.current = { arc: -1, range: null };
      dropHover();
      setAnnounce(chooserAnnouncement(described.length));
      schedule();
      return;
    }
    commitFound(described[0]);
  }, [liftAt, hitCandidatesAt, describe, viewRef, commitFound, schedule, focusRef, dropHover]);

  const doubleTap = React.useCallback((cx) => {
    const cam = camRef.current, v = viewRef.current;
    zoomAbout(cam, v.W, cx * v.DPR, 2.5, maxZoomOf(graph, v), yFrameFor(cam) || undefined);
    schedule();
  }, [camRef, graph, schedule, viewRef, yFrameFor]);

  // Publish the latest handlers for the (stable) gesture listeners to call.
  React.useEffect(() => { handlersRef.current = { hover, tap, doubleTap }; }, [hover, tap, doubleTap]);

  /** Reset one rail's camera to fit (r2: each rail has its own). */
  const resetRail = React.useCallback((which) => {
    const v = viewRef.current;
    const c = which === 'top' ? camVRef.current : camRef.current;
    if (!c) return;
    c.ppv = fitPPV(c, v.W);
    c.x = c.total / 2;
    clampCamera(c, v.W, zoomCapFor(c));
    schedule();
  }, [camRef, camVRef, schedule, viewRef, zoomCapFor]);

  const resetView = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam) return;
    cam.ppv = fitPPV(cam, v.W);
    cam.x = cam.total / 2;
    // explicit, though the frameless clamp below also holds y at 0: Reset
    // MEANS the baseline, whatever clamp a later edit puts after it
    cam.y = 0;
    clampCamera(cam, v.W, maxZoomOf(graph, v));
    if (camVRef.current) resetRail('top');
    focusRef.current = { arc: -1, range: null };
    hoverRef.current = -1;
    setDetail(null); setChoices(null); setListOpen(false); setTip(null); schedule();
  }, [camRef, viewRef, graph, camVRef, resetRail, focusRef, schedule]);

  const toggleChrome = React.useCallback(() => {
    const next = !chromeHidden;
    try {
      if (next) sessionStorage.setItem(CHROME_HIDDEN_KEY, '1');
      else sessionStorage.removeItem(CHROME_HIDDEN_KEY);
    } catch (_e) { /* private mode: the toggle still works for this mount */ }
    setChromeHidden(next);
  }, [chromeHidden]);

  /** Close the cards (the chooser, the Nearby list, the connection sheet) and let go of the chosen
   * line. Every close goes through here: the sheet's x once cleared the card but kept focusRef, so
   * the shader held every other thread at 5 % ink until Escape or Back (sw1 B1, 2026-10-05). */
  const closeCards = React.useCallback(() => {
    setListOpen(false); setChoices(null); setDetail(null); setTip(null);
    focusRef.current = { arc: -1, range: null };
    hoverRef.current = -1;
    schedule();
  }, [focusRef, schedule]);

  /** Scripture / My web. The chosen line goes with the cards: a link's index and a canon thread's
   * index number two different graphs, so a focus kept across the switch spotlit an unrelated
   * line in the other web, with nothing open for Escape or Back to close (sweep v5, 2026-10-14). */
  const switchMode = React.useCallback((next) => {
    closeCards();
    setMode(next);
  }, [closeCards]);

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
    personalRef]);

  /** Follow the chosen line to its far foot: the camera centres on that
   * verse at the same zoom, the line stays spotlit, and the control turns
   * to the other end so the reader can walk it back (Corbin's brief,
   * 2026-09-11: "every line followable end to end"). */
  const followThread = React.useCallback((info) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !info || info.kind !== 'arc') return;
    const toFar = info.far === 'to';
    cam.x = toFar ? info.to : info.from;
    clampCamera(cam, v.W, zoomCapFor(cam), yFrameFor(cam) || undefined);
    setDetail(Object.assign({}, info, { far: toFar ? 'from' : 'to' }));
    setAnnounce(followAnnouncement((toFar ? info.b : info.a).label));
    schedule();
  }, [camRef, viewRef, zoomCapFor, yFrameFor, schedule]);

  const openEndpoint = React.useCallback((endpoint) => {
    if (!endpoint || typeof navigateToLink !== 'function') return;
    // meta.sourceLetterTitle is what the reader's back pill is labelled with,
    // and the hook snapshots the current screen as the return target — so a
    // jump from here comes back HERE.
    const cam = camRef.current;
    resumeWeb = cam ? { mode: modeRef.current, cam: Object.assign({}, cam), focus: Object.assign({}, focusRef.current), detail } : null;
    navigateToLink(endpoint, { sourceLetterTitle: 'The Scripture Web' });
  }, [navigateToLink, camRef, focusRef, modeRef, detail]);

  // A bundle's group, chosen in its sheet: the pair of ranges the shader and
  // the picker draw and spotlight (uFocusRange2). Choosing the
  // same group again lets go of it.
  const chooseGroup = React.useCallback((info, grp) => {
    const same = focusRef.current.range2 && grp && focusRef.current.range2[0] === grp.lo && focusRef.current.range2[1] === grp.hi;
    focusRef.current = { arc: -1, range: [info.lo, info.hi], range2: same || !grp ? null : [grp.lo, grp.hi] };
    setDetail(Object.assign({}, info, { chosenGroup: same || !grp ? null : grp.chapterIndex }));
    setAnnounce(groupAnnouncement(grp, same || !grp));
    schedule();
  }, [focusRef, schedule]);
  // ── render ──────────────────────────────────────────────────────────────
  if (loadError) return loadErrorPanel(loadError, retryLoad);
  if (noWebGL && graph) {
    // A7: the web read as a list instead of a dead end (WebFallbackList.jsx).
    // It opens on the reader's last Bible chapter (HistoryStore, newest first).
    const hist = typeof HistoryStore !== 'undefined' ? HistoryStore.list() : [];
    const lastCh = (hist || []).find((h) => h && h.type === 'chapter' && h.bookId && h.chapterNum);
    return (
      <WebFallbackList graph={graph}
        initialChapter={startChapter(graph, lastCh && lastCh.bookId, lastCh && lastCh.chapterNum)}
        onOpen={(ref) => navigateToLink && navigateToLink({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse })}
        onRetry={retryGL}
        onBack={onBack} verseText={verseTextFor} />
    );
  }
  // (noWebGL is only ever set by the renderer effect, which needs the graph,
  // and the graph is never cleared once loaded: the list above is the one
  // no-WebGL face.)

  const stats = graph ? graphStats(graph, density) : null;

  return (
    <div className={'sw-root' + (rotated ? ' sw-rotated' : '') + (chromeHidden ? ' sw-chrome-hidden' : '')} ref={wrapRef}
      tabIndex={0} onKeyDown={onKeyDown}
      role="application"
      aria-label="The Scripture Web — an interactive map of cross-references"
      aria-describedby="sw-a11y-help">
      <canvas className="sw-canvas sw-canvas-gl" ref={glRef} aria-hidden="true" />
      <canvas className="sw-canvas sw-canvas-ui" ref={uiRef} aria-hidden="true" />

      {!graph && <div className="sw-loading">Weaving the web…</div>}

      <div className="sw-topbar" ref={topbarRef}>
        <button type="button" className="sw-btn sw-btn-icon" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="sw-title">
          <h1>{mode === 'personal' ? 'My Web' : 'The Scripture Web'}</h1>
          {mode === 'personal'
            ? (personalCount === 0
              /* An invitation, not a count of zero: "0 links you have made" under
                 a fog was Corbin's screenshot of a dead screen (design-perf,
                 2026-09-10). The number returns with the first link. */
              ? <p>No links yet — select any text and tap Link.</p>
              : <p>{personalCount.toLocaleString()} {personalCount === 1 ? 'link' : 'links'} you have made</p>)
            /* The count shown, alone: "15,402 of 63,418" read as a fraction of
               something the reader had not asked about (Corbin, 2026-09-11:
               "just keep x connections"); the density hint that flashes on a
               switch is where the two densities are explained. */
            : (stats && <p>{stats.shown.toLocaleString()} connections</p>)}
          {hint && <p className="sw-hint" role="status">{hint}</p>}
        </div>
      </div>

      <div className="sw-controls">
        <div className="sw-seg" role="group" aria-label="Which web">
          <button type="button" className={'sw-seg-btn' + (mode === 'canonical' ? ' is-on' : '')}
            aria-pressed={mode === 'canonical'} onClick={() => switchMode('canonical')}>Scripture</button>
          <button type="button" ref={myWebBtnRef} className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={() => switchMode('personal')}>My web</button>
        </div>
        <button type="button" className={'sw-btn' + (listOpen ? ' is-on' : '')}
          onClick={() => { setListOpen(!listOpen); setChoices(null); }}
          aria-expanded={listOpen} aria-haspopup="dialog">Nearby</button>
        {mode === 'canonical' ? (
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Connection density</span>
              <select className="sw-select" value={density} aria-label="Connection density"
                onChange={(e) => {
                  const next = /** @type {Density} */ (e.target.value);
                  setDensity(next);
                  flashHint(densityHint(next));
                  if (typeof updateSetting === 'function') updateSetting('webDensity', next);
                }}>
                <option value="essential">Essential</option>
                <option value="famous">Famous</option>
              </select>
            </label>
        ) : (
          <button type="button" className={'sw-btn sw-toggle' + (showUnderlay ? ' is-on' : '')} aria-pressed={showUnderlay}
            onClick={() => { setShowUnderlay(!showUnderlay); schedule(); }}
            aria-label={'Corpus context · ' + (personalRef.current && personalRef.current.underlay
              ? personalRef.current.underlay.count.toLocaleString() : '…') + ' curated connections'}>
            Corpus context · {personalRef.current && personalRef.current.underlay
              ? personalRef.current.underlay.count.toLocaleString() : '…'}
          </button>
        )}
        <button type="button" className="sw-btn" onClick={resetView} aria-label="Reset the view">Reset</button>
        {/* NO CREDIT LINE HERE. The CC-BY attribution for the OpenBible.info
            dataset lives on About ("Cross-reference data from OpenBible.info,
            used under CC-BY."); the copy this strip carried printed over the
            book labels in landscape (Corbin, 2026-09-11). */}
      </div>

      {/* HIDE THE CONTROLS — outside everything it hides, because it is the way
          back; bottom-right, the one free corner on the smallest frame (app.css
          says why). Hidden means the topbar and the strip (the pills, Reset, the
          counter); the book rail on the UI canvas and the colour key stay, because
          they are how the web is read, not how it is driven (Corbin, 2026-09-11:
          "keep the web legend (the books at the bottom, etc) but just hide the
          interactable UI"). The label stays constant and aria-pressed carries
          the state, the same convention as the Scripture / My web seg. */}
      <button type="button" className="sw-btn sw-btn-icon sw-hide-all"
        aria-label="Hide controls" aria-pressed={chromeHidden} onClick={toggleChrome}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>

      {/* the how-to-read card's button: the corner above the hide-all
          button, off the controls strip (which it overflowed on a phone) */}
      <button type="button" className={'sw-btn sw-btn-icon sw-guide-btn' + (guideOpen ? ' is-on' : '')}
        onClick={() => (guideOpen ? closeGuide() : setGuideOpen(true))}
        aria-label="How to read this web" aria-expanded={guideOpen} aria-haspopup="dialog">?</button>
      {guideOpen && <HowToReadGuide onClose={closeGuide} />}
      {emptyShown && <EmptyWebNotice onDismiss={dismissEmpty} />}
      {tip && <TipChip info={tip} viewport={viewRef.current} />}
      {choices && <ConnectionChooser choices={choices} onChoose={commitFound} onClose={closeCards} />}
      {listOpen && <ConnectionList items={listItems} mode={mode}
        lensOn={mode !== 'personal' && !!(camRef.current && viewRef.current.W && lensRange(graph, camRef.current, viewRef.current.W))}
        onChoose={commitFound} onClose={closeCards} />}
      {detail && (
        <DetailSheet info={detail} onClose={closeCards} onOpen={openEndpoint} onFollow={followThread}
          onGroup={chooseGroup} />
      )}

      <div className="sw-legend" aria-hidden="true">{legendFor(mode)}</div>
      {mode === 'personal' && railZoom.top ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-top" aria-label="Reset the Volumes rail"
          data-wheel-through="1" onClick={() => resetRail('top')}>Reset Volumes</button>
      ) : null}
      {mode === 'personal' && railZoom.bottom ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-bottom" aria-label="Reset the Bible rail"
          data-wheel-through="1" onClick={() => resetRail('bottom')}>Reset Bible</button>
      ) : null}
      <div className="sw-live" role="status" aria-live="polite">{announce}</div>
      <div id="sw-a11y-help" className="sw-sr-only">
        Drag to move through scripture. Pinch or scroll to zoom, or use the plus and minus keys.
        Select a line to see its references; Nearby opens a keyboard-friendly list.
      </div>
    </div>
  );
}

/* The graph asset's loader lives in utils/scripture-web/web-data.js; it is
   still exported from here, where _entry-d.js imports it. */
export { ensureScriptureWebData };
