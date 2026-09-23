/* A device that cannot draw the Scripture Web still reads it (A7, 2026-09-22).
   Before: no WebGL2 (or a GPU reset Chrome never restores) put up a dead end,
   "The web can't be drawn right now" with Try again and Go back. Now the same
   graph is read as a list: the reader's last Bible chapter, one card per verse,
   each row a connected passage that opens in the reader.
   The renderer is mocked to return null, which is exactly what createRenderer
   does when getContext('webgl2') fails; the graph is a small exact fixture. */
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

vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), decodeGraph: vi.fn(() => FIXTURE()) };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), createRenderer: vi.fn(() => null) };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';

afterEach(() => {
  delete window.SCRIPTURE_WEB_DATA;
  delete /** @type {any} */ (globalThis).HistoryStore;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientWidth;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientHeight;
});

async function mountWithoutWebGL(navigateToLink = vi.fn(), history = []) {
  for (const [prop, value] of [['clientWidth', 400], ['clientHeight', 700]]) {
    Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
  }
  /** @type {any} */ (globalThis).HistoryStore = { list: () => history };
  window.SCRIPTURE_WEB_DATA = /** @type {any} */ ({ ok: true, count: 4 });
  const view = render(<ScriptureWebScreen navigateToLink={navigateToLink} onBack={() => {}}
    settings={{ swGuideSeen: true }} updateSetting={() => {}} />);
  for (let i = 0; i < 60 && !view.container.querySelector('.sw-fallback-list'); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  return view;
}

describe('Scripture Web without WebGL2: the web read as a list (A7)', () => {
  it('lists what connects to John 3, one card per verse, tier on every row, instead of a dead end', async () => {
    const { container } = await mountWithoutWebGL();
    const list = container.querySelector('.sw-fallback-list');
    expect(list, 'the fallback is still the old dead end').not.toBeNull();
    expect(list.textContent).toContain('Connections from John 3');
    expect([...container.querySelectorAll('.swf-card-head')].map((h) => h.textContent))
      .toEqual(['Verse 14 · 1 connection', 'Verse 16 · 2 connections']);
    expect([...container.querySelectorAll('.swf-row')].map((r) => r.querySelector('.swf-ref').textContent + '/' + r.querySelector('.swf-tier').textContent))
      .toEqual(['Numbers 21:8/Essential', 'Romans 5:8/Essential', 'Romans 5:15/Famous']);
    expect(container.querySelector('.swf-count').textContent).toBe('3 connections');
  });

  it('a row opens that verse in the reader', async () => {
    const nav = vi.fn();
    const { container } = await mountWithoutWebGL(nav);
    const row = [...container.querySelectorAll('.swf-row')].find((r) => r.textContent.includes('Romans 5:8'));
    act(() => { fireEvent.click(row); });
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav.mock.calls[0][0]).toEqual({ type: 'bible', bookId: 'romans', chapter: 5, verse: 8 });
  });

  it('opens on the reader’s last Bible chapter and steps through chapters', async () => {
    const { container } = await mountWithoutWebGL(vi.fn(), [{ type: 'chapter', bookId: 'romans', chapterNum: 5 }]);
    expect(container.querySelector('.swf-step-label').textContent).toBe('Romans 5');
    act(() => { fireEvent.click(container.querySelector('[aria-label="Previous chapter"]')); });
    expect(container.querySelector('.swf-step-label').textContent).toBe('John 3');
  });

  it('keeps Try again, and the way back is at the top, before any connection', async () => {
    const onBack = vi.fn();
    for (const [prop, value] of [['clientWidth', 400], ['clientHeight', 700]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    /** @type {any} */ (globalThis).HistoryStore = { list: () => [] };
    window.SCRIPTURE_WEB_DATA = /** @type {any} */ ({ ok: true, count: 4 });
    const { container } = render(<ScriptureWebScreen navigateToLink={vi.fn()} onBack={onBack}
      settings={{ swGuideSeen: true }} updateSetting={() => {}} />);
    for (let i = 0; i < 60 && !container.querySelector('.sw-fallback-list'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    const buttons = [...container.querySelectorAll('.sw-fallback-list button')];
    expect(buttons.some((b) => b.textContent === 'Try again')).toBe(true);
    const back = container.querySelector('.sw-fallback-list [aria-label="Go back"]');
    expect(buttons.indexOf(back)).toBe(0);
    act(() => { fireEvent.click(back); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
