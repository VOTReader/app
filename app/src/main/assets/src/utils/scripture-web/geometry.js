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

/**
 * The vertical radius of an arc whose horizontal radius is `rx`.
 * MUST stay identical to arcRadiusGLSL below and to the shader that inlines it.
 * @param {number} rx — half the arc's on-screen span, device px
 * @param {number} ceil — usable height above the baseline, device px
 * @param {number} squash — squashFactor()
 * @param {number} localize — localizeFactor()
 */
export function arcRadiusY(rx, ceil, squash, localize) {
  const r = rx > 0 ? rx : 0;
  const semi = r * squash;
  const capped = ceil * Math.tanh(r / (Math.max(ceil, 1) * CEIL_SOFTNESS));
  return semi + (capped - semi) * localize;
}

/**
 * The same law as GLSL ES 3.00, for the vertex shader to inline. Kept beside
 * arcRadiusY so the two can never drift apart unnoticed.
 */
export const arcRadiusGLSL = `
float arcRadiusY(float rx, float ceil, float squash, float localize){
  float r = max(rx, 0.);
  float semi = r*squash;
  float capped = ceil * tanh(r/(max(ceil,1.)*${CEIL_SOFTNESS}));
  return mix(semi, capped, localize);
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
 * The arc is the upper half of an axis-aligned ellipse centred at (cx, base)
 * with radii (rx, ry). Rather than solving for the closest point (a quartic),
 * this takes the first-order distance to the implicit function
 * F = (u/rx)² + (v/ry)² − 1, i.e. |F| / |∇F|. That approximation is exact ON
 * the curve and accurate within a few px of it — which is the only place a
 * hit test ever asks.
 *
 * @param {number} px @param {number} py — query point, device px, y down
 * @param {number} x0 @param {number} x1 — arc endpoints on the baseline
 * @param {number} base — baseline y, device px
 * @param {number} ry — vertical radius from arcRadiusY()
 * @param {number} tol — hit tolerance, device px
 */
export function arcDistance(px, py, x0, x1, base, ry, tol) {
  const rx = (x1 - x0) * 0.5;
  if (rx <= 0.25) return Infinity;
  const cx = x0 + rx;
  if (px < cx - rx - tol || px > cx + rx + tol) return Infinity;
  const dy = base - py;
  if (dy < -tol || dy > ry + tol) return Infinity;
  const u = (px - cx) / rx, v = dy / ry;
  const f = u * u + v * v - 1;
  const gx = 2 * (px - cx) / (rx * rx), gy = 2 * dy / (ry * ry);
  const g = Math.hypot(gx, gy);
  if (g < 1e-9) return Infinity;
  return Math.abs(f) / g;
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
