/* W52 — pan and zoom live again after "Try again".
   ─────────────────────────────────────────────────────────────────────
   A device that could not draw the web (no WebGL2, or a GPU reset Chrome never
   restores) shows the list fallback; its Try again brings the canvas back as a
   NEW .sw-root. The gesture effect depended on neither noWebGL nor glRetry, so
   it never re-ran: its listeners stayed on the first, detached root and the
   web came back dead to every drag, pinch and wheel. The renderer is mocked to
   fail the first time and draw the second; the graph is a small exact fixture
   (the A7 fallback suite's). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

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
let drawable = false;

vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), decodeGraph: vi.fn(() => FIXTURE()) };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), createRenderer: vi.fn(() => (drawable ? fakeRenderer() : null)) };
});
vi.mock('../scripture-web/gestures.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, attachWebGestures: vi.fn((el, deps) => real.attachWebGestures(el, deps)) };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';
import { attachWebGestures } from '../scripture-web/gestures.js';
import { _resetFallbackPlace } from '../scripture-web/WebFallbackList.jsx';

afterEach(() => {
  _resetFallbackPlace();
  drawable = false;
  delete window.SCRIPTURE_WEB_DATA;
  delete /** @type {any} */ (globalThis).HistoryStore;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientWidth;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientHeight;
});

describe('Scripture Web: Try again brings back a web that pans and zooms (W52)', () => {
  it('attaches the gestures to the canvas that Try again mounts', async () => {
    for (const [prop, value] of [['clientWidth', 400], ['clientHeight', 700]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    /** @type {any} */ (globalThis).HistoryStore = { list: () => [] };
    window.SCRIPTURE_WEB_DATA = /** @type {any} */ ({ ok: true, count: 4 });
    const { container } = render(<ScriptureWebScreen navigateToLink={vi.fn()} onBack={() => {}}
      settings={{ swGuideSeen: true }} updateSetting={() => {}} />);
    for (let i = 0; i < 60 && !container.querySelector('.sw-fallback-list'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    expect(container.querySelector('.sw-fallback-list')).not.toBeNull();

    drawable = true;   // the GPU is back
    const retry = [...container.querySelectorAll('.sw-fallback-list button')].find((b) => b.textContent === 'Try again');
    await act(async () => { fireEvent.click(retry); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });

    const root = container.querySelector('.sw-root');
    expect(root, 'the web is drawn again').not.toBeNull();
    const attachedTo = /** @type {any} */ (attachWebGestures).mock.calls.map((c) => c[0]);
    expect(attachedTo[attachedTo.length - 1]).toBe(root);
  });
});
