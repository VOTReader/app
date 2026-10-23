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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachWebGestures, SW_CHROME_SELECTOR, isChromeTarget, LONG_PRESS_MS } from './gestures.js';
import { createCamera, clampCamera, zoomAbout, xToVerse } from '../../utils/scripture-web/geometry.js';

/** `.sw-root` containing one of every chrome surface the selector lists. */
function makeDom() {
  const root = document.createElement('div');
  root.className = 'sw-root';
  const list = document.createElement('div');
  list.className = 'sw-list';
  const listBtn = document.createElement('button');
  list.appendChild(listBtn);
  // a bare input outside any `.sw-*` wrapper: the selector's `input` entry
  // must catch it alone (the `.sw-goto` field it once sat in is gone)
  const input = document.createElement('input');
  const choice = document.createElement('div');
  choice.className = 'sw-choice';
  root.append(list, input, choice);
  document.body.appendChild(root);
  return { root, list, listBtn, input, choice };
}

function pointerEvent(type, opts) {
  return new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
    clientX: 0, clientY: 0, ...opts,
  });
}

/** Wires attachWebGestures onto `el` with a real, zoomed-in camera (fit-to-
 * width leaves no room to pan, so panning tests need to be zoomed past it). */
function attach(el, extra = {}) {
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
    clampCamera, zoomAbout, xToVerse, ...extra,
  });
  return { detach, cam, view, handlers, schedule };
}

describe('the elevator (landing 14): a pointer down on the track drives the lift, not the pan, and never taps the web', () => {
  // deps.lift answers a function of y for x >= 976 (the right 24 px), null elsewhere
  const lifted = [];
  const lift = (x, _y) => (x >= 976 ? (yy) => { lifted.push(yy); } : null);

  it('a drag that starts on the track lifts at every move and does not pan x; the finger lifting is not a tap', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    lifted.length = 0;
    const { cam, handlers } = attach(root, { lift });
    const before = cam.x;
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 990, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 990, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 900, clientY: 100 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 900, clientY: 100 }));
    expect(lifted).toEqual([200, 100]);
    expect(cam.x).toBe(before);
    expect(handlers.tap).not.toHaveBeenCalled();
    expect(handlers.doubleTap).not.toHaveBeenCalled();
  });

  it('a tap on the track lifts once, and a second tap on it is not a double-tap zoom', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    lifted.length = 0;
    const { handlers } = attach(root, { lift });
    for (let i = 0; i < 2; i++) {
      root.dispatchEvent(pointerEvent('pointerdown', { clientX: 990, clientY: 150 }));
      root.dispatchEvent(pointerEvent('pointerup', { clientX: 990, clientY: 150 }));
    }
    expect(lifted).toEqual([150, 150]);
    expect(handlers.tap).not.toHaveBeenCalled();
    expect(handlers.doubleTap).not.toHaveBeenCalled();
  });

  it('CONTROL: off the track the web pans and taps as before', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    lifted.length = 0;
    const { cam, handlers } = attach(root, { lift });
    const before = cam.x;
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 40, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 300 }));
    expect(cam.x).not.toBe(before);
    expect(lifted).toEqual([]);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 400, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 300 }));
    expect(handlers.tap).toHaveBeenCalledTimes(1);
  });
});

describe('SW_CHROME_SELECTOR / isChromeTarget', () => {
  it('matches every declared chrome surface, including nested controls', () => {
    const { list, listBtn, input, choice } = makeDom();
    expect(isChromeTarget(list)).toBe(true);
    expect(isChromeTarget(listBtn)).toBe(true);
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

  it('CONTROL: a real tap (no motion) still taps, and a fingertip tremor inside its slop is still a tap', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    expect(handlers.tap).toHaveBeenCalledTimes(1);
    // far from the first tap, so it is a second tap and not a double
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 600, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 601, clientY: 202 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 601, clientY: 202 }));
    expect(handlers.tap).toHaveBeenCalledTimes(2);
    expect(handlers.doubleTap).not.toHaveBeenCalled();
  });
});

