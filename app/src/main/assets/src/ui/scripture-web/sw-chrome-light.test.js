// @ts-nocheck
/* RED for the Scripture Web's chrome in the LIGHT theme.
 * ═══════════════════════════════════════════════════════════════════════
 * The web's canvas is black in both themes by construction (SW_PALETTE in
 * palette.js: "this screen has one palette"; the GL pass clears to it under
 * My Web too). The chrome floating over that canvas — the topbar, the pill
 * strip, the legend — took the app's THEME tokens, and under `body.light`
 * `--cream-dim` is #150a04: verifier-2 measured every resting pill at 1.08:1
 * from live pixels (sw-light-live-30f8b01f24, 2026-09-11 21:45; the dark arm
 * read 18.02:1, the walk's own calibration).
 *
 * This test applies the light theme exactly as use-settings.js does
 * (`document.body.classList.toggle("light", ...)`, asserted below against the
 * source so the mechanism cannot drift), resolves each chrome element's
 * declared colour through the cascade one level (jsdom 30 cascades custom
 * properties but does not substitute var() into `color`), and asserts the
 * ink clears 4.5:1 on the black ground it actually sits on, in BOTH themes,
 * with the same resolved colour in both — one palette, one canvas.
 *
 * Why the resolved token and not the pixel: the ground is asserted black by
 * the palette constant the renderer paints, and verifier-2's probe reads the
 * pixels on the served tree; this file is the unit half.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, '../../..');
const CSS = fs.readFileSync(path.join(ASSETS, 'app.css'), 'utf8');
const USE_SETTINGS = fs.readFileSync(path.join(ASSETS, 'src/hooks/use-settings.js'), 'utf8');

/** The chrome that floats over the black canvas, built as the screen builds it. */
function mountChrome() {
  const root = document.createElement('div');
  root.className = 'sw-root';
  root.innerHTML = `
    <div class="sw-topbar"><div class="sw-title"><h1>My Web</h1><p>No links yet</p></div></div>
    <div class="sw-controls">
      <div class="sw-seg"><button class="sw-seg-btn is-on">Scripture</button><button class="sw-seg-btn">My Web</button></div>
      <select class="sw-select"><option>Famous</option></select>
      <button class="sw-btn sw-toggle is-on">Corpus context</button>
      <button class="sw-btn">Reset</button>
    </div>
    <button class="sw-btn sw-btn-icon sw-hide-all">Hide</button>
    <button class="sw-btn sw-btn-icon sw-guide-btn">?</button>
    <div class="sw-legend"><span class="sw-key">your links</span><span class="sw-credit">Cross-reference data</span></div>
    <div class="sw-empty"><div class="sw-empty-title">Your web is still being woven.</div>
      <div class="sw-empty-body">Select text anywhere in the app, tap <strong>Link</strong>.</div>
      <button class="sw-empty-close">x</button></div>`;
  document.body.appendChild(root);
  return root;
}

const SITES = {
  'title h1': '.sw-title h1',
  'subtitle': '.sw-title p',
  'pill .sw-btn': '.sw-btn:not(.is-on):not(.sw-hide-all)',
  'pill .sw-btn.is-on (Corpus context rests ON)': '.sw-btn.is-on',
  'segment off': '.sw-seg-btn:not(.is-on)',
  'segment on': '.sw-seg-btn.is-on',
  'select': '.sw-select',
  'hide-all': '.sw-hide-all',
  // the ? read nearly invisible in the light theme (digest item 18, crop-pc-light-qbtn)
  'guide ?': '.sw-guide-btn',
  'legend': '.sw-legend',
  'legend credit': '.sw-legend .sw-credit',
  // My Web's empty notice sits on the canvas with no box: --cream-muted turned it dark-on-black
  // in the light theme (digest item 18)
  'empty title': '.sw-empty-title',
  'empty body': '.sw-empty-body',
  'empty body strong': '.sw-empty-body strong',
  'empty close': '.sw-empty-close',
};

/** Resolve `color` through the cascade: var(--x) -> the property's computed value, following a
 *  var() CHAIN (a token that names another token) — jsdom 30 substitutes var() into neither `color`
 *  nor a custom property's own value (measured 2026-09-12: `--cream-dim: var(--ink-cream-dim)` reads
 *  back verbatim). Bounded, so a cycle throws instead of hanging. */
function inkOf(el) {
  const cs = getComputedStyle(el);
  const decl = (cs.color || '').trim();
  let raw = decl;
  for (let hop = 0; hop < 8; hop++) {
    const v = /^var\((--[\w-]+)\)$/.exec(raw);
    if (!v) break;
    raw = cs.getPropertyValue(v[1]).trim();
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(raw);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const rgb = /^rgba?\(([^)]+)\)/.exec(raw);
  if (rgb) return rgb[1].split(',').slice(0, 3).map((n) => parseFloat(n));
  throw new Error(`unresolvable colour "${decl}" -> "${raw}" (a missing stylesheet reads exactly like a pass otherwise)`);
}
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const onBlack = (c) => (lum(c) + 0.05) / 0.05;

