/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/geometry — Cluster F (esbuild bundle-f.js)

   THE law, in one place (the camera lives in camera.js and is re-exported
   below, so every importer of the pair keeps one path).

   The GPU draws each cross-reference as a half-ellipse ribbon and the CPU
   hit-tests the same curve analytically. Those two must agree to the pixel or
   arcs become untappable exactly where they look tappable. So the law lives
   here once, in a form both sides consume: the vertex shader inlines
   `threadShapeGLSL` verbatim, and pick.js calls `threadShape`.

   THE TRUE WORLD (spine section 1, 2026-09-11). A thread from verse a to
   verse b is the half-ellipse with feet at (a, 0) and (b, 0) and apex height
   (b - a)/2 in verse units, at EVERY zoom: `R = rx`, `A = rx * squash`, the
   law this shipped with at the overview and nothing else. The world is
   fixed; the camera moves over it in two dimensions (camera.js). There is no
   morph at depth any more -- the tanh ceiling that flattened every long
   arc's apex to one lifted level run above the frame is what made a vertical
   camera useless, and the fly-over dimming law that existed to hide those
   runs has nothing left to dim. Clean at depth comes from geometry: a
   half-ellipse of radius r is below height y only within y^2/(2r) of a
   foot, so at the ceiling only the stems of the verses in view are on
   screen, each at its own height.

   What follows from a fixed world is that the SAMPLING has to find the
   piece on screen: `sampleTau` (JS and GLSL twins) spends a strip's segments
   on the visible part of the thread -- the dome when the apex is inside the
   frame's band, the two legs when it is above it -- so a 440,000 px arc at
   the ceiling draws its 520 px stem with the segments that stem needs.
   ═══════════════════════════════════════════════════════════════════════ */

export * from './camera.js';

/**
 * Where the ink law crosses from the overview regime (votes on alpha) to the
 * depth regime (votes on width, one deep alpha divided by crowding): the
 * crossover starts at 6x and is complete by 24x, on a log ramp. This used to
 * be the geometry's localize factor as well; the geometry no longer has a
 * crossover, and this is the INK law's key alone.
 */
export const DEPTH_START = 6;
export const DEPTH_END = 24;

/**
 * How far the ink law's crossover has progressed. 0 at overview, 1 once
 * zoomed well in.
 * @param {number} zoom — current scale as a multiple of fit-to-width
 * @returns {number} 0..1
 */
