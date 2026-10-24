/* app-css.focus-ring.test.js — one visible focus ring for the text inputs (search200 audit 201).
   ─────────────────────────────────────────────────────────────────────────────
   The search box and the Scripture Web go-to box set outline:none on :focus-visible, so the
   keyboard's place was a faint border change (gold-border to gold-dim) or nothing. Both now show
   the app's ring, 2px solid gold (Scripture Web's own gold on its dark chrome): the search box on itself, the go-to box on the box around its
   borderless input (a ring on the input would draw a box inside the box). jsdom computes no
   styles, so this reads app.css TEXT, the way app-css.search200-b10.test.js does. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/** Top-level rules: selectors (comma list, whitespace folded) and declarations, comments stripped. */
function topRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@')) { depth++; continue; }
      const close = src.indexOf('}', i);
      if (depth === 0) rules.push({ selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: src.slice(i + 1, close) });
      i = close;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
      buf = '';
    } else if (c === ';') buf = '';
    else buf += c;
  }
  return rules;
}
const RULES = topRules(CSS);

/** The outline the LAST top-level rule naming `sel` sets ('' when none sets one). */
function outlineOf(sel) {
  let out = '';
  for (const r of RULES) {
    if (!r.selectors.includes(sel)) continue;
    const m = /(?:^|;)\s*outline\s*:\s*([^;]+)/.exec(r.body);
    if (m) out = m[1].trim();
  }
  return out;
}

describe('one visible focus ring for text inputs (search200 audit 201)', () => {
  it('the search box shows the gold ring on keyboard focus, not outline:none', () => {
    expect(outlineOf('.search-input:focus-visible')).toBe('2px solid var(--gold)');
  });

  it('the go-to box rings the box itself while its input has keyboard focus', () => {
    expect(outlineOf('.sw-goto-input:focus-visible'), 'no ring inside the box').toBe('none');
    // The go-to box is Scripture Web chrome, dark in both themes: its ring is the screen's own gold, as .sw-btn's is.
    expect(outlineOf('.sw-goto:has(.sw-goto-input:focus-visible)')).toBe('2px solid var(--sw-gold)');
  });
});
