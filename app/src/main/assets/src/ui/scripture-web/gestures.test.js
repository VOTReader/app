/**
 * scripture-web/gestures tests.
 *
 * Real dispatched DOM events, not a screenshot: this is the surface that
 * shipped untestable inline in ScriptureWebScreen's effect, so the
 * scripture-web-2/8 defect (a wheel over Nearby zoomed the canon; a
 * pointerdown in the Go-to field captured the pointer and panned) had
 * nothing to catch it. jsdom 30 implements PointerEvent for real, so these
 * use it directly rather than the MouseEvent-plus-defineProperty fallback
 * older jsdom would have needed.
 */
import { describe, it, expect, vi } from 'vitest';
import { attachWebGestures, SW_CHROME_SELECTOR, isChromeTarget } from './gestures.js';
import { createCamera, clampCamera, zoomAbout, xToVerse } from '../../utils/scripture-web/geometry.js';

/** `.sw-root` containing one of every chrome surface the selector lists. */
function makeDom() {
  const root = document.createElement('div');
  root.className = 'sw-root';
  const list = document.createElement('div');
  list.className = 'sw-list';
  const listBtn = document.createElement('button');
  list.appendChild(listBtn);
  const goto = document.createElement('div');
  goto.className = 'sw-goto';
  const input = document.createElement('input');
  goto.appendChild(input);
  const choice = document.createElement('div');
  choice.className = 'sw-choice';
  root.append(list, goto, choice);
  document.body.appendChild(root);
  return { root, list, listBtn, goto, input, choice };
}

function pointerEvent(type, opts) {
  return new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
    clientX: 0, clientY: 0, ...opts,
  });
}

/** Wires attachWebGestures onto `el` with a real, zoomed-in camera (fit-to-
 * width leaves no room to pan, so panning tests need to be zoomed past it). */
function attach(el) {
  const cam = createCamera(1000);
  clampCamera(cam, 1000, 4000);   // seeds ppv at fit-to-width
  cam.ppv = 10;                   // zoom in — now there is room to pan
  clampCamera(cam, 1000, 4000);
  const view = { W: 1000, H: 600, DPR: 1 };
  const handlers = { hover: vi.fn(), tap: vi.fn(), doubleTap: vi.fn() };
  const schedule = vi.fn();
  const detach = attachWebGestures(el, {
    loc: (e) => ({ x: e.clientX, y: e.clientY }),
    dpr: () => view.DPR, cam: () => cam, view: () => view,
    handlers: () => handlers, schedule, maxZoom: () => 4000,
    clampCamera, zoomAbout, xToVerse,
  });
  return { detach, cam, view, handlers, schedule };
}

describe('SW_CHROME_SELECTOR / isChromeTarget', () => {
  it('matches every declared chrome surface, including nested controls', () => {
    const { list, listBtn, goto, input, choice } = makeDom();
    expect(isChromeTarget(list)).toBe(true);
    expect(isChromeTarget(listBtn)).toBe(true);
    expect(isChromeTarget(goto)).toBe(true);
    expect(isChromeTarget(input)).toBe(true);
    expect(isChromeTarget(choice)).toBe(true);
  });
  it('does not match the open canvas root', () => {
    const { root } = makeDom();
    expect(isChromeTarget(root)).toBe(false);
    expect(isChromeTarget(null)).toBe(false);
  });
  it('still names the pre-existing surfaces (no regression on the original list)', () => {
    expect(SW_CHROME_SELECTOR).toContain('.sw-controls');
    expect(SW_CHROME_SELECTOR).toContain('.sw-topbar');
    expect(SW_CHROME_SELECTOR).toContain('.sw-sheet');
    expect(SW_CHROME_SELECTOR).toContain('.sw-tip');
    expect(SW_CHROME_SELECTOR).toContain('button');
  });
});

describe('wheel: chrome scrolls or selects natively, the open canvas zooms', () => {
  it('RED today: leaves a wheel over the Nearby list unprevented and the camera untouched', () => {
    const { root, list } = makeDom();
    const { cam } = attach(root);
    const before = cam.ppv;
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    list.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(cam.ppv).toBe(before);
  });
  it('prevents default and zooms over the open canvas', () => {
    const { root } = makeDom();
    const { cam, schedule } = attach(root);
    const before = cam.ppv;
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    root.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(cam.ppv).not.toBe(before);
    expect(schedule).toHaveBeenCalled();
  });
});

describe('pointerdown: chrome never captures the pointer or starts a pan', () => {
  it('RED today: a pointerdown in the Go-to input does not capture, and the drag it starts does not pan', () => {
    const { root, input } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam } = attach(root);
    const before = cam.x;
    input.dispatchEvent(pointerEvent('pointerdown', { clientX: 40 }));
    expect(root.setPointerCapture).not.toHaveBeenCalled();
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 140 }));
    expect(cam.x).toBe(before);
  });
  it('captures the pointer and pans from the open canvas', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam } = attach(root);
    const before = cam.x;
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 40 }));
    expect(root.setPointerCapture).toHaveBeenCalledWith(1);
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 140 }));
    expect(cam.x).not.toBe(before);
  });
});

describe('detach', () => {
  it('stops reacting to events once the returned detach function runs', () => {
    const { root } = makeDom();
    const { detach, cam, schedule } = attach(root);
    detach();
    const before = cam.ppv;
    root.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));
    expect(cam.ppv).toBe(before);
    expect(schedule).not.toHaveBeenCalled();
  });
});

/* Corbin, 2026-09-11: "fully zoomed into bible web, you can't grab the screen (pc or android)
   and move around". Measured in the walk browser (probe-sw-pan.mjs, 245a15c0): the drag ALONG
   the canon pans at the ceiling on both frames; what does not is a swipe ACROSS it — `moved`
   was read from x alone, so a 100 px perpendicular swipe ended as a TAP, opened the thread
   chooser over the canvas, and every drag after it started on the sheet and moved nothing.
   On a phone held sideways that is exactly "I dragged, nothing moved, a card was in the way". */
describe('a swipe across the canon is not a tap (w-sw-zoom-pan, item 1)', () => {
  it('RED today: a 100 px perpendicular swipe opens nothing, and the next drag along the canon pans', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam, handlers } = attach(root);
    const x0 = cam.x;
    // the swipe: down at (300, 200), straight down the glass to (300, 300), up
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    for (let i = 1; i <= 8; i++) root.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 200 + i * 12.5 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 300 }));
    expect(handlers.tap, 'a 100 px swipe must not read as a tap (it opens the chooser over the canvas)').not.toHaveBeenCalled();
    expect(handlers.doubleTap).not.toHaveBeenCalled();
    expect(cam.x, 'a perpendicular swipe pans nothing').toBe(x0);
    // the next drag, along the canon, pans by the dragged distance
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 200, clientY: 300 }));
    expect(cam.x - x0, 'the drag after the swipe pans 100 px = 10 verses at ppv 10').toBeCloseTo(10, 6);
    expect(handlers.tap).not.toHaveBeenCalled();
  });

  it('CONTROL — a real tap (no motion) still taps, and a 2 px tremor is still a tap', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    expect(handlers.tap).toHaveBeenCalledTimes(1);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 301, clientY: 202 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 301, clientY: 202 }));
    /* 400 ms apart would be two taps; the harness fires them within a tick, so the second lands
       as a double-tap — either way the tremor did not become a drag, which is what this pins. */
    expect(handlers.tap.mock.calls.length + handlers.doubleTap.mock.calls.length).toBe(2);
  });
});
