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
 * measured) and divides by 5.15 / 7.58 / 3.32 at 40x on phoneLand / phone375
 * / desktop1920.
 */
export const DENSITY_K = 0.20;

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
 * @param {number} zoom - multiple of fit-to-width
 * @param {number} localize - localizeFactor()
 * @param {boolean} light - parchment theme
 * @param {number} anchoredPerCssPx - anchored arcs per CSS px of viewport width
 * @returns {{alpha:number, strokeWidthCss:number, voteMix:number}}
 */
export function ribbonStyle(zoom, localize, light, anchoredPerCssPx) {
  const l2 = Math.log2(zoom > 0 ? zoom : 1);
  const alpha = Math.min(0.075 + l2 * 0.028, light ? 0.42 : 0.19);
  const strokeWidthCss = Math.min(0.9 + l2 * 0.16, STROKE_DEEP_CSS);
  const t = smoothstep(0.55, 1, localize);
  if (!(t > 0)) return { alpha, strokeWidthCss, voteMix: 0 };
  // Crowding, not zoom, is what decides whether the deep value washes: at the
  // ceiling ~0.17 anchored arcs share each CSS px of width and almost nothing
  // overlaps, so each ribbon is drawn alone and needs the full value; at 40x
  // there are thirty times as many and the same value would be a neon fog.
  const per = anchoredPerCssPx > 0 ? anchoredPerCssPx : 0;
  const crowd = Math.max(1, Math.sqrt(per / DENSITY_K));
  const deep = ALPHA_DEEP / crowd;
  return {
    alpha: alpha + (deep - alpha) * t,
    strokeWidthCss: strokeWidthCss + (STROKE_DEEP_CSS - strokeWidthCss) * t,
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
 * @returns {number}
 */
export function segmentsFor(bucketSegments, localize, maxRx, ceil, width, dpr) {
  const base = bucketSegments > 0 ? bucketSegments : 8;
  if (!(localize > 0)) return base;
  const d = dpr > 0 ? dpr : 1;
  const shape = arcShape(maxRx, ceil, 1, 1, 1);
  // (1) LENGTH: no on-screen segment longer than the target. The tallest this
  // range can reach on screen comes from the same apex law the shader draws
  // with, not from a second estimate of it.
  const apex = Math.min(ceil, shape.A);
  const runCss = (Math.min(2 * maxRx, width + 2 * CLIP_MARGIN) + apex) / d;
  const byLength = Math.ceil(runCss / SEGMENT_TARGET_CSS);
  // (2) CURVATURE: a short arc is a whole semi-ellipse in half a screen, so it
  // needs segments the length rule does not ask for. Sampling uniformly in the
  // parameter, a step of dTau strays at most |p''| dTau^2 / 8 from its chord,
  // and |p''| <= max(R, A). Measured, not assumed: without this a 2-verse arc
  // at the ceiling reads 0.835 CSS px of chord error on the 8-segment floor.
  const tol = CHORD_TOL_CSS * d;
  const maxRA = Math.max(shape.R, shape.A);
  const flatTau = shape.R > 0
    ? Math.min(Math.max(0, (2 * maxRx - 2 * shape.R) / shape.R), (width + 2 * CLIP_MARGIN) / shape.R)
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
 * picture moves. With R < rx the middle of the arc runs LEVEL at height A
 * between the two quarter-ellipses, which is what lets a long arc leave the
 * frame near its foot instead of creeping across it.
 *
 * @param {number} rx - half the arc's on-screen span, device px
 * @param {number} ceil - usable height above the baseline, device px
 * @param {number} squash - squashFactor()
 * @param {number} localize - localizeFactor()
 * @param {number} spanLog - spanLogOf(): how long this arc is, 0..1
 * @returns {{R:number, A:number}} horizontal quarter radius and apex height
 */
export function arcShape(rx, ceil, squash, localize, spanLog) {
  const r = rx > 0 ? rx : 0;
  const c = ceil > 0 ? ceil : 1;
  const k = FAN_FLOOR + (1 - FAN_FLOOR) * (spanLog > 0 ? (spanLog < 1 ? spanLog : 1) : 0);
  const deepR = Math.min(r, c * k);
  const deepA = APEX_LIFT * c * Math.tanh(r / (c * CEIL_SOFTNESS));
  return {
    R: r + (deepR - r) * localize,
    A: r * squash + (deepA - r * squash) * localize,
  };
}

/**
 * Parameter length of the whole curve: a quarter at each foot (pi/2 each)
 * plus the level run between them, measured in units of R so the run is
 * sampled at the same speed as the quarter's top.
 *
 * @param {number} rx - half the arc's span, device px
 * @param {number} R - quarter radius from arcShape()
 */
export function arcParamLength(rx, R) {
  const r = rx > 0 ? rx : 0;
  return Math.PI + (R > 0 ? Math.max(0, (2 * r - 2 * R) / R) : 0);
}

/**
 * Parameter at a given x - the inverse of arcPointAt, so a caller can clip
 * the parameter range to the part of the arc that is on screen.
 * MUST stay identical to arcTau in arcShapeGLSL below.
 */
export function arcTauOf(x, left, right, R, P) {
  if (!(R > 0)) return 0;
  const clamp1 = (v) => (v < -1 ? -1 : (v > 1 ? 1 : v));
  if (x <= left + R) return Math.acos(clamp1(1 - (x - left) / R));
  if (x >= right - R) return P - Math.acos(clamp1(1 - (right - x) / R));
  return Math.PI / 2 + (x - (left + R)) / R;
}

/**
 * The point on the curve at parameter tau, and the tangent the ribbon offsets
 * along. MUST stay identical to arcAt in arcShapeGLSL below.
 *
 * @returns {{x:number, h:number, tx:number, ty:number}} x, height above the
 *   baseline, and the tangent (which points BACKWARDS along tau, matching the
 *   sign the ribbon has always offset with).
 */
export function arcPointAt(tau, left, right, R, A, P) {
  const HALF = Math.PI / 2;
  if (tau <= HALF) {
    return {
      x: left + R * (1 - Math.cos(tau)), h: A * Math.sin(tau),
      tx: -R * Math.sin(tau), ty: A * Math.cos(tau),
    };
  }
  if (tau >= P - HALF) {
    const s = P - tau;
    return {
      x: right - R * (1 - Math.cos(s)), h: A * Math.sin(s),
      tx: -R * Math.sin(s), ty: -A * Math.cos(s),
    };
  }
  return { x: left + R + (tau - HALF) * R, h: A, tx: -R, ty: 0 };
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
vec2 arcShape(float rx, float ceil, float squash, float localize, float spanLog){
  float r = max(rx, 0.);
  float c = max(ceil, 1.);
  float k = ${FAN_FLOOR} + ${1 - FAN_FLOOR}*clamp(spanLog, 0., 1.);
  float deepR = min(r, c*k);
  float deepA = ${APEX_LIFT}*c*tanh(r/(c*${CEIL_SOFTNESS}));
  return vec2(mix(r, deepR, localize), mix(r*squash, deepA, localize));
}
float arcTau(float x, float left, float right, float R, float P){
  if (R <= 0.) return 0.;
  if (x <= left + R)  return acos(clamp(1. - (x - left)/R, -1., 1.));
  if (x >= right - R) return P - acos(clamp(1. - (right - x)/R, -1., 1.));
  return ARC_HALF + (x - (left + R))/R;
}
void arcAt(float tau, float left, float right, float R, float A, float P,
           out float x, out float h, out vec2 tg){
  if (tau <= ARC_HALF) {
    x = left + R*(1. - cos(tau));   h = A*sin(tau);
    tg = vec2(-R*sin(tau), A*cos(tau));
  } else if (tau >= P - ARC_HALF) {
    float s = P - tau;
    x = right - R*(1. - cos(s));    h = A*sin(s);
    tg = vec2(-R*sin(s), -A*cos(s));
  } else {
    x = left + R + (tau - ARC_HALF)*R;  h = A;
    tg = vec2(-R, 0.);
  }
}`;
/**
 * Height of the drawn curve above the baseline, `d` px in from the nearer
 * foot. THE one definition of the curve's shape: arcDistance hit-tests it and
 * the vertex shader draws it.
 *
 * @param {number} d - distance in x from the nearer foot, device px
 * @param {number} R - quarter radius from arcShape()
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
 * is at overview, falling to the fly-over floor as they localize, and to
 * EXACTLY 0 at full depth so hundreds of flattened apexes stop smearing
 * across the view. Anything this returns 0 for is not painted, and therefore
 * must not be pickable.
 *
 * MUST stay identical to flyOverGLSL below and to the shader that inlines it.
 *
 * @param {number} anchored — arcAnchored(), 0 or 1
 * @param {number} localize — localizeFactor()
 */
export function flyOverDim(anchored, localize) {
  const t = smoothstep(0.55, 1, localize);
  const flyFloor = 0.1 + (0 - 0.1) * t;
  const floored = flyFloor + (1 - flyFloor) * anchored;
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
  float m = ${FLYOVER_MARGIN}.;
  return max(step(-m, x0)*step(x0, width + m),
             step(-m, x1)*step(x1, width + m));
}
float flyOverDim(float anchored, float localize){
  float flyFloor = mix(.10, 0., smoothstep(.55, 1., localize));
  return mix(1., mix(flyFloor, 1., anchored), localize);
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
 * for term; the level middle (u = 0) reduces to |v - A|, which is what a
 * horizontal run should give.
 *
 * @param {number} px @param {number} py - query point, device px, y down
 * @param {number} x0 @param {number} x1 - arc endpoints on the baseline
 * @param {number} base - baseline y, device px
 * @param {number} R - quarter radius from arcShape()
 * @param {number} A - apex height from arcShape()
 * @param {number} tol - hit tolerance, device px
 */
export function arcDistance(px, py, x0, x1, base, R, A, tol) {
  const rx = (x1 - x0) * 0.5;
  if (rx <= 0.25) return Infinity;
  const cx = x0 + rx;
  if (px < cx - rx - tol || px > cx + rx + tol) return Infinity;
  const v = base - py;
  if (v < -tol || v > A + tol) return Infinity;
  if (!(R > 0) || !(A > 0)) return Infinity;
  // Distance in x from the nearer foot, and how far that is through the
  // quarter. Outside the quarters the curve is level, so du/dx is 0 there and
  // the gradient is purely vertical - the correct answer for a flat run.
  const d = Math.min(px - (cx - rx), (cx + rx) - px);
  const inQuarter = d > 0 && d < R;
  const u = d <= 0 ? 1 : (d >= R ? 0 : 1 - d / R);
  const f = (v / A) * (v / A) + u * u - 1;
  const gx = inQuarter ? (2 * u / R) * (px <= cx ? -1 : 1) : 0;
  const gy = 2 * v / (A * A);
  const gm = Math.hypot(gx, gy);
  if (gm < 1e-9) return Infinity;
  return Math.abs(f) / gm;
}

/**
 * The camera: a 1-D affine map from verse index to device px, plus the
 * vertical frame. Pure data + pure functions — the screen owns the instance
 * and mutates `x`/`ppv` imperatively during gestures (no React state per
 * frame, per the GardenView doctrine).
 */
export function createCamera(total) {
  return { x: total / 2, ppv: 0, total };
}

/** Pixels-per-verse at which the whole canon exactly fills the viewport. */
export function fitPPV(cam, width) { return width / cam.total; }

/**
 * Clamp zoom into [fit, maxZoom×fit] and pan so the canon can't leave the
 * viewport. Mutates in place — this runs per gesture frame.
 */
export function clampCamera(cam, width, maxZoom) {
  const min = fitPPV(cam, width);
  const max = min * (maxZoom || 5000);
  if (!(cam.ppv > 0)) cam.ppv = min;
  cam.ppv = Math.min(Math.max(cam.ppv, min), max);
  const half = width / cam.ppv / 2;
  cam.x = (half * 2 >= cam.total) ? cam.total / 2
    : Math.min(Math.max(cam.x, half), cam.total - half);
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
 * @param {number} anchorX — device px to hold still
 * @param {number} factor — multiplicative zoom (>1 zooms in)
 */
export function zoomAbout(cam, width, anchorX, factor, maxZoom) {
  const verse = xToVerse(cam, width, anchorX);
  cam.ppv *= factor;
  clampCamera(cam, width, maxZoom);
  cam.x = verse - (anchorX - width / 2) / cam.ppv;
  return clampCamera(cam, width, maxZoom);
}
