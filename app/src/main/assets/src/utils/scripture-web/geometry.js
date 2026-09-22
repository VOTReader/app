/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/geometry — Cluster F (esbuild bundle-f.js)

   THE height law and the camera, in one place.

   The GPU draws each cross-reference as a half-ellipse ribbon and the CPU
   hit-tests the same curve analytically. Those two must agree to the pixel or
   arcs become untappable exactly where they look tappable. So the law lives
   here once, in a form both sides consume: the vertex shader inlines
   `arcRadiusGLSL` verbatim, and pick.js calls `arcRadiusY`.

   The law itself: at overview an arc is a TRUE semicircle (globally squashed
   to fit the viewport), which is what gives the canon its dome. As you zoom
   in, arcs would tower far off-screen, so the radius crosses over to a soft
   `tanh` ceiling that saturates at the top of the view — every apex stays
   reachable at every zoom. `localize` (0 at overview → 1 zoomed in) drives
   the crossover, and the same factor fades arcs merely flying overhead.

   TWO laws live here now, for the same reason. The fly-over fade is the
   second: at full localize it reaches zero, so an arc with neither foot near
   the viewport is not on the screen at all, and the picker must agree or it
   focuses something invisible. `flyOverGLSL` is the shader's copy;
   `arcAnchored` + `flyOverDim` are pick.js's.

   The bent re-cut (2026-09-20, the spine paper §2). Past 24x an arc was a
   quarter at each foot and a LEVEL run between them, and every thread
   leaving a verse in one span band shared the quarter. Corbin, on the live
   build: "a huge portion of lines don't move when I pan horizontally" (a
   level run translated along x is itself) and "still cannot pan up" (the
   camera had no y). Three changes, each a RED in bent-law.test.js:
     (a) the run is a DOME — height A·(1 + DOME·localize·cos²(πv/2)) along
         it, C1 at both joins — so every on-screen body has slope somewhere;
         below 6x localize is 0 and the overview is untouched;
     (b) each FOOT's departure rank (decode.fansOf) sets its own quarter,
         R = ceil·k·(1 + SPREAD·fan): a verse's n threads leave in n quarters;
     (c) the camera gains y, in device px, clamped so the tallest apex just
         reaches the frame's top — 0 at the overview, honestly.
   ═══════════════════════════════════════════════════════════════════════ */

/** Ceiling softness: larger = arcs stay circular longer before flattening. */
export const CEIL_SOFTNESS = 1.9;

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
 * Segments to tessellate one draw range with.
 *
 * @param {number} bucketSegments - the asset's own per-bucket count
 * @param {number} localize - localizeFactor()
 * @param {number} maxRx - largest half-span in the range, device px
 * @param {number} ceil - usable height above the baseline, device px
 * @param {number} width - viewport width, device px
 * @param {number} dpr - device pixel ratio, so the target is in CSS px
 * @param {number} [spanLog] - spanLogOf() of the range's widest span; 1 when
 *   omitted, which reads the widest quarter (the least conservative run)
 * @returns {number}
 */
