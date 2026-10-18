/* Refactor bug #2 (w2 refactor.md): the gesture listeners outlived the load-error panel.
   ─────────────────────────────────────────────────────────────────────
   When createRenderer throws after the graph has loaded, the renderer effect sets loadError,
   and in the same commit the gesture effect still attached: graph set, noWebGL false. The next
   render returns the load-error panel, whose root is the same `div` type, so React reused the
   node, and the effect's deps had no loadError: the pointer, wheel and pinch listeners stayed on
   the error panel. A drag there read camRef.current, still null because the build threw before
   the camera was made. The panel is a dead end with a message and Try again; nothing on it pans. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const FIXTURE = () => ({
  total: 67, count: 1, books: [{ id: 'john', title: 'John', abbr: 'John' }], chapters: [[0, 3, 0, 67]],
  chapterOfVerse: new Uint16Array(67), from: new Uint16Array([5]), to: new Uint16Array([40]), votes: new Int16Array([9]),
  buckets: [{ off: 0, len: 1, off20: 1, off10: 1, segments: 0, chunks: [] }],
  votEdges: [], prophecy: [], votLinks: [], densityTiers: [], attribution: '',
});

/** Every attach, with whether its detach has run. */
const ATTACHED = [];
vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), decodeGraph: vi.fn(() => FIXTURE()) };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = await importOriginal();
  return { .../** @type {any} */ (real), createRenderer: vi.fn(() => { throw new Error('the GPU said no'); }) };
});
vi.mock('../scripture-web/gestures.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    attachWebGestures: vi.fn((el, deps) => {
      const rec = { el, detached: false };
      ATTACHED.push(rec);
      const detach = real.attachWebGestures(el, deps);
      return () => { rec.detached = true; detach(); };
    }),
  };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';

afterEach(() => {
  ATTACHED.length = 0;
  delete window.SCRIPTURE_WEB_DATA;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientWidth;
  delete /** @type {any} */ (HTMLCanvasElement.prototype).clientHeight;
});

describe('Scripture Web: the load-error panel takes no gestures (refactor bug #2)', () => {
  it('detaches every gesture listener once the error panel is up, and a drag on it throws nothing', async () => {
    for (const [prop, value] of [['clientWidth', 800], ['clientHeight', 360]]) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    window.SCRIPTURE_WEB_DATA = /** @type {any} */ ({ ok: true, count: 1 });
    const errors = [];
    const onError = (e) => { errors.push(e.error || e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    const { container } = render(<ScriptureWebScreen navigateToLink={vi.fn()} onBack={() => {}}
      settings={{ swGuideSeen: true }} updateSetting={() => {}} />);
    for (let i = 0; i < 60 && !container.querySelector('.sw-fallback'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    const panel = container.querySelector('.sw-fallback');
    expect(panel, 'PRECONDITION: the load-error panel is up').not.toBeNull();
    expect(container.querySelector('.sw-root'), 'the web is gone').toBeNull();
    for (const rec of ATTACHED) expect(rec.detached, 'a gesture listener left on the error panel').toBe(true);

    const opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 };
    panel.dispatchEvent(new PointerEvent('pointerdown', opts));
    panel.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 200 }));
    panel.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 200 }));
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
  });
});
