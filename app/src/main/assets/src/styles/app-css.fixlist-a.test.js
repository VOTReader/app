/* The app map fix list (D:/AgentBackbone/reports/vot-app-map/FIXLIST.md), lane fix-ui-a: the CSS each fix rests on. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/** The declaration block of the first rule whose selector text starts with `selector` (comments stripped). */
function ruleBlock(css, selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const idx = bare.indexOf(selector);
  if (idx === -1) return null;
  const open = bare.indexOf('{', idx);
  const close = bare.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return bare.slice(open + 1, close);
}

describe('fix list 10: Search\'s two-line rows keep their title whole', () => {
  it('a two-line row\'s title wraps to two lines instead of cutting "Answers Only God Can Give"', () => {
    const block = ruleBlock(CSS, '.srch-row.is-two .srch-row-t {');
    expect(block).not.toBeNull();
    expect(block).toMatch(/white-space:\s*normal/);
    expect(block).toMatch(/-webkit-line-clamp:\s*2/);
  });
});
