// @ts-nocheck — free-var globals + WebGL/orientation stand-ins per test (bundle-f screen contract)
/* ScriptureWebScreen tests — Wave 2 triage.
   ─────────────────────────────────────────────────────────────────────────
   scripture-web-5 — Try again clears loadError but the load effect's empty
   dependency array means it never re-runs, so the screen hangs forever on
   "Weaving the web…" instead of re-decoding. window.SCRIPTURE_WEB_DATA is
   the real fast-path ensureScriptureWebData() already reads (set by a prior
   successful load in production); driving it directly here exercises the
   real decodeGraph()/ensureScriptureWebData() without fabricating a base64
   corpus payload.

   scripture-web-6 — see that describe block.

   scripture-web-7 — a WebGL context loss with no restore must surface the
   noWebGL fallback. jsdom canvases have no WebGL2 (vitest.setup.js's global
   getContext shim always returns null), so decodeGraph/createRenderer are
   mocked to a trivial success stand-in — neither module owns this defect;
   it is the SCREEN's missing loss listener. The mock exposes each build()
   call's opts so a test can fire onContextLost/onContextRestored directly,
   the same way the real canvas would via web-renderer.js's DOM listeners
   (which are proven separately in web-renderer.test.js).
*/
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* Every draw the mocked renderer was asked to make, in order. MEASURED that a
   plain `const` works here: vi.mock's factory is hoisted but only RUNS at import
   time, by which point this initialiser has executed, so there is no TDZ window.
   A `var` plus an eslint-disable was the first form and it failed CI, because
   `no-var` is configured nowhere and the directive was an unused disable — the
   third time that shape has held a branch tonight, and this one was mine. */
const DRAWN = [];
/* What the real renderer's draw() returns at the phone ceiling (M2): the
   counters the screen publishes for the browser walks. One object, so a
   case can read the shape the screen was handed. */
const STATS = { mode: 'gathered', submitted: 142, visible: 142, visited: 149, draws: 3, window: 149 };
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    .../** @type {any} */ (real),
    decodeGraph: vi.fn((data) => {
      if (!data || !data.ok) throw new Error('scripture-web: data missing or empty');
      return {
        total: 0, count: 0, buckets: [], books: [], chapters: [],
        chapterOfVerse: new Uint16Array(0), votEdges: [], prophecy: [], votLinks: [],
      };
    }),
  };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    .../** @type {any} */ (real),
    createRenderer: vi.fn(() => ({
      gl: {}, contextLost: false, stats: STATS,
      // Each draw records the (ppv, density) it was actually asked for. The
      // auto-switch's early return suppresses ONE frame, and with a mock that
      // throws its arguments away that frame is invisible — which is exactly how
      // a line ends up unwitnessed. Recording is additive; no other case reads it.
      draw: (opts) => {
        DRAWN.push({ ppv: opts && opts.ppv, dpr: (opts && opts.dpr) || 1, density: opts && opts.density, camY: opts && opts.camY });
        return STATS;
      },
      dispose: vi.fn(),
    })),
  };
});

import { createRenderer } from '../scripture-web/web-renderer.js';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';

const baseProps = () => ({
  navigateToLink: () => {}, onBack: () => {}, settings: {}, updateSetting: () => {},
});

const ORIG_W = window.innerWidth, ORIG_H = window.innerHeight;
const setViewport = (w, h) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
};

afterEach(() => {
  cleanup();
  delete window.SCRIPTURE_WEB_DATA;
  vi.unstubAllGlobals();
  setViewport(ORIG_W, ORIG_H);
  delete window.screen.orientation;
  vi.useRealTimers();
});

