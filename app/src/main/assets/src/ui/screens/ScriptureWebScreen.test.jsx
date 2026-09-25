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
      gl: {}, contextLost: false, stats: { instances: 0, draws: 0 },
      // Each draw records the (ppv, density) it was actually asked for. The
      // auto-switch's early return suppresses ONE frame, and with a mock that
      // throws its arguments away that frame is invisible — which is exactly how
      // a line ends up unwitnessed. Recording is additive; no other case reads it.
      draw: (opts) => {
        DRAWN.push({ ppv: opts && opts.ppv, dpr: (opts && opts.dpr) || 1, density: opts && opts.density, camY: opts && opts.camY, camX: opts && opts.camX, lens: opts && opts.lens });
        return { instances: 0, draws: 0 };
      },
      dispose: vi.fn(),
    })),
  };
});

import { createRenderer } from '../scripture-web/web-renderer.js';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';
import { modalRegistry } from '../../hooks/use-modal-registry.js';

const baseProps = () => ({
  // swGuideSeen: the how-to-read card (landing 13) opens on a first visit and
  // would sit under every tap below; these readers have seen it
  navigateToLink: () => {}, onBack: () => {}, settings: { swGuideSeen: true }, updateSetting: () => {},
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

  it('CONTROL and PRECONDITION: the canvas is sized, so + reaches the camera', async () => {
    const { container } = await mount();
    expect(zoomText(container)).toBe('Overview');
    await press('+');
    expect(zoomText(container)).not.toBe('Overview');
  });

  it('stops at 44 CSS px per verse — 1,711x here, never 4000x', async () => {
    const { container } = await mount();
    for (let i = 0; i < 40; i++) await press('+');
    // maxZoomFor(31102, 800) = 1710.61 -> the label rounds to 1711x.
    expect(zoomText(container)).toBe('1711x');
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
      expect(zoomText(container)).toBe('1711x');
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
         the camera settles on verse 15551 and the feet land at (15548 - 15551) * 44 + 400 = 268
         and 576 CSS px. On this 800x360 frame (base 260, ceil 256) arcShape gives R 100, A 90:
         the apex is at y = 260 - 90 = 170 and runs level from x 368 to 476, so the tap goes to
         the midpoint (422, 170) - measured distance 0.22 px at Famous, nothing at Essential,
         and it is above the rail band pickChapter owns (y >= 258). */
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
      expect(zoomText(container)).toBe('1711x');
      const root = container.querySelector('.sw-root');
      const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: 422, clientY: 170 });
      const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: 422, clientY: 170 });
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

  /* ── every line followable end to end (Corbin's brief 2026-09-11, item 7; w-sw-refs 2026-09-20) ──
     (b) tapping a line highlights it and its two feet, and a follow control pans the camera to
     the far foot. The far foot is the one further from the camera; after the follow the control
     names the other end, so a reader can walk a line back and forth. The line is chosen through
     Nearby (the keyboard path to the same commitFound a tap reaches), at the ceiling, because at
     the overview the whole canon fits the frame and the clamp holds x at the centre.
     (a) at close zoom a line whose far foot is off-screen carries that foot's reference on its
     body: witnessed through a recording 2D context, since jsdom has none. */
  describe('following a line: the sheet names the far foot, the follow pans to it, the body carries its reference', () => {
    const threaded = () => Object.assign(graph(), {
      count: 1,
      books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
      chapters: [[0, 1, 0, 15000], [0, 2, 15000, CANON - 15000]],
      chapterOfVerse: (() => { const c = new Uint16Array(CANON); c.fill(1, 15000); return c; })(),
      from: new Uint16Array([15551]), to: new Uint16Array([20100]), votes: new Int16Array([30]),
      buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [[15551, 20100]] }],
      chunkSize: 256,
    });
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const lastCamX = () => DRAWN[DRAWN.length - 1].camX;
    const pickNearby = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      // the first thread row: the list leads with the chapter row since landing 15
      fireEvent.click(document.querySelector('.sw-choice-row:not(.sw-choice-chapter)'));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    };
    /* a 2D context that records what is written; every other call is a no-op */
    const TEXTS = [];
    const ctx2d = new Proxy({}, {
      get: (t, k) => k === 'measureText' ? (str) => ({ width: 6 * String(str).length })
        : k === 'fillText' ? (str) => { TEXTS.push(String(str)); }
        : k === 'canvas' ? null : (typeof k === 'string' ? (t[k] !== undefined ? t[k] : () => {}) : undefined),
      set: (t, k, val) => { t[k] = val; return true; },
    });
    let realGetContext = null;
    beforeEach(() => {
      TEXTS.length = 0;
      realGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind) { return kind === '2d' ? ctx2d : null; };
    });
    afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

    it('the sheet offers Follow to the far foot; pressing it centres the camera there and the control turns to the other end', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1711x');
      expect(lastCamX()).toBeCloseTo(CANON / 2, 0);
      await pickNearby();
      const sheet = container.querySelector('.sw-sheet');
      expect(sheet, 'the connection sheet opened').toBeTruthy();
      // the camera sits at 15551 = the from foot, so the far foot is `to`: Genesis 2:5101
      const follow = screen.getByRole('button', { name: /follow the line to genesis 2:5101/i });
      fireEvent.click(follow);
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(lastCamX()).toBeCloseTo(20100, 0);
      // and back: the control now names the from foot
      fireEvent.click(screen.getByRole('button', { name: /follow the line to genesis 2:552/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(lastCamX()).toBeCloseTo(15551, 0);
      // the line stays chosen throughout: the sheet is still up
      expect(container.querySelector('.sw-sheet')).toBeTruthy();
    });

    it('at the ceiling the off-screen foot of the line is written on its body, and the on-screen foot reads off the ruler (book, chapter, verse)', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1711x');
      // the recorder holds every frame since the mount, the middle band's chapter numerals
      // included: read ONE frame at the ceiling (a press at the cap redraws without zooming)
      TEXTS.length = 0;
      await pressFrame('+');
      expect(TEXTS.length, 'precondition: the frame at the ceiling was painted').toBeGreaterThan(0);
      // the far foot, on the body: RED if no label pass exists
      expect(TEXTS.some((t) => /Gen 2:5101/.test(t)), 'a body label naming the far foot; texts: ' + TEXTS.slice(-12).join(' | ')).toBe(true);
      // the near foot, on the ruler: the verse numeral under its tick, the chapter numeral (sticky at close zoom: RED today, the chapter row stopped at 30 px/verse), the book
      expect(TEXTS).toContain('552');
      expect(TEXTS).toContain('2');
      expect(TEXTS).toContain('GENESIS');
      expect(container.querySelector('.sw-root').getAttribute('data-thread-labels'), 'the count of body labels drawn is published for the walks').toBe('1');
    });

    it('CONTROL: in the middle band the far foot is off-screen and NO body label is written; the labels belong to the verse-numeral zoom', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 12; i++) await pressFrame('+');
      const last = DRAWN[DRAWN.length - 1];
      const ppvCss = last.ppv / last.dpr;
      // the far foot (4,549 verses off) leaves the 800 px frame past 0.088 px/verse; verse numerals begin at 30
      expect(ppvCss, 'precondition: the far foot is off-screen at this zoom (' + zoomText(container) + ')').toBeGreaterThan(0.2);
      expect(ppvCss, 'precondition: not yet the verse-numeral band').toBeLessThan(30);
      TEXTS.length = 0;
      await pressFrame('ArrowLeft');
      expect(TEXTS.length, 'precondition: a frame was painted').toBeGreaterThan(0);
      expect(TEXTS.some((t) => /Gen 2:5101|Gen 2:552/.test(t)), 'no body label in the middle band; texts: ' + TEXTS.slice(-8).join(' | ')).toBe(false);
      expect(container.querySelector('.sw-root').getAttribute('data-thread-labels')).toBe('0');
    });
  });

  /* ── the camera gains y (w-sw-bent, 2026-09-20) ──
     Corbin: "still cannot pan up". ArrowUp looks up (the picture moves down the frame, camY grows),
     ArrowDown back; the sky is CLOSED at the overview (the dome fills the frame) and OPEN at the
     ceiling once the graph has a thread whose crown rises past the frame. My Web's rails hold y at 0.
     The renderer stub records the camY every draw was asked for. */
  describe('the camera gains y: ArrowUp looks up at the ceiling, never at the overview, and My Web holds the baseline', () => {
    const wide = () => Object.assign(graph(), {
      count: 1,
      from: new Uint16Array([100]), to: new Uint16Array([20100]), votes: new Int16Array([30]),
      buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [[100, 20100]] }],
      chunkSize: 256,
    });
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const lastCamY = () => DRAWN[DRAWN.length - 1].camY;
    const shownCamY = (container) => Number(container.querySelector('.sw-root').getAttribute('data-cam-y'));

    it('CONTROL: at the overview the sky is closed — ten ArrowUps draw camY 0', async () => {
      const { container } = await mount({}, wide);
      expect(zoomText(container)).toBe('Overview');
      for (let i = 0; i < 10; i++) await pressFrame('ArrowUp');
      expect(lastCamY()).toBe(0);
      expect(shownCamY(container)).toBe(0);
    });

    it('at the ceiling ArrowUp raises the camera (drawn AND published), ArrowDown brings it back to 0', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1711x');
      for (let i = 0; i < 10; i++) await pressFrame('ArrowUp');
      // RED if the key handler drops its y frame, or the draw stops carrying camY
      expect(lastCamY()).toBeGreaterThan(0);
      expect(shownCamY(container)).toBeCloseTo(lastCamY(), 0);
      for (let i = 0; i < 40; i++) await pressFrame('ArrowDown');
      expect(lastCamY()).toBe(0);
    });

    it('switching to My Web with the camera raised draws it at the baseline: the rails have no sky', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      for (let i = 0; i < 10; i++) await pressFrame('ArrowUp');
      expect(lastCamY(), 'precondition: raised on the canon web').toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: /my web/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(lastCamY()).toBe(0);
      expect(shownCamY(container)).toBe(0);
    });
  });

  describe('the lens (landing 10): past the overview the chapter under the centre is published and handed to the renderer', () => {
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const shownLens = (container) => container.querySelector('.sw-root').getAttribute('data-lens');

    it('CONTROL: at the overview there is no lens - data-lens empty, the draw carries null', async () => {
      const { container } = await mount();
      expect(zoomText(container)).toBe('Overview');
      expect(shownLens(container)).toBe('');
      expect(DRAWN[DRAWN.length - 1].lens).toBeNull();
    });

    it('at the ceiling the lens is the chapter under the centre (the one chapter here): published as "lo-hi" and drawn', async () => {
      const { container } = await mount();
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1711x');
      expect(shownLens(container)).toBe('0-' + (CANON - 1));
      expect(DRAWN[DRAWN.length - 1].lens).toEqual([0, CANON - 1]);
    });

    it('My Web has no lens: switching at the ceiling clears data-lens and the draw carries null', async () => {
      const { container } = await mount();
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(shownLens(container), 'precondition: lit on the canon web').toBe('0-' + (CANON - 1));
      fireEvent.click(screen.getByRole('button', { name: /my web/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(shownLens(container)).toBe('');
      expect(DRAWN[DRAWN.length - 1].lens).toBeNull();
    });
  });

  describe('sky navigation (landing 9): the altitude ruler names the height, the elevator jumps it', () => {
    const wide = () => Object.assign(graph(), {
      count: 1,
      from: new Uint16Array([100]), to: new Uint16Array([20100]), votes: new Int16Array([30]),
      buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [[100, 20100]] }],
      chunkSize: 256,
    });
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const attr = (container, name) => container.querySelector('.sw-root').getAttribute(name);
    const tapAt = async (container, x, y) => {
      const root = container.querySelector('.sw-root');
      const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: x, clientY: y });
      const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: x, clientY: y });
      await act(async () => { root.dispatchEvent(down); root.dispatchEvent(up); await new Promise((r) => setTimeout(r, 40)); });
    };

    it('CONTROL: at the baseline there is no altitude ruler; at the overview no elevator either', async () => {
      const { container } = await mount({}, wide);
      expect(attr(container, 'data-altitude')).toBe('');
      expect(attr(container, 'data-altitude-span')).toBe('');
      expect(attr(container, 'data-elevator')).toBe('');
      // a tap on the right edge at the overview falls through to the web: the camera stays down
      await tapAt(container, FRAME_CSS - 12, 130);
      expect(attr(container, 'data-cam-y')).toBe('0.0');
    });

    it('risen at the ceiling, the ruler names a chapter (30 verses of span crown 422 px up; ten ArrowUps lift 312)', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(attr(container, 'data-elevator'), 'precondition: a sky to climb').toBe('0.0000');
      expect(attr(container, 'data-altitude')).toBe('');
      for (let i = 0; i < 10; i++) await pressFrame('ArrowUp');
      expect(Number(attr(container, 'data-cam-y'))).toBeGreaterThan(0);
      expect(attr(container, 'data-altitude').split(',')).toContain('30');
      expect(Number(attr(container, 'data-elevator'))).toBeGreaterThan(0);
      // the live readout at the frame's middle row (130): h = 260 + 312 - 130 = 442 px,
      // span = 2 * 442 / (44 * 0.64) = 31.4 -> "31"
      expect(attr(container, 'data-altitude-span')).toBe('31');
    });

    it('a tap on the elevator track sets the height: half way up the track is half the sky', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(attr(container, 'data-cam-y')).toBe('0.0');
      // the track runs from 8 to base - 8 = 252 CSS px (no top chrome height in jsdom): 130 is its middle
      await tapAt(container, FRAME_CSS - 12, 130);
      expect(Number(attr(container, 'data-cam-y'))).toBeGreaterThan(0);
      expect(Number(attr(container, 'data-elevator'))).toBeCloseTo(0.5, 1);
      expect(DRAWN[DRAWN.length - 1].camY).toBeCloseTo(Number(attr(container, 'data-cam-y')), 0);
      // a tap at the track's foot brings the camera back to the baseline
      await tapAt(container, FRAME_CSS - 12, 252);
      expect(attr(container, 'data-cam-y')).toBe('0.0');
    });

    it('a drag on the track rides the finger: down at the middle, up to the top, the camera reaches the tallest apex', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      const root = container.querySelector('.sw-root');
      const camXBefore = DRAWN[DRAWN.length - 1].camX;
      const ev = (type, y) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'touch', clientX: FRAME_CSS - 12, clientY: y });
      await act(async () => { root.dispatchEvent(ev('pointerdown', 130)); root.dispatchEvent(ev('pointermove', 100)); await new Promise((r) => setTimeout(r, 30)); });
      const midway = Number(attr(container, 'data-elevator'));
      expect(midway).toBeGreaterThan(0.5);
      await act(async () => { root.dispatchEvent(ev('pointermove', 8)); root.dispatchEvent(ev('pointerup', 8)); await new Promise((r) => setTimeout(r, 30)); });
      expect(attr(container, 'data-elevator')).toBe('1.0000');
      // the drag was the lift's, not the web's: the camera did not pan in x
      expect(DRAWN[DRAWN.length - 1].camX).toBeCloseTo(camXBefore, 6);
    });

    it('the track dies with the switch to My Web: a drag in the right strip pans the rail (the l9-14 refuter\'s FAIL)', async () => {
      const { container } = await mount({}, wide);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(attr(container, 'data-elevator'), 'precondition: a track on the canon web').toBe('0.0000');
      fireEvent.click(screen.getByRole('button', { name: /my web/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(attr(container, 'data-elevator')).toBe('');
      const root = container.querySelector('.sw-root');
      const camXBefore = DRAWN[DRAWN.length - 1].camX;
      const ev = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 12, pointerType: 'touch', clientX: x, clientY: y });
      await act(async () => { root.dispatchEvent(ev('pointerdown', FRAME_CSS - 12, 130)); root.dispatchEvent(ev('pointermove', 400, 130)); root.dispatchEvent(ev('pointerup', 400, 130)); await new Promise((r) => setTimeout(r, 40)); });
      expect(DRAWN[DRAWN.length - 1].camX).not.toBeCloseTo(camXBefore, 3);
      expect(attr(container, 'data-cam-y')).toBe('0.0');
    });
  });
});

