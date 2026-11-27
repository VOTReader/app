/* app-css.settings-root-wrap.test.js — Settings' first screen wraps a group's name instead of cutting it short.
   jsdom computes no layout; the before/after shots are the proof on screen, this keeps the rule. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe("Settings' first screen keeps every group's name whole", () => {
  it('row titles and lines on the Settings root wrap at their spaces, at every text size', () => {
    const m = CSS.match(/(^|[}\s])\.ws1-settings\.is-root :is\(\.ui-row-title, \.ui-row-meta\)\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[2]).toMatch(/white-space:\s*normal/);
    expect(m[2]).toMatch(/overflow-wrap:\s*break-word/);
  });
});

describe("the restore sheet's Backup and This phone columns stay inside the card at large text", () => {
  const body = (sel) => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = CSS.match(new RegExp('(^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}'));
    return m ? m[2] : null;
  };
  it('the pair keeps its natural width as its basis, in the counts\' own em, and its columns shrink to halves once 5 em each would not fit', () => {
    const b = body('.vot-large-text .ws3-counts.has-here .ws3-count-pair');
    expect(b).toMatch(/flex:\s*1 1 calc\(10em \+ var\(--sp-4\)\)/);   // not 100%: beside a short name it stays on the name's line
    expect(b).toMatch(/font-size:\s*var\(--ts-meta\)/);                 // 5 em of the counts, as the cells' min-width was
    expect(b).toMatch(/display:\s*grid/);
    expect(b).toMatch(/grid-template-columns:\s*repeat\(2,\s*min\(5em,\s*calc\(\(100% - var\(--sp-4\)\) \/ 2\)\)\)/);
    expect(b).toMatch(/justify-content:\s*end/);
    expect(b).toMatch(/min-width:\s*0/);
  });
  it('a cell may wrap, so nothing is held wider than its half', () => {
    const b = body('.vot-large-text .ws3-counts.has-here .ws3-count-pair .ws3-count-n');
    expect(b).toMatch(/min-width:\s*0/);
    expect(b).toMatch(/white-space:\s*normal/);
    expect(b).toMatch(/overflow-wrap:\s*break-word/);
  });
  it('the This phone header may use half the gap beside it, so it keeps one line where it fits and 8 px always stays beside Backup', () => {
    expect(body('.vot-large-text .ws3-counts.has-here .ws3-count.is-head .ws3-count-pair > .ws3-count-n:last-child')).toMatch(/margin-left:\s*calc\(-0\.5 \* var\(--sp-4\)\)/);
  });
});