/* W52: a finger on a control is the control's for its whole life. Its down was
   already ignored, but its move, up and cancel were not: while another finger
   held the canvas, sliding on a button panned the web, lifting off the button
   tapped the thread beneath it, and a cancel on it dropped the other finger's
   drag. Events of a pointer the gesture code never registered are ignored. */
describe('pointers that went down on a control never steer the canvas (W52)', () => {
  it('a second finger on a button neither pans, taps, nor ends the first finger\'s drag', () => {
    const { root, listBtn } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam, handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 500, clientY: 300 }));
    listBtn.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 100, clientY: 50 }));
    const before = cam.x;
    listBtn.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 300, clientY: 50 }));
    expect(cam.x).toBe(before);
    listBtn.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 300, clientY: 50 }));
    expect(handlers.tap).not.toHaveBeenCalled();
    listBtn.dispatchEvent(pointerEvent('pointercancel', { pointerId: 2, clientX: 300, clientY: 50 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 400, clientY: 300 }));
    expect(cam.x).not.toBe(before);                    // the canvas finger still pans
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 400, clientY: 300 }));
    expect(handlers.tap).not.toHaveBeenCalled();
  });

  it('CONTROL: a mouse moving with no button down still hovers the web', () => {
    const { root } = makeDom();
    const { handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 420, clientY: 200 }));
    expect(handlers.hover).toHaveBeenCalledWith(420, 200);
  });

  it('a mouse over the chrome (a control, the topbar) hovers nothing under it and lets go of what it hovered; leaving the web lets go too', () => {
    const { root, listBtn } = makeDom();
    const { handlers } = attach(root);
    handlers.leave = vi.fn();
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 420, clientY: 200 }));
    expect(handlers.hover).toHaveBeenCalledTimes(1);
    listBtn.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, pointerType: 'mouse', clientX: 100, clientY: 50 }));
    expect(handlers.hover, 'the web under a button is not hovered').toHaveBeenCalledTimes(1);
    expect(handlers.leave).toHaveBeenCalledTimes(1);
    root.dispatchEvent(pointerEvent('pointerleave', { pointerId: 7, pointerType: 'mouse', bubbles: false }));
    expect(handlers.leave).toHaveBeenCalledTimes(2);
    // a finger's leave (it lifted) is not a mouse leaving
    root.dispatchEvent(pointerEvent('pointerleave', { pointerId: 8, pointerType: 'touch', bubbles: false }));
    expect(handlers.leave).toHaveBeenCalledTimes(2);
  });
});

/* sweep v074: after a pinch, the finger still down could no longer pan. The
   second finger's down nulls `drag` (the pinch owns both); lifting one finger
   cleared `pinch` and then nulled `drag` again, so the remaining finger was in
   `pointers` with neither a pinch nor a drag: every move took no branch and the
   canvas sat still until every finger lifted and the reader pressed again. The
   finger left behind now picks up a pan from where it is, and its lift is not a tap. */
describe('a pinch that ends with one finger still down hands the pan to that finger (sweep v074)', () => {
  /** Two fingers down at x 400 / 600, spread to 300 / 700 (zoom in), then pointer 2 ends by `end`. */
  function pinchThenRelease(end) {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const rig = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 600, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 300, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 700, clientY: 300 }));
    expect(rig.cam.ppv, 'the spread zoomed in').toBeGreaterThan(10);
    root.dispatchEvent(pointerEvent(end, { pointerId: 2, clientX: 700, clientY: 300 }));
    return { root, ...rig };
  }

  for (const end of ['pointerup', 'pointercancel']) {
    it(`RED today: after the other finger's ${end}, dragging the remaining finger pans from where it is, and its lift is not a tap`, () => {
      const { root, cam, handlers } = pinchThenRelease(end);
      const x0 = cam.x, ppv = cam.ppv;
      // the remaining finger (pointer 1, resting at x 300) drags 100 px left
      root.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 200, clientY: 300 }));
      expect(cam.x - x0, 'the remaining finger pans by its own travel from where it rested, with no jump').toBeCloseTo(100 / ppv, 6);
      expect(cam.ppv, 'one finger pans, it does not zoom').toBe(ppv);
      root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 200, clientY: 300 }));
      expect(handlers.tap, 'the end of a pinch is never a tap').not.toHaveBeenCalled();
      expect(handlers.doubleTap).not.toHaveBeenCalled();
    });
  }

  it('the remaining finger lifting without moving is still not a tap (the pinch already moved)', () => {
    const { root, handlers } = pinchThenRelease('pointerup');
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 300, clientY: 300 }));
    expect(handlers.tap).not.toHaveBeenCalled();
    expect(handlers.doubleTap).not.toHaveBeenCalled();
  });

  it('CONTROL: once every finger has lifted, a fresh press pans and a fresh tap taps as before', () => {
    const { root, cam, handlers } = pinchThenRelease('pointerup');
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 300, clientY: 300 }));
    const x0 = cam.x, ppv = cam.ppv;
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 500, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 400, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 400, clientY: 300 }));
    expect(cam.x - x0).toBeCloseTo(100 / ppv, 6);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, clientX: 500, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, clientX: 500, clientY: 300 }));
    expect(handlers.tap).toHaveBeenCalledTimes(1);
  });
});

