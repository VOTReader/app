/* ═══════════════════════════════════════════════════════════════════════
   ScriptureWebScreen — Cluster F (esbuild bundle-f.js)
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
   call time, the same cross-bundle pattern bundle-d and bundle-e use, so
   bundle-f carries only this feature's own code.
   ═══════════════════════════════════════════════════════════════════════ */

import { decodeGraph, maxSpanOf } from '../../utils/scripture-web/decode.js';
import {
  createCamera, clampCamera, fitPPV, verseToX, xToVerse, zoomAbout,
  localizeFactor, squashFactor, MAX_STRETCH, rotatePointer,
  maxZoomFor, ribbonStyle, arcShape, maxCamY, ALTITUDE_MARKS, spanAtHeight, lensDimFor,
} from '../../utils/scripture-web/geometry.js';
import {
  pickArcs, pickChapter, pickVerse, refOfVerse, chapterRange, countTouching, countAnchored,
  visibleArcs, threadEnds, footBundles, bundleGroups, lensRange, nearbyChapter, nearbyThreads,
} from '../../utils/scripture-web/pick.js';
import { createRenderer, DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { attachWebGestures } from '../scripture-web/gestures.js';
import { WebFallbackList } from '../scripture-web/WebFallbackList.jsx';
import { startChapter } from '../../utils/scripture-web/chapter-connections.js';
import { bucketDrawCount as bucketDrawCountFor } from '../../utils/scripture-web/decode.js';
import { readChromeTokens, LINK_KIND_NAMES, MY_WEB_SOURCES, MY_WEB_LINK_KINDS, distanceRampRGB } from '../../utils/scripture-web/palette.js';
import { placeRailLabels } from '../../utils/scripture-web/rail-labels.js';
import {
  buildVotRail, buildPersonalGraph, buildCuratedUnderlay,
} from '../../utils/scripture-web/personal-graph.js';
import {
  drawPersonalWeb, pickPersonalLinks, pickUnderlayLinks, railFrame, segmentSpan,
} from '../scripture-web/rail-renderer.js';

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

/** Deepest zoom, as a multiple of fit-to-width. Well past single-verse. */
/**
 * The zoom ceiling, from the frame rather than from a constant. 44 CSS px
 * per verse is the point past which nothing new can separate - every arc
 * leaving a verse shares one foot at every zoom - so the old fixed 4000 was
 * 247 CSS px per verse on a 1920 px desktop, 5.6x into a void, and about
 * right on a 375 px phone only by accident.
 */

const maxZoomOf = (graph, v) => (graph
  ? maxZoomFor(graph.total, (v.W || 1) / (v.DPR || 1))
  : 4000);

/** What the live region says when + does nothing because it can do nothing. */
const ZOOM_MAX_MESSAGE = 'Zoomed all the way in';

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
/** Height reserved below the baseline for the ruler + book names. */
const RULER_H = 74;

const DENSITY_LABEL = { essential: 'Essential', famous: 'Famous' };

const DENSITY_HINT = {
  essential: 'only the strongest connections',
  famous: 'the famous view — about 64,000 connections',
};
/* HIDE ALL. One session-scoped flag, not a profile setting: the reader hides
   the chrome to look at the web, and the next visit should open with the
   controls back. Absence is the signal — the key is removed, never set to
   '0' — so a default can never impersonate a choice. sessionStorage is not
   swept by the vot-* localStorage migration and is per-tab, which is the
   scope the flag means. */
const CHROME_HIDDEN_KEY = 'vot-sw-chrome-hidden';
const LIVE_HOLD_MS = 150;
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
  const [mode, setMode] = React.useState('canonical');   // 'canonical' | 'personal'
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
  const storedDensity = () => {
    // `classic` was the old internal name; accept it once so existing
    // settings migrate naturally while the feature speaks in user terms.
    const saved = settings && settings.webDensity === 'classic' ? 'famous' : settings && settings.webDensity;
    return DENSITY_STEPS.indexOf(saved) >= 0 ? saved : 'famous';
  };
  const [density, setDensity] = React.useState(storedDensity);
  const [detail, setDetail] = React.useState(null);      // the open sheet
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
  const camRef = React.useRef(null);
  /* r2: the Volumes rail has a camera of its own, so the top and bottom halves
     zoom and pan independently (Corbin: "zoom into Rebuke [top] and on the
     bottom half zoom into Isaiah, both at once"). Seeded when the personal
     graph is built; clamped on every personal frame. */
  const camVRef = React.useRef(null);
  const lastRailRef = React.useRef('bottom');
  const [railZoom, setRailZoom] = React.useState({ top: false, bottom: false });
  const railZoomRef = React.useRef(railZoom);
  const rendererRef = React.useRef(null);
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  const focusRef = React.useRef({ arc: -1, range: null });
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
  const modeRef = React.useRef('canonical');
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
  const handlersRef = React.useRef({});
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
   * The vertical frame. On a wide screen the dome fills naturally; on a tall
   * one an unstretched semicircle would sit in the bottom quarter, so the
   * whole composition (dome + ruler) is CENTRED in the leftover height
   * instead of pinned to the bottom edge.
   */
  const frame = React.useCallback(() => {
    const v = viewRef.current;
    // A narrow screen puts the controls along the BOTTOM, so the ruler needs
    // to finish above them — reserve the control strip as well as its own
    // two label rows, or book names print underneath the buttons.
    const narrow = (v.W / (v.DPR || 1)) <= 560;
    // Wide screens reserve the legend/credit line too, or the staggered book
    // labels print straight through it (the "legends colliding" report).
    const ruler = (narrow ? RULER_H + 104 : RULER_H + 26) * v.DPR;
    const avail = v.H - ruler;
    if (modeRef.current === 'personal') {
      // No dome to centre — the rails want the whole frame, less the strip the
      // legend and credit occupy along the bottom.
      const base = avail - 20 * v.DPR;
      return { base, ceil: base * 0.985, ruler };
    }
    const domeH = Math.min(avail, (v.W / 2) * MAX_STRETCH);
    // Bias the slack ABOVE the dome (0.72 / 0.28) rather than centring it:
    // the controls live at the bottom on a narrow screen, and a dome floating
    // in the middle leaves a dead band between the ruler and them.
    const base = Math.min(avail, domeH + Math.max(0, avail - domeH) * 0.72);
    return { base, ceil: domeH * 0.985, ruler };
  }, []);

  const viewFor = React.useCallback(() => {
    const v = viewRef.current;
    const cam = camRef.current;
    const f = frame();
    return {
      width: v.W, height: v.H, base: f.base, ceil: f.ceil,
      squash: squashFactor(f.ceil, v.W),
      localize: localizeFactor(cam.ppv / fitPPV(cam, v.W)),
      // the camera's height, device px: the shader draws the baseline camY
      // below base and the picker reads the same off the camera
      camY: cam.y > 0 ? cam.y : 0,
      density, rulerDepth: f.ruler,
      focusArc: focusRef.current.arc, focusRange: focusRef.current.range,
      focusRange2: focusRef.current.range2 || null,
    };
  }, [density, frame]);

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
  }, [frame, showUnderlay]);

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
    const v = viewRef.current;
    const f = frame();
    return { base: f.base, ceil: f.ceil, squash: squashFactor(f.ceil, v.W), maxSpan };
  }, [frame, maxSpan]);

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
  }, [frame]);

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
        colorMode: 'distance', density: 'essential', light: chrome.isLight, bg: chrome.bg,
        focusRange: null, focusArc: -1, hoverArc: -1, lens: null,
      }));
      const uic = uiRef.current;
      const ctx = uic && uic.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, v.W, v.H);
        const p = personalRef.current;
        const ro = railOpts();
        drawPersonalWeb(ctx, p && p.graph, p && p.underlay, Object.assign(ro, {
          hoverIndex: hoverRef.current, focusIndex: focusRef.current.arc, capFraction: capFractionNow(),
          // the walk's knob for the corridor pair (e2e-myweb-colour arm K): a
          // number here overrides the context's depth alpha ceiling; unset in the app
          contextCeiling: typeof globalThis.__swContextCeiling === 'number' ? globalThis.__swContextCeiling : undefined,
        }));
        if (wrapRef.current) wrapRef.current.setAttribute('data-cap-fraction', String(ro.capFraction));
        publishRails(ro, p, g, cam, camV, v);
        // the per-rail reset pills show only while that rail is zoomed;
        // setState from the frame loop runs only when the answer changes
        const rz = { top: !!camV && camV.ppv > fitPPV(camV, v.W) * 1.02, bottom: cam.ppv > fitPPV(cam, v.W) * 1.02 };
        if (rz.top !== railZoomRef.current.top || rz.bottom !== railZoomRef.current.bottom) { railZoomRef.current = rz; setRailZoom(rz); }
        // The rail stays under the hidden chrome: it is the legend of the web,
        // not a control (Corbin, 2026-09-11).
        drawRulerOnly(ctx, g, cam, base, v, chrome);
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
    const style = ribbonStyle(zoom, base.localize, chrome.isLight, perCssPx);
    // the convergence pills: how many threads meet at each foot cell
    const bundles = bundlesFor(bundleRef.current, g, cam, base, v, density);
    r.draw(Object.assign({}, base, {
      lens,
      camX: cam.x, ppv: cam.ppv,
      strokeWidth: style.strokeWidthCss * v.DPR,
      alpha: style.alpha,
      voteMix: style.voteMix,
      dpr: v.DPR,
      colorMode: 'distance', density, light: chrome.isLight, bg: chrome.bg,
      focusRange: focusRef.current.range, focusArc: focusRef.current.arc,
      hoverArc: hoverRef.current,
    }));
    // The book rail is drawn whether or not the chrome is hidden: the hide
    // button takes the pills and the counter, and the books along the bottom
    // are how the reader knows where in scripture the web is (Corbin,
    // 2026-09-11: "keep the web legend (the books at the bottom, etc)"). It
    // used to be cleared here as "chrome too".
    const numerals = drawRuler(uiRef.current, g, cam,
      Object.assign({}, base, { densityDraw: (bucket) => bucketDrawCountFor(bucket, density) }),
      v, chrome);
    // the sky the labels may use starts under the top chrome (layout metrics,
    // so the rotated portrait root measures the same; 0 when the chrome is hidden)
    const tb = topbarRef.current;
    const inset = tb && tb.offsetHeight ? (tb.offsetTop + tb.offsetHeight) * v.DPR : 0;
    // the labels and badges keep off the ruler's chapter numerals (the hub,
    // 2026-09-21: "106" over "Ps 104:10")
    const reserved = (numerals || []).slice();
    // the sky's chrome (landing 9): the altitude ruler on the left, only
    // above the baseline, and the elevator on the right, once there is a sky
    // to climb. Both reserve their boxes first, so the thread labels keep off.
    const altitude = { span: 0 };
    const marks = drawAltitude(uiRef.current, g, cam, Object.assign({}, base, { inset, reserved }), v, chrome, altitude);
    if (wrapRef.current) {
      wrapRef.current.setAttribute('data-altitude', marks.join(','));
      wrapRef.current.setAttribute('data-altitude-span', altitude.span > 0 ? String(altitude.span) : '');
    }
    elevatorRef.current = drawElevator(uiRef.current, cam, Object.assign({}, base, { inset, reserved, total: g.total }), v, chrome, yFrameFor(cam));
    if (wrapRef.current) wrapRef.current.setAttribute('data-elevator', elevatorRef.current ? elevatorRef.current.at.toFixed(4) : '');
    const labels = drawThreadRefs(uiRef.current, g, cam, Object.assign({}, base, { inset, reserved }), v, chrome, density, focusRef.current.arc);
    if (wrapRef.current) wrapRef.current.setAttribute('data-thread-labels', String(labels));
    badgeBoxesRef.current = drawBundleBadges(uiRef.current, g, cam, Object.assign({}, base, { inset, reserved, lens }), v, chrome, bundles);
    if (wrapRef.current) wrapRef.current.setAttribute('data-bundle-badges', String(badgeBoxesRef.current.length));
    // the walk's window on the badges (device px boxes), like __swContextCeiling: unset in the app
    if (typeof globalThis.__swWalk !== 'undefined') globalThis.__swBadgeBoxes = badgeBoxesRef.current;
  }, [graph, density, viewFor, mode, railOpts, zoomCapFor, capFractionNow, yFrameFor]);

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
    if (!camRef.current) camRef.current = createCamera(graph.total);

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
  }, [graph, schedule, glRetry, yFrameFor]);

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
  }, [graph, mode, linkVersion, studiesTick, schedule]);

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
  }, []);

  // ── gestures — imperative, never React state per frame ──────────────────
  // Wiring itself lives in gestures.js (attachWebGestures) — a pure move, so
  // it can be exercised with real dispatched DOM events instead of only a
  // screenshot. This effect just owns the mount guard and hands over refs.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph) return;
    return attachWebGestures(el, {
      loc, dpr: () => viewRef.current.DPR, cam: () => camRef.current, camFor,
      view: () => viewRef.current, handlers: () => handlersRef.current, live,
      schedule, maxZoom: (c) => zoomCapFor(c || camRef.current), clampCamera, zoomAbout, xToVerse,
      yFrame: yFrameFor, lift: liftAt,
    });
  }, [graph, schedule, loc, camFor, zoomCapFor, live, yFrameFor, liftAt]);

  const hitCandidatesAt = React.useCallback((cx, cy) => {
    const g = graph, cam = camRef.current, v = viewRef.current;
    if (!g || !cam || !v.W) return [];
    const px = cx * v.DPR, py = cy * v.DPR;
    const view = viewFor();
    if (mode !== 'personal') {
      // a badge is a real target: the bundle it counts, or the representative it rides
      for (const box of badgeBoxesRef.current) {
        if (px < box.x0 || px > box.x1 || py < box.y0 || py > box.y1) continue;
        if (box.cell) return [{ kind: 'bundle', cell: box.cell, distance: 0 }];
        if (box.rep >= 0) {
          return [{ kind: 'arc', distance: 0, hit: {
            index: box.rep, distance: 0, from: g.from[box.rep], to: g.to[box.rep], votes: g.votes[box.rep],
          } }];
        }
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
  }, [graph, viewFor, mode, railOpts, showUnderlay]);

  const hitAt = React.useCallback((cx, cy) => hitCandidatesAt(cx, cy)[0] || null,
    [hitCandidatesAt]);

  const describe = React.useCallback((found) => {
    const g = graph;
    if (!found) return null;
    if (found.kind === 'link') {
      const p = personalRef.current;
      const rec = p && p.graph && p.graph.records[found.index];
      if (!rec) return null;
      return {
        kind: 'link', index: found.index, record: rec,
        source: rec.source, target: rec.target,
        joins: p.graph.kind[found.index],
        // The reader's OWN endpoints, passed through untouched — they already
        // carry verse/verseEnd and char spans, so a link the user made over a
        // range highlights that whole range on arrival.
        cards: [endpointCard('Source', rec.source), endpointCard('Target', rec.target)],
      };
    }
    if (found.kind === 'underlay') {
      const p = personalRef.current;
      const underlay = p && p.underlay;
      const edge = underlay && underlay.records && underlay.records[found.index];
      const node = p && p.votRail && p.votRail.nodes[underlay && underlay.votPos[found.index]];
      if (!underlay || !edge || !node) return null;
      const source = refOfVerse(g, underlay.versePos[found.index]);
      const target = curatedEndpoint(edge, node);
      // the card's third line names the Volume the passage sits in (what the
      // reader zoomed the top rail to), never the edge's storage kind
      const seg = p.votRail.segments.find((s) => s.volKey === node.volKey);
      return {
        kind: 'underlay', index: found.index, source, target,
        // rail positions, published on the card (data-verse / data-vot) so a
        // walk can follow this one thread through the exported geometry
        verse: underlay.versePos[found.index], vot: underlay.votPos[found.index],
        joins: (seg && (seg.short || seg.label)) || edge.kind || 'curated connection',
        // the family in words (design-myweb-colour.md, 5): the source the thread's
        // colour encodes, then the Volume
        sourceName: MY_WEB_SOURCES[underlay.source ? underlay.source[found.index] : MY_WEB_SOURCES.length - 1].name,
        cards: [verseCard('Scripture', source), endpointCard('Corpus', target)],
      };
    }
    if (found.kind === 'arc') {
      const a = refOfVerse(g, found.hit.from), b = refOfVerse(g, found.hit.to);
      return {
        kind: 'arc', a, b, votes: found.hit.votes,
        span: Math.abs(found.hit.to - found.hit.from), index: found.hit.index,
        from: found.hit.from, to: found.hit.to,
        cards: [verseCard('From', a), verseCard('To', b)],
      };
    }
    if (found.kind === 'bundle') {
      const cell = found.cell;
      const cam = camRef.current, v = viewRef.current;
      const view = viewFor();
      const first = refOfVerse(g, cell.lo), last = refOfVerse(g, cell.hi);
      const label = cell.verse ? first.label
        : cell.chapterLo === cell.chapterHi ? first.bookTitle + ' ' + first.chapter
        : first.bookTitle + ' ' + first.chapter + ' \u2013 ' + (last.bookTitle === first.bookTitle ? '' : last.bookTitle + ' ') + last.chapter;
      const groups = cam && v.W ? bundleGroups(g, cam, view, cell.lo, cell.hi, 40) : [];
      const chapter = g.chapters[cell.chapterLo];
      return { kind: 'bundle', cell, label, lo: cell.lo, hi: cell.hi,
        hidden: cell.hidden, drawn: cell.drawn,
        connections: countTouching(g, cell.lo, cell.hi, density),
        groups: groups.map((grp) => {
          const r = refOfVerse(g, grp.lo);
          return Object.assign({ label: r.bookTitle + ' ' + r.chapter }, grp);
        }),
        cards: cell.verse ? [verseCard('Verse', first)]
          : [chapterCard(g.books[chapter[0]], chapter[1], chapter[3], first)] };
    }
    if (found.kind === 'verse') {
      const r = refOfVerse(g, found.verse);
      return { kind: 'verse', ref: r, verse: found.verse,
        connections: countTouching(g, found.verse, found.verse, density),
        cards: [verseCard('Verse', r)] };
    }
    const [lo, hi] = chapterRange(g, found.chapterIndex);
    const ch = g.chapters[found.chapterIndex];
    const first = refOfVerse(g, lo);
    const camNow = camRef.current, vNow = viewRef.current;
    return { kind: 'chapter', chapterIndex: found.chapterIndex,
      book: g.books[ch[0]], chapter: ch[1], verses: ch[3], lo, hi,
      connections: countTouching(g, lo, hi, density),
      // where this chapter's threads go, by the other end's chapter: the
      // convergence entry point now that nothing is hidden at rest
      groups: camNow && vNow.W ? bundleGroups(g, camNow, viewFor(), lo, hi, 40).map((grp) => {
        const r = refOfVerse(g, grp.lo);
        return Object.assign({ label: r.bookTitle + ' ' + r.chapter }, grp);
      }) : [],
      // Opening a chapter highlights the WHOLE chapter on arrival.
      cards: [chapterCard(g.books[ch[0]], ch[1], ch[3], first)] };
  }, [graph, density, viewFor]);

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
  }, [describe, density, graph, listOpen, mode, showUnderlay]);

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
  }, [schedule]);

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
      setAnnounce(described.length + ' nearby connections. Choose one.');
      schedule();
      return;
    }
    commitFound(described[0]);
  }, [commitFound, describe, hitCandidatesAt, schedule, liftAt]);

  const doubleTap = React.useCallback((cx) => {
    const cam = camRef.current, v = viewRef.current;
    zoomAbout(cam, v.W, cx * v.DPR, 2.5, maxZoomOf(graph, v), yFrameFor(cam) || undefined);
    schedule();
  }, [graph, schedule, yFrameFor]);

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
  }, [schedule, zoomCapFor]);

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
  }, [graph, schedule, resetRail]);

  const toggleChrome = React.useCallback(() => {
    const next = !chromeHidden;
    try {
      if (next) sessionStorage.setItem(CHROME_HIDDEN_KEY, '1');
      else sessionStorage.removeItem(CHROME_HIDDEN_KEY);
    } catch (_e) { /* private mode: the toggle still works for this mount */ }
    setChromeHidden(next);
  }, [chromeHidden]);

  // ── keyboard (PWA desktop) ──────────────────────────────────────────────
  const onKeyDown = React.useCallback((e) => {
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
      if (guideOpen) { closeGuide(); }
      else if (emptyShown) { dismissEmpty(); }
      else if (listOpen || choices || detail || tip) {
        setListOpen(false); setChoices(null); setDetail(null); setTip(null);
        focusRef.current = { arc: -1, range: null }; schedule();
      }
      else if (onBack) onBack();
      return;
    } else return;
    e.preventDefault();
    clampCamera(cam, v.W, ceiling, yf);
    const centre = Math.round(cam.x);
    if (atCeiling) setAnnounce(ZOOM_MAX_MESSAGE);
    else if (graph && centre >= 0 && centre < graph.total) setAnnounce(refOfVerse(graph, centre).label);
    schedule();
  }, [choices, detail, listOpen, tip, graph, onBack, resetView, schedule,
      emptyShown, dismissEmpty, zoomCapFor, yFrameFor, guideOpen, closeGuide]);

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
    setAnnounce('Following the line to ' + (toFar ? info.b : info.a).label);
    schedule();
  }, [schedule, zoomCapFor, yFrameFor]);

  const openEndpoint = React.useCallback((endpoint) => {
    if (!endpoint || typeof navigateToLink !== 'function') return;
    // meta.sourceLetterTitle is what the reader's back pill is labelled with,
    // and the hook snapshots the current screen as the return target — so a
    // jump from here comes back HERE.
    navigateToLink(endpoint, { sourceLetterTitle: 'The Scripture Web' });
  }, [navigateToLink]);

  // A bundle's group, chosen in its sheet: the pair of ranges the shader and
  // the picker draw and spotlight (uFocusRange2). Choosing the
  // same group again lets go of it.
  const chooseGroup = React.useCallback((info, grp) => {
    const same = focusRef.current.range2 && grp && focusRef.current.range2[0] === grp.lo && focusRef.current.range2[1] === grp.hi;
    focusRef.current = { arc: -1, range: [info.lo, info.hi], range2: same || !grp ? null : [grp.lo, grp.hi] };
    setDetail(Object.assign({}, info, { chosenGroup: same || !grp ? null : grp.chapterIndex }));
    setAnnounce(same || !grp ? 'Showing the strongest again.' : grp.count + ' threads to ' + grp.label + ' shown.');
    schedule();
  }, [schedule]);
  // ── render ──────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="sw-fallback">
        <div className="sw-fallback-title">The Scripture Web couldn’t load.</div>
        <div className="sw-fallback-body">{loadError}</div>
        <button type="button" className="sw-btn" onClick={() => { setLoadError(null); setDataRetry((n) => n + 1); }}>Try again</button>
      </div>
    );
  }
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
  if (noWebGL) {
    return (
      <div className="sw-fallback">
        <div className="sw-fallback-title">The web can’t be drawn right now.</div>
        <div className="sw-fallback-body">
          This needs WebGL2. If the device just recovered from a graphics
          reset, trying again usually works; otherwise every cross-reference
          is still reachable from the reader’s footnotes and links.
        </div>
        <div className="sw-fallback-row">
          <button type="button" className="sw-btn"
            onClick={() => { setNoWebGL(false); setGlRetry((n) => n + 1); }}>Try again</button>
          <button type="button" className="sw-btn" onClick={onBack}>Go back</button>
        </div>
      </div>
    );
  }

  const stats = graph ? graphStats(graph, density) : null;

  return (
    <React.Fragment>
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
            aria-pressed={mode === 'canonical'} onClick={() => { setMode('canonical'); setDetail(null); setChoices(null); setListOpen(false); }}>Scripture</button>
          <button type="button" ref={myWebBtnRef} className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={() => { setMode('personal'); setDetail(null); setChoices(null); setListOpen(false); }}>My web</button>
        </div>
        <button type="button" className={'sw-btn' + (listOpen ? ' is-on' : '')}
          onClick={() => { setListOpen(!listOpen); setChoices(null); }}
          aria-expanded={listOpen} aria-haspopup="dialog">Nearby</button>
        {mode === 'canonical' ? (
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Connection density</span>
              <select className="sw-select" value={density} aria-label="Connection density"
                onChange={(e) => {
                  const next = e.target.value;
                  setDensity(next);
                  flashHint(DENSITY_LABEL[next] + ' — ' + DENSITY_HINT[next]);
                  if (typeof updateSetting === 'function') updateSetting('webDensity', next);
                }}>
                <option value="essential">Essential</option>
                <option value="famous">Famous</option>
              </select>
            </label>
        ) : (
          <button type="button" className={'sw-btn sw-toggle' + (showUnderlay ? ' is-on' : '')} aria-pressed={showUnderlay}
            onClick={() => { setShowUnderlay(!showUnderlay); schedule(); }}
            aria-label="Show the curated corpus connections">
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
      {guideOpen && (
        <div className="sw-guide" role="dialog" aria-labelledby="sw-guide-title">
          <div className="sw-guide-title" id="sw-guide-title">How to read this web</div>
          <ul className="sw-guide-body">
            <li>Every thread joins two passages of Scripture. Its feet stand on the verses it joins; the taller the arch, the farther apart they are.</li>
            <li>Colour is distance: violet threads join near neighbours, green ones cross the whole Bible. The books run along the bottom.</li>
            <li>Pinch or press <strong>+</strong> to zoom in. Past the overview, the chapter under the middle is lit and the rest stands back.</li>
            <li>Tap a thread to see both ends and follow it. Tap a number under the baseline to list every thread landing on that verse.</li>
            <li>Drag up to look into the sky, where the long threads live. The ruler on the left names the height; the bar on the right jumps.</li>
            <li><strong>Reset</strong> brings you home.</li>
          </ul>
          <button type="button" className="sw-sheet-follow sw-guide-close" onClick={closeGuide}>Got it</button>
        </div>
      )}
      {emptyShown && (
        <div className="sw-empty">
          <div className="sw-empty-title">Your web is still being woven.</div>
          {/* One sentence, so the panel covers under half the band on the
              800x360 frame (the walk's R3); the silver threads behind it are
              the corpus's own citations, and the panel must not hide them. */}
          <div className="sw-empty-body">
            Select text anywhere in the app, tap <strong>Link</strong>, and pick
            where it goes. The silver threads are the Volumes&rsquo; own citations.
          </div>
          <button type="button" className="sw-empty-close" aria-label="Dismiss"
            onClick={dismissEmpty}>×</button>
        </div>
      )}
      {tip && <TipChip info={tip} viewport={viewRef.current} />}
      {choices && <ConnectionChooser choices={Array.isArray(choices) ? choices : choices.items}
        title={Array.isArray(choices) ? undefined : choices.title} meta={Array.isArray(choices) ? undefined : choices.meta}
        onChoose={commitFound} onClose={() => { setChoices(null); schedule(); }} />}
      {listOpen && <ConnectionList items={listItems} mode={mode}
        lensOn={mode !== 'personal' && !!(camRef.current && viewRef.current.W && lensRange(graph, camRef.current, viewRef.current.W))}
        onChoose={commitFound} onClose={() => setListOpen(false)} />}
      {detail && (
        <DetailSheet info={detail} onClose={() => setDetail(null)} onOpen={openEndpoint} onFollow={followThread}
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
    </React.Fragment>
  );
}

/* ── the ruler ─────────────────────────────────────────────────────────────
   Books always; chapter numerals once a chapter is wide enough to hold one;
   verse ticks and numerals past that. The chapter histogram hangs BELOW the
   baseline, its depth proportional to verse count — Psalm 119 reaching
   furthest down, exactly as in the visualization this descends from. */
function drawRuler(canvas, g, cam, view, v, chrome) {
  /** the chapter numerals' boxes, device px: the label pass keeps off them */
  const numerals = [];
  if (!canvas) return numerals;
  const ctx = canvas.getContext('2d');
  if (!ctx) return numerals;
  const W = v.W, DPR = v.DPR, base = view.base;
  ctx.clearRect(0, 0, W, canvas.height);
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';
  const X = (verse) => verseToX(cam, W, verse);

  if (cam.ppv < 8 * DPR) {
    for (let i = 0; i < g.chapters.length; i++) {
      const c = g.chapters[i];
      const x = X(c[2]), x2 = X(c[2] + c[3]);
      if (x2 < -4 || x > W + 4) continue;
      ctx.fillStyle = 'rgba(' + ink + ',' + (c[0] < 39 ? 0.5 : 0.78) + ')';
      ctx.fillRect(x, base + 2 * DPR, Math.max((x2 - x) * 0.8, 0.7 * DPR), 2 * DPR + c[3] * 0.22 * DPR);
    }
  } else {
    const v0 = Math.max(0, Math.floor(xToVerse(cam, W, -10)));
    const v1 = Math.min(g.total - 1, Math.ceil(xToVerse(cam, W, W + 10)));
    ctx.fillStyle = 'rgba(' + ink + ',0.6)';
    for (let verse = v0; verse <= v1; verse++) {
      ctx.fillRect(X(verse) - 0.75 * DPR, base + 2 * DPR, 1.5 * DPR, 9 * DPR);
    }
    if (cam.ppv > 30 * DPR) {
      ctx.font = chrome.fsRuler * DPR + 'px Georgia,serif';
      ctx.fillStyle = 'rgba(' + ink + ',0.62)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let verse = v0; verse <= v1; verse++) {
        ctx.fillText(String(refOfVerse(g, verse).verse), X(verse) + cam.ppv / 2, base + 14 * DPR);
      }
    }
  }

  ctx.strokeStyle = 'rgba(' + gold + ',0.30)';
  ctx.lineWidth = DPR;
  ctx.beginPath(); ctx.moveTo(0, base + 1.5 * DPR); ctx.lineTo(W, base + 1.5 * DPR); ctx.stroke();

  // chapter numerals from the middle zoom band up, each centred on the part
  // of its chapter the frame holds: at close zoom one chapter is wider than
  // the frame, and a foot's reference is book + chapter + verse, so the
  // chapter must stay in view with the verse numerals (it used to stop at
  // 30 px/verse, leaving "GENESIS ... 552" with no chapter to read).
  if (cam.ppv > 2.4 * DPR) {
    ctx.font = chrome.fsRuler * DPR + 'px Georgia,serif';
    ctx.fillStyle = 'rgba(' + ink + ',0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const c of g.chapters) {
      const x0 = Math.max(X(c[2]), 0), x1 = Math.min(X(c[2] + c[3]), W);
      if (x1 - x0 < 22 * DPR) continue;
      const text = String(c[1]);
      ctx.fillText(text, (x0 + x1) / 2, base - 6 * DPR);
      // the numeral's box, for the label pass to keep off (the chapter
      // numeral sits on the baseline where a foot label lands)
      const w = ctx.measureText(text).width, cx = (x0 + x1) / 2;
      numerals.push({ x0: cx - w / 2, x1: cx + w / 2, y0: base - 6 * DPR - chrome.fsRuler * DPR, y1: base - 6 * DPR });
    }
  }

  // book names + separators
  drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold);
  return numerals;
}

