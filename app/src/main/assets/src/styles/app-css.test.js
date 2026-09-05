/* app-css.test.js — static contract tests for app.css (Wave-0 UX fixes).
   ─────────────────────────────────────────────────────────────────────
   jsdom doesn't compute styles, so these tests read the stylesheet TEXT
   and assert the rules the UI contract depends on actually exist. The
   flagship case: `.jrn-milestone-toast` lost ALL of its rules when the
   journal injected-stylesheet was dismantled (2db70f5) — the toast became
   an unstyled, never-dismissing div while every JS caller kept working.
   A text-level guard would have caught it at commit time.

   Covers (Wave-0 STYLES batch):
     1. Every showToast({ className }) literal has a rule in app.css
        (plan P1-5 guard) + the milestone toast's own gold top-pill rules
        including a .show state.
     2. .ann-hint-pill coach-mark is click-through (pointer-events:none on
        the container, auto restored on the ✕ close only) and its text is
        not selectable (long-press under the pill must not raise the native
        Copy menu on the pill's own text).
     3. The gold :focus-visible ring reaches the non-button/link
        interactive families (tabs, switches, radios, sliders, combobox
        select triggers) — same token, no new colors.
     4. A standard .sr-only visually-hidden utility exists (the app had
        none; several aria patterns need it). */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');
const SRC_ROOT = resolve(here, '..');

/* Extract the declaration block of the FIRST rule whose selector list
   mentions `selector` (e.g. '.ann-hint-pill'). Comment-stripped so a
   mention inside a /* comment *\/ can't false-positive as a rule. */
function ruleBlock(css, selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Selector may appear inside a comma list; anchor on the literal text,
  // then take everything up to the closing brace of that rule.
  const idx = bare.indexOf(selector);
  if (idx === -1) return null;
  const open = bare.indexOf('{', idx);
  const close = bare.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return bare.slice(open + 1, close);
}

/* Every className string literal passed to showToast({...}) anywhere in
   src/ (multi-class values split to individual classes). Scoped to the
   showToast( call site (window of 400 chars after the call) so unrelated
   `className: 'x'` object literals in renderers don't false-positive. */
function toastClassNames() {
  const found = new Set();
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'vendor') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx)$/.test(name) || /\.test\.(js|jsx)$/.test(name)) continue;
      const src = readFileSync(p, 'utf8');
      const callRe = /\bshowToast\s*\(\s*\{/g;
      let call;
      while ((call = callRe.exec(src))) {
        const window = src.slice(call.index, call.index + 400);
        const m = /className:\s*'([^']+)'/.exec(window);
        if (m) m[1].split(/\s+/).filter(Boolean).forEach((c) => found.add(c));
      }
    }
  })(SRC_ROOT);
  return [...found];
}

describe('app.css — milestone toast (P1-5)', () => {
  it('every showToast className literal has a rule in app.css', () => {
    const missing = toastClassNames().filter((c) => ruleBlock(CSS, '.' + c) === null);
    expect(missing).toEqual([]);
  });
  it('.jrn-milestone-toast is the gold top pill: fixed, themed via vars, hidden by default', () => {
    const block = ruleBlock(CSS, '.jrn-milestone-toast');
    expect(block).not.toBeNull();
    expect(block).toContain('position: fixed');
    expect(block).toContain('top: 80px');
    expect(block).toContain('var(--gold)');
    expect(block).toContain('opacity: 0');
    expect(block).toContain('pointer-events: none');
    expect(block).toContain('transition');
  });
  it('.jrn-milestone-toast.show is the visible state the utility toggles', () => {
    const block = ruleBlock(CSS, '.jrn-milestone-toast.show');
    expect(block).not.toBeNull();
    expect(block).toContain('opacity: 1');
  });
});

describe('app.css — annotation-hint coach-mark (P1-1)', () => {
  it('pill container is click-through and its text is not selectable', () => {
    const block = ruleBlock(CSS, '.ann-hint-pill');
    expect(block).toContain('pointer-events: none');
    expect(block).toContain('user-select: none');
  });
  it('close ✕ restores interactivity (only interactive child)', () => {
    const block = ruleBlock(CSS, '.ann-hint-close');
    expect(block).toContain('pointer-events: auto');
  });
});

