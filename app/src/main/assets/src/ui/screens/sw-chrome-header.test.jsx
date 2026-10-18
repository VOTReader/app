// @ts-nocheck
/* The Scripture Web's header and controls (spec 4.1; digest items 18, 21, 47, 48; Q6).
 * ═══════════════════════════════════════════════════════════════════════
 * What the reader sees at the top of the web and in its corners, and how it speaks:
 *
 *   - the title "The Scripture Web" over its count, "N connections" (never "x of y")
 *   - the density control: closed it reads the density's name; open, each density says its
 *     count and one line (Q6: "Famous · 63,418, the full classic chart" / "Essential · N, the
 *     strongest")
 *   - ONE polite live region: the density hint under the title is no second one (it was a
 *     role="status" of its own), and the same words said twice are said again
 *   - the hint never wraps the header or moves Back (item 21): it is out of the row's flow
 *   - Back stays above the loader (item 24)
 *   - every control is a 44 px target (item 48); no chrome type under 12 px (item 47); focus
 *     rings for the keyboard only
 *
 * HARNESS: sw-chrome-trim.test.jsx's (a sized canvas, a mocked renderer that records draws),
 * because the screen draws nothing on a 0 px frame and the density reaches the draw.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      draw: (opts) => { DRAWN.push({ density: opts && opts.density }); return { instances: 0, draws: 0 }; },
      dispose: vi.fn(),
    })),
  };
});

import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.join(HERE, '../../../app.css'), 'utf8');
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

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

const baseProps = () => ({
  navigateToLink: vi.fn(), onBack: vi.fn(),
  settings: { webDensity: 'famous', swGuideSeen: true }, updateSetting: vi.fn(),
});
const settle = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function mount(props = {}) {
  const view = render(<ScriptureWebScreen {...baseProps()} {...props} />);
  for (let i = 0; i < 40 && !view.container.querySelector('.sw-canvas-gl'); i++) await settle(0);
  for (let i = 0; i < 60 && DRAWN.length === 0; i++) await settle(20);
  if (DRAWN.length === 0) throw new Error('the renderer was never asked to draw; nothing below is about the web');
  return view;
}

/** The body of the first rule whose selector list is exactly `selector`. */
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[{}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(BARE);
  if (!m) throw new Error('no `' + selector + ' {` rule in app.css');
  return m[1];
}
const px = (body, prop) => {
  const m = new RegExp('(?:^|[;\\s])' + prop + ':\\s*(-?[\\d.]+)px').exec(body);
  return m ? parseFloat(m[1]) : null;
};

describe('the header and the controls (spec 4.1)', () => {
  beforeEach(() => {
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

  it('the title names the web in sentence case and the count reads "N connections"', async () => {
    const { container } = await mount();
    expect(container.querySelector('.sw-title h1').textContent).toBe('The Scripture Web');
    expect(container.querySelector('.sw-title p').textContent).toMatch(/^\d[\d,]* connections$/);
  });

  it('the density options name each density with its count and one line; closed, it reads the name', async () => {
    const { container } = await mount();
    const select = screen.getByLabelText('Connection density');
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'Famous · 0, the full classic chart', 'Essential · 0, the strongest',
    ]);
    const face = container.querySelector('.sw-select-face');
    expect(face && face.textContent).toBe('Famous');
    expect(face.getAttribute('aria-hidden')).toBe('true');
    fireEvent.change(select, { target: { value: 'essential' } });
    await settle(40);
    expect(container.querySelector('.sw-select-face').textContent).toBe('Essential');
  });

  it('one live region: a density switch shows its line under the title and is said in .sw-live only', async () => {
    const { container } = await mount();
    fireEvent.change(screen.getByLabelText('Connection density'), { target: { value: 'essential' } });
    await settle(40);
    const hint = container.querySelector('.sw-hint');
    expect(hint && hint.textContent).toBe('Essential · 0, the strongest');
    expect(hint.hasAttribute('role'), 'the hint is not a second status region').toBe(false);
    const regions = container.querySelectorAll('[role="status"], [role="alert"], [aria-live]');
    expect(regions).toHaveLength(1);
    expect(regions[0].className).toBe('sw-live');
    expect(regions[0].textContent.trim()).toBe('Essential · 0, the strongest');
  });

  it('the same words said twice are said again (the region\'s text changes, the words do not)', async () => {
    const { container } = await mount();
    const root = container.querySelector('.sw-root');
    for (let i = 0; i < 40; i++) { fireEvent.keyDown(root, { key: '+' }); await settle(20); }
    const first = container.querySelector('.sw-live').textContent;
    fireEvent.keyDown(root, { key: '+' });
    await settle(20);
    const again = container.querySelector('.sw-live').textContent;
    expect(first.trim()).toBe('Zoomed all the way in');
    expect(again.trim()).toBe('Zoomed all the way in');
    expect(again, 'an unchanged region is not read again').not.toBe(first);
  });
});

