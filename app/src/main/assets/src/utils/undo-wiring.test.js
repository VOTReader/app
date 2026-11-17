// @ts-nocheck — reads the shipped screens' source
// 0610: every bookmark delete and Library > Links delete goes through the helpers that offer Undo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('no bookmark or Library-link delete skips its Undo (0610)', () => {
  it('UI code deletes bookmarks only through removeBookmarkWithUndo, and LinksScreen offers the link Undo', () => {
    const ui = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
    for (const f of ['screens/BookmarksScreen.jsx', 'sheets/BookmarkPopover.jsx', 'components/AppShellSheets.jsx']) {
      const src = readFileSync(join(ui, f), 'utf8');
      expect(src, f).not.toMatch(/BookmarkStore\.remove\(/);
      expect(src, f).toMatch(/removeBookmarkWithUndo\(/);
    }
    const links = readFileSync(join(ui, 'screens/LinksScreen.jsx'), 'utf8');
    expect(links).toMatch(/removeLinkWithUndo\(/);
    expect(links).not.toMatch(/LinkStore\.remove\(/);
  });
});
