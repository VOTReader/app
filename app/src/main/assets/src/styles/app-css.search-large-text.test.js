/* app-css.search-large-text.test.js — the search box at large Text Size (search200 wave 3).
   ─────────────────────────────────────────────────────────────────────────────
   At 300% on a 320 px phone the box's rem padding (36 px a side), the row gap and the
   ✕'s 60 px glyph left about three letters of the query in view. At the large-text
   root class (use-settings: Text Size 1.8 and up) the box's side padding, the row gap
   and the ✕ are held to phone px and its own words to 36 px, so "fear not" fits whole
   (headless Chrome, 320 x 680: 3.1 letters before, 8.6 after). Below 1.8 nothing changes.
   jsdom computes no styles, so these read app.css TEXT (the b10 test's parser). */
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

const px = (v) => { const m = /^(\d+(?:\.\d+)?)px$/.exec(String(v || '')); return m ? Number(m[1]) : NaN; };

describe('the search box at large Text Size', () => {
  it('holds the box side padding to phone px', () => {
    const d = decls('.vot-large-text .search-input');
    expect(px(d['padding-left'])).toBeLessThanOrEqual(12);
    expect(px(d['padding-right'])).toBeLessThanOrEqual(12);
  });
  it('caps the box words at 36 px, never above the reader size', () => {
    expect(decls('.vot-large-text .search-input')['font-size']).toBe('min(var(--fs-16), 36px)');
  });
  it('holds the row gap and the clear button to phone px, the ✕ still a 44 px target', () => {
    expect(px(decls('.vot-large-text .srch-input-row').gap)).toBeLessThanOrEqual(6);
    const c = decls('.vot-large-text .srch-clear-btn');
    expect(px(c['min-width'])).toBe(44);
    expect(c['font-size']).toBe('min(var(--fs-20), 28px)');
  });
  it('leaves the box alone below large text', () => {
    expect(decls('.search-input').padding).toBe('0.45rem 0.75rem');
    expect(decls('.search-input')['font-size']).toBe('var(--fs-16)');
  });
});
