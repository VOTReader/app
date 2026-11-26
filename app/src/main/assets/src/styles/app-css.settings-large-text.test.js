/* app-css.settings-large-text.test.js — Settings rows at large Text Size (audit visual2-1, 2026-11-23).
   ─────────────────────────────────────────────────────────────────────────────
   From 180% (the vot-large-text root class) the ws1 row head was nowrap while a select trigger took
   flex 1 1 100%, so the name column (.settings-row-text) shrank to 0 px and values drew over the
   descriptions (Bible translation, Reading font, Bible audio, both Sharing pickers, the steppers, the
   Protection pill). At large text the head wraps, the name column keeps at least 55% of the row, and a
   description inside the name column drops the 12 px side padding meant for a full-width desc.
   Headless walk, 412 px, every Settings group dark and light: 12-13 collapsed rows at 1.8-3.0 -> 0;
   1.0 and 1.7 measure the same before and after. jsdom computes no styles, so this reads app.css text. */
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

describe('Settings rows at large Text Size', () => {
  it('lets the row head wrap so a value goes under the name instead of over it', () => {
    expect(decls('.vot-large-text .ws1-settings .settings-row-head')['flex-wrap']).toBe('wrap');
  });
  it('keeps the name column at least 55% wide, so it can never be squeezed to 0 px', () => {
    expect(decls('.vot-large-text .ws1-settings .settings-row-head > .settings-row-text')['min-width']).toBe('55%');
  });
  it('drops the full-width desc padding for a line inside the name column, and breaks a long word', () => {
    const d = decls('.vot-large-text .settings-row-text .settings-row-desc');
    expect(d['padding-left']).toBe('0');
    expect(d['padding-right']).toBe('0');
    expect(d['overflow-wrap']).toBe('anywhere');
  });
  it('leaves rows below large text alone (nowrap head)', () => {
    expect(decls('.ws1-settings .settings-row-head')['flex-wrap']).toBe('nowrap');
  });
});
