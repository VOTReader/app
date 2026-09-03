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