/* A1 (w2 digest, items 6-8): taps that land. A fingertip wanders further than a mouse, so the
   slop is the pointer's own; a double-tap is two taps close together, and it takes back what its
   first tap opened; a third finger never steers a pinch; every wheel reads in pixels and a
   sideways one pans. */
describe('the slop is the pointer\'s own (A1)', () => {
  for (const [type, inside, outside] of /** @type {Array<[string, number, number]>} */ ([['touch', 9, 12], ['pen', 5, 8], ['mouse', 2, 5]])) {
    it(`${type}: ${inside} px is a tap and moves nothing; ${outside} px is a drag and no tap`, () => {
      const { root } = makeDom();
      root.setPointerCapture = vi.fn();
      const { cam, handlers } = attach(root);
      const x0 = cam.x;
      root.dispatchEvent(pointerEvent('pointerdown', { pointerType: type, clientX: 300, clientY: 200 }));
      root.dispatchEvent(pointerEvent('pointermove', { pointerType: type, clientX: 300 + inside, clientY: 200 }));
      expect(cam.x, 'inside the slop the camera holds still').toBe(x0);
      root.dispatchEvent(pointerEvent('pointerup', { pointerType: type, clientX: 300 + inside, clientY: 200 }));
      expect(handlers.tap).toHaveBeenCalledTimes(1);
      root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, pointerType: type, clientX: 700, clientY: 200 }));
      root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, pointerType: type, clientX: 700 - outside, clientY: 200 }));
      expect(cam.x - x0, 'past the slop the pan catches up to the finger, from the press').toBeCloseTo(outside / 10, 6);
      root.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, pointerType: type, clientX: 700 - outside, clientY: 200 }));
      expect(handlers.tap).toHaveBeenCalledTimes(1);
      expect(handlers.doubleTap).not.toHaveBeenCalled();
    });
  }
});

describe('a double-tap is two taps close together, and it takes back its first tap (A1)', () => {
  it('two quick taps within 24 px zoom there, and the first tap\'s card is rolled back', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const undo = vi.fn();
    const snapshot = vi.fn(() => undo);
    const { handlers } = attach(root);
    /** @type {any} */ (handlers).snapshot = snapshot;
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    expect(snapshot, 'what was open is kept before the first tap opens anything').toHaveBeenCalledTimes(1);
    expect(handlers.tap).toHaveBeenCalledWith(300, 200);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 312, clientY: 210 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 312, clientY: 210 }));
    expect(undo, 'the double takes back the card its first tap opened').toHaveBeenCalledTimes(1);
    expect(handlers.doubleTap).toHaveBeenCalledWith(312, 210);
    expect(handlers.tap).toHaveBeenCalledTimes(1);
  });

  it('two quick taps far apart are two taps on two lines, and nothing is rolled back', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const undo = vi.fn();
    const { handlers } = attach(root);
    /** @type {any} */ (handlers).snapshot = () => undo;
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 340, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 340, clientY: 200 }));
    expect(handlers.tap).toHaveBeenCalledTimes(2);
    expect(handlers.doubleTap).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('a slow second tap is a tap again', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { handlers } = attach(root);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    now.mockReturnValue(1400);
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    now.mockRestore();
    expect(handlers.tap).toHaveBeenCalledTimes(2);
    expect(handlers.doubleTap).not.toHaveBeenCalled();
  });
});

