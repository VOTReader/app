/* app-css.search200-b10.test.js — the stylesheet half of search200 UX batch B10
   (D:/Swarm/lanes/search200/out/ux/mockups/PICKS.md; its numbers win over its pictures).
   ─────────────────────────────────────────────────────────────────────────────
   jsdom computes no styles, so these read app.css TEXT: each rule is found by its exact
   selector (one of a comma list) and the at-rule it sits in, and its declarations are
   checked against the pick's numbers. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/* Every style rule in the sheet: its selectors, its declarations, and the at-rule
   preludes it is nested in ('' at top level). Comments stripped first. */
function parseRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@')) { stack.push(head); continue; }
      const close = src.indexOf('}', i);
      rules.push({ selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: src.slice(i + 1, close), at: stack.join(' ') });
      i = close;
    } else if (c === '}') {
      stack.pop();
      buf = '';
    } else if (c === ';') {
      buf = ''; // a statement at-rule (@import) or a declaration in an at-rule's own body (@font-face)
    } else buf += c;
  }
  return rules;
}
const RULES = parseRules(CSS);

/** The declarations of every rule naming exactly `selector`, inside an at-rule matching `at`. */
function decls(selector, at = '') {
  const out = {};
  for (const r of RULES) {
    if (!r.selectors.includes(selector)) continue;
    if (at ? !r.at.includes(at) : r.at !== '') continue;
    for (const d of r.body.split(';')) {
      const k = d.indexOf(':');
      if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
  }
  return out;
}

describe('B10 item 1 — the mini title band', () => {
  it('hangs from a zero-height sticky anchor at its bottom edge, taking no room', () => {
    const anchor = decls('.mini-title-anchor');
    expect(anchor.position).toBe('sticky');
    expect(anchor.top).toBe('0');
    expect(anchor.height).toBe('0');
    const band = decls('.mini-title');
    expect(band.position).toBe('absolute');
    expect(band.top).toBe('100%');
    expect(band['pointer-events']).toBe('none');
  });

  it('is a solid --bg band with room for a two-line name (70px), closed by a gold hairline, not a solid rule', () => {
    const band = decls('.mini-title');
    expect(band.background).toBe('var(--bg)');
    expect(band['max-height']).toBe('70px');
    expect(band['border-bottom']).toBe('1px solid var(--gold-border)');
    expect(band.padding).toBe('6px 16px');
  });

  /* Studies pass 3 (2026-11-18): the band wears the hero's own type, not the letter-spaced Cinzel capitals it kept
     after the heroes changed; and a long name takes a second line where it used to end in an ellipsis. */
  it('says the eyebrow in the UI sans over the name in the serif, at frozen sizes: the eyebrow one line, the name up to two', () => {
    const eb = decls('.mini-title-eyebrow');
    expect(eb['font-family']).toBe('var(--font-ui)');
    expect(eb['font-size']).toBe('var(--fsc-12)');
    expect(eb['letter-spacing']).toBeUndefined();
    expect(eb.color).toBe('var(--text-2)');
    expect(eb['white-space']).toBe('nowrap');
    expect(eb['text-overflow']).toBe('ellipsis');
    const name = decls('.mini-title-name');
    expect(name['font-family']).toBe('var(--font-serif)');
    expect(name['font-size']).toBe('var(--fsc-16)');
    expect(name.color).toBe('var(--text-1)');
    expect(name['white-space']).toBe('normal');
    expect(name['-webkit-line-clamp']).toBe('2');
  });

  it('shown, it takes the finger itself, so a tap or long-press on it never reaches a link hidden under it', () => {
    // A band that let touches through sent a tap on it to whatever it covered: a "Go to
    // Scripture" card or a footnote marker the reader could not see opened, and a long-press
    // selected hidden text. Shown, it is opaque to the finger too; hidden, it lets all through.
    expect(decls('.mini-title.shown')['pointer-events']).toBe('auto');
    expect(decls('.mini-title')['pointer-events']).toBe('none');
    // and it is chrome, not text: a long-press on it starts no selection of its own
    const band = decls('.mini-title');
    expect(band['user-select']).toBe('none');
    expect(band['-webkit-user-select']).toBe('none');
    expect(band['-webkit-touch-callout']).toBe('none');
  });

  it('shows by a ~150ms fade, and not at all when hidden', () => {
    expect(decls('.mini-title').visibility).toBe('hidden');
    expect(decls('.mini-title').opacity).toBe('0');
    const shown = decls('.mini-title.shown');
    expect(shown.visibility).toBe('visible');
    expect(shown.opacity).toBe('1');
    expect(shown.transition).toMatch(/opacity 0\.15s/);
  });
});

/* "44px" or larger from a min-height declaration; WA3: the --tap token (44px) and the one-line row
   token --row-h-1 (54px) count too, and their values are pinned below. */
const TOKEN_PX = { 'var(--tap)': 44, 'var(--row-h-1)': 54 };
const atLeast44 = (v) => (v in TOKEN_PX ? TOKEN_PX[v] >= 44 : /^\d+px$/.test(v || '') && parseInt(v, 10) >= 44);

describe('B10 item 3 — real 44px search tap targets, paid for by trimmed padding', () => {
  it('the tokens the targets name hold their sizes: --tap 44px, --row-h-1 54px', () => {
    expect(CSS).toMatch(/--tap:\s*44px;/);
    expect(CSS).toMatch(/--row-h-1:\s*54px;/);
  });

  /* WA3: the corpus tabs are a segmented control: each half draws its lit segment inside a transparent
     border (background-clip:padding-box), so the 44px target is bigger than the segment it shows. */
  it('the corpus pills are 44px, rounded, sized by a --ts token, the lit segment inside a transparent border', () => {
    const b = decls('.srch-corpus-btn');
    expect(atLeast44(b['min-height'])).toBe(true);
    expect(b['border-radius']).toBe('var(--r-field)');
    expect(b['font-size']).toBe('var(--ts-control)');
    expect(b.border).toMatch(/^\d+px solid transparent$/);
    expect(b['background-clip']).toBe('padding-box');
  });

  it('the corpus row is the segmented control\'s track, rounded to match', () => {
    const row = decls('.srch-corpus-row');
    expect(row.display).toBe('flex');
    expect(row.background).toBe('var(--surface-1)');
    expect(row['border-radius']).toBe('var(--r-field)');
  });

  it('both halves of the order switch are 44px, fully rounded, the lit half inside a transparent border', () => {
    const s = decls('.srch-sort-btn');
    expect(atLeast44(s['min-height'])).toBe(true);
    expect(s['border-radius']).toBe('var(--r-pill)');
    expect(s.border).toMatch(/^\d+px solid transparent$/);
    expect(s['background-clip']).toBe('padding-box');
    expect(decls('.srch-sort').display).toBe('inline-flex');
    // the old separate order row is gone: the switch sits in the count's head
    expect(decls('.srch-filter-row')).toEqual({});
    expect(atLeast44(decls('.srch-summary-head')['min-height'])).toBe(true);
  });

  it('group headers are one-line rows (54px), the label sized by a --ts token', () => {
    const h = decls('.srch-group-header');
    expect(atLeast44(h['min-height'])).toBe(true);
    expect(h['min-height']).toBe('var(--row-h-1)');
    expect(h['font-size']).toBe('var(--ts-body)');
    expect(h.padding).toBe('0 var(--card-pad)');
  });

  it('the scope chip, the quick chips and Clear are 44px; the recent rows are 54px, their remove button 44x44', () => {
    const scope = decls('.srch-scope-chip');
    expect(atLeast44(scope['min-height'])).toBe(true);
    expect(scope.padding).toBe('0 14px');
    const chip = decls('.srch-quick-chip');
    expect(atLeast44(chip['min-height'])).toBe(true);
    expect(chip['align-items']).toBe('center');
    expect(chip['background-clip']).toBe('padding-box');
    const clear = decls('.srch-clear-all');
    expect(atLeast44(clear['min-height'])).toBe(true);
    expect(atLeast44(clear['min-width'])).toBe(true);
    expect(decls('.srch-recent-go')['min-height']).toBe('var(--row-h-1)');
    const rm = decls('.srch-chip-remove');
    expect([rm.width, rm.height]).toEqual(['var(--tap)', 'var(--tap)']);
    const x = decls('.srch-clear-btn');
    // 48 x 48 (L3, 2026-10-05; e2e:phone T1), overhanging the 44px pill by 2px top and bottom.
    expect([x.width, x.height]).toEqual(['48px', '48px']);
    for (const sel of ['.srch-row', '.srch-suggest-item', '.srch-songs-row']) expect(decls(sel)['min-height'], sel).toBe('var(--row-h-1)');
  });
});

describe('B10 item 2 — a reprint folds under its original as "Also in N places"', () => {
  /* WA3: both rows read in the UI face at the meta size, sentence case, the accent colour, a hairline above. */
  it('the row is styled exactly as the more-places row: --ts-meta, sentence case, the accent, 44px, a hairline above, the triangle at the right', () => {
    for (const sel of ['.srch-also-toggle', '.srch-places-toggle']) {
      const d = decls(sel);
      expect(atLeast44(d['min-height']), sel).toBe(true);
      expect(d['font-size'], sel).toBe('var(--ts-meta)');
      expect(d['letter-spacing'], sel).toBe('0');
      expect(d['text-transform'], sel).toBe('none');
      expect(d.color, sel).toBe('var(--accent)');
      expect(d['border-top'], sel).toBe('1px solid var(--gold-border)');
      expect(d['border-top-color'], sel).toBe('var(--hairline)');
      expect(d['justify-content'], sel).toBe('space-between');
    }
  });

  it('open, each reprint is a 44px sub-row some 16px in, ruled 2px --gold on its left, its title over its collection', () => {
    const list = decls('.srch-also');
    expect(list['list-style']).toBe('none');
    expect(list.margin).toBe('0');
    const item = decls('.srch-also-item');
    expect(atLeast44(item['min-height'])).toBe(true);
    expect(item.display).toBe('flex');
    expect(item['flex-direction']).toBe('column');
    expect(item['border-left']).toBe('2px solid var(--gold)');
    // the card's 1.1rem gutter, then 16px in
    expect(item['margin-left']).toBe('calc(1.1rem + 16px)');
    // WA3: the title reads at the value size in the first text colour, the collection under it recedes to meta / --text-2
    const title = decls('.srch-also-title');
    expect(title['font-size']).toBe('var(--ts-value)');
    expect(title.color).toBe('var(--text-1)');
    const where = decls('.srch-also-where');
    expect(where['font-size']).toBe('var(--ts-meta)');
    expect(where.color).toBe('var(--text-2)');
  });
});

/* WA3: the order switch lives in the count's head now; the srch-filter size container and its stacking
   @container rule are gone, and so is the srch-corpus container. What still guards "no sideways scroll,
   nothing scrolled off" is asserted here. */
describe('B10 item 4 — the order switch and the corpus pills at a large Text Size, no sideways scroll', () => {
  it('the switch sits in the count\'s head, a flex row with a gap, the count and the switch at either end; no row scrolls sideways', () => {
    const head = decls('.srch-summary-head');
    expect(head.display).toBe('flex');
    expect(head.gap).toBe('8px');
    expect(head['justify-content']).toBe('space-between');
    expect(head['overflow-x']).toBeUndefined();
    expect(decls('.srch-sort').flex).toBe('none');
  });

  it('no label inside the switch breaks mid-word: each half keeps its words on one line', () => {
    expect(decls('.srch-sort-btn')['white-space']).toBe('nowrap');
  });

  it('the old stacking container rules are gone, not left to fight the new head', () => {
    expect(RULES.some((r) => r.at.startsWith('@container srch-filter')), '@container srch-filter').toBe(false);
    expect(RULES.some((r) => r.at.startsWith('@container srch-corpus')), '@container srch-corpus').toBe(false);
    expect(decls('.srch-sort-note')).toEqual({});
  });

  it('the corpus pills share the row evenly (flex:1), so ALL, SCRIPTURES and VOLUMES stay on one track', () => {
    expect(decls('.srch-corpus-row').display).toBe('flex');
    expect(decls('.srch-corpus-btn').flex).toBe('1');
    expect(decls('.srch-corpus-row')['overflow-x']).toBeUndefined();
  });
});

/* WA3: the lit tab and the lit order half are a raised segment on the track, coloured by tokens that carry the
   light theme themselves, so the body.light special rule is gone. */
describe('B10 item 5 — the chosen pill is a raised segment in either theme', () => {
  it('no body.light rule for a lit corpus pill or a lit order half: the tokens carry the light theme', () => {
    for (const sel of ['body.light .srch-corpus-btn.active', 'body.light .srch-sort-btn.active']) expect(decls(sel), sel).toEqual({});
  });

  it('lit: the corpus pill on --surface-3, the order half on --surface-1, both in --text-1; unlit, no fill and --text-2', () => {
    expect(decls('.srch-corpus-btn.active')).toMatchObject({ 'background-color': 'var(--surface-3)', color: 'var(--text-1)' });
    expect(decls('.srch-sort-btn.active')).toMatchObject({ 'background-color': 'var(--surface-1)', color: 'var(--text-1)' });
    expect(decls('.srch-corpus-btn')).toMatchObject({ background: 'none', color: 'var(--text-2)' });
    expect(decls('.srch-sort-btn')).toMatchObject({ background: 'none', color: 'var(--text-2)' });
  });

  it('the scope chip, a full-width band and not a pill, keeps its own lit state', () => {
    expect(decls('body.light .srch-scope-chip.active')).toEqual({});
  });
});

describe('B10 item 6 — group headers pin under the search bar while their own cards scroll', () => {
  it('the heading round each header sticks at the column top (under the search bar) above the cards', () => {
    const h = decls('.srch-group-h');
    expect(h.position).toBe('sticky');
    expect(h.top).toBe('0');
    expect(Number(h['z-index'])).toBeGreaterThanOrEqual(2);
    // WA3: the suggestions no longer drop over the results (they sit in the flow above them), so no header
    // can paint over them: neither the anchor nor the list is positioned out of the flow.
    expect(decls('.srch-suggest-anchor').position).toBeUndefined();
    expect(decls('.srch-suggest').position).toBeUndefined();
  });

  it('its band is solid (--surface-1, --surface-2 while open among others), each card under it parted by a hairline', () => {
    expect(decls('.srch-group-header').background).toBe('var(--surface-1)');
    expect(decls('.srch-group:not(:only-of-type):not(.collapsed) > .srch-group-h > .srch-group-header').background).toBe('var(--surface-2)');
    expect(decls('.srch-group-items > *')['border-top']).toBe('1px solid var(--hairline)');
  });

  it('the "show more" row is a one-line 54px row in the accent, a hairline above it', () => {
    const m = decls('.srch-group-more');
    expect(m['min-height']).toBe('var(--row-h-1)');
    expect(m['text-align']).toBe('left');
    expect(m['font-size']).toBe('var(--ts-value)');
    expect(m.color).toBe('var(--accent)');
    expect(m['border-top']).toBe('1px solid var(--hairline)');
  });

  it('the results end clear of the system nav bar, so the last group\'s "show more" row takes a tap', () => {
    // On the S22 (edge to edge, 3-button nav, Kotlin --inset-bottom 48px) the last row sat
    // at 736-780 of a 780px column, under the Home button: a tap on it went home (land-E look).
    expect(decls('.search-screen')['padding-bottom']).toBe('var(--dock-sys)');
  });
});

/* search200 audit 145: the "Also matching" line's Turn off is a 44px target. */
describe('the related-words line (search200 audit 145)', () => {
  it('its link is at least 44px tall and wide', () => {
    const r = RULES.find((x) => x.selectors.includes('.srch-syn-line .srch-more-link') && !x.at);
    expect(r, 'the rule').toBeTruthy();
    expect(r.body).toMatch(/min-height:\s*44px/);
    expect(r.body).toMatch(/min-width:\s*44px/);
  });
});
