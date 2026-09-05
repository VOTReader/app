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
  const openMyWeb = async (props) => {
    window.SCRIPTURE_WEB_DATA = { count: 1, ok: true };
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
