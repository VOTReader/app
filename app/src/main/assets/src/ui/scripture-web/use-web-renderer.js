/* ═══════════════════════════════════════════════════════════════════════
   useWebRenderer — the Scripture Web's graph, colours and WebGL renderer.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18):
     useWebGraph      the graph asset, loaded once (web-data.js), and Try again
     useChromeTokens  the canvas's colours, re-read when the theme flips
     useWebRenderer   the renderer's lifecycle (build, resize, context loss
                      and restore, the camera's first place) and the frame's
                      draw: the GL threads (web-renderer.js) and the 2D
                      overlay (overlay-renderer.js), with the data-* attributes
                      the walks read
   The draw reads per-frame refs, never React state per frame; drawRef (the
   frame loop's, use-frame-scheduler.js) always holds the latest draw. */

import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { createCamera, clampCamera, fitPPV, ribbonStyle, lensShareAt } from '../../utils/scripture-web/geometry.js';
import { countAnchored, footBundles, lensRange } from '../../utils/scripture-web/pick.js';
import { maxZoomOf } from '../../utils/scripture-web/web-frame.js';
import { readChromeTokens } from '../../utils/scripture-web/palette.js';
import { ensureScriptureWebData } from '../../utils/scripture-web/web-data.js';
import { createRenderer } from './web-renderer.js';
import { paintCanonOverlay, paintMyWebOverlay, publishRails } from './overlay-renderer.js';

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

/**
 * The graph asset: null until it is decoded; loadError when it cannot be
 * (or when the renderer throws, through setLoadError). retryLoad is the
 * error panel's Try again.
 */
export function useWebGraph() {
  const [graph, setGraph] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [dataRetry, setDataRetry] = React.useState(0);

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

  const retryLoad = React.useCallback(() => { setLoadError(null); setDataRetry((n) => n + 1); }, []);
  return { graph, loadError, setLoadError, retryLoad };
}

/**
 * The chrome tokens the canvases paint with (readChromeTokens), in a ref the
 * draw reads per frame.
 * @param {string|undefined} theme  settings.theme, so the in-app toggle re-reads
 * @param {() => void} schedule
 */
export function useChromeTokens(theme, schedule) {
  const chromeRef = React.useRef(readChromeTokens());
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
  return chromeRef;
}

/**
 * The renderer and the frame's draw. Everything it reads per frame comes in
 * as refs and identity-stable callbacks (the cameras' hook, the frame loop,
 * the screen's own refs); what it returns is the no-WebGL state and its Try
 * again, the rail-zoom pills' state, and the boxes the tap test reads (the
 * elevator's track, the pills drawn last frame).
 * @param {any} p
 */
export function useWebRenderer({
  graph, mode, density, setLoadError, resumeRef, glRef, uiRef, wrapRef, topbarRef,
  camRef, camVRef, viewRef, focusRef, viewFor, zoomCapFor, yFrameFor,
  chromeRef, personalRef, hoverRef, railOpts, drawRef, schedule, capFractionNow,
}) {
  const [noWebGL, setNoWebGL] = React.useState(false);
  const [glRetry, setGlRetry] = React.useState(0);
  const [railZoom, setRailZoom] = React.useState({ top: false, bottom: false });
  const railZoomRef = React.useRef(railZoom);
  const rendererRef = React.useRef(null);
  const anchoredRef = React.useRef({ ppv: 0, x: 0, W: 0, density: '', value: 0 });
  // the convergence pills: the counted cells, cached across frames while
  // the camera barely moves, and the boxes drawn last frame,
  // which the tap test reads before it reaches the lines
  const bundleRef = React.useRef({ key: '', cells: [] });
  const badgeBoxesRef = React.useRef([]);
  // the elevator's track (device px box + the height its top stands for),
  // null when there is no sky to climb; the tap test reads it first
  const elevatorRef = React.useRef(null);

  // ── the frame ───────────────────────────────────────────────────────────
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
  }, [graph, camRef, viewRef, mode, zoomCapFor, camVRef, viewFor, density, focusRef, yFrameFor, railOpts, capFractionNow,
    chromeRef, hoverRef, personalRef, topbarRef, uiRef, wrapRef]);

  React.useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule, drawRef]);

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
  }, [graph, schedule, glRetry, yFrameFor, camRef, viewRef, focusRef, glRef, resumeRef, setLoadError, uiRef, wrapRef]);

  // the no-WebGL list's Try again: a fresh renderer on a fresh root
  const retryGL = React.useCallback(() => { setNoWebGL(false); setGlRetry((n) => n + 1); }, []);
  return { noWebGL, glRetry, retryGL, railZoom, elevatorRef, badgeBoxesRef };
}