describe('a third finger never steers a pinch (A1)', () => {
  it('a third finger down and moving changes nothing; the two pinching fingers still zoom about their centre', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam, handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 600, clientY: 300 }));
    const x0 = cam.x, ppv0 = cam.ppv;
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 100, clientY: 500 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 300, clientY: 500 }));
    expect(cam.x, 'the third finger pans nothing').toBe(x0);
    expect(cam.ppv, 'nor zooms').toBe(ppv0);
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientX: 300, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 700, clientY: 300 }));
    expect(cam.ppv / ppv0, 'the two fingers spread from 200 to 400 px: twice the zoom').toBeCloseTo(2, 6);
    expect(cam.x, 'about the same centre').toBeCloseTo(x0, 6);
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 300, clientY: 500 }));
    expect(handlers.tap, 'the third finger lifting is no tap').not.toHaveBeenCalled();
  });

  it('a pinch finger lifting with a third still down: the two left pinch on from where they are, with no jump', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const { cam, handlers } = attach(root);
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 400, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 600, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 800, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: 400, clientY: 300 }));
    const x0 = cam.x, ppv0 = cam.ppv;
    expect(ppv0, 'no zoom happened yet').toBe(10);
    // fingers 2 and 3 (200 px apart, centre 700) spread to 400 px about the same centre
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, clientX: 500, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 900, clientY: 300 }));
    expect(cam.ppv / ppv0).toBeCloseTo(2, 6);
    // the verse under x 700 stays under it: (700 - 500) / 10 = 20 verses right of x0 at the start
    expect(cam.x).toBeCloseTo(x0 + 20 - 200 / 20, 6);
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 500, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 900, clientY: 300 }));
    expect(handlers.tap).not.toHaveBeenCalled();
  });
});

describe('the wheel reads in pixels, and a sideways wheel pans (A1)', () => {
  const wheelAt = (root, init) => {
    const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 500, clientY: 300, ...init });
    root.dispatchEvent(ev);
    return ev;
  };
  it('three wheel lines (deltaMode 1) zoom as their 48 px would', () => {
    const ra = makeDom().root, rb = makeDom().root;
    const a = attach(ra), b = attach(rb);
    wheelAt(ra, { deltaY: 48 });
    wheelAt(rb, { deltaY: 3, deltaMode: 1 });
    expect(b.cam.ppv).toBeCloseTo(a.cam.ppv, 9);
    expect(b.cam.ppv).toBeLessThan(10);
  });
  it('a page wheel (deltaMode 2) is held to one big notch, not a leap to the floor', () => {
    const { root } = makeDom();
    const { cam } = attach(root);
    wheelAt(root, { deltaY: 1, deltaMode: 2 });
    expect(cam.ppv).toBeCloseTo(10 * Math.exp(-300 * 0.0021), 6);
  });
  it('deltaX pans along the canon by its pixels and does not zoom', () => {
    const { root } = makeDom();
    const { cam, schedule } = attach(root);
    const x0 = cam.x;
    const ev = wheelAt(root, { deltaX: 50, deltaY: 4 });
    expect(ev.defaultPrevented).toBe(true);
    expect(cam.ppv).toBe(10);
    expect(cam.x - x0, '50 px at 10 px a verse').toBeCloseTo(5, 6);
    expect(schedule).toHaveBeenCalled();
  });
  it('shift+wheel pans as deltaX does', () => {
    const { root } = makeDom();
    const { cam } = attach(root);
    const x0 = cam.x;
    wheelAt(root, { deltaY: -30, shiftKey: true });
    expect(cam.ppv).toBe(10);
    expect(cam.x - x0).toBeCloseTo(-3, 6);
  });
  it('a trackpad pinch (ctrlKey) zooms even when it carries some sideways travel', () => {
    const { root } = makeDom();
    const { cam } = attach(root);
    wheelAt(root, { deltaX: 20, deltaY: -10, ctrlKey: true });
    expect(cam.ppv).toBeCloseTo(10 * Math.exp(0.11), 6);
  });
});

