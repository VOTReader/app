// @ts-nocheck — reads app.css as text
/* Half-baked 20: the mini-player's song cover. .song-cover (56 px) is declared after .audio-bar-cover (40 px), so
   at equal specificity the 56 px won and the cover overflowed its slot over the bar's padding and rounded corner.
   jsdom computes no styles, so this reads app.css TEXT: the bar's own rule must out-rank .song-cover. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('mini-player cover', () => {
  it('keeps its 40 px slot and 8 px corner through a selector that out-ranks .song-cover', () => {
    const m = CSS.match(/(^|[\s}])\.audio-bar \.audio-bar-cover\s*\{([^}]*)\}/);
    expect(m, 'a descendant rule .audio-bar .audio-bar-cover').toBeTruthy();
    expect(m[2]).toMatch(/width:\s*40px/);
    expect(m[2]).toMatch(/height:\s*40px/);
    expect(m[2]).toMatch(/border-radius:\s*8px/);
    expect(CSS).not.toMatch(/^[ \t]*\.audio-bar-cover[ \t]*\{/m);
  });
});
