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
        DRAWN.push({ ppv: opts && opts.ppv, dpr: (opts && opts.dpr) || 1, density: opts && opts.density });
        return { instances: 0, draws: 0 };
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

  it('R4 in My Web the legend names the link kinds and the context, never the distance ramp', async () => {
    await openMyWeb();
    const legend = document.querySelector('.sw-legend');
    expect(legend).toBeTruthy();
    expect(legend.textContent).toMatch(/Within scripture/);
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
