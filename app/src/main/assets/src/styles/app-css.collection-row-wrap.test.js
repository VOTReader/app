/* app-css.collection-row-wrap.test.js — a collection row (Volume One and the like) puts its star and menu on a line
   below the name only where its own longest word would otherwise break. jsdom computes no layout; the sweeps and
   before/after shots are the proof on screen, this keeps the rule. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose selector is exactly `sel` (first match). */
function rule(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = CSS.match(new RegExp('(^|[{}\\s])' + esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[2] : null;
}
const P = ':root:not(.vot-large-text) .listen-coll .listen-rec';
const at = CSS.indexOf('@supports (flex-basis: min-content)');
const block = at < 0 ? '' : CSS.slice(at, CSS.indexOf('\n    }', at));

describe('a collection row wraps its star and menu only where its own longest word would break', () => {
  it('the rule is a plain flex-basis: min-content, which every current engine takes', () => {
    expect(at).toBeGreaterThan(-1);
    expect(CSS).not.toMatch(/calc-size/);
    expect(rule(P)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(P)).toMatch(/justify-content:\s*flex-end/);   // a wrapped pair is packed to the right edge
    const main = rule(P + ' > .ui-row-main');
    expect(main).toMatch(/flex-basis:\s*min-content/);
    expect(main).toMatch(/max-width:\s*100%/);   // a word wider than the row breaks as before, the row never grows
    expect(main).not.toMatch(/min-width/);
  });
  it('the star carries the menu\'s room as its right margin and the menu takes it back, so they wrap together', () => {
    const R = 'var(--tap) - 8px + 14px';   // the menu's outer width (44 px less its -8 px margin) and the 14 px gap
    expect(rule(P + ' > .ui-row-star:has(+ .ui-row-menu)')).toContain('margin-right: calc(-4px + ' + R + ')');
    expect(rule(P + ' > .ui-row-star + .ui-row-menu')).toContain('margin-left: calc(-1 * (' + R + '))');
    expect(block).not.toMatch(/margin-left:\s*auto/);   // it would take the star's -4 px
  });
  it('the meta line, which ellipsises, adds nothing to the floor', () => {
    expect(rule(P + ' .ui-row-meta')).toMatch(/contain:\s*inline-size/);
  });
  it('large text keeps its own rules, and nothing else touches the row: every rule is scoped below large text', () => {
    const sels = [...block.matchAll(/\n\s*([^{}\n]+?)\s*\{/g)].map((m) => m[1]);
    expect(sels.length).toBe(6);
    for (const sel of sels) expect(sel.startsWith(':root:not(.vot-large-text) ')).toBe(true);
    expect(CSS).not.toMatch(/\.listen-rec[^{]*\{[^}]*container-type/);
  });
});