describe('the Scripture Web chrome reads on its black canvas in the light theme too', () => {
  let style;
  beforeAll(() => {
    style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  });
  afterEach(() => {
    document.body.classList.toggle('light', false);
    document.body.innerHTML = '';
  });

  it('applies the theme the way use-settings.js does (the mechanism under test)', () => {
    expect(USE_SETTINGS).toMatch(/document\.body\.classList\.toggle\("light",\s*theme === "light"\)/);
  });

  // The calmer dark (2026-09-25) moved --ink-cream-dim from #f2ede5 (18.02:1) to #e0d9cc; spec 4.1
  // (w3 panel step 2) moved the controls onto the web's own control ink, sw-ink.js `text` #E9EEEF,
  // the --sw-text token panel-css.test.js holds to its row. The calibration follows the value.
  it('calibration: in the dark theme a pill resolves to the web’s control ink (17.94:1)', () => {
    const root = mountChrome();
    const ink = inkOf(root.querySelector(SITES['pill .sw-btn']));
    expect(ink).toEqual([0xe9, 0xee, 0xef]);
    expect(onBlack(ink)).toBeCloseTo(17.94, 1);
  });

  /* The chrome rule and :root's dark set spelled the same seven literals twice (chrome-light,
     2026-09-11: "values are :root's, verbatim"). Two definitions that must agree is the root:
     each ink is now ONE token in :root (--ink-*), and both sites reference it. The rule text is
     read straight from app.css because the resolved colour cannot tell a copied literal from a
     shared token — the calibration case above is what proves the VALUE, this proves the SHARE. */
  const INKS = ['gold', 'gold-bright', 'gold-dim', 'gold-faint', 'gold-border', 'cream-dim', 'cream-muted'];
  const ruleBody = (selector) => {
    const at = CSS.indexOf(selector + ' {');
    expect(at, `rule ${selector} present in app.css`).toBeGreaterThan(-1);
    return CSS.slice(at, CSS.indexOf('}', at));
  };
  const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i;

  it('the chrome rule carries no colour literal — every ink is a shared --ink-* token that :root also reads', () => {
    const chrome = ruleBody('.sw-topbar, .sw-controls, .sw-hide-all, .sw-legend');
    // Positive control on the extractor + the matcher: :root's block is FULL of literals.
    expect(ruleBody(':root')).toMatch(LITERAL);
    expect(chrome, 'a literal here is a second definition of a :root value').not.toMatch(LITERAL);
    const root = ruleBody(':root');
    for (const ink of INKS) {
      const shared = new RegExp('--' + ink + ':\\s*var\\(--ink-' + ink + '\\)');
      expect(chrome, `chrome --${ink} reads --ink-${ink}`).toMatch(shared);
      expect(root, `:root --${ink} reads --ink-${ink}`).toMatch(shared);
      expect(root, `--ink-${ink} is declared once, in :root`).toMatch(new RegExp('--ink-' + ink + ':\\s*(#[0-9a-f]{6}|rgba?\\([^)]*\\));'));
      expect(CSS.split('--ink-' + ink + ':').length - 1, `--ink-${ink} declared exactly once`).toBe(1);
    }
  });

  it.each(Object.entries(SITES))('%s: light theme ink clears 4.5:1 on the black canvas and matches dark', (_name, sel) => {
    const root = mountChrome();
    const el = root.querySelector(sel);
    expect(el, sel).toBeTruthy();
    const dark = inkOf(el);
    document.body.classList.toggle('light', true);
    const light = inkOf(el);
    expect(onBlack(light), `light ink ${light.join(',')} on #000`).toBeGreaterThanOrEqual(4.5);
    expect(light, 'one palette: the same ink in both themes').toEqual(dark);
  });

  /* The load error replaces the whole screen (no .sw-root above it), so it reads the web's
     tokens from its own rule (.sw-fallback, .sw-root) and paints the canvas's black (Q4). */
  /* (w4: the raw-detail line is gone from the page, so its case went with it.) */
  it.each([['title', '.sw-fallback-title'], ['body', '.sw-fallback-body']])(
    'the load error\'s %s reads on black in both themes, the same ink in both', (_name, sel) => {
      const panel = document.createElement('div');
      panel.className = 'sw-fallback';
      panel.innerHTML = '<div class="sw-fallback-title">The Scripture Web couldn\u2019t load.</div>'
        + '<div class="sw-fallback-body">Check your connection.</div>';
      document.body.appendChild(panel);
      const el = panel.querySelector(sel);
      const dark = inkOf(el);
      document.body.classList.toggle('light', true);
      const light = inkOf(el);
      expect(onBlack(light), `light ink ${light.join(',')} on #000`).toBeGreaterThanOrEqual(4.5);
      expect(light).toEqual(dark);
    });
});
