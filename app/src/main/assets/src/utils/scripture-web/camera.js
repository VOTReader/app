/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/camera — Cluster F (esbuild bundle-f.js)

   The camera both webs mount: a 2-D affine map from the world (verse index
   along x, height above the baseline in verse units along y) to device px.
   Pure data + pure functions — the screen owns the instance and mutates
   `x` / `y` / `ppv` imperatively during gestures (no React state per frame,
   per the GardenView doctrine). Moved out of geometry.js so the LAW (what a
   thread looks like) and the CAMERA (where the reader is) are two files:
   call 03 switches the law; My Web mounts the camera, one per rail.

   The y axis is opt-in per camera. A caller that hands `clampCamera` /
   `zoomAbout` a `yFrame = {base, squash, apexMax}` gets a vertical camera
   clamped to the world's height; a caller that hands none has a 1-D camera
   whose `y` is held at 0 — absence is the signal, so a rail that never asked
   for height can never drift off its baseline.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {{x:number, y:number, ppv:number, total:number}} Camera
 *   x, y — world position under the frame's centre column / baseline row
 *   (verse index; height in verse units); ppv — device px per verse.
 * @typedef {{base:number, squash:number, apexMax:number}} YFrame
 *   base — the baseline row, device px from the canvas top; squash — the
 *   frame's vertical squash (geometry.squashFactor); apexMax — the tallest
 *   apex in the world, verse units (the widest thread's span / 2).
 */

/** @param {number} total @returns {Camera} */
export function createCamera(total) {
  return { x: total / 2, y: 0, ppv: 0, total };
}

/** Pixels-per-verse at which the whole canon exactly fills the viewport. */
export function fitPPV(cam, width) { return width / cam.total; }

/** World height (verse units) → device y. `sy = base − (h − cam.y)·ppv·squash`. */
export function heightToY(cam, yf, h) {
  return yf.base - (h - cam.y) * cam.ppv * yf.squash;
}

/** Device y → world height (verse units): the inverse of heightToY. */
export function yToHeight(cam, yf, sy) {
  return cam.y + (yf.base - sy) / (cam.ppv * yf.squash);
}

/** How much world height the frame shows above the baseline row, verse units. */
export function bandHeight(cam, yf) {
  return yf.base / (cam.ppv * yf.squash);
}

/**
 * The highest the camera may go: the tallest apex just reaches the frame's
 * top. At the overview the band holds every apex and this is 0 — nothing to
 * pan, honestly, like a map at its bounds; depth opens the height.
 */
export function maxCamY(cam, yf) {
  const top = yf.apexMax - bandHeight(cam, yf);
  return top > 0 ? top : 0;
}

/**
 * Clamp zoom into [fit, maxZoom×fit], pan so the canon can't leave the
 * viewport, and hold y inside [0, maxCamY] — or at 0 when the caller has no
 * y frame, so a 1-D camera can never carry a stray height into its map.
 * Mutates in place — this runs per gesture frame.
 *
 * @param {Camera} cam
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

/**
 * The frame as a rectangle of the world, verse units: x from the left edge
 * to the right, y from the baseline row (cam.y) to the top edge. What the
 * index culls against and the shader clips to.
 * @param {Camera} cam
 * @param {number} width — viewport width, device px
 * @param {number} base — the baseline row, device px from the top
 * @param {number} squash — the frame's vertical squash
 * @returns {{xa:number, xb:number, y0:number, y1:number}}
 */
export function worldRect(cam, width, base, squash) {
  const half = width / cam.ppv / 2;
  const y0 = cam.y > 0 ? cam.y : 0;
  return { xa: cam.x - half, xb: cam.x + half, y0, y1: y0 + base / (cam.ppv * squash) };
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
 * Zoom about a fixed screen point — the anchor stays under the finger/cursor,
 * in both axes when the caller has a y frame and names a vertical anchor.
 * @param {Camera} cam
 * @param {number} width — viewport width, device px
 * @param {number} anchorX — device px to hold still
 * @param {number} factor — multiplicative zoom (>1 zooms in)
 * @param {number} maxZoom
 * @param {number} [anchorY] - device px to hold still vertically (needs yf)
 * @param {YFrame} [yf]
 */
export function zoomAbout(cam, width, anchorX, factor, maxZoom, anchorY, yf) {
  const verse = xToVerse(cam, width, anchorX);
  const height = (yf && anchorY != null) ? yToHeight(cam, yf, anchorY) : null;
  cam.ppv *= factor;
  clampCamera(cam, width, maxZoom, yf);
  cam.x = verse - (anchorX - width / 2) / cam.ppv;
  if (height != null) cam.y = height - (yf.base - anchorY) / (cam.ppv * yf.squash);
  return clampCamera(cam, width, maxZoom, yf);
}