/* ── the convergence pills ──────────────────────────────────────────────
   Every thread is drawn (the structure law); what converges is counted
   where it lands. At each in-view foot cell (pick.footBundles: a verse at
   depth, a chapter or a run of narrow chapters otherwise) a "+n" pill under
   the baseline says how many anchored threads have a foot there; tapping it
   opens the bundle by target chapter, and a chosen chapter's threads are
   spotlit. The counts are cached while the camera moves less than a few
   percent; the pills' x follow the camera every frame. */
const BADGE_FONT_CSS = 11;
const fmtCount = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

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

/**
 * The altitude ruler (landing 9): only while the camera is above the
 * baseline. Each mark stands where a thread of that span would crown -
 * y = base + camY - arcShape(span * ppv / 2, squash).A - in the canon
 * ramp's colour for that span, so the height reads in the web's own key: a
 * chapter, a book, a testament, the canon. The marks in view are returned
 * (and published as data-altitude) whether or not there is a 2D context;
 * the labels reserve their boxes so the thread labels keep off them.
 *
 * The named marks are a chapter, a book, a testament and the canon - a
 * factor of 30 apart, so most heights have none in view (at the ceiling
 * a chapter crowns 422 px up; a book 14,000). The frame's middle row
 * therefore always carries a live readout of its own span ("~150
 * verses"), published as data-altitude-span, so the height is never
 * nameless.
 * @returns {number[]} the marks' spans in view, bottom to top
 */
