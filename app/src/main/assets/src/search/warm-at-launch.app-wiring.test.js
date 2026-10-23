// @ts-nocheck — reads app.jsx and use-search.js source (node fs), like hooks/use-nav.app-wiring.test.js.
/* App() has no render harness, so this pins that the app asks for the search index once at launch
   (warm-at-launch.test.js pins when and how): useSearch, which App() calls once, starts it on mount,
   for the edition the reader has when it starts. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, p), 'utf8');

describe('the app builds the search index at launch (U10.3)', () => {
  it('useSearch starts warmSearchAtLaunch once, on mount, and cancels it on unmount', () => {
    const src = read('../hooks/use-search.js');
    expect(src).toMatch(/import \{ warmSearchAtLaunch \} from '\.\.\/search\/warm-at-launch\.js';/);
    const call = src.match(/React\.useEffect\(\(\) => warmSearchAtLaunch\(\{([\s\S]*?)\}\), \[(\w*)\]\);/);
    expect(call).not.toBeNull();
    expect(call[1]).toMatch(/engine: \(\) => window\.VotSearchMini/);
    expect(call[1]).toMatch(/translation: \(\) => searchEditionRef\.current/);
    // no deps, or only the stable ref it reads the edition through: it runs once
    expect(['', 'searchEditionRef']).toContain(call[2]);
    expect(src).toMatch(/const searchEditionRef = useRefMirror\(translation\);/);
  });
  it('App() hands useSearch the reader\'s edition', () => {
    const call = read('../app.jsx').match(/\buseSearch\(\{([\s\S]*?)\}\);/);
    expect(call).not.toBeNull();
    expect(call[1]).toMatch(/translation: settings\.translation/);
  });
});
