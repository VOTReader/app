// @ts-nocheck - node fs in a source-text test
/* Fix list 25: the Matthew Study index ignored Chapter Titles and Restored Names, so with chapter titles off it still
   showed titled rows, unlike a Bible index. It passes both settings as bible-idx does. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'screen-routes.jsx'), 'utf8');

/** The route body from `'<name>': () =>` up to the next route at the same indent. */
function route(name) {
  const at = SRC.indexOf("    '" + name + "': () =>");
  expect(at).toBeGreaterThan(-1);
  const next = SRC.slice(at + 10).search(/\n {4}'[a-z-]+': \(\) =>/);
  return SRC.slice(at, next < 0 ? undefined : at + 10 + next);
}

describe('matthew-idx follows the reader\'s index settings (fix list 25)', () => {
  it('passes showChapterTitle and restoredNames the way bible-idx does', () => {
    const bible = route('bible-idx');
    const matthew = route('matthew-idx');
    expect(bible).toContain('showChapterTitle={settings.showChapterTitle !== false}');
    expect(matthew).toContain('showChapterTitle={settings.showChapterTitle !== false}');
    expect(matthew).toContain('restoredNames={settings.restoredNames}');
  });
});
