/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/geometry — Cluster F (esbuild bundle-f.js)

   THE height law and the camera, in one place.

   The GPU draws each cross-reference as a ribbon along a curve and the CPU
   hit-tests the same curve analytically. Those two must agree to the pixel
   or arcs become untappable exactly where they look tappable. So the law
   lives here once, in a form both sides consume: the vertex shader inlines
   `arcShapeGLSL` verbatim, and pick.js calls arcShape / arcHeightAt.

   THE STRUCTURE LAW (lanes/myweb/out/structure-law.md, 2026-09-21). Corbin,
   on the live build: "I want to be able to see all the lines ... the smear
   was because lines stacked up and became fully horizontal and formed a
   'sky'". Every law before this one BOUNDED a thread's height (a tanh
   ceiling at 1.15 x the frame, then four lifted bands), and a bounded
   height over a span longer than a few frames is a LEVEL run: ten thousand
   of them stack into that sky, and a level run translated along x is
   itself ("lines don't move when I pan"). So the law is the fit dome's own
   at every zoom: a thread is the half-ellipse of its own span, R = rx and
   A = rx x squash, and zoom is a magnifying glass on the dome. A thread
   arches inside the frame iff its span fits the frame's width in verses; a
   longer one leaves through the top, never level; the sky's altitude IS
   span (k ceilings up, only threads spanning more than k frame-widths
   pass), so panning up walks out through nearby, book, testament and canon
   with no band drawn anywhere, and nothing hidden: the sky is sparse by
   geometry alone. A verse's threads leave from points spread across the
   verse's own cell in the order of their far ends (footX), so a sheaf is a
   sheaf and not one stem.

   The second law here is the fly-over fade: at depth an arc with neither
   foot near the viewport recedes to FLYOVER_FLOOR (never zero), and the
   picker applies the same test (`flyOverGLSL`; arcAnchored + flyOverDim).
   ═══════════════════════════════════════════════════════════════════════ */

/** Zoom (× fit) at which the semicircle→ceiling crossover starts and ends. */
export const LOCALIZE_START = 6;
export const LOCALIZE_END = 24;

/**
 * How far the semicircle→ceiling crossover has progressed, and how strongly
 * fly-over arcs are faded. 0 at overview, 1 once zoomed well in.
 * @param {number} zoom — current scale as a multiple of fit-to-width
 * @returns {number} 0..1
 */
