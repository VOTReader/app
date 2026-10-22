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
  fitPPV, localizeFactor, squashFactor, MAX_STRETCH, deepZoomFor, flightCapFor, LOCALIZE_START,
} from './geometry.js';
import { CENTRE_BRIGHT, CENTRE_WIDTH } from './sw-ink.js';

/** @typedef {{ W: number, H: number, DPR: number }} View  device px, and the device pixel ratio */
/** @typedef {{ base: number, ceil: number, ruler: number }} Frame  device px */

/** Height reserved below the baseline for the ruler + book names, CSS px. */
export const RULER_H = 74;
/** The canon web's ruler on a tall wide frame (a PC), CSS px: the baseline at H - 180, the
    depth of r2-01a's band (its baseline to its foot, 184 of 941 px), so the overview's bars and
    names fill it with no black above or below the names (w4 review 2: at the build spec's
    H - 212 the band ran 177 px to the legend where r2-01a's runs 134). The deep-zoom band
    (chapter numerals, verse ticks and numerals, the cited dots; +175 natural) closes its gaps
    to fit above the legend line (stackRows). Phones and My Web keep RULER_H.
    Ratified in w5: the band lane's c694842d8 set it outside its own file list (it rides with
    the OV_PC change), and the w4 integration kept it (lanes/sweb/out/w4/integration.md). */
export const RULER_PC = 180;

/**
 * The zoom ceiling, from the frame rather than from a constant: the verse zoom (geometry
 * deepZoomFor), one verse VERSE_FILL of the frame's width. It was the tap rule's 44 CSS px a verse
 * while every arc leaving a verse was thought to share one foot; they do not (footX spreads them
 * across the verse's cell), so past 44 each link separates into its own leg and label, and the
 * reader may go on to a single linked verse (Corbin 2026-10-21). 4000 is kept for the moment
 * before the graph lands.
 * @param {{ total: number } | null | undefined} graph
 * @param {View} v
 * @returns {number}
 */
export function maxZoomOf(graph, v) {
  return graph ? deepZoomFor(graph.total, (v.W || 1) / (v.DPR || 1)) : 4000;
}

/**
 * The deepest a flight lands on this frame (geometry.flightCapFor): the tap rule (44 CSS px a
 * verse), or the camera's zoom now when the reader is deeper. 4000 before the graph lands.
 * @param {{ total: number } | null | undefined} graph
 * @param {View} v
 * @param {{ ppv: number, total: number } | null | undefined} cam
 * @returns {number}
 */
export function flightCapOf(graph, v, cam) {
  if (!graph) return 4000;
  const w = v.W || 1;
  const zoom = cam && cam.ppv > 0 ? cam.ppv / (w / graph.total) : 1;
  return flightCapFor(graph.total, w / (v.DPR || 1), zoom);
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
  const tall = (v.H / (v.DPR || 1)) > 500;
  const ruler = (narrow ? RULER_H + 104 : !personal && tall ? RULER_PC : RULER_H + 26) * v.DPR;
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
 *   focusRange     the lit verse range, [lo, hi] or null (one range: the
 *                  group pair, focusRange2, went in w5)
 *   hoverArc       the thread under a resting pointer, -1 (it dims nothing)
 *   hoverProphecy  the prophecy pair under it when no arc is, -1
 *   lit, litKey    the lit arc ids (Int32Array or null) and their key; a
 *                  renderer uploads the set when litKey differs from the
 *                  key it last uploaded
 *   dpr            v.DPR, so the picker and the overlay find the renderer's
 *                  visible set (frame-set.frameSet)
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
    // device px per CSS px: the renderer, the picker and the overlay ask the
    // frame's visible set (frame-set.frameSet) with the same numbers (E1)
    dpr: v.DPR,
    density, rulerDepth: f.ruler,
    focusArc: prophecy ? -1 : focus.arc, focusRange: focus.range,
    focusProphecy: prophecy ? focus.arc : -1,
    hoverArc: focus.hover == null ? -1 : focus.hover,
    hoverProphecy: focus.hoverProphecy == null ? -1 : focus.hoverProphecy,
    lit: focus.lit || null, litKey: focus.lit ? focus.litKey || '' : '',
  };
}

/**
 * @typedef {{ chapterIndex: number, book: number, chapter: number, x0: number, x1: number, t: number }} CentreChapter
 *   chapterIndex  into g.chapters; book: into g.books; chapter: its number (1-based)
 *   x0, x1        its canon x range, half-open: verse v spans [v, v + 1), so x0 is
 *                 its first verse id and x1 one past its last (verseToX maps both)
 *   t             the emphasis ease, 0..1: the GL draws the chapter's own arcs
 *                 at centreEmphasis(t) and the overlay the wash at t
 */

/** The centre chapter's hold (spec §4.4): a chapter stays the centre while the canvas area's
 * centre is within it widened by this share each side, so a pan that grazes a boundary does not
 * flicker the emphasis. The share is of the chapter's width or of the frame's, whichever is
 * narrower: 15 % of Psalm 119 is 26 verses, more than the whole frame at the ceiling. */
export const CENTRE_HOLD = 0.15;

