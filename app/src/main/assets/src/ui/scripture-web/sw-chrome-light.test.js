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
      <div class="sw-seg"><button class="sw-seg-btn is-on">Scripture</button><button class="sw-seg-btn">My web</button></div>
      <select class="sw-select"><option>Famous</option></select>
      <button class="sw-btn sw-toggle is-on">Corpus context</button>
      <button class="sw-btn">Reset</button>
    </div>
    <button class="sw-btn sw-btn-icon sw-hide-all">Hide</button>
    <div class="sw-legend"><span class="sw-key">your links</span></div>`;
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
  'legend': '.sw-legend',
};

/** Resolve `color` one level through the cascade: var(--x) -> the property's computed value. */
function inkOf(el) {
  const cs = getComputedStyle(el);
  const decl = (cs.color || '').trim();
  const v = /^var\((--[\w-]+)\)$/.exec(decl);
  const raw = v ? cs.getPropertyValue(v[1]).trim() : decl;
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

  it('calibration: in the dark theme a pill resolves to the cream the live walk read (18.02:1)', () => {
    const root = mountChrome();
    const ink = inkOf(root.querySelector(SITES['pill .sw-btn']));
    expect(ink).toEqual([0xf2, 0xed, 0xe5]);
    expect(onBlack(ink)).toBeCloseTo(18.02, 1);
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
});