function drawAltitude(canvas, g, cam, view, v, chrome, out) {
  const shown = [];
  const camY = cam.y > 0 ? cam.y : 0;
  if (out) out.span = 0;
  if (!(camY > 0) || !g || !(g.total > 0)) return shown;
  const DPR = v.DPR, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const fs = chrome.fsRuler * DPR;
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (ctx) {
    ctx.save();
    ctx.font = fs + 'px Georgia,serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = DPR;
  }
  const marksY = [];
  for (const m of ALTITUDE_MARKS) {
    const y = base + camY - arcShape((m.span * cam.ppv) / 2, view.squash).A;
    if (y < top + fs || y > base - fs) continue;
    shown.push(m.span);
    if (!ctx) continue;
    const rgb = distanceRampRGB(Math.pow(m.span / g.total, 0.40)).join(',');
    const text = m.span.toLocaleString('en-US') + ' · ' + m.name;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(14 * DPR, y); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 18 * DPR, x1: 18 * DPR + w, y0: y - fs * 0.7, y1: y + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = chrome.bg;
    ctx.strokeText(text, box.x0, y);
    ctx.lineWidth = DPR;
    ctx.fillStyle = 'rgba(' + rgb + ',0.95)';
    ctx.fillText(text, box.x0, y);
    if (view.reserved) view.reserved.push(box);
    marksY.push(y);
  }
  // the live readout at the frame's middle row
  const yMid = (top + base) / 2;
  const span = spanAtHeight(base + camY - yMid, cam.ppv, view.squash);
  if (span >= 1 && out) out.span = Math.round(span);
  if (ctx && span >= 1 && !marksY.some((y) => Math.abs(y - yMid) < fs * 1.6)) {
    const rgb = distanceRampRGB(Math.pow(Math.min(span, g.total) / g.total, 0.40)).join(',');
    const text = '~' + Math.round(span).toLocaleString('en-US') + ' verses';
    ctx.strokeStyle = 'rgba(' + rgb + ',0.6)';
    ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(8 * DPR, yMid); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 12 * DPR, x1: 12 * DPR + w, y0: yMid - fs * 0.7, y1: yMid + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = chrome.bg;
    ctx.strokeText(text, box.x0, yMid);
    ctx.lineWidth = DPR;
    ctx.fillStyle = 'rgba(' + rgb + ',0.8)';
    ctx.fillText(text, box.x0, yMid);
    if (view.reserved) view.reserved.push(box);
  }
  if (ctx) ctx.restore();
  return shown;
}