/**
 * The centre chapter's inclusive verse range for one frame (spec §4.4; CONTRACTS.md §5): the
 * chapter under the canvas area's centre (the frame less the open panel on the right, so the
 * chapter the reader sees mid-picture is the one emphasised), from LOCALIZE_START; null at the
 * overview, where the dome is the picture. `prev`, last frame's range, is kept while that centre
 * stays within it widened by CENTRE_HOLD.
 * @param {any} g  the decoded graph
 * @param {{ x: number, ppv: number, total: number }} cam
 * @param {number} width  the frame, device px
 * @param {number} insetRight  what the open panel covers on the right, device px (0 when none)
 * @param {[number, number] | null} prev  last frame's centreRange, or null
 * @returns {[number, number] | null}
 */
export function centreRange(g, cam, width, insetRight, prev) {
  if (!g || !g.chapters || !g.chapters.length || !g.chapterOfVerse || !(g.total > 0)) return null;
  if (!(width > 0) || !(cam && cam.ppv > 0)) return null;
  if (!(cam.ppv / fitPPV(cam, width) >= LOCALIZE_START)) return null;
  const inset = insetRight > 0 && insetRight < width ? insetRight : 0;
  // the canon x under the canvas area's centre: (width - inset) / 2 on screen
  const cx = cam.x - inset / (2 * cam.ppv);
  if (prev && prev[0] <= prev[1]) {
    const hold = CENTRE_HOLD * Math.min(prev[1] + 1 - prev[0], (width - inset) / cam.ppv);
    if (cx >= prev[0] - hold && cx < prev[1] + 1 + hold) return prev;
  }
  const v = Math.floor(cx);
  if (!(v >= 0) || v >= g.total) return null;
  const ci = g.chapterOfVerse[v];
  const ch = g.chapters[ci];
  if (!ch) return null;
  return [ch[2], ch[2] + ch[3] - 1];
}

/**
 * The centre chapter's emphasis on its own arcs (a foot inside it) at ease t: alpha x bright and
 * width x width, both eased from 1 so no + press is a jump (C20). Its LOCAL arcs: the ease is
 * scaled by the thread's centre shortness (geometry.centreShortness: 10 to 56 verses, the w4 reach,
 * inside the span-ink plateau's), so a long leg through the chapter keeps the
 * hairline every long leg has and its 1-4 chapter arches are inked like any other. The shader's
 * twin is in web-renderer.js (uCentreT, cT); the rest of the web is left exactly as it is.
 * @param {number} t  CentreChapter.t, 0..1
 * @param {number} [shortness]  the thread's geometry.centreShortness, 1 (a local arc) by default
 * @returns {{ bright: number, width: number }}
 */
export function centreEmphasis(t, shortness = 1) {
  const s = shortness > 0 ? (shortness < 1 ? shortness : 1) : 0;
  const k = (t > 0 ? (t < 1 ? t : 1) : 0) * s;
  return { bright: 1 + (CENTRE_BRIGHT - 1) * k, width: 1 + (CENTRE_WIDTH - 1) * k };
}

/**
 * The centre chapter (the Q2 lens replacement, spec §4.4) for one frame, or
 * null below the zoom where it applies. `lens` is the chapter's inclusive
 * verse range: centreRange() (the canvas area's centre, with the hold), or
 * pick.lensRange() (the frame's centre, no hold). t is localizeFactor(zoom),
 * the log-zoom ease from 6x to full at 24x. GL draws the chapter's own arcs
 * at centreEmphasis(t); the overlay paints the band from it; nothing dims.
 * @param {any} g  the decoded graph
 * @param {[number, number] | null} lens  the chapter's inclusive verse range
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

/** How long the rest of the web takes to recede to TAP_CONTEXT when a line is tapped, and to
 * come back when it is let go, ms (GL item 5). */
export const TAP_FADE_MS = 180;

/**
 * @typedef {{ value: number, from: number, target: number, t0: number, running: boolean }} TapFade
 *   value   how far the rest of the web has receded, 0 (all of it at full ink) .. 1 (at TAP_CONTEXT)
 */

/**
 * One frame of the tap's fade: the rest of the web recedes while a line, a pair or a range is
 * chosen, and comes back when it is let go, eased over `ms` (0 under reduced motion: a jump). A
 * change of target mid-fade starts from where the fade is, so a quick tap-and-close never jumps.
 * Hover is never a target (it dims nothing, C3). Pure: returns the next state.
 * @param {TapFade | null} prev  last frame's, or null for the first
 * @param {number} target  1 while something is chosen, else 0
 * @param {number} now  ms (performance.now)
 * @param {number} [ms]  the fade's length, TAP_FADE_MS by default
 * @returns {TapFade}
 */
export function tapFadeStep(prev, target, now, ms) {
  const goal = target > 0 ? 1 : 0;
  const len = ms == null ? TAP_FADE_MS : ms;
  // the first frame starts where it should be: a web that opens with a choice is already receded
  if (!prev) return { value: goal, from: goal, target: goal, t0: now, running: false };
  let s = prev;
  if (goal !== prev.target) s = { value: prev.value, from: prev.value, target: goal, t0: now, running: true };
  if (!s.running) return s;
  const k = len > 0 ? Math.min(1, Math.max(0, (now - s.t0) / len)) : 1;
  const e = k * k * (3 - 2 * k);
  const value = s.from + (s.target - s.from) * e;
  return { value: k >= 1 ? s.target : value, from: s.from, target: s.target, t0: s.t0, running: k < 1 };
}
