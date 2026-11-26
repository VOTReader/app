/* app-css.fixlist-b.test.js — the app map fix list's layout entries for the shell, Home, Library,
   Scripture Web and the personal screens (lane fix-ui-b, 2026-11-26). Each reads app.css's text: jsdom
   computes no layout, so the shots in the lane's DONE are the proof on screen; these keep the rule. */
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

describe('#12 Home Explore pills size to their words', () => {
  it('the row is a wrapping flex row, not two equal grid columns', () => {
    const b = rule('.root-explore');
    expect(b).toMatch(/display:\s*flex/);
    expect(b).toMatch(/flex-wrap:\s*wrap/);
    expect(b).not.toMatch(/grid-template-columns/);
  });
  it('each pill grows from its own width', () => {
    expect(rule('.root-explore-btn')).toMatch(/flex:\s*1 1 auto/);
  });
});

describe('#18 the Safari warning scrolls inside the screen at large text', () => {
  it('.sh-modal is capped to the viewport and scrolls', () => {
    const b = rule('.sh-modal');
    expect(b).toMatch(/max-height:\s*calc\(100dvh - 3rem\)/);
    expect(b).toMatch(/overflow-y:\s*auto/);
  });
});

describe('#20 a row with a value beside it wraps its words instead of cutting them', () => {
  it('title and meta wrap in rows that hold a .ui-row-value', () => {
    const b = rule(':is(.ui-row, .root-row):has(:is(.ui-row-value, .root-row-count)) :is(.ui-row-title, .ui-row-meta, .root-row-title, .root-row-sub)');
    expect(b).toMatch(/white-space:\s*normal/);
    // no break-word: at text 2 it split a long word ('Chapt/er 3' in History) where the large-text rules cut it before
    expect(b).not.toMatch(/overflow-wrap/);
  });
});

describe('#31 option sheets keep a Close a screen reader can reach', () => {
  it('the row sheet hides its × visually, not from assistive tech', () => {
    const b = rule('.ui-row-sheet .sheet-handle-back');
    expect(b).not.toMatch(/display:\s*none/);
    expect(b).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(b).toMatch(/width:\s*1px/);
  });
});

describe('#20 follow-up: a cut/keep meta line flows as text at large text', () => {
  it('large text drops the flex row and lets the kept part wrap', () => {
    expect(rule('.vot-large-text .ui-row-meta:has(> .ui-meta-cut)')).toMatch(/display:\s*block/);
    expect(rule('.vot-large-text .ui-meta-keep')).toMatch(/white-space:\s*normal/);
  });
});

describe('#35 Scripture Web filter choices read as buttons', () => {
  it('unpicked choices have a resting fill and edge, with a gap between them', () => {
    const b = rule('.sw-root :is(.sw-filter-seg, .sw-list-tabs) .sw-seg-btn');
    expect(b).not.toMatch(/background:\s*none/);
    expect(b).toMatch(/box-shadow:\s*inset 0 0 0 1px/);
    expect(rule('.sw-root :is(.sw-filter-seg, .sw-list-tabs)')).toMatch(/gap:\s*2px/);
  });
});