describe('app.css — gold :focus-visible ring coverage', () => {
  it.each([
    '[role="tab"]',
    '[role="switch"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="combobox"]',
  ])('%s gets the keyboard-only gold ring', (sel) => {
    const block = ruleBlock(CSS, sel + ':focus-visible');
    expect(block).not.toBeNull();
    expect(block).toContain('outline: 2px solid var(--gold)');
  });
  it('mouse/touch focus on those families stays ring-free', () => {
    const block = ruleBlock(CSS, '[role="tab"]:focus:not(:focus-visible)');
    expect(block).not.toBeNull();
    expect(block).toContain('outline: none');
  });
  it('settings switch projects the ring onto its visible track (the input is 0×0 opacity-0)', () => {
    const block = ruleBlock(CSS, '.settings-toggle input:focus-visible ~ .settings-toggle-track');
    expect(block).not.toBeNull();
    expect(block).toContain('outline: 2px solid var(--gold)');
  });
});

describe('app.css — Scripture Web panel scrolling (scripture-web-2/8)', () => {
  // `.sw-root` is `touch-action: none` (it owns pan/zoom); a panel with
  // real content — the detail sheet, the connection chooser, Nearby's list
  // — needs its OWN touch-action or a finger landing on it pans the canon
  // underneath instead of scrolling the panel.
  it('the detail sheet scrolls by touch instead of the root swallowing the gesture', () => {
    const block = ruleBlock(CSS, '.sw-sheet');
    expect(block).toContain('touch-action: pan-y');
    expect(block).toContain('overscroll-behavior: contain');
  });
  it('the chooser and Nearby list scroll by touch the same way', () => {
    // The literal selector text, not bare '.sw-choice' — the rotated
    // max-height override below also mentions '.sw-choice' and sits
    // earlier in the file, so a loose search would find that block instead.
    const block = ruleBlock(CSS, '.sw-choice, .sw-list');
    expect(block).toContain('touch-action: pan-y');
    expect(block).toContain('overscroll-behavior: contain');
  });
  it('a rotated phone caps panels against the rotated root (100vw tall), not the physical viewport', () => {
    // The base rules cap these in vh (52vh / 46vh / 62vh) against the
    // PHYSICAL viewport height, but `.sw-root.sw-rotated` is `height: 100vw`
    // — so at depth the panel is sized taller than the instrument and
    // overflows before touch-action ever gets a chance to help.
    const sheetBlock = ruleBlock(CSS, '.sw-root.sw-rotated .sw-sheet');
    expect(sheetBlock).not.toBeNull();
    expect(sheetBlock).toContain('max-height: 46vw');
    // .sw-choice and .sw-list share one comma-joined rule (not ruleBlock —
    // the selector list itself, not a declaration, is what's being pinned).
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(bare).toMatch(
      /\.sw-root\.sw-rotated \.sw-choice,\s*\.sw-root\.sw-rotated \.sw-list\s*\{\s*max-height:\s*62vw;\s*\}/);
  });
});

/* WHOLE WORDS AT LARGE TYPE (design-perf, 2026-09-05). At Text Size 180 % the
   Settings summary switches to its large-type layout, a two-column grid whose
   label column had a 6rem minimum: rem scales with the reader's Text Size, so
   the label took 173 px of a 246 px item and the value cell was 68 px wide at
   36 px type. "System Serif" broke twice mid-word (Range line boxes: System 2,
   Serif 2; measured through the real slider, --font-scale 1.8 asserted at the
   site). At large type the pair stacks, the value gets the item's full width,
   and a word breaks only when it cannot fit a line alone (break-word), never
   as the first resort (anywhere). */
