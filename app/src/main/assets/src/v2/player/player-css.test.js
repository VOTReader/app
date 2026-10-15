// @ts-nocheck — reads kit.css and player.css from disk (node fs, no node types in this tsconfig).
/* The read-along wash in player.css is the kit's .ra look written out per page (an older Android WebView resolves no
   var() inside ::highlight), so nothing would follow a change to kit.css's --wash or --t-hero. This holds each page's
   ::highlight(vot-reading) to that page's tokens: Slate (no data-page), Paper and Black. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const kit = readFileSync(join(HERE, '..', 'kit.css'), 'utf8');
const player = readFileSync(join(HERE, 'player.css'), 'utf8');

const squash = (v) => v.replace(/\s+/g, '').toLowerCase();

/** The body of the rule whose selector, at the start of a line, is exactly `selector`. */
function block(css, selector) {
  const at = ('\n' + css).indexOf('\n' + selector + ' {');
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** A declaration's value in a run of CSS: the last one, as the cascade reads it. */
function decl(css, prop) {
  const all = [...(css || '').matchAll(new RegExp('(?:^|[;{\\s])' + prop.replace(/-/g, '\\-') + '\\s*:\\s*([^;}]+)', 'g'))];
  return all.length ? squash(all[all.length - 1][1]) : null;
}

/** Slate's tokens: kit.css with the page blocks taken out (they restate every token). */
const slate = kit.replace(/\[data-page="(?:paper|black)"\]\s*\{[^}]*\}/g, '');

const PAGES = [
  { page: 'slate', tokens: slate, rule: '.v2 ::highlight(vot-reading)' },
  { page: 'paper', tokens: block(kit, '[data-page="paper"]'), rule: '[data-page="paper"] .v2 ::highlight(vot-reading)' },
  { page: 'black', tokens: block(kit, '[data-page="black"]'), rule: '[data-page="black"] .v2 ::highlight(vot-reading)' },
];

describe('the read-along wash follows the kit on every page', () => {
  for (const { page, tokens, rule } of PAGES) {
    it(page + ': --wash and --t-hero', () => {
      const wash = decl(tokens, '--wash');
      const hero = decl(tokens, '--t-hero');
      expect(wash).toMatch(/^rgba\(/);
      expect(hero).toMatch(/^#/);
      const body = block(player, rule);
      expect(body, rule + ' in player.css').not.toBeNull();
      expect(decl(body, 'background-color')).toBe(wash);
      expect(decl(body, 'color')).toBe(hero);
    });
  }
});