describe('the chrome\'s CSS (spec 4.1; items 21, 24, 47, 48)', () => {
  it('the header row aligns to its top and the hint is out of its flow, on one line (item 21)', () => {
    expect(rule('.sw-topbar')).toMatch(/align-items:\s*flex-start/);
    const hint = rule('.sw-hint');
    expect(hint).toMatch(/position:\s*absolute/);
    expect(hint).toMatch(/white-space:\s*nowrap/);
    expect(hint).toMatch(/text-overflow:\s*ellipsis/);
  });

  it('Back sits above the loader, so it is there while the web is woven (item 24)', () => {
    const z = (sel) => Number(/z-index:\s*(\d+)/.exec(rule(sel))[1]);
    expect(z('.sw-topbar')).toBeGreaterThan(z('.sw-loading, .sw-fallback'));
  });

  it('the loader, the error and the root paint on the canvas\'s black (Q4)', () => {
    expect(rule('.sw-loading, .sw-fallback')).toMatch(/background:\s*var\(--sw-canvas\)/);
    expect(BARE).toMatch(/--sw-canvas:\s*#000000;/);
  });

  it('the title is the book\'s serif in sentence case', () => {
    const h1 = rule('.sw-title h1');
    expect(h1).toMatch(/font-family:\s*var\(--sw-font\)/);
    expect(h1).not.toMatch(/text-transform/);
  });

  it('every control is a 44 px target (item 48)', () => {
    // [face rule, hit rule]: the face's min-height plus the hit's overhang above and below
    const cases = [
      ['.sw-btn', '.sw-btn::after'],
      ['.sw-root.sw-compact .sw-btn', '.sw-root.sw-compact .sw-btn::after'],
      ['.sw-seg-btn', '.sw-seg-btn::after'],
      ['.sw-root.sw-compact .sw-seg-btn', '.sw-root.sw-compact .sw-seg-btn::after'],
    ];
    for (const [face, hit] of cases) {
      const h = px(rule(face), 'min-height');
      const over = -px(rule(hit), 'top') - px(rule(hit), 'bottom');
      expect(h + over, face).toBeGreaterThanOrEqual(44);
    }
    expect(px(rule('.sw-rail-reset'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule('.sw-empty-close'), 'min-height')).toBeGreaterThanOrEqual(44);
  });

  /* The phone's round rule (0,4,0: .sw-root.sw-compact :is(.sw-topbar .sw-btn-icon, ...)) held the
     hidden pill at 40 px, so "Show controls" ran off the glass (phone-ui-hidden, w3 panel step 2).
     The phone's hidden rule must name as many classes and come after it. */
  it('hidden, the hide-UI pill is as wide as its words on a phone too', () => {
    const round = '.sw-root.sw-compact :is(.sw-topbar .sw-btn-icon, .sw-hide-all, .sw-guide-btn) {';
    const pill = '.sw-root.sw-compact.sw-chrome-hidden .sw-hide-all {';
    expect(BARE.indexOf(round), 'the phone\'s round rule').toBeGreaterThan(-1);
    expect(BARE.indexOf(pill), 'the phone\'s hidden pill comes after it').toBeGreaterThan(BARE.indexOf(round));
    expect(rule('.sw-root.sw-compact.sw-chrome-hidden .sw-hide-all')).toMatch(/width:\s*auto/);
  });

  /* The legend wraps rather than run under ? and hide-UI (spec 4.1), and a wrapped line must not
     start with a separator: each item's dot sits in its own left margin, the line is pulled left
     by that margin, and the legend clips what is left of its edge, so a line's first dot is
     outside it. */
  it('a wrapped legend line never starts with its separator', () => {
    expect(rule('.sw-legend')).toMatch(/overflow:\s*hidden/);
    const line = rule('.sw-legend-line');
    expect(line).toMatch(/display:\s*flex/);
    expect(line).toMatch(/flex-wrap:\s*wrap/);
    const pull = -px(line, 'margin-left');
    const item = rule('.sw-legend-line > *');
    expect(px(item, 'margin-left'), 'the item\'s margin is the line\'s pull').toBe(pull);
    const dot = rule('.sw-legend-line > *::before');
    expect(dot).toMatch(/position:\s*absolute/);
    const left = -px(dot, 'left');
    expect(left, 'the dot sits inside the item\'s margin').toBeGreaterThan(0);
    expect(left).toBeLessThan(pull);
  });

  it('no type in the web\'s chrome is under 12 px (item 47)', () => {
    const small = [];
    for (const m of BARE.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1].trim();
      if (!/\.swf?-/.test(sel)) continue;
      for (const f of m[2].matchAll(/font-size:\s*var\(--fsc?-(\d+)\)/g)) if (Number(f[1]) < 12) small.push(sel + ' -> ' + f[0]);
    }
    expect(small).toEqual([]);
  });

  it('focus rings show for the keyboard only: every ring is :focus-visible', () => {
    const plain = [];
    for (const m of BARE.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sel = m[1].trim();
      if (!/\.swf?-/.test(sel) || !/:focus(?![-\w])/.test(sel)) continue;
      if (!/outline:\s*none/.test(m[2])) plain.push(sel);
    }
    expect(plain).toEqual([]);
  });
});
