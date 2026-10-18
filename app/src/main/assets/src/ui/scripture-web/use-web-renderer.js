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
   frame loop's, use-frame-scheduler.js) always holds the latest draw.

   Per frame (GL step 2, E1-E3): the frame's visible set (frame-set.frameSet)
   is asked for once and gives the crowding law its anchored count; the
   renderer, the picker and the overlay's labels and pills find the same set.
   While the camera moves on a screen denser than GESTURE_DPR the GL backing
   shrinks to it, and the frame after the motion stops (GESTURE_HOLD_MS)
   redraws it whole; the overlay keeps full resolution. Nothing is copied per
   frame: the renderer's arguments and the overlay's frame are kept objects,
   the data-* attributes are written only when they change, and the rails'
   JSON for the walks (publishRails) is built only while a walk is running
   (walkOn). A resize keeps the zoom relative to fit and draws at once. */

import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { createCamera, clampCamera, fitPPV, ribbonStyle } from '../../utils/scripture-web/geometry.js';
import { footBundles } from '../../utils/scripture-web/pick.js';
import { frameSet } from '../../utils/scripture-web/frame-set.js';
import { maxZoomOf, centreOf, centreRange, tapFadeStep, TAP_FADE_MS } from '../../utils/scripture-web/web-frame.js';
import { focusState } from '../../utils/scripture-web/focus-state.js';
import { readChromeTokens } from '../../utils/scripture-web/palette.js';
import { ensureScriptureWebData } from '../../utils/scripture-web/web-data.js';
import { createRenderer, backingScale, backingSize } from './web-renderer.js';
import { paintCanonOverlay, paintMyWebOverlay, publishRails } from './overlay-renderer.js';
import { railFrame } from './rail-renderer.js';
import { onWebFontReady } from '../../utils/scripture-web/label-engine.js';

/** How long after the camera's last move a frame still counts as in a gesture (E2), ms. */
export const GESTURE_HOLD_MS = 150;

/** How far a device-pixel box may sit from the CSS box times the dpr (pixel snapping), device px. */
export const BOX_SNAP_PX = 2;

/**
 * Whether a browser walk is reading the frame (the walks set __swWalk; a driven
 * browser reports navigator.webdriver): the rails' JSON and the badge boxes are
 * published only then (E3).
 */
export function walkOn() {
  return typeof globalThis.__swWalk !== 'undefined'
    || (typeof navigator !== 'undefined' && navigator.webdriver === true);
}

/**
 * The convergence pills' counts: how many anchored threads have a foot in
 * each in-view foot cell (pick.footBundles), cached while the camera moves
 * less than 2 %; overlay-renderer.js draws them.
 */
function bundlesFor(cache, g, cam, view, v, density) {
  const moved = cache.W !== v.W || cache.density !== density
    || Math.abs(cam.ppv - cache.ppv) > cache.ppv * 0.02
    || Math.abs(cam.x - cache.x) * cam.ppv > v.W * 0.02;
  if (moved) {
    cache.W = v.W; cache.density = density; cache.ppv = cam.ppv; cache.x = cam.x;
    cache.cells = footBundles(g, cam, view, v.DPR);
  }
  return cache;
}

/**
 * Write an attribute (or, for a name starting --, a style property) only when its
 * value changed since the last write through the same cache (E3).
 * @param {HTMLElement} el
 * @param {{ el: HTMLElement | null, vals: Record<string, string> }} cache
 * @param {string} name @param {string} value
 */
export function putAttr(el, cache, name, value) {
  if (cache.el !== el) { cache.el = el; cache.vals = Object.create(null); }
  if (cache.vals[name] === value) return;
  cache.vals[name] = value;
  if (name.charCodeAt(0) === 45 && name.charCodeAt(1) === 45) el.style.setProperty(name, value);
  else el.setAttribute(name, value);
}
const put = putAttr;

/**
 * E2: one frame's step of the camera's motion. Records the camera and returns whether this frame is
 * in a gesture: the camera moved within GESTURE_HOLD_MS. The first frame is at rest.
 * @param {{ seen: boolean, x: number, y: number, ppv: number, movedAt: number }} motion
 * @param {{ x: number, y?: number, ppv: number }} cam
 * @param {number} now  ms
 * @returns {boolean}
 */
