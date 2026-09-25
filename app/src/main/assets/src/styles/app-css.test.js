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

describe('app.css — the update toast\'s tap (utils/update-toast.js showListeningToast)', () => {
  it('.vot-toast is not a target; .vot-toast-action is — the "Tap to continue listening." toast carries the second class', () => {
    // The first `.vot-toast {` in the file is the base rule (L35); the second is a theme override.
    expect(ruleBlock(CSS, '.vot-toast {')).toContain('pointer-events: none');
    expect(ruleBlock(CSS, '.vot-toast-action {')).toContain('pointer-events:auto');
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
  it('the "New here?" strip\'s type stops growing, and its height is its words (no cap of its own)', () => {
    // The strip's own rule, not the `.tour-card, .tour-prompt` block it shares with the tour card.
    // Until 2026-09-12 this pinned `max-height: 33vh` here. Journey F1.1 measured what that cap
    // did: the strip scrolled INSIDE itself with no scrollbar on touch and "Don't show this again"
    // sat off the frame — on every landscape phone at any text size (194 px of words in a 117 px
    // box at 800x360) and on a portrait phone at Text Size 3 (298 in 262). The type caps below are
    // what bound the words now; the Home scroller reserves the strip's measured height; and
    // tools/e2e-tour.mjs (stripGeometry) pins the geometry that a rule's presence cannot. What a
    // cap-free strip costs is measured there too: 274 / 290 / 356 px of 800 at Text Size 1 / 1.8 / 3.
    const own = ruleBlock(CSS, '\n      .tour-prompt {');
    expect(own, 'the strip has a rule of its own').toBeTruthy();
    expect(own, 'CONTROL: the extractor found the strip\'s own rule').toMatch(/z-index:\s*310/);
    expect(own).not.toMatch(/max-height/);
    // Each selector's OWN rule (the title and text also appear in comma lists shared with the tour
    // card, which keep growing: the card is the only way out of the tour and must stay readable).
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const sel of ['\\.tour-prompt-title', '\\.tour-prompt-text', '\\.tour-prompt \\.tour-btn']) {
      expect(bare, sel).toMatch(new RegExp('[\\n\\r]\\s*' + sel + ' \\{[^}]*font-size:\\s*min\\(var\\(--fs-\\d+\\),\\s*\\d+px\\)'));
    }
  });
  /* THE TOUR CARD'S OWN LINES (the Tour Reviewer, 2026-09-13, five measured defects on 5fc80c69): the
     card's type had no caps (the strip's were added 09-12), so at Text Size 3 on a 360x800 phone the
     Listen card showed 4 of its 15 lines; its button row had no wrap and no font cap, so Next sat 13 px
     past the card at 1.8 on a 360 and at 3 the welcome card could not be started; in landscape the
     card kept its 520 px width over 800 and cut the promise; and the never-link grew to 48 px. Rules
     as text here — tools/e2e-tour.mjs measures the geometry these cannot (every button's box inside
     the card and the frame, at 1.8 and 3, portrait and landscape). */
  it('the tour card\'s eyebrow, title, text, tip, buttons and never-link stop growing at a px ceiling', () => {
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const capped = (sel, token) => new RegExp('[\\n\\r]\\s*' + sel + '[^{]*\\{[^}]*font-size:\\s*min\\(var\\(--' + token + '\\),\\s*\\d+px\\)');
    expect(bare).toMatch(capped('\\.tour-eyebrow', 'fs-11'));
    expect(bare).toMatch(capped('\\.tour-title, \\.tour-prompt-title', 'fs-20'));
    expect(bare).toMatch(capped('\\.tour-text, \\.tour-prompt-text', 'fs-18'));
    expect(bare).toMatch(capped('\\.tour-tip', 'fs-16'));
    expect(bare).toMatch(capped('\\.tour-card \\.tour-btn', 'fs-14'));
    expect(bare).toMatch(capped('\\.tour-never', 'fs-16'));
    // CONTROL: the matcher sees a cap that is there and not one that is not.
    expect(bare).toMatch(capped('\\.tour-prompt \\.tour-btn', 'fs-14'));
    expect(bare).not.toMatch(capped('\\.tour-wait', 'fs-16'));
  });
  it('the tour card\'s button row wraps between whole buttons, and the card takes the width a short frame has', () => {
    const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const row = ruleBlock(bare, '\n      .tour-card .tour-row {');
    const btn = ruleBlock(bare, '\n      .tour-card .tour-btn {');
    expect(row, 'a .tour-card .tour-row rule of its own').toBeTruthy();
    expect(btn, 'a .tour-card .tour-btn rule of its own').toBeTruthy();
    expect(row).toMatch(/flex-wrap:\s*wrap/);
    expect(btn).toMatch(/white-space:\s*nowrap/);
    const short = bare.match(/@media \(max-height: 480px\) \{\s*\.tour-card \{([^}]*)\}/);
    expect(short, 'a max-height: 480px rule for .tour-card').toBeTruthy();
    expect(short[1]).toMatch(/max-width:\s*calc\(100vw - 24px\)/);
    /* And the card is COMPACT there (measured 2026-09-13, 800x360 at Text Size 1): the width alone left
       every docked card at its 160 px floor with lines hidden, because ~110 of those px are chrome —
       paddings, the eyebrow's own line, margins, the row. The eyebrow shares the title's line, the
       gaps halve, the buttons keep 44 px. The media block is read whole, braces counted. */
    const at = bare.indexOf('@media (max-height: 480px) {');
    let depth = 0, end = at;
    for (let i = at; i < bare.length; i++) { if (bare[i] === '{') depth++; else if (bare[i] === '}') { depth--; if (depth === 0) { end = i; break; } } }
    const block = bare.slice(at, end);
    expect(block).toMatch(/\.tour-card \.tour-eyebrow \{[^}]*display:\s*inline\b/);
    expect(block).toMatch(/\.tour-card \.tour-title \{[^}]*display:\s*inline\b/);
    expect(block).toMatch(/\.tour-card \.tour-btn \{[^}]*min-height:\s*44px/);
    expect(block).not.toMatch(/\.tour-prompt/);                       // the strip keeps its own shape
  });
  /* THE PLAYER BAR'S CHROME IS PINNED IN PX (measured 2026-09-13, probe-bar3x.mjs: at Text Size 3 on a
     320x640 phone the bar's 0.5rem gap read 24 px and its 0.6rem side padding 28.8, so 44 + 40 + 40 + 40
     of buttons, four gaps and two paddings came to 318 of the bar's 304 px and `.audio-bar-main` — the
     title, the summary button the tour's player stop rings, the seek — measured 0 px wide). Type scales;
     chrome is pinned, as the rest of the app's chrome has been since the Text Size control (06-03). */
  it('the player bar\'s gap and padding grow with Text Size only up to a px ceiling', () => {
    const bar = ruleBlock(CSS, '\n      .audio-bar {');
    expect(bar, 'the .audio-bar rule').toBeTruthy();
    expect(bar).toMatch(/gap:\s*min\(0\.5rem,\s*\d+px\)/);
    expect(bar).toMatch(/padding:\s*min\(0\.5rem,\s*\d+px\)\s+min\(0\.6rem,\s*\d+px\)/);
    // CONTROL: the matcher sees a bare rem that is there.
    expect(bar).not.toMatch(/gap:\s*0\.5rem;/);
  });
  it('the hero pads in rem up to a px ceiling, never past it', () => {
    const hero = ruleBlock(CSS, '.hero {');
    // Sides too (2026-09-22): 1.8rem, capped at the phone size (29 px, or 7vw
    // where that is wider) — 86 px a side at Text Size 3 left a 187 px title.
    expect(hero).toMatch(/padding:\s*min\(5\.5rem,\s*\d+px\)\s+min\(1\.8rem,\s*max\(\d+px,\s*\d+vw\)\)\s+min\(4rem,\s*\d+px\)/);
  });
  it('the reading column pads in rem up to the phone size, never past it', () => {
    const wrap = ruleBlock(CSS, '.page-wrapper {');
    expect(wrap).toMatch(/padding:\s*2rem\s+min\(1\.5rem,\s*max\(24px,\s*7vw\)\)\s+6rem/);
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

/* HIT AREA IS NOT PAINT (design-perf, 2026-09-04 install-guide read). The
   Settings ⓘ button kept its 44 px touch target by painting a 44 px bordered
   square, as tall as the row and taller than the 26 px Export button beside
   it. The target stays 44 px; the paint is a ring drawn inside it. */
describe('app.css — the Settings ⓘ button paints a ring smaller than its hit area', () => {
  const block = ruleBlock(CSS, '.settings-info-btn {');
  it('keeps the 44 px touch target', () => {
    expect(block).toMatch(/width:\s*44px/);
    expect(block).toMatch(/height:\s*44px/);
  });
  it('paints no box border; the visible ring is a gradient inside the cell', () => {
    expect(block).toMatch(/border:\s*0\b/);
    expect(block).not.toMatch(/border:\s*1px/);
    expect(block).toMatch(/radial-gradient\(/);
  });
  it('the pressed state paints the same ring, filled', () => {
    const open = ruleBlock(CSS, '.settings-info-btn[aria-expanded="true"]');
    expect(open).toMatch(/radial-gradient\(/);
    expect(open).not.toMatch(/border-color/);
  });
});

/* SELECTION IN A GOLD-ON-BLACK APP (design-perf, cut 6 read). Native text
   selection painted in Chrome's blue in the picker (a literal
   rgba(31,121,165)) and in whatever the engine chose everywhere else. One
   app-wide ::selection in the gold family, per theme; no blue literal left. */
describe('app.css — ::selection is gold in both themes, app-wide', () => {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  it('one app-wide rule per theme, in the gold family', () => {
    // The dark gold is the calmer #d6b35f (214,179,95) since 2026-09-25; the selection tint follows it.
    expect(bare).toMatch(/\n\s*::selection\s*\{[^}]*rgba\(214,\s*179,\s*95,/);
    expect(bare).toMatch(/body\.light ::selection\s*\{[^}]*rgba\(122,\s*92,\s*16,/);
  });
  it('the picker no longer carries its own blue ::selection (the link-blue chips beside it are a different family and stay)', () => {
    const selectionBlocks = [...bare.matchAll(/[^{}]*::selection[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(selectionBlocks.length).toBe(2);
    for (const b of selectionBlocks) expect(b).not.toMatch(/31,\s*121,\s*165|64,\s*153,\s*198/);
    expect(bare).not.toMatch(/\.picker-[a-z-]+ ::selection/);
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

/* The My Web empty-state notice, on the frame a phone reader actually uses.
   ─────────────────────────────────────────────────────────────────────
   ScriptureWebScreen locks landscape on a coarse pointer, so the reader's
   frame is 800x360 CSS, not portrait — and .sw-narrow (clientWidth <= 560) is
   ABSENT there, so the wide control strip is in play. design-perf measured the
   panel at top: 42 % landing under .sw-controls, with the 44 px Dismiss button
   overlapping the strip by 44x40 and the zoom group by 16x34. The notice was
   drawn on top of the controls, so the buttons under it could not be pressed.

   jsdom computes no layout, so the rect gate is design-perf's (Dismiss
   intersects no control rect; every .sw-controls button's centre still
   resolves to itself while the notice is up). What is pinned HERE is the rule
   that produces it, and that the portrait placement it does not apply to is
   left alone. */
describe('app.css — the My Web notice clears the control strip', () => {
  const pct = (block, prop) => {
    const m = new RegExp(prop + '\\s*:\\s*([^;]+);').exec(block || '');
    if (!m) return null;
    const p = /(\d+(?:\.\d+)?)\s*%/.exec(m[1]);
    return p ? parseFloat(p[1]) : null;
  };

  it('the wide layout gives the notice its own vertical placement', () => {
    const wide = ruleBlock(CSS, '.sw-root:not(.sw-narrow) .sw-empty');
    expect(wide, 'no wide-layout rule for .sw-empty — the panel still sits at the base 42 % '
      + 'on the 360 px-tall landscape frame, under .sw-controls').toBeTruthy();
    expect(pct(wide, 'top'), 'the wide rule sets no top').not.toBeNull();
  });

  it('moves it DOWN, past the strip, rather than merely restating the base', () => {
    // Derived, not restated: a rule that repeats 42 % would satisfy the case
    // above and change nothing on the frame that is broken.
    const base = pct(ruleBlock(CSS, '.sw-empty'), 'top');
    const wide = pct(ruleBlock(CSS, '.sw-root:not(.sw-narrow) .sw-empty'), 'top');
    expect(base, 'the base .sw-empty top went missing').toBe(42);
    expect(wide).toBeGreaterThan(base);
    // 360 CSS px tall frame: the controls end at 117 and the panel is ~132 tall,
    // so its centre has to sit at 183 or lower for the top edge to clear them.
    expect((wide / 100) * 360, 'centre on the 360 px frame').toBeGreaterThanOrEqual(183);
  });

  it('the px floor clears the strip on the 320 px-tall landscape frame', () => {
    // The case above reads the PERCENTAGE, so it cannot see the floor at all --
    // and the floor is what decides on a short frame. 568x320 is iPhone SE /
    // iPhone 8 landscape, EIGHT px above the .sw-narrow breakpoint
    // (clientWidth <= 560), so this wide rule fires; at 320 tall the 58 % is
    // 185.6 and the floor wins. At 190px the Verifier measured the Dismiss
    // button's top edge at 116 against .sw-controls running to 117 -- a 44x1
    // overlap on a shipping device. centre - half the ~132 px panel - the close
    // button's own -8px offset must clear 117, so the floor has to be >= 191.
    const CONTROLS_BOTTOM = 117;   // .sw-controls, measured on the locked frame
    const HALF_PANEL = 66;         // ~132 px tall, translate(-50%, -50%)
    const CLOSE_OFFSET = 8;        // .sw-empty-close { top: -8px }
    const wide = ruleBlock(CSS, '.sw-root:not(.sw-narrow) .sw-empty');
    const floor = /max\([^)]*?(\d+(?:\.\d+)?)px\s*\)/.exec(wide || '');
    expect(floor, 'the wide rule has no px floor -- 58 % alone is 185.6 on a 320 px '
      + 'frame and the notice slides back under the strip').toBeTruthy();
    expect(parseFloat(floor[1]) - HALF_PANEL - CLOSE_OFFSET,
      'the Dismiss button still overlaps .sw-controls on the 320 px frame')
      .toBeGreaterThanOrEqual(CONTROLS_BOTTOM);
  });

  it('leaves the portrait placement alone', () => {
    // design-perf re-measured every portrait row as green at 42 %. This fix is
    // the wide layout's, and a fix that moved both would be changing a frame
    // that was already right.
    expect(pct(ruleBlock(CSS, '.sw-empty'), 'top')).toBe(42);
  });

  it('the Dismiss control is still the 44 px target, wherever the panel sits', () => {
    // The control that says the placement fix did not quietly resize it.
    const close = ruleBlock(CSS, '.sw-empty-close');
    expect(close).toContain('width: 44px');
    expect(close).toContain('height: 44px');
  });
});

/* ── sw-chrome-fit (design-perf, 2026-09-10) ──────────────────────────────
   Corbin's Pixel, one minute after the trim went live: the right-anchored pill
   cluster, the CC-BY credit and the hide-all button cut off by the glass in the
   CSS-rotated landscape. `.sw-root.sw-rotated { width: 100vh }` sizes the
   rotated root's long side from the LARGE viewport on mobile Chrome (URL bar
   hidden), taller than the visible one while the bar shows. Headless Chrome
   has no browser controls, so the cut cannot be produced by a walk here
   (tools/e2e-sw-chrome.mjs says why); what is pinned is the LAW: the dynamic
   unit sizes the root, with the old unit on the line before it as the
   fallback for engines without it. */
describe('app.css — the rotated Scripture Web root is sized by the dynamic viewport', () => {
  const block = () => ruleBlock(CSS, '.sw-root.sw-rotated');
  it('the long side is 100dvh, declared after a 100vh fallback', () => {
    const b = block();
    expect(b, 'no .sw-root.sw-rotated rule').toBeTruthy();
    const widths = [...b.matchAll(/width\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(widths, 'the rotated root has no 100dvh width; the URL bar cuts the cluster off the glass').toContain('100dvh');
    expect(widths.indexOf('100vh'), 'the 100vh fallback must come BEFORE 100dvh or it overrides it').toBeLessThan(widths.indexOf('100dvh'));
  });
  it('the short side is 100dvw, declared after a 100vw fallback', () => {
    const heights = [...block().matchAll(/height\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(heights).toContain('100dvw');
    expect(heights.indexOf('100vw')).toBeLessThan(heights.indexOf('100dvw'));
  });
});

describe('app.css — one pill grammar in the Scripture Web strip', () => {
  it('the density select paints like every other pill, not a solid box', () => {
    // The phone showed FAMOUS in solid --bg3 beside see-through pills. One
    // resting fill for .sw-btn, .sw-seg and .sw-select; the active fill is
    // .is-on's alone.
    const btn = /background\s*:\s*([^;]+);/.exec(ruleBlock(CSS, '.sw-btn {') || '');
    const sel = /background\s*:\s*([^;]+);/.exec(ruleBlock(CSS, '.sw-select {') || '');
    const seg = /background\s*:\s*([^;]+);/.exec(ruleBlock(CSS, '.sw-seg {') || '');
    expect(btn && sel && seg, 'a pill rule has no background').toBeTruthy();
    expect(sel[1].trim()).toBe(btn[1].trim());
    expect(seg[1].trim()).toBe(btn[1].trim());
  });

  it('the seg\'s un-selected option is inked like every other resting pill', () => {
    // The Verifier's phone-pixel pass on sw-chrome-fit: the "Which web" seg's
    // resting option was --cream-muted (204,196,180) while its siblings are
    // --cream-dim; under the worst ground (the canvas's own cream labels panning
    // under the 50 % scrim, ground ~121,118,114) that is 2.58:1, below the 3:1
    // label bar, where --cream-dim reads 3.83:1. One resting ink for the strip;
    // the selected option keeps --gold-bright on --gold-faint.
    const btn = /(?:^|\s)color\s*:\s*([^;]+);/.exec(ruleBlock(CSS, '.sw-btn {') || '');
    const opt = /(?:^|\s)color\s*:\s*([^;]+);/.exec(ruleBlock(CSS, '.sw-seg-btn {') || '');
    expect(btn && opt, 'a pill rule has no color').toBeTruthy();
    expect(opt[1].trim()).toBe(btn[1].trim());
  });
});

/* Item 7b (2026-09-24), Codex's critique of the built LISTEN FROM HERE row
   (lanes/readalong/out/mockups/listen-from-here/critique.md): a daily listener's
   finger target and a primary action's weight, in both themes. */
describe('app.css — the selection toolbar\'s Listen from here', () => {
  it('takes a full finger (44 px) and reads as the primary action: 12 px semibold label, solid gold edge, 15 px icon', () => {
    const block = ruleBlock(CSS, '.sel-listen-btn {');
    expect(block).toMatch(/min-height:\s*44px/);
    expect(block).toMatch(/font-size:\s*var\(--fs-12\)/);
    expect(block).toMatch(/font-weight:\s*600/);
    expect(block).toMatch(/border:\s*1px solid var\(--gold\)/);
    const icon = ruleBlock(CSS, '.sel-listen-btn svg');
    expect(icon).toMatch(/width:\s*15px/);
    expect(icon).toMatch(/height:\s*15px/);
  });
});

/* Item 7c (2026-09-24): the selection toolbar is SOLID. Its comment always said "Bg is already 0.97 alpha so it
   reads as solid", but a settled 360x800 capture (1.2 s after it rose, lanes/readalong/out/listen-from-look/
   toolbar.png) showed the letter text plainly through it, over the new Listen from here row; the same capture
   with the background forced opaque (toolbar-opaque.png) showed none. */
describe('app.css — the selection toolbar is opaque in both themes', () => {
  it('paints a solid background, dark and light', () => {
    const dark = ruleBlock(CSS, '.sel-toolbar {');
    expect(dark).toMatch(/background:\s*rgb\(38,\s*32,\s*24\)/);
    const light = ruleBlock(CSS, 'body.light .sel-toolbar {');
    expect(light).toMatch(/background:\s*rgb\(232,\s*222,\s*200\)/);
  });
});

/* The live Answers walk (2026-09-24, 360 px, both themes) measured two targets under a finger:
   the A–Z jump letters (36.8 x 44 px) and ExpandableVerse's "Read more" (98 x 12 px), which sits in
   a footnote card whose own tap scrolls away to the bubble. */
describe('app.css — the Answers A–Z letters and the footnote "Read more" are full-finger targets', () => {
  it('each A–Z jump letter is at least 44 x 44 px', () => {
    const block = ruleBlock(CSS, '.answers-az-jump button {');
    expect(block).toMatch(/min-width:\s*max\(44px,/);
    expect(block).toMatch(/min-height:\s*44px/);
  });

  it('"Read more" keeps its 12 px label and gains a 44 px-tall halo (12 + 16 + 16)', () => {
    const toggle = ruleBlock(CSS, '.footnote-verse-toggle {');
    expect(toggle).toMatch(/font-size:\s*var\(--fs-12\)/);
    expect(toggle).toMatch(/line-height:\s*1;/);
    expect(toggle).toMatch(/position:\s*relative/);
    const halo = ruleBlock(CSS, '.footnote-verse-toggle::before {');
    expect(halo).toMatch(/content:\s*''/);
    expect(halo).toMatch(/inset:\s*-16px -4px/);
  });

  it('ExpandableVerse wears that class rather than an inline style the halo cannot reach', () => {
    const src = readFileSync(resolve(SRC_ROOT, 'ui', 'components', 'ExpandableVerse.jsx'), 'utf8');
    expect(src).toContain('className="footnote-verse-toggle"');
    expect(src).not.toMatch(/style=\{\{\s*display:\s*"inline-block"/);
  });
});

/* The compact top bar (the redesign, 2026-09-25; ui/components/MoreMenu.jsx): the three icons it
   moves into the ⋯ menu leave the bar only under body.compact-topbar, matched the way the per-icon
   toggles match them, and the menu's rows keep a full finger. */
describe('app.css — the compact top bar and its ⋯ menu', () => {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  it('hides exactly Settings, History and the theme switch in the bar, and only in compact mode', () => {
    const m = bare.match(/body\.compact-topbar \.top-nav \.settings-gear-btn,\s*body\.compact-topbar \.top-nav \.nav-search-btn\[title="History"\],\s*body\.compact-topbar \.top-nav \.nav-theme-btn\s*\{\s*display:\s*none;\s*\}/);
    expect(m, 'the three compact-bar hides').toBeTruthy();
    expect(bare).not.toMatch(/body\.compact-topbar [^{]*(nav-bookmark-btn|tabs-nav-btn|\[title="Search"\]|\[title="Home"\])[^{]*\{\s*display:\s*none/);
  });
  it('the ⋯ button and every menu row are at least 44 px', () => {
    expect(ruleBlock(CSS, '.nav-more-btn {')).toMatch(/min-width:\s*44px;[^}]*min-height:\s*44px/);
    expect(ruleBlock(CSS, '.more-menu-item {')).toMatch(/min-height:\s*48px/);
    expect(ruleBlock(CSS, '.more-menu-row {')).toMatch(/min-height:\s*52px/);
    expect(ruleBlock(CSS, '.more-menu-seg button, .more-menu-step button {')).toMatch(/min-width:\s*44px;\s*min-height:\s*40px/);
  });
});

/* The label pass (the redesign, 2026-09-25): the most visible letter-spaced capital labels sit at
   the 12 px step or more, with their tracking capped at 0.18em. */
describe('app.css — labels in spaced capitals are 12 px or more', () => {
  const LABELS = [
    '.hni-eyebrow', '.vol-index-eyebrow', '.genre-col-label', '.scriptures-landing .genre-col-label',
    '.volumes-landing .genre-col-label', '.library-eyebrow', '.library-tile-eyebrow', '.audio-library-eyebrow',
    '.audio-library-section-head span', '.milestones-eyebrow', '.select-sheet-eyebrow', '.tabs-overview-eyebrow',
    '.prg-stat-label', '.footnote-list-header', '.related-card-title', '.settings-section-label',
    '.srch-section-label', '.srch-group-header', '.chapter-card-label', '.answers-hit-eyebrow',
    '.section-heading', '.compact-list-header',
  ];
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocksOf = (sel) => {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(bare))) if (m[1].trim().split(/\s+/).join(' ') === sel) out.push(m[2]);
    return out;
  };
  it.each(LABELS)('%s', (sel) => {
    const blocks = blocksOf(sel);
    expect(blocks.length, 'rule present').toBeGreaterThan(0);
    for (const b of blocks) {
      const fs = /font-size:\s*var\(--fs-(\d+)\)/.exec(b);
      if (fs) expect(Number(fs[1])).toBeGreaterThanOrEqual(12);
      const ls = /letter-spacing:\s*([\d.]+)em/.exec(b);
      if (ls) expect(Number(ls[1])).toBeLessThanOrEqual(0.18);
    }
  });
  it('the letter hero eyebrow never drops under 12 px on a phone', () => {
    expect(ruleBlock(CSS, '.hero-eyebrow {')).toMatch(/font-size:\s*clamp\(var\(--fs-12\),/);
  });
});
