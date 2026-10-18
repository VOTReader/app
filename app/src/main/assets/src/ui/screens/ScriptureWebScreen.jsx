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

import { decodeGraph } from '../../utils/scripture-web/decode.js';
import {
  createCamera, clampCamera, fitPPV, verseToX, xToVerse, zoomAbout,
  rotatePointer, ribbonStyle, lensShareAt,
} from '../../utils/scripture-web/geometry.js';
import {
  pickArcs, pickChapter, pickVerse, refOfVerse, chapterRange, countAnchored,
  footBundles, lensRange, nearbyChapter, nearbyThreads,
} from '../../utils/scripture-web/pick.js';
import { createRenderer, DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { useWebCamera } from '../scripture-web/use-web-camera.js';
import { maxZoomOf } from '../../utils/scripture-web/web-frame.js';
/** @typedef {import('../../utils/scripture-web/decode.js').Density} Density */
import { attachWebGestures } from '../scripture-web/gestures.js';
import { WebFallbackList } from '../scripture-web/WebFallbackList.jsx';
import {
  TipChip, HowToReadGuide, ConnectionChooser, ConnectionList, DetailSheet, EmptyWebNotice,
  loadErrorPanel, legendFor,
} from '../scripture-web/panels.jsx';
import { startChapter } from '../../utils/scripture-web/chapter-connections.js';
import { readChromeTokens } from '../../utils/scripture-web/palette.js';
import {
  describeFound, summaryOf, votNodeName, verseTextFor, graphStats, densityHint,
  chooserAnnouncement, followAnnouncement, groupAnnouncement, ZOOM_MAX_MESSAGE,
} from '../../utils/scripture-web/describe.js';
import {
  buildVotRail, buildPersonalGraph, buildCuratedUnderlay,
} from '../../utils/scripture-web/personal-graph.js';
import { pickPersonalLinks, pickUnderlayLinks } from '../scripture-web/rail-renderer.js';
import { paintCanonOverlay, paintMyWebOverlay, publishRails } from '../scripture-web/overlay-renderer.js';

/**
 * Short names for the VOT rail. Full collection titles ("Words To Live By:
 * Part One") do not fit above a rail segment sized by letter count.
 */
const SHORT_VOL = {
  one: 'Vol I', two: 'Vol II', three: 'Vol III', four: 'Vol IV', five: 'Vol V',
  six: 'Vol VI', seven: 'Vol VII', rebuke: 'Rebuke', wtlb1: 'WTLB I',
  wtlb2: 'WTLB II', blessed: 'Blessed', flock: 'Flock', timothy: 'Timothy',
  holydays: 'Holy Days', hm: 'Manna',
};

/** Short rail names for the Bible studies (full titles are sentence-long). */
const SHORT_STUDY = {
  'more-than-a-man': 'MTaM', 'odds-chart': 'Odds', 'lamb-of-god': 'Lamb',
  'state-of-the-dead': 'SotD', 'grace-and-the-law': 'Grace',
  'trinity-exposed': 'Trinity', 'purity': 'Purity',
};

/* The zoom ceiling (maxZoomOf), the frame, the render arguments and the y
   frame live in utils/scripture-web/web-frame.js, pure and tested; the
   cameras and view that feed them in ui/scripture-web/use-web-camera.js. */

/**
 * Anchored arcs per CSS px of viewport width, which is what decides whether
 * the deep alpha reads as one clear ribbon or as fog. Counted over the drawn
 * set with the shader's own arcAnchored law, cached until the camera moves
 * more than 5 % - 64k pairs is under a millisecond but not per frame.
 */
function anchoredDensity(cache, g, cam, v, density) {
  const moved = cache.W !== v.W || cache.density !== density
    || Math.abs(cam.ppv - cache.ppv) > cache.ppv * 0.05
    || Math.abs(cam.x - cache.x) * cam.ppv > v.W * 0.05;
  if (moved) {
    cache.ppv = cam.ppv; cache.x = cam.x; cache.W = v.W; cache.density = density;
    // every anchored thread is drawn (the structure law), so the crowding
    // law counts them all
    cache.value = countAnchored(g, cam, v.W, density);
  }
  return cache.value / ((v.W || 1) / (v.DPR || 1));
}

/**
 * The convergence pills' counts: how many anchored threads have a foot in
 * each in-view foot cell (pick.footBundles), cached while the camera moves
 * less than 2 %; overlay-renderer.js draws them.
 */
function bundlesFor(cache, g, cam, view, v, density) {
  const key = [v.W, density].join('|');
  const moved = cache.key !== key
    || Math.abs(cam.ppv - cache.ppv) > cache.ppv * 0.02
    || Math.abs(cam.x - cache.x) * cam.ppv > v.W * 0.02;
  if (moved) {
    cache.key = key; cache.ppv = cam.ppv; cache.x = cam.x;
    cache.cells = footBundles(g, cam, view, v.DPR);
  }
  return cache;
}

/* HIDE ALL. One session-scoped flag, not a profile setting: the reader hides
   the chrome to look at the web, and the next visit should open with the
   controls back. Absence is the signal — the key is removed, never set to
   '0' — so a default can never impersonate a choice. sessionStorage is not
   swept by the vot-* localStorage migration and is per-tab, which is the
   scope the flag means. */
const CHROME_HIDDEN_KEY = 'vot-sw-chrome-hidden';
const LIVE_HOLD_MS = 150;

/* Where the reader was when they opened a verse from the web (sw1 B3, 2026-10-05). The screen
   unmounts while the reader is up, and its camera, focus and card live in refs, so "Back to The
   Scripture Web" used to land at fit with nothing chosen. In memory only, never stored, and
   one-shot: the next mount takes it, the way WebFallbackList keeps its chapter. */
let resumeWeb = null;
/** Tests only: forget the resume point between cases. */
export function _resetWebPlace() { resumeWeb = null; }
const FADE_MS = 250;
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

  const [graph, setGraph] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [noWebGL, setNoWebGL] = React.useState(false);
  const [glRetry, setGlRetry] = React.useState(0);
  const [dataRetry, setDataRetry] = React.useState(0);
  // A canon needs its width. The Scripture Web presents in LANDSCAPE, always
  // (owner call, 2026-09-10: "landscape by default, no rotate option"). Where
  // the platform will flip the display, screen.orientation.lock('landscape')
  // does it; where that is refused, absent, or resolves without flipping, the
  // root is CSS-rotated 90° in ANY portrait viewport — chrome included — so
  // the reader turns the phone and sees landscape either way. No hint, no
  // control, no preference, no pointer-type gate. Pointer coords are mapped
  // back through loc(). A real flip arrives as a resize, and the resize
  // handler un-rotates by itself; there is nothing to settle.
  const [rotated, setRotated] = React.useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  React.useEffect(() => {
    const onResize = () => setRotated(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rotatedRef = React.useRef(rotated);
  React.useEffect(() => {
    if (!rotated) return undefined;
    const orientation = typeof screen !== 'undefined' && screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return undefined;
    // A refusal is not an error here: the CSS rotation already covers it.
    // lock() can reject OR throw synchronously depending on the browser.
    try { Promise.resolve(orientation.lock('landscape')).catch(() => {}); } catch (_e) { /* covered */ }
    return undefined;
  }, [rotated]);

  /** Viewport coords -> the rotated screen's own CSS space. */
  const loc = React.useCallback((e) => (rotatedRef.current
    ? rotatePointer(e.clientX, e.clientY, window.innerWidth)
    : { x: e.clientX, y: e.clientY }), []);
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
  const [personalCount, setPersonalCount] = React.useState(0);

  // ── everything below here is per-frame state; deliberately NOT React ──
  const [railZoom, setRailZoom] = React.useState({ top: false, bottom: false });
  const railZoomRef = React.useRef(railZoom);
  const rendererRef = React.useRef(null);
  const topbarRef = React.useRef(null);
  const anchoredRef = React.useRef({ ppv: 0, x: 0, W: 0, density: '', value: 0 });
  // the convergence pills: the counted cells, cached across frames while
  // the camera barely moves, and the boxes drawn last frame,
  // which the tap test reads before it reaches the lines
  const bundleRef = React.useRef({ key: '', cells: [] });
  const badgeBoxesRef = React.useRef([]);
  // the elevator's track (device px box + the height its top stands for),
  // null when there is no sky to climb; the tap test reads it first
  const elevatorRef = React.useRef(null);
  // Hover is a LIGHT touch: it brightens the thread under the pointer and
  // names it, but never dims the rest of the web. Only a tap focuses.
  const hoverRef = React.useRef(-1);
  const chromeRef = React.useRef(readChromeTokens());
  const rafRef = React.useRef(0);
  const personalRef = React.useRef(null);
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

  // ── load the graph asset (lazy, injected script, precached by the SW) ──
  // dataRetry is in the dep array so Try again's forced refetch happens
  // INSIDE the effect that owns the subscription (mirrors glRetry below) —
  // without it the button's ensureScriptureWebData(true) call is a promise
  // nobody holds, and the screen hangs on "Weaving the web…" forever.
  React.useEffect(() => {
    let alive = true;
    ensureScriptureWebData(dataRetry > 0)
      .then((data) => {
        if (!alive) return;
        const g = decodeGraph(data);
        g.chunkSize = data.chunkSize || 256;
        setGraph(g);
      })
      .catch((e) => { if (alive) setLoadError(e && e.message ? e.message : String(e)); });
    return () => { alive = false; };
  }, [dataRetry]);

  // Immersive while the web is open — it is a full-bleed instrument.
  React.useEffect(() => {
    if (typeof PlatformBridge !== 'undefined') PlatformBridge.setImmersiveMode(true);
    return () => {
      if (typeof PlatformBridge !== 'undefined') PlatformBridge.setImmersiveMode(false);
      // The rotation effect above may have locked landscape;
      // leaving without unlocking strands every OTHER screen rotated (F27).
      // No orientation API, and unlock() rejecting/throwing when nothing was
      // locked, are both normal — swallow either.
      try { screen.orientation.unlock(); } catch (_e) { /* nothing to unlock */ }
    };
  }, []);

  // Per-frame work is reached through refs, not through the dependency graph:
  // schedule() must keep a stable identity (gesture listeners bind it once and
  // run it hundreds of times a second), so it calls the LATEST draw via a ref
  // rather than closing over one. Same for the pointer handlers below.
  const drawRef = React.useRef(() => {});
  const handlersRef = React.useRef(/** @type {any} */ ({}));
  const hoverRafRef = React.useRef(0);
  const hoverPointRef = React.useRef(null);

  const schedule = React.useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawRef.current(); });
  }, []);

  // r2 (Orchestrator's ruling, 2026-09-11): while a gesture is live the
  // context's corridors keep LIVE_CAP layers a bin (a phone's frame budget);
  // at rest every layer (the approved picture). A wheel notch holds "live"
  // for LIVE_HOLD_MS so a run of notches never flickers between the two, and
  // the way back is a FADE_MS coverage ease, brightness only: nothing is
  // re-laid-out or re-bucketed, the cap is the one knob.
  const liveUntilRef = React.useRef(0);
  const releaseAtRef = React.useRef(0);
  const live = React.useCallback(() => {
    liveUntilRef.current = performance.now() + LIVE_HOLD_MS;
    releaseAtRef.current = 0;
  }, []);
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
  /** 0 while live, rising to 1 over FADE_MS after the hold; schedules the next frame while fading. */
  const capFractionNow = React.useCallback(() => {
    const now = performance.now();
    // a frame is kept pending through the hold, so the fade starts the moment
    // it ends even when the last gesture event drew the last frame
    if (now < liveUntilRef.current) { schedule(); return 0; }
    if (!liveUntilRef.current) return 1;
    if (!releaseAtRef.current) releaseAtRef.current = now;
    const f = Math.min(1, (now - releaseAtRef.current) / FADE_MS);
    if (f >= 1) { liveUntilRef.current = 0; releaseAtRef.current = 0; return 1; }
    schedule();
    return f;
  }, [schedule]);

  // A frame requested while the page is hidden never runs, so rafRef stays
  // set and EVERY later schedule() short-circuits — the view would come back
  // from the background permanently frozen, redrawing for nothing. Clearing
  // the stale handle on the way back is what keeps that from happening.
  React.useEffect(() => {
    const revive = () => {
      if (document.visibilityState === 'hidden') return;
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      schedule();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('pageshow', revive);
    window.addEventListener('focus', revive);
    return () => {
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('pageshow', revive);
      window.removeEventListener('focus', revive);
    };
  }, [schedule]);

  // Re-read chrome tokens whenever the theme flips. The settings prop covers
  // the in-app toggle, but light/dark is ultimately carried by a class on
  // <body> — watch that too, or a theme change from anywhere else leaves the
  // canvas painting yesterday's colours (the GL surface covers the CSS
  // background, so a stale token reads as "the theme didn't apply").
  React.useEffect(() => {
    const reread = () => { chromeRef.current = readChromeTokens(); schedule(); };
    reread();
    if (typeof MutationObserver === 'undefined' || !document.body) return undefined;
    const mo = new MutationObserver(reread);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [theme, schedule]);

  // frame() reads the mode from a ref so it can stay identity-stable across
  // renders; keep that ref in step with the state it mirrors.
  React.useEffect(() => { modeRef.current = mode; schedule(); }, [mode, schedule]);
  React.useEffect(() => { rotatedRef.current = rotated; schedule(); }, [rotated, schedule]);


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
  }, [camRef, camVRef, frame, showUnderlay, viewRef]);


  // ── render ──────────────────────────────────────────────────────────────
  const draw = React.useCallback(() => {
    const g = graph, cam = camRef.current, r = rendererRef.current;
    const v = viewRef.current;
    if (!g || !cam || !r || !v.W) return;
    const zoom = cam.ppv / fitPPV(cam, v.W);
    /* The zoom's own input, published for the browser walks (the same line the
       scripture-web walk branch carries, so the two merge as one): a walk that
       reads pixels after "three zoom steps" must first know the steps took. */
    // My Web's world is exactly the frame: its camera has no y frame, so a
    // height carried over from the canon web is dropped here, not drawn —
    // before the attribute below, so the published height is the drawn one.
    if (mode === 'personal') clampCamera(cam, v.W, zoomCapFor(cam));
    // the lens (landing 10): the chapter under the frame's centre, lit at
    // full ink past the overview while nothing is tapped; the rest keeps
    // LENS_CONTEXT of its alpha (drawn, tappable, counted). My Web has none.
    const lens = mode === 'personal' ? null : lensRange(g, cam, v.W);
    if (wrapRef.current) {
      wrapRef.current.setAttribute('data-ppv-css', (cam.ppv / v.DPR).toPrecision(4));
      // the camera's height, device px, for the walks (0 at the baseline)
      wrapRef.current.setAttribute('data-cam-y', (cam.y > 0 ? cam.y : 0).toFixed(1));
      wrapRef.current.setAttribute('data-lens', lens ? lens[0] + '-' + lens[1] : '');
    }
    const camV = mode === 'personal' ? camVRef.current : null;
    if (camV) clampCamera(camV, v.W, zoomCapFor(camV));
    if (wrapRef.current && camV) wrapRef.current.setAttribute('data-ppv-vot', (camV.ppv / v.DPR).toPrecision(4));
    const chrome = chromeRef.current;
    const base = viewFor();
    if (mode === 'personal') {
      // My Web has no sky and no elevator: the canon track's box must not
      // survive the switch, or liftAt eats every tap and drag in the right
      // 24 CSS px of the rails (the l9-14 refuter's one FAIL, 02:4x).
      elevatorRef.current = null;
      if (wrapRef.current) { wrapRef.current.setAttribute('data-elevator', ''); wrapRef.current.setAttribute('data-altitude', ''); wrapRef.current.setAttribute('data-altitude-span', ''); }
      // The personal web is Canvas2D over a cleared GL surface: hundreds of
      // links, not hundreds of thousands, so crisp 2D curves beat a second
      // shader. The GL pass still runs to paint the ground colour.
      r.draw(Object.assign({}, base, {
        camX: cam.x, ppv: cam.ppv, strokeWidth: 1, alpha: 0,
        density: 'essential', bg: chrome.bg,
        focusRange: null, focusArc: -1, hoverArc: -1, lens: null,
      }));
      const uic = uiRef.current;
      const ctx = uic && uic.getContext('2d');
      if (ctx) {
        const p = personalRef.current;
        const ro = railOpts();
        // the overlay (overlay-renderer.js): one clear, the links, the book names
        paintMyWebOverlay(ctx, {
          personal: p, g, cam, view: base, v, chrome,
          rail: Object.assign(ro, {
            hoverIndex: hoverRef.current, focusIndex: focusRef.current.arc, capFraction: capFractionNow(),
            // the walk's knob for the corridor pair (e2e-myweb-colour arm K): a
            // number here overrides the context's depth alpha ceiling; unset in the app
            contextCeiling: typeof globalThis.__swContextCeiling === 'number' ? globalThis.__swContextCeiling : undefined,
          }),
        });
        if (wrapRef.current) wrapRef.current.setAttribute('data-cap-fraction', String(ro.capFraction));
        publishRails(ro, p, g, cam, camV, v);
        // the per-rail reset pills show only while that rail is zoomed;
        // setState from the frame loop runs only when the answer changes
        const rz = { top: !!camV && camV.ppv > fitPPV(camV, v.W) * 1.02, bottom: cam.ppv > fitPPV(cam, v.W) * 1.02 };
        if (rz.top !== railZoomRef.current.top || rz.bottom !== railZoomRef.current.bottom) { railZoomRef.current = rz; setRailZoom(rz); }
      }
      return;
    }
    // The alpha and stroke law lives in geometry.js, not here: it used to be
    // written inline where no harness could import it, so every probe re-typed
    // it and would have measured the old law against a new screen.
    // the alpha law: thin at the overview, the deep value past 12x divided
    // by the crowd - every line is drawn, and the law was tuned for that
    // (Corbin, 2026-09-21 21:21)
    const perCssPx = base.localize > 0
      ? anchoredDensity(anchoredRef.current, g, cam, v, density) : 0;
    const style = ribbonStyle(zoom, base.localize, perCssPx);
    // the convergence pills: how many threads meet at each foot cell
    const bundles = bundlesFor(bundleRef.current, g, cam, base, v, density);
    // the lens eases in from 6x to 24x rather than switching on at 6x (sw1)
    const lensDim = lens ? lensShareAt(zoom) : 1;
    r.draw(Object.assign({}, base, {
      lens, lensDim,
      camX: cam.x, ppv: cam.ppv,
      strokeWidth: style.strokeWidthCss * v.DPR,
      alpha: style.alpha,
      voteMix: style.voteMix,
      dpr: v.DPR,
      density, bg: chrome.bg,
      focusRange: focusRef.current.range, focusArc: focusRef.current.arc,
      hoverArc: hoverRef.current,
    }));
    // the sky the labels may use starts under the top chrome (layout metrics,
    // so the rotated portrait root measures the same; 0 when the chrome is hidden)
    const tb = topbarRef.current;
    const inset = tb && tb.offsetHeight ? (tb.offsetTop + tb.offsetHeight) * v.DPR : 0;
    // the overlay (overlay-renderer.js): one clear, the ruler, the sky's
    // altitude ruler and elevator, the references beside the lines, the pills
    const uic = uiRef.current;
    const painted = paintCanonOverlay(uic ? uic.getContext('2d') : null, {
      g, cam, view: base, v, chrome, canvasH: uic ? uic.height : 0, inset, yFrame: yFrameFor(cam),
      density, focusArc: focusRef.current.arc, bundles, lens, lensDim,
    });
    elevatorRef.current = painted.elevator;
    badgeBoxesRef.current = painted.badges;
    if (wrapRef.current) {
      wrapRef.current.setAttribute('data-altitude', painted.marks.join(','));
      wrapRef.current.setAttribute('data-altitude-span', painted.altitudeSpan > 0 ? String(painted.altitudeSpan) : '');
      wrapRef.current.setAttribute('data-elevator', painted.elevator ? painted.elevator.at.toFixed(4) : '');
      wrapRef.current.setAttribute('data-thread-labels', String(painted.labels));
      wrapRef.current.setAttribute('data-bundle-badges', String(painted.badges.length));
    }
    // the walk's window on the badges (device px boxes), like __swContextCeiling: unset in the app
    if (typeof globalThis.__swWalk !== 'undefined') globalThis.__swBadgeBoxes = badgeBoxesRef.current;
  }, [graph, camRef, viewRef, mode, zoomCapFor, camVRef, viewFor, density, focusRef, yFrameFor, railOpts, capFractionNow]);

  React.useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule]);

  // ── size + renderer lifecycle ───────────────────────────────────────────
  React.useEffect(() => {
    if (!graph) return;
    const glc = glRef.current, uic = uiRef.current;
    if (!glc || !uic) return;
    let renderer = null;
    let disposed = false;
    let lossTimer = 0;
    const build = () => createRenderer(glc, graph, {
      // After a GPU reset every GL object is dead. Rebuild the whole
      // renderer on the same (restored) context and repaint — this is what
      // turns the on-device "wash-out until app restart" into a blink.
      onContextRestored: () => {
        if (lossTimer) { window.clearTimeout(lossTimer); lossTimer = 0; }
        if (disposed) return;
        try { renderer && renderer.dispose(); } catch (_e) { /* already dead */ }
        renderer = build();
        rendererRef.current = renderer;
        schedule();
      },
      // A loss Chrome never restores (it gives up after repeated resets)
      // otherwise leaves the instrument permanently dead with no report —
      // draw() just returns silently forever. Give a restore ~3s, then
      // fall back to the same noWebGL panel the "unavailable" path uses,
      // whose Try again already rebuilds via glRetry.
      onContextLost: () => {
        if (disposed) return;
        if (lossTimer) window.clearTimeout(lossTimer);
        lossTimer = window.setTimeout(() => {
          lossTimer = 0;
          if (!disposed) setNoWebGL(true);
        }, 3000);
      },
    });
    try {
      renderer = build();
    } catch (e) {
      setLoadError(e && e.message ? e.message : String(e));
      return;
    }
    if (!renderer) { setNoWebGL(true); return; }
    rendererRef.current = renderer;
    if (!camRef.current) {
      const back = resumeRef.current;
      if (back && back.cam && back.cam.total === graph.total) {
        camRef.current = Object.assign({}, back.cam);
        focusRef.current = Object.assign({}, back.focus);
      } else {
        camRef.current = createCamera(graph.total);
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const W = Math.round(glc.clientWidth * dpr);
      const H = Math.round(glc.clientHeight * dpr);
      if (!W || !H) return;
      viewRef.current = { W, H, DPR: dpr };
      // Layout class from the root's OWN width: a rotated portrait phone is a
      // WIDE screen even though the physical viewport (and every media query)
      // still reports 448px — keying the control layout off a media query put
      // the buttons mid-screen and on top of the web (the on-device report).
      const wrap = wrapRef.current;
      if (wrap) wrap.classList.toggle('sw-narrow', glc.clientWidth <= 560);
      glc.width = uic.width = W;
      glc.height = uic.height = H;
      const cam = camRef.current;
      if (!(cam.ppv > 0)) cam.ppv = fitPPV(cam, W);
      // with the y frame: a frame that grew cannot leave y above the new ceiling
      clampCamera(cam, W, maxZoomOf(graph, viewRef.current), yFrameFor(cam));
      schedule();
    };
    resize();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(glc); else window.addEventListener('resize', resize);
    const onRestored = () => schedule();
    glc.addEventListener('webglcontextrestored', onRestored);

    return () => {
      disposed = true;
      if (lossTimer) window.clearTimeout(lossTimer);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      glc.removeEventListener('webglcontextrestored', onRestored);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [graph, schedule, glRetry, yFrameFor, camRef, viewRef, focusRef]);

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
  }, [camRef, viewRef]);

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
  }, [graph, camRef, viewRef, viewFor, mode, railOpts, showUnderlay]);

  const hitAt = React.useCallback((cx, cy) => hitCandidatesAt(cx, cy)[0] || null,
    [hitCandidatesAt]);

  // what a hit is, in the panels' terms (describe.js), read in this frame
  const describe = React.useCallback((found) => describeFound(found, {
    g: graph, personal: personalRef.current, cam: camRef.current, v: viewRef.current, viewFor, density,
  }), [graph, camRef, viewRef, density, viewFor]);

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
  }, [graph, listOpen, mode, describe, showUnderlay, camRef, viewRef, density]);

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
  }, [viewRef, lastRailRef, camVRef, camRef, zoomCapFor, yFrameFor, graph, schedule, resetView, closeTopOverlay, onBack, dropHover]);

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
  if (loadError) return loadErrorPanel(loadError, () => { setLoadError(null); setDataRetry((n) => n + 1); });
  if (noWebGL && graph) {
    // A7: the web read as a list instead of a dead end (WebFallbackList.jsx).
    // It opens on the reader's last Bible chapter (HistoryStore, newest first).
    const hist = typeof HistoryStore !== 'undefined' ? HistoryStore.list() : [];
    const lastCh = (hist || []).find((h) => h && h.type === 'chapter' && h.bookId && h.chapterNum);
    return (
      <WebFallbackList graph={graph}
        initialChapter={startChapter(graph, lastCh && lastCh.bookId, lastCh && lastCh.chapterNum)}
        onOpen={(ref) => navigateToLink && navigateToLink({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse })}
        onRetry={() => { setNoWebGL(false); setGlRetry((n) => n + 1); }}
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

/* ── helpers ───────────────────────────────────────────────────────────── */

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

/** Build the dual-rail personal web from live stores + the loaded corpora. */
function buildPersonal(graph) {
  if (typeof LinkStore === 'undefined') return null;
  const chapterStart = new Map();
  for (let i = 0; i < graph.chapters.length; i++) {
    const c = graph.chapters[i];
    chapterStart.set(graph.books[c[0]].id + ':' + c[1], { start: c[2], verses: c[3] });
  }
  const verseIdOf = (bookId, chapter, verse) => {
    const ch = chapterStart.get(bookId + ':' + chapter);
    if (!ch) return -1;
    return ch.start + (Math.min(Math.max(verse, 1), ch.verses) - 1);
  };
  const collections = [];
  if (typeof COLLECTIONS !== 'undefined' && typeof READING_CHAIN !== 'undefined') {
    for (const volKey of READING_CHAIN) {
      const col = COLLECTIONS.find((c) => c.volKey === volKey);
      if (!col) continue;
      const arr = (typeof colLetterArr === 'function') ? colLetterArr(col) : [];
      collections.push({ volKey, label: col.label, short: SHORT_VOL[volKey] || col.label, items: arr });
    }
  }
  // The Bible studies are corpora too — their 781 curated threads need rail
  // segments to land on, keyed 'study-<id>' with chapters as the nodes.
  // (Hidden Manna stays OFF the rail on purpose: not publicly indexed.)
  if (typeof BIBLE_STUDIES !== 'undefined' && Array.isArray(BIBLE_STUDIES)) {
    for (const st of BIBLE_STUDIES) {
      if (!st || !st.chapters) continue;
      const key = st.slug || st.id;
      collections.push({
        volKey: 'study-' + key, label: st.title,
        short: SHORT_STUDY[st.id] || SHORT_STUDY[key] || 'Study',
        items: st.chapters.map((c) => ({ id: c.id, title: c.title || st.title })),
      });
    }
  }
  const votRail = buildVotRail(collections);
  const ctx = { verseIdOf, votRail };
  return {
    votRail,
    graph: buildPersonalGraph(LinkStore.all(), ctx),
    // The corpus's OWN curated Bible->Volumes edges, drawn dim beneath the
    // reader's links: on day one the personal web is nearly empty, and this
    // shows what the app already knows so the screen is never a blank page.
    underlay: buildCuratedUnderlay(graph.votEdges, ctx),
  };
}

/**
 * Inject the graph asset once, the same way bible-studies.js is loaded.
 * It is precached into the STABLE corpus cache, so this is a cache hit
 * offline and after an app-version bump.
 */
let _swDataPromise = null;
export function ensureScriptureWebData(force) {
  if (typeof window !== 'undefined' && window.SCRIPTURE_WEB_DATA) {
    return Promise.resolve(window.SCRIPTURE_WEB_DATA);
  }
  if (force) _swDataPromise = null;
  if (_swDataPromise) return _swDataPromise;
  _swDataPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'src/data/scripture-web-data.js';
    script.async = true;
    script.onload = () => {
      if (window.SCRIPTURE_WEB_DATA) resolve(window.SCRIPTURE_WEB_DATA);
      else reject(new Error('scripture-web-data.js loaded but defined nothing'));
    };
    script.onerror = () => { _swDataPromise = null; reject(new Error('Couldn’t fetch the cross-reference data.')); };
    document.head.appendChild(script);
  });
  return _swDataPromise;
}