describe('Z1/A1 — the zoom ceiling is the 44 px tap rule, not MAX_ZOOM = 4000', () => {
  /* Corbin: "fully zoomed in still looks terrible". On a 1920 px desktop
     today's 4000 is 247 CSS px per verse, 5.6x past the point where anything
     new can separate — arcs from one verse share one foot at every zoom, so
     it zooms into a void. The ceiling is 44 CSS px per verse (v2 note §7),
     which is 1,711 on the 800 CSS px landscape frame a phone reader gets.

     THE CANVAS IS SIZED ON PURPOSE. The screen reads `glc.clientWidth`, which
     jsdom reports as 0, and every key and pointer path returns early on
     `!v.W`. Without this every assertion below would pass vacuously — which is
     what happened to the My Web Escape case earlier today. The first test in
     this block is the control AND the precondition: if it goes red, nothing
     else here means anything, whatever colour it shows. */
  const CANON = 31102;
  const FRAME_CSS = 800;
  const graph = () => ({
    total: CANON, count: 0, buckets: [],
    books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
    chapters: [[0, 1, 0, CANON]],
    chapterOfVerse: new Uint16Array(CANON),
    from: new Uint16Array(0), to: new Uint16Array(0), votes: new Uint8Array(0),
    votEdges: [], prophecy: [], votLinks: [],
  });

  const SIZES = [['clientWidth', FRAME_CSS], ['clientHeight', 360]];
  let realDecode = null;

  // This block sizes a shared prototype and re-points a shared mock. Both are
  // put back, or the neighbouring describes measure MY graph on MY canvas —
  // the failure mode where a gate passes alone and fails in file order.
  afterEach(() => {
    for (const [prop] of SIZES) delete HTMLCanvasElement.prototype[prop];
    if (realDecode) vi.mocked(decodeGraph).mockImplementation(realDecode);
  });
  // The zoom instrument below reads the LAST draw, so the recorder starts
  // empty for every case: module-wide, the ceiling case's forty presses
  // leaked '1711x' into the next describe's 'Overview' control.
  beforeEach(() => { DRAWN.length = 0; });

  /* ONE WAITER FOR THE GL CANVAS, AND IT THROWS RATHER THAN GIVING UP SILENTLY.
     There were two copies of this loop - mount()'s, inherited from main, and a
     second one added below - and both ran out and continued anyway.

     WHAT A SILENT GIVE-UP WOULD COST: with no canvas on screen, `.sw-root`'s key
     handler returns early on `!v.W` (viewRef.W is the GL canvas's clientWidth,
     which is 0 when the element is absent), so every press is a no-op and a case
     asserting "the density did NOT change" holds for the wrong reason.

     WHAT IT COSTS TODAY: nothing, because the wait never waits. Measured under
     the lock - bound at 0 with this throw in place, all 25 cases still pass, so
     the canvas is present on the FIRST check and the loop body has never run.
     So this is a guard awaiting its first bad input, NOT a repair of a live
     vacuity, and its whole value is that it will not be silent when that input
     arrives: a slower mount, a renamed class, a regression in the decode path.
     An earlier version of this comment claimed the cases had been running
     without a canvas. They had not. Do not upgrade the claim back.

     It carries two jobs and this is the second: it is the wait, and it is the
     precondition for every assertion after it. If it throws, nothing below that
     line is about the Scripture Web. */
  const awaitCanvas = async (view) => {
    for (let i = 0; i < 40 && !view.container.querySelector('.sw-canvas-gl'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
    if (!view.container.querySelector('.sw-canvas-gl')) {
      throw new Error('.sw-canvas-gl never mounted - nothing below this line is about the Scripture Web');
    }
    // viewRef.W is set by the effect that follows the mount; flush once more.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    /* Then the FIRST DRAW, bounded. The zoom instrument reads the last draw;
       the label it replaced read 'Overview' off static markup before any
       frame existed, which is a control that could not fail. */
    for (let i = 0; i < 60 && DRAWN.length === 0; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    if (DRAWN.length === 0) throw new Error('the renderer was never asked to draw - the sized canvas is not reaching draw()');
    return view;
  };

  const mount = async (props = {}, graphFn = graph) => {
    for (const [prop, value] of SIZES) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, {
        configurable: true, get() { return value; },
      });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    if (!realDecode) realDecode = vi.mocked(decodeGraph).getMockImplementation();
    vi.mocked(decodeGraph).mockImplementation(() => graphFn());
    const view = render(<ScriptureWebScreen {...baseProps()} {...props} />);
    return awaitCanvas(view);
  };

  /* The zoom instrument. The location card that used to print this label is
     gone (Corbin's trim), so the label is re-derived here from the ppv the
     renderer was LAST asked to draw: zoom = ppv / fitPPV, fitPPV = W / total
     with W = FRAME_CSS * dpr. Same formula the card used, same timing (the
     card was written inside draw()), and it reads the camera, not a label. */
  const zoomText = () => {
    const last = DRAWN[DRAWN.length - 1];
    if (!last) throw new Error('zoomText: nothing drawn yet');
    const zoom = last.ppv / ((FRAME_CSS * last.dpr) / CANON);
    return zoom < 1.1 ? 'Overview' : (zoom < 10 ? String(Math.round(zoom * 10) / 10) : Math.round(zoom) + 'x');
  };
  /* One FRAME per press (20 ms), not one macrotask: the instrument is now
     the draw, and jsdom's requestAnimationFrame runs on a ~16 ms timer, so a
     0 ms await reads the frame BEFORE the press. The card's label hid this
     because it, too, lagged — the nested describe measured it. */
  const press = async (key) => {
    fireEvent.keyDown(document.querySelector('.sw-root'), { key });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  };
  /* Two touch taps inside the 300 ms double-tap window at one CSS point, then
     one frame (40 ms, two rAF ticks) for the draw the handler schedules. */
  const doubleTapAt = async (container, x, y) => {
    const root = container.querySelector('.sw-root');
    const at = { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: x, clientY: y };
    for (let i = 0; i < 2; i++) {
      root.dispatchEvent(new PointerEvent('pointerdown', at));
      root.dispatchEvent(new PointerEvent('pointerup', at));
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  };

  it('CONTROL and PRECONDITION: the canvas is sized, so + reaches the camera', async () => {
    const { container } = await mount();
    expect(zoomText(container)).toBe('Overview');
    await press('+');
    expect(zoomText(container)).not.toBe('Overview');
  });

  it('publishes the renderer\'s counters on .sw-root after every frame: data-sw-mode/submitted/visible/visited/draws/window/frames/draw-ms (M2)', async () => {
    const { container } = await mount();
    const root = container.querySelector('.sw-root');
    expect(root.getAttribute('data-sw-mode')).toBe('gathered');
    expect(root.getAttribute('data-sw-submitted')).toBe('142');
    expect(root.getAttribute('data-sw-visible')).toBe('142');
    expect(root.getAttribute('data-sw-visited')).toBe('149');
    expect(root.getAttribute('data-sw-draws')).toBe('3');
    expect(root.getAttribute('data-sw-window')).toBe('149');
    const frames = Number(root.getAttribute('data-sw-frames'));
    expect(frames).toBeGreaterThanOrEqual(1);
    expect(root.getAttribute('data-sw-draw-ms')).toMatch(/^\d+(\.\d+)?$/);
    await press('+');
    expect(Number(root.getAttribute('data-sw-frames'))).toBeGreaterThan(frames);
  });

  /* ── M4: the camera's y from the keyboard, published, clamped, and gauged ── */
  /* One 2,000-verse thread, so the world is 1,000 verses tall and the ceiling's
     3.08-verse band (260 / (132 · 0.64) at the 132 px ceiling, M6) has somewhere to go. */
  const tall = () => Object.assign(graph(), {
    count: 1,
    from: new Uint16Array([15000]), to: new Uint16Array([17000]), votes: new Int16Array([30]),
    buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [[15000, 17000]] }],
    chunkSize: 256,
  });
  const camY = (container) => container.querySelector('.sw-root').getAttribute('data-cam-y');

  it('M4: ArrowUp at the ceiling raises data-cam-y, and the renderer is handed that y (received: no attribute, camY 0)', async () => {
    const { container } = await mount({}, tall);
    for (let i = 0; i < 48; i++) await press('+');
    expect(zoomText(container)).toBe('5132x');
    expect(camY(container), 'data-cam-y published on .sw-root').not.toBeNull();
    expect(Number(camY(container))).toBe(0);
    await press('ArrowUp');
    const y = Number(camY(container));
    // 0.12 of the band: 260 / (132 * 0.64) * 0.12 = 0.369 verses on this frame (DPR 1)
    expect(y).toBeGreaterThan(0.35);
    expect(y).toBeLessThan(0.39);
    expect(DRAWN[DRAWN.length - 1].camY, 'the last draw carried the camera\'s y').toBeCloseTo(y, 3);
    await press('ArrowDown');
    expect(Number(camY(container))).toBe(0);
  });

  it('CONTROL: ArrowUp at fit leaves data-cam-y at 0 — the band is taller than the world', async () => {
    const { container } = await mount({}, tall);
    await press('ArrowUp');
    expect(camY(container)).not.toBeNull();
    expect(Number(camY(container))).toBe(0);
  });

  it('M4: a resize that doubles the frame\'s WIDTH re-clamps y, so a grown band cannot leave the camera above its ceiling', async () => {
    const { container } = await mount({}, tall);
    for (let i = 0; i < 48; i++) await press('+');
    // 0.369 verses a press: 5,000 presses reach the ceiling (1,000 - 3.08 = 996.9) with room to spare
    for (let i = 0; i < 5000; i++) fireEvent.keyDown(document.querySelector('.sw-root'), { key: 'ArrowUp' });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const top = Number(camY(container));
    expect(top, 'held at the world\'s ceiling: apexMax 1,000 less the band').toBeGreaterThan(990);
    // The frame grows to 1,600 CSS px WIDE: the band (W / (2 · ppv · 0.985) verses, since the
    // dome's squash scales with the frame) doubles from 3.08 to 6.16 verses and the ceiling
    // drops from 996.9 to 993.8. A taller frame changes nothing — the dome fills it.
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get() { return 1600; } });
    await act(async () => { window.dispatchEvent(new Event('resize')); await new Promise((r) => setTimeout(r, 40)); });
    const after = Number(camY(container));
    expect(after).toBeLessThan(top);
    expect(after).toBeGreaterThan(0);
  });

  it('M4 GUARD: in My Web a vertical drag leaves the camera at the baseline — its rails have no height (the same drag raises it in the scripture web first, as the precondition)', async () => {
    // Bite m4i (the y frame handed to the rails too) survived every other case: nothing pinned
    // that My Web's shared camera keeps y = 0. Without the guard a swipe on the Bible rail would
    // raise the scripture camera behind the rails and the reader would come back to a web in the sky.
    const { container } = await mount({}, tall);
    for (let i = 0; i < 48; i++) await press('+');
    const root = container.querySelector('.sw-root');
    const swipeDown = async () => {
      root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 100 }));
      root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 220 }));
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 220 }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    };
    await swipeDown();
    expect(Number(camY(container)), 'PRECONDITION: the swipe raises the scripture camera').toBeGreaterThan(1);
    await press('0');
    expect(Number(camY(container)), 'Reset returns to the baseline').toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /my web/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    // the mode switch returns the camera to fit, where the clamp alone holds y at 0 (measured:
    // the first form of this case passed under the bite for that reason); zoom the Bible rail
    // back to the ceiling so the guard, not the clamp, is what keeps the swipe from moving y
    for (let i = 0; i < 48; i++) await press('+');
    expect(DRAWN[DRAWN.length - 1].ppv, 'the Bible rail is back at the ceiling').toBeCloseTo(132, 6);
    await swipeDown();
    expect(Number(camY(container)), 'My Web: the same swipe moves no y').toBe(0);
  });

  it('M4: with cam.y > 0 the UI canvas paints the span gauge — a label /^\\d[\\d,]* verses$/ — and none at the baseline', async () => {
    const CALLS = [];
    const fake2d = () => new Proxy({}, {
      get(_t, prop) {
        if (prop === 'measureText') return () => ({ width: 20 });
        if (prop === 'canvas') return null;
        return (...a) => { CALLS.push([String(prop), ...a]); };
      },
      set() { return true; },
    });
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(/** @type {any} */ (function (kind) { return kind === '2d' ? fake2d() : null; }));
    try {
      const { container } = await mount({}, tall);
      for (let i = 0; i < 48; i++) await press('+');
      const gauge = () => CALLS.filter((c) => c[0] === 'fillText' && /^\d[\d,]* verses$/.test(String(c[1]))).map((c) => String(c[1]));
      expect(CALLS.some((c) => c[0] === 'fillText'), 'PRECONDITION: the recorder sees the ruler paint').toBe(true);
      expect(gauge(), 'no gauge at the baseline').toEqual([]);
      CALLS.length = 0;
      for (let i = 0; i < 20; i++) await press('ArrowUp');
      expect(Number(camY(container))).toBeGreaterThan(5);
      expect(gauge().length, 'gauge labels with the camera raised: ' + JSON.stringify(gauge())).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('stops at 132 CSS px per verse — 5,132x here (M6; received 1711x), never 4000x', async () => {
    const { container } = await mount();
    // 1.25^48 = 44,000x >> 5,132x, so the ladder still saturates at the ceiling.
    for (let i = 0; i < 48; i++) await press('+');
    // maxZoomFor(31102, 800) = 5131.83 -> the label rounds to 5132x.
    expect(zoomText(container)).toBe('5132x');
  });

  it('M6: + steps 1.25x (received 1.6x) and a double-tap on the web 2x (received 2.5x)', async () => {
    const { container } = await mount();
    const fitPpv = DRAWN[DRAWN.length - 1].ppv;
    await press('+');
    expect(DRAWN[DRAWN.length - 1].ppv / fitPpv).toBeCloseTo(1.25, 6);
    const root = container.querySelector('.sw-root');
    const tap = () => {
      root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 400, clientY: 120 }));
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 400, clientY: 120 }));
    };
    tap(); tap();
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    // 1.25 from the key, then 2 from the double-tap (the old ladder read 1.6 * 2.5 = 4.0 here)
    expect(DRAWN[DRAWN.length - 1].ppv / fitPpv).toBeCloseTo(1.25 * 2, 6);
  });

  it('M6 GUARD: past 22 px per verse a double-tap on the WEB (above the ruler) still zooms 2x about the point, not to the ceiling', async () => {
    // Bite m6f (the ruler rule applied everywhere) survived every other case: the 2x case
    // double-taps at fit, where the rule's zoom floor keeps it out. Same zoom as the ruler case.
    const { container } = await mount();
    for (let i = 0; i < 31; i++) await press('+');
    const ppv = DRAWN[DRAWN.length - 1].ppv;
    expect(ppv).toBeGreaterThan(22);
    const root = container.querySelector('.sw-root');
    const tap = () => {
      root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 500, clientY: 120 }));
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 500, clientY: 120 }));
    };
    tap(); tap();
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(DRAWN[DRAWN.length - 1].ppv / ppv, 'a double-tap on the web is the 2x step').toBeCloseTo(2, 6);
  });

  it('M6: a double-tap on the ruler strip past 22 px per verse centres that verse at the ceiling: cam.x = verse + 0.5, ppv = 132', async () => {
    const { container } = await mount();
    // 31 presses at 1.25x: 0.0257 * 1.25^31 = 26.5 px per verse, past the 22 the rule needs
    for (let i = 0; i < 31; i++) await press('+');
    const ppv = DRAWN[DRAWN.length - 1].ppv;
    expect(ppv).toBeGreaterThan(22);
    expect(ppv).toBeLessThan(132);
    const root = container.querySelector('.sw-root');
    expect(root.getAttribute('data-cam-x'), 'data-cam-x published on .sw-root').not.toBeNull();
    const camX = Number(root.getAttribute('data-cam-x'));
    // the verse under x = 500 CSS px on this 800 px frame: (500 - 400) / ppv + cam.x
    const verse = Math.floor((500 - 400) / ppv + camX);
    const tap = () => {
      root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 500, clientY: 300 }));
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: 500, clientY: 300 }));
    };
    tap(); tap();
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(DRAWN[DRAWN.length - 1].ppv, 'the ceiling').toBeCloseTo(132, 6);
    expect(Number(root.getAttribute('data-cam-x')), 'centred on the tapped verse').toBeCloseTo(verse + 0.5, 3);
  });

  /* ── verifier-2's three M6 pin gaps (46070f7a HELD with these unpinned): none a defect, each a
     branch the GUARD did not cover. Every case below is red under the bite named in its title and
     green on the tip; the precondition lines are what make the branch reachable. ── */

  it('M6 PIN: a double-tap on the ruler strip BELOW 22 px per verse steps 2x like the web — with `if (onRuler)` alone it would leap 5,132x to a verse nobody could address', async () => {
    const { container } = await mount();
    const fitPpv = DRAWN[DRAWN.length - 1].ppv;
    expect(fitPpv, 'precondition: the overview, under the 22 px floor').toBeLessThan(22);
    // (500, 300) is the ruler strip on this frame — the same point the ruler case uses past the floor
    await doubleTapAt(container, 500, 300);
    expect(DRAWN[DRAWN.length - 1].ppv / fitPpv, 'the 2x step, not the leap to the ceiling').toBeCloseTo(2, 6);
  });

  it('M6 PIN: a ruler double-tap clamps WITH the y frame — a raised camera keeps its height through the leap to the ceiling; the frameless clamp drops y to 0', async () => {
    // The ruler case starts at y = 0, where clampCamera with and without the frame agree.
    const { container } = await mount({}, tall);
    for (let i = 0; i < 31; i++) await press('+');
    const ppv = DRAWN[DRAWN.length - 1].ppv;
    expect(ppv).toBeGreaterThan(22);
    expect(ppv).toBeLessThan(132);
    // five steps of 0.12 band at 26.5 px per verse: 5 * 0.12 * 260 / (26.5 * 0.64) = 9.2 verses up
    for (let i = 0; i < 5; i++) await press('ArrowUp');
    const y = Number(camY(container));
    expect(y, 'precondition: the camera is raised').toBeGreaterThan(5);
    await doubleTapAt(container, 500, 300);
    expect(DRAWN[DRAWN.length - 1].ppv, 'the ceiling').toBeCloseTo(132, 6);
    expect(Number(camY(container)), 'y kept through the leap (the band at 132 is 3.08 verses, far under the 1,000-verse world)').toBeCloseTo(y, 3);
  });

  it('M6 PIN: a double-tap on the web zooms at the camera\'s OWN height — a raised y is kept exactly while ppv doubles; an anchor at the frame\'s middle row or at the finger\'s row would lift it', async () => {
    // The GUARD reads the ppv ratio only; the own-height choice M4 made for the keys was unpinned for the tap.
    const { container } = await mount({}, tall);
    for (let i = 0; i < 31; i++) await press('+');
    const ppv = DRAWN[DRAWN.length - 1].ppv;
    expect(ppv).toBeGreaterThan(22);
    for (let i = 0; i < 5; i++) await press('ArrowUp');
    const y = Number(camY(container));
    expect(y, 'precondition: the camera is raised').toBeGreaterThan(5);
    await doubleTapAt(container, 500, 120);
    expect(DRAWN[DRAWN.length - 1].ppv / ppv, 'the 2x step').toBeCloseTo(2, 6);
    // holding the middle row (180 of 360) would read y + (260 - 180) / (26.5 * 0.64) / 2 = y + 2.4; the finger's row y + 4.1
    expect(Number(camY(container)), 'the camera\'s own height, kept').toBeCloseTo(y, 3);
  });

  it('A1 — says so through .sw-live instead of doing nothing silently', async () => {
    const { container } = await mount();
    for (let i = 0; i < 40; i++) await press('+');
    expect(container.querySelector('.sw-live').textContent).toBe('Zoomed all the way in');
  });

  /* ── the density is the reader's choice at every zoom (w-sw-zoom-pan, item 2) ──
     Corbin, 2026-09-11: "verify that fully zoomed in, the full corpus and all 63000 lines are
     visible and interactable, UNLESS the user has it set to essential." His first explicit word
     on the matter; it replaces the 09-05 decision (made on his behalf) that switched the web to
     Essential past 22 CSS px per verse. The switch and its hysteresis band are gone: `density`
     is the stored choice, the pill writes it through updateSetting, and nothing moves it.

     Nested here because this block owns the SIZED-CANVAS harness (800x360, the + key, the
     recorded draws). Forty presses reach the 44 px ceiling (1,711x on this frame). */
  describe('the density is the reader\'s choice at every zoom, Famous unless they chose Essential', () => {
    const shown = () => screen.getByLabelText('Connection density').value;
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const toCeiling = async () => { for (let i = 0; i < 40; i++) await pressFrame('+'); };
    const lastDensity = () => DRAWN[DRAWN.length - 1].density;

    it('CONTROL: at Overview the control reads Famous and the frame is drawn Famous', async () => {
      const { container } = await mount();
      expect(zoomText(container)).toBe('Overview');
      expect(shown()).toBe('famous');
      expect(lastDensity()).toBe('famous');
    });

    it('RED today: at the ceiling the web is STILL drawn Famous — the control reads Famous, every frame past 22 px/verse drew Famous, nothing was announced', async () => {
      const { container } = await mount();
      await toCeiling();
      expect(zoomText(container)).toBe('5132x');
      expect(shown(), 'the density control').toBe('famous');
      const deep = DRAWN.filter((d) => d.ppv / d.dpr >= 22);
      expect(deep.length, 'frames drawn past 22 CSS px per verse').toBeGreaterThan(0);
      expect(deep.map((d) => d.density), 'every deep frame').toEqual(deep.map(() => 'famous'));
      expect(container.querySelector('.sw-live').textContent).not.toMatch(/Essential density/);
    });

    it('RED today: at the ceiling a thread that exists only in Famous (7 votes) is tappable and brings up its connection card', async () => {
      /* One 7-vote link, 15548 -> 15555, sitting AFTER the Essential prefix of its bucket
         (off20 = 0, off10 = 1): at Essential the picker walks zero entries and the tap finds
         nothing; at Famous it finds the link. The + key zooms about the frame's centre, so
         the camera settles on verse 15551. A lone thread takes the MIDDLE departure slot at
         both feet (M3), so they stand at 15548.5 and 15555.5: at the 132 px ceiling (M6)
         (15548.5 - 15551) * 132 + 400 = 70 and 994 CSS px. On this 800x360 frame (base 260,
         ceil 256, squash 0.64) the true law (threadShape, w-sw-phase1 M1) gives R 462,
         A 295.7: the apex is 36 px ABOVE the frame, so the tap goes on the left leg — 50 px in
         from the foot the curve is 133.8 px up (arcHeight), y = 126.2 — at (120, 134), 8 px
         under it, inside the 14 px tolerance: a hit at Famous, nothing at Essential, and above
         the rail band pickChapter owns (y >= 258). At the 44 px ceiling this read R 154,
         A 98.6, apex (444, 161.4), tap (444, 170); before the slots the feet stood at the
         verses' left edges; under the morph R 100, A 90 with a level run. */
      const linked = () => Object.assign(graph(), {
        count: 1,
        books: [{ id: 'isaiah', title: 'Isaiah', abbr: 'Isa', start: 15000 }],
        chapters: [[0, 1, 15000, 1000]],
        from: new Uint16Array([15548]), to: new Uint16Array([15555]), votes: new Int16Array([7]),
        buckets: [{ off: 0, len: 1, off20: 0, off10: 1, segments: 8, chunks: [[15548, 15555]] }],
        chunkSize: 256,
      });
      const { container } = await mount({}, linked);
      await toCeiling();
      expect(zoomText(container)).toBe('5132x');
      const root = container.querySelector('.sw-root');
      const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: 120, clientY: 134 });
      const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: 120, clientY: 134 });
      await act(async () => { root.dispatchEvent(down); root.dispatchEvent(up); await new Promise((r) => setTimeout(r, 40)); });
      const sheet = container.querySelector('.sw-sheet');
      expect(sheet, 'the connection card opened for the 7-vote thread').toBeTruthy();
      expect(sheet.textContent).toMatch(/Isaiah/);
    });

    it('CONTROL: a reader whose stored choice is Essential stays Essential at Overview and at the ceiling (cannot fail today; it guards the fix from over-correcting)', async () => {
      await mount({ settings: { webDensity: 'essential' } });
      expect(shown()).toBe('essential');
      expect(lastDensity()).toBe('essential');
      await toCeiling();
      expect(shown()).toBe('essential');
      expect(lastDensity()).toBe('essential');
    });

    it('CONTROL: choosing Essential on the pill persists it as the setting (updateSetting webDensity) — green today, stated as such', async () => {
      const updateSetting = vi.fn();
      await mount({ updateSetting });
      fireEvent.change(screen.getByLabelText('Connection density'), { target: { value: 'essential' } });
      expect(updateSetting).toHaveBeenCalledWith('webDensity', 'essential');
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(lastDensity()).toBe('essential');
    });
  });
});

