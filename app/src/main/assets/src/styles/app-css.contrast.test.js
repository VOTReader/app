/* app-css.contrast.test.js — WCAG contrast for text-role semantic tokens (a11y-ux-1).
   ─────────────────────────────────────────────────────────────────────
   Scope, stated honestly: this pins contrast for a SMALL set of semantic
   tokens used as text/icon color across many surfaces (--danger, --link-
   blue), not a general palette auditor -- most of app.css's tokens are
   decorative (gold glows, borders, highlight swatches) with no WCAG
   obligation and are out of scope here.

   --danger is declared once, in :root, tuned for the DARK theme (#ef9a9a,
   9.36:1 on dark --bg3). body.light overrides --gold/--cream/--link-blue/
   --accent-pink/--input-text/--border/--bg* but never --danger, so any
   light-theme site using var(--danger) silently inherits the dark value --
   CSS custom properties fall through to :root when a more specific rule
   doesn't redeclare them, so the missing override isn't a no-op, it's an
   ACTIVE wrong color. Measured 1.6-1.9:1 against light --bg/--bg2/--bg3
   (note-sheet Delete, annotation-chip Remove, Delete Link, bookmark
   deletes), all well under WCAG AA. jsdom doesn't compute styles, so
   reading the CSS text and modeling the same fallthrough is the only way
   a test catches this.

   Precedent: --link-blue got exactly this treatment in the 2026-06-03 WCAG
   audit (W10-lite) -- its light override is pinned here as the green case,
   alongside dark --danger (already fine, must stay fine). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/* Block of the FIRST rule whose selector list contains EXACTLY `selector`
   (comment-stripped). A plain substring search would fail here: app.css has
   over a dozen `body.light <descendant>` rules (e.g. `body.light .vot-toast`)
   ABOVE the real bare `body.light { ... }` token-declaration block, and the
   first would win instead. */
function exactRuleBlock(css, selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(bare))) {
    const parts = m[1].trim().split(',').map((s) => s.trim());
    if (parts.includes(selector)) return m[2];
  }
  return null;
}

/** `--name: value;` pairs declared directly in a block. */
function customProps(block) {
  const out = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}

const ROOT = customProps(exactRuleBlock(CSS, ':root'));
const LIGHT = customProps(exactRuleBlock(CSS, 'body.light'));

/* A token body.light doesn't redeclare inherits :root's value at runtime --
   the exact mechanism the bug exploits, so the fallback must be modeled,
   not treated as "missing". */
