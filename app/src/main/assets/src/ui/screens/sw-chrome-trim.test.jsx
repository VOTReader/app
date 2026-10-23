// @ts-nocheck — reads app.css through node:fs (the typecheck has no node types), as sw-chrome-header.test.jsx does
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
 * records every draw's opts, because a colour choice would travel per draw()
 * call, not through createRenderer(). The precondition case comes first and
 * doubles as the anti-vacuity guard for everything after it.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRAWN = [];
/* search-data.js is a classic script that sets window.VotSearchData when it first runs, and a second
   import() in this file is the cached module: it runs nothing. Each test puts the old value back, so keep
   the table from the one run and hand it to every test that asks (shuffled seed 99 ran Back first). */
let SEARCH_DATA = null;
async function useSearchData() {
  if (!SEARCH_DATA) {
    const prev = window.VotSearchData;
    // @ts-ignore -- a classic script: it sets window.VotSearchData
    await import('../../../search-data.js');
    SEARCH_DATA = window.VotSearchData;
    window.VotSearchData = prev;
  }
  window.VotSearchData = SEARCH_DATA;
}

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
      draw: (opts) => { DRAWN.push({ hasColorMode: !!opts && 'colorMode' in opts, density: opts && opts.density }); return { instances: 0, draws: 0 }; },
      clear: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';
