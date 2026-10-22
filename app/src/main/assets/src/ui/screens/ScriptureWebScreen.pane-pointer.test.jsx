/* v2p8 - a web that does not start at the window's corner still picks under the finger.
   ───────────────────────────────────────────────────────────
   Main's root covers the window from 0,0, so loc() read an unrotated pointer as
   raw clientX/clientY. v2's laptop draws the web in the pane beside its rail
   (the root starts 88 px in), and every tap, drag and wheel landed 88 px to the
   right of the finger. loc() now measures from the root's own box: in main that
   box starts at 0,0 and nothing changes. The renderer is mocked (jsdom has no
   WebGL); the gestures are the real ones, so the loc they are handed is the one
   every pointer path reads. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const books = [{ id: 'numbers', title: 'Numbers', abbr: 'Num' }, { id: 'john', title: 'John', abbr: 'John' }, { id: 'romans', title: 'Romans', abbr: 'Rom' }];
const FIXTURE = () => {
  const chapterOfVerse = new Uint16Array(67);
  for (let v = 10; v <= 45; v++) chapterOfVerse[v] = 1;
  for (let v = 46; v <= 66; v++) chapterOfVerse[v] = 2;
  return {
    total: 67, count: 4, books, chapters: [[0, 21, 0, 10], [1, 3, 10, 36], [2, 5, 46, 21]], chapterOfVerse,
    from: new Uint16Array([25, 23, 25, 50]), to: new Uint16Array([53, 7, 60, 55]), votes: new Int16Array([90, 80, 20, 10]),
    buckets: [{ off: 0, len: 4, off20: 2, off10: 3, segments: 0, chunks: [] }],
    votEdges: [], prophecy: [], votLinks: [], densityTiers: [], attribution: '',
  };
};

/** A renderer that draws nothing and answers every call. */
const fakeRenderer = () => new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (t[k] || (t[k] = vi.fn()))) });

vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), decodeGraph: vi.fn(() => FIXTURE()) };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), createRenderer: vi.fn(() => fakeRenderer()) };
});
vi.mock('../scripture-web/gestures.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, attachWebGestures: vi.fn((el, deps) => real.attachWebGestures(el, deps)) };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';
import { attachWebGestures } from '../scripture-web/gestures.js';

afterEach(() => {
  delete window.SCRIPTURE_WEB_DATA;
  delete /** @type {any} */ (globalThis).HistoryStore;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientWidth;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientHeight;
});

async function mountWeb() {
  for (const [prop, value] of [['clientWidth', 900], ['clientHeight', 600]]) {
    Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
  }
  /** @type {any} */ (globalThis).HistoryStore = { list: () => [] };
  window.SCRIPTURE_WEB_DATA = /** @type {any} */ ({ ok: true, count: 4 });
  const view = render(<ScriptureWebScreen navigateToLink={vi.fn()} onBack={() => {}}
    settings={{ swGuideSeen: true }} updateSetting={() => {}} />);
  for (let i = 0; i < 60 && !/** @type {any} */ (attachWebGestures).mock.calls.length; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  const calls = /** @type {any} */ (attachWebGestures).mock.calls;
  expect(calls.length, 'the gestures attached').toBeGreaterThan(0);
  const [root, deps] = calls[calls.length - 1];
  return { view, root, loc: deps.loc };
}

describe('Scripture Web: the pointer map reads the root\'s own box (v2p8)', () => {
  it('a root 88 px in from the left (v2\'s laptop pane): a tap maps to where it fell on the web', async () => {
    const { root, loc } = await mountWeb();
    expect(window.innerHeight > window.innerWidth, 'jsdom is landscape: the web is not turned').toBe(false);
    root.getBoundingClientRect = () => /** @type {any} */ ({ left: 88, top: 0, right: 988, bottom: 600, width: 900, height: 600, x: 88, y: 0 });
    expect(loc({ clientX: 300, clientY: 200 })).toEqual({ x: 212, y: 200 });
  });

  it('an upright phone, the turned root held under the status bar (v2 keeps the live insets): a tap maps to where it fell', async () => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 780 });
    // main turns only a phone (Q11, use-forced-landscape.js wantsRotation): a coarse primary pointer
    const mm = window.matchMedia;
    window.matchMedia = /** @type {any} */ ((q) => ({ matches: /coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    try {
      const { root, loc } = await mountWeb();
      expect(root.classList.contains('sw-rotated'), 'the web is turned').toBe(true);
      // the turned box: 27 px under the top (--inset-top), 48 px over the bottom, the phone's whole width
      root.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 27, right: 360, bottom: 732, width: 360, height: 705, x: 0, y: 27 });
      expect(loc({ clientX: 100, clientY: 227 })).toEqual({ x: 200, y: 260 });
      // main's turned root from the window's corner: rotatePointer's own answer
      root.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 0, right: 360, bottom: 780, width: 360, height: 780, x: 0, y: 0 });
      expect(loc({ clientX: 100, clientY: 227 })).toEqual({ x: 227, y: 260 });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: was.w });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: was.h });
      window.matchMedia = mm;
    }
  });

  it('a root at the window\'s corner (main): the pointer map is unchanged', async () => {
    const { root, loc } = await mountWeb();
    root.getBoundingClientRect = () => /** @type {any} */ ({ left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600, x: 0, y: 0 });
    expect(loc({ clientX: 300, clientY: 200 })).toEqual({ x: 300, y: 200 });
  });
});
