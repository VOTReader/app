/* app-css.answers-tablets.test.js — the Ten Commandments rows on Answers at Text Size 2+ (audit large-text-n4).
   ─────────────────────────────────────────────────────────────────────────────
   From Text Size 2 (ans-ts2) each commandment is one flex row: numeral, name, "2 topics ›". The row did not wrap,
   so at 300% the name stood one word per line and the count ran 69 px past the card (headless, 412 px). The row
   now wraps, the name keeps at least half of it, and the count moves under the name at the right when it does not
   fit beside it. jsdom computes no styles, so this reads app.css text. */
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

describe('the Ten Commandments rows at Text Size 2+', () => {
  it('wrap, so the count goes under the name instead of past the card', () => {
    expect(decls('.ans-ts2 .ans-tablet')['flex-wrap']).toBe('wrap');
  });
  it('give the name at least half the row', () => {
    const d = decls('.ans-ts2 .ans-tablet .ans-row-title');
    expect(d.flex).toBe('1 1 0');
    expect(d['min-width']).toBe('50%');
  });
  it('keep the wrapped count at the right', () => {
    expect(decls('.ans-ts2 .ans-tablet .ans-row-sub')['margin-left']).toBe('auto');
  });
});
