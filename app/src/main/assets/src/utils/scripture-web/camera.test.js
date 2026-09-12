/* camera.test.js — the 2-D camera both webs mount (w-sw-phase1, M0).
   ─────────────────────────────────────────────────────────────────────────
   Corbin, 2026-09-11: "you need to be able to use the same pan behavior for
   up and down and left and right and zoom in fully and zoom out regardless
   of on scripture web or my web". The y axis is a world axis (height in
   verse units) with an honest clamp: at the overview the whole dome fits
   and there is nothing to pan; depth opens the height (spine section 2).

   The frame below is the phone landscape frame the walks hold (800x360 CSS
   at DPR 2): base 520, ceil 512.2, squash 0.64 — ScriptureWebScreen's own
   frame() for that canvas, computed once here rather than imported, so a
   change to the screen's layout cannot silently move these numbers. apexMax
   is the shipped asset's widest thread: span 31,093 / 2 (read by
   sessions/2026-09-11-orchestrator/sw-phase1-visible-set.mjs). */
import { describe, it, expect } from 'vitest';
import {
  createCamera, fitPPV, clampCamera, zoomAbout, xToVerse,
  heightToY, yToHeight, bandHeight, maxCamY,
} from './camera.js';
import * as cameraLaw from './camera.js';

const TOTAL = 31102;
const W = 1600;                       // 800 CSS px at DPR 2
const YF = { base: 520, squash: 0.64, apexMax: 31093 / 2 };
const MAX_ZOOM = (44 * TOTAL) / 800;  // maxZoomFor(31102, 800) = 1710.6 (44 px/verse)
const CEIL_PPV = 44 * 2;              // 44 CSS px per verse, device px

const atFit = () => { const c = createCamera(TOTAL); c.ppv = fitPPV(c, W); return c; };
const atCeiling = () => { const c = createCamera(TOTAL); c.ppv = CEIL_PPV; return c; };

describe('the y affine (green today — the helpers landed with the move; these guard them)', () => {
  it('round-trips a height through device y at any camera', () => {
    const c = atCeiling(); c.y = 123.4;
    for (const h of [0, 1, 9.2, 130, 4000]) {
      expect(yToHeight(c, YF, heightToY(c, YF, h))).toBeCloseTo(h, 9);
    }
  });
  it('puts world height 0 on the baseline row when cam.y is 0, and lower when the camera has risen', () => {
    const c = atCeiling();
    expect(heightToY(c, YF, 0)).toBe(520);
    c.y = 10;
    expect(heightToY(c, YF, 0)).toBeGreaterThan(520);
  });
  it('band height: the phone ceiling shows 9.23 verses of height; fit shows 15,800 — more than the tallest apex', () => {
    expect(bandHeight(atCeiling(), YF)).toBeCloseTo(520 / (88 * 0.64), 2);
    expect(bandHeight(atFit(), YF)).toBeGreaterThan(YF.apexMax);
    expect(maxCamY(atFit(), YF)).toBe(0);
    expect(maxCamY(atCeiling(), YF)).toBeCloseTo(YF.apexMax - 520 / (88 * 0.64), 2);
  });
});

describe('the y camera clamps to the world (RED at e27818cb: clampCamera ignores y)', () => {
  it('at fit the y camera is clamped to 0 whatever is asked', () => {
    const c = atFit();
    c.y = 900;
    clampCamera(c, W, MAX_ZOOM, YF);
    expect(c.y, 'y at the overview').toBe(0);
  });

  it('at the 44 px ceiling on the 800x360 frame y pans to apexMax - band = 15,537 verses and no further', () => {
    const c = atCeiling();
    c.y = 1e9;
    clampCamera(c, W, MAX_ZOOM, YF);
    expect(c.y).toBeCloseTo(15546.5 - 520 / (88 * 0.64), 2);
    c.y = -5;
    clampCamera(c, W, MAX_ZOOM, YF);
    expect(c.y, 'never below the baseline').toBe(0);
    c.y = 100;
    clampCamera(c, W, MAX_ZOOM, YF);
    expect(c.y, 'inside the range it is left alone').toBe(100);
  });

  it('zoomAbout holds a point 200 verses up a thread still in both axes', () => {
    const c = atCeiling();
    c.ppv = 8; c.y = 100;
    clampCamera(c, W, MAX_ZOOM, YF);
    const ax = 400, ay = 100;                       // device px, a point high in the frame
    const verse0 = xToVerse(c, W, ax);
    const h0 = yToHeight(c, YF, ay);
    expect(h0).toBeGreaterThan(150);                // the point really is up the thread
    zoomAbout(c, W, ax, 2, MAX_ZOOM, ay, YF);
    expect(xToVerse(c, W, ax)).toBeCloseTo(verse0, 6);
    expect(yToHeight(c, YF, ay), 'the height under the pointer').toBeCloseTo(h0, 6);
    zoomAbout(c, W, ax, 1 / 2, MAX_ZOOM, ay, YF);
    expect(yToHeight(c, YF, ay), 'and back out').toBeCloseTo(h0, 6);
  });

  it('CONTROL — a camera handed no y frame keeps y = 0 after every y form (the My Web rails, phase 1)', () => {
    const c = atCeiling();
    c.y = 50;
    clampCamera(c, W, MAX_ZOOM);
    expect(c.y).toBe(0);
    c.y = 50;
    zoomAbout(c, W, 400, 2, MAX_ZOOM);
    expect(c.y).toBe(0);
  });
});

describe('worldRect — the frame as a rectangle of the world (M2)', () => {
  // off the module object so the file loads on the base tree, where it is undefined
  const { worldRect } = /** @type {any} */ (cameraLaw);
  it('at the phone ceiling: 18.18 verses wide about cam.x, the band 9.23 verses tall from the baseline', () => {
    const c = createCamera(TOTAL);
    c.x = 15000; c.ppv = 88;
    const rect = worldRect(c, W, 520, 0.64);
    expect(rect.xa).toBeCloseTo(15000 - 9.0909, 3);
    expect(rect.xb).toBeCloseTo(15000 + 9.0909, 3);
    expect(rect.y0).toBe(0);
    expect(rect.y1).toBeCloseTo(520 / (88 * 0.64), 9);
  });

  it('a raised camera lifts the band: y0 is cam.y and the height is unchanged', () => {
    const c = createCamera(TOTAL);
    c.x = 15000; c.ppv = 88; c.y = 40;
    const rect = worldRect(c, W, 520, 0.64);
    expect(rect.y0).toBe(40);
    expect(rect.y1 - rect.y0).toBeCloseTo(bandHeight(c, { base: 520, squash: 0.64, apexMax: 15551 }), 9);
  });
});
