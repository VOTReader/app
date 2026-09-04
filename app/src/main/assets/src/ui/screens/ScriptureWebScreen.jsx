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

import { decodeGraph } from '../../utils/scripture-web/decode.js';
import {
  createCamera, clampCamera, fitPPV, verseToX, xToVerse, zoomAbout,
  localizeFactor, squashFactor, MAX_STRETCH, rotatePointer,
} from '../../utils/scripture-web/geometry.js';
import {
  pickArcs, pickChapter, pickVerse, refOfVerse, chapterRange, countTouching,
  arcsTouching, findWebReference,
} from '../../utils/scripture-web/pick.js';
import { createRenderer, COLOR_MODES, DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { attachWebGestures } from '../scripture-web/gestures.js';
import { bucketDrawCount as bucketDrawCountFor } from '../../utils/scripture-web/decode.js';
import { readChromeTokens, GENRE_NAMES, LINK_KIND_NAMES } from '../../utils/scripture-web/palette.js';
import {
  buildVotRail, buildPersonalGraph, buildCuratedUnderlay,
} from '../../utils/scripture-web/personal-graph.js';
import {
  drawPersonalWeb, pickPersonalLinks, pickUnderlayLinks,
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
const MAX_ZOOM = 4000;
/** Height reserved below the baseline for the ruler + book names. */
const RULER_H = 74;

const DENSITY_LABEL = { essential: 'Essential', famous: 'Famous' };
const COLOR_LABEL = { distance: 'Distance', testament: 'Testament', genre: 'Genre' };
const DENSITY_HINT = {
  essential: 'only the strongest connections',
  famous: 'the famous view — about 64,000 connections',
};
const COLOR_HINT = {
  distance: 'how far apart in scripture the two ends sit',
  testament: 'Old to Old, New to New, or a bridge between them',
  genre: 'the kind of book each thread leaves from',
};

/**
 * @param {object} props
 * @param {(endpoint:object, meta?:object) => void} props.navigateToLink
 * @param {() => void} props.onBack
 * @param {{webDensity?:string, theme?:string}} props.settings
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
  // A canon needs its width. On a phone held upright the screen is CSS-rotated
  // into landscape — no Android orientation flip, the page just lays itself
  // out sideways (owner call). Pointer coords are mapped back through loc().
  const [rotated, setRotated] = React.useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth &&
    window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  React.useEffect(() => {
    const onResize = () => {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      setRotated(window.innerHeight > window.innerWidth && coarse);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rotatedRef = React.useRef(rotated);
  const [orientationHint, setOrientationHint] = React.useState(false);
  const showPortraitFallback = React.useCallback(() => {
    setRotated(false);
    setOrientationHint(true);
  }, []);
  const settleLandscapeRequest = React.useCallback(() => {
    // Some desktop WebViews resolve orientation.lock() without changing the
    // viewport. Do not leave the instrument sideways in that case.
    window.setTimeout(() => {
      if (window.innerHeight > window.innerWidth) showPortraitFallback();
      else setOrientationHint(false);
    }, 300);
  }, [showPortraitFallback]);
  const requestLandscape = React.useCallback(() => {
    const orientation = typeof screen !== 'undefined' && screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') {
      showPortraitFallback();
      return;
    }
    Promise.resolve(orientation.lock('landscape')).then(() => {
      settleLandscapeRequest();
    }).catch(showPortraitFallback);
  }, [settleLandscapeRequest, showPortraitFallback]);
  React.useEffect(() => {
    if (!rotated) {
      if (!(typeof window !== 'undefined' && window.innerHeight > window.innerWidth)) {
        setOrientationHint(false);
      }
      return undefined;
    }
    const coarse = typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    if (!coarse) return undefined;
    const orientation = typeof screen !== 'undefined' && screen.orientation;
    if (orientation && typeof orientation.lock === 'function') {
      Promise.resolve(orientation.lock('landscape')).then(() => {
        settleLandscapeRequest();
      }).catch(showPortraitFallback);
    } else showPortraitFallback();
    return undefined;
  }, [rotated, settleLandscapeRequest, showPortraitFallback]);

  /** Viewport coords -> the rotated screen's own CSS space. */
  const loc = React.useCallback((e) => (rotatedRef.current
    ? rotatePointer(e.clientX, e.clientY, window.innerWidth)
    : { x: e.clientX, y: e.clientY }), []);
  const [mode, setMode] = React.useState('canonical');   // 'canonical' | 'personal'
  const [density, setDensity] = React.useState(() => {
    // `classic` was the old internal name; accept it once so existing
    // settings migrate naturally while the feature speaks in user terms.
    const saved = settings && settings.webDensity === 'classic' ? 'famous' : settings && settings.webDensity;
    return DENSITY_STEPS.indexOf(saved) >= 0 ? saved : 'famous';
  });
  const [colorMode, setColorMode] = React.useState('distance');
  const [detail, setDetail] = React.useState(null);      // the open sheet
  const [choices, setChoices] = React.useState(null);    // overlapped line chooser
  const [listOpen, setListOpen] = React.useState(false); // accessible nearby list
  const [goToOpen, setGoToOpen] = React.useState(false);
  const [goToValue, setGoToValue] = React.useState('');
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
  const rendererRef = React.useRef(null);
  const viewRef = React.useRef({ W: 0, H: 0, DPR: 1 });
  const focusRef = React.useRef({ arc: -1, range: null });
  const contextRef = React.useRef(null);
  const rangeRef = React.useRef(null);
  const zoomRef = React.useRef(null);
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
      density, rulerDepth: f.ruler,
    };
  }, [density, frame]);

  /** Everything the rail renderer needs to place a personal endpoint. */
  const railOpts = React.useCallback(() => {
    const v = viewRef.current, cam = camRef.current;
    const f = frame();
    return {
      width: v.W, height: v.H, DPR: v.DPR, base: f.base,
      chrome: chromeRef.current,
      votRail: personalRef.current && personalRef.current.votRail,
      verseX: (verse) => verseToX(cam, v.W, verse),
      showUnderlay,
    };
  }, [frame, showUnderlay]);

  // ── render ──────────────────────────────────────────────────────────────
  const draw = React.useCallback(() => {
    const g = graph, cam = camRef.current, r = rendererRef.current;
    const v = viewRef.current;
    if (!g || !cam || !r || !v.W) return;
    const zoom = cam.ppv / fitPPV(cam, v.W);
    const chrome = chromeRef.current;
    const base = viewFor();
    const location = webLocation(g, cam, v.W, zoom);
    if (contextRef.current) contextRef.current.textContent = location.title;
    if (rangeRef.current) rangeRef.current.textContent = location.range;
    if (zoomRef.current) {
      const zoomLabel = zoom < 1.1 ? 'Overview' : (zoom < 10 ? Math.round(zoom * 10) / 10 : Math.round(zoom) + 'x');
      zoomRef.current.textContent = zoomLabel;
    }
    if (mode === 'personal') {
      // The personal web is Canvas2D over a cleared GL surface: hundreds of
      // links, not hundreds of thousands, so crisp 2D curves beat a second
      // shader. The GL pass still runs to paint the ground colour.
      r.draw(Object.assign({}, base, {
        camX: cam.x, ppv: cam.ppv, strokeWidth: 1, alpha: 0,
        colorMode, density: 'essential', light: chrome.isLight, bg: chrome.bg,
        focusRange: null, focusArc: -1, hoverArc: -1,
      }));
      const uic = uiRef.current;
      const ctx = uic && uic.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, v.W, v.H);
        const p = personalRef.current;
        drawPersonalWeb(ctx, p && p.graph, p && p.underlay, Object.assign(railOpts(), {
          hoverIndex: hoverRef.current, focusIndex: focusRef.current.arc,
        }));
        drawRulerOnly(ctx, g, cam, base, v, chrome);
      }
      return;
    }
    const strokeWidth = Math.min(0.9 + Math.log2(zoom) * 0.16, 2.4) * v.DPR;
    // The Famous view is intentionally high-coverage, but
    // 64k overlapping ribbons still need a quiet baseline. Let zoom bring
    // detail forward without recreating the old neon wash at overview.
    const alpha = Math.min(0.075 + Math.log2(zoom) * 0.028, chrome.isLight ? 0.42 : 0.19);
    r.draw(Object.assign({}, base, {
      camX: cam.x, ppv: cam.ppv,
      strokeWidth,
      alpha,
      colorMode, density, light: chrome.isLight, bg: chrome.bg,
      focusRange: focusRef.current.range, focusArc: focusRef.current.arc,
      hoverArc: hoverRef.current,
    }));
    drawRuler(uiRef.current, g, cam,
      Object.assign({}, base, { densityDraw: (bucket) => bucketDrawCountFor(bucket, density) }),
      v, chrome);
  }, [graph, colorMode, density, viewFor, mode, railOpts]);

  React.useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule]);

  // ── size + renderer lifecycle ───────────────────────────────────────────
  React.useEffect(() => {
    if (!graph) return;
    const glc = glRef.current, uic = uiRef.current;
    if (!glc || !uic) return;
    let renderer = null;
    let disposed = false;
    const build = () => createRenderer(glc, graph, {
      // After a GPU reset every GL object is dead. Rebuild the whole
      // renderer on the same (restored) context and repaint — this is what
      // turns the on-device "wash-out until app restart" into a blink.
      onContextRestored: () => {
        if (disposed) return;
        try { renderer && renderer.dispose(); } catch (_e) { /* already dead */ }
        renderer = build();
        rendererRef.current = renderer;
        schedule();
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
      clampCamera(cam, W, MAX_ZOOM);
      schedule();
    };
    resize();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(glc); else window.addEventListener('resize', resize);
    const onRestored = () => schedule();
    glc.addEventListener('webglcontextrestored', onRestored);

    return () => {
      disposed = true;
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      glc.removeEventListener('webglcontextrestored', onRestored);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [graph, schedule, glRetry]);

  // ── the personal web ────────────────────────────────────────────────────
  const linkVersion = useLinkVersion();
  const [studiesTick, setStudiesTick] = React.useState(0);
  React.useEffect(() => {
    if (!graph || mode !== 'personal') return;
    const built = buildPersonal(graph);
    personalRef.current = built;
    setPersonalCount(built && built.graph ? built.graph.count : 0);
    schedule();
    // The studies corpus is lazy; when it lands after the first build, the
    // study rail segments and their underlay threads appear on the re-run.
    if (typeof BIBLE_STUDIES === 'undefined' && typeof loadBibleStudies === 'function') {
      loadBibleStudies().then((ok) => { if (ok) setStudiesTick((n) => n + 1); });
    }
  }, [graph, mode, linkVersion, studiesTick, schedule]);

  // ── gestures — imperative, never React state per frame ──────────────────
  // Wiring itself lives in gestures.js (attachWebGestures) — a pure move, so
  // it can be exercised with real dispatched DOM events instead of only a
  // screenshot. This effect just owns the mount guard and hands over refs.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph) return;
    return attachWebGestures(el, {
      loc, dpr: () => viewRef.current.DPR, cam: () => camRef.current,
      view: () => viewRef.current, handlers: () => handlersRef.current,
      schedule, maxZoom: MAX_ZOOM, clampCamera, zoomAbout, xToVerse,
    });
  }, [graph, schedule, loc]);

  const hitCandidatesAt = React.useCallback((cx, cy) => {
    const g = graph, cam = camRef.current, v = viewRef.current;
    if (!g || !cam || !v.W) return [];
    const px = cx * v.DPR, py = cy * v.DPR;
    const view = viewFor();
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
      return {
        kind: 'underlay', index: found.index, source, target,
        joins: edge.kind || 'curated connection',
        cards: [verseCard('Scripture', source), endpointCard('Corpus', target)],
      };
    }
    if (found.kind === 'arc') {
      const a = refOfVerse(g, found.hit.from), b = refOfVerse(g, found.hit.to);
      return {
        kind: 'arc', a, b, votes: found.hit.votes,
        span: Math.abs(found.hit.to - found.hit.from), index: found.hit.index,
        cards: [verseCard('From', a), verseCard('To', b)],
      };
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
    return { kind: 'chapter', chapterIndex: found.chapterIndex,
      book: g.books[ch[0]], chapter: ch[1], verses: ch[3], lo, hi,
      connections: countTouching(g, lo, hi, density),
      // Opening a chapter highlights the WHOLE chapter on arrival.
      cards: [chapterCard(g.books[ch[0]], ch[1], ch[3], first)] };
  }, [graph, density]);

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
      const cam = camRef.current;
      if (!cam) return [];
      const centre = Math.max(0, Math.min(graph.total - 1, Math.round(cam.x)));
      const chapterIndex = graph.chapterOfVerse[centre];
      const [lo, hi] = chapterRange(graph, chapterIndex);
      for (const index of arcsTouching(graph, lo, hi, density, 36)) {
        found.push({ kind: 'arc', hit: {
          index, from: graph.from[index], to: graph.to[index], votes: graph.votes[index],
        } });
      }
    }
    return found.map(describe).filter(Boolean);
  }, [describe, density, graph, listOpen, mode, showUnderlay]);

  const submitGoTo = React.useCallback((event) => {
    if (event && event.preventDefault) event.preventDefault();
    const result = graph && findWebReference(graph, goToValue);
    const cam = camRef.current, v = viewRef.current;
    if (!result || !cam || !v.W) {
      flashHint('Try a reference such as Jeremiah 6:16 or John 3.');
      return;
    }
    cam.x = result.hasVerse ? result.verse : (result.lo + result.hi) / 2;
    const chapterVerses = result.hi - result.lo + 1;
    const targetZoom = result.hasVerse
      ? Math.min(800, Math.max(160, graph.total / Math.max(chapterVerses * 2.5, 1)))
      : Math.min(800, Math.max(16, graph.total / Math.max(chapterVerses * 4, 1)));
    cam.ppv = fitPPV(cam, v.W) * targetZoom;
    clampCamera(cam, v.W, MAX_ZOOM);
    focusRef.current = { arc: -1, range: [result.lo, result.hi] };
    setGoToOpen(false);
    setGoToValue('');
    setDetail(null); setChoices(null); setListOpen(false); setTip(null);
    setAnnounce(result.label);
    schedule();
  }, [flashHint, goToValue, graph, schedule]);

  const commitFound = React.useCallback((found) => {
    if (!found) return;
    focusRef.current = found.kind === 'arc' || found.kind === 'link'
      ? { arc: found.index, range: null }
      : { arc: -1, range: found.kind === 'chapter' ? [found.lo, found.hi]
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
  }, [commitFound, describe, hitCandidatesAt, schedule]);

  const doubleTap = React.useCallback((cx) => {
    const cam = camRef.current, v = viewRef.current;
    zoomAbout(cam, v.W, cx * v.DPR, 2.5, MAX_ZOOM);
    schedule();
  }, [schedule]);

  const changeZoom = React.useCallback((factor) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !v.W) return;
    zoomAbout(cam, v.W, v.W / 2, factor, MAX_ZOOM);
    schedule();
  }, [schedule]);

  // Publish the latest handlers for the (stable) gesture listeners to call.
  React.useEffect(() => { handlersRef.current = { hover, tap, doubleTap }; }, [hover, tap, doubleTap]);

  const resetView = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam) return;
    cam.ppv = fitPPV(cam, v.W);
    cam.x = cam.total / 2;
    clampCamera(cam, v.W, MAX_ZOOM);
    focusRef.current = { arc: -1, range: null };
    hoverRef.current = -1;
    setDetail(null); setChoices(null); setListOpen(false); setTip(null); setGoToOpen(false); schedule();
  }, [schedule]);

  // ── keyboard (PWA desktop) ──────────────────────────────────────────────
  const onKeyDown = React.useCallback((e) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !v.W) return;
    const step = (v.W / cam.ppv) * 0.12;
    if (e.key === 'ArrowLeft') { cam.x -= step; }
    else if (e.key === 'ArrowRight') { cam.x += step; }
    else if (e.key === '+' || e.key === '=') { zoomAbout(cam, v.W, v.W / 2, 1.6, MAX_ZOOM); }
    else if (e.key === '-' || e.key === '_') { zoomAbout(cam, v.W, v.W / 2, 1 / 1.6, MAX_ZOOM); }
    else if (e.key === '0') { resetView(); return; }
    else if (e.key === 'Escape') {
      if (goToOpen || listOpen || choices || detail || tip) {
        setGoToOpen(false); setListOpen(false); setChoices(null); setDetail(null); setTip(null);
        focusRef.current = { arc: -1, range: null }; schedule();
      }
      else if (onBack) onBack();
      return;
    } else return;
    e.preventDefault();
    clampCamera(cam, v.W, MAX_ZOOM);
    const centre = Math.round(cam.x);
    if (graph && centre >= 0 && centre < graph.total) setAnnounce(refOfVerse(graph, centre).label);
    schedule();
  }, [choices, detail, goToOpen, listOpen, tip, graph, onBack, resetView, schedule]);

  const openEndpoint = React.useCallback((endpoint) => {
    if (!endpoint || typeof navigateToLink !== 'function') return;
    // meta.sourceLetterTitle is what the reader's back pill is labelled with,
    // and the hook snapshots the current screen as the return target — so a
    // jump from here comes back HERE.
    navigateToLink(endpoint, { sourceLetterTitle: 'The Scripture Web' });
  }, [navigateToLink]);

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
    <div className={'sw-root' + (rotated ? ' sw-rotated' : '')} ref={wrapRef}
      tabIndex={0} onKeyDown={onKeyDown}
      role="application"
      aria-label="The Scripture Web — an interactive map of cross-references"
      aria-describedby="sw-context-copy sw-a11y-help">
      <canvas className="sw-canvas sw-canvas-gl" ref={glRef} aria-hidden="true" />
      <canvas className="sw-canvas sw-canvas-ui" ref={uiRef} aria-hidden="true" />

      {!graph && <div className="sw-loading">Weaving the web…</div>}

      <div className="sw-topbar">
        <button type="button" className="sw-btn sw-btn-icon" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="sw-title">
          <h1>{mode === 'personal' ? 'My Web' : 'The Scripture Web'}</h1>
          {mode === 'personal'
            ? <p>{personalCount.toLocaleString()} {personalCount === 1 ? 'link' : 'links'} you have made</p>
            : (stats && <p>{stats.shown.toLocaleString()} of {stats.total.toLocaleString()} connections</p>)}
          {hint && <p className="sw-hint" role="status">{hint}</p>}
        </div>
      </div>

      <div className="sw-controls">
        <div className="sw-seg" role="group" aria-label="Which web">
          <button type="button" className={'sw-seg-btn' + (mode === 'canonical' ? ' is-on' : '')}
            aria-pressed={mode === 'canonical'} onClick={() => { setMode('canonical'); setDetail(null); setChoices(null); setListOpen(false); }}>Scripture</button>
          <button type="button" className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={() => { setMode('personal'); setDetail(null); setChoices(null); setListOpen(false); }}>My web</button>
        </div>
        <button type="button" className={'sw-btn' + (goToOpen ? ' is-on' : '')}
          onClick={() => { setGoToOpen(!goToOpen); setListOpen(false); }}
          aria-expanded={goToOpen} aria-haspopup="dialog">Go to</button>
        <button type="button" className={'sw-btn' + (listOpen ? ' is-on' : '')}
          onClick={() => { setListOpen(!listOpen); setGoToOpen(false); setChoices(null); }}
          aria-expanded={listOpen} aria-haspopup="dialog">Nearby</button>
        {mode === 'canonical' ? (
          <React.Fragment>
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Connection density</span>
              <select className="sw-select" value={density} aria-label="Connection density"
                onChange={(e) => {
                  const next = e.target.value;
                  setDensity(next); flashHint(DENSITY_LABEL[next] + ' — ' + DENSITY_HINT[next]);
                  if (typeof updateSetting === 'function') updateSetting('webDensity', next);
                }}>
                <option value="essential">Essential</option>
                <option value="famous">Famous</option>
              </select>
            </label>
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Colour mode</span>
              <select className="sw-select" value={colorMode} aria-label="Colour mode"
                onChange={(e) => {
                  const next = e.target.value;
                  setColorMode(next); flashHint('Colour shows ' + COLOR_HINT[next]);
                }}>
                {COLOR_MODES.map((value) => <option key={value} value={value}>{COLOR_LABEL[value]}</option>)}
              </select>
            </label>
          </React.Fragment>
        ) : (
          <button type="button" className={'sw-btn sw-toggle' + (showUnderlay ? ' is-on' : '')} aria-pressed={showUnderlay}
            onClick={() => { setShowUnderlay(!showUnderlay); schedule(); }}
            aria-label="Show the curated corpus connections">
            Corpus context · {personalRef.current && personalRef.current.underlay
              ? personalRef.current.underlay.count.toLocaleString() : '…'}
          </button>
        )}
        <div className="sw-zoom" role="group" aria-label="Zoom">
          <button type="button" className="sw-btn sw-btn-zoom" onClick={() => changeZoom(1 / 1.8)} aria-label="Zoom out">−</button>
          <button type="button" className="sw-btn sw-btn-zoom" onClick={() => changeZoom(1.8)} aria-label="Zoom in">+</button>
        </div>
        <button type="button" className="sw-btn" onClick={resetView} aria-label="Reset the view">Reset</button>
      </div>

      <div className="sw-context" aria-label="Current Scripture Web location">
        <span className="sw-context-eyebrow">Viewing</span>
        <strong ref={contextRef}>The whole canon</strong>
        <span id="sw-context-copy" className="sw-context-range" ref={rangeRef} />
        <span className="sw-context-zoom" ref={zoomRef}>Overview</span>
      </div>

      {goToOpen && (
        <div className="sw-goto" role="dialog" aria-label="Go to a Bible reference">
          <form onSubmit={submitGoTo}>
            <label className="sw-sr-only" htmlFor="sw-goto-input">Bible reference</label>
            <input id="sw-goto-input" className="sw-goto-input" autoFocus
              value={goToValue} onChange={(e) => setGoToValue(e.target.value)}
              placeholder="Jeremiah 6:16" list="sw-book-list" />
            <button type="submit" className="sw-btn">Go</button>
          </form>
          <datalist id="sw-book-list">
            {graph && graph.books.map((book) => <option key={book.id} value={book.title + ' '} />)}
          </datalist>
          <div className="sw-goto-help">Book, chapter, or verse — for example “Jer 6:16”.</div>
        </div>
      )}

      {mode === 'personal' && graph && personalCount === 0 && (
        <div className="sw-empty">
          <div className="sw-empty-title">Your web is still being woven.</div>
          <div className="sw-empty-body">
            Select text anywhere in the app, tap <strong>Link</strong>, and pick a
            destination. Every link you make draws a thread here — between two
            passages of scripture, between a letter and a verse, or across the
            Volumes. The faint gold threads below are the connections the
            Volumes already make.
          </div>
        </div>
      )}
      {tip && <TipChip info={tip} viewport={viewRef.current} />}
      {choices && <ConnectionChooser choices={choices} onChoose={commitFound}
        onClose={() => { setChoices(null); schedule(); }} />}
      {listOpen && <ConnectionList items={listItems} mode={mode}
        onChoose={commitFound} onClose={() => setListOpen(false)} />}
      {detail && (
        <DetailSheet info={detail} onClose={() => setDetail(null)} onOpen={openEndpoint} />
      )}

      <div className="sw-legend" aria-hidden="true">{legendFor(colorMode)}</div>
      <div className="sw-credit">Cross-references: OpenBible.info (CC-BY)</div>
      <div className="sw-live" role="status" aria-live="polite">{announce}</div>
      <div id="sw-a11y-help" className="sw-sr-only">
        Drag to move through scripture. Use the zoom controls or plus and minus keys.
        Select a line to see its references; Nearby opens a keyboard-friendly list.
      </div>
    </div>
    {orientationHint && rotated && (
      <div className="sw-orientation-note" role="status">
        <strong>Best in landscape</strong>
        <span>Turn your device sideways to read the full canon clearly.</span>
        <button type="button" className="sw-btn" onClick={requestLandscape}>Try landscape</button>
      </div>
    )}
    </React.Fragment>
  );
}