describe('scripture-web-5 — Try again re-decodes the graph', () => {
  it('re-attempts the load instead of hanging on "Weaving the web…" forever', async () => {
    // Truthy (hits ensureScriptureWebData's fast path) but undecodable
    // (decodeGraph throws on a falsy count) — a real load failure.
    window.SCRIPTURE_WEB_DATA = { count: 0 };
    render(<ScriptureWebScreen {...baseProps()} />);
    expect(await screen.findByText('The Scripture Web couldn’t load.')).toBeTruthy();

    fireEvent.click(screen.getByText('Try again'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // The bug: loadError is cleared and nothing ever re-decodes, so the
    // screen sits on the loading state forever with no way back.
    expect(screen.queryByText('Weaving the web…')).toBeNull();
    expect(screen.getByText('The Scripture Web couldn’t load.')).toBeTruthy();
  });
});

describe('landscape, always — a portrait viewport is rotated, and nothing asks the reader to turn', () => {
  /* This block used to be scripture-web-6, which asserted that a rejected
     lock produced a "Best in landscape" note and an UN-rotated root. That is
     the behaviour the owner asked to be removed (2026-09-10: "landscape by
     default, no rotate option"), so the case is inverted rather than deleted:
     the two assertions below are the unit form of the RED for this change --
     the root stays rotated, and no note exists to paint. */
  it('stays rotated after a rejected lock, and renders no orientation note', async () => {
    setViewport(400, 800);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
    // The Android WebView rejects lock() outside fullscreen. That refusal used
    // to un-rotate the screen and raise a hint; now it changes nothing.
    window.screen.orientation = { lock: () => Promise.reject(new Error('locking requires fullscreen')) };

    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('.sw-root.sw-rotated')).toBeTruthy();
    expect(screen.queryByText('Best in landscape')).toBeNull();
    expect(document.querySelector('.sw-orientation-note')).toBeNull();
  });

  it('rotates a portrait viewport on a FINE pointer too — the touch-only gate is gone', async () => {
    /* The old code rotated only when `(pointer: coarse)` matched, so a
       portrait viewport on a mouse-driven device showed the note instead. The
       owner's rule has no pointer clause: any portrait viewport rotates. */
    setViewport(400, 800);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
    window.screen.orientation = { lock: () => Promise.reject(new Error('not supported')) };

    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('.sw-root.sw-rotated')).toBeTruthy();
  });

  it('does NOT rotate a landscape viewport — the control for the two above', async () => {
    setViewport(800, 400);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('.sw-root')).toBeTruthy();
    expect(container.querySelector('.sw-root.sw-rotated')).toBeNull();
  });
});