export function depthMix(zoom) {
  if (!(zoom > DEPTH_START)) return 0;
  const t = (Math.log2(zoom) - Math.log2(DEPTH_START)) /
            (Math.log2(DEPTH_END) - Math.log2(DEPTH_START));
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
 * Alpha every anchored ribbon reaches at the ceiling. The worst Distance stop
 * needs an effective 0.83 on black and 0.85 on parchment to clear WCAG's 3:1
 * non-text floor alone (design-perf, from the ramp and relative luminance).
 */
export const ALPHA_DEEP = 0.90;

/**
 * Visible arcs per CSS px of viewport width at which the deep alpha starts
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
 * Keyed on zoom directly (depthMix), not on a geometry factor: the ink law
 * keeps its two regimes and its numbers; the geometry no longer has a
 * crossover to borrow from.
 *
 * @param {number} zoom - multiple of fit-to-width
 * @param {boolean} light - parchment theme
 * @param {number} visiblePerCssPx - threads with a piece on screen, per CSS px of viewport width
 * @returns {{alpha:number, strokeWidthCss:number, voteMix:number}}
 */
export function ribbonStyle(zoom, light, visiblePerCssPx) {
  const l2 = Math.log2(zoom > 0 ? zoom : 1);
  const alpha = Math.min(0.075 + l2 * 0.028, light ? 0.42 : 0.19);
  const strokeWidthCss = Math.min(0.9 + l2 * 0.16, STROKE_DEEP_CSS);
  const t = smoothstep(0.55, 1, depthMix(zoom));
  if (!(t > 0)) return { alpha, strokeWidthCss, voteMix: 0 };
  // Crowding, not zoom, is what decides whether the deep value washes: at the
  // ceiling ~0.17 visible arcs share each CSS px of width and almost nothing
  // overlaps, so each ribbon is drawn alone and needs the full value; at 40x
  // there are thirty times as many and the same value would be a neon fog.
  const per = visiblePerCssPx > 0 ? visiblePerCssPx : 0;
  const crowd = Math.max(1, Math.pow(per / DENSITY_K, DENSITY_EXP));
  const deep = ALPHA_DEEP / crowd;
  return {
    alpha: alpha + (deep - alpha) * t,
    strokeWidthCss: strokeWidthCss + (STROKE_DEEP_CSS - strokeWidthCss) * t,
    voteMix: t,
  };
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
 * Where the bridge between a split strip's two legs is lifted to, in stroke
 * half-widths above the frame's top edge, so its triangles are clipped and
 * never rasterised. Two: the ribbon's own half width plus its feather skirt.
 */
export const SPLIT_MARGIN = 2;

/**
 * The DRAWN CURVE of a thread, as two radii: R the horizontal radius, A the
 * apex height, device px. The true world: R = rx, A = rx * squash, the
 * half-ellipse this shipped with at the overview, at every zoom.
 *
 * @param {number} rx - half the thread's on-screen span, device px
 * @param {number} squash - squashFactor(), the frame's constant
 * @returns {{R:number, A:number}}
 */
export function threadShape(rx, squash) {
  const r = rx > 0 ? rx : 0;
  return { R: r, A: r * (squash > 0 ? squash : 1) };
}

/**
 * The parameter this vertex samples, 0 <= t <= 1 along the strip: the
 * visible piece of the thread, so the segments land where the reader is
 * looking. Two regimes by the apex against the frame's band [hLo, hHi]
 * (device px above the world baseline): inside it, one piece from the
 * band-bottom crossing on the left leg to its mirror on the right; above
 * it, the two legs, one per half of the strip, each clipped at the top a
 * little ABOVE the frame (SPLIT_MARGIN half-widths) so the bridge the strip
 * draws between the halves lies off screen and is never rasterised. Both
 * regimes are then cut to the x window's parameter range [txLo, txHi].
 * MUST stay identical to sampleTau in threadShapeGLSL below.
 *
 * @param {number} t - 0..1 along the strip
 * @param {number} A - apex height, device px
 * @param {number} P - parameter length of the whole curve (pi)
 * @param {number} hLo @param {number} hHi - the band, device px above the world baseline
 * @param {number} hw - the ribbon's half width plus skirt, device px
 * @param {number} txLo @param {number} txHi - the x window as parameters (arcTauOf)
 * @returns {number} tau
 */
export function sampleTau(t, A, P, hLo, hHi, hw, txLo, txHi) {
  const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
  const sLo = Math.asin(clamp01(hLo / A));
  if (A <= hHi + SPLIT_MARGIN * hw) {
    const a0 = Math.max(sLo, txLo);
    const a1 = Math.max(Math.min(P - sLo, txHi), a0);
    return a0 + (a1 - a0) * t;
  }
  const sHi = Math.asin(clamp01((hHi + SPLIT_MARGIN * hw) / A));
  const left = t < 0.5;
  const u = left ? t * 2 : t * 2 - 1;
  let a0 = left ? sLo : P - sHi;
  let a1 = left ? sHi : P - sLo;
  a0 = Math.max(a0, txLo);
  a1 = Math.max(Math.min(a1, txHi), a0);
  return a0 + (a1 - a0) * u;
}

/**
 * Segments to tessellate one draw group with: the worst member of a bucket
 * of threads whose half-spans run rxLo..rxHi, at this camera.
 *
 * At fit the answer is the asset's own per-bucket count, so the 1x frame
 * cannot move. Past it, two rules on the VISIBLE piece (sampleTau's):
 * (1) LENGTH: no on-screen segment longer than the target — the piece's run
 * is at most its x extent plus its rise (twice, when the apex is above the
 * frame and both legs draw); (2) CURVATURE: sampling uniformly in the
 * parameter, a step of dTau strays at most |p''| dTau^2 / 8 from its chord,
 * and |p''| <= max(R, A), over the parameter range the piece covers. The
 * worst member is not monotone in rx (a dome whose apex sits at the frame's
 * top costs the most), so the rule is read at both ends of the bucket and at
 * that member, and the largest wins. Even, so a split strip halves cleanly.
 *
 * @param {number} bucketSegments - the asset's own per-bucket count
 * @param {number} zoom - multiple of fit-to-width
 * @param {number} rxLo @param {number} rxHi - the bucket's half-spans, device px
 * @param {number} squash - squashFactor()
 * @param {number} base - the frame's baseline row, device px (the band's height at cam.y = 0)
 * @param {number} width - viewport width, device px
 * @param {number} dpr - device pixel ratio, so the target is in CSS px
 * @returns {number}
 */
export function segmentsFor(bucketSegments, zoom, rxLo, rxHi, squash, base, width, dpr) {
  const bs = bucketSegments > 0 ? bucketSegments : 8;
  if (!(zoom > 1.0001)) return bs;
  const d = dpr > 0 ? dpr : 1;
  const sq = squash > 0 ? squash : 1;
  const tol = CHORD_TOL_CSS * d;
  const need = (rx) => {
    const { R, A } = threadShape(rx, sq);
    const split = A > base;
    const up = Math.min(A, base);
    const reach = R - Math.sqrt(Math.max(0, R * R - (up / sq) * (up / sq)));
    const across = split ? 2 * reach : Math.min(2 * R, width + 2 * CLIP_MARGIN);
    const runCss = (across + (split ? 2 : 1) * up) / d;
    const byLength = Math.ceil(runCss / SEGMENT_TARGET_CSS);
    const tauVisible = split ? 2 * Math.asin(Math.min(1, base / A)) : Math.PI;
    const byCurve = Math.ceil(tauVisible * Math.sqrt(Math.max(R, A) / (8 * tol)));
    return byLength > byCurve ? byLength : byCurve;
  };
  const lo = rxLo > 0 ? rxLo : 0;
  const hi = rxHi > lo ? rxHi : lo;
  const atTop = Math.min(Math.max(base / sq, lo), hi);
  const want = Math.max(need(lo), need(hi), need(atTop), 8);
  const even = want + (want & 1);
  return even > SEGMENT_CAP ? SEGMENT_CAP : even;
}

/**
 * Parameter at a given x - the inverse of arcPointAt, so a caller can clip
 * the parameter range to the part of the arc that is on screen.
 * MUST stay identical to arcTau in threadShapeGLSL below.
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
 * along. MUST stay identical to arcAt in threadShapeGLSL below.
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
 * The law as GLSL ES 3.00, for the vertex shader to inline. Kept beside its
 * JS originals so the pair can never drift apart unnoticed; web-renderer
 * .test.js asserts the shader contains this text verbatim.
 *
 * threadShape is the curve's two radii; arcTau inverts x -> parameter and
 * arcAt is the curve and its tangent; sampleTau spends the strip's segments
 * on the piece that is on screen.
 */
export const threadShapeGLSL = `
const float ARC_HALF = 1.5707963;
vec2 threadShape(float rx, float squash){
  float r = max(rx, 0.);
  return vec2(r, r*squash);
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
}
float sampleTau(float t, float A, float P, float hLo, float hHi, float hw, float txLo, float txHi){
  float sLo = asin(clamp(hLo/A, 0., 1.));
  if (A <= hHi + ${glslFloat(SPLIT_MARGIN)}*hw) {
    float a0 = max(sLo, txLo);
    float a1 = max(min(P - sLo, txHi), a0);
    return mix(a0, a1, t);
  }
  float sHi = asin(clamp((hHi + ${glslFloat(SPLIT_MARGIN)}*hw)/A, 0., 1.));
  bool left = t < .5;
  float u = left ? t*2. : t*2. - 1.;
  float a0 = left ? sLo : P - sHi;
  float a1 = left ? sHi : P - sLo;
  a0 = max(a0, txLo);
  a1 = max(min(a1, txHi), a0);
  return mix(a0, a1, u);
}`;
/**
 * Height of the drawn curve above the baseline, `d` px in from the nearer
 * foot. THE one definition of the curve's shape: arcDistance hit-tests it and
 * the vertex shader draws it.
 *
 * @param {number} d - distance in x from the nearer foot, device px
 * @param {number} R - horizontal radius from threadShape()
 * @param {number} A - apex height from threadShape()
 */
export function arcHeight(d, R, A) {
  if (!(R > 0) || !(A > 0)) return 0;
  const s = d <= 0 ? 0 : (d >= R ? 1 : d / R);
  const u = 1 - s;
  return A * Math.sqrt(1 - u * u);
}

/** GLSL's smoothstep, for the ink law that mirrors the shader exactly. */
function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

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
 * @param {number} R - horizontal radius from threadShape()
 * @param {number} A - apex height from threadShape()
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