import { SHADER_SOURCE } from '../scripture-web/web-renderer.js';
import { decodeGraph } from '../../utils/scripture-web/decode.js';

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

  /* Was 'renders NO "Go to" — deletion is the fix for a control that did not function'.
     Corbin's words were "get rid of the 'go to' or fix it" (the w1 digest A2: flip this case
     together with a working-control test). The navigation stream (w3) fixed it, so the law
     keeps its intent: no Go to that does nothing. The old dead "Go to" pill is still gone, and
     the search button there is opens a box that answers what is typed and closes again. */
  it('renders no dead "Go to": the search button that replaced it opens a working box', async () => {
    // the app's own book table (bundle-d ships it beside the web): the box reads names through it
    const prev = window.VotSearchData;
    await useSearchData();
    const { container } = await mount();
    expect(screen.queryByRole('button', { name: /^go to$/i })).toBeNull();
    expect(container.querySelector('.sw-goto'), 'no box until asked').toBeNull();
    const btn = screen.getByRole('button', { name: /go to a book, chapter or verse/i });
    expect(btn.closest('.sw-controls').firstElementChild, 'first in the control row (spec 4.1)').toBe(btn);
    fireEvent.click(btn);
    const box = container.querySelector('.sw-goto');
    expect(box).toBeTruthy();
    const input = box.querySelector('input');
    fireEvent.change(input, { target: { value: 'Genesis' } });
    expect(box.querySelectorAll('.sw-goto-row').length, 'it answers what is typed').toBeGreaterThan(0);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('.sw-goto')).toBeNull();
    window.VotSearchData = prev;
  });

  /* w4 (the phone stream): on the phone the open box takes the header row and Back stays beside
     it. Back is then the box's way out, as Escape and the Android Back are (the box is the top
     layer): a tap on it closed the box (the press outside) and the click then left the web, so
     one tap threw a reader who only meant to put the search away out to the Library. */
  it('Back with the box open puts the box away and stays on the web; the next Back leaves', async () => {
    const prev = window.VotSearchData;
    await useSearchData();
    const onBack = vi.fn();
    const { container } = await mount({ onBack });
    fireEvent.click(screen.getByRole('button', { name: /go to a book, chapter or verse/i }));
    expect(container.querySelector('.sw-goto')).toBeTruthy();
    const back = screen.getByRole('button', { name: 'Back' });
    // a tap: the press, then the click
    fireEvent.pointerDown(back);
    fireEvent.click(back);
    expect(container.querySelector('.sw-goto'), 'the box is put away').toBeNull();
    expect(onBack, 'and the web stays').not.toHaveBeenCalled();
    fireEvent.pointerDown(back);
    fireEvent.click(back);
    expect(onBack, 'with nothing open, Back leaves').toHaveBeenCalledTimes(1);
    window.VotSearchData = prev;
  });

  it('renders NO colour-mode select — distance is the only law, hard-wired', async () => {
    await mount();
    expect(screen.queryByLabelText('Colour mode')).toBeNull();
  });

  it('hard-wires distance into every draw rather than merely hiding the select', async () => {
    await mount();
    expect(DRAWN.length).toBeGreaterThan(0);
    /* A select that is hidden but still wired would let a stale stored value
       paint testament. The testament and genre laws are gone from the shader
       (distance is its one colour), and no frame this screen asks for carries
       a colour mode for a stale value to ride in on. */
    expect(SHADER_SOURCE.vertex).toContain('vec3 col = distanceRamp(');
    expect(SHADER_SOURCE.vertex).not.toMatch(/uColorMode|testamentColor|genreColor/);
    expect(DRAWN.map((d) => d.hasColorMode)).toEqual(DRAWN.map(() => false));
  });

  it('has ONE hide-all control, and it hides the chrome and shows it again', async () => {
    const { container } = await mount();
    const btn = screen.getByLabelText(HIDE_ALL);
    /* w3 panel step 2 (the a11y pass): the toggle carries a visible label that flips with its
       name, "Hide controls" / "Show controls", in place of a constant name plus aria-pressed
       (both at once would read "Show controls, pressed"). The law is the same: ONE control, the
       same element both ways, outside what it hides, saying which way it goes. */
    expect(btn.getAttribute('aria-label')).toBe('Hide controls');
    expect(btn.textContent).toBe('Hide controls');
    expect(btn.hasAttribute('aria-pressed')).toBe(false);

    fireEvent.click(btn);
    expect(container.querySelector('.sw-root.sw-chrome-hidden')).toBeTruthy();
    expect(container.querySelectorAll('.sw-hide-all')).toHaveLength(1);
    expect(container.querySelector('.sw-hide-all')).toBe(btn);
    expect(btn.getAttribute('aria-label')).toBe('Show controls');
    expect(btn.textContent).toBe('Show controls');
    /* The button is the way back, so it must not be inside what it hides. */
    expect(btn.closest('.sw-topbar, .sw-controls, .sw-legend, .sw-credit')).toBeNull();

    fireEvent.click(btn);
    expect(container.querySelector('.sw-root.sw-chrome-hidden')).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Hide controls');
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

/* ROUND 3 (Corbin, 2026-09-11, from a landscape screenshot with the credit printed over the
 * book labels): "Get rid of the 'cross reference open bible' shpeel, it's colliding with other
 * text." — the credit leaves the canvas (About carries the CC-BY line). The hide button
 * "should still keep the web legend (the books at the bottom, etc) but just hide the
 * interactable UI for small screens" — so hidden means the pills, Reset and the counter go and
 * the book rail (drawn on the UI canvas) and the colour key stay. The header count "just keep
 * x connections".
 *
 * The rail is canvas ink, not DOM, so the harness hands the UI canvas a RECORDING 2D context
 * (the setup shim returns null for every context, which is exactly what let the old
 * "hidden clears the rail" branch pass unobserved). The precondition case proves a label is
 * painted at all before the hidden case asks whether it survives. */
describe('the Scripture Web chrome, round 3 — the credit goes, the hide button keeps the legend and the rail', () => {
  const CALLS = [];
  // the context's font rides on each fillText (call[4]), so a label's foot can be read back
  const fake2d = () => {
    const state = { font: '' };
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'measureText') return (s) => { CALLS.push(['measureText', s]); return { width: 20 }; };
        if (prop === 'canvas') return null;
        if (prop === 'font') return state.font;
        if (prop === 'fillText') return (...a) => { CALLS.push(['fillText', a[0], a[1], a[2], state.font]); };
        return (...a) => { CALLS.push([String(prop), ...a]); };
      },
      set(_t, prop, value) { if (prop === 'font') state.font = String(value); return true; },
    });
  };
  const labelsPainted = () => CALLS.filter((c) => c[0] === 'fillText').map((c) => String(c[1]));
  const waitForLabel = async () => {
    for (let i = 0; i < 60 && !labelsPainted().some((s) => /^gen/i.test(s)); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    return labelsPainted();
  };

  beforeEach(() => {
    setViewport(900, 600);
    for (const [prop, value] of SIZES) {
      Object.defineProperty(HTMLCanvasElement.prototype, prop, { configurable: true, get() { return value; } });
    }
    window.SCRIPTURE_WEB_DATA = { ok: true, count: 1 };
    DRAWN.length = 0; CALLS.length = 0;
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(/** @type {any} */ (function (kind) { return kind === '2d' ? fake2d() : null; }));
    try { sessionStorage.clear(); } catch (_e) { /* private mode */ }
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const [prop] of SIZES) delete HTMLCanvasElement.prototype[prop];
    delete window.SCRIPTURE_WEB_DATA;
  });

  it('precondition: with the chrome showing, the rail paints a book label on the UI canvas (the recorder sees it)', async () => {
    await mount();
    const labels = await waitForLabel();
    /* If this is empty the recorder is not reaching drawRuler and the hidden case below
       would be red for the wrong reason (or green for none). */
    expect(labels.some((s) => /^gen/i.test(s)), 'a Genesis label: ' + JSON.stringify(labels.slice(0, 6))).toBe(true);
  });

  /* Q5 (w3 panel step 2) brings the credit back, as the legend's tail and never as a line of
     its own: round 3's law ("nothing prints over the book labels") with the credit present. It
     is the legend's last item, read (not aria-hidden), and every book label the canvas paints
     ends above the legend's line. The legend's top is the stylesheet's own numbers (its bottom
     offset plus one line), read from app.css; that it is one line on a phone and a PC is the
     screenshots' (D:/Swarm/lanes/sweb/out/w3/chrome). */
  it('the credit is the legend\'s tail, read, and every book label ends above the legend', async () => {
    const { container } = await mount();
    const labels = await waitForLabel();
    expect(labels.some((s) => /^gen/i.test(s)), 'PRECONDITION: the rail painted').toBe(true);
    const legend = container.querySelector('.sw-legend');
    const credit = legend && legend.querySelector('.sw-credit');
    expect(credit, 'the credit, in the legend').toBeTruthy();
    expect(credit.parentElement.lastElementChild, 'the credit is the legend\'s last item').toBe(credit);
    expect(credit.textContent).toBe('Cross-reference data \u00a9 OpenBible.info (CC-BY)');
    expect(credit.closest('[aria-hidden="true"]'), 'the credit is read, not hidden').toBeNull();

    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../../../app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const ruleOf = (sel) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp('(?:^|[{}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(css);
      if (!m) throw new Error('no `' + sel + ' {` rule in app.css');
      return m[1];
    };
    const H = SIZES.find((s) => s[0] === 'clientHeight')[1];
    // a root 500 px tall or less is .sw-compact (use-panel-layout.js); jsdom gives the root no box,
    // so the canvas's height stands in for it
    const compact = H <= 500;
    const own = ruleOf(compact ? '.sw-root.sw-compact .sw-legend' : '.sw-legend');
    const bottom = Number(/bottom:\s*calc\((\d+)px/.exec(own)[1]);
    const size = Number(/font-size:\s*var\(--fsc-(\d+)\)/.exec(own)[1]);
    const lineHeight = Number(/line-height:\s*([\d.]+)/.exec(/line-height/.test(own) ? own : ruleOf('.sw-legend'))[1]);
    // a phone's legend is one line where it fits since w4 (12 px, "far": about 670 px against the
    // 751 beside ? and hide-UI on the 891 px phone) and wraps to two where it does not, as on this
    // 800 px frame (660 beside them; tools/e2e-sw-legend.mjs measures it): the labels clear two
    const lines = compact ? 2 : 1;
    const legendTop = H - bottom - lines * size * lineHeight;
    // a book label is the fixture book's name or abbreviation as the rail prints it (upper case),
    // in the web's one face: Cinzel is retired from the canvas (sw-ink.js FONT), so the font no
    // longer tells a book label from the other canvas text
    const books = CALLS.filter((c) => c[0] === 'fillText' && /^(GENESIS|GEN)$/.test(String(c[1])) && /EB Garamond/.test(String(c[4])));
    expect(books.length, 'book labels recorded, with their font').toBeGreaterThan(0);
    const foot = (c) => Number(c[3]) + Number((/(\d+(?:\.\d+)?)px/.exec(String(c[4])) || [0, 0])[1]);
    const lowest = Math.max(...books.map(foot));
    expect(lowest, 'the lowest book label\'s foot against the legend\'s top, ' + legendTop).toBeLessThanOrEqual(legendTop);
  });

  /* The hide itself repaints nothing (the canvas is not cleared by a CSS class), so the
     draw that matters is the NEXT one — the phone turning in the reader's hand. jsdom has no
     ResizeObserver, so the screen listens to window resize, which is what a rotation raises;
     that is the redraw driven here. Under the old code that redraw CLEARED the rail. */
  const rotate = () => act(async () => { window.dispatchEvent(new Event('resize')); await new Promise((r) => setTimeout(r, 0)); });

  it('hidden keeps the book rail: the redraw after the hide (a rotation) still paints the book labels', async () => {
    await mount();
    await waitForLabel();
    fireEvent.click(screen.getByLabelText(HIDE_ALL));
    CALLS.length = 0;
    await rotate();
    const labels = await waitForLabel();
    expect(labels.some((s) => /^gen/i.test(s)), 'labels after the hide: ' + JSON.stringify(labels.slice(0, 6))).toBe(true);
  });

  it('hidden keeps the book rail in My Web too — one screen, two modes', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /my web/i }));
    await tick();
    await waitForLabel();
    fireEvent.click(screen.getByLabelText(HIDE_ALL));
    CALLS.length = 0;
    await rotate();
    const labels = await waitForLabel();
    expect(labels.some((s) => /^gen/i.test(s)), 'labels after the hide (My Web): ' + JSON.stringify(labels.slice(0, 6))).toBe(true);
  });

  it('hidden keeps the colour key in the DOM and hides the strip and the topbar', async () => {
    const { container } = await mount();
    fireEvent.click(screen.getByLabelText(HIDE_ALL));
    const root = container.querySelector('.sw-root.sw-chrome-hidden');
    expect(root).toBeTruthy();
    /* The elements stay mounted either way (the hiding is CSS); the CSS gate lives in
       sw-dark-nobox.test.js. Here: the key is still rendered with its entries. */
    expect(root.querySelector('.sw-legend .sw-key')).toBeTruthy();
    expect(root.querySelector('.sw-controls')).toBeTruthy();
  });

  it('the header count reads "N connections", not "N of M connections"', async () => {
    const { container } = await mount();
    const sub = container.querySelector('.sw-title p');
    expect(sub).toBeTruthy();
    expect(sub.textContent).toMatch(/^\d[\d,]* connections$/);
    expect(sub.textContent).not.toMatch(/ of /);
  });

  /* Item 5's bottom half, rewritten to the w4 band (r2-01a): the canon's names
     stand on ONE row (a second row is retired), placed through the ranked
     law (rail-labels.js placeRailLabelsRanked) a word (NAME_GAP, 14 px) apart.
     This case witnesses that the bottom rail actually routes through the law
     (a bite that prints a colliding name, or opens a second row, reddens it);
     the law's own shape is pinned in rail-labels-ranked.test.js. Geometry:
     three 600-verse books at W = 800 are 15.4 px wide each, so with the
     recorder's fixed 20 px measureText EXO overlaps GEN by 4.6 px and LEV
     stands 10.8 px from it: GEN, a major book, takes its
     place first. Since the w4 review 2 a name a few pixels short of the word
     slides along its own book (LUKE beside JOHN): LEV slides 3.2 px right, to a
     word from GEN with its centre still over Leviticus, and EXO, which has no
     such place over its own book, is left out (rewritten to that intent). */
  it('the bottom rail places the book names on one row through the shared law: a name with no room over its own book is left out, one a few pixels short slides', async () => {
    const CANON = 31102, START = 15000, SPAN = 600;
    const three = graph();
    three.books = [
      { id: 'genesis-plain', title: 'Genesis', abbr: 'Gen' },
      { id: 'exodus-plain', title: 'Exodus', abbr: 'Exo' },
      { id: 'leviticus-plain', title: 'Leviticus', abbr: 'Lev' },
    ];
    three.chapters = [[0, 1, START, SPAN], [1, 1, START + SPAN, SPAN], [2, 1, START + 2 * SPAN, SPAN]];
    three.total = CANON;
    vi.mocked(decodeGraph).mockReturnValueOnce(/** @type {any} */ (three));
    await mount();
    for (let i = 0; i < 60 && !labelsPainted().some((s) => s === 'GEN'); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    const yOf = (label) => {
      const hits = CALLS.filter((c) => c[0] === 'fillText' && c[1] === label);
      expect(hits.length, label + ' was painted').toBeGreaterThan(0);
      return hits[hits.length - 1][3];
    };
    const yGen = yOf('GEN');
    const painted = CALLS.filter((c) => c[0] === 'fillText' && ['GEN', 'EXO', 'LEV', 'GENESIS', 'EXODUS', 'LEVITICUS'].includes(c[1]));
    expect(new Set(painted.map((c) => c[3])).size, 'one row').toBe(1);
    expect(painted[0][3]).toBe(yGen);
    expect(labelsPainted().filter((t) => t === 'EXO' || t === 'EXODUS'), 'EXO collides with GEN wherever it stands over Exodus: left out').toEqual([]);
    const xOf = (label) => CALLS.filter((c) => c[0] === 'fillText' && c[1] === label).pop()[2];
    const dx = xOf('LEV') - xOf('GEN');
    expect(dx, 'LEV a word (14 px) clear of GEN: it slid').toBeGreaterThanOrEqual(20 + 14 - 1e-6);
    expect(dx, "LEV's centre still over Leviticus (2.5 books from GEN's centre at most)").toBeLessThanOrEqual(2.5 * 15.4);
  });
});
