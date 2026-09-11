/* RED for Corbin's trim: four things must NOT render, one thing MUST.
 * ═══════════════════════════════════════════════════════════════════════
 * Corbin, from a screenshot of live My Web at desktop width: "Make sure for
 * both my web and scripture, there's a button to toggle all the UI or hide all
 * the buttons and crap, we have A LOT, and being able to hide it into one
 * little button would be nice. Also get rid of 'view THE WHOLE CANON overview'
 * in the upper left. It doesn't add anything and it always shows no matter what
 * user is looking at. Get rid of the - and + zoom. Get rid of the 'go to' or
 * fix it, it currently doesn't function and I'm unsure what it's needed for
 * before zooming is intuitive. In scripture web, get rid of genre and
 * testament, leave distance as only option, it looks best anyway, retire the
 * button toggle for that entirely."
 *
 * "My Web" is a MODE of this one screen, so every absence below holds for both
 * webs by construction; the mode-switch case proves it rather than assumes it.
 *
 * HARNESS, borrowed from ScriptureWebScreen.test.jsx and load-bearing: the
 * canvas prototype is SIZED, because the screen reads `glc.clientWidth` (0 in
 * jsdom) and draw() returns before touching the renderer on a 0 px frame —
 * with an unsized canvas the "hard-wires distance" case below would pass
 * vacuously on a renderer that was never asked to draw. The mocked renderer
 * records every draw's opts, because colorMode travels per draw() call, not
 * through createRenderer(). The precondition case comes first and doubles as
 * the anti-vacuity guard for everything after it.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

const DRAWN = [];
vi.mock('../../utils/scripture-web/decode.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, decodeGraph: vi.fn(() => graph()) };
});
vi.mock('../scripture-web/web-renderer.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    createRenderer: vi.fn(() => ({
      gl: {}, contextLost: false, stats: { instances: 0, draws: 0 },
      draw: (opts) => { DRAWN.push({ colorMode: opts && opts.colorMode, density: opts && opts.density }); return { instances: 0, draws: 0 }; },
      dispose: vi.fn(),
    })),
  };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';

const CANON = 31102;
function graph() {
  return {
    total: CANON, count: 0, buckets: [],
    books: [{ id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' }],
    chapters: [[0, 1, 0, CANON]],
    chapterOfVerse: new Uint16Array(CANON),
    from: new Uint16Array(0), to: new Uint16Array(0), votes: new Uint8Array(0),
    votEdges: [], prophecy: [], votLinks: [],
  };
}

const SIZES = [['clientWidth', 800], ['clientHeight', 360]];
function setViewport(w, h) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

const baseProps = () => ({
  navigateToLink: vi.fn(),
  onBack: vi.fn(),
  settings: { webDensity: 'famous' },
  updateSetting: vi.fn(),
});

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

/** Mounts, then waits for the GL canvas and one more flush so viewRef.W is
 *  set and the first draw has been asked for. Throws rather than giving up:
 *  if the canvas never mounts, nothing below is about the Scripture Web. */
