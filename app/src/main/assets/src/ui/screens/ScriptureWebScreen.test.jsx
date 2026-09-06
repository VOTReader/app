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
      draw: () => ({ instances: 0, draws: 0 }),
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
    const { container } = await mount();
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
