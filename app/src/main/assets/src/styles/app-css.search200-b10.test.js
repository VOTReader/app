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

  it('is a solid --bg band within 48px, closed by a gold hairline, not a solid rule', () => {
    const band = decls('.mini-title');
    expect(band.background).toBe('var(--bg)');
    expect(band['max-height']).toBe('48px');
    expect(band['border-bottom']).toBe('1px solid var(--gold-border)');
    expect(band.padding).toBe('6px 16px');
  });

  it('says the eyebrow in small Cinzel gold-dim over the title in Garamond cream, one line each, at frozen sizes', () => {
    const eb = decls('.mini-title-eyebrow');
    expect(eb['font-family']).toBe('var(--font-cinzel)');
    expect(eb['font-size']).toBe('var(--fsc-10)');
    expect(eb['letter-spacing']).toBe('0.18em');
    expect(eb.color).toBe('var(--gold-dim)');
    const name = decls('.mini-title-name');
    expect(name['font-family']).toBe('var(--font-garamond)');
    expect(name['font-size']).toBe('var(--fsc-16)');
    expect(name.color).toBe('var(--cream)');
    const line = decls('.mini-title-name');
    expect(line['white-space']).toBe('nowrap');
    expect(line['text-overflow']).toBe('ellipsis');
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

/* "44px" or larger from a min-height declaration */
const atLeast44 = (v) => /^\d+px$/.test(v || '') && parseInt(v, 10) >= 44;

describe('B10 item 3 — real 44px search tap targets, paid for by trimmed padding', () => {
  it('the corpus pills are 44px, fully rounded, Cinzel --fs-10 at 0.15em, outlined in --gold-border', () => {
    const b = decls('.srch-corpus-btn');
    expect(atLeast44(b['min-height'])).toBe(true);
    expect(parseInt(b['border-radius'], 10)).toBeGreaterThanOrEqual(22);
    expect(b['font-size']).toBe('var(--fs-10)');
    expect(b['letter-spacing']).toBe('0.15em');
    expect(b.border).toBe('1px solid var(--gold-border)');
  });

  it('the corpus row pads 8px above and below, so the band is about 60px', () => {
    expect(decls('.srch-corpus-row').padding).toMatch(/^8px /);
  });

  it('both halves of the order switch are 44px, its outline rounded 22px, its row padding trimmed', () => {
    expect(atLeast44(decls('.srch-sort-btn')['min-height'])).toBe(true);
    expect(decls('.srch-sort')['border-radius']).toBe('22px');
    expect(decls('.srch-filter-row').padding).toBe('4px min(1.2rem, 20px) 0');
  });

  it('group headers are 44px, the label still --fs-12', () => {
    const h = decls('.srch-group-header');
    expect(atLeast44(h['min-height'])).toBe(true);
    expect(h['font-size']).toBe('var(--fs-12)');
    expect(h.padding).toBe('0 1rem');
  });

  it('the scope chip and the quick and recent chips are 44px, their outer padding trimmed', () => {
    const scope = decls('.srch-scope-chip');
    expect(atLeast44(scope['min-height'])).toBe(true);
    expect(scope.padding).toBe('0 0.9rem');
    const chip = decls('.srch-quick-chip');
    expect(atLeast44(chip['min-height'])).toBe(true);
    expect(chip['align-items']).toBe('center');
    expect(parseInt(chip['border-radius'], 10)).toBeGreaterThanOrEqual(22);
    expect(decls('.srch-quick-row').padding).toBe('0.4rem 1rem 0.8rem');
  });
});

describe('B10 item 2 — a reprint folds under its original as "Also in N places"', () => {
  it('the row is styled exactly as the more-places row: Cinzel --fs-10 at 0.12em, --gold, 44px, a --gold-border hairline above, the triangle at the right', () => {
    for (const sel of ['.srch-also-toggle', '.srch-places-toggle']) {
      const d = decls(sel);
      expect(atLeast44(d['min-height']), sel).toBe(true);
      expect(d['font-size'], sel).toBe('var(--fs-10)');
      expect(d['letter-spacing'], sel).toBe('0.12em');
      expect(d['text-transform'], sel).toBe('uppercase');
      expect(d.color, sel).toBe('var(--gold)');
      expect(d['border-top'], sel).toBe('1px solid var(--gold-border)');
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
    const title = decls('.srch-also-title');
    expect(title['font-size']).toBe('var(--fs-10)');
    expect(title.color).toBe('var(--gold)');
    const where = decls('.srch-also-where');
    // the ladder's floor is --fs-10, so the collection recedes by colour and tracking, not size
    expect(where['font-size']).toBe('var(--fs-10)');
    expect(where.color).toBe('var(--gold-dim)');
  });
});

describe('B10 item 4 — the order switch stacks at a large Text Size, nothing clipped, no sideways scroll', () => {
  const AT = '@container srch-filter';
  it('the order row is a size container and no longer scrolls sideways (BOOK ORDER hid off its edge at 300%)', () => {
    const row = decls('.srch-filter-row');
    expect(row.container).toBe('srch-filter / inline-size');
    expect(row['overflow-x']).toBeUndefined();
  });

  it('stacks only when the row cannot hold the switch (about 1.7x on 412px), so 100% is unchanged', () => {
    const q = RULES.find((r) => r.at.startsWith(AT));
    expect(q).toBeTruthy();
    const rem = Number((/max-width:\s*([\d.]+)rem/.exec(q.at) || [])[1]);
    // the switch is 12.3rem wide at any size (195px at 16px); the 412px row holds 21.9rem at 100%, 18.8 on 360px
    expect(rem).toBeGreaterThanOrEqual(12.5);
    expect(rem).toBeLessThanOrEqual(14);
  });

  it('stacked: the note on its own line, the switch a full-width column, RELEVANCE over BOOK ORDER split by a hairline', () => {
    expect(decls('.srch-sort-note', AT)['flex-basis']).toBe('100%');
    const sort = decls('.srch-sort', AT);
    expect(sort['flex-direction']).toBe('column');
    expect(sort.flex).toBe('1 1 100%');
    expect(sort['border-radius']).toBe('20px');
    const btn = decls('.srch-sort-btn', AT);
    expect(btn['white-space']).toBe('normal');
    expect(btn['text-align']).toBe('center');
    const second = decls('.srch-sort-btn + .srch-sort-btn', AT);
    expect(second['border-left']).toBe('none');
    expect(second['border-top']).toBe('1px solid var(--gold-border)');
  });

  it('the row keeps the sides it had at 100% but caps them at 20px, so a stacked label has the width', () => {
    expect(decls('.srch-filter-row').padding).toBe('4px min(1.2rem, 20px) 0');
  });

  it('the corpus pills still pair ALL with SCRIPTURES at 300%: px sides and gaps, tracking closed only past 2.6x', () => {
    const row = decls('.srch-corpus-row');
    expect(row.container).toBe('srch-corpus / inline-size');
    expect(row.gap).toBe('6px');
    expect(decls('.srch-corpus-btn').padding).toBe('0 8px');
    expect(decls('.srch-corpus-btn', '@container srch-corpus (max-width: 9rem)')['letter-spacing']).toBe('0.06em');
  });
});

describe('B10 item 5 — the chosen pill is solid antique gold in the light theme', () => {
  it('a lit corpus pill and a lit order half fill with --gold, their label parchment --bg, their edge --gold', () => {
    for (const sel of ['body.light .srch-corpus-btn.active', 'body.light .srch-sort-btn.active']) {
      const d = decls(sel);
      expect(d.background, sel).toBe('var(--gold)');
      expect(d.color, sel).toBe('var(--bg)');
      expect(d['border-color'], sel).toBe('var(--gold)');
    }
  });

  it('the dark theme and the unlit pills are as they were', () => {
    expect(decls('.srch-corpus-btn.active')).toMatchObject({ background: 'var(--gold-faint)', color: 'var(--gold-bright)', 'border-color': 'var(--gold-dim)' });
    expect(decls('.srch-sort-btn.active')).toMatchObject({ background: 'var(--gold-faint)', color: 'var(--gold-bright)' });
    expect(decls('.srch-corpus-btn')).toMatchObject({ background: 'transparent', color: 'var(--cream-muted)' });
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
    // under the suggestions, which drop over the results
    expect(Number(h['z-index'])).toBeLessThan(Number(decls('.srch-suggest-anchor')['z-index']));
  });

  it('its band is solid --bg2, closed by a --gold-border hairline while the group is open', () => {
    expect(decls('.srch-group-header').background).toBe('var(--bg2)');
    expect(decls('.srch-group:not(.collapsed) > .srch-group-h')['border-bottom']).toBe('1px solid var(--gold-border)');
  });

  it('the "show more" row stays a centred 44px Cinzel --fs-10 gold row with a hairline below', () => {
    const m = decls('.srch-group-more');
    expect(m['min-height']).toBe('44px');
    expect(m['text-align']).toBe('center');
    expect(m['font-size']).toBe('var(--fs-10)');
    expect(m['letter-spacing']).toBe('0.12em');
    expect(m.color).toBe('var(--gold)');
    expect(m['border-bottom']).toBe('1px solid var(--gold-border)');
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