/** The elevator's tap zone, CSS px in from the right edge. */
const ELEVATOR_ZONE_CSS = 24;

/**
 * The elevator (landing 9): a thin track down the right edge from the top
 * chrome to the baseline, its thumb at camY / maxCamY - the top is the
 * tallest apex, the bottom the baseline. Drawn only on the canon web once
 * there is a sky to climb (maxCamY > 0: past the overview). Returns the
 * track's tap box (the right ELEVATOR_ZONE_CSS px), the height its top
 * stands for and the thumb's fraction, or null; the tap callback reads it.
 * @returns {{x0:number, x1:number, y0:number, y1:number, maxY:number, at:number}|null}
 */
function drawElevator(canvas, cam, view, v, chrome, yf) {
  if (!yf) return null;
  const maxY = maxCamY(cam, yf);
  if (!(maxY > 0)) return null;
  const DPR = v.DPR, W = v.W, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const y0 = top + 8 * DPR, y1 = base - 8 * DPR;
  if (!(y1 > y0)) return null;
  const camY = cam.y > 0 ? cam.y : 0;
  const at = Math.min(1, camY / maxY);
  const box = { x0: W - ELEVATOR_ZONE_CSS * DPR, x1: W, y0, y1, maxY, at };
  if (view.reserved) view.reserved.push({ x0: box.x0, x1: box.x1, y0, y1 });
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!ctx) return box;
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';
  const x = W - 10 * DPR;
  ctx.save();
  ctx.lineWidth = 1.5 * DPR;
  ctx.strokeStyle = 'rgba(' + ink + ',0.28)';
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  // the altitude marks on the track, in the ramp's colour: where a chapter,
  // a book, a testament and the canon crown, so the reader knows how far
  // up each lies before going there (g.total for the ramp's scale)
  if (view.total > 0) {
    for (const m of ALTITUDE_MARKS) {
      const f = arcShape((m.span * cam.ppv) / 2, view.squash).A / maxY;
      if (!(f > 0.005) || f > 1) continue;
      const my = y1 - f * (y1 - y0);
      ctx.strokeStyle = 'rgba(' + distanceRampRGB(Math.pow(m.span / view.total, 0.40)).join(',') + ',0.9)';
      ctx.beginPath(); ctx.moveTo(x - 5 * DPR, my); ctx.lineTo(x + 5 * DPR, my); ctx.stroke();
    }
  }
  // the thumb: a short rounded bar, gold once the reader has left the baseline
  const th = 18 * DPR, tw = 6 * DPR, cy = y1 - at * (y1 - y0);
  const ty0 = Math.max(y0, Math.min(y1 - th, cy - th / 2)), r = tw / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, ty0 + r); ctx.arc(x, ty0 + r, r, Math.PI, 0);
  ctx.lineTo(x + r, ty0 + th - r); ctx.arc(x, ty0 + th - r, r, 0, Math.PI); ctx.closePath();
  ctx.fillStyle = 'rgba(' + (camY > 0 ? gold : ink) + ',' + (camY > 0 ? 0.95 : 0.6) + ')';
  ctx.fill();
  ctx.restore();
  return box;
}

