// @ts-nocheck
/* v2 hosts main's Scripture Web whole but does not load app.css, so every class main's web renders needs a rule in
   v2's own stylesheets (src/v2/*.css). Since zones v2p8 copied main's .sw rules (10-15), sweb added ~90 sw- and swf-
   classes (the docked panel, the go-to, the crumbs, the rows, the compact sheet, the credit, the legend's glyphs) and
   none had a rule on v2: the panel drew as the old bottom card and the new chrome was raw text (sweb w4 #22; myweb
   mw13). This guard reads every sw- and swf- token in main's web components and fails the day main adds a class v2
   has not styled. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SW_DIR = resolve(HERE, '../ui/scripture-web');
const SOURCES = [
  ...readdirSync(SW_DIR).filter((f) => f.endsWith('.jsx') && !/\.test\.jsx$/.test(f)).map((f) => join(SW_DIR, f)),
  resolve(HERE, '../ui/screens/ScriptureWebScreen.jsx'),
];

/* Names that are no class with a look, so main has no rule for them either:
   - hook-only classes, there for tests and JS to find (sweb's v2 handoff, section 3);
   - ids and module names that share the prefix. */
const NO_RULE = new Set([
  'sw-follow', 'sw-group-title', 'sw-key-ramp', 'sw-quote-more', 'sw-sec-cited', 'sw-sec-more', // hook-only
  'sw-choice-row', // the chooser's and Nearby's rows keep it as a hook (app.css names it in a comment only)
  'sw-a11y-help', 'sw-goto-opt', // ids (aria-describedby, the go-to's option ids 'sw-goto-opt-' + k)
  'sw-ink', // utils/scripture-web/sw-ink.js, an import path
]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function classTokens() {
  const out = new Set();
  for (const f of SOURCES) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(?<![-\w.#])swf?-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      const t = m[0].replace(/-\d+$/, '').replace(/-$/, '');
      if (!NO_RULE.has(t)) out.add(t);
    }
  }
  return [...out].sort();
}

const V2_CSS = readdirSync(HERE).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(HERE, f), 'utf8')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** True when some rule's selector (not a declaration) names .token. */
function hasSelector(token) {
  const re = new RegExp('\\.' + token.replace(/-/g, '\\-') + '(?![-\\w])');
  // selectors are the text before each '{'; declarations sit between '{' and '}'
  return V2_CSS.split('}').some((chunk) => re.test(chunk.split('{').slice(0, -1).join('{')));
}

describe("v2 styles every class main's Scripture Web renders (mw13)", () => {
  it('finds the web\'s classes (the scan itself works)', () => {
    const t = classTokens();
    expect(t.length).toBeGreaterThan(150);
    expect(t).toContain('sw-panel');
    expect(t).toContain('swf-card-head');
    expect(t).not.toContain('sw-goto-opt');
  });

  it('every sw- and swf- class has a selector in src/v2/*.css', () => {
    const missing = classTokens().filter((t) => !hasSelector(t));
    expect(missing).toEqual([]);
  });

  it('the kit look still has the last word on the controls: it comes after main\'s structure', () => {
    const css = readFileSync(join(HERE, 'scripture-web.css'), 'utf8');
    const structure = css.indexOf("main's structure");
    const kit = css.indexOf("the kit's look for the controls");
    expect(structure).toBeGreaterThan(-1);
    expect(kit).toBeGreaterThan(structure);
  });
});
