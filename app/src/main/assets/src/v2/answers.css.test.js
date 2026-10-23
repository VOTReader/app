// @ts-nocheck
/* v2 hosts main's Answers screens whole (mw14) but does not load app.css, so every class main's Answers renders that
   main styles needs a rule in v2's own stylesheets too: answers.css carries app.css's Answers block and the main rules it
   leans on. This guard reads every ans- class in main's Answers components and the outside classes they render (the kit
   sheet, SheetHandle, the switch, .sr-only), and fails the day main styles one that v2 has no selector for (the source
   chip's screen-reader words showed on the page until .sr-only came over). */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = resolve(HERE, '../ui');
const SOURCES = [
  ...['screens', 'components', 'sheets'].flatMap((d) => readdirSync(join(UI, d))
    .filter((f) => /^Answers.*\.jsx$/.test(f) && !/\.test\.jsx$/.test(f)).map((f) => join(UI, d, f))),
  resolve(UI, 'components/SheetHandle.jsx'),
];
/* the classes outside the ans- names that the Answers screens draw and main styles */
const OUTSIDE = ['select-sheet', 'select-sheet-backdrop', 'sheet-handle-row', 'sheet-handle-back', 'sheet-handle-grab',
  'sheet-handle-bar', 'settings-toggle', 'settings-toggle-track', 'settings-toggle-thumb', 'sr-only'];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function classTokens() {
  const out = new Set(OUTSIDE);
  for (const f of SOURCES) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/(?<![-\w.#])ans-[a-z0-9]+(?:-[a-z0-9]+)*/g)) out.add(m[0].replace(/-$/, ''));
  }
  return [...out].sort();
}

const cssOf = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const MAIN_CSS = cssOf([resolve(HERE, '../../app.css')]);
const V2_CSS = cssOf(readdirSync(HERE).filter((f) => f.endsWith('.css')).map((f) => join(HERE, f)));

/** True when some rule's selector (not a declaration) in `css` names .token. */
function hasSelector(css, token) {
  const re = new RegExp('\\.' + token.replace(/-/g, '\\-') + '(?![-\\w])');
  return css.split('}').some((chunk) => re.test(chunk.split('{').slice(0, -1).join('{')));
}

describe("v2 styles every class main's Answers renders and styles (mw14)", () => {
  it("finds the Answers classes (the scan itself works)", () => {
    const t = classTokens();
    expect(t.length).toBeGreaterThan(100);
    expect(t).toContain('ans-runhead');
    expect(t).toContain('ans-contents-line');
    expect(t).toContain('sr-only');
  });

  it("every class main has a rule for has one in src/v2/*.css", () => {
    const styled = classTokens().filter((t) => hasSelector(MAIN_CSS, t));
    expect(styled.length).toBeGreaterThan(100);
    expect(styled.filter((t) => !hasSelector(V2_CSS, t))).toEqual([]);
  });

  it("the Answers rules read no face v2 does not ship (main's Cinzel)", () => {
    expect(cssOf([join(HERE, 'answers.css')])).not.toMatch(/Cinzel/);
  });
});