export function localizeFactor(zoom) {
  if (!(zoom > LOCALIZE_START)) return 0;
  const t = (Math.log2(zoom) - Math.log2(LOCALIZE_START)) /
            (Math.log2(LOCALIZE_END) - Math.log2(LOCALIZE_START));
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * How far a portrait frame may stretch the dome above a true semicircle.
 * On a landscape screen the factor is < 1 and the dome is gently squashed to
 * fit, exactly like the source visualization. On a phone held upright,
 * half the screen's WIDTH is nowhere near its height, so an unstretched
 * semicircle would sit in the bottom quarter with dead space above it — the
 * dome is allowed to rise into a taller arch instead. Capped so it can never
 * become a noodle: at the limit it reads as a gothic arch, not a thread.
 */
export const MAX_STRETCH = 2.2;

/**
 * Vertical squash applied so the widest arc fills the frame.
 * @param {number} ceil — usable height above the baseline, device px
 * @param {number} width — viewport width, device px
 */
export function squashFactor(ceil, width) {
  if (!(width > 0)) return 1;
  return Math.min(MAX_STRETCH, ceil / (width / 2));
}

/** CSS px per verse at which one verse is a comfortable tap target. */
export const PPV_MAX_CSS = 44;

/**
 * The zoom ceiling, as a RELATION rather than a constant: the reader may
 * zoom until one verse is PPV_MAX_CSS wide, and no further, because past that
 * nothing new can separate - every arc leaving a verse shares one foot at
 * every zoom, so more magnification only zooms into a void.
 *
 * @param {number} total - verses in the canon
 * @param {number} widthCss - viewport width in CSS px
 * @returns {number} multiple of fit-to-width
 */
export function maxZoomFor(total, widthCss) {
  const w = widthCss > 0 ? widthCss : 1;
  const t = total > 0 ? total : 1;
  const z = (PPV_MAX_CSS * t) / w;
  return z > 1 ? z : 1;
}

/**
 * An arc's span on a log scale against the canon: 0 for a one-verse arc, 1
 * for one spanning the whole canon. The shader computes the same value from
 * aFrom/aTo and uTotal.
 *
 * @param {number} span - |to - from| in verses
 * @param {number} total
 * @returns {number} 0..1
 */
export function spanLogOf(span, total) {
  const t = total > 1 ? total : 2;
  const s = span > 1 ? span : 1;
  const k = Math.log(s) / Math.log(t);
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/**
 * Alpha every anchored ribbon reaches at the ceiling. The worst Distance stop
 * needs an effective 0.83 on black and 0.85 on parchment to clear WCAG's 3:1
 * non-text floor alone (design-perf, from the ramp and relative luminance).
 */
export const ALPHA_DEEP = 0.90;

/**
 * Anchored arcs per CSS px of viewport width at which the deep alpha starts
 * being divided down. 0.20 clamps to 1 at every frame's ceiling (0.157-0.176
 * measured), so D1 is untouched by the exponent whatever it is.
 */
export const DENSITY_K = 0.20;

/**
 * How hard crowding divides the deep alpha. 0.5 (a square root) was the first
 * cut and it left D2's 40x band missed in the UP direction on every frame -
 * measured, not predicted: phoneLand ink contrast p50 2.81 -> 3.72 (+32 %),
 * desktop 1.39 -> 2.50 (+80 %). Most of that is the new geometry concentrating
 * the same ink into steep rises rather than the style law, but on desktop the
 * law genuinely brightened (alpha 0.271 against main's 0.19).
 *
 * 0.57 divides by 6.49 / 10.07 / 3.92 at 40x on phoneLand / phone375 /
 * desktop1920 instead of 5.16 / 7.59 / 3.32. THE CEILING CANNOT MOVE: there
 * `per / DENSITY_K` is below 1 on every frame, so the clamp wins whatever the
 * exponent, which is what makes this one lever and not two.
 */
export const DENSITY_EXP = 0.57;

/** Widest stroke, CSS px. At depth votes drive width from 1.4 up to this. */
export const STROKE_DEEP_CSS = 2.4;

/** Narrowest stroke at depth, CSS px - the floor a 0.30-strength arc gets. */
export const STROKE_MIN_CSS = 1.4;

/**
 * The alpha and stroke law, as ONE export both the screen and the probes
 * read. It used to live inline in ScriptureWebScreen's draw(), where no
 * harness could import it, so every instrument re-typed it and would have
 * silently measured the old law against a new screen.
 *
 * Under the density law (`lod` true; geometry.js "The density law, part 1")
 * the overview alpha ramp no longer applies: it was written for sixty
 * thousand ribbons summing into a dome, and the law now draws a few hundred
 * at the overview and a few dozen at 12x, each of which must be seen alone.
 * So every drawn ribbon takes the deep alpha divided by the crowding of what
 * is DRAWN (countAnchored with the level), and votes drive width at every
 * zoom; the stroke still grows with zoom as before. Measured before this:
 * the 12x picture on Psalm 107 was eighty separable lines at alpha 0.175 -
 * a ghost of a web (lanes/myweb/out/look-density, 2026-09-21).
 *
 * @param {number} zoom - multiple of fit-to-width
 * @param {number} localize - localizeFactor()
 * @param {boolean} light - parchment theme
 * @param {number} anchoredPerCssPx - anchored arcs per CSS px of viewport width
 * @param {boolean} [lod] - the density law is on: the deep law at every zoom
 * @returns {{alpha:number, strokeWidthCss:number, voteMix:number}}
 */
export function ribbonStyle(zoom, localize, light, anchoredPerCssPx, lod = false) {
  const l2 = Math.log2(zoom > 0 ? zoom : 1);
  const alpha = Math.min(0.075 + l2 * 0.028, light ? 0.42 : 0.19);
  const strokeWidthCss = Math.min(0.9 + l2 * 0.16, STROKE_DEEP_CSS);
  const t = lod ? 1 : smoothstep(0.55, 1, localize);
  if (!(t > 0)) return { alpha, strokeWidthCss, voteMix: 0 };
  // Crowding, not zoom, is what decides whether the deep value washes: at the
  // ceiling ~0.17 anchored arcs share each CSS px of width and almost nothing
  // overlaps, so each ribbon is drawn alone and needs the full value; at 40x
  // there are thirty times as many and the same value would be a neon fog.
  const per = anchoredPerCssPx > 0 ? anchoredPerCssPx : 0;
  const crowd = Math.max(1, Math.pow(per / DENSITY_K, DENSITY_EXP));
  const deep = ALPHA_DEEP / crowd;
  return {
    alpha: alpha + (deep - alpha) * t,
    // under the law the stroke keeps its zoom ramp: 2.4 px hairlines at the
    // overview would be a wall of their own
    strokeWidthCss: lod ? strokeWidthCss : strokeWidthCss + (STROKE_DEEP_CSS - strokeWidthCss) * t,
    voteMix: t,
  };
}

/**
 * The piece of an arc worth tessellating, in device px.
 *
 * At overview this is the whole arc, so the 1x frame cannot move. As the
 * reader localizes it closes onto the viewport, because a 440,000 px arc
 * spending 47 of its 48 segments off screen is what draws the visible piece
 * as one straight chord. Clipping changes only WHERE the samples land, never
 * the curve they land on.
 *
 * @param {number} x0 @param {number} x1 - feet, device px
 * @param {number} width - viewport width, device px
 * @param {number} localize - localizeFactor()
 * @returns {[number, number]} the parameter window, device px
 */
export function visibleWindow(x0, x1, width, localize) {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const a = lo + (Math.max(lo, -CLIP_MARGIN) - lo) * localize;
  const b = hi + (Math.min(hi, width + CLIP_MARGIN) - hi) * localize;
  return [a, b < a ? a : b];
}

/** How far outside the viewport the tessellation window still reaches. */
export const CLIP_MARGIN = 32;
/**
 * Most segments one draw may use. It binds only on wide frames: phoneLand at
 * its ceiling asks for 68. At 96 the desktop ceiling still drew a 24.4 CSS px
 * segment against S3's 24, so the cap was what missed the target, not the law.
 */
export const SEGMENT_CAP = 128;

/** Farthest a drawn chord may stray from the true curve, CSS px. */
export const CHORD_TOL_CSS = 0.5;

/** Longest on-screen straight segment we aim for, CSS px. */
export const SEGMENT_TARGET_CSS = 16;

/**
 * Segments to tessellate one draw range with: enough that no on-screen
 * piece of any arc in the range shows a chord. At overview it is the
 * asset's own count, so the 1x frame cannot move. Localized, the parameter
 * runs over the piece the window holds (visibleWindow) and two rules bound
 * the count. (1) LENGTH: no on-screen segment longer than
 * SEGMENT_TARGET_CSS over what the frame can hold of an arc - the window's
 * width plus a leg's height at each end. (2) CURVATURE: sampling uniformly
 * in the parameter, a step of dTau strays at most max(R, A) dTau^2 / 8
 * from its chord; over a window narrower than the arc the parameter range
 * shrinks as the arc widens (acos(1 - w/r) past r = w/2), so the bound is
 * the arc the window just holds, pi sqrt(max(1, squash) w / (16 tol)),
 * whatever the range's widest span. A leg steeper than the frame is
 * straight to within a pixel and needs nothing more.
 *
 * @param {number} bucketSegments - the asset's own per-bucket count
 * @param {number} localize - localizeFactor()
 * @param {number} maxRx - largest half-span in the range, device px
 * @param {number} ceil - usable height above the baseline, device px
 * @param {number} width - viewport width, device px
 * @param {number} dpr - device pixel ratio, so the targets are in CSS px
 * @param {number} squash - squashFactor()
 * @returns {number}
 */
export function segmentsFor(bucketSegments, localize, maxRx, ceil, width, dpr, squash) {
  const base = bucketSegments > 0 ? bucketSegments : 8;
  if (!(localize > 0)) return base;
  const d = dpr > 0 ? dpr : 1;
  const r = maxRx > 0 ? maxRx : 0;
  const s = squash > 0 ? squash : 1;
  const win = width + 2 * CLIP_MARGIN;
  const leg = Math.min(ceil, r * s);
  const byLength = Math.ceil((Math.min(2 * r, win) + 2 * leg) / d / SEGMENT_TARGET_CSS);
  const tol = CHORD_TOL_CSS * d;
  const rEff = Math.min(r, win / 2);
  const byCurve = Math.ceil(Math.PI * Math.sqrt((Math.max(1, s) * rEff) / (8 * tol)));
  const want = byLength > byCurve ? byLength : byCurve;
  const capped = want < 8 ? 8 : (want > SEGMENT_CAP ? SEGMENT_CAP : want);
  const n = Math.round(base + (capped - base) * localize);
  return n < 8 ? 8 : n;
}
/**
 * THE drawn curve of a thread, as two radii: R, the horizontal radius (half
 * its span on screen) and A, its apex height, R x squash. The half-ellipse
 * of its own span at EVERY zoom: the fit dome's law, and zoom a magnifying
 * glass on it (the structure law, above). MUST stay identical to arcShape
 * in arcShapeGLSL.
 *
 * @param {number} rx - half the arc's on-screen span, device px
 * @param {number} squash - squashFactor(): the frame's own aspect
 * @returns {{R:number, A:number}}
 */
export function arcShape(rx, squash) {
  const r = rx > 0 ? rx : 0;
  const s = squash > 0 ? squash : 1;
  return { R: r, A: r * s };
}

/**
 * Parameter (0..pi, the ellipse's angle from the left foot) at a given x -
 * the inverse of arcPointAt, so a caller can clip the parameter range to
 * the part of the arc that is on screen. MUST stay identical to arcTau in
 * arcShapeGLSL.
 */
export function arcTauOf(x, left, right) {
  const rx = (right - left) / 2;
  if (!(rx > 0)) return 0;
  return Math.acos(clamp1(1 - (x - left) / rx));
}

/**
 * The point on the curve at parameter tau and the tangent the ribbon
 * offsets along - in SCREEN space, where y runs down: the curve is
 * (x, base - h), so its tangent is (dx, -dh). The ribbon's normal is that
 * turned a quarter, and a tangent read in height space instead (dx, +dh)
 * is off by twice the slope's angle: the ribbon thins to nothing where the
 * curve runs at 45 degrees (the refuter, 2026-09-22 00:1x). MUST stay
 * identical to arcAt in arcShapeGLSL.
 * @returns {{x:number, h:number, tx:number, ty:number}} x, height above the baseline, the screen tangent
 */
export function arcPointAt(tau, left, right, A) {
  const r = right - left > 0 ? (right - left) / 2 : 0;
  return { x: left + r * (1 - Math.cos(tau)), h: A * Math.sin(tau), tx: r * Math.sin(tau), ty: -A * Math.cos(tau) };
}

/**
 * Height of the drawn curve at x - the analytic form of arcPointAt that the
 * hit test and the label placer need. The two are ONE curve
 * (structure-law.test.js walks arcPointAt and checks this at every sample).
 * @param {number} x - device px
 * @param {number} left @param {number} right - the feet
 * @param {number} A - apex height from arcShape()
 */
export function arcHeightAt(x, left, right, A) {
  const rx = (right - left) / 2;
  if (!(rx > 0) || !(A > 0)) return 0;
  const u = clamp1((left + rx - x) / rx);
  return A * Math.sqrt(1 - u * u);
}

/** -1..1 */
function clamp1(v) { return v < -1 ? -1 : (v > 1 ? 1 : v); }
/**
 * A JS number as a GLSL float literal -- the ONE door every constant passes
 * through on its way into a shader template below.
 *
 * GLSL ES 3.00 has no int->float conversion, so `${X}` with X = 1 emits
 * `float f = 1;` and the shader fails to compile. Measured by the Verifier
 * through the real compiler (ANGLE): FLYOVER_FLOOR = 0.35 links; = 1 fails
 * with "cannot convert from 'const int' to 'highp float'"; and = 1.0 fails
 * IDENTICALLY, because String(1.0) is '1'. The value's own spelling cannot
 * be trusted, so the literal is formatted here. A `${X}.` suffix is the same
 * trap from the other side: right only while X stays whole (0.35. is not
 * GLSL). glsl-float.test.js keeps every interpolation routed through this.
 */
export function glslFloat(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error('glslFloat: not a finite number: ' + String(n));
  }
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/**
 * The same two laws as GLSL ES 3.00, for the vertex shader to inline. Kept
 * beside their JS originals so the pair can never drift apart unnoticed;
 * web-renderer.test.js asserts the shader contains this text verbatim.
 *
 * arcTau inverts x -> parameter, so the shader can spend its segments on the
 * piece of the arc that is ON SCREEN. arcAt is the curve and its tangent.
 */
export const arcShapeGLSL = `
vec2 arcShape(float rx, float squash){
  float r = max(rx, 0.);
  float s = squash > 0. ? squash : 1.;
  return vec2(r, r*s);
}
float arcTau(float x, float left, float right){
  float rx = (right - left)*.5;
  if (rx <= 0.) return 0.;
  return acos(clamp(1. - (x - left)/rx, -1., 1.));
}
void arcAt(float tau, float left, float right, float A, out float x, out float h, out vec2 tg){
  float r = max((right - left)*.5, 0.);
  x = left + r*(1. - cos(tau));
  h = A*sin(tau);
  tg = vec2(r*sin(tau), -A*cos(tau));
}`;
/**
 * Height of a QUARTER above the baseline, `d` px in from its foot: the
 * quarter-ellipse both feet stand on. Past R it reads A, the join; the run
 * between the joins is arcHeightAt's dome, not this. arcDistance hit-tests
 * the quarters with it and the vertex shader draws them with its twin.
 *
 * @param {number} d - distance in x from the foot, device px
 * @param {number} R - this foot's quarter radius from arcShape()
 * @param {number} A - apex height from arcShape()
 */
export function arcHeight(d, R, A) {
  if (!(R > 0) || !(A > 0)) return 0;
  const s = d <= 0 ? 0 : (d >= R ? 1 : d / R);
  const u = 1 - s;
  return A * Math.sqrt(1 - u * u);
}
/**
 * How far outside the viewport a foot may sit and still count as anchoring
 * its arc to the passage on screen. Device px, matching uRes.x's frame.
 */
export const FLYOVER_MARGIN = 24;

/**
 * The alpha a fly-over settles at once the reader has localized. NEVER ZERO.
 *
 * It used to fall from 0.10 to exactly 0 at full depth, so that hundreds of
 * long arcs' flattened apexes stopped smearing the view -- and the owner met
 * the other face of that law: "what you're trying to zoom into and tap
 * disappears as you get closer" (2026-09-10). Zooming into a line's middle is
 * exactly what carries both its feet out of the frame, so the line being
 * chased became a fly-over and vanished on arrival. The owner's rule: a line
 * crossing the viewport must not vanish as zoom increases.
 *
 * 0.35 is a first setting, not a measured optimum: visibly present and
 * tappable on a thin line over black, still clearly below an anchored arc so
 * the clutter case survives in a weaker form. design-perf tunes it with the
 * S-metrics they already hold. The literal rule ("never decrease with zoom")
 * is satisfiable only by deleting fly-over dimming altogether, because zoom is
 * what turns an anchored arc into a fly-over; this keeps the dimming and bans
 * the disappearance.
 */
export const FLYOVER_FLOOR = 0.35;

/**
 * 1 when either foot of an arc is within `margin` of the viewport, else 0.
 * An exact JS mirror of the shader's `step()` pair — GLSL's step(e, x) is
 * `x >= e ? 1 : 0`, so both edges are inclusive here too.
 *
 * @param {number} x0 — left foot, device px
 * @param {number} x1 — right foot, device px
 * @param {number} width — viewport width, device px (the shader's uRes.x)
 * @param {number} [margin]
 * @returns {0|1}
 */
export function arcAnchored(x0, x1, width, margin = FLYOVER_MARGIN) {
  const near = (x) => (x >= -margin && x <= width + margin ? 1 : 0);
  return /** @type {0|1} */ (Math.max(near(x0), near(x1)));
}

/**
 * The alpha multiplier the shader applies to a fly-over: 1 while the reader
 * is at overview, falling to FLYOVER_FLOOR as they localize, and NO FURTHER.
 * It no longer reaches 0 -- see FLYOVER_FLOOR for why -- so the shader's
 * `dim <= 0` cull is never fed by this law, and every fly-over stays
 * pickable at its on-screen midpoint.
 *
 * MUST stay identical to flyOverGLSL below and to the shader that inlines it.
 *
 * @param {number} anchored — arcAnchored(), 0 or 1
 * @param {number} localize — localizeFactor()
 */
export function flyOverDim(anchored, localize) {
  const floored = FLYOVER_FLOOR + (1 - FLYOVER_FLOOR) * anchored;
  return 1 + (floored - 1) * localize;
}

/** GLSL's smoothstep, for the two laws that must mirror the shader exactly. */
function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/**
 * The same two functions as GLSL ES 3.00, for the vertex shader to inline.
 * Kept beside their JS twins so the pair can never drift apart unnoticed.
 */
export const flyOverGLSL = `
float arcAnchored(float x0, float x1, float width){
  float m = ${glslFloat(FLYOVER_MARGIN)};
  return max(step(-m, x0)*step(x0, width + m),
             step(-m, x1)*step(x1, width + m));
}
float flyOverDim(float anchored, float localize){
  float flyFloor = ${glslFloat(FLYOVER_FLOOR)};
  return mix(1., mix(flyFloor, 1., anchored), localize);
}`;

/* ── The density law, part 1: level of detail (density-law.md section 1, 2026-09-21) ──
 *
 * Corbin, on a Psalm 107 screenshot at mid zoom: "I don't want any smear.
 * Fully granular, zoom all the way in". At 12x on that chapter 13,295
 * anchored threads and 8,635 fly-overs crossed the phone frame and every one
 * was drawn: overlapping ribbons summed into a wall. This law decides, per
 * thread and per zoom, whether it is DRAWN AT ALL; nothing about alpha
 * changes, and what is not drawn is not drawn.
 *
 * The zoom is read as a LEVEL: L = log2(ppvCss * total / LOD_REF_CSS), the
 * octaves above a reference frame LOD_REF_CSS wide showing the whole canon.
 * The ceiling is one level on every frame (maxZoomFor puts a verse at
 * PPV_MAX_CSS everywhere): log2(44 * 31102 / 800) = 10.74.
 *
 * ANCHORED threads (a foot within FLYOVER_MARGIN of the frame) each carry a
 * REVEAL level r, and draw iff L >= r. decode.lodOf computes r by a greedy
 * per FOOT CELL: at level L a cell is total / 2^(L+1) verses (half a
 * reference view); walking the threads in vote order, a thread is accepted
 * once a cell holding one of its feet still has ink budget for its
 * on-screen length, and every thread accepted at a lower level is charged
 * first, so the drawn set only grows with zoom (the 09-10 rule: a line
 * crossing the viewport never vanishes as zoom increases). Every thread is
 * revealed by the ceiling at the latest: fully granular there.
 *
 * FLY-OVER threads (both feet out) draw iff they are their group's
 * REPRESENTATIVE - the strongest thread among those of like span and like
 * centre (decode.lodOf's group key) - so a sky of eight thousand crossings
 * reads as a few dozen lines, each standing for a bundle the badge names.
 *
 * The tapped, hovered and focus-range threads are always drawn, whatever the
 * table says: the line being chased must not vanish on arrival.
 *
 * The shader inlines lodGLSL; pick.js calls lodShown. Same table, same test.
 */

/** Reference frame width, CSS px: level 0 is the whole canon across it. */
export const LOD_REF_CSS = 800;

/** Reference frame height, CSS px, for the ink budget (phone landscape's dome). */
export const LOD_REF_HEIGHT_CSS = 260;

/**
 * THE taste number: the share of the reference frame's area the drawn
 * anchored ribbons may cover, at every level. Corbin may move it.
 */
export const LOD_INK = 0.25;

/** Stroke the budget is priced at, CSS px (ribbonStyle's mid-zoom width). */
export const LOD_STROKE_CSS = 1.6;

/** Longest on-screen length a thread is charged, px: a long arc shows two quarters at most. */
export const LOD_LEN_CAP = 900;

/** Shortest length a drawn thread is charged, px: a dot still takes ink. */
export const LOD_LEN_MIN = 8;

/** The greedy walks levels in these steps, from LOD_MIN_LEVEL to the ceiling. */
export const LOD_STEP = 0.25;
export const LOD_MIN_LEVEL = -2;

/** Reveal levels are stored in sixteenths of an octave above LOD_MIN_LEVEL (8 bits). */
export const LOD_QUANT = 16;

/** The level that switches the law OFF (a view without one): every thread drawn. */
export const LOD_OFF = -1000;

/**
 * Corbin, 2026-09-21 21:21, on the live fit view: "This looks terrible, I
 * want to be able to see all the lines." Every ANCHORED thread (a foot on
 * the screen) is drawn at every zoom, whatever its reveal level says. The
 * tables are kept and still computed, so the budget can return as a
 * setting; only the fly-over law (one representative per group) still
 * hides anything, and the screen applies it only in the panned-up sky.
 */
export const LOD_ANCHORED_ALWAYS = true;

/** Fly-over groups: span cells across the log-span axis. */
export const LOD_SPAN_CELLS = 48;

/**
 * Stand-ins per frame, at most: a fly-over group whose representative does
 * not cross this frame while its members do would have no line and no
 * badge (the refuter, 2026-09-21: 18 of 73 groups at the ceiling), so the
 * screen names each such group's strongest crossing member and the shader
 * draws those too (uStandIn). Biggest groups first when there are more.
 */
export const STANDIN_MAX = 32;

/**
 * The zoom as a level: octaves above the reference frame.
 * @param {number} ppvCss - CSS px per verse
 * @param {number} total - verses in the canon
 */
export function levelOf(ppvCss, total) {
  const p = ppvCss > 0 ? ppvCss : 1e-9;
  return Math.log2((p * (total > 0 ? total : 1)) / LOD_REF_CSS);
}

/**
 * The packed table entry decoded: is this thread drawn at this level?
 * bits 0-7 reveal (famous), 8-15 reveal (essential), 16 rep (famous), 17 rep
 * (essential). MUST stay identical to lodGLSL below.
 *
 * @param {number} lod - decode.lodOf(g).lod[i]
 * @param {boolean} essential - the Essential density
 * @param {0|1|boolean} anchored - arcAnchored()
 * @param {number} level - levelOf(), or LOD_OFF
 * @returns {0|1}
 */
export function lodShown(lod, essential, anchored, level) {
  if (!(level > LOD_OFF + 1)) return 1;
  const rev = essential ? (lod >>> 8) & 255 : lod & 255;
  const rep = essential ? (lod >>> 17) & 1 : (lod >>> 16) & 1;
  if (anchored) return LOD_ANCHORED_ALWAYS || level >= rev / LOD_QUANT + LOD_MIN_LEVEL ? 1 : 0;
  return /** @type {0|1} */ (rep);
}

/** The same test as GLSL ES 3.00, for the vertex shader to inline. */
export const lodGLSL = `
float lodShown(uint lod, float essential, float anchored, float level){
  if (level <= ${glslFloat(LOD_OFF + 1)}) return 1.;
  uint rev = essential > .5 ? ((lod >> 8u) & 255u) : (lod & 255u);
  uint rep = essential > .5 ? ((lod >> 17u) & 1u) : ((lod >> 16u) & 1u);
  float reveal = float(rev)/${glslFloat(LOD_QUANT)} + ${glslFloat(LOD_MIN_LEVEL)};
  return anchored > .5 ? max(${glslFloat(LOD_ANCHORED_ALWAYS ? 1 : 0)}, step(reveal, level)) : float(rep);
}`;

/**
 * Distance in device px from a point to an arc, or Infinity if the point is
 * outside the arc's bounding box. The curve is arcHeightAt's ellipse,
 * written implicitly as F = (v/A)^2 + u^2 - 1 with v the height above the
 * baseline and u = (cx - x)/rx; the first-order distance |F| / |grad F| is
 * exact ON the curve and accurate within a few px of it - the only place a
 * hit test ever asks.
 *
 * @param {number} px @param {number} py - query point, device px, y down
 * @param {number} x0 @param {number} x1 - the feet on the baseline
 * @param {number} base - baseline y, device px (the camera's y already added)
 * @param {number} A - apex height from arcShape()
 * @param {number} tol - hit tolerance, device px
 */
export function arcDistance(px, py, x0, x1, base, A, tol) {
  const rx = (x1 - x0) * 0.5;
  if (rx <= 0.25) return Infinity;
  const cx = x0 + rx;
  if (px < cx - rx - tol || px > cx + rx + tol) return Infinity;
  const v = base - py;
  if (!(A > 0) || v < -tol || v > A + tol) return Infinity;
  const u = (cx - px) / rx;
  const f = (v / A) * (v / A) + u * u - 1;
  const gx = (-2 * u) / rx;
  const gy = (2 * v) / (A * A);
  const gm = Math.hypot(gx, gy);
  if (gm < 1e-9) return Infinity;
  return Math.abs(f) / gm;
}

/**
 * The camera: an affine map from verse index to device px along x, plus a
 * vertical offset. Pure data + pure functions — the screen owns the instance
 * and mutates `x`/`y`/`ppv` imperatively during gestures (no React state per
 * frame, per the GardenView doctrine).
 *
 * `y` is how far the picture is shifted DOWN the frame, device px: the
 * baseline draws at base + y, so a positive y is the reader looking up into
 * the sky above the arches. Device px, like x: a height is span x ppv x
 * squash / 2, and it scales with the zoom as x does (zoomAbout).
 *
 * The y axis is opt-in per camera. A caller that hands clampCamera/zoomAbout
 * a `yf = {base, ceil, squash, maxSpan}` frame gets y clamped to the sky the
 * law actually has; a caller that hands none has a 1-D camera whose y is
 * held at 0 — absence is the signal, so a My Web rail that never asked for
 * height can never drift off its baseline.
 */
export function createCamera(total) {
  return { x: total / 2, y: 0, ppv: 0, total };
}

/** Pixels-per-verse at which the whole canon exactly fills the viewport. */
export function fitPPV(cam, width) { return width / cam.total; }

/**
 * @typedef {{base:number, ceil:number, squash:number, maxSpan:number}} YFrame
 *   base — the baseline row, device px from the canvas top (the frame's top
 *   edge is `base` above the baseline); ceil, squash — the law's frame;
 *   maxSpan — the widest thread's span, verses (decode.maxSpanOf).
 */

/**
 * The tallest apex any thread reaches at this camera, device px above the
 * baseline: the widest thread's crown, rx x squash (A is linear in rx, so
 * the widest thread is the tallest).
 * @param {{ppv:number, total:number}} cam @param {YFrame} yf
 */
export function apexMaxPx(cam, yf) {
  return arcShape((yf.maxSpan * cam.ppv) / 2, yf.squash).A;
}

/**
 * The highest the camera may go: the tallest apex just reaches the frame's
 * top. At the overview the dome fills the frame and this is 0 - nothing to
 * pan, honestly, like a map at its bounds; at zoom z the sky is about z
 * ceilings tall (the canon thread's crown), so the reader can walk out to
 * the widest threads and no further.
 * @param {{ppv:number, total:number}} cam @param {YFrame} yf
 */
export function maxCamY(cam, yf) {
  const top = apexMaxPx(cam, yf) - yf.base;
  return top > 0 ? top : 0;
}

/**
 * Clamp zoom into [fit, maxZoom×fit], pan so the canon can't leave the
 * viewport, and hold y inside [0, maxCamY] — or at 0 when the caller has no
 * y frame. Mutates in place — this runs per gesture frame.
 *
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {number} width — viewport width, device px
 * @param {number} maxZoom — multiple of fit
 * @param {YFrame} [yf] - absent: a 1-D camera
 */
export function clampCamera(cam, width, maxZoom, yf) {
  const min = fitPPV(cam, width);
  const max = min * (maxZoom || 5000);
  if (!(cam.ppv > 0)) cam.ppv = min;
  cam.ppv = Math.min(Math.max(cam.ppv, min), max);
  const half = width / cam.ppv / 2;
  cam.x = (half * 2 >= cam.total) ? cam.total / 2
    : Math.min(Math.max(cam.x, half), cam.total - half);
  const top = yf ? maxCamY(cam, yf) : 0;
  cam.y = !(cam.y > 0) ? 0 : (cam.y > top ? top : cam.y);
  return cam;
}

/** Verse index → device px. */
export function verseToX(cam, width, verse) {
  return (verse - cam.x) * cam.ppv + width / 2;
}

/** Device px → verse index (fractional). */
export function xToVerse(cam, width, x) {
  return (x - width / 2) / cam.ppv + cam.x;
}

/**
 * Where a thread's foot stands: inside its verse's own cell, in the order
 * of its far end. A verse's n threads take the n slots decode.fansOf
 * ranks (-0.5..0.5, 0 for a lone thread, which stands at the centre), so a
 * sheaf leaves as a sheaf and the thread to the leftmost far end leaves
 * leftmost. Below a pixel per verse the spread is invisible and the fit
 * picture is unchanged. The shader computes the same from aFanA / aFanB.
 *
 * @param {{x:number, ppv:number}} cam @param {number} width - device px
 * @param {number} verse @param {number} fan - this foot's rank, -0.5..0.5
 */
export function footX(cam, width, verse, fan) {
  return verseToX(cam, width, verse + 0.5 + (fan || 0));
}

/**
 * Map viewport pointer coords into a screen that has been CSS-rotated 90°
 * clockwise into landscape (transform-origin top left, translateY(-100%)).
 * Layout metrics ignore transforms, so the rotated screen's own x axis runs
 * down the physical screen: local x = clientY, local y = physicalWidth − clientX.
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} physicalWidth — window.innerWidth (the portrait width)
 * @returns {{x:number, y:number}}
 */
export function rotatePointer(clientX, clientY, physicalWidth) {
  return { x: clientY, y: physicalWidth - clientX };
}

/**
 * Zoom about a fixed screen point - the anchor stays under the finger or
 * cursor. Heights scale with the zoom (A is linear in ppv), so with an
 * anchorY and the camera already in the sky the world height under the
 * pointer stays under it too; at rest (y = 0) the baseline is sticky, and
 * without an anchorY the height is kept and re-clamped (zooming out to fit
 * closes the sky either way).
 * @param {number} anchorX — device px to hold still
 * @param {number} factor — multiplicative zoom (>1 zooms in)
 * @param {YFrame} [yf] - the y frame, when the camera has one
 * @param {number} [anchorY] - device px from the frame's top to hold still, in the sky
 */
export function zoomAbout(cam, width, anchorX, factor, maxZoom, yf, anchorY) {
  const verse = xToVerse(cam, width, anchorX);
  const min = fitPPV(cam, width);
  const max = min * (maxZoom || 5000);
  const ppv0 = cam.ppv > 0 ? cam.ppv : min;
  const ppv1 = Math.min(Math.max(ppv0 * factor, min), max);
  const y0 = cam.y > 0 ? cam.y : 0;
  cam.ppv = ppv1;
  if (yf && y0 > 0 && typeof anchorY === 'number') {
    cam.y = (ppv1 / ppv0) * (yf.base + y0 - anchorY) + anchorY - yf.base;
  }
  clampCamera(cam, width, maxZoom, yf);
  cam.x = verse - (anchorX - width / 2) / cam.ppv;
  return clampCamera(cam, width, maxZoom, yf);
}