export function segmentsFor(bucketSegments, localize, maxRx, ceil, width, dpr, spanLog = 1) {
  const base = bucketSegments > 0 ? bucketSegments : 8;
  if (!(localize > 0)) return base;
  const d = dpr > 0 ? dpr : 1;
  // Two shapes bound the range. The WIDEST quarter any foot can draw (the
  // fan's top rank widens a quarter by a quarter, and a wider ellipse bends
  // more per parameter step) bounds the curvature; the NARROWEST (the fan's
  // bottom rank) leaves the longest run, and the run is where the parameter
  // is spent. A is the same at every fan. The range's own spanLog, not 1:
  // with 1 a span-7 bucket's quarter reads 512 px where the arc draws 150,
  // its 316 px run vanishes from the estimate, and the dome on it draws
  // 0.55 CSS px of chord against the 0.5 promise (the Architect's refutation
  // pin, 2026-09-20).
  const shape = arcShape(maxRx, ceil, 1, 1, spanLog, 0.5);
  const narrow = arcShape(maxRx, ceil, 1, 1, spanLog, -0.5);
  // (1) LENGTH: no on-screen segment longer than the target. The tallest this
  // range can reach on screen comes from the same apex law the shader draws
  // with, not from a second estimate of it.
  const apex = Math.min(ceil, shape.A);
  const runCss = (Math.min(2 * maxRx, width + 2 * CLIP_MARGIN) + apex) / d;
  const byLength = Math.ceil(runCss / SEGMENT_TARGET_CSS);
  // (2) CURVATURE: a short arc is a whole semi-ellipse in half a screen, so it
  // needs segments the length rule does not ask for. Sampling uniformly in the
  // parameter, a step of dTau strays at most |p''| dTau^2 / 8 from its chord,
  // and |p''| <= max(R, A) on a quarter. Measured, not assumed: without this a
  // 2-verse arc at the ceiling reads 0.835 CSS px of chord error on the
  // 8-segment floor. On the RUN the dome bends A * DOME * pi^2 / 2 per
  // parameter step at its fullest, which is the arc whose run is exactly its
  // two quarters (rx = 2R: the taper holds the figure there for every
  // shorter run, the cos^2 falls off as 1/run^2 past it), so the run's bound
  // is that figure at the A of THAT arc, not of the range's widest — the
  // widest arc's dome is spread over a run hundreds of quarters long.
  const tol = CHORD_TOL_CSS * d;
  const domeA = arcShape(Math.min(maxRx, 2 * narrow.R), ceil, 1, 1, spanLog).A;
  const domeCurv = domeA * DOME * (Math.PI * Math.PI) / 2;
  const maxRA = Math.max(shape.R, shape.A, domeCurv);
  const flatTau = narrow.R > 0
    ? Math.min(Math.max(0, (2 * maxRx - 2 * narrow.R) / narrow.R), (width + 2 * CLIP_MARGIN) / narrow.R)
    : 0;
  const byCurve = Math.ceil((Math.PI + flatTau) * Math.sqrt(maxRA / (8 * tol)));
  const want = byLength > byCurve ? byLength : byCurve;
  const capped = want < 8 ? 8 : (want > SEGMENT_CAP ? SEGMENT_CAP : want);
  const n = Math.round(base + (capped - base) * localize);
  return n < 8 ? 8 : n;
}
/**
 * How far above the frame a long arc's apex sits. Above 1 by design: an arc
 * whose level run is ON screen is the apex smear the tanh ceiling produced.
 */
export const APEX_LIFT = 1.15;

/**
 * Narrowest quarter, as a share of the ceiling. The quarter widens with the
 * arc's span, so the seven arcs leaving one verse leave at seven different
 * angles instead of fanning across a few pixels.
 */
export const FAN_FLOOR = 0.25;

/**
 * How far the run bows above A at full localize, as a share of A. The run
 * used to be LEVEL, and a level run translated along x is itself — the
 * "lines don't move when I pan" report is that, not a renderer defect. A
 * quarter of A puts an 86 px bow on a 1,020 px run at the phone ceiling;
 * long arcs' joins stay at 1.15 ceil above the frame, so their on-screen
 * look (quarters only) is untouched. cos² makes the run C1 at the joins.
 */
export const DOME = 0.25;

/**
 * How far a foot's departure rank moves its quarter: a verse's n threads
 * leave in n quarters spanning (1 ± SPREAD/2) of the shared one, so the
 * sheaf FANS at the foot instead of leaving as one bundle. A lone thread
 * (fan 0) keeps today's quarter exactly.
 */
export const SPREAD = 0.5;