async function mount(props = {}) {
  const view = render(<ScriptureWebScreen {...baseProps()} {...props} />);
  for (let i = 0; i < 40 && !view.container.querySelector('.sw-canvas-gl'); i++) await tick();
  if (!view.container.querySelector('.sw-canvas-gl')) {
    throw new Error('.sw-canvas-gl never mounted — nothing below this line is about the Scripture Web');
  }
  /* The first draw arrives on a requestAnimationFrame; two setTimeout(0) ticks
     caught it in one case and missed it in the next (DRAWN read 0). Wait for
     the draw itself, bounded, and throw rather than hand back an undrawn frame. */
  for (let i = 0; i < 60 && DRAWN.length === 0; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  if (DRAWN.length === 0) throw new Error('the renderer was never asked to draw — canvas sizing has stopped reaching draw()');
  return view;
}

const HIDE_ALL = /hide.*(controls|chrome|ui)/i;

describe('the Scripture Web chrome, trimmed', () => {
  beforeEach(() => {
    setViewport(900, 600);
    for (const [prop, value] of SIZES) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    DRAWN.length = 0;
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
    try { sessionStorage.clear(); } catch (_e) { /* private mode */ }
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    for (const [prop] of SIZES) delete HTMLCanvasElement.prototype[prop];
    delete window.SCRIPTURE_WEB_DATA;
  });

  it('mounts with its topbar, density control and a drawn frame — the precondition every absence below depends on', async () => {
    const { container } = await mount();
    expect(container.querySelector('.sw-topbar')).toBeTruthy();
    expect(screen.getByLabelText('Connection density')).toBeTruthy();
    /* The renderer was asked to draw at least once. If this is 0 the canvas
       sizing above has stopped working and the colorMode case is vacuous. */
    expect(DRAWN.length).toBeGreaterThan(0);
  });

  it('renders NO context card — "view THE WHOLE CANON overview" is gone', async () => {
    const { container } = await mount();
    expect(container.querySelector('.sw-context')).toBeNull();
    expect(screen.queryByText('The whole canon')).toBeNull();
  });

  it('renders NO zoom − / + buttons — pinch, wheel and the +/- keys remain', async () => {
    await mount();
    expect(screen.queryByLabelText('Zoom out')).toBeNull();
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
  });

  it('renders NO "Go to" — deletion is the fix for a control that did not function', async () => {
    const { container } = await mount();
    expect(screen.queryByRole('button', { name: /^go to$/i })).toBeNull();
    expect(container.querySelector('.sw-goto')).toBeNull();
  });

  it('renders NO colour-mode select — distance is the only law, hard-wired', async () => {
    await mount();
    expect(screen.queryByLabelText('Colour mode')).toBeNull();
  });

  it('hard-wires distance into every draw rather than merely hiding the select', async () => {
    await mount();
    expect(DRAWN.length).toBeGreaterThan(0);
    /* A select that is hidden but still wired would let a stale stored value
       paint testament; every frame this screen asks for says distance. */
    expect(DRAWN.map((d) => d.colorMode)).toEqual(DRAWN.map(() => 'distance'));
  });

  it('has ONE hide-all control, and it hides the chrome and shows it again', async () => {
    const { container } = await mount();
    const btn = screen.getByLabelText(HIDE_ALL);
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);
    expect(container.querySelector('.sw-root.sw-chrome-hidden')).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    /* The button is the way back, so it must not be inside what it hides. */
    expect(btn.closest('.sw-topbar, .sw-controls, .sw-legend, .sw-credit')).toBeNull();

    fireEvent.click(btn);
    expect(container.querySelector('.sw-root.sw-chrome-hidden')).toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('remembers hidden for the SESSION, not the profile', async () => {
    const updateSetting = vi.fn();
    let r = await mount({ updateSetting });
    fireEvent.click(screen.getByLabelText(HIDE_ALL));
    expect(r.container.querySelector('.sw-root.sw-chrome-hidden')).toBeTruthy();
    cleanup();
    r = await mount({ updateSetting });
    expect(r.container.querySelector('.sw-root.sw-chrome-hidden')).toBeTruthy();
    /* The profile's only door is updateSetting; it must never have seen this. */
    const keys = updateSetting.mock.calls.map((c) => String(c[0]));
    expect(keys.filter((k) => /chrome|hide|hidden/i.test(k))).toEqual([]);
  });

  it('applies the same trim in My Web mode — one screen, two modes', async () => {
    const { container } = await mount();
    const seg = screen.queryByRole('button', { name: /my web/i });
    /* No silent pass: if the seg control is absent this case must say so and
       fail, not return green about a mode it never entered. */
    expect(seg).toBeTruthy();
    fireEvent.click(seg);
    await tick();
    expect(seg.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.sw-context')).toBeNull();
    expect(screen.queryByLabelText('Zoom out')).toBeNull();
    expect(screen.queryByRole('button', { name: /^go to$/i })).toBeNull();
    expect(screen.queryByLabelText('Colour mode')).toBeNull();
    expect(screen.getByLabelText(HIDE_ALL)).toBeTruthy();
  });
});
