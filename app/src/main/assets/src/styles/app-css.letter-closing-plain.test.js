/* app-css.letter-closing-plain.test.js — a letter's closing carries no line of the app's own (Corbin 2026-11-26).
   A closing ("Says The Lord.") had a hairline drawn above it, with 2rem of padding under the line: a flourish
   inside the text, which the reading text does not carry. The closing keeps its centring, its italic and the
   space above it; nothing is drawn. jsdom computes no layout, so this reads app.css's text. */
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

describe('a letter\'s closing is set as text, with nothing drawn round it', () => {
  it('no line above it, and no padding that only made room for one', () => {
    const c = rule('.letter-closing');
    expect(c).not.toBeNull();
    expect(c).not.toMatch(/border/);
    expect(c).not.toMatch(/padding/);
    expect(c).not.toMatch(/background|box-shadow|outline/);
  });

  it('still centred and italic, with clear space above it', () => {
    const c = rule('.letter-closing');
    expect(c).toMatch(/text-align:\s*center/);
    expect(c).toMatch(/font-style:\s*italic/);
    expect(c).toMatch(/margin-top:\s*2rem/);
  });

  it('no later rule puts a line back on a closing', () => {
    const again = CSS.match(/[^{}]*\.letter-closing(?:-fn|-mid)?[^{}]*\{[^}]*\b(?:border|box-shadow|outline)[^}]*\}/g);
    expect(again).toBeNull();
  });
});
