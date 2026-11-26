/* app-css.sheet-foot-large-text.test.js — a sheet's two-button foot at large text (review 11-26, restore sheet).
   At 200 % the restore confirm's "Restore and overwrite" (nowrap, 345 px at 30 px) set its grid column's minimum,
   so the button ran from 154 to 499 px on a 412 px phone and its label was cut at the screen's edge. From the
   vot-large-text root class the foot is one column and a label wraps at its spaces in a px inline padding (the
   #54 Safari buttons' approach). Standard text keeps the two equal columns. Headless shots, 412 x 915:
   reports/claude-1126/restore-skip/*-r2-*. jsdom computes no layout, so this reads app.css's text. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose selector list is exactly `sel` (first match). */
function rule(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = CSS.match(new RegExp('(^|[}\\s])' + esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[2] : null;
}

describe('a sheet foot at large text keeps its buttons on the screen', () => {
  it('below large text: two equal columns that may shrink below a label\'s one-line width', () => {
    expect(rule('.ui-sheet-foot')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
  });

  it('below large text: a button wraps its words inside its half, keeping its standard height', () => {
    const b = rule('.ui-sheet-foot > .ui-btn');
    expect(b).toMatch(/min-width:\s*0/);
    expect(b).toMatch(/white-space:\s*normal/);
    expect(b).not.toMatch(/(^|[;\s])height:/);   // .ui-btn's min-height stays the floor
    // A one-word label ("Downloads" at 170 % on a 360 px phone) cannot wrap, so the inline padding gives way in px.
    expect(b).toMatch(/padding:\s*6px 12px/);
  });

  it('large text: one column that may shrink below a label\'s one-line width', () => {
    expect(rule('.vot-large-text .ui-sheet-foot')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('large text: a button wraps its words in px inline padding instead of setting the column\'s width', () => {
    const b = rule('.vot-large-text .ui-sheet-foot > .ui-btn');
    expect(b).toMatch(/min-width:\s*0/);
    expect(b).toMatch(/white-space:\s*normal/);
    expect(b).toMatch(/height:\s*auto/);
    expect(b).toMatch(/padding:\s*6px 12px/);
    expect(b).not.toMatch(/padding[^;]*rem/);
  });

  it('a nowrap run inside a foot button stays on one line (a size\'s number and unit)', () => {
    expect(rule('.ui-sheet-foot .ui-nowrap')).toMatch(/white-space:\s*nowrap/);
  });

  it('large text: the Verify sheet\'s empty stand-in for Restore it takes no row', () => {
    expect(rule('.vot-large-text .ui-sheet-foot > span:empty')).toMatch(/display:\s*none/);
  });
});