/**
 * The DRAWN CURVE of an arc, as two radii.
 *
 * One family covers both regimes, so there is no branch anywhere that has to
 * agree with another branch. The curve is:
 *
 *   d = distance in x from the nearer foot
 *   u = 1 - clamp(d / R, 0, 1)          (1 at a foot, 0 once R px in)
 *   height = A * sqrt(1 - u*u)
 *
 * With R = rx and A = the old arcRadiusY that is EXACTLY today's half-ellipse
 * of radii (rx, ry): at the left foot d = x - x0 so u = (cx - x)/rx, and
 * u*u is the ellipse's (x - cx)^2 / rx^2 term. Nothing about the overview
 * picture moves. With R < rx the middle of the arc is a RUN at height A
 * (domed, see arcHeightAt) between the two quarter-ellipses, which is what
 * lets a long arc leave the frame near its foot instead of creeping across it.
 *
 * Called once per FOOT: each foot's own departure rank (`fan`, decode.fansOf,
 * -0.5..0.5, 0 for a lone thread) sets its quarter; A is the same at both.
 *
 * @param {number} rx - half the arc's on-screen span, device px
 * @param {number} ceil - usable height above the baseline, device px
 * @param {number} squash - squashFactor()
 * @param {number} localize - localizeFactor()
 * @param {number} spanLog - spanLogOf(): how long this arc is, 0..1
 * @param {number} [fan] - this foot's departure rank, centred: -0.5..0.5
 * @returns {{R:number, A:number}} horizontal quarter radius and apex height
 */
export function arcShape(rx, ceil, squash, localize, spanLog, fan = 0) {
  const r = rx > 0 ? rx : 0;
  const c = ceil > 0 ? ceil : 1;
  const k = FAN_FLOOR + (1 - FAN_FLOOR) * (spanLog > 0 ? (spanLog < 1 ? spanLog : 1) : 0);
  const deepR = Math.min(r, c * k * (1 + SPREAD * fan));
  const deepA = APEX_LIFT * c * Math.tanh(r / (c * CEIL_SOFTNESS));
  return {
    R: r + (deepR - r) * localize,
    A: r * squash + (deepA - r * squash) * localize,
  };
}

/**
 * Parameter length of the whole curve: a quarter at each foot (pi/2 each)
 * plus the run between them, measured in units of the mean quarter so the
 * run is sampled at the same speed as the quarters' tops.
 *
 * @param {number} rx - half the arc's span, device px
 * @param {number} RL - left quarter radius from arcShape()
 * @param {number} [RR] - right quarter radius; the left one when omitted
 */
export function arcParamLength(rx, RL, RR = RL) {
  const r = rx > 0 ? rx : 0;
  const Rm = (RL + RR) / 2;
  return Math.PI + (Rm > 0 ? Math.max(0, (2 * r - RL - RR) / Rm) : 0);
}

/**
 * Parameter at a given x - the inverse of arcPointAt, so a caller can clip
 * the parameter range to the part of the arc that is on screen.
 * MUST stay identical to arcTau in arcShapeGLSL below.
 */
export function arcTauOf(x, left, right, RL, RR, P) {
  const Rm = (RL + RR) / 2;
  if (!(Rm > 0)) return 0;
  if (x <= left + RL) return Math.acos(clamp1(1 - (x - left) / RL));
  if (x >= right - RR) return P - Math.acos(clamp1(1 - (right - x) / RR));
  return Math.PI / 2 + (x - (left + RL)) / Rm;
}

/**
 * The point on the curve at parameter tau, and the tangent the ribbon offsets
 * along. MUST stay identical to arcAt in arcShapeGLSL below.
 *
 * On the run (between the quarters) the height is the dome
 *   A * (1 + bow * cos²(π/2 · v)),  v = -1..1 across the run,
 * with bow = DOME * localize: 0 at the overview (where there is no run
 * anyway), a quarter of A at full depth.
 *
 * @returns {{x:number, h:number, tx:number, ty:number}} x, height above the
 *   baseline, and the tangent (which points BACKWARDS along tau, matching the
 *   sign the ribbon has always offset with).
 */