/* ── the ruler ─────────────────────────────────────────────────────────────
   Books always; chapter numerals once a chapter is wide enough to hold one;
   verse ticks and numerals past that. The chapter histogram hangs BELOW the
   baseline, its depth proportional to verse count — Psalm 119 reaching
   furthest down, exactly as in the visualization this descends from. */
function drawRuler(canvas, g, cam, view, v, chrome) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
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

  // chapter numerals in the middle zoom band
  if (cam.ppv > 2.4 * DPR && cam.ppv <= 30 * DPR) {
    ctx.font = chrome.fsRuler * DPR + 'px Georgia,serif';
    ctx.fillStyle = 'rgba(' + ink + ',0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const c of g.chapters) {
      const x = (X(c[2]) + X(c[2] + c[3])) / 2;
      if (x < -20 || x > W + 20) continue;
      if (X(c[2] + c[3]) - X(c[2]) < 22 * DPR) continue;
      ctx.fillText(String(c[1]), x, base - 6 * DPR);
    }
  }

  // book names + separators
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  // Right edge already claimed on each of the two label rows, so a book can
  // only print where it will not touch whatever printed before it.
  const rowEnd = [-Infinity, -Infinity];
  for (let bi = 0; bi < span.length; bi++) {
    const s = span[bi][0], e = span[bi][1];
    const x0 = X(s), x1 = X(e);
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
    const fullFont = '600 ' + (chrome.fsLabel * DPR) + 'px Cinzel,Georgia,serif';
    const abbrFont = (chrome.fsRuler * DPR) + 'px Cinzel,Georgia,serif';
    ctx.font = fullFont;
    let label = null;
    if (ctx.measureText(full).width <= width - 8 * DPR) {
      label = full;
    } else {
      ctx.font = abbrFont;
      const w = ctx.measureText(abbr).width;
      // Staggering onto a second row buys a book roughly twice its own width
      // before it can touch the neighbour printed on the same row.
      if (w <= width * 2) label = abbr;
    }
    if (!label) continue;
    ctx.font = label === full ? fullFont : abbrFont;
    const w = ctx.measureText(label).width;
    const cx = Math.max(Math.min((x0 + x1) / 2, W - 30 * DPR), 30 * DPR);
    const left = cx - w / 2, right = cx + w / 2;
    const pad = 5 * DPR;
    // Prefer the top row; fall to the second only if the top is taken. If
    // both are claimed, the book goes unlabelled rather than overprinting.
    let row = -1;
    if (left >= rowEnd[0] + pad) row = 0;
    else if (left >= rowEnd[1] + pad) row = 1;
    if (row < 0) continue;
    rowEnd[row] = right;
    ctx.fillStyle = 'rgba(' + ink + ',' + (row ? 0.62 : 0.86) + ')';
    ctx.fillText(label, cx, base + (row ? 48 : 34) * DPR);
  }
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
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const rowEnd = [-Infinity, -Infinity];
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
    const fullFont = '600 ' + (chrome.fsLabel * DPR) + 'px Cinzel,Georgia,serif';
    const abbrFont = (chrome.fsRuler * DPR) + 'px Cinzel,Georgia,serif';
    ctx.font = fullFont;
    let label = null;
    if (ctx.measureText(full).width <= width - 8 * DPR) {
      label = full;
    } else {
      ctx.font = abbrFont;
      const w = ctx.measureText(abbr).width;
      // Staggering onto a second row buys a book roughly twice its own width
      // before it can touch the neighbour printed on the same row.
      if (w <= width * 2) label = abbr;
    }
    if (!label) continue;
    ctx.font = label === full ? fullFont : abbrFont;
    const w = ctx.measureText(label).width;
    const cx = Math.max(Math.min((x0 + x1) / 2, W - 30 * DPR), 30 * DPR);
    const left = cx - w / 2, right = cx + w / 2;
    const pad = 5 * DPR;
    // Prefer the top row; fall to the second only if the top is taken. If
    // both are claimed, the book goes unlabelled rather than overprinting.
    let row = -1;
    if (left >= rowEnd[0] + pad) row = 0;
    else if (left >= rowEnd[1] + pad) row = 1;
    if (row < 0) continue;
    rowEnd[row] = right;
    ctx.fillStyle = 'rgba(' + ink + ',' + (row ? 0.62 : 0.86) + ')';
    ctx.fillText(label, cx, base + (row ? 48 : 34) * DPR);
  }
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
    <div className="sw-tip" style={style} aria-hidden="true">
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
          <div className="sw-tip-eyebrow">Corpus connection</div>
          <div className="sw-tip-ref">{s.source.label}</div>
          <div className="sw-tip-arrow">↕</div>
          <div className="sw-tip-ref sw-tip-ref-alt">{s.target ? endpointLabel(s.target) : 'Corpus passage'}</div>
          <div className="sw-tip-meta">{s.joins}</div>
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
    </div>
  );
}

