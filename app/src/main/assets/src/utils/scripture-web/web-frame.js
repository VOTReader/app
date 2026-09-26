/* ═══════════════════════════════════════════════════════════════════════
   web-frame — the Scripture Web's frame and render arguments, pure.
   Cluster F (bundle-f), used by ui/scripture-web/use-web-camera.js.
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
 * What the web renderer is told for one frame.
 * @param {View} v
 * @param {{ ppv: number, y: number, total: number, x: number }} cam
 * @param {Frame} f  webFrame(v, …)
 * @param {import('./decode.js').Density} density
 * @param {{ arc: number, range: any, range2?: [number, number] | null }} focus
 */
export function webViewArgs(v, cam, f, density, focus) {
  return {
    width: v.W, height: v.H, base: f.base, ceil: f.ceil,
    squash: squashFactor(f.ceil, v.W),
    localize: localizeFactor(cam.ppv / fitPPV(cam, v.W)),
    // the camera's height, device px: the shader draws the baseline camY
    // below base and the picker reads the same off the camera
    camY: cam.y > 0 ? cam.y : 0,
    density, rulerDepth: f.ruler,
    focusArc: focus.arc, focusRange: focus.range,
    focusRange2: focus.range2 || null,
  };
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