export function arcPointAt(tau, left, right, RL, RR, A, P, bow = 0) {
  const HALF = Math.PI / 2;
  if (tau <= HALF) {
    return {
      x: left + RL * (1 - Math.cos(tau)), h: A * Math.sin(tau),
      tx: -RL * Math.sin(tau), ty: A * Math.cos(tau),
    };
  }
  if (tau >= P - HALF) {
    const s = P - tau;
    return {
      x: right - RR * (1 - Math.cos(s)), h: A * Math.sin(s),
      tx: -RR * Math.sin(s), ty: -A * Math.cos(s),
    };
  }
  const Rm = (RL + RR) / 2;
  const run = Math.max(right - RR - (left + RL), 1e-6);
  const x = left + RL + (tau - HALF) * Rm;
  // v clamped: a tau that lands in the run of a run-less arc (the joins are
  // one float apart) reads as the join itself, not as a point past it.
  const v = clamp1((2 * (x - (left + RL)) - run) / run);
  const c = Math.cos(HALF * v);
  const dome = domeOf(bow, run, Rm);
  return {
    x, h: A * (1 + dome * c * c),
    tx: -1, ty: -A * dome * Math.PI * Math.sin(Math.PI * v) / run,
  };
}

/**
 * The dome's height on a run, as a share of A: the full bow once the run is
 * at least as long as its two quarters together, and the SQUARE of the
 * run's share of that on a shorter one. Without the taper an arc whose span
 * just clears its two quarters would carry the whole bow on a few px of run
 * — a needle at the crown. Squared, not linear, because the dome's slope is
 * its height over its length: a linear taper leaves a run of one px with a
 * full-size slope (measured: 0.21 on a run-less arc's join), the square
 * takes the slope to zero with the run. The bound either way is the
 * quarters' own, A·DOME·π / (2·Rm), reached where the run is two quarters.
 * MUST stay identical to the `dome` line in arcAt (arcShapeGLSL).
 * @param {number} bow - DOME * localize
 * @param {number} run - the run's length, device px
 * @param {number} Rm - the mean quarter radius, device px
 */
export function domeOf(bow, run, Rm) {
  const share = Rm > 0 ? run / (2 * Rm) : 1;
  const t = share < 1 ? share : 1;
  return bow * t * t;
}

/**
 * Height of the drawn curve at x — the analytic form of arcPointAt that the
 * hit test needs (a quarter at each foot, the domed run between). The two
 * are ONE curve; bent-law.test.js walks arcPointAt and checks this at every
 * sample.
 *
 * @param {number} x - device px
 * @param {number} left @param {number} right - the feet
 * @param {number} RL @param {number} RR - the quarter radii
 * @param {number} A - apex height from arcShape()
 * @param {number} bow - DOME * localize
 */
export function arcHeightAt(x, left, right, RL, RR, A, bow) {
  if (x <= left + RL) return arcHeight(x - left, RL, A);
  if (x >= right - RR) return arcHeight(right - x, RR, A);
  const run = right - RR - (left + RL);
  const v = clamp1((2 * (x - (left + RL)) - run) / run);
  const c = Math.cos((Math.PI / 2) * v);
  return A * (1 + domeOf(bow, run, (RL + RR) / 2) * c * c);
}

