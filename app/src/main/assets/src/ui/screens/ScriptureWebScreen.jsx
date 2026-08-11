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
  pickArc, pickChapter, pickVerse, refOfVerse, chapterRange, countTouching,
} from '../../utils/scripture-web/pick.js';
import { createRenderer, COLOR_MODES, DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { bucketDrawCount as bucketDrawCountFor } from '../../utils/scripture-web/decode.js';
import { readChromeTokens, GENRE_NAMES, LINK_KIND_NAMES } from '../../utils/scripture-web/palette.js';
import {
  buildVotRail, buildPersonalGraph, buildCuratedUnderlay,
} from '../../utils/scripture-web/personal-graph.js';
import { drawPersonalWeb, pickPersonal } from '../scripture-web/rail-renderer.js';

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

const DENSITY_LABEL = { essential: 'Essential', classic: 'Classic', complete: 'Complete' };
const COLOR_LABEL = { distance: 'Distance', testament: 'Testament', genre: 'Genre' };
const DENSITY_HINT = {
  essential: 'only the strongest connections',
  classic: 'the famous view — strong connections',
  complete: 'every connection in the dataset',
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
  // A canon needs its width. On a phone held upright the screen is CSS-rotated
  // into landscape — no Android orientation flip, the page just lays itself
  // out sideways (owner call). Pointer coords are mapped back through loc().
  const [rotated, setRotated] = React.useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  React.useEffect(() => {
    const onResize = () => setRotated(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const rotatedRef = React.useRef(rotated);

  /** Viewport coords -> the rotated screen's own CSS space. */
  const loc = React.useCallback((e) => (rotatedRef.current
    ? rotatePointer(e.clientX, e.clientY, window.innerWidth)
    : { x: e.clientX, y: e.clientY }), []);
  const [mode, setMode] = React.useState('canonical');   // 'canonical' | 'personal'
  const [density, setDensity] = React.useState(
    DENSITY_STEPS.indexOf(settings && settings.webDensity) >= 0 ? settings.webDensity : 'classic');
  const [colorMode, setColorMode] = React.useState('distance');
  const [detail, setDetail] = React.useState(null);      // the open sheet
  const [tip, setTip] = React.useState(null);            // hover chip
  const [announce, setAnnounce] = React.useState('');
  // A transient explanation under the title — set on control cycles so the
  // reader is TOLD what Essential/Classic/Complete and the colour modes mean
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
  // Hover is a LIGHT touch: it brightens the thread under the pointer and
  // names it, but never dims the rest of the web. Only a tap focuses.
  const hoverRef = React.useRef(-1);
  const chromeRef = React.useRef(readChromeTokens());
  const rafRef = React.useRef(0);
  const personalRef = React.useRef(null);
  // frame() runs per draw and must stay identity-stable, so it reads the mode
  // from a ref rather than closing over the state value.
  const modeRef = React.useRef('canonical');
  // True while a pinch/drag/wheel is in flight (with a short decay). Complete
  // draws ~21M vertices a frame at overview — fine as a single settled frame,
  // lethal as a sustained gesture rate on a phone GPU (the Pixel 9 Pro
  // context-loss report). So gestures draw at Classic and the full set lands
  // on the settle frame.
  const gestureRef = React.useRef({ active: false, timer: 0 });

  const theme = settings && settings.theme;

  // ── load the graph asset (lazy, injected script, precached by the SW) ──
  React.useEffect(() => {
    let alive = true;
    ensureScriptureWebData()
      .then((data) => {
        if (!alive) return;
        const g = decodeGraph(data);
        g.chunkSize = data.chunkSize || 256;
        setGraph(g);
      })
      .catch((e) => { if (alive) setLoadError(e && e.message ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

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

  const schedule = React.useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawRef.current(); });
  }, []);

  /** Mark gesture activity; the settle frame re-draws at full density. */
  const touchGesture = React.useCallback(() => {
    const g = gestureRef.current;
    g.active = true;
    if (g.timer) clearTimeout(g.timer);
    g.timer = setTimeout(() => { g.active = false; schedule(); }, 180);
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
    const liveDensity = (density === 'complete' && gestureRef.current.active)
      ? 'classic' : density;
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
    r.draw(Object.assign({}, base, {
      camX: cam.x, ppv: cam.ppv,
      strokeWidth: Math.min(0.8 + Math.log2(zoom) * 0.24, 3.0) * v.DPR,
      alpha: Math.min(0.052 + Math.log2(zoom) * 0.042, chrome.isLight ? 0.8 : 0.5),
      colorMode, density: liveDensity, light: chrome.isLight, bg: chrome.bg,
      focusRange: focusRef.current.range, focusArc: focusRef.current.arc,
      hoverArc: hoverRef.current,
    }));
    drawRuler(uiRef.current, g, cam,
      Object.assign({}, base, { densityDraw: (bucket) => bucketDrawCountFor(bucket, liveDensity) }),
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
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph) return;
    const pointers = new Map();
    let drag = null, pinch = null, moved = false, lastTap = 0;

    const dpr = () => viewRef.current.DPR;
    const down = (e) => {
      // A tap on the chrome is the chrome's alone. Without this, pressing
      // "Essential" also picked whatever thread happened to run beneath the
      // button — the pointer events bubble up from the button into this
      // root-level gesture surface (the on-device double-activation report).
      if (e.target && e.target.closest &&
          e.target.closest('.sw-controls, .sw-topbar, .sw-sheet, .sw-tip, button')) return;
      // setPointerCapture throws NotFoundError if the pointer is already gone
      // (or synthetic). Losing capture costs us nothing — the document-level
      // listeners still see the move — but letting it throw here would abort
      // the handler and leave the gesture dead.
      try { if (el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch (_e) { /* capture is optional */ }
      const pt = loc(e);
      pointers.set(e.pointerId, pt);
      moved = false;
      if (pointers.size === 2) {
        const [p, q] = Array.from(pointers.values());
        const mid = (p.x + q.x) / 2;
        pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), ppv: camRef.current.ppv,
                  mid, verse: xToVerse(camRef.current, viewRef.current.W, mid * dpr()) };
        drag = null;
      } else {
        drag = { x: pt.x, camx: camRef.current.x };
      }
    };
    const move = (e) => {
      const pt = loc(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
      const cam = camRef.current, W = viewRef.current.W;
      if (pinch && pointers.size === 2) {
        const [p, q] = Array.from(pointers.values());
        cam.ppv = pinch.ppv * (Math.hypot(p.x - q.x, p.y - q.y) / Math.max(pinch.d, 1));
        clampCamera(cam, W, MAX_ZOOM);
        cam.x = pinch.verse - (pinch.mid * dpr() - W / 2) / cam.ppv;
        clampCamera(cam, W, MAX_ZOOM);
        moved = true; touchGesture(); schedule(); return;
      }
      if (drag) {
        if (Math.abs(pt.x - drag.x) > 3) moved = true;
        cam.x = drag.camx - (pt.x - drag.x) * dpr() / cam.ppv;
        clampCamera(cam, W, MAX_ZOOM);
        touchGesture(); schedule(); return;
      }
      if (e.pointerType === 'mouse') handlersRef.current.hover(pt.x, pt.y);
    };
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !moved) {
        const pt = loc(e);
        const now = Date.now();
        if (now - lastTap < 300) { handlersRef.current.doubleTap(pt.x); lastTap = 0; }
        else { lastTap = now; handlersRef.current.tap(pt.x, pt.y); }
      }
      drag = null;
    };
    const cancel = (e) => { pointers.delete(e.pointerId); drag = null; pinch = null; };
    const wheel = (e) => {
      e.preventDefault();
      const cam = camRef.current, W = viewRef.current.W;
      zoomAbout(cam, W, loc(e).x * dpr(), Math.exp(-e.deltaY * (e.ctrlKey ? 0.011 : 0.0021)), MAX_ZOOM);
      touchGesture(); schedule();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('wheel', wheel);
    };
  }, [graph, schedule, touchGesture, loc]);

  const hitAt = React.useCallback((cx, cy) => {
    const g = graph, cam = camRef.current, v = viewRef.current;
    if (!g || !cam || !v.W) return null;
    const px = cx * v.DPR, py = cy * v.DPR;
    const view = viewFor();
    if (mode === 'personal') {
      const p = personalRef.current;
      const i = pickPersonal(p && p.graph, railOpts(), px, py, 10 * v.DPR);
      if (i >= 0) return { kind: 'link', index: i };
      const ci = pickChapter(g, cam, view, px, py);
      return ci >= 0 ? { kind: 'chapter', chapterIndex: ci } : null;
    }
    const ci = pickChapter(g, cam, view, px, py);
    if (ci >= 0) {
      const zoomed = cam.ppv > 26 * v.DPR;
      if (zoomed) {
        const verse = pickVerse(g, cam, view, px, py);
        if (verse >= 0) return { kind: 'verse', verse };
      }
      return { kind: 'chapter', chapterIndex: ci };
    }
    const hit = pickArc(g, cam, view, px, py, 8 * v.DPR);
    return hit ? { kind: 'arc', hit } : null;
  }, [graph, viewFor, mode, railOpts]);

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

  const hover = React.useCallback((cx, cy) => {
    const found = describe(hitAt(cx, cy));
    const nextHover = found && found.kind === 'arc' ? found.index : -1;
    if (nextHover !== hoverRef.current) { hoverRef.current = nextHover; schedule(); }
    setTip(found ? { info: found, x: cx, y: cy } : null);
  }, [describe, hitAt, schedule]);

  const tap = React.useCallback((cx, cy) => {
    const found = describe(hitAt(cx, cy));
    if (!found) {
      focusRef.current = { arc: -1, range: null };
      hoverRef.current = -1;
      setTip(null); setDetail(null); schedule(); return;
    }
    focusRef.current = found.kind === 'arc'
      ? { arc: found.index, range: null }
      : { arc: -1, range: found.kind === 'chapter' ? [found.lo, found.hi] : [found.verse, found.verse] };
    hoverRef.current = -1;
    setTip(null);
    setDetail(found);
    setAnnounce(summaryOf(found));
    schedule();
  }, [describe, hitAt, schedule]);

  const doubleTap = React.useCallback((cx) => {
    const cam = camRef.current, v = viewRef.current;
    zoomAbout(cam, v.W, cx * v.DPR, 2.5, MAX_ZOOM);
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
    setDetail(null); setTip(null); schedule();
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
      if (detail || tip) { setDetail(null); setTip(null); focusRef.current = { arc: -1, range: null }; schedule(); }
      else if (onBack) onBack();
      return;
    } else return;
    e.preventDefault();
    clampCamera(cam, v.W, MAX_ZOOM);
    const centre = Math.round(cam.x);
    if (graph && centre >= 0 && centre < graph.total) setAnnounce(refOfVerse(graph, centre).label);
    schedule();
  }, [detail, tip, graph, onBack, resetView, schedule]);

  const cycleDensity = () => {
    const next = DENSITY_STEPS[(DENSITY_STEPS.indexOf(density) + 1) % DENSITY_STEPS.length];
    setDensity(next);
    flashHint(DENSITY_LABEL[next] + ' — ' + DENSITY_HINT[next]);
    if (typeof updateSetting === 'function') updateSetting('webDensity', next);
    if (typeof PlatformBridge !== 'undefined') PlatformBridge.haptic('light');
  };
  const cycleColor = () => {
    const next = COLOR_MODES[(COLOR_MODES.indexOf(colorMode) + 1) % COLOR_MODES.length];
    setColorMode(next);
    flashHint('Colour shows ' + COLOR_HINT[next]);
    if (typeof PlatformBridge !== 'undefined') PlatformBridge.haptic('light');
  };

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
        <button type="button" className="sw-btn" onClick={() => { setLoadError(null); ensureScriptureWebData(true); }}>Try again</button>
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
    <div className={'sw-root' + (rotated ? ' sw-rotated' : '')} ref={wrapRef}
      tabIndex={0} onKeyDown={onKeyDown}
      role="application"
      aria-label="The Scripture Web — an interactive map of cross-references">
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
            aria-pressed={mode === 'canonical'} onClick={() => setMode('canonical')}>Scripture</button>
          <button type="button" className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={() => setMode('personal')}>My web</button>
        </div>
        {mode === 'canonical' ? (
          <React.Fragment>
            <button type="button" className="sw-btn" onClick={cycleDensity}
              aria-label={'Density: ' + DENSITY_LABEL[density] + ' — ' + DENSITY_HINT[density]}>
              {DENSITY_LABEL[density]}
            </button>
            <button type="button" className="sw-btn" onClick={cycleColor}
              aria-label={'Colour shows ' + COLOR_HINT[colorMode]}>
              Colour · {COLOR_LABEL[colorMode]}
            </button>
          </React.Fragment>
        ) : (
          <button type="button" className="sw-btn" aria-pressed={showUnderlay}
            onClick={() => { setShowUnderlay(!showUnderlay); schedule(); }}
            aria-label="Show the connections the Volumes already make">
            Corpus links
          </button>
        )}
        <button type="button" className="sw-btn" onClick={resetView} aria-label="Reset the view">Reset</button>
      </div>

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
      {tip && <TipChip info={tip} />}
      {detail && (
        <DetailSheet info={detail} onClose={() => setDetail(null)} onOpen={openEndpoint} />
      )}

      <div className="sw-legend" aria-hidden="true">{legendFor(colorMode)}</div>
      <div className="sw-credit">Cross-references: OpenBible.info (CC-BY)</div>
      <div className="sw-live" role="status" aria-live="polite">{announce}</div>
    </div>
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

function TipChip({ info }) {
  const s = info.info;
  const style = {
    left: Math.min(info.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 800) - 300) + 'px',
    top: Math.min(info.y + 16, (typeof window !== 'undefined' ? window.innerHeight : 600) - 130) + 'px',
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

function DetailSheet({ info, onClose, onOpen }) {
  const cards = info.cards || [];
  const eyebrow = info.kind === 'link' ? 'Your link'
    : info.kind === 'arc' ? 'Connection'
    : info.kind === 'chapter' ? 'Chapter' : 'Verse';
  const meta = info.kind === 'arc'
    ? info.span.toLocaleString() + ' verses apart · weight ' + info.votes
    : info.kind === 'link' ? LINK_KIND_NAMES[info.joins]
    : info.kind === 'chapter'
      ? info.verses + ' verses · ' + info.connections.toLocaleString() + ' connections'
      : info.connections.toLocaleString() + ' connections';

  return (
    <div className="sw-sheet" role="dialog" aria-modal="false"
      aria-label={eyebrow + ' details'}>
      <button type="button" className="sw-sheet-close" onClick={onClose} aria-label="Close">
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
    : ep.type === 'study' ? 'Matthew Study Bible'
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
    shown += density === 'essential' ? b.off20 : density === 'classic' ? b.off10 : b.len;
  }
  return { shown, total: graph.count };
}

/** A LinkEndpoint's own label, falling back to its key. */
function endpointLabel(ep) {
  if (!ep) return '';
  return ep.label || ep.key || '';
}

function summaryOf(found) {
  if (found.kind === 'link') {
    return endpointLabel(found.source) + ' and ' + endpointLabel(found.target) + ', your link.';
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