function themed(block, name) {
  return block[name] !== undefined ? block[name] : ROOT[name];
}

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function relLuminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
/** WCAG 2.x contrast ratio: (L1+0.05)/(L2+0.05), lighter color as L1. */
function contrastRatio(hexA, hexB) {
  const a = relLuminance(hexA), b = relLuminance(hexB);
  const lighter = Math.max(a, b), darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('app.css — --danger contrast against every light surface (a11y-ux-1)', () => {
  it.each([
    ['--bg', 'bg'],
    ['--bg2', 'bg2'],
    ['--bg3', 'bg3'],
  ])('light --danger reaches WCAG AA against light %s', (_label, bgKey) => {
    const ratio = contrastRatio(themed(LIGHT, 'danger'), themed(LIGHT, bgKey));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

/* a11y-ux-2. --gold-dim colours the eyebrows, chapter labels, chevrons and
   settings values -- 99 small-text sites at 10-16 px on one walk of thirteen
   screens (node tools/contrast-sweep.mjs --theme light). The old light value
   #a8832a measured 3.17 / 2.86 / 2.64 on --bg / --bg2 / --bg3: under 4.5 at
   every site, under the 3:1 UI floor on two surfaces. On a light ground a
   colour LIGHTER than --gold cannot reach 4.5 on --bg3 (--gold is 4.67 there),
   so "dim" now recedes by saturation, not lightness. This pins the constant;
   the sweep measures what Chrome resolves. */
describe('app.css — light --gold-dim contrast against every light surface (a11y-ux-2)', () => {
  it.each([
    ['--bg', 'bg'],
    ['--bg2', 'bg2'],
    ['--bg3', 'bg3'],
  ])('light --gold-dim reaches WCAG AA against light %s', (_label, bgKey) => {
    const ratio = contrastRatio(themed(LIGHT, 'gold-dim'), themed(LIGHT, bgKey));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  it('dark --gold-dim still reaches WCAG AA against dark --bg3 (untouched)', () => {
    expect(contrastRatio(themed(ROOT, 'gold-dim'), themed(ROOT, 'bg3'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

/* --gold-bright is the emphasis gold: footnote refs, rich footnote titles,
   the active search-corpus chip, hover and active states -- 81 colour sites.
   On the light walk (node tools/contrast-sweep.mjs --token --gold-bright
   --theme light --min 4.5) three small-text sites measured under AA: the
   active corpus chip "All" 10 px at 3.13:1 on gold-faint over --bg3, a rich
   footnote title 13 px at 3.66:1, a footnote ref 14 px at 3.84:1 on --bg. The
   old light value #9b7418 was LIGHTER than --gold, and on parchment nothing
   lighter than --gold clears 4.5 on --bg3; so on a light ground "bright" is
   emphasis by depth, darker and fuller than --gold, not paler. The chip
   ground is modelled the way Chrome resolves it: --gold-faint blended over
   --bg3 (alpha compositing in sRGB, the same as the sweep's first-opaque-
   background rule). */
function rgbaOver(hexBg, rgbaFg) {
  const m = rgbaFg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  const a = parseFloat(m[4]);
  const bg = [hexBg.slice(1, 3), hexBg.slice(3, 5), hexBg.slice(5, 7)].map((h) => parseInt(h, 16));
  const out = [1, 2, 3].map((i, k) => Math.round(bg[k] * (1 - a) + parseInt(m[i], 10) * a));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}
describe('app.css — light --gold-bright contrast at its small-text grounds (a11y, design-perf 2026-09-05)', () => {
  it.each([
    ['--bg', 'bg'],
    ['--bg2', 'bg2'],
    ['--bg3', 'bg3'],
  ])('light --gold-bright reaches WCAG AA against light %s', (_label, bgKey) => {
    expect(contrastRatio(themed(LIGHT, 'gold-bright'), themed(LIGHT, bgKey))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  it('light --gold-bright reaches WCAG AA on the active chip ground (--gold-faint over --bg3)', () => {
    const chip = rgbaOver(themed(LIGHT, 'bg3'), themed(LIGHT, 'gold-faint'));
    expect(contrastRatio(themed(LIGHT, 'gold-bright'), chip)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  it('light --gold-bright is emphasis by depth: no lighter than --gold', () => {
    expect(relLuminance(themed(LIGHT, 'gold-bright'))).toBeLessThanOrEqual(relLuminance(themed(LIGHT, 'gold')));
  });
  it('dark --gold-bright still reaches WCAG AA against dark --bg3 (untouched)', () => {
    expect(contrastRatio(themed(ROOT, 'gold-bright'), themed(ROOT, 'bg3'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  /* The one site where --gold-bright is a GROUND under text: the Listening
     Library's primary action on hover. Its text was #17130a for the dark
     theme's bright gold (4.33:1 there); on light it read 2.97:1 at rest on
     --gold and would read 2.54:1 on the deeper hover gold. Light therefore
     sets the text to the page ground. */
  it('light primary-action text is the page ground, AA on both its golds', () => {
    const rule = exactRuleBlock(CSS, 'body.light .audio-library-primary-action');
    expect(rule).toMatch(/color:\s*var\(--bg\)/);
    expect(contrastRatio(themed(LIGHT, 'bg'), themed(LIGHT, 'gold'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(themed(LIGHT, 'bg'), themed(LIGHT, 'gold-bright'))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('app.css — surrounding contrast stays green', () => {
  it('dark --danger still reaches WCAG AA against dark --bg3 (untouched)', () => {
    const ratio = contrastRatio(themed(ROOT, 'danger'), themed(ROOT, 'bg3'));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
  it('light --link-blue still reaches WCAG AA against light --bg (2026-06-03 fix)', () => {
    const ratio = contrastRatio(themed(LIGHT, 'link-blue'), themed(LIGHT, 'bg'));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
