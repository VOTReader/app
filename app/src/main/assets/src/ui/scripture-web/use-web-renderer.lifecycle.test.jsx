// @ts-nocheck — WebGL stand-ins per test (the screen's renderer lifecycle)
/* useWebRenderer's lifecycle (refactor.md bugs #1, #3, #10; digest F1).

   A GPU reset kills every GL object. The screen rebuilds the renderer on the
   restored context; when that rebuild throws or gets no context, the reader
   must land on the list (WebFallbackList), never on a dead canvas, and the
   unmount after it must not throw on a null renderer (#1). While the list
   shows, no renderer may outlive the canvas it drew on (#3). My Web's ground
   is one clear, not an instanced pass at alpha 0 (#10).

   jsdom has no WebGL2, so createRenderer is mocked: each build records the
   opts the screen handed it (the canvas's loss and restore callbacks, which
   web-renderer.test.js proves the real DOM listeners call) and returns what
   the case's `nextBuild` says. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react';

/** Every renderer built, in order, with the opts its build was given. */
const BUILDS = [];
/** What the next build returns (a renderer, null) or does (throws). */
let nextBuild = null;

const fakeRenderer = () => ({
  gl: {}, contextLost: false, stats: { instances: 0, draws: 0 },
  draw: vi.fn(() => ({ instances: 0, draws: 0 })),
  clear: vi.fn(),
  dispose: vi.fn(),
});

vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    decodeGraph: vi.fn(() => ({
      total: 31102, count: 0, buckets: [],
      books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
      chapters: [[0, 1, 0, 31102]],
      chapterOfVerse: new Uint16Array(31102),
      from: new Uint16Array(0), to: new Uint16Array(0), votes: new Uint8Array(0),
      votEdges: [], prophecy: [], votLinks: [],
    })),
  };
});
vi.mock('./web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createRenderer: vi.fn((canvas, graph, opts) => {
      const make = nextBuild || fakeRenderer;
      nextBuild = null;
      const r = make();
      BUILDS.push({ opts, r });
      return r;
    }),
  };
});

import { ScriptureWebScreen, _resetWebPlace } from '../screens/ScriptureWebScreen.jsx';
import { _resetFallbackPlace } from './WebFallbackList.jsx';

const SIZES = [['clientWidth', 800], ['clientHeight', 360]];
const props = () => ({
  navigateToLink: () => {}, onBack: () => {}, updateSetting: () => {},
  settings: { swGuideSeen: true, swEmptyDismissed: true },
});
const flush = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const list = (container) => container.querySelector('.sw-fallback-list');

async function mount() {
  for (const [prop, value] of SIZES) {
    Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
  }
  window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
  const view = render(<ScriptureWebScreen {...props()} />);
  for (let i = 0; i < 40 && BUILDS.length === 0; i++) await flush();
  if (BUILDS.length === 0) throw new Error('PRECONDITION: the screen never built a renderer');
  await flush(40);
  return view;
}

afterEach(() => {
  cleanup();
  _resetWebPlace();
  _resetFallbackPlace();
  BUILDS.length = 0;
  nextBuild = null;
  delete window.SCRIPTURE_WEB_DATA;
  for (const [prop] of SIZES) delete HTMLCanvasElement.prototype[prop];
  vi.useRealTimers();
});

describe('the renderer survives a lost and restored context (F1, bugs #1 and #3)', () => {
  it('CONTROL: a restore that rebuilds swaps renderers: the old one is disposed, the new one draws', async () => {
    const { container, unmount } = await mount();
    const first = BUILDS[0];
    expect(first.r.draw, 'PRECONDITION: the sized canvas reaches draw()').toHaveBeenCalled();
    act(() => { first.opts.onContextLost(); first.opts.onContextRestored(); });
    await flush(40);
    expect(BUILDS.length).toBe(2);
    expect(first.r.dispose).toHaveBeenCalledTimes(1);
    expect(BUILDS[1].r.draw).toHaveBeenCalled();
    expect(list(container)).toBeNull();
    unmount();
    expect(BUILDS[1].r.dispose).toHaveBeenCalledTimes(1);
  });

  it('a restore whose rebuild throws falls back to the list instead of throwing out of the event', async () => {
    const { container } = await mount();
    const first = BUILDS[0];
    act(() => { first.opts.onContextLost(); });
    nextBuild = () => { throw new Error('createRenderer: link failed'); };
    expect(() => act(() => { first.opts.onContextRestored(); })).not.toThrow();
    await flush();
    expect(list(container), 'the reader lands on the list, not a dead canvas').toBeTruthy();
    expect(first.r.dispose).toHaveBeenCalled();
  });

  it('a restore that gets no context falls back to the list, and the unmount after it does not throw', async () => {
    const { container, unmount } = await mount();
    const first = BUILDS[0];
    act(() => { first.opts.onContextLost(); });
    nextBuild = () => null;
    act(() => { first.opts.onContextRestored(); });
    await flush();
    expect(list(container)).toBeTruthy();
    expect(() => unmount()).not.toThrow();
  });

  it('a loss nothing restores: the list shows and the renderer is disposed with its canvas (#3)', async () => {
    const { container } = await mount();
    const first = BUILDS[0];
    vi.useFakeTimers();
    act(() => { first.opts.onContextLost(); });
    act(() => { vi.advanceTimersByTime(3000); });
    vi.useRealTimers();
    await flush();
    expect(list(container)).toBeTruthy();
    expect(first.r.dispose, 'no renderer outlives the canvas it drew on').toHaveBeenCalledTimes(1);
  });

  it('Try again on the list builds a fresh renderer on the fresh canvas', async () => {
    const { container } = await mount();
    const first = BUILDS[0];
    act(() => { first.opts.onContextLost(); });
    nextBuild = () => null;
    act(() => { first.opts.onContextRestored(); });
    await flush();
    expect(list(container), 'PRECONDITION: on the list').toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush(40);
    expect(list(container)).toBeNull();
    const last = BUILDS[BUILDS.length - 1];
    expect(last.r, 'a live renderer after Try again').toBeTruthy();
    expect(last.r.draw).toHaveBeenCalled();
  });
});

describe('My Web paints its ground with one clear (bug #10)', () => {
  it('switching to My Web clears the GL surface to the ground colour and draws no instanced pass', async () => {
    await mount();
    const r = BUILDS[0].r;
    fireEvent.click(screen.getByRole('button', { name: /my web/i }));
    await flush(60);
    expect(r.clear, 'the ground is a clear').toHaveBeenCalled();
    const drawsBefore = r.draw.mock.calls.length;
    await flush(60);
    fireEvent.keyDown(document.querySelector('.sw-root'), { key: 'ArrowRight' });
    await flush(40);
    expect(r.draw.mock.calls.length, 'no thread pass runs on My Web').toBe(drawsBefore);
    const bg = r.clear.mock.calls[r.clear.mock.calls.length - 1][0];
    expect(typeof bg).toBe('string');
  });
});