export function gestureStep(motion, cam, now) {
  if (!motion.seen || cam.x !== motion.x || cam.y !== motion.y || cam.ppv !== motion.ppv) {
    if (motion.seen) motion.movedAt = now;
    motion.seen = true; motion.x = cam.x; motion.y = cam.y; motion.ppv = cam.ppv;
  }
  return now - motion.movedAt < GESTURE_HOLD_MS;
}

/**
 * E2: the GL backing for a resize, device px: the ResizeObserver entry's device-pixel box when the
 * browser gives one (exact, no rounding of a fractional CSS size), the dpr is not clamped and the box
 * IS the CSS box at the dpr, within BOX_SNAP_PX (headless Chrome's device emulation reports CSS px
 * there, which put a 343 CSS px world on a 891 px phone); else the CSS box times the dpr, rounded.
 * @param {ResizeObserverEntry | null} entry
 * @param {number} raw - window.devicePixelRatio
 * @param {number} dpr - the frame's dpr (raw, at most 3)
 * @param {number} cssW @param {number} cssH - the canvas's CSS box
 * @returns {{ W: number, H: number }}
 */
export function backingOf(entry, raw, dpr, cssW, cssH) {
  const box = entry && raw <= 3 && entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
  const w = cssW * dpr, h = cssH * dpr;
  const exact = !!box && box.inlineSize > 0 && box.blockSize > 0
    && Math.abs(box.inlineSize - w) <= BOX_SNAP_PX && Math.abs(box.blockSize - h) <= BOX_SNAP_PX;
  return { W: exact ? box.inlineSize : Math.round(w), H: exact ? box.blockSize : Math.round(h) };
}

/**
 * E2: the zoom stays relative to fit across a resize or a dpr change. ppv and the camera's height are
 * device px and fit is the frame's width, so both scale by the width's ratio (the second camera too).
 * @param {{ ppv: number, y?: number }} cam
 * @param {{ ppv: number } | null} camV
 * @param {number} wasW @param {number} W - the backing's width before and after, device px
 */
export function keepZoom(cam, camV, wasW, W) {
  const k = wasW > 0 && W !== wasW ? W / wasW : 1;
  if (!(cam.ppv > 0) || k === 1) return;
  cam.ppv *= k;
  if (cam.y > 0) cam.y *= k;
  if (camV && camV.ppv > 0) camV.ppv *= k;
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
 * elevator's track, the pills drawn last frame, the overlay's last frame and
 * its tappable boxes for hitOverlay).
 *
 * Per frame it hands the renderer viewFor() (web-frame.webViewArgs: the
 * focus, hover and lit set included) and the canon overlay a CanonFrame with
 * the centre chapter (web-frame.centreOf) and the panel's inset
 * (panelInsetRef) on it (CONTRACTS.md §2, §5). slackFor (optional,
 * use-web-camera.js) is the camera clamp's room for the docked panel, which
 * the resize's clamp keeps as every other clamp does.
 * @param {any} p
 */
