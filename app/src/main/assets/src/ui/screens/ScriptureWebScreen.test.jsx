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
vi.mock('../../utils/scripture-web/geometry.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, deepZoomFor: vi.fn(real.deepZoomFor) };
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
        DRAWN.push({ ppv: opts && opts.ppv, dpr: (opts && opts.dpr) || 1, density: opts && opts.density, camY: opts && opts.camY, camX: opts && opts.camX, lens: opts && opts.lens,
          focusArc: opts && opts.focusArc, focusRange: opts && opts.focusRange, lensDim: opts && opts.lensDim,
          centre: opts && opts.centre, tapFade: opts && opts.tapFade, focusProphecy: opts && opts.focusProphecy,
          hoverProphecy: opts && opts.hoverProphecy });
        return { instances: 0, draws: 0 };
      },
      // My Web's ground (refactor.md #10): one clear, recorded so a case can
      // tell the last GL call was the ground and not a thread pass
      clear: (bg) => { DRAWN.push({ clear: true, bg }); },
      dispose: vi.fn(),
    })),
  };
});

import { createRenderer } from '../scripture-web/web-renderer.js';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { ScriptureWebScreen, _resetWebPlace, _setWebPlace } from './ScriptureWebScreen.jsx';
import { LEG_PPV_CSS } from '../scripture-web/overlay-renderer.js';
import { modalRegistry } from '../../hooks/use-modal-registry.js';
import { webFrame } from '../../utils/scripture-web/web-frame.js';
import { footX, arcShape, squashFactor, deepZoomFor, maxZoomFor } from '../../utils/scripture-web/geometry.js';

/* The verse zoom (Corbin 2026-10-21) moved the camera's ceiling from the tap rule (44 CSS px a verse,
   maxZoomFor) to one verse 0.8 of the frame (deepZoomFor). The cases that read pixels AT the tap rule
   (a tap on a thread's body, the hover chip, the ruler's foot names, the sky's heights) still pin that
   depth, where flights land: capAtTapRule() puts the ceiling back there for one case. */
