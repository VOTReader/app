// @ts-nocheck
/* The frame's E2 and E3 parts in use-web-renderer.js (GL step 2): when a frame
   is in a gesture (the GL backing shrinks to GESTURE_DPR then, and the frame
   after it settles is whole), the backing a resize takes, the zoom kept
   relative to fit across a resize or a dpr change, the data-* attributes
   written only when they change, and the walks' flag. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gestureStep, backingOf, keepZoom, putAttr, walkOn, GESTURE_HOLD_MS } from './use-web-renderer.js';
import { backingScale, backingSize } from './web-renderer.js';
import { fitPPV } from '../../utils/scripture-web/geometry.js';

describe('E2: a frame in a gesture, and the settle frame after it', () => {
  it('the first frame is at rest; a moved camera is in a gesture until GESTURE_HOLD_MS after its last move', () => {
    const m = { seen: false, x: 0, y: 0, ppv: 0, movedAt: -1e9 };
    const cam = { x: 100, y: 0, ppv: 2 };
    expect(gestureStep(m, cam, 1000)).toBe(false);
    expect(gestureStep(m, cam, 1016)).toBe(false);
    cam.x = 101;
    expect(gestureStep(m, cam, 1032)).toBe(true);
    expect(gestureStep(m, cam, 1032 + GESTURE_HOLD_MS - 1)).toBe(true);
    // the settle frame: the camera has held still for the hold
    expect(gestureStep(m, cam, 1032 + GESTURE_HOLD_MS)).toBe(false);
    // a zoom and a lift are motion too, and each move restarts the hold
    cam.ppv = 2.5;
    expect(gestureStep(m, cam, 2000)).toBe(true);
    cam.y = 40;
    expect(gestureStep(m, cam, 2100)).toBe(true);
    expect(gestureStep(m, cam, 2100 + GESTURE_HOLD_MS - 1)).toBe(true);
    expect(gestureStep(m, cam, 2100 + GESTURE_HOLD_MS)).toBe(false);
  });

  it('on a 2.6 dpr phone a gesture draws a 2 dpr backing and the settle frame the whole one; a 2 dpr screen never shrinks', () => {
    expect(GESTURE_HOLD_MS).toBeGreaterThan(0);
    expect(GESTURE_HOLD_MS).toBeLessThanOrEqual(250);
    const W = 2317, H = 1069;
    expect([backingSize(W, backingScale(2.6, true)), backingSize(H, backingScale(2.6, true))]).toEqual([1782, 822]);
    expect([backingSize(W, backingScale(2.6, false)), backingSize(H, backingScale(2.6, false))]).toEqual([W, H]);
    expect(backingScale(2, true)).toBe(1);
  });
});

describe('E2: the backing a resize takes, and the zoom it keeps', () => {
  it('takes the device-pixel box when the browser gives one, else the CSS box times the dpr, rounded', () => {
    const entry = { devicePixelContentBoxSize: [{ inlineSize: 2317, blockSize: 1069 }] };
    expect(backingOf(entry, 2.6, 2.6, 891.2, 411.3)).toEqual({ W: 2317, H: 1069 });
    expect(backingOf(null, 2.6, 2.6, 891.2, 411.3)).toEqual({ W: Math.round(891.2 * 2.6), H: Math.round(411.3 * 2.6) });
    expect(backingOf({}, 1, 1, 1600, 900)).toEqual({ W: 1600, H: 900 });
    // a zero box (a hidden canvas) falls back rather than drawing nothing
    expect(backingOf({ devicePixelContentBoxSize: [{ inlineSize: 0, blockSize: 0 }] }, 2, 2, 400, 300)).toEqual({ W: 800, H: 600 });
    // past the dpr clamp (3) the device box is at the raw dpr, not the frame's: the CSS box is used
    expect(backingOf({ devicePixelContentBoxSize: [{ inlineSize: 1600, blockSize: 1200 }] }, 4, 3, 400, 300)).toEqual({ W: 1200, H: 900 });
  });

  it('refuses a device box that is not the CSS box at the dpr (headless Chrome\'s emulation reports CSS px there)', () => {
    // the GL step 2 phone run: 891 x 411 CSS px at dpr 2.6 came back as a 891 x 411 device box, and the
    // frame took a 343 CSS px wide world with the ruler over it (131 threads drawn at the overview)
    expect(backingOf({ devicePixelContentBoxSize: [{ inlineSize: 891, blockSize: 411 }] }, 2.6, 2.6, 891, 411))
      .toEqual({ W: 2317, H: 1069 });
    // a device box a snapped pixel off the CSS box is the exact one, and taken
    expect(backingOf({ devicePixelContentBoxSize: [{ inlineSize: 2318, blockSize: 1068 }] }, 2.6, 2.6, 891.2, 411.1))
      .toEqual({ W: 2318, H: 1068 });
  });

  it('keeps the zoom relative to fit, and the camera\'s height relative to the frame, across a resize or a dpr change', () => {
    const total = 31102;
    const cam = { x: 14000, y: 120, ppv: fitPPV({ total }, 1600) * 42.9, total };
    const camV = { ppv: 3 };
    // the window moves to a 2.6 dpr screen: 1600 device px become 2317
    keepZoom(cam, camV, 1600, 2317);
    expect(cam.ppv / fitPPV(cam, 2317)).toBeCloseTo(42.9, 9);
    expect(cam.y).toBeCloseTo(120 * (2317 / 1600), 9);
    expect(camV.ppv).toBeCloseTo(3 * (2317 / 1600), 12);
    // an unchanged width, the first resize, and an unset camera keep everything
    const same = { x: 1, y: 5, ppv: 7 };
    keepZoom(same, null, 2317, 2317);
    keepZoom(same, null, 0, 2317);
    expect(same).toEqual({ x: 1, y: 5, ppv: 7 });
    const unset = { x: 1, y: 0, ppv: 0 };
    keepZoom(unset, null, 1600, 800);
    expect(unset.ppv).toBe(0);
  });
});

describe('E3: the data-* attributes are written only when they change; the walks\' JSON only in a walk', () => {
  afterEach(() => { delete globalThis.__swWalk; });

  it('writes an attribute once per value, a --name as a style property, and starts afresh on another element', () => {
    const el = document.createElement('div');
    const set = vi.spyOn(el, 'setAttribute');
    const prop = vi.spyOn(el.style, 'setProperty');
    const cache = { el: null, vals: Object.create(null) };
    putAttr(el, cache, 'data-cam-y', '0.0');
    putAttr(el, cache, 'data-cam-y', '0.0');
    putAttr(el, cache, 'data-cam-y', '0.0');
    expect(set).toHaveBeenCalledTimes(1);
    putAttr(el, cache, 'data-cam-y', '12.5');
    expect(set).toHaveBeenCalledTimes(2);
    expect(el.getAttribute('data-cam-y')).toBe('12.5');
    putAttr(el, cache, '--sw-rail-top', '40px');
    putAttr(el, cache, '--sw-rail-top', '40px');
    expect(prop).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue('--sw-rail-top')).toBe('40px');
    const other = document.createElement('div');
    putAttr(other, cache, 'data-cam-y', '12.5');
    expect(other.getAttribute('data-cam-y')).toBe('12.5');
  });

  it('walkOn: on while a walk is reading (__swWalk) or a driven browser runs, off in the app', () => {
    const driven = typeof navigator !== 'undefined' && navigator.webdriver === true;
    expect(walkOn()).toBe(driven);
    globalThis.__swWalk = {};
    expect(walkOn()).toBe(true);
  });
});
