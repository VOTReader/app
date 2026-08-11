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
