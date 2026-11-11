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

// LibraryScreen left the family on 2026-11-10: it is the Library tab's root, named in the root top bar (RootNav.jsx).
// ReadingPlansScreen left it on 2026-11-11 (plans2): Reading plans is named in its top bar (PlansHub.jsx, U rules 10-11).
const TITLES = {
};
// The UI pass (U rule 10, W2 2026-11-11): a utility screen's title is the bar's, with no second title in the page.
const BAR_TITLED = {
  NotesIndexScreen: 'Notes',
  HighlightsScreen: 'Highlights',
  BookmarksScreen: 'Bookmarks',
  LinksScreen: 'Links',
  MyProgressScreen: 'Progress',
  JournalHubScreen: 'Journal',
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

  it.each(Object.entries(BAR_TITLED))('%s is titled "%s" in the utility bar, with no page header', (file, title) => {
    const src = read(file + '.jsx');
    expect(src).toContain('<ScreenLayout utility={{');
    expect(src).toMatch(new RegExp("title: [^,]*'" + title + "'"));
    expect(src).not.toContain('study-head');
    for (const cls of RETIRED) expect(uses(src, cls), cls).toBe(false);
  });

  it('the retired header classes have no rules left anywhere', () => {
    const sheets = [read('..', '..', '..', 'app.css'), read('..', '..', 'styles', 'journal-styles.js')];
    for (const css of sheets) for (const cls of RETIRED) expect(uses(css, cls), cls).toBe(false);
  });
});
