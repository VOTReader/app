/**
 * Two rails, two cameras — the gesture REDs (design-perf, 2026-09-11).
 *
 * Corbin: "Maybe I want to zoom into Rebuke [top] and on the bottom half zoom
 * into Isaiah, both should be able to happen at once." The gesture surface
 * hands every pinch, wheel and drag to ONE camera today; pointer y is read
 * for hover only. With deps.camFor(yDevice) the camera is the one under the
 * pointer: a wheel over the Volumes rail zooms the Volumes rail and leaves
 * the Bible rail's camera untouched, and the other way round; a pinch is
 * routed by its midpoint; a drag stays with the rail it started on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachWebGestures } from './gestures.js';
import { createCamera, clampCamera, zoomAbout, xToVerse, fitPPV } from '../../utils/scripture-web/geometry.js';

const W = 1000, H = 600, DPR = 1;
let root, detach, camB, camV, log;

function ptr(type, x, y, id = 1, extra = {}) {
  const e = new PointerEvent(type, Object.assign({ bubbles: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch' }, extra));
  root.dispatchEvent(e);
  return e;
}
function wheel(x, y, dy) {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: dy });
  root.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  root = document.createElement('div');
  root.className = 'sw-root';
  document.body.appendChild(root);
  camB = createCamera(31102); camB.ppv = fitPPV(camB, W);
  camV = createCamera(760); camV.ppv = fitPPV(camV, W);
  log = [];
  // the top rail owns y < 300 (device px), the Bible rail the rest
  detach = attachWebGestures(root, {
    loc: (e) => ({ x: e.clientX, y: e.clientY }), dpr: () => DPR,
    cam: () => camB,
    camFor: (y) => (y < 300 ? camV : camB),
    view: () => ({ W, H, DPR }),
    handlers: () => ({ hover() {}, tap() {}, doubleTap() {} }),
    schedule: () => log.push('draw'),
    maxZoom: () => 1000, clampCamera, zoomAbout, xToVerse,
  });
});
afterEach(() => { detach && detach(); root.remove(); });

describe('rail-aware gestures', () => {
  it('a wheel over the Volumes rail zooms the Volumes camera only', () => {
    const b0 = camB.ppv, v0 = camV.ppv;
    const e = wheel(500, 120, -280);
    expect(e.defaultPrevented).toBe(true);
    expect(camV.ppv / v0).toBeCloseTo(Math.exp(280 * 0.0021), 6);
    expect(camB.ppv).toBe(b0);
  });
  it('a wheel over the Bible rail zooms the Bible camera only', () => {
    const b0 = camB.ppv, v0 = camV.ppv;
    wheel(500, 480, -280);
    expect(camB.ppv / b0).toBeCloseTo(Math.exp(280 * 0.0021), 6);
    expect(camV.ppv).toBe(v0);
  });
  it('a drag that starts over the Volumes rail pans the Volumes camera and not the Bible camera', () => {
    zoomAbout(camV, W, 500, 10, 1000); zoomAbout(camB, W, 500, 10, 1000);
    const bx = camB.x, vx = camV.x;
    ptr('pointerdown', 500, 100);
    ptr('pointermove', 420, 100);
    ptr('pointerup', 420, 100);
    expect(camV.x).not.toBe(vx);
    expect(camV.x - vx).toBeCloseTo(80 / camV.ppv, 6);
    expect(camB.x).toBe(bx);
  });
  it('a pinch is routed by its midpoint, and both rails can hold different zooms at once', () => {
    const b0 = camB.ppv;
    // a pinch on the top half
    ptr('pointerdown', 400, 100, 1); ptr('pointerdown', 600, 100, 2);
    ptr('pointermove', 300, 100, 1); ptr('pointermove', 700, 100, 2);
    ptr('pointerup', 300, 100, 1); ptr('pointerup', 700, 100, 2);
    expect(camV.ppv / fitPPV(camV, W)).toBeCloseTo(2, 3);
    expect(camB.ppv).toBe(b0);
    // then a wheel on the bottom half: the top keeps its 2x
    wheel(500, 500, -280);
    expect(camV.ppv / fitPPV(camV, W)).toBeCloseTo(2, 3);
    expect(camB.ppv / b0).toBeCloseTo(Math.exp(280 * 0.0021), 6);
  });
  it('a surface with no camFor (the canon web) still zooms the one camera as before', () => {
    detach();
    detach = attachWebGestures(root, {
      loc: (e) => ({ x: e.clientX, y: e.clientY }), dpr: () => DPR, cam: () => camB,
      view: () => ({ W, H, DPR }), handlers: () => ({ hover() {}, tap() {}, doubleTap() {} }),
      schedule: () => {}, maxZoom: () => 1000, clampCamera, zoomAbout, xToVerse,
    });
    const b0 = camB.ppv;
    wheel(500, 120, -280);
    expect(camB.ppv / b0).toBeCloseTo(Math.exp(280 * 0.0021), 6);
  });
});
