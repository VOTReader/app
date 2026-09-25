// @ts-nocheck — reads the screens' source files with node fs (no node types in this tsconfig)
/* ONE PAGE HEADER FOR THE PERSONAL-STUDY FAMILY (the redesign, 2026-09-25).
   Library, Progress, Journal, Notes, Bookmarks, Links, Highlights & Underlines and Milestones had
   six header styles between them (centred under an eyebrow, spaced gold capitals, letter-spaced
   gold, an eyebrow over capitals). They now share .study-head: the name at the left in the Library
   row's words, the count at the right, at most one dim line under it. Checked at the source, so a
   ninth header style cannot come back through one screen while the others stay put. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(resolve(here, ...p), 'utf8');

const TITLES = {
  LibraryScreen: 'Library',
  MyProgressScreen: 'Progress',
  JournalHubScreen: 'Journal',
  NotesIndexScreen: 'Notes',
  BookmarksScreen: 'Bookmarks',
  LinksScreen: 'Links',
  HighlightsScreen: 'Highlights & Underlines',
  MilestonesScreen: 'Milestones',
};
const RETIRED = [
  'library-eyebrow', 'library-title', 'library-sub', 'jrn-hub-header', 'jrn-hub-title', 'jrn-hub-count',
  'notes-index-header', 'notes-index-title', 'notes-index-count', 'hlx-header', 'hlx-eyebrow', 'hlx-title',
  'hlx-count', 'milestones-eyebrow', 'milestones-intro',
];
const uses = (src, cls) => new RegExp('[."\\s]' + cls + '(?![\\w-])').test(src);

describe('the personal-study family shares one page header', () => {
  it.each(Object.entries(TITLES))('%s is titled "%s" in the shared header', (file, title) => {
    const src = read(file + '.jsx');
    expect(src).toMatch(/<header className="study-head( inset)?">/);
    expect(src).toContain('<h1 className="study-head-title">' + title + '</h1>');
    for (const cls of RETIRED) expect(uses(src, cls), cls).toBe(false);
  });

  it('the retired header classes have no rules left anywhere', () => {
    const sheets = [read('..', '..', '..', 'app.css'), read('..', '..', 'styles', 'journal-styles.js')];
    for (const css of sheets) for (const cls of RETIRED) expect(uses(css, cls), cls).toBe(false);
  });
});
