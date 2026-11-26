/* app-css.layout-1126.test.js — the layout and large-text findings of the 11-23 audit (layout lane, 11-26).
   ─────────────────────────────────────────────────────────────────────────────
   Each block pins one finding's rule in app.css TEXT (jsdom computes no styles; the parser is the
   search-large-text test's). The live proof is the before/after shots at 412x915, Text size 100% and 300%,
   in D:/AgentBackbone/reports/claude-1126/layout/. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/* Every style rule in the sheet: its selectors, its declarations, and the at-rule preludes it is nested in. */
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

/** The declarations of every rule naming exactly `selector`, inside an at-rule matching `at` (later rules win). */
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

/* visual2-7: in a reader's More sheet a value sat on its name's line whatever its length: the site under "Copy website
   link" ran off the card from 170% (246-637 px on a 412 px phone at 300%), and the hint's "Got it" broke at every size. */
describe('visual2-7: the More sheet values stay on the card', () => {
  it('a long value wraps under its name and may break anywhere rather than overflow', () => {
    expect(decls('.rd-menu-sheet .more-menu-item:not(.more-menu-hint) .more-menu-item-text')['flex-wrap']).toBe('wrap');
    expect(decls('.rd-menu-sheet .more-menu-item-sub')).toMatchObject({ 'max-width': '100%', 'overflow-wrap': 'anywhere' });
  });
  it('the hint keeps "Got it" whole', () => {
    expect(decls('.rd-menu-sheet .more-menu-hint .more-menu-item-sub')).toMatchObject({ flex: 'none', 'white-space': 'nowrap' });
  });
});