/** -1..1, the run's own parameter. */
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
const float ARC_HALF = 1.5707963;
const float ARC_PI = 3.14159265;
vec2 arcShape(float rx, float ceil, float squash, float localize, float spanLog, float fan){
  float r = max(rx, 0.);
  float c = max(ceil, 1.);
  float k = ${glslFloat(FAN_FLOOR)} + ${glslFloat(1 - FAN_FLOOR)}*clamp(spanLog, 0., 1.);
  float deepR = min(r, c*k*(1. + ${glslFloat(SPREAD)}*fan));
  float deepA = ${glslFloat(APEX_LIFT)}*c*tanh(r/(c*${glslFloat(CEIL_SOFTNESS)}));
  return vec2(mix(r, deepR, localize), mix(r*squash, deepA, localize));
}
float arcTau(float x, float left, float right, float RL, float RR, float P){
  float Rm = (RL + RR)*.5;
  if (Rm <= 0.) return 0.;
  if (x <= left + RL)  return acos(clamp(1. - (x - left)/RL, -1., 1.));
  if (x >= right - RR) return P - acos(clamp(1. - (right - x)/RR, -1., 1.));
  return ARC_HALF + (x - (left + RL))/Rm;
}
void arcAt(float tau, float left, float right, float RL, float RR, float A, float P, float bow,
           out float x, out float h, out vec2 tg){
  if (tau <= ARC_HALF) {
    x = left + RL*(1. - cos(tau));   h = A*sin(tau);
    tg = vec2(-RL*sin(tau), A*cos(tau));
  } else if (tau >= P - ARC_HALF) {
    float s = P - tau;
    x = right - RR*(1. - cos(s));    h = A*sin(s);
    tg = vec2(-RR*sin(s), -A*cos(s));
  } else {
    float Rm = (RL + RR)*.5;
    float run = max(right - RR - (left + RL), 1e-6);
    x = left + RL + (tau - ARC_HALF)*Rm;
    float v = clamp((2.*(x - (left + RL)) - run)/run, -1., 1.);
    float c = cos(ARC_HALF*v);
    float t = min(1., run/(2.*Rm));
    float dome = bow*t*t;
    h = A*(1. + dome*c*c);
    tg = vec2(-1., -A*dome*ARC_PI*sin(ARC_PI*v)/run);
  }
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
  if (anchored) return level >= rev / LOD_QUANT + LOD_MIN_LEVEL ? 1 : 0;
  return /** @type {0|1} */ (rep);
}

/** The same test as GLSL ES 3.00, for the vertex shader to inline. */
export const lodGLSL = `
float lodShown(uint lod, float essential, float anchored, float level){
  if (level <= ${glslFloat(LOD_OFF + 1)}) return 1.;
  uint rev = essential > .5 ? ((lod >> 8u) & 255u) : (lod & 255u);
  uint rep = essential > .5 ? ((lod >> 17u) & 1u) : ((lod >> 16u) & 1u);
  float reveal = float(rev)/${glslFloat(LOD_QUANT)} + ${glslFloat(LOD_MIN_LEVEL)};
  return anchored > .5 ? step(reveal, level) : float(rep);
}`;

/* ── The density law, part 3: strata (density-law.md section 3, 2026-09-21) ──
 *
 * Corbin: "various 'atmospheres' and 'layers' when you're panned up so
 * everything stays navigable". Panned up at the ceiling, the fly-over
 * representatives all stood in one level band under the chrome: every long
 * arc's run sits at APEX_LIFT x ceil, whatever its span. Now a thread whose
 * feet have BOTH left the frame rises into its STRATUM - the asset's span
 * buckets: nearby (< 50 verses), book-scale (< 500), testament-scale
 * (< 5,000), canon-scale - by a lift of BAND x ceil per stratum, ordered by
 * span inside the band, scaled by localize (6x and under untouched) and by
 * how far the nearer foot is outside the frame (smooth over one frame's
 * width, so a pan never snaps a line). A thread with a foot in the frame
 * (or its margin) has NO lift: today's arch to the pixel, no reeds. The
 * whole curve moves up as one, so its shape is untouched.
 *
 * The shader inlines strataGLSL; pick.js calls strataLift. Same law.
 */

/** Stratum bounds, verses: the asset's span buckets (tools/scripture-web-lib SPAN_BUCKETS). */
export const STRATA_BOUNDS = [50, 500, 5000];

/** The strata's names, for the legend. */
export const STRATA_NAMES = ['nearby', 'book-scale', 'testament-scale', 'canon-scale'];

/** THE taste number: one stratum's height, as a share of the ceiling. Corbin may move it. */
export const BAND = 0.35;

/** The top stratum's lift in BAND x ceil units: k = 3 plus the 0.8 in-band spread. */
export const STRATA_LIFT_MAX = 3.8;

/**
 * Which stratum a span belongs to, 0..3.
 * @param {number} span - |to - from|, verses
 */
export function stratumOf(span) {
  for (let k = 0; k < STRATA_BOUNDS.length; k++) if (span < STRATA_BOUNDS[k]) return k;
  return STRATA_BOUNDS.length;
}

