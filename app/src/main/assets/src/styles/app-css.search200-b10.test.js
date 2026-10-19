/* app-css.search200-b10.test.js — the stylesheet half of search200 UX batch B10
   (D:/Swarm/lanes/search200/out/ux/mockups/PICKS.md; its numbers win over its pictures).
   ─────────────────────────────────────────────────────────────────────────────
   jsdom computes no styles, so these read app.css TEXT: each rule is found by its exact
   selector (one of a comma list) and the at-rule it sits in, and its declarations are
   checked against the pick's numbers. */
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

describe('B10 item 1 — the mini title band', () => {
  it('hangs from a zero-height sticky anchor at its bottom edge, taking no room', () => {
    const anchor = decls('.mini-title-anchor');
    expect(anchor.position).toBe('sticky');
    expect(anchor.top).toBe('0');
    expect(anchor.height).toBe('0');
    const band = decls('.mini-title');
    expect(band.position).toBe('absolute');
    expect(band.top).toBe('100%');
    expect(band['pointer-events']).toBe('none');
  });

  it('is a solid --bg band within 48px, closed by a gold hairline, not a solid rule', () => {
    const band = decls('.mini-title');
    expect(band.background).toBe('var(--bg)');
    expect(band['max-height']).toBe('48px');
    expect(band['border-bottom']).toBe('1px solid var(--gold-border)');
    expect(band.padding).toBe('6px 16px');
  });

  it('says the eyebrow in small Cinzel gold-dim over the title in Garamond cream, one line each, at frozen sizes', () => {
    const eb = decls('.mini-title-eyebrow');
    expect(eb['font-family']).toBe('var(--font-cinzel)');
    expect(eb['font-size']).toBe('var(--fsc-10)');
    expect(eb['letter-spacing']).toBe('0.18em');
    expect(eb.color).toBe('var(--gold-dim)');
    const name = decls('.mini-title-name');
    expect(name['font-family']).toBe('var(--font-garamond)');
    expect(name['font-size']).toBe('var(--fsc-16)');
    expect(name.color).toBe('var(--cream)');
    const line = decls('.mini-title-name');
    expect(line['white-space']).toBe('nowrap');
    expect(line['text-overflow']).toBe('ellipsis');
  });

  it('shows by a ~150ms fade, and not at all when hidden', () => {
    expect(decls('.mini-title').visibility).toBe('hidden');
    expect(decls('.mini-title').opacity).toBe('0');
    const shown = decls('.mini-title.shown');
    expect(shown.visibility).toBe('visible');
    expect(shown.opacity).toBe('1');
    expect(shown.transition).toMatch(/opacity 0\.15s/);
  });
});