function drawBundleBadges(canvas, g, cam, view, v, chrome, bundles) {
  const boxes = [];
  if (!canvas || !g || !g.count || !bundles) return boxes;
  const taken = view.reserved ? view.reserved.slice() : [];
  const ctx = canvas.getContext('2d');
  if (!ctx) return boxes;
  const DPR = v.DPR, W = v.W;
  const fs = BADGE_FONT_CSS * DPR;
  const camY = cam.y > 0 ? cam.y : 0;
  const baseY = view.base + camY;
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';
  ctx.save();
  ctx.font = '600 ' + fs + 'px Georgia,serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const half = W / 2, camX = cam.x, ppv = cam.ppv;
  const pill = (text, cx, cy, strong, dim = 1) => {
    const w = ctx.measureText(text).width + fs * 0.9, h = fs * 1.35;
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
    if (box.x1 < 0 || box.x0 > W) return null;
    for (const b of boxes.concat(taken)) {
      if (box.x0 < b.x1 + 3 * DPR && box.x1 > b.x0 - 3 * DPR && box.y0 < b.y1 && box.y1 > b.y0) return null;
    }
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(box.x0 + r, box.y0); ctx.lineTo(box.x1 - r, box.y0); ctx.arc(box.x1 - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(box.x0 + r, box.y1); ctx.arc(box.x0 + r, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    ctx.fillStyle = chrome.isLight ? 'rgba(248,242,228,0.92)' : 'rgba(14,12,10,0.88)';
    ctx.fill();
    ctx.lineWidth = 1 * DPR;
    ctx.strokeStyle = 'rgba(' + gold + ',' + ((strong ? 0.9 : 0.55) * dim).toFixed(3) + ')';
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + (strong ? gold : ink) + ',' + (0.95 * dim).toFixed(3) + ')';
    ctx.fillText(text, cx, cy + fs * 0.05);
    return box;
  };
  // the pills: under the baseline's feet, above the ruler's numerals, how
  // many threads converge on each cell - Corbin (2026-09-21 21:21): "a count
  // for how many lines are converging on a single spot". Past the overview
  // only (6x, localize > 0, where a foot cell is a chapter or a verse), and
  // only where two or more meet. Information, never grouping: every thread
  // counted is drawn. Lens-dimmed like the threads (landing 11): the cells
  // outside the chapter under the centre keep LENS_CONTEXT of their ink.
  const cy = baseY + fs * 0.95;
  for (const cell of bundles.cells) {
    const n = view.localize > 0 ? cell.drawn + cell.hidden : 0;
    if (!(n > 1)) continue;
    const cx = ((cell.lo + cell.hi + 1) / 2 - camX) * ppv + half;
    const wCell = (cell.hi - cell.lo + 1) * ppv;
    const text = fmtCount(n);
    if (ctx.measureText(text).width + fs * 0.9 > wCell + 2 * DPR) continue;   // a pill wider than its cell lies
    const box = pill(text, cx, cy, false, lensDimFor(cell.lo, cell.hi, view.lens || null));
    if (box) boxes.push(Object.assign(box, { cell, rep: -1 }));
  }
  ctx.restore();
  return boxes;
}

/* ── the references beside the lines ────────────────────────────────────
   Corbin's brief (2026-09-11): "when zoomed close, each line shows its source
   and target beside it — the verse refs at the two feet, or at the body when
   the feet are off-screen." A foot the frame holds is read off the ruler
   (book, chapter, verse numeral under its tick); a foot the frame does not
   hold has its reference written ON the body at the body's nearest on-screen
   point to it (pick.threadEnds), along the tangent, with an arrow toward the
   foot. Zoomed close means the ruler's verse-numeral band (VERSE_LABELS_PPV);
   the chosen line is labelled at every zoom, its feet marked on the baseline,
   so a tapped line is followable from either end (item b).
   A label runs along the tangent while the line is shallower than 45 deg and
   stands level beside a steep one (a near-vertical label is not readable).
   Crowding: a label whose box meets one already written is skipped, the
   chosen line's first — density handling only as far as it is free. */
const VERSE_LABELS_PPV = 30;   // CSS px per verse: where the ruler numbers verses
const LABEL_PASS_LIMIT = 400;  // drawn threads walked per frame at most

function drawThreadRefs(canvas, g, cam, view, v, chrome, density, focusArc) {
  if (!canvas || !g || !g.count) return 0;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const DPR = v.DPR;
  const close = cam.ppv >= VERSE_LABELS_PPV * DPR;
  if (!close && focusArc < 0) return 0;
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';
  const fs = chrome.fsRuler * DPR;
  // boxes already taken (the ruler's numerals), so a label is never written over them
  const placed = view.reserved ? view.reserved.slice() : [];
  let drawn = 0;
  const camY = cam.y > 0 ? cam.y : 0;
  const skyTop = view.inset > 0 ? view.inset : 0;
  ctx.font = fs + 'px Georgia,serif';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const label = (index, chosen) => {
    const ends = threadEnds(g, cam, view, index);
    for (const side of ['from', 'to']) {
      const e = ends[side];
      if (chosen && e.onScreen) {
        // the foot, marked on the baseline the line stands on
        ctx.fillStyle = 'rgba(' + gold + ',0.95)';
        ctx.beginPath(); ctx.arc(e.x, view.base + camY, 4 * DPR, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (!e.at) continue;
      const { x, y, angle } = e.at;
      const ref = refOfVerse(g, e.verse);
      const text = side === 'from'
        ? '\u2190 ' + ref.abbr + ' ' + ref.chapter + ':' + ref.verse
        : ref.abbr + ' ' + ref.chapter + ':' + ref.verse + ' \u2192';
      const w = ctx.measureText(text).width;
      const dir = side === 'from' ? 1 : -1;      // the text runs away from the foot
      const steep = Math.abs(angle) > Math.PI / 4;
      const rot = steep ? 0 : angle;
      // the text's centre: along the (level or tangent) line from the anchor,
      // and off it — above a shallow line, just under a steep one's crossing
      const along = 4 * DPR + w / 2;
      const off = steep ? fs * 0.9 : -fs * 0.7;
      const cx = x + Math.cos(rot) * along * dir - Math.sin(rot) * off;
      const cy = y + Math.sin(rot) * along * dir + Math.cos(rot) * off;
      const hw = (Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * fs) / 2;
      const hh = (Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * fs) / 2;
      const box = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
      if (box.y0 < skyTop - fs || box.y1 > view.base + fs) continue;
      // a gap between neighbours, or two labels on one line read as one
      const m = 6 * DPR;
      if (!chosen && placed.some((q) => box.x0 < q.x1 + m && box.x1 > q.x0 - m && box.y0 < q.y1 + m && box.y1 > q.y0 - m)) continue;
      placed.push(box);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.textAlign = 'center';
      ctx.lineWidth = 3 * DPR;
      ctx.strokeStyle = chrome.bg;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = 'rgba(' + (chosen ? gold : ink) + ',' + (chosen ? 1 : 0.8) + ')';
      ctx.fillText(text, 0, 0);
      ctx.restore();
      drawn++;
    }
  };
  if (focusArc >= 0 && focusArc < g.count) label(focusArc, true);
  if (close) {
    for (const i of visibleArcs(g, cam, view, LABEL_PASS_LIMIT)) {
      if (i !== focusArc) label(i, false);
    }
  }
  return drawn;
}

/**
 * r2: what the rails show, published for the browser walk (data-rails on the
 * root): every visible Volumes band and every visible Bible book with its
 * on-screen span in CSS px, and where the two rails sit. A walk that zooms
 * the top rail to Rebuke and the bottom to Isaiah reads this to know the
 * zoom took before it reads a pixel.
 */
function publishRails(ro, p, g, cam, camV, v) {
  const el = /** @type {HTMLElement|null} */ (ro && ro.width ? document.querySelector('.sw-root') : null);
  if (!el || !g) return;
  const rails = railFrame({ H: v.H, DPR: v.DPR }, ro.base);
  const top = [];
  if (p && p.votRail && p.votRail.segments) {
    for (const seg of p.votRail.segments) {
      if (!seg.count) continue;
      const span = segmentSpan(seg, ro);
      if (span) top.push({ label: (seg.short || seg.label), x0: +(span.x0 / v.DPR).toFixed(1), x1: +(span.x1 / v.DPR).toFixed(1) });
    }
  }
  const bottom = [];
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  for (let bi = 0; bi < span.length; bi++) {
    const x0 = verseToX(cam, v.W, span[bi][0]), x1 = verseToX(cam, v.W, span[bi][1]);
    if (x1 < 0 || x0 > v.W) continue;
    bottom.push({ label: g.books[bi].title, x0: +(x0 / v.DPR).toFixed(1), x1: +(x1 / v.DPR).toFixed(1) });
  }
  el.setAttribute('data-rails', JSON.stringify({
    topY: +(rails.topY / v.DPR).toFixed(1), bottomY: +(rails.bottomY / v.DPR).toFixed(1),
    top, bottom, camV: camV ? { x: camV.x, ppv: camV.ppv, total: camV.total } : null, cam: { x: cam.x, ppv: cam.ppv, total: cam.total },
  }));
  el.style.setProperty('--sw-rail-top', (rails.topY / v.DPR).toFixed(0) + 'px');
  el.style.setProperty('--sw-rail-bottom', (rails.bottomY / v.DPR).toFixed(0) + 'px');
}

/**
 * The books along the scripture rail — the tick, then the name where it can
 * be read: the full title when it fits the book's span, else the abbreviation
 * when that is under twice the span, else nothing. Rows come from the ONE
 * placement law both rails share (rail-labels.js): the top row first, the
 * second when the top's last name would be nearer than 5 px, no row when
 * neither has room. Shared by drawRuler (the canon) and drawRulerOnly (My
 * Web), which each carried a copy of this before.
 */
function drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold) {
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const fullFont = '600 ' + (chrome.fsLabel * DPR) + 'px Cinzel,Georgia,serif';
  const abbrFont = (chrome.fsRuler * DPR) + 'px Cinzel,Georgia,serif';
  const names = [];
  for (let bi = 0; bi < span.length; bi++) {
    const x0 = X(span[bi][0]), x1 = X(span[bi][1]);
    if (x1 < -90 || x0 > W + 90) continue;
    ctx.strokeStyle = 'rgba(' + gold + ',0.22)';
    ctx.beginPath(); ctx.moveTo(x0, base + 2 * DPR); ctx.lineTo(x0, base + 9 * DPR); ctx.stroke();
    const width = x1 - x0;
    // MEASURE before printing. A label wider than its book's own span (or its
    // share of a staggered row) collides with its neighbour into mush — very
    // visible on a phone, where Matthew/Luke/Acts sit within a few px of each
    // other. Full name if it fits, else the abbreviation, else nothing.
    const full = g.books[bi].title.toUpperCase();
    const abbr = g.books[bi].abbr.toUpperCase();
    ctx.font = fullFont;
    let label = null;
    if (ctx.measureText(full).width <= width - 8 * DPR) {
      label = full;
    } else {
      ctx.font = abbrFont;
      // Staggering onto a second row buys a book roughly twice its own width
      // before it can touch the neighbour printed on the same row.
      if (ctx.measureText(abbr).width <= width * 2) label = abbr;
    }
    if (!label) continue;
    ctx.font = label === full ? fullFont : abbrFont;
    const w = ctx.measureText(label).width;
    const cx = Math.max(Math.min((x0 + x1) / 2, W - 30 * DPR), 30 * DPR);
    names.push({ label, font: ctx.font, cx, left: cx - w / 2, right: cx + w / 2 });
  }
  const rows = placeRailLabels(names, 5 * DPR);
  names.forEach((n, i) => {
    if (rows[i] < 0) return;
    ctx.font = n.font;
    ctx.fillStyle = 'rgba(' + ink + ',' + (rows[i] ? 0.62 : 0.86) + ')';
    ctx.fillText(n.label, n.cx, base + (rows[i] ? 48 : 34) * DPR);
  });
}

/**
 * The scripture rail's ruler, reused under the personal web so the bottom
 * axis reads identically in both modes.
 */
function drawRulerOnly(ctx, g, cam, view, v, chrome) {
  const W = v.W, DPR = v.DPR, base = view.base;
  const ink = chrome.isLight ? '58,37,16' : '235,231,222';
  const gold = chrome.isLight ? '122,92,16' : '232,192,80';
  const X = (verse) => verseToX(cam, W, verse);
  drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold);
}

/* ── chrome pieces ─────────────────────────────────────────────────────── */

function TipChip({ info, viewport }) {
  const s = info.info;
  const width = viewport && viewport.DPR ? viewport.W / viewport.DPR : 800;
  const height = viewport && viewport.DPR ? viewport.H / viewport.DPR : 600;
  const style = {
    left: Math.max(8, Math.min(info.x + 16, width - 308)) + 'px',
    top: Math.max(8, Math.min(info.y + 16, height - 138)) + 'px',
  };
  return (
    <div className="sw-tip" style={style} aria-hidden="true"
      data-verse={s.kind === 'underlay' ? s.verse : undefined} data-vot={s.kind === 'underlay' ? s.vot : undefined}>
      {s.kind === 'arc' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Connection</div>
          <div className="sw-tip-ref">{s.a.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.b.label}</div>
          <div className="sw-tip-meta">{s.span.toLocaleString()} verses apart · weight {s.votes}</div>
        </React.Fragment>
      )}
      {s.kind === 'link' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Your link</div>
          <div className="sw-tip-ref">{endpointLabel(s.source)}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{endpointLabel(s.target)}</div>
          <div className="sw-tip-meta">{LINK_KIND_NAMES[s.joins]}</div>
        </React.Fragment>
      )}
      {s.kind === 'underlay' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Timothy&rsquo;s thread</div>
          <div className="sw-tip-ref">{s.source.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.target ? endpointLabel(s.target) : 'Corpus passage'}</div>
          <div className="sw-tip-meta">{s.sourceName ? s.sourceName + ' \u00b7 ' + s.joins : s.joins}</div>
        </React.Fragment>
      )}
      {s.kind === 'chapter' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Chapter</div>
          <div className="sw-tip-ref">{s.book.title} {s.chapter}</div>
          <div className="sw-tip-meta">{s.verses} verses · {s.connections.toLocaleString()} connections</div>
        </React.Fragment>
      )}
      {s.kind === 'verse' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Verse</div>
          <div className="sw-tip-ref">{s.ref.label}</div>
          <div className="sw-tip-meta">{s.connections.toLocaleString()} connections</div>
        </React.Fragment>
      )}
      {s.kind === 'bundle' && (
        <React.Fragment>
          <div className="sw-tip-eyebrow">Bundle</div>
          <div className="sw-tip-ref">{s.label}</div>
          <div className="sw-tip-meta">{s.hidden > 0
            ? s.hidden.toLocaleString() + ' of ' + s.connections.toLocaleString() + ' connections not drawn here'
            : s.connections.toLocaleString() + ' connections converge here'} · tap to open</div>
        </React.Fragment>
      )}
    </div>
  );
}

