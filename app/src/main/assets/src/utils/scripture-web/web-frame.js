/* ═══════════════════════════════════════════════════════════════════════
   web-frame — the Scripture Web's frame and render arguments, pure.
   Cluster F (bundle-d since lz1), used by ui/scripture-web/use-web-camera.js.
   ═══════════════════════════════════════════════════════════════════════

   These were callbacks inside ScriptureWebScreen (the app's hottest file,
   one 1,166-line component), where the only witness to "where does the dome
   sit on a tall phone" or "what does the shader get told" was a browser walk
   (v15-code-health-06). They take the view, the camera and the mode as
   arguments and return plain objects, so web-frame.test.js pins them. */

import {
  fitPPV, localizeFactor, squashFactor, MAX_STRETCH, maxZoomFor,
} from './geometry.js';

/** @typedef {{ W: number, H: number, DPR: number }} View  device px, and the device pixel ratio */
/** @typedef {{ base: number, ceil: number, ruler: number }} Frame  device px */

/** Height reserved below the baseline for the ruler + book names, CSS px. */
export const RULER_H = 74;

/**
 * The zoom ceiling, from the frame rather than from a constant. 44 CSS px
 * per verse is the point past which nothing new can separate - every arc
 * leaving a verse shares one foot at every zoom - so the old fixed 4000 was
 * 247 CSS px per verse on a 1920 px desktop, 5.6x into a void, and about
 * right on a 375 px phone only by accident. 4000 is kept for the moment
 * before the graph lands.
 * @param {{ total: number } | null | undefined} graph
 * @param {View} v
 * @returns {number}
 */
export function maxZoomOf(graph, v) {
  return graph ? maxZoomFor(graph.total, (v.W || 1) / (v.DPR || 1)) : 4000;
}

/**
 * The vertical frame. On a wide screen the dome fills naturally; on a tall
 * one an unstretched semicircle would sit in the bottom quarter, so the
 * whole composition (dome + ruler) is CENTRED in the leftover height
 * instead of pinned to the bottom edge.
 * @param {View} v
 * @param {boolean} personal  My Web: two rails and no dome
 * @returns {Frame}
 */
export function webFrame(v, personal) {
  // A narrow screen puts the controls along the BOTTOM, so the ruler needs
  // to finish above them — reserve the control strip as well as its own
  // two label rows, or book names print underneath the buttons.
  const narrow = (v.W / (v.DPR || 1)) <= 560;
  // Wide screens reserve the legend/credit line too, or the staggered book
  // labels print straight through it (the "legends colliding" report).
  const ruler = (narrow ? RULER_H + 104 : RULER_H + 26) * v.DPR;
  const avail = v.H - ruler;
  if (personal) {
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
}

/**
 * What the web renderer is told for one frame (CONTRACTS.md §2). The focus
 * (focus-state.js) goes over as the renderer's own fields, read fresh from
 * focusRef every frame:
 *   focusArc       the chosen OpenBible arc, -1 when none, or when the chosen
 *                  thread is a prophecy pair (then focusProphecy names it) -
 *                  so no reader of focusArc can index g.from with a
 *                  prophecy index
 *   focusProphecy  the chosen prophecy pair's index in g.prophecy, or -1
 *   focusRange, focusRange2  the lit verse range and its chosen group
 *   hoverArc       the thread under a resting pointer, -1 (it dims nothing)
 *   lit, litKey    the lit arc ids (Int32Array or null) and their key; a
 *                  renderer uploads the set when litKey differs from the
 *                  key it last uploaded
 * The canon overlay reads the same object (paintCanonOverlay's fs.view).
 * @param {View} v
 * @param {{ ppv: number, y: number, total: number, x: number }} cam
 * @param {Frame} f  webFrame(v, …)
 * @param {import('./decode.js').Density} density
 * @param {Partial<import('./focus-state.js').Focus>} focus  focusRef.current
 */
export function webViewArgs(v, cam, f, density, focus) {
  const prophecy = !!focus.prophecy && focus.arc >= 0;
  return {
    width: v.W, height: v.H, base: f.base, ceil: f.ceil,
    squash: squashFactor(f.ceil, v.W),
    localize: localizeFactor(cam.ppv / fitPPV(cam, v.W)),
    // the camera's height, device px: the shader draws the baseline camY
    // below base and the picker reads the same off the camera
    camY: cam.y > 0 ? cam.y : 0,
    density, rulerDepth: f.ruler,
    focusArc: prophecy ? -1 : focus.arc, focusRange: focus.range,
    focusRange2: focus.range2 || null,
    focusProphecy: prophecy ? focus.arc : -1,
    hoverArc: focus.hover == null ? -1 : focus.hover,
    lit: focus.lit || null, litKey: focus.lit ? focus.litKey || '' : '',
  };
}

/**
 * @typedef {{ chapterIndex: number, book: number, chapter: number, x0: number, x1: number, t: number }} CentreChapter
 *   chapterIndex  into g.chapters; book: into g.books; chapter: its number (1-based)
 *   x0, x1        its canon x range, half-open: verse v spans [v, v + 1), so x0 is
 *                 its first verse id and x1 one past its last (verseToX maps both)
 *   t             the emphasis ease, 0..1: the GL draws the chapter's own arcs
 *                 at mix(1, CENTRE_BRIGHT, t) and the overlay the wash at t
 */

/**
 * The centre chapter (the Q2 lens replacement, spec §4.4) for one frame, or
 * null below the zoom where it applies. GL-owned: today it is the lens's
 * chapter (pick.lensRange, from 6x) with the lens's own log-zoom ease
 * (6x -> 24x); the GL stream adds the 15 % hysteresis and the canvas-area
 * centre. The overlay paints the band from it and dims nothing.
 * @param {any} g  the decoded graph
 * @param {[number, number] | null} lens  pick.lensRange(): the chapter's inclusive verse range
 * @param {number} zoom  as a multiple of fit
 * @returns {CentreChapter | null}
 */
export function centreOf(g, lens, zoom) {
  if (!g || !g.chapters || !g.chapterOfVerse || !lens || !(lens[0] <= lens[1])) return null;
  const chapterIndex = g.chapterOfVerse[lens[0]];
  const ch = g.chapters[chapterIndex];
  if (!ch) return null;
  return { chapterIndex, book: ch[0], chapter: ch[1], x0: ch[2], x1: ch[2] + ch[3], t: localizeFactor(zoom) };
}

/**
 * The frame the canon camera moves its y inside (geometry.YFrame).
 * @param {View} v
 * @param {Frame} f
 * @param {number} maxSpan  the widest thread's span, verses (decode.maxSpanOf)
 */
export function webYFrame(v, f, maxSpan) {
  return { base: f.base, ceil: f.ceil, squash: squashFactor(f.ceil, v.W), maxSpan };
}
