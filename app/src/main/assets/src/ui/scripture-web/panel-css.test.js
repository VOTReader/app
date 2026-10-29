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
import { INK } from '../../utils/scripture-web/sw-ink.js';
import { WEB_FONT_FAMILY } from '../../utils/scripture-web/label-engine.js';
import { DISTANCE_RAMP, DISTANCE_RAMP_AT } from '../../utils/scripture-web/palette.js';

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
  // the canvas's black, which the root, the loader and the load error paint (Q4, w3 panel step 2)
  '--sw-canvas': 'canvas',
  // the legend's cited tick and prophecy thread, the marks the canvas paints (w3 panel step 2);
  // the thread is keyed in the canvas's gold at legend weight (w4 INK item 5: at the canvas's .35
  // a 1.5 px arc did not read)
  '--sw-cited': 'cited', '--sw-prophecy': 'prophecyKey',
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

  it('the legend\'s prophecy arc is the canvas\'s prophecy gold, at a weight its 1.5 px stroke reads by', () => {
    expect(INK.prophecyKey.hex).toBe(INK.prophecy.hex);
    expect(INK.prophecyKey.alpha).toBeGreaterThanOrEqual(0.85);
    expect(rule('.sw-key-arc')).toMatch(/border:\s*1\.5px solid var\(--sw-prophecy\)/);
  });

  it('the legend\'s ramp is the shader\'s distance ramp, stop for stop, each at its own t (palette DISTANCE_RAMP, DISTANCE_RAMP_AT)', () => {
    const m = /linear-gradient\(to right,\s*([^)]*)\)/.exec(rule('.sw-key-gradient') || '');
    expect(m).not.toBeNull();
    const stops = m[1].split(',').map((x) => x.trim().toUpperCase());
    const want = DISTANCE_RAMP.map((c, i) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
      + ' ' + +(DISTANCE_RAMP_AT[i] * 100).toFixed(3) + '%');
    expect(stops).toEqual(want);
  });

  /* The DOM's face is the canvas's: 'SW Garamond' is the shipped EB Garamond file the label
     engine registers itself. 'EB Garamond' by name is the reading-font @font-face index.html
     switches off for the classic font style, so on default settings the panel, the title and
     the go-to rendered in the phone's Noto Serif beside canvas labels in Garamond (w4 device
     check, CSS.getPlatformFontsForNode on the S22). */
  it('the face is the web\'s one face: the DOM asks for the canvas\'s family', () => {
    const m = /--sw-font:\s*([^;]+);/.exec(body || '');
    expect(m && m[1].trim()).toBe(WEB_FONT_FAMILY);
  });

  it('the go-to box, its field and its chips are in the web\'s face, not the reading font', () => {
    for (const sel of ['.sw-goto', '.sw-goto-input', '.sw-goto-chip, .sw-goto-edge']) {
      const r = rule(sel);
      expect(r, sel).toBeTruthy();
      expect(r, sel).toMatch(/font-family:\s*var\(--sw-font\)/);
    }
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
      if (t === '--sw-ts') continue; // not a colour: the panel's Text Size multiplier (w4, 'panel density' below)
      if (t === '--sw-scrolled') continue; // not a colour: how far the band has come in, written by web-panel.jsx
      if (t === '--sw-chrome-top' || t === '--sw-topbar-floor') continue; // not colours: the header's floor, which the go-to's edge chips keep under over a sheet
      if (/^--sw-safe-(top|right|bottom|left)$/.test(t)) continue; // not a colour: the glass's insets by the frame's edges (sw-rotated-insets.test.js)
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

  // dead-control hunt (2026-10-22): turned, the reader's up and down is the glass's width
  it('turned (.sw-rotated), the panel lets a finger pan either way, so it scrolls along the reader\'s up and down', () => {
    const r = rule('.sw-root.sw-rotated .sw-panel, .sw-root.sw-rotated .sw-panel-body');
    expect(r).not.toBeNull();
    expect(r).toMatch(/touch-action:\s*pan-x pan-y/);
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

  /* w4 integration (hub: the CC-BY credit stays on screen, a licence obligation; ink F8). On a
     phone the panel's own credit is last in its scroll, below the fold, and the key hides, so no
     credit showed with a panel open. The legend keeps its tail there, the credit alone, at the
     canvas area's bottom-right, clear of ? and hide-UI at its bottom-left. */
  it('on a phone with the panel open, the legend keeps its CC-BY tail at the canvas area\'s foot', () => {
    const keep = rule('.sw-root.sw-compact.sw-panel-open[data-panel="dock"] .sw-legend');
    expect(keep).toMatch(/display:\s*block/);
    expect(keep).toMatch(/right:\s*calc\(var\(--sw-panel-w[^)]*\) \+ 16px\)/);
    expect(rule('.sw-root.sw-compact.sw-panel-open[data-panel="dock"] .sw-legend-line > :not(.sw-credit)')).toMatch(/display:\s*none/);
    // PC pins the panel's own credit at its foot: the key and its tail both hide there
    expect(rule('.sw-root.sw-panel-open .sw-legend')).toMatch(/display:\s*none/);
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

  // Corbin, 2026-10-29: one small credit, the legend's; the panel's band is gone
  it('has no credit band of its own', () => {
    expect(rule('.sw-panel-credit')).toBeNull();
    expect(BARE).not.toMatch(/\.sw-panel-credit\b/);
  });
});

describe('what the w3 screenshots caught (PC 1600x900, phone 891x411)', () => {
  it('a row\'s reference never breaks inside itself; its tag drops under it when the two do not fit', () => {
    // the phone shot: "Genesis / 3:15" beside "57 votes", the reference broken at its space by the tag
    expect(rule('.sw-row-ref')).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.sw-row-ref')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.sw-row-top')).toMatch(/flex-wrap:\s*wrap/);
  });

  /* w4 review: the loader's Back is the compact topbar's 40 px; the error page (no .sw-compact
     until w4) drew its Back at 44, so Back grew when a load failed (sw-states.test.jsx). */
  it('on a phone the error page\'s Back is the topbar\'s compact 40 px, in the topbar\'s own rule', () => {
    const round = /([^{}]*\.sw-fallback\.sw-compact \.sw-fallback-back[^{}]*)\{([^}]*)\}/.exec(BARE);
    expect(round, 'a compact rule for the error page\'s Back').toBeTruthy();
    expect(round[1]).toMatch(/\.sw-root\.sw-compact :is\(\.sw-topbar \.sw-btn-icon/);
    expect(round[2]).toMatch(/width:\s*40px/);
    expect(round[2]).toMatch(/height:\s*40px/);
  });

  it('the close X is filled with the panel, so the text that scrolls under it never shows through', () => {
    expect(rule('.sw-sheet-close')).toMatch(/background:\s*var\(--sw-panel\)/);
  });

  /* w4 review (s04b phone): the X's own box hid the top of the Cited head's chevron and left a
     sliver showing under it. Scrolled, a full-width band lies under the X (web-panel.jsx sets
     data-scrolled), so what scrolls up passes under one edge the width of the panel. */
  it('scrolled, a full-width band under the close X: nothing is left half-hidden beside it', () => {
    const band = rule('.sw-panel[data-scrolled]::before');
    expect(band, 'the band').toBeTruthy();
    expect(band).toMatch(/position:\s*absolute/);
    expect(band).toMatch(/left:\s*0/);
    expect(band).toMatch(/right:\s*0/);
    expect(band).toMatch(/var\(--sw-panel\)/);
    expect(band).toMatch(/pointer-events:\s*none/);
    const z = (body) => Number(/z-index:\s*(\d+)/.exec(body)[1]);
    expect(z(rule('.sw-sheet-close'))).toBeGreaterThan(z(band));
    // it reaches the X's foot: PC top 10 + 44, compact top 4 + 44
    const h = (body) => Number(/height:\s*(\d+)px/.exec(body)[1]);
    expect(h(band)).toBeGreaterThanOrEqual(54);
    expect(h(rule('.sw-root.sw-compact .sw-panel[data-scrolled]::before'))).toBeGreaterThanOrEqual(48);
  });

  /* w4 review round 2 (major): whole at 2 px of scroll, the band hid the trail a 3 px nudge had
     barely moved, and a control the keyboard reached could sit hidden under it (WCAG 2.4.11). The
     band takes its opacity from the scroll (web-panel.jsx --sw-scrolled), and the body's scroll
     padding keeps the band's height clear, so a focused control scrolls out from under it. */
  it('the band comes in with the scroll, and a control the keyboard reaches scrolls clear of it', () => {
    expect(rule('.sw-panel[data-scrolled]::before')).toMatch(/opacity:\s*var\(--sw-scrolled\b/);
    const h = (body) => Number(/height:\s*(\d+)px/.exec(body)[1]);
    const pad = (body) => Number((/scroll-padding-top:\s*(\d+)px/.exec(body || '') || [])[1]);
    expect(pad(rule('.sw-panel-body')), 'PC').toBeGreaterThanOrEqual(h(rule('.sw-panel[data-scrolled]::before')));
    expect(pad(rule('.sw-root.sw-compact .sw-panel-body')), 'compact')
      .toBeGreaterThanOrEqual(h(rule('.sw-root.sw-compact .sw-panel[data-scrolled]::before')));
  });

  /* A META LINE BREAKS ONLY BETWEEN ITS ITEMS AND LEAVES NO "·" HANGING (w3 review round 2, w4).
     The phone verse shot read "48 connections · cited in the Volumes 5 / times"; keeping each item
     whole (84da5587c) then left "48 connections ·" / "cited in the Volumes 5 times". Now each item
     after the first carries its separator in a padding at its head, the row is pulled left by that
     padding, and the line clips it: whatever item starts a line, its dot is in the clipped strip.
     (This rewrites the w3 pin on `.sw-panel-meta > span { nowrap }` to its intent; the geometry
     itself is measured headlessly in the w4 shots, every dot with words on both sides.) */
  it('a meta line breaks only between its items, and a wrap leaves no dangling dot', () => {
    const dots = rule('.sw-dots');
    expect(dots).toMatch(/display:\s*flex/);
    expect(dots).toMatch(/flex-wrap:\s*wrap/);
    const pull = /margin-left:\s*-([\d.]+em)/.exec(dots);
    expect(pull, 'the row is pulled left by the separator’s width').toBeTruthy();
    const item = rule('.sw-dot-item');
    expect(item).toMatch(/white-space:\s*nowrap/);
    expect(item).toMatch(/position:\s*relative/);
    expect((/padding-left:\s*([\d.]+em)/.exec(item) || [])[1], 'the item’s head is that wide').toBe(pull[1]);
    const sep = rule('.sw-dot-sep');
    expect(sep).toMatch(/position:\s*absolute/);
    expect(sep).toMatch(/left:\s*0/);
    expect((/(?:^|[;\s])width:\s*([\d.]+em)/.exec(sep) || [])[1], 'the dot sits in that head').toBe(pull[1]);
    // a long item (a sentence) still wraps inside itself
    expect(rule('.sw-dot-item.is-long')).toMatch(/white-space:\s*normal/);
    // every line that holds one clips the strip the dots are pulled into
    expect(rule('.sw-panel-meta, .sw-cite-source, .sw-sec-title, .sw-follow-label')).toMatch(/overflow:\s*hidden/);
  });

  it('"‹ Back to …" keeps a space between the chevron and its words', () => {
    // the PC shot: "‹Back to Isaiah 7:14", the span's trailing space trimmed by the inline-flex
    expect(rule('.sw-back-link')).toMatch(/gap:\s*\d+px/);
  });
});

/* PANEL DENSITY (w4, r2-02 and r2-06). The w3 panel was set in rem, and the root grows on a wide
   desktop (125 % at 1600 px, for the reading column), so the 1600x900 panel ran at 1.25x the
   spec: verse text 25 px at 1.5, a 37.5 px title, and "More from" at 1531 px, 631 below the fold.
   On the phone the Cited heading sat at 616 of 411. The panel's type is now the token's px times
   the reader's own Text Size (--font-scale), the same size at every window width, leading
   tightened, and its links 32 px to see and 44 to hit (the rows' rule). The geometry (Cited
   peeks on the phone, More from begins on the first PC screen) is measured headlessly in the w4
   shots; these pin the rules that produce it. */
describe('panel density (w4)', () => {
  const start = BARE.indexOf('.sw-panel, .sw-sheet, .sw-choice, .sw-list {');
  const end = BARE.indexOf('.sw-root.sw-panel-open .sw-legend');
  const BLOCK = BARE.slice(start, end);
  const rules = () => {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(BLOCK))) out.push({ sel: m[1].trim(), body: m[2] });
    return out;
  };
  const px = (body) => {
    const m = /font-size:\s*calc\(var\(--fsc-(\d+)\)\s*\*\s*var\(--sw-ts\)\)/.exec(body);
    return m ? Number(m[1]) : null;
  };

  it('CONTROL: the block is found', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it('every size is a token\'s px times the reader\'s Text Size, so a wide window does not grow it', () => {
    expect(rule('.sw-panel, .sw-sheet, .sw-choice, .sw-list')).toMatch(/--sw-ts:\s*var\(--font-scale,\s*1\)/);
    const off = rules().filter((r) => /font-size:/.test(r.body) && px(r.body) === null).map((r) => r.sel);
    expect(off, 'a font-size that is not calc(var(--fsc-N) * var(--sw-ts))').toEqual([]);
  });

  it('the title stays the largest line, on PC and compact', () => {
    const all = rules().filter((r) => px(r.body) !== null);
    const pc = all.filter((r) => !/sw-compact/.test(r.sel));
    const compact = all.filter((r) => /sw-compact/.test(r.sel));
    const title = (list) => px(list.find((r) => /\.sw-panel-title/.test(r.sel)).body);
    for (const [name, list] of [['PC', pc], ['compact', compact]]) {
      const t = title(list);
      const others = list.filter((r) => !/\.sw-panel-title/.test(r.sel)).map((r) => px(r.body));
      expect(Math.max(...others), name).toBeLessThan(t);
    }
  });

  it('the verse text: 18 at 1.45 on PC, 16 at 1.4 compact (the scale has no 17)', () => {
    expect(px(rule('.sw-verse-text'))).toBe(18);
    expect(rule('.sw-verse-text')).toMatch(/line-height:\s*1\.45/);
    const c = rules().find((r) => /sw-compact/.test(r.sel) && /\.sw-verse-text/.test(r.sel));
    expect(px(c.body)).toBe(16);
    expect(rules().some((r) => /sw-compact/.test(r.sel) && /\.sw-verse-text/.test(r.sel) && /line-height:\s*1\.4\b/.test(r.body))).toBe(true);
  });

  it('a link is 32 px to see and 44 to hit', () => {
    const link = rule('.sw-link');
    expect(link).toMatch(/min-height:\s*32px/);
    expect(link).toMatch(/position:\s*relative/);
    const hit = rule('.sw-link::after');
    expect(hit).toMatch(/top:\s*-6px/);
    expect(hit).toMatch(/bottom:\s*-6px/);
    // links that wrap to a second row keep their targets apart
    expect(rule('.sw-links')).toMatch(/gap:\s*12px 20px/);
  });

  /* w4 review: one row read three ways, "Open letter ›" gold, "Verses it cites ›" quiet grey and
     "more" grey and underlined. r2-02 shows a plain link; "more" is the row's quiet link now. */
  it('a quote\'s "more" is never underlined at rest: it is a quiet link, underlined on hover', () => {
    const underlined = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(BARE))) {
      if (/\.sw-quote-more(?![\w-])/.test(m[1]) && !/:hover/.test(m[1]) && /text-decoration:\s*underline/.test(m[2])) underlined.push(m[1].trim());
    }
    expect(underlined).toEqual([]);
    expect(rule('.sw-link:hover')).toMatch(/text-decoration:\s*underline/);
    expect(rule('.sw-link-quiet')).toMatch(/color:\s*var\(--sw-text-meta\)/);
  });

  it('a citation’s quote clamps at two lines, as r2-02 shows it', () => {
    expect(rule('.sw-cite-quote.is-clamped')).toMatch(/-webkit-line-clamp:\s*2/);
  });

  it('each end of an "A ↔ B" title is one box, so the title breaks at the arrow', () => {
    expect(rule('.sw-title-end')).toMatch(/display:\s*inline-block/);
  });

  it('compact, the trail is a 32 px row (its Back 44 to hit) and stands where the overline was', () => {
    const crumbs = rule('.sw-root.sw-compact .sw-crumbs');
    expect(crumbs).toMatch(/min-height:\s*32px/);
    const back = rule('.sw-root.sw-compact .sw-crumbs-back');
    expect(back).toMatch(/min-height:\s*32px/);
    expect(back).toMatch(/position:\s*relative/);
    expect(rule('.sw-root.sw-compact .sw-crumbs-back::after')).toMatch(/top:\s*-6px/);
    // the trail names where the reader is; the title under it names the connection
    expect(rule('.sw-root.sw-compact .sw-crumbs ~ .sw-panel-content .sw-panel-over')).toMatch(/display:\s*none/);
  });
});
