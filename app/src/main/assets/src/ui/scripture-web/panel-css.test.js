// @ts-nocheck
/* The docked panel's CSS against its law (w3 panel stream).
   ─────────────────────────────────────────────────────────────────────
   app.css cannot import utils/scripture-web/sw-ink.js, so the panel's ink is
   written there twice: the TABLE (the spec 4.6 numbers) and the --sw-* tokens
   on .sw-root. sw-ink.js's header promises "a test holds the two together":
   this is it. Plus the layout the spec fixes in CSS (spec section 3): the
   panel's full height and slide, the sheet, the collapse, and what moves while
   the panel is open. jsdom computes no styles, so these read the text. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { INK, FONT } from '../../utils/scripture-web/sw-ink.js';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', '..', 'app.css'), 'utf8');
const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first rule whose selector list is exactly `selector` (not one it only ends). */
function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[{}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(BARE);
  return m ? m[1] : null;
}

/** The .sw-root rule that declares the panel's tokens. */
function tokenRule() {
  const re = /\.sw-root\s*\{([^}]*--sw-panel:[^}]*)\}/;
  const m = re.exec(BARE);
  return m ? m[1] : null;
}

/** 'rgba(28, 37, 39, 0.88)' or '#1C2527' -> { hex, alpha } */
function parse(value) {
  const v = value.trim();
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(v);
  if (rgba) {
    const hex = '#' + [1, 2, 3].map((i) => Number(rgba[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, alpha: Number(rgba[4]) };
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return { hex: v.toUpperCase(), alpha: 1 };
  return null;
}

// token -> TABLE row (spec 4.6; sw-ink.js "chrome (§4.1), go-to (§4.5), the panel (§4.6)")
const ROWS = {
  '--sw-gold': 'gold', '--sw-title': 'title', '--sw-text': 'text', '--sw-text-body': 'textBody',
  '--sw-text-meta': 'textMeta', '--sw-text-muted': 'textMuted', '--sw-overline': 'overline',
  '--sw-control-fill': 'controlFill', '--sw-control-border': 'controlBorder',
  '--sw-control-border-hover': 'controlBorderHover', '--sw-active-fill': 'activeFill',
  '--sw-active-border': 'activeBorder', '--sw-panel': 'panel', '--sw-panel-edge': 'panelEdge',
  '--sw-hairline': 'hairline', '--sw-cite-rule': 'citeRule',
};

describe('the panel\'s ink: app.css --sw-* tokens are sw-ink.js TABLE rows', () => {
  const body = tokenRule();
  it('the tokens live on .sw-root', () => {
    expect(body, 'a .sw-root rule declaring --sw-panel').toBeTruthy();
  });

  it.each(Object.entries(ROWS))('%s is INK.%s', (token, row) => {
    const m = new RegExp(token.replace(/-/g, '\\-') + ':\\s*([^;]+);').exec(body || '');
    expect(m, token + ' declared').toBeTruthy();
    const got = parse(m[1]);
    expect(got, token + ' parses').toBeTruthy();
    expect(got.hex).toBe(INK[row].hex.toUpperCase());
    expect(got.alpha).toBeCloseTo(INK[row].alpha, 3);
  });

  it('the face is the web\'s one face', () => {
    const m = /--sw-font:\s*([^;]+);/.exec(body || '');
    expect(m && m[1].trim()).toBe(FONT);
  });

  it('every --sw-* colour the panel reads is one of those tokens (no stray hex in the panel rules)', () => {
    // the panel's own rules: from the docked-panel rule to the collapse's last line
    const start = BARE.indexOf('.sw-panel, .sw-sheet, .sw-choice, .sw-list {');
    const end = BARE.indexOf('.sw-more-btn svg');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = BARE.slice(start, end);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    const used = new Set([...block.matchAll(/var\((--sw-[a-z-]+)/g)].map((m) => m[1]));
    for (const t of used) {
      if (t === '--sw-panel-w' || t === '--sw-sheet-h') continue; // measured, written by use-panel-layout.js
      expect(Object.keys(ROWS).concat('--sw-font'), t).toContain(t);
    }
  });
});

describe('the docked panel (spec section 3)', () => {
  it('is full height at the right edge, opaque, edged, measured, and slides in over 220 ms', () => {
    const r = rule('.sw-panel, .sw-sheet, .sw-choice, .sw-list');
    expect(r).toBeTruthy();
    expect(r).toMatch(/position:\s*absolute/);
    expect(r).toMatch(/\btop:\s*0;/);
    expect(r).toMatch(/\bright:\s*0;/);
    expect(r).toMatch(/\bbottom:\s*0;/);
    expect(r).toMatch(/width:\s*var\(--sw-panel-w/);
    expect(r).toMatch(/background:\s*var\(--sw-panel\)/);
    expect(r).toMatch(/border-left:\s*1px solid var\(--sw-panel-edge\)/);
    expect(r).toMatch(/animation:\s*sw-panel-in 220ms ease-out/);
    expect(r, 'the panel scrolls by touch (scripture-web-2/8)').toMatch(/touch-action:\s*pan-y/);
  });

  it('does not move under reduced motion', () => {
    expect(BARE).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sw-panel, \.sw-sheet, \.sw-choice, \.sw-list\s*\{\s*animation:\s*none;/);
  });

  it('below 560 px it is a bottom sheet of the measured height', () => {
    const r = rule('.sw-root[data-panel="sheet"] .sw-panel');
    expect(r).toMatch(/top:\s*auto/);
    expect(r).toMatch(/left:\s*0/);
    expect(r).toMatch(/height:\s*var\(--sw-sheet-h/);
    expect(r).toMatch(/border-top:\s*1px solid var\(--sw-panel-edge\)/);
  });

  it('while it is open the key hides and the controls end a gutter left of it', () => {
    expect(rule('.sw-root.sw-panel-open .sw-legend')).toMatch(/display:\s*none/);
    expect(rule('.sw-root.sw-panel-open[data-panel="dock"] .sw-controls')).toMatch(/right:\s*calc\(var\(--sw-panel-w[^)]*\) \+ 24px - 7px\)/);
    expect(rule('.sw-root.sw-compact.sw-panel-open[data-panel="dock"] .sw-controls')).toMatch(/\+ 16px - 7px\)/);
  });

  it('? and hide-UI move to the canvas area\'s bottom-left', () => {
    expect(rule('.sw-root.sw-panel-open[data-panel="dock"] .sw-guide-btn')).toMatch(/left:\s*24px/);
    expect(rule('.sw-root.sw-panel-open[data-panel="dock"] .sw-hide-all')).toMatch(/left:\s*80px/);
  });

  it('collapsed, the menu hides and drops down from the more button', () => {
    expect(rule('.sw-root.sw-collapse .sw-menu')).toMatch(/display:\s*none/);
    const open = rule('.sw-root.sw-collapse.sw-menu-open .sw-menu');
    expect(open).toMatch(/display:\s*flex/);
    expect(open).toMatch(/position:\s*absolute/);
    // the strip itself keeps no box (sw-dark-nobox): the drop-down is the menu's own
    expect(open).toMatch(/background:\s*var\(--sw-panel\)/);
  });

  it('the pinned credit is a 48 px band on PC and last in the scroll on a phone', () => {
    expect(rule('.sw-panel-credit')).toMatch(/min-height:\s*48px/);
    expect(rule('.sw-panel-body > .sw-panel-credit')).toMatch(/min-height:\s*0/);
  });
});
