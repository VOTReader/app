// @ts-nocheck — WebGL stand-ins (jsdom has no WebGL2)
/* D1 through the screen: the hook hands the alpha law the camera's CSS px a verse, so the ceiling's
   ease (geometry.ceilingEase) reaches every ceiling. Without it the crowding divisor takes the most
   crowded chapter measured, Isaiah 53, to 0.63 at the ceiling, under D1's 0.83, and nothing on screen
   says why. The renderer is mocked (as in use-web-renderer.lifecycle.test.jsx); the frame's anchored
   count is set to Isaiah 53's at its ceiling (595 threads over 1600 CSS px), and the camera is
   zoomed to the ceiling with the + key. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';

const BUILDS = [];
/** Isaiah 53's anchored threads per CSS px at its ceiling (depth.test.js D1). */
const ISAIAH53_PER = 595 / 1600;
const W_CSS = 800;

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
vi.mock('../../utils/scripture-web/geometry.js', async (importOriginal) => {
  const real = await importOriginal();
  // D1 is a law at the tap rule (44 CSS px a verse): the camera's ceiling is held there, as it was
  // before the verse zoom moved it to one verse (deepZoomFor, Corbin 2026-10-21)
  return { ...real, ribbonStyle: vi.fn(real.ribbonStyle), deepZoomFor: vi.fn(real.maxZoomFor) };
});
vi.mock('../../utils/scripture-web/frame-set.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    frameSet: vi.fn((...a) => {
      const set = real.frameSet(...a);
      return { ...set, anchored: Math.round(ISAIAH53_PER * W_CSS) };
    }),
  };
});
vi.mock('./web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createRenderer: vi.fn((canvas, graph, opts) => {
      const r = {
        gl: {}, contextLost: false, stats: { instances: 0, draws: 0 },
        draw: vi.fn(() => ({ instances: 0, draws: 0 })),
        clear: vi.fn(), dispose: vi.fn(),
      };
      BUILDS.push({ opts, r });
      return r;
    }),
  };
});

import { ScriptureWebScreen, _resetWebPlace } from '../screens/ScriptureWebScreen.jsx';
import { _resetFallbackPlace } from './WebFallbackList.jsx';
import { ribbonStyle, PPV_MAX_CSS, ALPHA_DEEP } from '../../utils/scripture-web/geometry.js';

const SIZES = [['clientWidth', W_CSS], ['clientHeight', 360]];
const flush = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };

afterEach(() => {
  cleanup();
  _resetWebPlace();
  _resetFallbackPlace();
  BUILDS.length = 0;
  delete window.SCRIPTURE_WEB_DATA;
  for (const [prop] of SIZES) delete HTMLCanvasElement.prototype[prop];
});

describe("D1 through the screen: the alpha law reads the camera's CSS px a verse", () => {
  it("hands ribbonStyle the camera's ppv over the DPR, and at Isaiah 53's ceiling uploads ALPHA_DEEP (0.90)", async () => {
    for (const [prop, value] of SIZES) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    const { container } = render(<ScriptureWebScreen navigateToLink={() => {}} onBack={() => {}}
      updateSetting={() => {}} settings={{ swGuideSeen: true, swEmptyDismissed: true }} />);
    for (let i = 0; i < 40 && BUILDS.length === 0; i++) await flush();
    expect(BUILDS.length, 'PRECONDITION: the screen built a renderer').toBeGreaterThan(0);
    await flush(40);
    const root = container.querySelector('.sw-root');
    const { r } = BUILDS[BUILDS.length - 1];
    for (let i = 0; i < 30; i++) {
      fireEvent.keyDown(root, { key: '+' });
      await flush(20);
    }
    const args = r.draw.mock.lastCall[0];
    const ppvCss = args.ppv / args.dpr;
    expect(ppvCss, 'PRECONDITION: the camera is at the ceiling').toBeCloseTo(PPV_MAX_CSS, 6);
    const call = vi.mocked(ribbonStyle).mock.lastCall;
    expect(call.length, 'ppvCss is handed over').toBe(4);
    expect(call[3]).toBeCloseTo(ppvCss, 9);
    expect(call[2], 'the crowd is Isaiah 53\'s').toBeCloseTo(Math.round(ISAIAH53_PER * W_CSS) / W_CSS, 9);
    expect(args.alpha).toBeCloseTo(ALPHA_DEEP, 6);
    expect(args.alpha).toBeGreaterThanOrEqual(0.83);
    // CONTROL: the same crowd with no ease (no CSS px a verse) falls under D1, as it did before
    expect(ribbonStyle(call[0], call[1], call[2], 0).alpha).toBeLessThan(0.83);
  });
});