/* A4: a drag let go while moving glides on and slows, through the frame loop's one motion
   (deps.animate); never under reduced motion, never from a finger that stopped before it lifted. */
describe('fling inertia (A4)', () => {
  /** A frame loop the test steps: animate keeps the one motion, frame() runs it once. */
  function loop() {
    let m = null;
    const animate = vi.fn((step, onEnd) => {
      const prev = m; const cur = { step, onEnd }; m = cur;
      if (prev && prev.onEnd) prev.onEnd(false);
      return () => { if (m === cur) { m = null; if (cur.onEnd) cur.onEnd(false); } };
    });
    const frame = (ms = 16) => {
      const cur = m;
      if (!cur) return false;
      const more = cur.step(ms) !== false;
      if (m === cur && !more) { m = null; if (cur.onEnd) cur.onEnd(true); }
      return !!m;
    };
    return { animate, frame, running: () => !!m };
  }
  /** A flick: down at x 600, moves of 30 px every 10 ms to the left, up at the last. */
  function flick(root, clock, steps = 6, dx = -30, dt = 10) {
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 600, clientY: 300 }));
    let x = 600;
    for (let i = 0; i < steps; i++) {
      clock.t += dt; x += dx;
      root.dispatchEvent(pointerEvent('pointermove', { clientX: x, clientY: 300 }));
    }
    root.dispatchEvent(pointerEvent('pointerup', { clientX: x, clientY: 300 }));
    return x;
  }
  let clock;
  beforeEach(() => {
    clock = { t: 5000 };
    vi.spyOn(performance, 'now').mockImplementation(() => clock.t);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('a flick glides on in the same direction, slowing, and stops', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const l = loop();
    const { cam, handlers } = attach(root, { animate: l.animate, reduceMotion: () => false });
    const x0 = cam.x;
    flick(root, clock);
    const released = cam.x;
    expect(released - x0, 'the drag itself: 180 px left is 18 verses right').toBeCloseTo(18, 6);
    expect(l.animate).toHaveBeenCalledTimes(1);
    const steps = [];
    let last = cam.x, n = 0;
    while (l.frame() && n++ < 500) { steps.push(cam.x - last); last = cam.x; }
    expect(cam.x, 'it glided on').toBeGreaterThan(released + 5);
    expect(steps.every((d) => d >= 0), 'the same way the finger went').toBe(true);
    expect(steps[steps.length - 1], 'slowing').toBeLessThan(steps[0]);
    expect(l.running(), 'and stopped').toBe(false);
    expect(handlers.tap).not.toHaveBeenCalled();
  });

  it('none under reduced motion', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const l = loop();
    attach(root, { animate: l.animate, reduceMotion: () => true });
    flick(root, clock);
    expect(l.animate).not.toHaveBeenCalled();
  });

  it('none from a finger that stopped before it lifted, or that crept', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const l = loop();
    attach(root, { animate: l.animate, reduceMotion: () => false });
    root.dispatchEvent(pointerEvent('pointerdown', { clientX: 600, clientY: 300 }));
    clock.t += 10;
    root.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 300 }));
    clock.t += 250;    // held still, then lifted
    root.dispatchEvent(pointerEvent('pointerup', { clientX: 500, clientY: 300 }));
    expect(l.animate).not.toHaveBeenCalled();
    flick(root, clock, 6, -2, 40);   // a slow creep: 0.05 px a ms
    expect(l.animate).not.toHaveBeenCalled();
  });

  it('a press catches the gliding web where it is', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const l = loop();
    const { cam } = attach(root, { animate: l.animate, reduceMotion: () => false });
    flick(root, clock);
    l.frame(); l.frame();
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 300, clientY: 300 }));
    expect(l.running(), 'the press ended the glide').toBe(false);
    const held = cam.x;
    l.frame();
    expect(cam.x).toBe(held);
  });

  /* w4 device check (S22, 3 of 3): the press that caught the glide lifted in place and was read
     as a tap, so the chooser "The 8 nearest threads" opened. A native scroller's catch is not a
     tap, and it starts no double-tap either; the next press is a tap as ever. */
  it('the press that catches the glide is no tap, and starts no double-tap', () => {
    const { root } = makeDom();
    root.setPointerCapture = vi.fn();
    const l = loop();
    const { handlers } = attach(root, { animate: l.animate, reduceMotion: () => false });
    flick(root, clock);
    l.frame(); l.frame();
    expect(l.running(), 'gliding').toBe(true);
    clock.t += 30;
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, clientX: 300, clientY: 300 }));
    clock.t += 60;
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 301, clientY: 300 }));
    expect(handlers.tap, 'the catch opened nothing').not.toHaveBeenCalled();
    clock.t += 80;
    root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 301, clientY: 300 }));
    root.dispatchEvent(pointerEvent('pointerup', { pointerId: 3, clientX: 301, clientY: 300 }));
    expect(handlers.doubleTap, 'the catch was no first tap').not.toHaveBeenCalled();
    expect(handlers.tap, 'the press after it is a tap').toHaveBeenCalledTimes(1);
  });
});