describe('scripture-web-7 — a WebGL context loss with no restore falls back', () => {
  /** Loads a real graph (through the mocked decodeGraph) and returns the
   *  opts object the screen's own build() last passed to createRenderer. */
  async function renderWithGraph() {
    window.SCRIPTURE_WEB_DATA = { ok: true };
    render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const calls = /** @type {any} */ (createRenderer).mock.calls;
    return calls[calls.length - 1][2];
  }

  it('reports the loss and falls back ~3s later when nothing restores it', async () => {
    const opts = await renderWithGraph();
    vi.useFakeTimers();
    // The defect: createRenderer is never given an onContextLost, so the
    // screen has no way to hear about a loss at all.
    act(() => { opts.onContextLost(); });

    act(() => { vi.advanceTimersByTime(2999); });
    expect(screen.queryByText('The web can’t be drawn right now.')).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('The web can’t be drawn right now.')).toBeTruthy();
  });

  it('does NOT fall back when a restore arrives before the ~3s timer', async () => {
    const opts = await renderWithGraph();
    vi.useFakeTimers();
    act(() => { opts.onContextLost(); });
    act(() => { opts.onContextRestored(); });
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.queryByText('The web can’t be drawn right now.')).toBeNull();
  });
});

describe('F27 — the immersive-mode unmount effect unlocks screen orientation', () => {
  it('calls screen.orientation.unlock() on unmount', () => {
    const unlock = vi.fn();
    window.screen.orientation = { lock: () => Promise.resolve(), unlock };
    const { unmount } = render(<ScriptureWebScreen {...baseProps()} />);
    expect(unlock).not.toHaveBeenCalled();

    unmount();
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('unmounts without throwing when there is no orientation API at all', () => {
    // window.screen.orientation is absent by default (afterEach deletes it) —
    // the try/catch is what keeps a device lacking the API from crashing here.
    const { unmount } = render(<ScriptureWebScreen {...baseProps()} />);
    expect(() => unmount()).not.toThrow();
  });
});

describe('My Web — the empty-web notice is dismissible (M2)', () => {
  // Corbin: the notice has no way to close it, so a reader who has read it
  // and is not ready to make a link is told the same thing on every visit,
  // forever. The dismissal rides `settings` (vot-state, already exported,
  // counted and shape-checked by the backup) rather than a sixth flag store:
  // no DB_VERSION bump, no seven-legged registration, and it comes back on a
  // fresh profile because a fresh profile has no key.
  //
  // 44 CSS px and the glyph's contrast are design-perf's instruments (spec
  // targets M2's E row); jsdom has no layout, so what is pinned HERE is the
  // control's existence, its label, the persistence, Escape, and where focus
  // lands.
  // The root's key handler bails at `if (!cam || !v.W) return;`, and v.W comes
  // from the GL canvas's clientWidth \u2014 0 in jsdom, which made every assertion
  // about .sw-root's Escape branch vacuous, the passing ones included. Sizing
  // the canvas is what lets that branch run at all; the control case below is
  // this harness's own precondition assertion, and it fails loudly if the
  // handler ever becomes unreachable again.
  const sizeCanvas = () => {
    for (const [prop, px] of [['clientWidth', 800], ['clientHeight', 600]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, {
        configurable: true, get() { return px; },
      });
    }
  };
  afterEach(() => {
    delete HTMLCanvasElement.prototype.clientWidth;
    delete HTMLCanvasElement.prototype.clientHeight;
  });

  const openMyWeb = async (props) => {
    window.SCRIPTURE_WEB_DATA = { count: 1, ok: true };
    sizeCanvas();
    const r = render(<ScriptureWebScreen {...baseProps()} {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'My web' }));
    return r;
  };

  // ── My Web visual (design-perf, 2026-09-10; note: myweb-visual-design.md) ──
  // Appended inside the describe that owns openMyWeb(). Both cases are RED on
  // main: the subtitle there is "0 links you have made" and the legend is the
  // Scripture Web's distance ramp, which My Web never draws.

  it('R3 with no links the subtitle invites, it does not count to zero', async () => {
    await openMyWeb();
    const sub = document.querySelector('.sw-title p');
    expect(sub).toBeTruthy();
    expect(sub.textContent).not.toMatch(/\d/);
    expect(sub.textContent).toMatch(/\bLink\b/);
  });

  it('R4 in My Web the legend names the reader\'s links and the canon axis its citations wear, never the distance ramp', async () => {
    // r2: the Volumes' citations wear the canon's ramp by where they land in
    // scripture, so the legend names that axis (Genesis to Revelation) and
    // the reader's own gold links; it never claims the distance law.
    await openMyWeb();
    const legend = document.querySelector('.sw-legend');
    expect(legend).toBeTruthy();
    expect(legend.textContent).toMatch(/your links/);
    expect(legend.textContent).toMatch(/Genesis/);
    expect(legend.textContent).toMatch(/Revelation/);
    expect(legend.textContent).toMatch(/Volumes/);
    expect(legend.textContent).not.toMatch(/across the canon|nearby/);
  });

  it('offers a Dismiss control on the notice', async () => {
    await openMyWeb();
    expect(screen.getByText('Your web is still being woven.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('hides the notice and records the dismissal so it survives a cold boot', async () => {
    const updateSetting = vi.fn();
    await openMyWeb({ updateSetting });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Your web is still being woven.')).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith('swEmptyDismissed', true);
  });

  it('does not pitch the notice again once the dismissal is stored', async () => {
    await openMyWeb({ settings: { swEmptyDismissed: true } });
    expect(screen.queryByText('Your web is still being woven.')).toBeNull();
  });

  it('closes on Escape while focus is inside the notice', async () => {
    const updateSetting = vi.fn();
    await openMyWeb({ updateSetting });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss' }), { key: 'Escape' });
    expect(screen.queryByText('Your web is still being woven.')).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith('swEmptyDismissed', true);
  });

  it('Escape closes the notice WITHOUT leaving the Scripture Web', async () => {
    // design-perf measured the real UI: the notice closed and the same
    // keystroke bubbled to .sw-root's Escape branch, which found no overlay
    // open and called onBack() \u2014 the reader landed in the Library with focus
    // on body. The case above asserts what Escape DID and is blind to what
    // else it did, which is why a green suite shipped it.
    const onBack = vi.fn();
    await openMyWeb({ onBack });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss' }), { key: 'Escape' });
    expect(screen.queryByText('Your web is still being woven.')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('Escape still leaves the screen once the notice is gone', async () => {
    // TWO JOBS. It is the control \u2014 a fix that simply swallowed Escape on this
    // screen would pass the case above and break the way out for everyone. And
    // it is this harness's PRECONDITION: the root handler returns early on an
    // unsized canvas, so if this goes red every other Escape assertion here has
    // stopped meaning anything, whatever colour it shows.
    const onBack = vi.fn();
    await openMyWeb({ onBack, settings: { swEmptyDismissed: true } });
    fireEvent.keyDown(document.querySelector('.sw-root'), { key: 'Escape' });
    expect(onBack).toHaveBeenCalled();
  });

  it('Escape reaches the notice from the canvas, not only from the close button', async () => {
    // Focus lives on .sw-root for a reader who has not tabbed into the panel.
    // One handler on the root means Escape behaves the same either way; a
    // handler living on the panel only works when focus is already inside it.
    const onBack = vi.fn();
    await openMyWeb({ onBack });
    fireEvent.keyDown(document.querySelector('.sw-root'), { key: 'Escape' });
    expect(screen.queryByText('Your web is still being woven.')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('returns focus to the My web segment button, not to the body', async () => {
    // The notice is the only thing that was focused; without this the next
    // Tab starts from the top of the document and a keyboard reader is
    // dropped out of the control they were using.
    await openMyWeb();
    const close = screen.getByRole('button', { name: 'Dismiss' });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'My web' }));
  });
});