const capAtTapRule = () => { vi.mocked(deepZoomFor).mockImplementation(maxZoomFor); };

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
  _resetWebPlace();
  delete window.SCRIPTURE_WEB_DATA;
  vi.unstubAllGlobals();
  setViewport(ORIG_W, ORIG_H);
  delete window.screen.orientation;
  vi.useRealTimers();
  vi.mocked(deepZoomFor).mockReset();
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

  it('stops at one verse 0.8 of the frame — 24,882x here (the verse zoom), never 4000x', async () => {
    const { container } = await mount();
    for (let i = 0; i < 40; i++) await press('+');
    // deepZoomFor(31102, 800) = 0.8 x 31102 = 24881.6 -> the label rounds to 24882x (the tap rule's
    // maxZoomFor = 1710.61 is no longer the camera's ceiling: Corbin 2026-10-21, the verse zoom).
    expect(zoomText(container)).toBe('24882x');
  });

  it('A1 — says so through .sw-live instead of doing nothing silently', async () => {
    const { container } = await mount();
    for (let i = 0; i < 40; i++) await press('+');
    // the words, trimmed: a repeat of the same words toggles a trailing no-break space so the
    // region is read again (w3 panel step 2, sw-chrome-header.test.jsx)
    expect(container.querySelector('.sw-live').textContent.trim()).toBe('Zoomed all the way in');
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
      expect(zoomText(container)).toBe('24882x');
      expect(shown(), 'the density control').toBe('famous');
      const deep = DRAWN.filter((d) => d.ppv / d.dpr >= 22);
      expect(deep.length, 'frames drawn past 22 CSS px per verse').toBeGreaterThan(0);
      expect(deep.map((d) => d.density), 'every deep frame').toEqual(deep.map(() => 'famous'));
      expect(container.querySelector('.sw-live').textContent).not.toMatch(/Essential density/);
    });

    it('RED today: at the ceiling a thread that exists only in Famous (7 votes) is tappable and brings up its connection card', async () => {
      capAtTapRule();
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

    /* GL item 4: a prophecy pair is drawn always, so it is tappable. This one joins verses no
       OpenBible arc joins (107 of the asset's 132 pairs are such), so the graph has no arcs at all:
       the tap can only find it through the prophecy class. The apex is computed from the frame the
       screen draws (webFrame) and the law (arcShape over the pair's own feet). */
    it('a tap on a prophecy pair that is no arc chooses it: the draw names it, the card reads "Prophecy fulfilled"', async () => {
      const foretold = () => Object.assign(graph(), { prophecy: [{ a: 1000, b: 30000, studyId: 's', chapterId: 'c' }] });
      const { container } = await mount({}, foretold);
      const f = webFrame({ W: FRAME_CSS, H: 360, DPR: 1 });
      const cam = { x: CANON / 2, ppv: FRAME_CSS / CANON, total: CANON };
      const x0 = footX(cam, FRAME_CSS, 1000, 0), x1 = footX(cam, FRAME_CSS, 30000, 0);
      const { A } = arcShape((x1 - x0) / 2, squashFactor(f.ceil, FRAME_CSS));
      const cx = (x0 + x1) / 2, cy = f.base - A;
      expect(DRAWN[DRAWN.length - 1].camX, 'PRECONDITION: the overview camera').toBeCloseTo(CANON / 2, 6);
      const root = container.querySelector('.sw-root');
      const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: cx, clientY: cy });
      const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: cx, clientY: cy });
      await act(async () => { root.dispatchEvent(down); root.dispatchEvent(up); await new Promise((r) => setTimeout(r, 40)); });
      const last = DRAWN.filter((d) => !d.clear).pop();
      expect(last.focusProphecy).toBe(0);
      expect(last.focusArc).toBe(-1);
      const sheet = container.querySelector('.sw-sheet');
      expect(sheet, 'the connection card opened for the pair').toBeTruthy();
      expect(sheet.textContent).toMatch(/Prophecy fulfilled · 29,000 verses apart/);
      // CONTROL: 30 px under the line there is nothing to choose
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      const down2 = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: cx, clientY: cy + 30 });
      const up2 = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 8, pointerType: 'touch', clientX: cx, clientY: cy + 30 });
      await act(async () => { root.dispatchEvent(down2); root.dispatchEvent(up2); await new Promise((r) => setTimeout(r, 40)); });
      expect(container.querySelector('.sw-sheet')).toBeNull();
      expect(DRAWN.filter((d) => !d.clear).pop().focusProphecy).toBe(-1);
    });

    /* GL review 2026-10-18 (finding 2): a hover on a lone prophecy pair (no OpenBible arc, 107 of
       the asset's) drew no highlight, since hoverArc can only name an arc; its chip read "weight 0";
       and from one lone pair to the next within 4 px the chip kept the first, as both read index -1.
       Two pairs about the same centre, the second 3 px higher at its apex. */
    it('a hover on a prophecy pair that is no arc lights it (hoverProphecy), its chip reads "Prophecy fulfilled", and the next pair 3 px on takes the chip', async () => {
      const f = webFrame({ W: FRAME_CSS, H: 360, DPR: 1 });
      const cam = { x: CANON / 2, ppv: FRAME_CSS / CANON, total: CANON };
      const squash = squashFactor(f.ceil, FRAME_CSS);
      const d = Math.ceil(3 / (cam.ppv * squash));
      const pairs = [{ a: 1000, b: 30000, studyId: 's', chapterId: 'c' }, { a: 1000 - d, b: 30000 + d, studyId: 's', chapterId: 'c' }];
      const apex = (p) => {
        const x0 = footX(cam, FRAME_CSS, p.a, 0), x1 = footX(cam, FRAME_CSS, p.b, 0);
        return { cx: (x0 + x1) / 2, cy: f.base - arcShape((x1 - x0) / 2, squash).A };
      };
      const [pa, pb] = pairs.map(apex);
      expect(pa.cy - pb.cy, 'PRECONDITION: the second apex is 3 px over the first').toBeGreaterThanOrEqual(3);
      expect(pa.cy - pb.cy).toBeLessThan(4);
      expect(Math.abs(pa.cx - pb.cx)).toBeLessThan(0.5);
      const { container } = await mount({}, () => Object.assign(graph(), { prophecy: pairs }));
      const root = container.querySelector('.sw-root');
      const move = async (x, y) => {
        await act(async () => {
          root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 22, pointerType: 'mouse', clientX: x, clientY: y }));
          // two frames: the hover's (the pick, the chip) and the draw it schedules
          await new Promise((r) => setTimeout(r, 80));
        });
      };
      await move(pa.cx, pa.cy);
      const tip = container.querySelector('.sw-tip');
      expect(tip, 'a resting mouse on the pair shows its chip').toBeTruthy();
      expect(tip.textContent).toMatch(/Prophecy fulfilled · 29,000 verses apart/);
      expect(tip.textContent).not.toMatch(/weight/);
      expect(DRAWN.filter((d2) => !d2.clear).pop().hoverProphecy, 'the hovered pair is drawn in the hover ink').toBe(0);
      await move(pb.cx, pb.cy);
      expect(container.querySelector('.sw-tip').textContent).toMatch(new RegExp('Prophecy fulfilled · ' + (29000 + 2 * d).toLocaleString() + ' verses apart'));
      expect(DRAWN.filter((d2) => !d2.clear).pop().hoverProphecy).toBe(1);
      // CONTROL: off every line the hover lets go
      await move(pa.cx, pa.cy + 40);
      expect(container.querySelector('.sw-tip')).toBeNull();
      expect(DRAWN.filter((d2) => !d2.clear).pop().hoverProphecy).toBe(-1);
    });

    /* sw1 B4 (audit-web 10-05): the hover chip was set only by a resting mouse and cleared by nothing
       that moved the web, so after a key pan or a drag it named a line that was no longer under it. */
    it('the hover chip drops when the web moves under it: a key pan, then a drag', async () => {
      capAtTapRule();
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
      const root = container.querySelector('.sw-root');
      const ev = (type, x, y, pointerType = 'mouse') => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 21, pointerType, clientX: x, clientY: y });
      const hoverLine = async () => {
        await act(async () => { root.dispatchEvent(ev('pointermove', 422, 170)); await new Promise((r) => setTimeout(r, 40)); });
        expect(container.querySelector('.sw-tip'), 'PRECONDITION: a resting mouse on the line shows its chip').toBeTruthy();
      };
      await hoverLine();
      await pressFrame('ArrowLeft');
      expect(container.querySelector('.sw-tip'), 'a key pan drops the chip').toBeNull();
      await pressFrame('ArrowRight');
      await hoverLine();
      await act(async () => {
        root.dispatchEvent(ev('pointerdown', 422, 170));
        root.dispatchEvent(ev('pointermove', 470, 170));
        root.dispatchEvent(ev('pointerup', 470, 170));
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(container.querySelector('.sw-tip'), 'a drag drops the chip').toBeNull();
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
    const RECTS = [];
    const ctx2d = new Proxy({}, {
      get: (t, k) => k === 'measureText' ? (str) => ({ width: 6 * String(str).length })
        : k === 'fillText' ? (str) => { TEXTS.push(String(str)); }
        : k === 'fillRect' ? (x, y, w, h) => { RECTS.push({ x, y, w, h }); }
        : k === 'canvas' ? null : (typeof k === 'string' ? (t[k] !== undefined ? t[k] : () => {}) : undefined),
      set: (t, k, val) => { t[k] = val; return true; },
    });
    let realGetContext = null;
    beforeEach(() => {
      TEXTS.length = 0;
      RECTS.length = 0;
      realGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind) { return kind === '2d' ? ctx2d : null; };
    });
    afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

    it('the sheet offers Follow to the far foot; pressing it centres the camera there and the control turns to the other end', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('24882x');
      expect(lastCamX()).toBeCloseTo(CANON / 2, 0);
      await pickNearby();
      const sheet = container.querySelector('.sw-sheet');
      expect(sheet, 'the connection sheet opened').toBeTruthy();
      // the camera sits at 15551 = the from foot, so the far foot is `to`: Genesis 2:5101
      const follow = screen.getByRole('button', { name: /^follow to genesis 2:5101$/i });
      /* A3 (w3 navigation): Follow FLIES there, eased over 600-900 ms through the frame loop, so
         the camera is read once the fly has landed (it once jumped, and one frame was enough). */
      const landsAt = async (x) => {
        for (let i = 0; i < 80 && Math.abs(lastCamX() - x) > 0.05; i++) {
          await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        }
        expect(lastCamX()).toBeCloseTo(x, 1);
      };
      fireEvent.click(follow);
      // centred on the foot, at the verse's middle
      await landsAt(20100.5);
      // and back: the control now names the from foot
      fireEvent.click(screen.getByRole('button', { name: /^follow to genesis 2:552$/i }));
      await landsAt(15551.5);
      // the line stays chosen throughout: the sheet is still up
      expect(container.querySelector('.sw-sheet')).toBeTruthy();
    });

    /* Integration (w3): the panel's trail Back called journey.back(), which flies home and reopens
       the line on landing (use-journey.js), and then flew on its own to the crumb's verse: the second
       fly took over the first, so the line was never reopened from home and the camera stopped at
       the verse's edge, not its foot. Back is the journey's alone. */
    it("the trail's Back flies home to the foot and opens the line again from there", async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      await pickNearby();
      const landsAt = async (x) => {
        for (let i = 0; i < 80 && Math.abs(lastCamX() - x) > 0.05; i++) {
          await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
        }
        expect(lastCamX()).toBeCloseTo(x, 1);
      };
      fireEvent.click(screen.getByRole('button', { name: /^follow to genesis 2:5101$/i }));
      await landsAt(20100.5);
      expect(container.querySelectorAll('.sw-crumbs li'), 'home, then here').toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Back along the trail' }));
      await landsAt(15551.5);
      // reopened from home on landing (the fly's last frame): its Follow names the far foot again
      const again = /^follow to genesis 2:5101$/i;
      for (let i = 0; i < 50 && !screen.queryByRole('button', { name: again }); i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      }
      expect(screen.getByRole('button', { name: again })).toBeTruthy();
      expect(container.querySelector('.sw-crumbs'), 'home: the trail is done').toBeNull();
    });

    /* sw1 B1 (audit-web 10-05): the card's x closed the card but left the line focused, so the shader kept
       every other thread at 5 % ink for good; Escape and Back cleared it, the visible x did not. */
    it('closing the card with its x lets go of the line: the next frame draws with no focus', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      await pickNearby();
      expect(container.querySelector('.sw-sheet'), 'the connection sheet opened').toBeTruthy();
      expect(DRAWN[DRAWN.length - 1].focusArc, 'PRECONDITION: the chosen line is focused').toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
      expect(container.querySelector('.sw-sheet')).toBeNull();
      const last = DRAWN[DRAWN.length - 1];
      expect(last.focusArc).toBe(-1);
      expect(last.focusRange).toBeNull();
    });

    /* GL item 5: a chosen line makes the rest of the web recede to TAP_CONTEXT (the shader's uTapFade), eased
       over about 180 ms rather than snapped, and the close brings it back the same way. */
    it('choosing a line eases the rest of the web back (tapFade 0 to 1 over frames), and closing eases it in again', async () => {
      await mount({}, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(DRAWN[DRAWN.length - 1].tapFade, 'PRECONDITION: nothing chosen, nothing receded').toBe(0);
      let mark = DRAWN.length;
      await pickNearby();
      await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
      expect(DRAWN[DRAWN.length - 1].focusArc, 'PRECONDITION: the line is chosen').toBe(0);
      let fades = DRAWN.slice(mark).filter((d) => !d.clear).map((d) => d.tapFade);
      expect(fades[fades.length - 1]).toBe(1);
      expect(fades.some((f) => f > 0 && f < 1), 'a frame between: eased, not snapped').toBe(true);
      for (let i = 1; i < fades.length; i++) expect(fades[i]).toBeGreaterThanOrEqual(fades[i - 1]);
      mark = DRAWN.length;
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
      fades = DRAWN.slice(mark).filter((d) => !d.clear).map((d) => d.tapFade);
      expect(fades[fades.length - 1]).toBe(0);
      expect(fades.some((f) => f > 0 && f < 1), 'a frame between on the way back').toBe(true);
    });

    /* sw1 B3 (audit-web 10-05): opening a verse unmounts the web, and its camera, focus and card lived only in
       refs, so Back from the reader landed at fit with nothing chosen. */
    it('coming back from a verse opened on the card keeps the zoom, the place, the chosen line and its card', async () => {
      const opened = [];
      const first = await mount({ navigateToLink: (ep) => opened.push(ep) }, threaded);
      for (let i = 0; i < 40; i++) await pressFrame('+');
      await pickNearby();
      const before = DRAWN[DRAWN.length - 1];
      expect(before.focusArc, 'PRECONDITION: a line is chosen').toBe(0);
      const go = [...first.container.querySelectorAll('.sw-sheet button')]
        .find((b) => /^Open .* in the reader$/.test(b.getAttribute('aria-label') || ''));
      expect(go, 'PRECONDITION: the card offers a verse to open').toBeTruthy();
      fireEvent.click(go);
      expect(opened.length).toBe(1);
      first.unmount();                       // the reader replaces the web
      DRAWN.length = 0;
      const back = await mount({}, threaded); // "Back to The Scripture Web"
      const now = DRAWN[DRAWN.length - 1];
      expect(now.ppv).toBeCloseTo(before.ppv, 6);
      expect(now.camX).toBeCloseTo(before.camX, 6);
      expect(now.focusArc).toBe(0);
      expect(back.container.querySelector('.sw-sheet'), 'the card is back up').toBeTruthy();
      // one-shot: a later visit opens at fit as before
      back.unmount();
      DRAWN.length = 0;
      await mount({}, threaded);
      expect(zoomText()).toBe('Overview');
      expect(DRAWN[DRAWN.length - 1].focusArc).toBe(-1);
    });

    /* sw1 (audit-web 10-05): under the baseline each chapter's bar is as TALL as the chapter is long, and was
       drawn 0.8 of the chapter WIDE, so zoomed in a long chapter (Psalm 119) became a large grey block. */
    it('the chapter-length bars stay thin at every zoom below the verse ticks (their height is the length)', async () => {
      // w3: the overview ruler hands over to the deep band at 5x-6.5x, so the bars are read
      // at 3 presses (4.1x, the overview's own) and at 6 (16.8x, where only the deep band's
      // chapter ticks are left): nothing tall is ever wide
      await mount({}, threaded);
      let pressed = 0;
      for (const presses of [3, 6]) {
        for (; pressed < presses - 1; pressed++) await pressFrame('+');
        RECTS.length = 0;          // read the one frame at this zoom
        await pressFrame('+');
        pressed++;
        const dpr = DRAWN[DRAWN.length - 1].dpr;
        const bars = RECTS.filter((r) => r.h > 4 * dpr);
        expect(bars.length, 'PRECONDITION: the bars were drawn at ' + presses + ' presses').toBeGreaterThan(0);
        expect(Math.max(...bars.map((r) => r.w)), presses + ' presses').toBeLessThanOrEqual(3 * dpr);
      }
    });

    it('at the ceiling the off-screen foot of the line is written on its body, and the on-screen foot reads off the ruler (book, chapter, verse)', async () => {
      capAtTapRule();
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

    /* w3 (the canvas stream; build spec §4.3): from about 6x a chip at each foot names both ends
       ("Gen 2:552 · Gen 2:5101"), so in the middle band the far foot is already named, at the foot.
       What still belongs to the verse-numeral zoom (LEG_PPV_CSS) is the far end written alone
       beside the leg. This CONTROL pinned "no label at all under 30 px a verse"; its intent, that
       the leg labels wait for the verse numerals, is what it pins now. */
    it('CONTROL: in the middle band the far foot is off-screen and is named in the chip at its near foot, never beside the leg; the leg labels belong to the verse-numeral zoom', async () => {
      const { container } = await mount({}, threaded);
      for (let i = 0; i < 12; i++) await pressFrame('+');
      const last = DRAWN[DRAWN.length - 1];
      const ppvCss = last.ppv / last.dpr;
      // the far foot (4,549 verses off) leaves the 800 px frame past 0.088 px/verse
      expect(ppvCss, 'precondition: the far foot is off-screen at this zoom (' + zoomText(container) + ')').toBeGreaterThan(0.2);
      expect(ppvCss, 'precondition: not yet the verse-numeral band').toBeLessThan(LEG_PPV_CSS);
      TEXTS.length = 0;
      await pressFrame('ArrowLeft');
      expect(TEXTS.length, 'precondition: a frame was painted').toBeGreaterThan(0);
      expect(TEXTS, 'the chip at the near foot names both ends; texts: ' + TEXTS.slice(-8).join(' | ')).toContain('Gen 2:552 · Gen 2:5101');
      expect(TEXTS.some((t) => /→|←/.test(t)), 'no far end written beside the leg in the middle band; texts: ' + TEXTS.slice(-8).join(' | ')).toBe(false);
      expect(container.querySelector('.sw-root').getAttribute('data-thread-labels'), 'one thread labelled, once').toBe('1');
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
      expect(zoomText(container)).toBe('24882x');
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
      // My Web's GL surface is the ground alone (refactor.md #10): no thread
      // pass runs, so nothing can be drawn up in a sky
      expect(DRAWN[DRAWN.length - 1].clear).toBe(true);
      expect(shownCamY(container)).toBe(0);
    });
  });

  /* Q2 retired the lens (the rest of the web at 0.35 from 6x): nothing dims as the reader zooms, and
     the chapter under the centre is emphasised instead (spec 4.4). These cases pinned lens/lensDim on the
     draw; rewritten to the centre chapter the renderer is handed now (CONTRACTS.md section 5). */
  describe('the centre chapter (Q2, the lens retired): past the overview the chapter under the centre is published and handed to the renderer', () => {
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };
    const shownLens = (container) => container.querySelector('.sw-root').getAttribute('data-lens');

    it('CONTROL: at the overview there is no centre chapter - data-lens empty, the draw carries null', async () => {
      const { container } = await mount();
      expect(zoomText(container)).toBe('Overview');
      expect(shownLens(container)).toBe('');
      expect(DRAWN[DRAWN.length - 1].centre).toBeNull();
    });

    it('at the ceiling the centre is the chapter under it (the one chapter here): published as "lo-hi", drawn at full emphasis, and no draw carries a dim', async () => {
      const { container } = await mount();
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('24882x');
      expect(shownLens(container)).toBe('0-' + (CANON - 1));
      expect(DRAWN[DRAWN.length - 1].centre).toEqual({ chapterIndex: 0, book: 0, chapter: 1, x0: 0, x1: CANON, t: 1 });
      // nothing dims with zoom: the lens's share is gone from every draw
      expect(DRAWN.every((d) => d.clear || (d.lens === undefined && d.lensDim === undefined))).toBe(true);
    });

    it('the emphasis eases in: the first frame past 6x is a step of it, not the whole (C20)', async () => {
      await mount();
      let first = null;
      for (let i = 0; i < 12 && !first; i++) {
        await pressFrame('+');
        const last = DRAWN[DRAWN.length - 1];
        if (last.centre) first = last;
      }
      expect(first, 'PRECONDITION: a press reached the centre chapter').toBeTruthy();
      expect(first.centre.t).toBeGreaterThanOrEqual(0);
      expect(first.centre.t).toBeLessThan(0.4);
    });

    it('My Web has no centre chapter: switching at the ceiling clears data-lens and the GL surface is the ground alone', async () => {
      const { container } = await mount();
      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(shownLens(container), 'precondition: a centre on the canon web').toBe('0-' + (CANON - 1));
      fireEvent.click(screen.getByRole('button', { name: /my web/i }));
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(shownLens(container)).toBe('');
      // the GL surface is the ground alone (#10): no thread pass, no centre
      expect(DRAWN[DRAWN.length - 1].clear).toBe(true);
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
      capAtTapRule();
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

  /* ── sweep 2026-10-14 (batch 3): what the Scripture / My Web switch, the Volumes rail and the
     controls inside .sw-root each own. My Web is built from LinkStore and the Volumes from
     COLLECTIONS / READING_CHAIN / colLetterArr, all free globals the setup file does not carry;
     the top-level afterEach unstubs them. */
  describe('sweep v5/v55/v72: the web switch lets go, the Volumes rail names its own place, the controls keep their keys', () => {
    /* one canon thread (index 0) and one chapter that is the whole canon */
    const threaded = () => Object.assign(graph(), {
      count: 1,
      from: new Uint16Array([100]), to: new Uint16Array([20100]), votes: new Int16Array([30]),
      buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 8, chunks: [[100, 20100]] }],
      chunkSize: 256,
    });
    const LETTERS = ['The First', 'The Second', 'The Third', 'The Fourth', 'The Fifth'];
    const stubMyWeb = (links = []) => {
      vi.stubGlobal('LinkStore', { all: () => links, subscribe: () => () => {}, getVersion: () => 1 });
      vi.stubGlobal('COLLECTIONS', [{ volKey: 'rebuke', label: 'Rebuke',
        letters: LETTERS.map((title, i) => ({ id: 'r' + i, title })) }]);
      vi.stubGlobal('READING_CHAIN', ['rebuke']);
      vi.stubGlobal('colLetterArr', (col) => col.letters);
    };
    const settle = async (ms = 40) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
    const seen = { swGuideSeen: true, swEmptyDismissed: true };

    /* v5: the mode buttons closed the sheet but kept focusRef, and a link's index from My Web
       went to the canon renderer as focusArc: canon thread 0 spotlit, the rest at focus-dim
       ink, nothing open for Escape or Back to close. */
    it('v5: a link chosen in My Web is let go by the switch to Scripture: no canon thread is spotlit', async () => {
      stubMyWeb([{ id: 'l1',
        source: { type: 'bible', bookId: 'genesis-plain', chapter: 1, verse: 5, label: 'Genesis 1:5' },
        target: { type: 'bible', bookId: 'genesis-plain', chapter: 1, verse: 900, label: 'Genesis 1:900' } }]);
      const { container } = await mount({ settings: seen }, threaded);
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(60);
      fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
      await settle(20);
      const row = container.querySelector('.sw-list .sw-choice-row');
      expect(row, 'PRECONDITION: My Web lists the reader\'s link').toBeTruthy();
      fireEvent.click(row);
      await settle();
      expect(container.querySelector('.sw-sheet'), 'PRECONDITION: the link\'s sheet opened').toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Scripture' }));
      await settle(60);
      expect(container.querySelector('.sw-sheet')).toBeNull();
      const last = DRAWN[DRAWN.length - 1];
      expect(last.focusArc, 'the canon frame after the switch spotlights nothing').toBe(-1);
      expect(last.focusRange).toBeNull();
    });

    /* w4 interaction hunt: switchMode closed the cards and cleared the trail but left a running fly
       alone. A go-to fly under way when the reader tapped My Web carried on in My Web, moving the
       Bible rail's camera (camRef) to the go-to's verse, and the density hint of the canon stayed
       printed under My Web's title. The switch stops the fly where it is and drops the hint. */
    it('w4: a fly under way when the reader switches webs stops where it is; the canon\'s hint goes', async () => {
      stubMyWeb();
      const { container } = await mount({ settings: seen }, threaded);
      // zoomed in off the middle, then Reset: an eased fly home
      const root = container.querySelector('.sw-root');
      for (let k = 0; k < 6; k++) fireEvent.keyDown(root, { key: '+' });
      for (let k = 0; k < 8; k++) fireEvent.keyDown(root, { key: 'ArrowRight' });
      await settle(40);
      const home = CANON / 2;
      const a = DRAWN[DRAWN.length - 1].camX;
      expect(Math.abs(a - home), 'PRECONDITION: off the middle before Reset').toBeGreaterThan(10);
      fireEvent.click(screen.getByRole('button', { name: 'Reset the view' }));
      // the first frame the fly has moved (polled in short steps, so a loaded machine's slow
      // frames cannot make the window miss it), and it is not home yet
      let b = a;
      for (let i = 0; i < 200 && Math.abs(b - a) <= 1; i++) { await settle(5); b = DRAWN[DRAWN.length - 1].camX; }
      expect(Math.abs(b - a), 'PRECONDITION: the fly is under way').toBeGreaterThan(1);
      expect(Math.abs(b - home), 'PRECONDITION: and not home yet').toBeGreaterThan(1);
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(1200);
      // the canon's camera is the Bible rail's (camRef): back on the canon, it reads where the fly was
      fireEvent.click(screen.getByRole('button', { name: 'Scripture' }));
      await settle(40);
      const x = DRAWN[DRAWN.length - 1].camX;
      expect(Math.abs(x - home), 'the fly did not carry on home while My Web was up').toBeGreaterThan(1);
      expect(Math.abs(x - b), 'it stopped about where the switch found it').toBeLessThan(Math.max(1, Math.abs(home - a) / 4));
    });

    /* w4 device check (finding 8, d19): My Web's Bible rail is the canon's camera (camRef), so it
       opened at the canon's 12x round 2 Samuel, the reader's links running flat off the frame
       until Reset Bible. Each web keeps its own camera: My Web's Bible rail opens at fit the first
       time, and the canon's zoom and place are back on the return. */
    it('w4: My Web opens its Bible rail at fit, and the canon\'s zoom is back on the return', async () => {
      stubMyWeb();
      const { container } = await mount({ settings: seen }, threaded);
      const root = container.querySelector('.sw-root');
      const ppv = () => Number(root.getAttribute('data-ppv-css'));
      const fit = ppv();
      for (let k = 0; k < 10; k++) fireEvent.keyDown(root, { key: '+' });
      for (let k = 0; k < 8; k++) fireEvent.keyDown(root, { key: 'ArrowRight' });
      await settle(40);
      const zoomed = ppv(), xz = DRAWN[DRAWN.length - 1].camX;
      expect(zoomed / fit, 'PRECONDITION: the canon zoomed in').toBeGreaterThan(3);
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(60);
      expect(ppv() / fit, 'My Web\'s Bible rail at fit, not the canon\'s zoom').toBeCloseTo(1, 2);
      fireEvent.click(screen.getByRole('button', { name: 'Scripture' }));
      await settle(60);
      expect(ppv() / zoomed, 'the canon\'s zoom is back').toBeCloseTo(1, 2);
      expect(DRAWN[DRAWN.length - 1].camX, 'and its place').toBeCloseTo(xz, 1);
    });

    it('w4: the density hint does not outlive the switch to My Web', async () => {
      stubMyWeb();
      const { container } = await mount({ settings: seen }, threaded);
      const select = container.querySelector('.sw-select');
      fireEvent.change(select, { target: { value: 'essential' } });
      await settle(20);
      expect(container.querySelector('.sw-hint'), 'PRECONDITION: the density switch printed its hint').toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(20);
      expect(container.querySelector('.sw-hint')).toBeNull();
    });

    /* item 29 (w3, the My Web stream): the list was the first 36 links in store order wherever
       the camera stood, so "Nearby" was not near and link 37 on could be reached only by finding
       it on the canvas. Now every link is listed, the one passing nearest the middle first. */
    it('item 29: My Web lists every link, nearest the middle of the view first', async () => {
      const at = (v) => ({ type: 'bible', bookId: 'genesis-plain', chapter: 1, verse: v, label: 'Genesis 1:' + v });
      stubMyWeb(Array.from({ length: 40 }, (_, i) => ({ id: 'n' + i, source: at(1 + i * 770), target: at(31 + i * 770) })));
      const { container } = await mount({ settings: seen });
      // the switch reads "My Web" (the panel stream's one vocabulary for the web's words)
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(60);
      fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
      await settle(20);
      const rows = [...container.querySelectorAll('.sw-list .sw-choice-row')];
      expect(rows.length, 'every link, not the first 36').toBe(40);
      // the overview's centre is verse 15,551: link 20 (15,401) is nearest, then 21, then 19
      expect(rows[0].textContent).toMatch(/Genesis 1:15401\b/);
      expect(rows[1].textContent).toMatch(/Genesis 1:16171\b/);
      expect(rows[2].textContent).toMatch(/Genesis 1:14631\b/);
    });

    /* v55: the keys drive the rail last touched, but the live region always read the camera's x
       as a Bible verse id. On the Volumes rail x is a rail position (0..5 here), so ArrowRight
       announced "Genesis 1:4" while the reader moved through Rebuke. */
    it('v55: an arrow key on the Volumes rail announces the Volumes node there, never a Bible verse', async () => {
      stubMyWeb();
      const { container } = await mount({ settings: seen });
      fireEvent.click(screen.getByRole('button', { name: 'My Web' }));
      await settle(60);
      const root = container.querySelector('.sw-root');
      const live = () => container.querySelector('.sw-live').textContent;
      // CONTROL: the Bible rail (the default) still announces its verse
      fireEvent.keyDown(root, { key: 'ArrowRight' });
      await settle(20);
      expect(live(), 'CONTROL: the Bible rail names a verse').toMatch(/^Genesis 1:\d+$/);
      // touch the top half: the Volumes rail is the one the keys drive now
      const ev = (type) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 31, pointerType: 'touch', clientX: 400, clientY: 10 });
      await act(async () => { root.dispatchEvent(ev('pointerdown')); root.dispatchEvent(ev('pointerup')); await new Promise((r) => setTimeout(r, 40)); });
      fireEvent.keyDown(root, { key: 'ArrowRight' });
      await settle(20);
      expect(live(), 'the top rail is not a Bible verse').not.toMatch(/Genesis/);
      // the camera sits at the fitted centre of the five-letter rail, position 2.5: the middle of
      // the third letter, whose foot the rail draws there (votRailX(i + 0.5)). w4 names the letter
      // under the middle; through w3 Math.round named the fourth, half a letter off its foot.
      expect(live()).toBe('The Third, Rebuke');
    });

    /* v72: onKeyDown sits on .sw-root and read every keydown that bubbled up to it. A keyboard
       reader on the density <select> pressed ArrowRight / ArrowDown: the web panned and
       preventDefault cancelled the select's own option change. The rows of the Nearby list
       panned the web behind them the same way. */
    it('v72: keys pressed on the density select or a list row stay theirs; Escape still reaches the web', async () => {
      const onBack = vi.fn();
      const { container } = await mount({ onBack }, threaded);
      const root = container.querySelector('.sw-root');
      for (let i = 0; i < 6; i++) { fireEvent.keyDown(root, { key: '+' }); await settle(20); }
      const lastDraw = () => DRAWN[DRAWN.length - 1];
      // CONTROL: on the web itself the arrow is the web's: cancelled, and the camera pans
      let before = lastDraw();
      expect(fireEvent.keyDown(root, { key: 'ArrowRight' }), 'CONTROL: the web takes its own key').toBe(false);
      await settle(20);
      expect(lastDraw().camX, 'CONTROL: the web panned').not.toBeCloseTo(before.camX, 3);

      const select = screen.getByLabelText('Connection density');
      select.focus();
      before = lastDraw();
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', '+', '-', '0']) {
        expect(fireEvent.keyDown(select, { key }), key + ' on the select is not cancelled').toBe(true);
        await settle(20);
      }
      expect(lastDraw().camX, 'the web did not pan under the select').toBeCloseTo(before.camX, 6);
      expect(lastDraw().ppv, 'nor zoom').toBeCloseTo(before.ppv, 6);
      expect(lastDraw().camY, 'nor climb').toBe(before.camY);

      fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
      await settle(20);
      const row = container.querySelector('.sw-list .sw-choice-row');
      expect(row, 'PRECONDITION: the list has a row').toBeTruthy();
      expect(fireEvent.keyDown(row, { key: 'ArrowLeft' }), 'ArrowLeft on a row is not cancelled').toBe(true);
      await settle(20);
      expect(lastDraw().camX, 'the web did not pan behind the list').toBeCloseTo(before.camX, 6);

      // Escape is the web's from anywhere: from the row it closes the list, from the select it leaves
      fireEvent.keyDown(row, { key: 'Escape' });
      await settle(20);
      expect(container.querySelector('.sw-list')).toBeNull();
      expect(onBack).not.toHaveBeenCalled();
      fireEvent.keyDown(select, { key: 'Escape' });
      expect(onBack).toHaveBeenCalledTimes(1);
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
    // four short lines, five with the go-to (w3 panel step 2, item 22; guide-words.test.jsx pins them)
    expect(card.querySelectorAll('li').length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(updateSetting).toHaveBeenCalledWith('swGuideSeen', true);
  });

  /* w4 focus hunt: on a first visit the card opens itself with focus on <body>, and closing it
     handed the keyboard back there, where the web's keys do not reach */
  it('opened on its own on a first visit: closing it puts the keyboard on the web', async () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    const { container } = await mountGuide({ settings: {} });
    expect(container.querySelector('.sw-guide'), 'PRECONDITION: the card is up').toBeTruthy();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.sw-root'));
  });

  /* w4 quality hunt: Hide controls came before ? in the DOM, though ? is drawn left of it (or
     above it), so Tab crossed the pair right to left */
  it('the ? comes before Hide controls in the DOM, as it is drawn', async () => {
    const { container } = await mountGuide();
    const pair = Array.from(container.querySelectorAll('.sw-guide-btn, .sw-hide-all'));
    expect(pair.map((b) => (b.classList.contains('sw-guide-btn') ? '?' : 'hide'))).toEqual(['?', 'hide']);
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

  /* 2026-09-27 keyboard walk: the card was the one Scripture Web panel without
     useFocusTrap (the Nearby list, the chooser and the detail sheet got theirs
     in v03-03). It opened with focus left on the page, Tab walked out of it, and
     closing dropped focus on <body>. */
  it('takes focus when the ? button opens it, keeps Tab inside, and hands focus back to ? on close', async () => {
    const { container } = await mountGuide();
    const help = screen.getByRole('button', { name: /how to read this web/i });
    help.focus();
    fireEvent.click(help);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const card = container.querySelector('.sw-guide');
    const gotIt = screen.getByRole('button', { name: /got it/i });
    expect(document.activeElement, 'focus moves into the card').toBe(gotIt);
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(card.contains(document.activeElement), 'Tab stays inside').toBe(true);
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(card.contains(document.activeElement), 'Shift+Tab stays inside').toBe(true);
    fireEvent.click(gotIt);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(document.activeElement, 'focus returns to the ? button').toBe(help);
  });

  it('Escape from inside the card closes it and hands focus back to ?', async () => {
    const onBack = vi.fn();
    const { container } = await mountGuide({ onBack });
    const help = screen.getByRole('button', { name: /how to read this web/i });
    help.focus();
    fireEvent.click(help);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector('.sw-guide')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(help);
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

  // Sweep mw12: My Web's list is the reader's links (every one, nearest the middle first since w3
  // item 29); its header said 'Your nearby links' and its empty line 'No nearby connections at this location.'
  it('on My Web the list says what it is: your links, with no "nearby" and no "at this location"', async () => {
    const { container } = await mountList();
    fireEvent.click(screen.getByRole('button', { name: /my web/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    fireEvent.click(screen.getByRole('button', { name: 'Nearby' }));
    const list = container.querySelector('.sw-list');
    expect(list.querySelector('.sw-sheet-eyebrow').textContent).toBe('Your links');
    expect(list.textContent).not.toMatch(/nearby links|at this location/i);
    expect(list.querySelector('.sw-list-empty').textContent).toBe('You have no links on the web yet.');
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

  // "Under the lens" retired (digest item 22: "Nearby" means one thing); the header still names the
  // chapter the list reads past the overview, which is what this case is about.
  it('past the overview the header names the chapter it reads, and choosing the chapter row opens its sheet', async () => {
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
    expect(list.querySelector('.sw-sheet-eyebrow').textContent).toMatch(/^Nearby · Genesis 1/);
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

  /* v03-03: the panels focused their close button on mount and nothing more, and closing dropped
     focus on body. w3 (digest #46, spec 4.6): the docked panel is a non-modal dialog beside the web,
     so it keeps no trap; it still takes focus on open and hands it back on close. */
  it('(v03-03) an open panel takes focus, does not trap Tab, and closing it hands focus back to the web', async () => {
    const { container } = await mountList();
    const root = container.querySelector('.sw-root');
    root.focus();
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const list = container.querySelector('.sw-list');
    expect(list.getAttribute('role')).toBe('dialog');
    expect(list.getAttribute('aria-modal')).toBe('false');
    const buttons = [...list.querySelectorAll('button')];
    // sw1: the panel itself takes focus (no focus ring on its x after a tap)
    expect(document.activeElement).toBe(list);
    buttons[buttons.length - 1].focus();
    // no trap: Tab from the last row is the browser's own (not cancelled, not wrapped)
    expect(fireEvent.keyDown(document.activeElement, { key: 'Tab' }), 'Tab is not cancelled').toBe(true);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
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

describe('landscape on a phone — a portrait phone is rotated, and nothing asks the reader to turn', () => {
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

  /* w4 device check (S22, Chrome): lock() ran in the same commit as immersive mode's
     requestFullscreen, before the page was fullscreen, so Chrome refused it ("The page needs
     to be fullscreen") and it was never asked again. The phone stayed portrait under the CSS
     rotation, with the keyboard and the fullscreen toast sideways. The lock is asked again
     once fullscreen is in place; the rotation is only the fallback for a refusal there. */
  it('asks for the lock again once the page is fullscreen', async () => {
    setViewport(400, 800);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
    let full = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => full, configurable: true });
    const lock = vi.fn(() => (full ? Promise.resolve() : Promise.reject(new Error('SecurityError: needs fullscreen'))));
    window.screen.orientation = { lock, unlock: () => {} };
    try {
      render(<ScriptureWebScreen {...baseProps()} />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(lock).toHaveBeenCalledTimes(1);
      full = document.documentElement;
      await act(async () => { document.dispatchEvent(new Event('fullscreenchange')); await Promise.resolve(); });
      expect(lock, 'asked again inside fullscreen').toHaveBeenCalledTimes(2);
      expect(lock).toHaveBeenLastCalledWith('landscape');
      // once is enough: a later fullscreenchange (leaving) does not ask again
      await act(async () => { document.dispatchEvent(new Event('fullscreenchange')); await Promise.resolve(); });
      expect(lock).toHaveBeenCalledTimes(2);
    } finally {
      delete document.fullscreenElement;
    }
  });

  /* Was 'rotates a portrait viewport on a FINE pointer too — the touch-only gate is gone'.
     Corbin's "landscape by default, no rotate option" (09-10) was said of the phone; turning a
     desktop or tablet window on its side went further than his words, and Q11 (decided, the w1
     digest's G3) puts the gate back: the forced rotation is for coarse-pointer phones only. The
     case keeps its intent (which viewports rotate is pinned) with the decided answer. */
  it('does NOT rotate a portrait window on a FINE pointer (Q11: phones only)', async () => {
    setViewport(400, 800);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
    window.screen.orientation = { lock: vi.fn(() => Promise.reject(new Error('not supported'))) };

    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('.sw-root')).toBeTruthy();
    expect(container.querySelector('.sw-root.sw-rotated')).toBeNull();
    expect(window.screen.orientation.lock, 'no lock asked for either').not.toHaveBeenCalled();
  });

  it('does NOT rotate a portrait tablet: a coarse pointer, but a short side past a phone’s', async () => {
    setViewport(820, 1180);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
    window.screen.orientation = { lock: () => Promise.reject(new Error('not supported')) };
    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector('.sw-root.sw-rotated')).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: 'My Web' }));
    return r;
  };

  // w4 quality hunt: the screen reader's key help in My Web was the canon's (Enter, [ ], Go to)
  it("the key help in My Web is My Web's: the rails' keys, not the canon's", async () => {
    const { container } = await openMyWeb();
    const help = container.querySelector('#sw-a11y-help').textContent;
    expect(help).toMatch(/rail you last touched/);
    expect(help).not.toMatch(/Enter or Space|Go to/);
  });

  // w4 quality hunt: My Web's ? opened the canon's card (votes, gold ticks); it opens My Web's own
  it('the ? card in My Web speaks of My Web: its rails and their Reset buttons, no votes', async () => {
    const { container } = await openMyWeb();
    fireEvent.click(screen.getByRole('button', { name: /how to read this web/i }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const text = container.querySelector('.sw-guide').textContent;
    expect(text).toMatch(/Reset Volumes/);
    expect(text).not.toMatch(/votes/);
  });

  // Sweep low (mw10, WCAG 2.5.3): the toggle was named "Show the curated corpus connections", leaving out
  // the words it shows. Its words are now Timothy's notes' one name (digest item 22, w3 panel step 2);
  // the law (the name starts with the words on the button) is the same.
  it('the Timothy’s notes toggle is named starting with the words it shows', async () => {
    await openMyWeb();
    const btn = await screen.findByRole('button', { name: /^Timothy’s notes/ });
    expect(btn.textContent.startsWith('Timothy’s notes')).toBe(true);
  });

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

  it('R4 in My Web the legend names the two families, Timothy’s notes then your links, one line each; never the canon axis, the distance ramp or chapter length', async () => {
    // w3 rewrote R4 to its intent (digest §5, r2-05): the legend still names
    // the two families and never the canon's colour law, but the picture's
    // order and words are "Timothy's notes · your links", one line of each
    // family's ink. The reader's links are one gold now (their shape is the
    // pin on the canvas, not a legend entry) and Timothy's sources one
    // teal-silver family, so the 1b pins and per-source bars are retired; My
    // Web draws no chapter bars, so the histogram key goes too.
    await openMyWeb();
    const legend = document.querySelector('.sw-legend');
    expect(legend).toBeTruthy();
    const keys = [...legend.querySelectorAll('.sw-key')].map((k) => k.textContent);
    expect(keys).toEqual(['Timothy’s notes', 'your links']);
    // w4 (r2-05; the hub: the CC-BY credit stays on screen, a licence obligation): the credit
    // is My Web's legend tail too, read, never a line of its own. Through w3 My Web had none.
    const credit = legend.querySelector('.sw-credit');
    expect(credit, 'the credit, in the legend').toBeTruthy();
    expect(credit.textContent).toBe('Cross-reference data © OpenBible.info (CC-BY)');
    expect(credit.parentElement.lastElementChild, 'the credit is the legend\'s last item').toBe(credit);
    expect(credit.closest('[aria-hidden="true"]'), 'the credit is read, not hidden').toBeNull();
    expect(legend.querySelectorAll('.sw-key-line').length).toBe(2);
    expect(legend.querySelector('.sw-key-pin')).toBeNull();
    expect(legend.querySelector('.sw-key-gradient')).toBeNull();
    expect(legend.querySelector('.sw-key-hist')).toBeNull();
    expect(legend.textContent).not.toMatch(/Genesis|Revelation|across the canon|nearby|chapter length/);
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

  it('returns focus to the My Web segment button, not to the body', async () => {
    // The notice is the only thing that was focused; without this the next
    // Tab starts from the top of the document and a keyboard reader is
    // dropped out of the control they were using.
    await openMyWeb();
    const close = screen.getByRole('button', { name: 'Dismiss' });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'My Web' }));
  });
});

/* w3, the docked panel in the web (spec section 3): the root's own size decides where the panel
   docks, what it covers (--sw-panel-w / --sw-sheet-h beside the inset) and whether the controls
   collapse to the more button. jsdom lays nothing out, so the ROOT is sized here (its clientWidth
   and clientHeight), as the canvas is in the blocks above. */
describe('the docked panel in the web (w3, spec section 3)', () => {
  const two = () => ({
    total: 31102, count: 2, buckets: [{ off: 0, len: 2, off20: 2, off10: 2, segments: 8, chunks: [[100, 20100]] }],
    books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
    chapters: [[0, 1, 0, 31102]], chapterOfVerse: new Uint16Array(31102),
    from: new Uint16Array([100, 200]), to: new Uint16Array([20100, 300]), votes: new Int16Array([7, 30]),
    votEdges: [], prophecy: [], votLinks: [], chunkSize: 256,
  });
  let prevDecode = null;
  const mountAt = async (w, h) => {
    for (const [prop, px] of [['clientWidth', w], ['clientHeight', h]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return px; } });
      Object.defineProperty(HTMLDivElement.prototype, prop, {
        configurable: true, get() { return this.classList.contains('sw-root') ? px : 0; },
      });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 2 };
    if (!prevDecode) prevDecode = vi.mocked(decodeGraph).getMockImplementation();
    vi.mocked(decodeGraph).mockImplementation(() => two());
    const view = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    return { ...view, root: view.container.querySelector('.sw-root') };
  };
  afterEach(() => {
    for (const prop of ['clientWidth', 'clientHeight']) {
      delete HTMLCanvasElement.prototype[prop];
      delete HTMLDivElement.prototype[prop];
    }
    if (prevDecode) vi.mocked(decodeGraph).mockImplementation(prevDecode);
  });
  const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  it('PC 1600x900: the panel docks right at 640 px, and its 960 px canvas area collapses the controls', async () => {
    const { root } = await mountAt(1600, 900);
    expect(root.classList.contains('sw-collapse'), 'closed: the whole 1600 px is canvas').toBe(false);
    expect(screen.queryByRole('button', { name: 'More controls' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await wait(30);
    expect(root.getAttribute('data-panel')).toBe('dock');
    expect(root.classList.contains('sw-panel-open')).toBe(true);
    expect(root.style.getPropertyValue('--sw-panel-w')).toBe('640px');
    expect(root.classList.contains('sw-collapse'), '1600 - 640 = 960 < 1000').toBe(true);
    expect(root.classList.contains('sw-compact')).toBe(false);
    fireEvent.keyDown(root, { key: 'Escape' });
    await wait(30);
    expect(root.getAttribute('data-panel')).toBeNull();
    expect(root.classList.contains('sw-collapse')).toBe(false);
  });

  /* w4 (interaction hunt): at 768x1024 the collapsed strip sat over the title ("Web" under the
     go-to); there the strip drops under the header (use-panel-layout's stackedFor; app.css) */
  it('a tablet 768x1024: docked, the strip stacks under the header; at 1600 it does not', async () => {
    const { root } = await mountAt(768, 1024);
    expect(root.classList.contains('sw-stack'), 'closed').toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'More controls' }));
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await wait(30);
    expect(root.getAttribute('data-panel')).toBe('dock');
    expect(root.classList.contains('sw-stack'), '768 - 420 = 348 px of canvas').toBe(true);
    fireEvent.keyDown(root, { key: 'Escape' });
    await wait(30);
    expect(root.classList.contains('sw-stack')).toBe(false);
  });

  it('phone landscape 891x411: compact, docked right at 374 px, the controls behind the more button', async () => {
    const { root, container } = await mountAt(891, 411);
    expect(root.classList.contains('sw-compact')).toBe(true);
    expect(root.classList.contains('sw-collapse')).toBe(true);
    const more = screen.getByRole('button', { name: 'More controls' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-controls')).toBe('sw-menu');
    // the menu holds every control (hidden by CSS until it opens)
    const menu = container.querySelector('#sw-menu');
    expect(menu.textContent).toMatch(/Scripture/);
    expect(menu.textContent).toMatch(/Nearby/);
    expect(menu.textContent).toMatch(/Reset/);
    fireEvent.click(more);
    expect(root.classList.contains('sw-menu-open')).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    // Escape in the menu closes the menu only, and focus goes back to the more button
    const nearby = screen.getByRole('button', { name: /^nearby$/i });
    nearby.focus();
    fireEvent.keyDown(nearby, { key: 'Escape' });
    expect(root.classList.contains('sw-menu-open')).toBe(false);
    expect(document.activeElement).toBe(more);
    // a control in the menu acts and closes it
    fireEvent.click(more);
    fireEvent.click(nearby);
    await wait(30);
    expect(root.classList.contains('sw-menu-open')).toBe(false);
    expect(root.getAttribute('data-panel')).toBe('dock');
    expect(root.style.getPropertyValue('--sw-panel-w')).toBe('374px');
    expect(container.querySelector('.sw-list')).toBeTruthy();
  });

  it('a press outside the controls closes the menu', async () => {
    const { root } = await mountAt(891, 411);
    fireEvent.click(screen.getByRole('button', { name: 'More controls' }));
    expect(root.classList.contains('sw-menu-open')).toBe(true);
    fireEvent.pointerDown(document.body);
    await wait(0);
    expect(root.classList.contains('sw-menu-open')).toBe(false);
  });

  it('below 560 px the panel is a bottom sheet of the measured height', async () => {
    const { root } = await mountAt(500, 800);
    expect(root.classList.contains('sw-narrow')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^nearby$/i }));
    await wait(30);
    expect(root.getAttribute('data-panel')).toBe('sheet');
    expect(root.style.getPropertyValue('--sw-sheet-h')).toBe('480px');
  });

  it('the go-to slot stays first in the controls (CONTRACTS.md section 9), the menu after it', async () => {
    const { container } = await mountAt(891, 411);
    const controls = container.querySelector('.sw-controls');
    // the go-to's search button fills the slot (goto.jsx, the navigation stream), the menu follows
    // it, the more button ends the row (this test once pinned the empty slot: the menu leading)
    const [first, second] = controls.children;
    expect(first.classList.contains('sw-goto-btn'), 'the go-to button leads').toBe(true);
    expect(second.id).toBe('sw-menu');
    expect(controls.lastElementChild.getAttribute('aria-label')).toBe('More controls');
  });
});

/* w4 interaction hunt: a reader door ("Show in Scripture Web" on a verse, a footnote's) opened My
   Web when the reader had last left the web from My Web, because the mode was seeded from the
   resume point even with a `start` given. go() then dropped the canon's verse panel, lit set and
   edge chips onto My Web's dual rail. The props doc says a start wins over the resume point. */
describe('a door in opens the Scripture Web, whatever web the reader last left from', () => {
  const mountWith = async (props) => {
    for (const [prop, px] of [['clientWidth', 800], ['clientHeight', 600]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return px; } });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    const view = render(<ScriptureWebScreen {...baseProps()} {...props} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    return view;
  };
  afterEach(() => {
    delete HTMLCanvasElement.prototype.clientWidth;
    delete HTMLCanvasElement.prototype.clientHeight;
  });
  const myWebPlace = () => ({ mode: 'personal', cam: { x: 10, ppv: 1, total: 100, y: 0 }, focus: focusStateOf(), detail: null });
  const focusStateOf = () => ({ arc: -1, hover: -1, range: null, lit: null, litKey: '' });

  it('control: with no start, the resume point holds (back from the reader lands in My Web)', async () => {
    _setWebPlace(myWebPlace());
    await mountWith({});
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My Web');
  });

  it('a start wins over a My Web resume point: the door opens the canon', async () => {
    _setWebPlace(myWebPlace());
    await mountWith({ start: { verse: { bookId: 'john', chapter: 3, verse: 16 } } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Scripture Web');
    // and the resume point is spent, not kept for a later mount
    cleanup();
    await mountWith({});
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Scripture Web');
  });
});