/* The deep dive's book filter (2026-10-23): a press held still on a book name filters to it. The
   handler says whether it took the press; taken, the lift is no tap and the finger pans nothing. */
describe('a long press is handlers().hold, and a taken one is no tap', () => {
  it('held still past LONG_PRESS_MS: hold is asked at the press; taken, the lift does not tap', () => {
    vi.useFakeTimers();
    try {
      const { root } = makeDom();
      root.setPointerCapture = vi.fn();
      const hold = vi.fn(() => true);
      const { cam, handlers } = attach(root, { handlers: () => handlersWith(hold) });
      const x0 = cam.x;
      root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 500 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      expect(hold).toHaveBeenCalledWith(300, 500);
      root.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 500 }));
      root.dispatchEvent(pointerEvent('pointerup', { clientX: 200, clientY: 500 }));
      expect(TAPS.tap).not.toHaveBeenCalled();
      expect(cam.x, 'the finger lifting off a taken press pans nothing').toBe(x0);
      expect(handlers.tap).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('not taken (no book name there), the lift still taps; a press that moves or lifts early asks nothing', () => {
    vi.useFakeTimers();
    try {
      const { root } = makeDom();
      root.setPointerCapture = vi.fn();
      const hold = vi.fn(() => false);
      attach(root, { handlers: () => handlersWith(hold) });
      root.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 500 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      root.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 500 }));
      expect(hold).toHaveBeenCalledTimes(1);
      expect(TAPS.tap).toHaveBeenCalledTimes(1);
      root.dispatchEvent(pointerEvent('pointerdown', { clientX: 700, clientY: 500 }));
      vi.advanceTimersByTime(100);
      root.dispatchEvent(pointerEvent('pointerup', { clientX: 700, clientY: 500 }));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      root.dispatchEvent(pointerEvent('pointerdown', { clientX: 500, clientY: 500 }));
      root.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 500 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
      root.dispatchEvent(pointerEvent('pointerup', { clientX: 400, clientY: 500 }));
      expect(hold, 'an early lift and a drag ask nothing').toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('a right click asks hold, and keeps the browser menu only where hold took nothing', () => {
    const { root } = makeDom();
    let took = true;
    const hold = () => took;
    attach(root, { handlers: () => handlersWith(hold) });
    const menu = () => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 500 }); root.dispatchEvent(e); return e.defaultPrevented; };
    expect(menu()).toBe(true);
    took = false;
    expect(menu()).toBe(false);
  });
});

let TAPS = { tap: vi.fn(), doubleTap: vi.fn(), hover: vi.fn(), hold: vi.fn() };
/** The handlers with this hold, one object a test (handlers() is asked on every event). */
function handlersWith(hold) {
  if (TAPS.hold !== hold) TAPS = { tap: vi.fn(), doubleTap: vi.fn(), hover: vi.fn(), hold };
  return TAPS;
}
