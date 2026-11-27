/* app-css.row-value-gives-way.test.js — a row's words keep their longest word beside a long value, below large text.
   jsdom computes no layout; the sweep in row-label/r4 is the proof on screen, this keeps the rule. */
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

const WORDS = ':where(:root:not(.vot-large-text) :has(> :is(.ui-row-value, .root-row-count)):not(.rd-bindex *)) > :is(.ui-row-text, .root-row-text)';

describe('a row beside a long value keeps its words whole', () => {
  it('below large text the words\' floor is the lesser of their longest word and half the row (width 50% + min-width auto)', () => {
    const b = rule(WORDS);
    expect(b).not.toBeNull();
    expect(b).toMatch(/(^|;)\s*width:\s*50%/);
    expect(b).toMatch(/min-width:\s*auto/);
    // no fixed floor (8 em wrapped "The one Listen plays" beside "Voice" at 100 %), and no basis change:
    // the words keep flex 1 (basis 0), so a row that fits is laid out as before, and a name with no space cannot
    // become the basis and push the value off the row
    expect(b).not.toMatch(/em\b|flex|calc-size|min-content/);
  });
  it('the Scripture index, whose words size from their content, is left out', () => {
    expect(WORDS).toContain(':not(.rd-bindex *)');
  });
  it('below large text the value may shrink, wrapping at its spaces, right-aligned', () => {
    const b = rule(':where(:root:not(.vot-large-text)) :is(.ui-row-value, .root-row-count)');
    expect(b).toMatch(/flex:\s*0 1 auto/);
    expect(b).toMatch(/text-align:\s*right/);
    expect(b).not.toMatch(/min-width:\s*0/);   // its own longest word stays its floor, so it never spills into the words
  });
  it('the Library root\'s fixed half-row floor holds only at large text', () => {
    expect(CSS).not.toMatch(/(^|})\s*\.library-root \.ui-row-text\s*\{/);   // the old bare rule
    expect(rule('.vot-large-text .library-root .ui-row-text')).toMatch(/min-width:\s*50%/);
  });
});
