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
import { describe, it, expect, afterEach, vi } from 'vitest';

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

  const mount = async () => {
    for (const [prop, value] of SIZES) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, {
        configurable: true, get() { return value; },
      });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    if (!realDecode) realDecode = vi.mocked(decodeGraph).getMockImplementation();
    vi.mocked(decodeGraph).mockImplementation(() => graph());
    const view = render(<ScriptureWebScreen {...baseProps()} />);
    // The canvas only mounts after the graph decodes, and viewRef.W is set by
    // the effect that follows it. Wait for the element, then flush once more.
    for (let i = 0; i < 8 && !view.container.querySelector('.sw-canvas-gl'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return view;
  };

  const zoomText = (c) => c.querySelector('.sw-context-zoom').textContent;
  const press = async (key) => {
    fireEvent.keyDown(document.querySelector('.sw-root'), { key });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
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

  it('marks the + button aria-disabled at the ceiling and not before', async () => {
    await mount();
    const plus = screen.getByLabelText('Zoom in');
    expect(plus.getAttribute('aria-disabled')).not.toBe('true');
    for (let i = 0; i < 40; i++) await press('+');
    expect(plus.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByLabelText('Zoom out').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('A1 — says so through .sw-live instead of doing nothing silently', async () => {
    const { container } = await mount();
    for (let i = 0; i < 40; i++) await press('+');
    expect(container.querySelector('.sw-live').textContent).toBe('Zoomed all the way in');
  });

  /* ── the Essential auto-switch, gate 2 of design-perf's spec ─────────────
     Nested here because this block owns the SIZED-CANVAS harness and two
     copies of a harness that must agree is worse than an imperfect title.
     Everything below needs the same 800x360 frame and the same graph.

     THE ARITHMETIC OF THIS FRAME, so no case depends on counting presses:
       fitPPV = 800 / 31102 = 0.025722 CSS px per verse at 1x
       the + key multiplies by 1.6, ceiling maxZoomFor(31102, 800) = 1710.6x
       ppvCss 22 (enter) = 855.3x   ->  reached at 1.6^15 = 1152x
       ppvCss 11 (leave) = 427.6x
       1.6^14 = 720x = ppvCss 18.5  ->  the last step BELOW the edge
     So 14 presses is deliberately short of the edge and 15 is past it, with
     both still below the ceiling. */
  describe('the Essential auto-switch, driven through the real controls', () => {
    const DENSITY_ON = 'Essential density, strongest connections only';
    const DENSITY_OFF = 'Famous density, all connections';
    const live = (c) => c.querySelector('.sw-live').textContent;
    const shown = () => screen.getByLabelText('Connection density').value;
    /* ONE MACROTASK DOES NOT FLUSH ONE rAF. The shared `press` above awaits
       setTimeout(0), and jsdom's requestAnimationFrame runs on a ~16 ms timer,
       so the zoom label lagged by whole presses — fifteen presses reported
       450x, which reads exactly like the camera going backwards. The existing
       cases here never saw it because they press 40 times and read a settled
       value at the ceiling. 20 ms is one frame, so each press draws exactly
       once and every number below is the camera's, not the label's lag. */
    const pressFrame = async (key) => {
      fireEvent.keyDown(document.querySelector('.sw-root'), { key });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    };

    it('CONTROL: at Overview the control reads Famous and nothing has been announced', async () => {
      const { container } = await mount();
      expect(zoomText(container)).toBe('Overview');
      expect(shown()).toBe('famous');
      expect(live(container)).not.toBe(DENSITY_ON);
    });

    it('CONTROL: fourteen presses is a real zoom that stays SHORT of the edge and does not switch', async () => {
      /* This is what makes the next case mean "crossing 22 switched it" rather
         than "zooming switched it". Without it, a law that switched at any zoom
         at all would satisfy the case below perfectly. */
      const { container } = await mount();
      for (let i = 0; i < 14; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('721x');   // ppvCss 18.55, short of 22
      expect(shown()).toBe('famous');
      expect(live(container)).not.toBe(DENSITY_ON);
    });

    it('crossing the entry edge switches to Essential AND says so', async () => {
      const { container } = await mount();
      for (let i = 0; i < 15; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1153x');  // ppvCss 29.66, past 22
      // Both, or a silent switch passes: the rail shows the live value…
      expect(shown()).toBe('essential');
      // …and the reader is told, which is the only way a screen reader knows.
      expect(live(container)).toBe(DENSITY_ON);
    });

    it('tapping Famous is the ONE TAP BACK: it pins, and the ceiling cannot move it', async () => {
      const { container } = await mount();
      for (let i = 0; i < 15; i++) await pressFrame('+');
      expect(shown()).toBe('essential');

      fireEvent.change(screen.getByLabelText('Connection density'), { target: { value: 'famous' } });
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(shown()).toBe('famous');

      for (let i = 0; i < 40; i++) await pressFrame('+');
      expect(zoomText(container)).toBe('1711x');       // the ceiling, well past 22
      expect(shown()).toBe('famous');                  // pinned, and it held
      /* "The live region did not fire AGAIN" is asserted as "no density
         announcement", not as "the text is unchanged" — the zoom key writes the
         centre verse's label on every press and the ceiling message at the top,
         and both of those are correct things for it to say. */
      expect(live(container)).not.toBe(DENSITY_ON);
      expect(live(container)).not.toBe(DENSITY_OFF);
    });

    it('never draws a frame at the density it has just decided is wrong', async () => {
      /* WHAT THE EARLY RETURN IS FOR, and it needs the renderer's own arguments
         to be visible at all: a bite that removed the return left every case
         green, because the mock threw its opts away. This asserts the property
         directly instead of counting frames — no draw may carry Famous at a ppv
         at or past the entry edge.

         SAY WHICH KIND OF GUARD THIS IS: the return protects WHAT THE READER SEES
         for one frame. It is not a correctness guard — the state is already right
         either way, and nothing downstream reads the suppressed frame. */
      const { container } = await mount();
      for (let i = 0; i < 14; i++) await pressFrame('+');
      DRAWN.length = 0;
      await pressFrame('+');                                   // the crossing frame
      // ONE 20 ms WAIT IS ONE rAF TICK, and the crossing frame consumes it
      // without drawing — that is the whole point of the return. The replacement
      // frame needs a second tick, and without it DRAWN comes back EMPTY, which
      // satisfies the filter below for the wrong reason. My own anti-vacuity
      // check is what caught that.
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(zoomText(container)).toBe('1153x');
      expect(shown()).toBe('essential');
      // The harness really recorded, and it recorded past the edge — the filter
      // below is trivially satisfied by an empty array or by frames that never
      // got there.
      expect(DRAWN.length).toBeGreaterThan(0);
      expect(DRAWN.some((d) => d.ppv / d.dpr >= 22 && d.density === 'essential')).toBe(true);
      const stale = DRAWN.filter((d) => d.ppv / d.dpr >= 22 && d.density === 'famous');
      expect(stale).toEqual([]);
    });

    it('does NOT switch while the reader is in My Web — and switching back proves it', async () => {
      /* The canonical-only guard, which no case reached: personal mode does not
         render the density control, so the state has to be read after switching
         BACK. Without the guard the reader returns from My Web to find Essential,
         announced at, having never been in the Scripture Web at that zoom. */
      const { container } = await mount();
      fireEvent.click(screen.getByText('My web'));
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      for (let i = 0; i < 15; i++) await pressFrame('+');       // past the edge, in My Web
      /* WHAT THE GUARD ACTUALLY DOES: nothing is announced, because the reader is
         not looking at the Scripture Web. Without it the switch fires here and
         .sw-live tells them about a density change in a view that has no density
         control — the '+' key writes the verse label first and the draw writes the
         announcement after, so the announcement is what would be standing. */
      expect(container.querySelector('.sw-live').textContent).not.toBe(DENSITY_ON);

      /* AND WHAT IT MUST NOT DO. Coming back to the Scripture Web at a zoom past
         the edge SWITCHES, and that is correct — the reader is now looking at the
         picture the rule is about. Asserted so this case cannot pass by the whole
         mechanism being broken, which is what "expect famous here" would have
         allowed. My first version asserted exactly that and was wrong. */
      fireEvent.click(screen.getByText('Scripture'));
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(shown()).toBe('essential');
      expect(container.querySelector('.sw-live').textContent).toBe(DENSITY_ON);
    });

    it('a reader whose stored preference is Essential is never announced at, in or out', async () => {
      /* base === 'essential' means there is nothing to switch away from, so the
         auto-switch must be completely silent for them rather than announcing a
         change it did not make. */
      for (const [prop, value] of [['clientWidth', FRAME_CSS], ['clientHeight', 360]]) {
        Object.defineProperty(HTMLCanvasElement.prototype, prop, {
          configurable: true, get() { return value; },
        });
      }
      window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
      vi.mocked(decodeGraph).mockImplementation(() => graph());
      const view = render(<ScriptureWebScreen {...baseProps()} settings={{ webDensity: 'essential' }} />);
      for (let i = 0; i < 8 && !view.container.querySelector('.sw-canvas-gl'); i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      }
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      expect(shown()).toBe('essential');
      for (let i = 0; i < 15; i++) await pressFrame('+');
      expect(shown()).toBe('essential');
      expect(live(view.container)).not.toBe(DENSITY_ON);
      expect(live(view.container)).not.toBe(DENSITY_OFF);
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

describe('scripture-web-6 — the landscape hint gates on portrait-ness, not on `rotated`', () => {
  it('shows "Best in landscape" after a rejected lock, even though rotated is cleared', async () => {
    // Portrait + a coarse (touch) pointer: rotated starts true, the mount
    // effect attempts screen.orientation.lock('landscape').
    setViewport(400, 800);
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })));
    // The Android WebView rejects lock() (locking requires fullscreen) —
    // the exact scenario the finding names.
    window.screen.orientation = { lock: () => Promise.reject(new Error('locking requires fullscreen')) };

    render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // showPortraitFallback ran: orientationHint is true, but it also cleared
    // rotated — the render gate `orientationHint && rotated` can never pass.
    expect(screen.getByText('Best in landscape')).toBeTruthy();
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