describe('how to read this web (landing 13): one card, plain words, once', () => {
  const mountGuide = async (props = {}) => {
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    // the root key handler returns early on an unsized canvas
    for (const [prop, px] of [['clientWidth', 800], ['clientHeight', 600]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return px; } });
    }
    const view = render(<ScriptureWebScreen {...baseProps()} {...props} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    return view;
  };
  afterEach(() => {
    delete HTMLCanvasElement.prototype.clientWidth;
    delete HTMLCanvasElement.prototype.clientHeight;
  });

  it('opens on a first visit and Got it closes it, recording swGuideSeen', async () => {
    const updateSetting = vi.fn();
    const { container } = await mountGuide({ settings: {}, updateSetting });
    const card = container.querySelector('.sw-guide');
    expect(card, 'the card is up for a reader who has not seen it').toBeTruthy();
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.textContent).toMatch(/How to read this web/);
    expect(card.querySelectorAll('li').length).toBeGreaterThanOrEqual(5);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith('swGuideSeen', true);
  });

  it('stays closed for a reader who has seen it; the ? button brings it back and Escape closes it without leaving', async () => {
    const onBack = vi.fn();
    const { container } = await mountGuide({ onBack });
    expect(container.querySelector('.sw-guide')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /how to read this web/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeTruthy();
    fireEvent.keyDown(container.querySelector('.sw-root'), { key: 'Escape' });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('the Nearby list reads the lens (landing 15)', () => {
  // one chapter (Genesis 1, the whole canon) with two threads: the stronger one must lead
  const two = () => Object.assign({
    total: 31102, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
    books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
    chapters: [[0, 1, 0, 31102]], chapterOfVerse: new Uint16Array(31102),
    from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
    votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
  });
  const mountList = async () => {
    for (const [prop, px] of [['clientWidth', 800], ['clientHeight', 360]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return px; } });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 2 };
    if (!prevDecode) prevDecode = vi.mocked(decodeGraph).getMockImplementation();
    vi.mocked(decodeGraph).mockImplementation(() => two());
    const view = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    return view;
  };
  let prevDecode = null;
  afterEach(() => {
    delete HTMLCanvasElement.prototype.clientWidth;
    delete HTMLCanvasElement.prototype.clientHeight;
    // the shared decode mock goes back the way it was, or the load test after this reads my graph
    if (prevDecode) vi.mocked(decodeGraph).mockImplementation(prevDecode);
  });

  it('leads with the chapter row (where its threads go), then the threads strongest first; at the overview the header says Nearby', async () => {
    const { container } = await mountList();
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const list = container.querySelector('.sw-list');
    expect(list, 'the list opened').toBeTruthy();
    expect(list.getAttribute('data-lens-on')).toBe('0');
    expect(list.querySelector('.sw-sheet-eyebrow').textContent).toMatch(/^Nearby · Genesis 1/);
    const rows = [...list.querySelectorAll('.sw-choice-row')];
    expect(rows.length).toBe(3);
    expect(rows[0].className).toMatch(/sw-choice-chapter/);
    expect(rows[0].textContent).toMatch(/Genesis 1 — where its threads go/);
    expect(rows[1].textContent).toMatch(/30 votes/);
    expect(rows[2].textContent).toMatch(/7 votes/);
  });

  it('past the overview the header says Under the lens, and choosing the chapter row opens its sheet', async () => {
    const { container } = await mountList();
    const root = container.querySelector('.sw-root');
    for (let i = 0; i < 12; i++) {
      fireEvent.keyDown(root, { key: '+' });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const list = container.querySelector('.sw-list');
    expect(list.getAttribute('data-lens-on')).toBe('1');
    expect(list.querySelector('.sw-sheet-eyebrow').textContent).toMatch(/^Under the lens · Genesis 1/);
    fireEvent.click(list.querySelector('.sw-choice-chapter'));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(container.querySelector('.sw-list')).toBeNull();
    const sheet = container.querySelector('.sw-sheet');
    expect(sheet, 'the chapter sheet opened').toBeTruthy();
    expect(sheet.textContent).toMatch(/Chapter/);
  });

  /* v08-03: the panels were plain local state, so the app's Escape dispatcher
     (a document listener) and Android Back (handleAndroidBack reads the modal
     registry first) saw nothing open: one Escape closed the panel AND left the
     web, and Back left with the sheet still up. */
  it('(v08-03) Escape closes the panel without reaching the app dispatcher; Back closes it through the registry', async () => {
    const appEscape = vi.fn();
    document.addEventListener('keydown', appEscape);
    try {
      const { container } = await mountList();
      fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(container.querySelector('.sw-list')).toBeTruthy();
      expect(modalRegistry.isAnyOpen(), 'an open panel is in the registry').toBe(true);

      fireEvent.keyDown(container.querySelector('.sw-list .sw-sheet-close'), { key: 'Escape' });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(container.querySelector('.sw-list')).toBeNull();
      expect(appEscape, 'the keystroke stopped at the web').not.toHaveBeenCalled();
      expect(modalRegistry.isAnyOpen()).toBe(false);

      // Android Back: handleAndroidBack dismisses the registry's top entry
      fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(container.querySelector('.sw-list')).toBeTruthy();
      act(() => { modalRegistry.peek().dismiss(); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(container.querySelector('.sw-list')).toBeNull();
      expect(modalRegistry.isAnyOpen()).toBe(false);
    } finally {
      document.removeEventListener('keydown', appEscape);
    }
  });

  it('(v08-03) Escape with nothing open leaves once, and the app dispatcher never leaves a second time', async () => {
    const appEscape = vi.fn();
    document.addEventListener('keydown', appEscape);
    try {
      for (const [prop, px] of [['clientWidth', 800], ['clientHeight', 360]]) {
        Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return px; } });
      }
      window.SCRIPTURE_WEB_DATA = { ok: true, count: 2 };
      if (!prevDecode) prevDecode = vi.mocked(decodeGraph).getMockImplementation();
      vi.mocked(decodeGraph).mockImplementation(() => two());
      const onBack = vi.fn();
      const { container } = render(<ScriptureWebScreen {...baseProps()} onBack={onBack} />);
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      fireEvent.keyDown(container.querySelector('.sw-root'), { key: 'Escape' });
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(appEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', appEscape);
    }
  });

  /* v03-03: the panels focused their close button on mount and nothing more:
     Tab walked out into the page behind, and closing dropped focus on body. */
  it('(v03-03) Tab stays inside an open panel and closing it hands focus back to the web', async () => {
    const { container } = await mountList();
    const root = container.querySelector('.sw-root');
    root.focus();
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const list = container.querySelector('.sw-list');
    const buttons = [...list.querySelectorAll('button')];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement, 'Tab from the last row wraps to the first').toBe(buttons[0]);
    fireEvent.click(buttons[0]);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-list')).toBeNull();
    expect(document.activeElement).toBe(root);
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
    expect(screen.queryByText('The map can’t be drawn on this device right now.')).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('The map can’t be drawn on this device right now.')).toBeTruthy();
  });

  it('does NOT fall back when a restore arrives before the ~3s timer', async () => {
    const opts = await renderWithGraph();
    vi.useFakeTimers();
    act(() => { opts.onContextLost(); });
    act(() => { opts.onContextRestored(); });
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.queryByText('The map can’t be drawn on this device right now.')).toBeNull();
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
    // an explicit settings object still describes a reader who has seen the how-to-read card
    props = Object.assign({}, props, { settings: Object.assign({ swGuideSeen: true }, props && props.settings) });
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

  it('R4 in My Web the legend names the two families, yours first, a pin per shape and a bar per source; never the canon axis or the distance ramp', async () => {
    // 1b (design-myweb-colour.md, 5): the reader's links are the point of My
    // Web, so "yours" leads with the three shapes and their pins; Timothy's
    // four sources follow with a bar each. Canon hue is retired here.
    await openMyWeb();
    const legend = document.querySelector('.sw-legend');
    expect(legend).toBeTruthy();
    const text = legend.textContent;
    expect(text.indexOf('yours')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('yours')).toBeLessThan(text.indexOf('Timothy'));
    for (const w of ['within scripture', 'within the Volumes', 'across', 'footnotes', 'study notes', 'studies', 'Words To Live By']) expect(text).toContain(w);
    expect(legend.querySelectorAll('.sw-key-pin').length).toBe(3);
    expect(legend.querySelectorAll('.sw-key-pin.is-ring, .sw-key-pin.is-dot, .sw-key-pin.is-ring-dot').length).toBe(3);
    expect(legend.querySelectorAll('.sw-key-line').length).toBe(4);
    expect(legend.querySelector('.sw-key-gradient')).toBeNull();
    expect(text).not.toMatch(/Genesis|Revelation|across the canon|nearby/);
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