function connectionTitle(info) {
  if (info.kind === 'arc') return info.a.label + ' ↕ ' + info.b.label;
  if (info.kind === 'underlay') return info.source.label + ' ↕ ' + endpointLabel(info.target);
  return endpointLabel(info.source) + ' ↕ ' + endpointLabel(info.target);
}

function connectionMeta(info) {
  if (info.kind === 'arc') return info.votes + ' votes · ' + info.span.toLocaleString() + ' verses apart';
  if (info.kind === 'underlay') return info.joins;
  return LINK_KIND_NAMES[info.joins] || 'Your link';
}

function ConnectionChooser({ choices, onChoose, onClose }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  return (
    <div className="sw-choice" role="dialog" aria-modal="false" aria-label="Connections here">
      <button ref={closeRef} type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close connection choices">×</button>
      <div className="sw-sheet-eyebrow">Connections here</div>
      <div className="sw-sheet-meta">Several threads are close together. Choose the one you meant.</div>
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

function ConnectionList({ items, mode, onChoose, onClose }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  return (
    <div className="sw-list" role="dialog" aria-modal="false" aria-label="Nearby connections">
      <button ref={closeRef} type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close nearby connections">×</button>
      <div className="sw-sheet-eyebrow">{mode === 'personal' ? 'Your nearby links' : 'Nearby connections'}</div>
      <div className="sw-sheet-meta">Select a connection to focus it and open its passages.</div>
      {items.length ? (
        <div className="sw-choice-list">
          {items.map((item, i) => (
            <button type="button" className="sw-choice-row" key={i} onClick={() => onChoose(item)}>
              <span className="sw-choice-label">{connectionTitle(item)}</span>
              <span className="sw-choice-meta">{connectionMeta(item)}</span>
            </button>
          ))}
        </div>
      ) : <div className="sw-list-empty">No nearby connections at this location.</div>}
    </div>
  );
}

function DetailSheet({ info, onClose, onOpen }) {
  const closeRef = React.useRef(null);
  React.useEffect(() => { if (closeRef.current) closeRef.current.focus(); }, []);
  const cards = info.cards || [];
  const eyebrow = info.kind === 'link' ? 'Your link'
    : info.kind === 'underlay' ? 'Corpus connection'
    : info.kind === 'arc' ? 'Connection'
    : info.kind === 'chapter' ? 'Chapter' : 'Verse';
  const meta = info.kind === 'arc'
    ? info.span.toLocaleString() + ' verses apart · weight ' + info.votes
    : info.kind === 'link' ? LINK_KIND_NAMES[info.joins]
    : info.kind === 'underlay' ? info.joins
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

function legendFor(colorMode) {
  // Every variant ends with the histogram key — the bars hanging under the
  // baseline (Psalm 119 reaching deepest) are chapter LENGTH, and nothing on
  // screen said so until a reader asked what the deep column was.
  const histKey = (
    <span className="sw-key" key="hist">
      <i className="sw-key-hist" aria-hidden="true"><i /><i /><i /></i>
      bars below — chapter length
    </span>
  );
  if (colorMode === 'testament') {
    return ['Within the Old', 'Old ↔ New', 'Within the New'].map((label, i) => (
      <span className="sw-key" key={label}>
        <i className={'sw-key-dot sw-key-t' + i} />{label}
      </span>
    )).concat([histKey]);
  }
  if (colorMode === 'genre') {
    return GENRE_NAMES.map((label, i) => (
      <span className="sw-key" key={label}><i className={'sw-key-dot sw-key-g' + i} />{label}</span>
    )).concat([histKey]);
  }
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

function webLocation(g, cam, width, zoom) {
  if (!(zoom >= 1.15)) return { title: 'The whole canon', range: '' };
  const left = Math.max(0, Math.min(g.total - 1, Math.floor(xToVerse(cam, width, 0))));
  const right = Math.max(0, Math.min(g.total - 1, Math.ceil(xToVerse(cam, width, width))));
  const a = refOfVerse(g, left), b = refOfVerse(g, right);
  if (a.chapterIndex === b.chapterIndex) {
    return {
      title: a.bookTitle + ' ' + a.chapter,
      range: 'Verses ' + a.verse + (a.verse === b.verse ? '' : '–' + b.verse),
    };
  }
  const center = refOfVerse(g, Math.max(0, Math.min(g.total - 1, Math.round(cam.x))));
  return { title: center.bookTitle + ' ' + center.chapter, range: 'Visible ' + a.label + ' – ' + b.label };
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
