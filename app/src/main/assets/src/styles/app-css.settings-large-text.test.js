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

describe('Reading progress names (large-text-n1)', () => {
  it('wrap at every size instead of an ellipsis ("The Volumes of …" from 130%)', () => {
    const d = decls('.ws3-prog .progress-row-label');
    expect(d['white-space']).toBe('normal');
    expect(d['text-overflow']).toBe('clip');
    expect(d.overflow).toBe('visible');
  });
  it('keep most of the row at large text, the tally and Clear wrapping under them', () => {
    expect(decls('.vot-large-text .ws3-prog .progress-row')['flex-wrap']).toBe('wrap');
    const t = decls('.vot-large-text .ws3-prog .progress-section-toggle');
    expect(t['flex-wrap']).toBe('wrap');
    expect(t['min-width']).toBe('60%');
    expect(decls('.vot-large-text .ws3-prog .ws3-prog-name')['min-width']).toBe('55%');
  });
});

/* large-text-n5 (audit 2026-11-23): at large text a My Progress tile (and a plan's fact tile) lays the number
   beside its label in a flex row; the number has overflow-wrap:anywhere, so it shrank and broke ("250" became
   "25" over "0", "1,284" three lines at 300%). The number keeps its width; the label takes the rest and wraps. */
describe('My Progress and plan fact numbers at large Text Size (large-text-n5)', () => {
  it('never shrink, so a number is not broken across lines', () => {
    for (const sel of ['.vot-large-text .plan-fact b', '.vot-large-text .prg-tile b']) expect(decls(sel).flex, sel).toBe('none');
  });
  it('leave the label the rest of the row, wrapping', () => {
    for (const sel of ['.vot-large-text .plan-fact span', '.vot-large-text .prg-tile span']) {
      expect(decls(sel).flex, sel).toBe('1 1 0');
      expect(decls(sel)['min-width'], sel).toBe('0');
    }
  });
});

/* large-text-n2 (audit 2026-11-23): the Bible book index (.scriptures-landing, 1.3rem a side = 62 px at 300%) and the
   Listen screens (.audio-library-screen, 1rem-1.45rem) kept rem gutters, so at 300% "All books" met the screen edge and
   "New King James" was cut 89 px. At large text both take the page gutter in px. */
describe('Bible index and Listen gutters at large Text Size (large-text-n2)', () => {
  it('use the px page gutter', () => {
    for (const sel of ['.vot-large-text .scriptures-landing', '.vot-large-text .audio-library-screen']) {
      expect(decls(sel)['padding-left'], sel).toBe('var(--gutter)');
      expect(decls(sel)['padding-right'], sel).toBe('var(--gutter)');
    }
  });
});
