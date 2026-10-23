/* app-css.marker-targets.test.js — item #10 of the 2026-10-22 idea sweep (A06.2, L2.3): the note, link and
   bookmark markers in the reading text were 14-16 px targets, hard to hit on a phone, and so were the note
   sheet's buttons and the bookmark row's options.
   ─────────────────────────────────────────────────────────────────────────────
   jsdom computes no styles, so these read app.css TEXT (as app-css.search200-b10.test.js does). A marker takes
   a tap near it through an invisible box the size of the line it sits in (not 44 px: a box that tall would take
   the taps meant for the words on the lines above and below); its glyph stays on top, so of two markers side by
   side each keeps its own. Out of the text, the targets are a full 44 px. */
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
      buf = '';
    } else buf += c;
  }
  return rules;
}
const RULES = parseRules(CSS);

/** The declarations of every top-level rule naming exactly `selector`, later rules winning. */
function decls(selector) {
  const out = {};
  for (const r of RULES) {
    if (!r.selectors.includes(selector) || r.at !== '') continue;
    for (const d of r.body.split(';')) {
      const k = d.indexOf(':');
      if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
  }
  return out;
}

const MARKERS = ['.hl-note-icon', '.inline-link-icon', '.inline-bookmark-icon'];

describe('#10 — the markers in the reading text take a tap near them', () => {
  it.each(MARKERS)('%s carries an invisible box the size of its line around its glyph', (m) => {
    expect(decls(m).position).toBe('relative');
    const box = decls(m + '::before');
    expect(box.content).toBe("''");
    expect(box.position).toBe('absolute');
    const [v, h] = String(box.inset).split(/\s+/).map((x) => -parseFloat(x));
    expect(v).toBeGreaterThanOrEqual(7);       // 14 px + 2 x 8 = 30 px tall: the line, not the lines around it
    expect(v).toBeLessThanOrEqual(9);
    expect(h).toBeGreaterThanOrEqual(10);      // 34 px wide
  });

  it.each(MARKERS)('%s keeps its glyph above any neighbour\'s box', (m) => {
    const svg = decls(m + ' svg');
    expect(svg.position).toBe('relative');
    expect(svg['z-index']).toBe('1');
  });

  it('a stacked note marker\'s count stays above its glyph', () => {
    expect(Number(decls('.hl-note-icon-badge::after')['z-index'])).toBeGreaterThan(1);
  });
});

describe('#10 — out of the text the targets are 44 px', () => {
  it('the note sheet\'s Save and Cancel are at least 44 px tall', () => {
    expect(decls('.note-sheet-save')['min-height']).toBe('44px');
    expect(decls('.note-sheet-secondary')['min-height']).toBe('44px');
  });

  it('the note colour dot sits in a 44 px button that takes no more room than the dot', () => {
    const hit = decls('.note-sheet-color-hit');
    expect(hit.width).toBe('44px');
    expect(hit.height).toBe('44px');
    expect(hit.margin).toBe('-13px');          // 44 - 2 x 13 = the dot's 18 px
  });

  it('the bookmark row\'s options button is 44 px across in the room of its 20 px glyph box', () => {
    const more = decls('.bkm-row-more');
    expect(more.padding).toBe('14px');         // 16 px glyph + 2 x 14
    expect(more.margin).toBe('-12px');         // laid out as the 20 px it was
  });
});