/**
 * How far a thread's drawn curve is lifted into its stratum, device px.
 * MUST stay identical to strataGLSL below.
 *
 * @param {number} span - |to - from|, verses
 * @param {number} total - verses in the canon
 * @param {number} x0 @param {number} x1 - the feet, device px (x0 <= x1)
 * @param {number} width - viewport width, device px
 * @param {number} ceil - usable height above the baseline, device px
 * @param {number} localize - localizeFactor()
 * @returns {number} 0 when a foot is within FLYOVER_MARGIN of the frame
 */
export function strataLift(span, total, x0, x1, width, ceil, localize) {
  if (!(localize > 0)) return 0;
  const m = FLYOVER_MARGIN;
  const dl = -x0 - m > 0 ? -x0 - m : 0;
  const dr = x1 - width - m > 0 ? x1 - width - m : 0;
  const dist = dl < dr ? dl : dr;
  if (!(dist > 0)) return 0;
  const s = smoothstep(0, width, dist);
  const sp = span > 1 ? span : 1;
  const k = stratumOf(sp);
  const lo = k === 0 ? 1 : STRATA_BOUNDS[k - 1];
  const hi = k === STRATA_BOUNDS.length ? (total > lo ? total : lo + 1) : STRATA_BOUNDS[k];
  let f = (Math.log(sp) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  f = f < 0 ? 0 : (f > 1 ? 1 : f);
  return BAND * ceil * (k + 0.8 * f) * localize * s;
}

/** The same lift as GLSL ES 3.00, for the vertex shader to inline. */
export const strataGLSL = `
float strataLift(float span, float total, float x0, float x1, float width, float ceil, float localize){
  float m = ${glslFloat(FLYOVER_MARGIN)};
  float dist = min(max(-x0 - m, 0.), max(x1 - width - m, 0.));
  float s = smoothstep(0., width, dist);
  float sp = max(span, 1.);
  float k = step(${glslFloat(STRATA_BOUNDS[0])}, sp) + step(${glslFloat(STRATA_BOUNDS[1])}, sp) + step(${glslFloat(STRATA_BOUNDS[2])}, sp);
  float lo = k < .5 ? 1. : (k < 1.5 ? ${glslFloat(STRATA_BOUNDS[0])} : (k < 2.5 ? ${glslFloat(STRATA_BOUNDS[1])} : ${glslFloat(STRATA_BOUNDS[2])}));
  float hi = k < .5 ? ${glslFloat(STRATA_BOUNDS[0])} : (k < 1.5 ? ${glslFloat(STRATA_BOUNDS[1])} : (k < 2.5 ? ${glslFloat(STRATA_BOUNDS[2])} : max(total, lo + 1.)));
  float f = clamp((log(sp) - log(lo))/(log(hi) - log(lo)), 0., 1.);
  return ${glslFloat(BAND)}*ceil*(k + .8*f)*localize*s;
}`;

/**
 * Distance in device px from a point to an arc, or Infinity if the point is
 * outside the arc's bounding box.
 *
 * The curve is arcHeight()'s, written implicitly as
 * F = (v/A)^2 + u^2 - 1 with v the height above the baseline and u as in
 * arcHeight. Rather than solving for the closest point (a quartic), this takes
 * the first-order distance |F| / |grad F|, which is exact ON the curve and
 * accurate within a few px of it - the only place a hit test ever asks.
 *
 * With R = rx and A = ry this is algebraically the previous ellipse form, term
 * for term. On the run between the quarters the curve is arcHeightAt's dome,
 * and the distance is the vertical gap foreshortened by the dome's slope —
 * exact on the curve, the same first-order form as the quarters.
 *
 * @param {number} px @param {number} py - query point, device px, y down
 * @param {number} x0 @param {number} x1 - arc endpoints on the baseline
 * @param {number} base - baseline y, device px (the camera's y already added)
 * @param {number} RL @param {number} RR - the feet's quarter radii from arcShape()
 * @param {number} A - apex height from arcShape()
 * @param {number} tol - hit tolerance, device px
 * @param {number} [bow] - DOME * localize; 0 = a level run
 */
export function arcDistance(px, py, x0, x1, base, RL, RR, A, tol, bow = 0) {
  const rx = (x1 - x0) * 0.5;
  if (rx <= 0.25) return Infinity;
  const cx = x0 + rx;
  if (px < cx - rx - tol || px > cx + rx + tol) return Infinity;
  const v = base - py;
  if (v < -tol || v > A * (1 + bow) + tol) return Infinity;
  if (!(RL > 0) || !(RR > 0) || !(A > 0)) return Infinity;
  const left = cx - rx, right = cx + rx;
  if (px > left + RL && px < right - RR) {
    // On the run: the dome's height and slope at this x.
    const run = right - RR - (left + RL);
    const w = clamp1((2 * (px - (left + RL)) - run) / run);
    const c = Math.cos((Math.PI / 2) * w);
    const dome = domeOf(bow, run, (RL + RR) / 2);
    const h = A * (1 + dome * c * c);
    const slope = -A * dome * Math.PI * Math.sin(Math.PI * w) / run;
    return Math.abs(v - h) / Math.hypot(1, slope);
  }
  // In a quarter: distance in x from ITS foot, and how far that is through it.
  const onLeft = px <= left + RL;
  const R = onLeft ? RL : RR;
  const d = onLeft ? px - left : right - px;
  const inQuarter = d > 0 && d < R;
  const u = d <= 0 ? 1 : (d >= R ? 0 : 1 - d / R);
  const f = (v / A) * (v / A) + u * u - 1;
  const gx = inQuarter ? (2 * u / R) * (onLeft ? -1 : 1) : 0;
  const gy = 2 * v / (A * A);
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
 * the sky above the arches. Device px and not verse units, because under the
 * bent law an apex is FRAME-sized (APEX_LIFT × ceil at depth), not
 * world-sized; a height in verses would name nothing the law draws.
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
 * baseline: the widest thread's crown under the law at this zoom (A is
 * monotonic in rx, so the widest thread is the tallest), with the dome on top.
 * @param {{ppv:number, total:number}} cam @param {number} width @param {YFrame} yf
 */
export function apexMaxPx(cam, width, yf) {
  const localize = localizeFactor(cam.ppv / fitPPV(cam, width));
  const { A } = arcShape((yf.maxSpan * cam.ppv) / 2, yf.ceil, yf.squash, localize,
    spanLogOf(yf.maxSpan, cam.total));
  // plus the top stratum: a canon-scale thread whose feet have both left
  // the frame stands STRATA_LIFT_MAX bands higher (the density law, part 3)
  return A * (1 + DOME * localize) + STRATA_LIFT_MAX * BAND * yf.ceil * localize;
}

/**
 * The highest the camera may go: the tallest apex just reaches the frame's
 * top. At the overview the dome fills the frame and this is 0 — nothing to
 * pan, honestly, like a map at its bounds; between 2x and 12x the
 * semi-ellipses tower several screens; at the ceiling it is the domes' crowns,
 * (APEX_LIFT × (1 + DOME) − 1) × ceil less the slack above the dome.
 * @param {{ppv:number, total:number}} cam @param {number} width @param {YFrame} yf
 */
export function maxCamY(cam, width, yf) {
  const top = apexMaxPx(cam, width, yf) - yf.base;
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
  const top = yf ? maxCamY(cam, width, yf) : 0;
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
 * Zoom about a fixed screen point — the anchor stays under the finger/cursor.
 * The camera's height is kept and re-clamped: the law reshapes every arc as
 * the zoom moves, so there is no world height to hold under the pointer.
 * @param {number} anchorX — device px to hold still
 * @param {number} factor — multiplicative zoom (>1 zooms in)
 * @param {YFrame} [yf] - the y frame, when the camera has one
 */
export function zoomAbout(cam, width, anchorX, factor, maxZoom, yf) {
  const verse = xToVerse(cam, width, anchorX);
  cam.ppv *= factor;
  clampCamera(cam, width, maxZoom, yf);
  cam.x = verse - (anchorX - width / 2) / cam.ppv;
  return clampCamera(cam, width, maxZoom, yf);
}
