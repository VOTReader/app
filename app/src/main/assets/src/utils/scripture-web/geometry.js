/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/geometry — Cluster F (bundle-d since lz1; lazy bundle-f before)

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

   The second law here is the fly-over leg (Q3 ii): at depth an arc with
   neither foot near the viewport draws thinner, at FLYOVER_LEG_WIDTH of its
   width (sw-ink.js), its alpha unchanged (`flyOverGLSL`; arcAnchored +
   flyOverWidth). Nothing dims as the reader zooms (Q2): the lens that kept
   the rest of the web at 0.35 is retired, and the chapter under the centre
   is emphasised instead (web-frame.centreRange, the shader's uCentre).

   The third is the span-ink law (w4 INK, item 2; `spanInkGLSL`): a
   thread's ink weight is its own span's, fixed at every zoom. Short spans
   are inked up to 1 + SHORT_GAIN times and keep the stroke law's width, so
   they read first (the violet feet of the overview, the vivid local domes
   deep in); a long thread is held at the overview's hairline, widened by
   its votes alone, so deep in its legs are thin coloured lines. Nothing
   brightens or dims with the zoom that was not already the stroke law's.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Retired with the lens (Q2, 2026-10: nothing dims as the reader zooms). The
 * lens kept every thread outside the chapter under the centre at 0.35 of its
 * ink; the centre chapter is now emphasised instead and the rest is left
 * exactly as it was. This returns 1 for every range so the one remaining
 * caller (overlay-renderer.js's pills, canvas-owned) dims nothing; it goes
 * when that call does (CONTRACTS.md section 5).
 * @param {number} _lo @param {number} _hi - inclusive verse range
 * @param {(number[]|null)} _lens
 * @param {number} [_share]
 * @returns {number} 1
 */
export function lensDimFor(_lo, _hi, _lens, _share) {
  return 1;
}

/** Zoom (× fit) at which the semicircle→ceiling crossover starts and ends. */
export const LOCALIZE_START = 6;
export const LOCALIZE_END = 24;

/**
 * How far the semicircle→ceiling crossover has progressed, and how strongly
 * fly-over arcs thin to their legs. 0 at overview, 1 once zoomed well in.
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

/** The overview's stroke, CSS px: ribbonStyle's at fit, and the hairline the span-ink law holds a
 *  long thread to at every zoom (its votes widen it deep in, by STROKE_DEEP_CSS / STROKE_MIN_CSS at most). */
export const STROKE_FIT_CSS = 0.9;

/**
 * The alpha and stroke law, as ONE export both the screen and the probes
 * read. It used to live inline in ScriptureWebScreen's draw(), where no
 * harness could import it, so every instrument re-typed it and would have
 * silently measured the old law against a new screen.
 *
 *
 * @param {number} zoom - multiple of fit-to-width
 * @param {number} localize - localizeFactor()
 * @param {number} anchoredPerCssPx - anchored arcs per CSS px of viewport width
 * @returns {{alpha:number, strokeWidthCss:number, voteMix:number}}
 */
export function ribbonStyle(zoom, localize, anchoredPerCssPx) {
  const l2 = Math.log2(zoom > 0 ? zoom : 1);
  const alpha = Math.min(0.075 + l2 * 0.028, 0.19);
  const strokeWidthCss = Math.min(STROKE_FIT_CSS + l2 * 0.16, STROKE_DEEP_CSS);
  const t = smoothstep(0.55, 1, localize);
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
    strokeWidthCss: strokeWidthCss + (STROKE_DEEP_CSS - strokeWidthCss) * t,
    voteMix: t,
  };
}

/** How far outside the viewport a thread's body still counts as in the frame,
 *  device px: the tessellation reaches this far past each side and the top. */
export const CLIP_MARGIN = 32;

/**
 * Farthest the drawn ribbon's centre may stray from the true curve, CSS px,
 * at every zoom (E1). The samples are pushed out from the ellipse's centre
 * (arcPush) so the chords straddle the curve, and the segment count is the
 * fewest that keep both the pushed samples and the chords' middles inside
 * this bound (frameSegments).
 */
export const TESS_TOL_CSS = 0.25;
/** Most segments one thread may take (a safety rail: the frame bounds the
 *  count well under it, ~45 for a 1600 px frame at the overview). */
export const TESS_CAP = 255;
/** How far below the ruler's top a body still counts as in the frame, CSS px:
 *  the scissor's own device px plus the widest ribbon's half and skirt. */
export const FRAME_PAD_LOW_CSS = 3;

/**
 * The heights a thread's body must reach to touch the frame, device px above
 * its baseline as drawn (base + camY): from the ruler's top (the scissor at
 * base, less FRAME_PAD_LOW_CSS) up to the frame's top (plus CLIP_MARGIN).
 * @param {number} base - the frame's baseline row, device px
 * @param {number} camY - the camera's height, device px (0 at the baseline)
 * @param {number} dpr
 * @param {number[] | Float64Array} [out] - receives [hLo, hHi] (a fresh array when not given)
 * @returns {number[] | Float64Array} [hLo, hHi]
 */
export function frameHeights(base, camY, dpr, out) {
  const y = camY > 0 ? camY : 0;
  const o = out || [0, 0];
  o[0] = y - FRAME_PAD_LOW_CSS * (dpr > 0 ? dpr : 1);
  o[1] = base + y + CLIP_MARGIN;
  return o;
}

const HALF_PI = Math.PI / 2;

/**
 * THE PIECE OF A THREAD THE FRAME SHOWS (E1): its parameter interval
 * [out[0], out[1]] (0..pi, the ellipse's angle from the left foot, as
 * arcPointAt reads it), or false when no part of its body touches the frame.
 *
 * The frame is x in [-CLIP_MARGIN, width + CLIP_MARGIN] and a height in
 * [hLo, hHi] (frameHeights). The x window cuts the parameter at the window's
 * edges; the heights cut each leg: the left leg runs [td, tc] and the right
 * [pi - tc, pi - td], where sin(tc) = hHi / A and sin(td) = hLo / A (the
 * whole arch when it is lower than the frame's top; from the foot when the
 * baseline is in the frame). The interval is the hull of the two legs' cut
 * pieces: a thread whose crown climbs past the frame's top with both legs in
 * it is sampled across its crown too, which costs segments and never draws
 * anything wrong. This is the height-aware cull: a thread whose span crosses
 * the frame while its body passes far above or below it is not drawn,
 * counted, labelled or picked, because nothing of it is there to see.
 *
 * Every parameter comes from 2 asin(sqrt(u / 2)), the stable form of
 * acos(1 - u) (arcTauOf), which loses the small angles a foot needs to
 * float32 at the ceiling. MUST stay identical to arcFrameTau in
 * arcFrameGLSL below.
 *
 * @param {number} x0 @param {number} x1 - the feet, device px (footX), x0 left
 * @param {number} width - viewport width, device px
 * @param {number} A - apex height (arcShape)
 * @param {number} hLo @param {number} hHi - frameHeights()
 * @param {number[] | Float64Array} out - receives the interval
 * @returns {boolean}
 */
export function arcFrameTau(x0, x1, width, A, hLo, hHi, out) {
  const r = (x1 - x0) * 0.5;
  const m = CLIP_MARGIN;
  if (!(r > 0) || x1 < -m || x0 > width + m || !(A > 0) || hLo > A || hHi < 0) return false;
  // the whole arch in the frame (every overview thread): what the cuts below give, without them
  if (x0 >= -m && x1 <= width + m && A <= hHi && hLo <= 0) { out[0] = 0; out[1] = Math.PI; return true; }
  const ua = ((x0 > -m ? x0 : -m) - x0) / (2 * r);
  const ub = ((x1 < width + m ? x1 : width + m) - x0) / (2 * r);
  const ta = 2 * Math.asin(Math.sqrt(ua < 0 ? 0 : (ua > 1 ? 1 : ua)));
  const tb = 2 * Math.asin(Math.sqrt(ub < 0 ? 0 : (ub > 1 ? 1 : ub)));
  const tc = hHi >= A ? HALF_PI : Math.asin(hHi / A);
  const td = hLo > 0 ? Math.asin(hLo / A) : 0;
  const l0 = ta > td ? ta : td, l1 = tb < tc ? tb : tc;
  const r0 = ta > Math.PI - tc ? ta : Math.PI - tc, r1 = tb < Math.PI - td ? tb : Math.PI - td;
  const left = l1 >= l0, right = r1 >= r0;
  if (!left && !right) return false;
  out[0] = left ? l0 : r0;
  out[1] = right ? r1 : l1;
  return true;
}

/**
 * Segments for one thread's piece in the frame (E1): chosen by its own
 * on-screen size at every zoom, so no drawn point strays more than
 * TESS_TOL_CSS from the true curve. Exact, not a small-angle estimate: the
 * half-ellipse is the affine image of a half-circle, which keeps chords,
 * midpoints and parallel tangents, so a step dTau in its parameter strays
 * from its chord by (1 - cos(dTau / 2)) times the centre's distance to the
 * tangent there, r A / |r'| <= max(r, A). Pushing every sample out from the
 * centre by arcPush(dTau) = tan^2(dTau / 4) of its own distance puts the
 * samples outside and the chords' middles inside by the same amount, at
 * most tan^2(dTau / 4) max(r, A); so dTau = 4 atan(sqrt(tol / max(r, A))).
 * The S3 sweep in depth.test.js measures it against an independent
 * point-to-ellipse oracle. A thread smaller than the tolerance takes one
 * segment.
 * @param {number} t0 @param {number} t1 - arcFrameTau's interval
 * @param {number} r - half the span on screen, device px
 * @param {number} A - apex height, device px
 * @param {number} dpr
 * @returns {number} 1..TESS_CAP
 */
export function frameSegments(t0, t1, r, A, dpr) {
  const m = r > A ? r : A;
  if (!(m > 0)) return 1;
  const tol = TESS_TOL_CSS * (dpr > 0 ? dpr : 1);
  const n = Math.ceil((t1 - t0) / (4 * Math.atan(Math.sqrt(tol / m))));
  return n < 1 ? 1 : (n > TESS_CAP ? TESS_CAP : n);
}

/**
 * How far a sample is pushed out from the ellipse's centre, as a share of
 * its own distance from it: tan^2(dTau / 4) for a parameter step dTau, so
 * each chord straddles the curve instead of cutting inside it
 * (frameSegments has the derivation). MUST stay identical to arcPush in
 * arcFrameGLSL below.
 * @param {number} dTau
 */
export function arcPush(dTau) {
  const t = Math.tan(dTau * 0.25);
  return t * t;
}

/**
 * The same two laws as GLSL ES 3.00, for the main pass's vertex stage
 * (web-renderer.js) to inline; web-renderer.test.js asserts it does, and
 * structure-law.test.js transliterates this text and runs it against the JS.
 */
export const arcFrameGLSL = `
vec2 arcFrameTau(float x0, float x1, float width, float A, float hLo, float hHi){
  float r = (x1 - x0)*.5;
  float m = ${glslFloat(CLIP_MARGIN)};
  if (r <= 0. || x1 < -m || x0 > width + m || A <= 0. || hLo > A || hHi < 0.) return vec2(1., 0.);
  if (x0 >= -m && x1 <= width + m && A <= hHi && hLo <= 0.) return vec2(0., ${glslFloat(Math.PI)});
  float ua = (max(x0, -m) - x0)/(2.*r);
  float ub = (min(x1, width + m) - x0)/(2.*r);
  float ta = 2.*asin(sqrt(clamp(ua, 0., 1.)));
  float tb = 2.*asin(sqrt(clamp(ub, 0., 1.)));
  float tc = hHi >= A ? ${glslFloat(HALF_PI)} : asin(hHi/A);
  float td = hLo > 0. ? asin(hLo/A) : 0.;
  float l0 = max(ta, td), l1 = min(tb, tc);
  float r0 = max(ta, ${glslFloat(Math.PI)} - tc), r1 = min(tb, ${glslFloat(Math.PI)} - td);
  bool left = l1 >= l0, right = r1 >= r0;
  if (!left && !right) return vec2(1., 0.);
  return vec2(left ? l0 : r0, right ? r1 : l1);
}
float arcPush(float dTau){
  float t = tan(dTau*.25);
  return t*t;
}`;
/** The top pass's chord tolerance, CSS px: the chosen line is 3 px of gold
 *  under a soft halo, and a 0.5 px chord reads on it as a facet. */
export const TOP_CHORD_TOL_CSS = 0.1;
/** The top pass's longest segment, CSS px, over the parameter's widest step. */
export const TOP_SEGMENT_CSS = 10;
/** The top pass's fewest segments for a thread on screen. */
export const TOP_SEGMENT_MIN = 16;

/**
 * Segments for ONE thread in the top pass (web-renderer.js: the chosen,
 * hovered and lit lines, the prophecy class), so its visible piece shows no
 * facet. The top pass always clips the parameter to the window's x range
 * and samples it uniformly; two bounds, the larger wins, then the cap:
 *   BEND: a parameter step dTau strays at most max(R, A) dTau^2 / 8 from its
 *     chord, so the window's parameter span over sqrt(8 tol / max(R, A));
 *   LENGTH: the curve's speed is at most max(R, A) per unit of parameter, so
 *     the span times that over TOP_SEGMENT_CSS.
 * A caller drawing several threads in one draw takes the largest (the
 * renderer caps a set: 512 for the one chosen or hovered line, less for a
 * set). A thread with nothing in the window gets TOP_SEGMENT_MIN.
 *
 * @param {number} x0 @param {number} x1 - the feet, device px (footX)
 * @param {number} width - viewport width, device px
 * @param {number} squash - squashFactor()
 * @param {number} dpr - device px per CSS px
 * @param {number} cap - most segments
 * @returns {number}
 */
export function topSegmentsFor(x0, x1, width, squash, dpr, cap) {
  const d = dpr > 0 ? dpr : 1;
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const rx = (right - left) / 2;
  const top = cap > TOP_SEGMENT_MIN ? cap : TOP_SEGMENT_MIN;
  if (!(rx > 0)) return TOP_SEGMENT_MIN;
  const lo = Math.max(left, -CLIP_MARGIN), hi = Math.min(right, width + CLIP_MARGIN);
  if (!(hi > lo)) return TOP_SEGMENT_MIN;
  // arcShape(rx, squash) inline, so a frame's top pass allocates nothing
  const R = rx, A = rx * (squash > 0 ? squash : 1);
  const span = arcTauOf(hi, left, right) - arcTauOf(lo, left, right);
  const bound = Math.max(R, A, 1);
  const byBend = span * Math.sqrt(bound / (8 * TOP_CHORD_TOL_CSS * d));
  const byLength = (span * bound) / (TOP_SEGMENT_CSS * d);
  const want = Math.ceil(byBend > byLength ? byBend : byLength);
  return want < TOP_SEGMENT_MIN ? TOP_SEGMENT_MIN : (want > top ? top : want);
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
 * through the real compiler (ANGLE): the retired FLYOVER_FLOOR = 0.35 linked; = 1 failed
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
 * The width multiplier the shader applies to a fly-over (Q3 ii): 1 while the
 * reader is at the overview, easing to `leg` (sw-ink FLYOVER_LEG_WIDTH, 0.7)
 * for a thread with neither foot near the viewport as they localize. Its
 * ALPHA is left alone: the old law faded fly-overs to a floor, and a line
 * zoomed into the middle of (both feet carried off screen) is exactly the
 * line the reader is chasing. Thinner legs let the anchored weave read
 * without taking any line away. `leg` is a parameter, not an import, so this
 * module stays free of the ink table (sw-ink.js imports glslFloat from here).
 *
 * MUST stay identical to flyOverWidth in flyOverGLSL below.
 *
 * @param {number} anchored - arcAnchored(), 0 or 1
 * @param {number} localize - the fly-over's localize (skyLocalize)
 * @param {number} leg - the fly-over's share of its width, 0..1
 */
export function flyOverWidth(anchored, localize, leg) {
  const target = leg + (1 - leg) * anchored;
  return 1 + (target - 1) * localize;
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
float flyOverWidth(float anchored, float localize, float leg){
  return mix(1., mix(leg, 1., anchored), localize);
}`;

/* ── THE SPAN-INK LAW (w4 INK, item 2) ─────────────────────────────────────
   Q3 (ii): short spans read first. The r2-01a picture pools its violet at the
   feet and the r3-03 picture keeps vivid local domes deep in, with the long
   threads' legs thin coloured lines through them; the stroke law alone drew
   every thread alike, so the many long legs out-inked the short arcs they
   cross. The weight is a constant of the arc (its span), never of the zoom
   (C14, dead end 3), and nothing is hidden or capped in height (C18). */

/** The distance ramp's exponent: a span's t is pow(span / total, SPAN_T_EXP), the shader's colour input. */
export const SPAN_T_EXP = 0.40;
/** The ramp's t over which a thread eases from short (1) to long (0): about 10 verses to 318, the
 *  ramp's magenta-violet first stretch (palette.DISTANCE_RAMP). */
export const SHORT_T0 = 0.04;
export const SHORT_T1 = 0.16;
/** The shortest spans' extra ink: their alpha times 1 + SHORT_GAIN, clamped to full ink. */
export const SHORT_GAIN = 4;

/**
 * A span's place on the distance ramp, 0..1: the t the shader colours it by.
 * MUST stay identical to spanT in spanInkGLSL below (span-ink.test.js runs the twin).
 * @param {number} span  to - from, verses (either sign)
 * @param {number} total  verses in the canon
 */
export function spanT(span, total) {
  return Math.pow(Math.abs(span) / total, SPAN_T_EXP);
}

/** How short a thread is, 1 (up to ~10 verses) .. 0 (~318 and more), eased (C20). @param {number} t spanT */
export function spanShortness(t) {
  return 1 - smoothstep(SHORT_T0, SHORT_T1, t);
}

/** The alpha multiplier of a thread that short: 1 + SHORT_GAIN at the shortest, 1 for a long one. */
export function spanGain(shortness) {
  return 1 + SHORT_GAIN * shortness;
}

/**
 * The half width a long thread is held to: the overview's hairline (widthFit = STROKE_FIT_CSS
 * device px a CSS px), widened by the share of the deep stroke its votes earned (wScale over the
 * lowest vote's, at the voteMix the stroke law has reached), so the lowest-vote leg keeps exactly
 * the overview's hairline at every zoom and the best-voted at most STROKE_DEEP / STROKE_MIN of it.
 * @param {number} widthFit  STROKE_FIT_CSS x dpr, device px
 * @param {number} wScale  the main pass's vote width share (1 at the overview)
 * @param {number} voteMix  ribbonStyle's voteMix
 */
export function spanFitHalf(widthFit, wScale, voteMix) {
  return (widthFit * 0.5 * wScale) / (1 + (STROKE_MIN_CSS / STROKE_DEEP_CSS - 1) * voteMix);
}

/**
 * A thread's half width under the law: a short one keeps the stroke law's (halfW), a long one is
 * held to fitHalf, eased between by its shortness. Never wider than halfW.
 */
export function spanHalfWidth(halfW, fitHalf, shortness) {
  const held = halfW < fitHalf ? halfW : fitHalf;
  return held + (halfW - held) * shortness;
}

/** The same five functions as GLSL ES 3.00, for the vertex shader to inline. */
export const spanInkGLSL = `
float spanT(float span, float total){
  return pow(abs(span)/total, ${glslFloat(SPAN_T_EXP)});
}
float spanShortness(float t){
  return 1. - smoothstep(${glslFloat(SHORT_T0)}, ${glslFloat(SHORT_T1)}, t);
}
float spanGain(float shortness){
  return 1. + ${glslFloat(SHORT_GAIN)}*shortness;
}
float spanFitHalf(float widthFit, float wScale, float voteMix){
  return widthFit*.5*wScale/mix(1., ${glslFloat(STROKE_MIN_CSS / STROKE_DEEP_CSS)}, voteMix);
}
float spanHalfWidth(float halfW, float fitHalf, float shortness){
  return mix(min(halfW, fitHalf), halfW, shortness);
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
 * THE SKY (structure-law.md, landing 9). As the reader rises off the
 * baseline, the fly-over law lets go: a thread whose feet are both out of
 * frame is what the sky is made of, so at the ceiling's height it keeps its
 * full width. Linear in the camera's height over the frame's ceiling; only
 * the fly-over leg reads this - the clip of the samples onto the viewport
 * and the ribbon's alpha law keep the zoom's own localize, or the sky would
 * draw a visible piece as one chord.
 * @param {number} localize - localizeFactor(zoom)
 * @param {number} camY - the camera's height, device px (0 at the baseline)
 * @param {number} ceil - the frame's ceiling, device px
 */
export function skyLocalize(localize, camY, ceil) {
  const rise = camY > 0 && ceil > 0 ? Math.min(1, camY / ceil) : 0;
  return localize * (1 - rise);
}

/**
 * The altitude ruler's marks: the heights the reader can name, in verses of
 * span, each drawn where a thread of that span would crown.
 */
export const ALTITUDE_MARKS = [
  { span: 30, name: 'a chapter' },
  { span: 1000, name: 'a book' },
  { span: 15000, name: 'a testament' },
  { span: 31102, name: 'the canon' },
];

/**
 * The span (verses) whose apex stands h device px above the baseline: the
 * inverse of arcShape, A = rx * squash with rx = span * ppv / 2. 0 for a
 * height at or below the baseline.
 * @param {number} h @param {number} ppv @param {number} squash
 */
export function spanAtHeight(h, ppv, squash) {
  if (!(h > 0) || !(ppv > 0) || !(squash > 0)) return 0;
  return (2 * h) / (ppv * squash);
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
 * `right` is what the docked panel covers on the view's right, device px (the
 * w3 review's major finding: with the view's own edges as the bound, the
 * canon's last right / ppv verses could never stand in the canvas area the
 * panel leaves). It is slack on the canon's END bound only: the camera may
 * move on until the canon's last verse meets the canvas area's right edge,
 * so the area, not the view, is what holds the canon there; the start keeps
 * the view's left edge, which the panel never covers. At fit that lets the
 * overview slide left by the panel's width. 0 (the default) is the view's
 * own bound, as before.
 *
 * @param {{x:number, y?:number, ppv:number, total:number}} cam
 * @param {number} width — viewport width, device px
 * @param {number} maxZoom — multiple of fit
 * @param {YFrame} [yf] - absent: a 1-D camera
 * @param {number} [right] - device px the panel covers on the right (0: none)
 */
export function clampCamera(cam, width, maxZoom, yf, right) {
  const min = fitPPV(cam, width);
  const max = min * (maxZoom || 5000);
  if (!(cam.ppv > 0)) cam.ppv = min;
  cam.ppv = Math.min(Math.max(cam.ppv, min), max);
  const half = width / cam.ppv / 2;
  const slack = right > 0 ? right / cam.ppv : 0;
  const lo = Math.min(half, cam.total / 2);
  const hi = Math.max(cam.total - half, cam.total / 2) + slack;
  cam.x = Math.min(Math.max(cam.x, lo), hi);
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
 * @param {number} [right] - the panel's slack, device px (clampCamera)
 */
export function zoomAbout(cam, width, anchorX, factor, maxZoom, yf, anchorY, right) {
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
  clampCamera(cam, width, maxZoom, yf, right);
  cam.x = verse - (anchorX - width / 2) / cam.ppv;
  return clampCamera(cam, width, maxZoom, yf, right);
}