export function useWebRenderer({
  graph, mode, density, setLoadError, resumeRef, glRef, uiRef, wrapRef, topbarRef,
  camRef, camVRef, viewRef, focusRef, panelInsetRef, viewFor, zoomCapFor, yFrameFor,
  chromeRef, personalRef, railOpts, drawRef, schedule, capFractionNow, slackFor,
}) {
  // read by the resize, which lives in the GL effect and must not re-run for it
  const slackRef = React.useRef(slackFor);
  slackRef.current = slackFor;
  const [noWebGL, setNoWebGL] = React.useState(false);
  // without WebGL2 the screen shows the canon web as a list; My Web stays drawn (w3 item 31)
  const listShown = noWebGL && mode !== 'personal';
  const [glRetry, setGlRetry] = React.useState(0);
  const [railZoom, setRailZoom] = React.useState({ top: false, bottom: false });
  const railZoomRef = React.useRef(railZoom);
  const rendererRef = React.useRef(null);
  // the convergence pills: the counted cells, cached across frames while
  // the camera barely moves, and the boxes drawn last frame,
  // which the tap test reads before it reaches the lines
  const bundleRef = React.useRef({ W: 0, density: '', ppv: 0, x: 0, cells: [] });
  // E3: the renderer's arguments and the overlay's frame, filled in place every
  // frame; the data-* attributes' last values
  const argsRef = React.useRef(/** @type {any} */ ({}));
  const overlayFsRef = React.useRef(/** @type {any} */ ({ hits: [] }));
  const attrRef = React.useRef({ el: /** @type {HTMLElement | null} */ (null), vals: Object.create(null) });
  // E2: the camera as last drawn, when it last moved, and the settle frame's timer
  const motionRef = React.useRef({ seen: false, x: 0, y: 0, ppv: 0, movedAt: -1e9, timer: 0 });
  const badgeBoxesRef = React.useRef([]);
  // the elevator's track (device px box + the height its top stands for),
  // null when there is no sky to climb; the tap test reads it first
  const elevatorRef = React.useRef(null);
  // the canon overlay's last painted frame, with the boxes it made tappable
  // (fs.hits): hitOverlay reads it in the tap path; null on My Web
  const overlayFrameRef = React.useRef(null);
  // the centre chapter's range last frame (web-frame.centreRange holds it
  // while the centre stays near it); null on My Web and at the overview
  const centreRangeRef = React.useRef(null);
  // the tap's fade (web-frame.tapFadeStep): how far the rest of the web has
  // receded while a line is chosen; null until the first canon frame
  const tapFadeRef = React.useRef(/** @type {import('../../utils/scripture-web/web-frame.js').TapFade | null} */ (null));
  const reduceMotionRef = React.useRef(/** @type {MediaQueryList | null | undefined} */ (undefined));

  // E2: one frame at the full backing once the camera has been still for
  // GESTURE_HOLD_MS (one timer a gesture, re-armed while it lasts)
  const settleLater = React.useCallback(() => {
    const m = motionRef.current;
    if (m.timer) return;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const wait = () => {
      const left = m.movedAt + GESTURE_HOLD_MS - now();
      if (left > 0) { m.timer = window.setTimeout(wait, left + 1); return; }
      m.timer = 0;
      schedule();
    };
    m.timer = window.setTimeout(wait, GESTURE_HOLD_MS + 1);
  }, [schedule]);

  // ── the frame ───────────────────────────────────────────────────────────
  const draw = React.useCallback(() => {
    const g = graph, cam = camRef.current, r = rendererRef.current;
    const v = viewRef.current;
    // My Web draws in Canvas2D and needs no GL renderer (w3 item 31)
    if (!g || !cam || !v.W || (!r && mode !== 'personal')) return;
    const wrap = wrapRef.current;
    const attrs = attrRef.current;
    const zoom = cam.ppv / fitPPV(cam, v.W);
    /* The zoom's own input, published for the browser walks (the same line the
       scripture-web walk branch carries, so the two merge as one): a walk that
       reads pixels after "three zoom steps" must first know the steps took. */
    // My Web's world is exactly the frame: its camera has no y frame, so a
    // height carried over from the canon web is dropped here, not drawn —
    // before the attribute below, so the published height is the drawn one.
    if (mode === 'personal') clampCamera(cam, v.W, zoomCapFor(cam));
    // the centre chapter (spec 4.4, Q2): past the overview, the chapter under
    // the canvas area's centre (the frame less the open panel), held while the
    // centre stays near it. Its own arcs are emphasised; nothing else dims.
    // Computed once per frame: the renderer and the overlay get the same one.
    // My Web has none.
    const panel = panelInsetRef.current;
    const lens = mode === 'personal' ? null
      : centreRange(g, cam, v.W, (panel && panel.right > 0 ? panel.right : 0) * v.DPR, centreRangeRef.current);
    centreRangeRef.current = lens;
    if (wrap) {
      put(wrap, attrs, 'data-ppv-css', (cam.ppv / v.DPR).toPrecision(4));
      // the camera's height, device px, for the walks (0 at the baseline)
      put(wrap, attrs, 'data-cam-y', (cam.y > 0 ? cam.y : 0).toFixed(1));
      // the centre chapter's verse range, for the walks (the old lens's attribute)
      put(wrap, attrs, 'data-lens', lens ? lens[0] + '-' + lens[1] : '');
    }
    const camV = mode === 'personal' ? camVRef.current : null;
    if (camV) clampCamera(camV, v.W, zoomCapFor(camV));
    if (wrap && camV) put(wrap, attrs, 'data-ppv-vot', (camV.ppv / v.DPR).toPrecision(4));
    const chrome = chromeRef.current;
    const base = viewFor();
    const glc = glRef.current;
    if (mode === 'personal') {
      // My Web has no sky and no elevator: the canon track's box must not
      // survive the switch, or liftAt eats every tap and drag in the right
      // 24 CSS px of the rails (the l9-14 refuter's one FAIL, 02:4x).
      elevatorRef.current = null;
      overlayFrameRef.current = null;
      if (wrap) { put(wrap, attrs, 'data-elevator', ''); put(wrap, attrs, 'data-altitude', ''); put(wrap, attrs, 'data-altitude-span', ''); }
      // The personal web is Canvas2D over a cleared GL surface: hundreds of
      // links, not hundreds of thousands, so crisp 2D curves beat a second
      // shader. The GL surface is one clear to the ground colour (#10), at
      // the full backing.
      if (r) {
        if (glc && (glc.width !== v.W || glc.height !== v.H)) { glc.width = v.W; glc.height = v.H; }
        r.clear(chrome.bg);
      } else if (glRef.current) {
        // no WebGL2 (w3 item 31): the ground is the GL canvas's own CSS
        // background, the web's one dark ground in both themes
        glRef.current.style.background = chrome.bg;
      }
      const uic = uiRef.current;
      const ctx = uic && uic.getContext('2d');
      if (ctx) {
        const p = personalRef.current;
        const ro = railOpts();
        ro.hoverIndex = focusRef.current.hover;
        ro.focusIndex = focusRef.current.arc;
        // which list each indexes: the reader's links, or Timothy's notes (fix-review #4, #11)
        ro.hoverUnderlay = focusRef.current.hoverUnderlay;
        ro.focusUnderlay = focusRef.current.underlay;
        ro.capFraction = capFractionNow();
        // the walk's knob for the corridor pair (e2e-myweb-colour arm K): a
        // number here overrides the context's depth alpha ceiling; unset in the app
        ro.contextCeiling = typeof globalThis.__swContextCeiling === 'number' ? globalThis.__swContextCeiling : undefined;
        // the overlay (overlay-renderer.js): one clear, the links, the book names
        paintMyWebOverlay(ctx, { personal: p, g, cam, view: base, v, chrome, rail: ro });
        if (wrap) put(wrap, attrs, 'data-cap-fraction', String(ro.capFraction));
        // the rails' JSON is for the walks; the CSS the rails' chrome sits by is always set
        if (walkOn()) publishRails(ro, p, g, cam, camV, v, wrap);
        else if (wrap && ro && ro.width) {
          const rails = railFrame(v, ro.base);
          put(wrap, attrs, '--sw-rail-top', (rails.topY / v.DPR).toFixed(0) + 'px');
          put(wrap, attrs, '--sw-rail-bottom', (rails.bottomY / v.DPR).toFixed(0) + 'px');
        }
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
    // THE frame's visible set (frame-set.js; E1), asked once: the renderer
    // draws it and the picker, the labels and the pills find the same one.
    // Its anchored count (the shader's arcAnchored over the drawn feet) is the
    // crowding law's: every anchored thread is drawn, so it counts them all.
    const set = frameSet(g, cam, base);
    const perCssPx = base.localize > 0 ? set.anchored / ((v.W || 1) / (v.DPR || 1)) : 0;
    const style = ribbonStyle(zoom, base.localize, perCssPx);
    // the convergence pills: how many threads meet at each foot cell
    const bundles = bundlesFor(bundleRef.current, g, cam, base, v, density);
    const centre = centreOf(g, lens, zoom);
    // a tap makes the rest recede to TAP_CONTEXT, eased (GL item 5); never a hover
    const tapTarget = base.focusArc >= 0 || base.focusProphecy >= 0 || !!base.focusRange ? 1 : 0;
    if (reduceMotionRef.current === undefined) {
      reduceMotionRef.current = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    }
    const still = !!(reduceMotionRef.current && reduceMotionRef.current.matches);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tap = tapFadeStep(tapFadeRef.current, tapTarget, now, still ? 0 : TAP_FADE_MS);
    tapFadeRef.current = tap;
    if (tap.running) schedule();
    // E2: while the camera moves, a dense screen's GL backing keeps
    // GESTURE_DPR device px per CSS px; the frame after it settles is whole
    const moving = gestureStep(motionRef.current, cam, now);
    const scale = backingScale(v.DPR, moving);
    if (scale < 1) settleLater();
    const bw = backingSize(v.W, scale), bh = backingSize(v.H, scale);
    if (glc && (glc.width !== bw || glc.height !== bh)) { glc.width = bw; glc.height = bh; }
    // the renderer's arguments, filled in place (E3): the view (viewFor:
    // webViewArgs, the focus, hover and lit set with it), then the frame's own
    const args = argsRef.current;
    for (const k in base) args[k] = base[k];
    args.centre = centre; args.tapFade = tap.value;
    args.camX = cam.x; args.ppv = cam.ppv;
    args.strokeWidth = style.strokeWidthCss * v.DPR;
    args.alpha = style.alpha;
    args.voteMix = style.voteMix;
    args.dpr = v.DPR;
    args.density = density; args.bg = chrome.bg;
    args.scale = scale;
    r.draw(args);
    // the sky the labels may use starts under the top chrome (layout metrics,
    // so the rotated portrait root measures the same; 0 when the chrome is hidden)
    const tb = topbarRef.current;
    const inset = tb && tb.offsetHeight ? (tb.offsetTop + tb.offsetHeight) * v.DPR : 0;
    // the overlay (overlay-renderer.js): one clear, the ruler, the sky's
    // altitude ruler and elevator, the references beside the lines, the pills
    const uic = uiRef.current;
    // the overlay's frame, filled in place (E3); hitOverlay reads the last one
    const fs = overlayFsRef.current;
    fs.g = g; fs.cam = cam; fs.view = base; fs.v = v; fs.chrome = chrome;
    fs.canvasH = uic ? uic.height : 0; fs.inset = inset; fs.yFrame = yFrameFor(cam);
    // lens and lensDim stay on the frame until the overlay stops reading
    // them (CONTRACTS.md section 5): the centre's range, and 1, so its pills
    // dim nothing
    fs.density = density; fs.focusArc = base.focusArc; fs.bundles = bundles; fs.lens = lens; fs.lensDim = 1;
    // the centre chapter (GL computes it; the overlay paints its band) and
    // what the open panel covers (the panel writes it; labels keep out)
    fs.centre = centre; fs.panelInset = panelInsetRef.current;
    const painted = paintCanonOverlay(uic ? uic.getContext('2d') : null, fs);
    fs.hits = painted.hits;
    overlayFrameRef.current = fs;
    elevatorRef.current = painted.elevator;
    badgeBoxesRef.current = painted.badges;
    if (wrap) {
      put(wrap, attrs, 'data-altitude', painted.marks.join(','));
      put(wrap, attrs, 'data-altitude-span', painted.altitudeSpan > 0 ? String(painted.altitudeSpan) : '');
      put(wrap, attrs, 'data-elevator', painted.elevator ? painted.elevator.at.toFixed(4) : '');
      put(wrap, attrs, 'data-thread-labels', String(painted.labels));
      put(wrap, attrs, 'data-bundle-badges', String(painted.badges.length));
    }
    // the walk's window on the badges (device px boxes), like __swContextCeiling: unset in the app
    if (walkOn()) globalThis.__swBadgeBoxes = badgeBoxesRef.current;
  }, [graph, camRef, viewRef, mode, zoomCapFor, camVRef, viewFor, density, focusRef, yFrameFor, railOpts, capFractionNow,
    chromeRef, personalRef, topbarRef, uiRef, wrapRef, glRef, panelInsetRef, schedule, settleLater]);

  React.useEffect(() => { drawRef.current = draw; schedule(); }, [draw, schedule, drawRef]);
  // the settle timer goes with the screen
  React.useEffect(() => () => {
    const m = motionRef.current;
    if (m.timer) { clearTimeout(m.timer); m.timer = 0; }
  }, []);
  // the canvas's face arriving changes every width: one more frame (nothing else holds this one)
  React.useEffect(() => onWebFontReady(schedule), [schedule]);

  // ── size + renderer lifecycle ───────────────────────────────────────────
  // listShown is a dep (#3): the list unmounts the canvases, so the renderer
  // that drew on them is disposed with them rather than outliving them, and
  // the effect waits, idle, for Try again (glRetry) to bring a canvas back.
  // My Web without WebGL2 shows no list (w3 item 31): it keeps its canvases,
  // and the effect sets up the camera and the size with no renderer.
  React.useEffect(() => {
    if (!graph || listShown) return;
    const glc = glRef.current, uic = uiRef.current;
    if (!glc || !uic) return;
    let renderer = null;
    let disposed = false;
    let lossTimer = 0;
    const build = () => createRenderer(glc, graph, {
      // After a GPU reset every GL object is dead. Rebuild the whole
      // renderer on the same (restored) context and repaint — this is what
      // turns the on-device "wash-out until app restart" into a blink.
      // A rebuild that throws (a shader that will not link on the restored
      // context) or gets no context lands the reader on the list
      // (WebFallbackList), never on a dead canvas with nothing to say (#1).
      onContextRestored: () => {
        if (lossTimer) { window.clearTimeout(lossTimer); lossTimer = 0; }
        if (disposed) return;
        const dead = renderer;
        renderer = null;
        rendererRef.current = null;
        try { if (dead) dead.dispose(); } catch (_e) { /* already dead */ }
        let next = null;
        try { next = build(); } catch (_e) { next = null; }
        if (!next) { setNoWebGL(true); return; }
        renderer = next;
        rendererRef.current = next;
        schedule();
      },
      // A loss Chrome never restores (it gives up after repeated resets)
      // otherwise leaves the instrument permanently dead with no report —
      // draw() just returns silently forever. Give a restore ~3s, then
      // fall back to the list (WebFallbackList), the face the "unavailable"
      // path shows too, whose Try again rebuilds via glRetry.
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
    // No WebGL2: the canon web is read as a list (the screen's fallback), but
    // My Web is Canvas2D, so the camera and the canvas size are set up all the
    // same and its frame draws without a renderer (w3 item 31).
    if (!renderer) setNoWebGL(true);
    rendererRef.current = renderer;
    if (!camRef.current) {
      const back = resumeRef.current;
      if (back && back.cam && back.cam.total === graph.total) {
        camRef.current = Object.assign({}, back.cam);
        // the place comes back, the pointer's hover does not
        focusRef.current = focusState(Object.assign({}, back.focus, { hover: -1, hoverProphecy: -1, hoverUnderlay: false }));
      } else {
        camRef.current = createCamera(graph.total);
      }
    }

    /** @param {ResizeObserverEntry[]} [entries] */
    const resize = (entries) => {
      const raw = window.devicePixelRatio || 1;
      const dpr = Math.min(raw, 3);
      // E2: the backing from the device-pixel box when the browser gives it
      // (exact device px, no rounding of a fractional CSS size), else rounded
      const entry = entries && entries.length ? entries[entries.length - 1] : null;
      const { W, H } = backingOf(entry, raw, dpr, glc.clientWidth, glc.clientHeight);
      if (!W || !H) return;
      const was = viewRef.current;
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
      // E2: the zoom stays relative to fit across a resize or a dpr change
      // (ppv and the camera's height are device px; fit is the frame's width)
      keepZoom(cam, camVRef.current, was ? was.W : 0, W);
      if (!(cam.ppv > 0)) cam.ppv = fitPPV(cam, W);
      // with the y frame: a frame that grew cannot leave y above the new ceiling
      clampCamera(cam, W, maxZoomOf(graph, viewRef.current), yFrameFor(cam),
        typeof slackRef.current === 'function' ? slackRef.current(cam) : 0);
      // a resize is not a gesture: the camera it leaves is the one last drawn
      const m = motionRef.current;
      m.x = cam.x; m.y = cam.y; m.ppv = cam.ppv;
      // the canvas was just cleared by its new size: draw now, in this
      // callback, so the frame never shows blank between layout and paint
      if (entries) drawRef.current(); else schedule();
    };
    resize();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
    if (ro) {
      // the device-pixel box where the browser has it (a dpr change resizes the backing too)
      try { ro.observe(glc, { box: 'device-pixel-content-box' }); } catch (_e) { ro.observe(glc); }
    }
    // without an observer the window's resize event stands in (an Event, not entries: schedule the frame)
    const onWindowResize = () => resize();
    if (!ro) window.addEventListener('resize', onWindowResize);
    const onRestored = () => schedule();
    glc.addEventListener('webglcontextrestored', onRestored);

    return () => {
      disposed = true;
      if (lossTimer) window.clearTimeout(lossTimer);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onWindowResize);
      glc.removeEventListener('webglcontextrestored', onRestored);
      // null after a restore that could not rebuild (#1)
      if (renderer) renderer.dispose();
      renderer = null;
      rendererRef.current = null;
    };
  }, [graph, listShown, schedule, glRetry, yFrameFor, camRef, camVRef, viewRef, focusRef, glRef, resumeRef, setLoadError, uiRef,
    wrapRef, drawRef]);

  // the no-WebGL list's Try again: a fresh renderer on a fresh root
  const retryGL = React.useCallback(() => { setNoWebGL(false); setGlRetry((n) => n + 1); }, []);
  return { noWebGL, glRetry, retryGL, railZoom, elevatorRef, badgeBoxesRef, overlayFrameRef };
}