function connectionTitle(info) {
  if (info.kind === 'arc') return info.a.label + ' ↕ ' + info.b.label;
  if (info.kind === 'chapter') return info.book.title + ' ' + info.chapter + ' \u2014 where its threads go';
  if (info.kind === 'underlay') return info.source.label + ' ↕ ' + endpointLabel(info.target);
  return endpointLabel(info.source) + ' ↕ ' + endpointLabel(info.target);
}

function connectionMeta(info) {
  if (info.kind === 'arc') return info.votes + ' votes · ' + info.span.toLocaleString() + ' verses apart';
  if (info.kind === 'chapter') {
    return info.verses + ' verses \u00b7 ' + info.connections.toLocaleString() + ' connections'
      + (info.groups && info.groups.length ? ' \u00b7 to ' + info.groups.length + (info.groups.length === 1 ? ' chapter' : ' chapters') : '');
  }
  if (info.kind === 'underlay') return info.joins;
  return LINK_KIND_NAMES[info.joins] || 'Your link';
}

function ConnectionChooser({ choices, onChoose, onClose, title, meta }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  return (
    <div className="sw-choice" role="dialog" aria-modal="false" aria-label={title || 'Connections here'}>
      <button ref={closeRef} type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close connection choices">×</button>
      <div className="sw-sheet-eyebrow">{title || 'Connections here'}</div>
      <div className="sw-sheet-meta">{meta || 'Several threads are close together. Choose the one you meant.'}</div>
      <div className="sw-choice-list">
        {choices.map((choice, i) => (
          <button type="button" className="sw-choice-row" key={i} onClick={() => onChoose(choice)}>
            <span className="sw-choice-label">{connectionTitle(choice)}</span>
            <span className="sw-choice-meta">{connectionMeta(choice)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectionList({ items, mode, lensOn, onChoose, onClose }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  // the canon list leads with the chapter it reads (landing 15)
  const chapter = mode !== 'personal' && items[0] && items[0].kind === 'chapter' ? items[0] : null;
  const eyebrow = mode === 'personal' ? 'Your nearby links'
    : chapter ? (lensOn ? 'Under the lens \u00b7 ' : 'Nearby \u00b7 ') + chapter.book.title + ' ' + chapter.chapter
    : 'Nearby connections';
  const meta = chapter
    ? chapter.connections.toLocaleString() + (chapter.connections === 1 ? ' connection' : ' connections')
      + ' \u00b7 the strongest ' + (items.length - 1) + ' below; the chapter row lists where they all go.'
    : 'Select a connection to focus it and open its passages.';
  return (
    <div className="sw-list" role="dialog" aria-modal="false" aria-label="Nearby connections" data-lens-on={lensOn ? '1' : '0'}>
      <button ref={closeRef} type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close nearby connections">×</button>
      <div className="sw-sheet-eyebrow">{eyebrow}</div>
      <div className="sw-sheet-meta">{meta}</div>
      {items.length ? (
        <div className="sw-choice-list">
          {items.map((item, i) => (
            <button type="button" className={'sw-choice-row' + (item.kind === 'chapter' ? ' sw-choice-chapter' : '')} key={i} onClick={() => onChoose(item)}>
              <span className="sw-choice-label">{connectionTitle(item)}</span>
              <span className="sw-choice-meta">{connectionMeta(item)}</span>
            </button>
          ))}
        </div>
      ) : <div className="sw-list-empty">No nearby connections at this location.</div>}
    </div>
  );
}

function DetailSheet({ info, onClose, onOpen, onFollow, onGroup }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  const cards = info.cards || [];
  const eyebrow = info.kind === 'link' ? 'Your link'
    : info.kind === 'underlay' ? 'Timothy\u2019s thread'
    : info.kind === 'arc' ? 'Connection'
    : info.kind === 'bundle' ? 'Bundle · ' + info.label
    : info.kind === 'chapter' ? 'Chapter' : 'Verse';
  const meta = info.kind === 'arc'
    ? info.span.toLocaleString() + ' verses apart · weight ' + info.votes
    : info.kind === 'link' ? LINK_KIND_NAMES[info.joins]
    : info.kind === 'underlay' ? (info.sourceName ? info.sourceName + ' \u00b7 ' + info.joins : info.joins)
    : info.kind === 'bundle'
      ? (info.hidden > 0
        ? info.connections.toLocaleString() + ' connections here, ' + info.hidden.toLocaleString()
          + ' not drawn at this zoom. Choose where they go to see them.'
        : info.connections.toLocaleString() + ' connections converge here. Choose where they go to follow them.')
    : info.kind === 'chapter'
      ? info.verses + ' verses · ' + info.connections.toLocaleString() + ' connections'
      : info.connections.toLocaleString() + ' connections';

  return (
    <div className="sw-sheet" role="dialog" aria-modal="false"
      aria-label={eyebrow + ' details'}>
      <button ref={closeRef} type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
      <div className="sw-sheet-eyebrow">{eyebrow}</div>
      <div className="sw-sheet-meta">{meta}</div>
      {info.kind === 'arc' && onFollow && (
        <button type="button" className="sw-sheet-follow" onClick={() => onFollow(info)}
          aria-label={'Follow the line to ' + (info.far === 'to' ? info.b : info.a).label}>
          Follow to {(info.far === 'to' ? info.b : info.a).label} &rsaquo;
        </button>
      )}
      {(info.kind === 'bundle' || (info.kind === 'chapter' && info.groups && info.groups.length > 0)) && onGroup && (
        <div className="sw-choice-list sw-bundle-groups" role="group" aria-label="Where this bundle goes">
          {info.groups.map((grp) => (
            <button type="button" className="sw-choice-row" key={grp.chapterIndex}
              aria-pressed={info.chosenGroup === grp.chapterIndex}
              onClick={() => onGroup(info, grp)}>
              <span className="sw-choice-label">{grp.label}</span>
              <span className="sw-choice-meta">{grp.count} {grp.count === 1 ? 'thread' : 'threads'}
                {grp.hidden > 0 ? ' · ' + grp.hidden + ' not drawn' : ''} · weight {grp.votes}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sw-sheet-cards">
        {cards.map((card, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="sw-card-join" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
            )}
            <button type="button" className="sw-card"
              disabled={!card.endpoint}
              aria-label={card.endpoint ? 'Open ' + card.label + ' in the reader' : card.label}
              onClick={() => card.endpoint && onOpen(card.endpoint)}>
              <span className="sw-card-eyebrow">{card.eyebrow}</span>
              <span className="sw-card-label">{card.label}</span>
              {card.cat && <span className="sw-card-cat">{card.cat}</span>}
              {card.preview && <span className="sw-card-preview">{card.preview}</span>}
              {card.endpoint && <span className="sw-card-go">Open in reader &rsaquo;</span>}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * A tappable card for a Bible verse the graph knows about.
 *
 * `verseEnd` is deliberately absent: the canonical web stores one verse id per
 * arc end (the source dataset's ranges were resolved to their start verse), so
 * a jump from here flashes that verse. The reader's OWN links keep whatever
 * range they were made over — see endpointCard.
 *
 * @param {string} eyebrow
 * @param {{bookId:string, bookTitle:string, chapter:number, verse:number, label:string}} ref
 */
function verseCard(eyebrow, ref) {
  const endpoint = {
    type: 'bible',
    key: 'bible:' + ref.bookId + ':' + ref.chapter + ':' + ref.verse,
    bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse, label: ref.label,
  };
  return {
    eyebrow, label: ref.label, endpoint,
    cat: typeof bookCategory === 'function' ? bookCategory(ref.bookId) : '',
    preview: verseTextFor(ref),
  };
}

/**
 * A tappable card for a whole chapter — the anchor covers every verse in it,
 * so arriving flashes the chapter rather than one line.
 */
function chapterCard(book, chapterNum, verses, firstRef) {
  const label = book.title + ' ' + chapterNum;
  return {
    eyebrow: 'Chapter', label,
    cat: typeof bookCategory === 'function' ? bookCategory(book.id) : '',
    preview: verseTextFor(firstRef),
    endpoint: {
      type: 'bible', key: 'bible:' + book.id + ':' + chapterNum + ':1',
      bookId: book.id, chapter: chapterNum, verse: 1, verseEnd: verses, label,
    },
  };
}

/**
 * A tappable card for one side of a link the reader made. The stored endpoint
 * is passed through UNTOUCHED so its verse range and character span survive —
 * that is what makes a link made over a long passage flash the whole passage.
 */
function endpointCard(eyebrow, ep) {
  if (!ep) return { eyebrow, label: '(unknown)', endpoint: null };
  const cat = ep.type === 'bible' && typeof bookCategory === 'function'
    ? bookCategory(ep.bookId)
    : ep.type === 'study' || ep.type === 'study-letter' || ep.type === 'study-chapter' ? 'Matthew Study Bible'
    : ep.collection || '';
  return {
    eyebrow,
    label: endpointLabel(ep),
    cat,
    preview: ep.preview || ep.text || (ep.type === 'bible' ? verseTextFor(ep) : ''),
    endpoint: ep,
  };
}

function legendFor(mode) {
  // Every variant ends with the histogram key — the bars hanging under the
  // baseline (Psalm 119 reaching deepest) are chapter LENGTH, and nothing on
  // screen said so until a reader asked what the deep column was.
  const histKey = (
    <span className="sw-key" key="hist">
      <i className="sw-key-hist" aria-hidden="true"><i /><i /><i /></i>
      bars below — chapter length
    </span>
  );
  // My Web (1b, design-myweb-colour.md, 5): two families, yours first because
  // the reader's own links are the point of My Web. A pin per shape for yours
  // (the channel a deuteranope keeps once gold and amber meet), a bar per
  // source for Timothy's. Canon hue retired here by Corbin (2026-09-11).
  if (mode === 'personal') {
    const shapeWords = ['within scripture', 'within the Volumes', 'across'];
    return [
      <span className="sw-key" key="yours">
        yours
        {MY_WEB_LINK_KINDS.map((k, i) => (
          <React.Fragment key={k.name}>
            {i > 0 ? ' \u00b7 ' : ' '}
            <i className={'sw-key-pin is-' + k.pin} style={{ color: 'rgb(' + k.rgb + ')' }} aria-hidden="true" />
            {shapeWords[i]}
          </React.Fragment>
        ))}
      </span>,
      <span className="sw-key" key="timothy">
        Timothy&rsquo;s
        {MY_WEB_SOURCES.map((src, i) => (
          <React.Fragment key={src.key}>
            {i > 0 ? ' \u00b7 ' : ' '}
            <i className="sw-key-line" style={{ background: 'rgb(' + src.rgb + ')' }} aria-hidden="true" />
            {src.name}
          </React.Fragment>
        ))}
      </span>,
      histKey,
    ];
  }
  // Distance is the only colour law the screen offers (Corbin, 2026-09-10:
  // "leave distance as only option, it looks best anyway"). The renderer
  // still knows testament and genre by uColorMode; nothing here selects them.
  return [
    <span className="sw-key sw-key-ramp" key="ramp">
      <span>nearby</span><i className="sw-key-gradient" /><span>across the canon</span>
    </span>,
    histKey,
  ];
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function graphStats(graph, density) {
  let shown = 0;
  for (const b of graph.buckets) {
    shown += density === 'essential' ? b.off20 : b.off10;
  }
  return { shown, total: graph.count };
}

/** A LinkEndpoint's own label, falling back to its key. */
function endpointLabel(ep) {
  if (!ep) return '';
  return ep.label || ep.key || '';
}

function curatedEndpoint(edge, node) {
  if (edge.studyId) {
    return {
      type: 'study-letter', key: 'study:' + edge.studyId + ':' + edge.chapterId,
      studyId: edge.studyId, studyChapterId: edge.chapterId,
      screen: 'bible-study-chapter',
      label: node.title, collection: 'Bible Studies',
    };
  }
  if (edge.letterId) {
    const screenByVolume = {
      one: 'vot-one-letter', two: 'vot-letter', three: 'vot-three-letter',
      four: 'vot-four-letter', five: 'vot-five-letter', six: 'vot-six-letter',
      seven: 'vot-seven-letter', timothy: 'vot-timothy-letter', flock: 'vot-flock-letter',
      rebuke: 'vot-rebuke-letter', hm: 'hm-letter',
    };
    return {
      type: 'letter', key: 'letter:' + edge.letterId + ':0', letterId: edge.letterId,
      screen: screenByVolume[edge.volKey] || 'vot-letter',
      volKey: edge.volKey, collection: edge.volKey, label: node.title,
    };
  }
  if (edge.entryId) {
    const type = edge.volKey === 'blessed' ? 'blessed'
      : edge.volKey === 'holydays' ? 'holy-days' : 'wtlb';
    const screen = edge.volKey === 'blessed' ? 'blessed-entry'
      : edge.volKey === 'holydays' ? 'holy-days-entry'
      : edge.volKey === 'wtlb2' ? 'wtlb-two-entry' : 'wtlb-one-entry';
    return {
      type, key: 'wtlb:' + edge.entryId + ':0', entryId: edge.entryId,
      screen,
      volKey: edge.volKey, collection: edge.volKey, label: node.title,
    };
  }
  return null;
}

function summaryOf(found) {
  if (found.kind === 'link') {
    return endpointLabel(found.source) + ' and ' + endpointLabel(found.target) + ', your link.';
  }
  if (found.kind === 'underlay') {
    return found.source.label + ' and ' + endpointLabel(found.target) + ', corpus connection.';
  }
  if (found.kind === 'arc') return found.a.label + ' and ' + found.b.label + ', connected.';
  if (found.kind === 'verse') return found.ref.label + ', ' + found.connections + ' connections.';
  if (found.kind === 'bundle') {
    return found.label + ', ' + (found.hidden > 0
      ? found.hidden + ' connections not drawn here.' : found.connections + ' connections converge here.');
  }
  return found.book.title + ' ' + found.chapter + ', ' + found.connections + ' connections.';
}

/** Verse text via the app's own resolver, once the Bible corpus has landed. */
function verseTextFor(ref) {
  if (typeof resolveVerseText !== 'function') return '';
  try {
    const t = resolveVerseText({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse });
    return t || '';
  } catch (_e) { return ''; }
}

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