describe('app.css — the Settings summary keeps whole words at large type', () => {
  it('large-type summary items stack label over value instead of a rem-sized grid', () => {
    const item = ruleBlock(CSS, '.settings-screen.settings-large-type .settings-summary-item {');
    expect(item).toMatch(/display:\s*block/);
    expect(item).not.toMatch(/grid-template-columns/);
  });
  it('the value breaks a word only as a last resort', () => {
    const dd = ruleBlock(CSS, '.settings-summary dd {');
    expect(dd).toMatch(/overflow-wrap:\s*break-word/);
    expect(dd).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

/* REM-SCALED CHROME MUST NOT SCALE PAST THE SCREEN (design-perf, launch-day live
   read 2026-09-05, measured through the real slider with --font-scale asserted
   at each site). At Text Size 1.8 on a 360x800 phone: the "New here?" strip was
   350 px, 44 % of the screen, its buttons wrapping to three lines (218 px, 27 %
   at 1); the letter hero was 615 px, 77 %, from 5.5rem/4rem padding that grew
   to 158/115 px (294 px, 37 % at 1); and at 1 the Listen pill's hit band was
   its 25 px paint. Three caps, one rule: the strip's type and height, the
   hero's padding, and a 44 px hit band on the pill with the paint unchanged. */
describe('app.css — large-type caps on rem-scaled chrome', () => {
  it('the "New here?" strip is capped at a third of the screen and its type stops growing', () => {
    // The strip's own rule, not the `.tour-card, .tour-prompt` block it shares with the tour card.
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).toMatch(/[\n\r]\s*\.tour-prompt \{[^}]*max-height:\s*33vh/);
    // Each selector's OWN rule (the title and text also appear in comma lists shared with the tour
    // card, which keep growing: the card is the only way out of the tour and must stay readable).
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of ['\\.tour-prompt-title', '\\.tour-prompt-text', '\\.tour-prompt \\.tour-btn']) {
      expect(bare, sel).toMatch(new RegExp('[\\n\\r]\\s*' + sel + ' \\{[^}]*font-size:\\s*min\\(var\\(--fs-\\d+\\),\\s*\\d+px\\)'));
    }
  });
  it('the hero pads in rem up to a px ceiling, never past it', () => {
    const hero = ruleBlock(CSS, '.hero {');
    expect(hero).toMatch(/padding:\s*min\(5\.5rem,\s*\d+px\)\s+1\.8rem\s+min\(4rem,\s*\d+px\)/);
  });
  it('the hero pill owns a 44 px hit band around its paint', () => {
    const pill = ruleBlock(CSS, '.hero-play-pill {');
    expect(pill).toMatch(/position:\s*relative/);
    const band = ruleBlock(CSS, '.hero-play-pill::after {');
    expect(band).toMatch(/content:\s*['"]{2}/);
    expect(band).toMatch(/position:\s*absolute/);
    // Centred on the paint and never narrower than 44 px: inset calc(50% - 22px) top and bottom.
    expect(band).toMatch(/calc\(50% - 22px\)/);
  });
});

/* THE NEXT CARD MUST STAY ON THE SCREEN AT LARGE TYPE (design-perf, launch-day
   live read part 2, 2026-09-05). `.bottom-nav` was `grid-template-columns: 1fr
   1fr`; `1fr` is minmax(auto, 1fr), so the Cinzel caps label's min-content
   pushed the tracks to 197 + 165 px in a 274 px row at Text Size 1.8 and the
   Next card ran 74 px past a 360 px screen behind overflow-x: hidden ("Next
   Lett"), on every letter and chapter. minmax(0, 1fr) lets the track shrink
   below its content and the label wraps instead. */
describe('app.css — bottom-nav cards fit the row at large type', () => {
  it('the two tracks can shrink below their content', () => {
    const nav = ruleBlock(CSS, '.bottom-nav {');
    expect(nav).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  });
  it('the words inside a card wrap rather than running past it (label and title alike)', () => {
    // The card's own rule: `.pager-peek-boundary .bottom-nav-card {` sits earlier in the file.
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const card = (bare.match(/[\n\r]\s*\.bottom-nav-card \{([^}]*)\}/) || [])[1] || '';
    expect(card).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
    expect(card).toMatch(/min-width:\s*0/);
    const label = ruleBlock(CSS, '.bottom-nav-label {');
    expect(label).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });
});

describe('app.css — .sr-only utility', () => {
  it('exists with the standard visually-hidden pattern', () => {
    const block = ruleBlock(CSS, '.sr-only');
    expect(block).not.toBeNull();
    expect(block).toContain('position: absolute');
    expect(block).toContain('width: 1px');
    expect(block).toContain('height: 1px');
    expect(block).toContain('overflow: hidden');
    expect(block).toContain('clip: rect(0, 0, 0, 0)');
    expect(block).toContain('white-space: nowrap');
  });
});
