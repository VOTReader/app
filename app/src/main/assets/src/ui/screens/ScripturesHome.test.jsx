/* ScripturesHome — the four scriptureLayout branches + the layout cycle button.
   ────────────────────────────────────────────────────────────────────────────
   This screen had ZERO direct coverage: four mutually-exclusive render
   branches, the last of which is an unguarded fallthrough, and nothing
   asserted which one a given setting value produces. The cycle button added
   on 2026-07-30 makes that worse — it is a SECOND writer of `scriptureLayout`
   alongside the Settings SelectField, and the failure mode is silent (write
   an id that isn't in SCRIPTURE_LAYOUT_OPTIONS and the screen renders the
   canonical fallthrough while Settings displays "Genre Grid").

   ScripturesHome takes no ES imports — every dependency is a classic-script
   free variable — so the harness installs them on globalThis. LibraryNav is
   called as a plain FUNCTION here (`LibraryNav({…})`), so its stub must be a
   function returning null, not a component. NavButtons/HomeBtn/ThemeBtn are
   deliberately NOT stubbed: the LibraryNav stub short-circuits before any of
   them is referenced. */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { ScripturesHome } from './ScripturesHome.jsx';

const GENRES = {
  ot: [
    { id: 'law', label: 'The Law', detail: 'Torah', books: [
      { id: 'genesis', title: 'Genesis', detail: '50 Chapters' },
      { id: 'exodus', title: 'Exodus', detail: '40 Chapters' },
    ] },
  ],
  nt: [
    { id: 'gospels', label: 'The Gospels', detail: 'Good News', books: [
      { id: 'matthew', title: 'Matthew', detail: '28 Chapters' },
    ] },
  ],
};

// The real table from index.html:427-431 — order is load-bearing (it defines
// the cycle) and so are the labels (the transient caption prints them).
const LAYOUT_OPTIONS = [
  { id: 'genre', label: 'Genre Grid', desc: '' },
  { id: 'compact', label: 'Compact List', desc: '' },
  { id: 'grid', label: 'Book Grid', desc: '' },
  { id: 'canonical', label: 'Canonical Scroll', desc: '' },
];

const GLOBALS = ['SCRIPTURE_GENRES', 'BOOKS', 'CANON_SUBTITLES', 'SCRIPTURE_LAYOUT_OPTIONS', 'translationName', 'ScreenLayout', 'LibraryNav'];

beforeEach(() => {
  // window.X, not globalThis.X — tools/globals.generated.d.ts gives Window a
  // permissive index signature but declares the bare names as `const`, which
  // (correctly) does NOT widen `typeof globalThis`. jsdom aliases the two.
  window.SCRIPTURE_GENRES = GENRES;
  window.BOOKS = {
    genesis: { chapters: new Array(50) },
    exodus: { chapters: new Array(40) },
    matthew: { chapters: new Array(28) },
  };
  window.CANON_SUBTITLES = { genesis: 'In the Beginning' };
  window.SCRIPTURE_LAYOUT_OPTIONS = LAYOUT_OPTIONS;
  window.translationName = () => 'New King James Version';
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.__bibleCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded: true };
  window.__loadBibleCorpus = () => Promise.resolve();
  window.__loadMatthewCorpus = () => Promise.resolve();
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((g) => { delete window[g]; });
  delete window.__bibleCorpus;
  delete window.__loadBibleCorpus;
  delete window.__loadMatthewCorpus;
});

const props = {
  onSelect: () => {}, onGenre: () => {}, onBack: () => {}, onSearch: () => {},
  onHistory: () => {}, onSettings: () => {},
  theme: 'dark', onThemeChange: () => {}, onCycleLayout: () => {},
  translation: 'nkjv',
};

const renderAt = (layout, extra) => render(<ScripturesHome {...props} layout={layout} {...extra} />);

/* r-bindex (W2h): one screen, two views behind a Groups | All books switch. Groups is 'genre'; every other
   persisted value (compact, grid, canonical, unknown) reads as All books, so nothing renders blank. */
describe('ScripturesHome Groups | All books', () => {
  const titles = (c) => [...c.querySelectorAll('.ui-row-title')].map((e) => e.textContent);

  it('Groups lists the genres under Old and New Testament, with books and chapters counted', () => {
    const { container } = renderAt('genre');
    expect([...container.querySelectorAll('.ui-label')].map((e) => e.textContent.trim()).join('|')).toMatch(/Old Testament.*New Testament/);
    expect(titles(container)).toEqual(['The Law', 'The Gospels']);
    expect(container.textContent).toContain('2 books · 90 chapters');
    expect(container.textContent).toContain('1 book · 28 chapters');
  });

  it.each(['compact', 'grid', 'canonical', 'something-old'])('%s reads as All books: every book, its chapters', (layout) => {
    const { container } = renderAt(layout);
    expect(titles(container)).toEqual(['Genesis', 'Exodus', 'Matthew']);
    expect(container.textContent).toContain('50 chapters');
  });

  it('a missing value is Groups', () => {
    expect(titles(renderAt(undefined).container)).toEqual(['The Law', 'The Gospels']);
  });

  it('keeps the fill-screen .scriptures-landing class', () => {
    expect(renderAt('genre').container.querySelector('.home-screen.scriptures-landing')).not.toBeNull();
  });

  it('the switch writes genre or canon through onCycleLayout', () => {
    const onCycleLayout = vi.fn();
    const { getByRole } = renderAt('genre', { onCycleLayout });
    act(() => { fireEvent.click(getByRole('radio', { name: 'All books' })); });
    expect(onCycleLayout).toHaveBeenCalledWith('canon');
    cleanup();
    const again = renderAt('canon', { onCycleLayout });
    act(() => { fireEvent.click(again.getByRole('radio', { name: 'Groups' })); });
    expect(onCycleLayout).toHaveBeenLastCalledWith('genre');
  });

  it('a genre row opens the genre, a single-book genre opens its book, a book row opens the book', () => {
    const onGenre = vi.fn(); const onSelect = vi.fn();
    const g = renderAt('genre', { onGenre, onSelect });
    act(() => { fireEvent.click(g.getByText('The Law')); });
    expect(onGenre).toHaveBeenCalledWith('law');
    cleanup();
    const b = renderAt('canon', { onGenre, onSelect });
    act(() => { fireEvent.click(b.getByText('Exodus')); });
    expect(onSelect).toHaveBeenCalledWith('exodus');
  });
});

describe('ScripturesHome — the translation pill (mw17 A02.1, r-bindex)', () => {
  const OPTS = [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' }, { id: 'rvr', label: 'RVR1960', desc: 'Reina-Valera 1960 (Español) — Spanish · menus stay in English' }];
  beforeEach(() => {
    window.TRANSLATION_OPTIONS = OPTS;
    window.ReactDOM = ReactDOM;
  });
  afterEach(() => { delete window.TRANSLATION_OPTIONS; });

  it('is a button that opens "Bible translation" and switches the translation', () => {
    const onTranslation = vi.fn();
    const { getByRole } = renderAt('genre', { onTranslation });
    const btn = getByRole('button', { name: /Bible translation: .*Change/ });
    expect(btn.textContent).toContain('NKJV');
    act(() => { fireEvent.click(btn); });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog && dialog.textContent).toMatch(/Bible translation/);
    expect(dialog.textContent).toContain('The default');
    const rvr = [...dialog.querySelectorAll('button')].find((b) => /Reina-Valera/.test(b.textContent));
    expect(rvr.textContent).toContain('RVR1960');
    act(() => { fireEvent.click(rvr); });
    expect(onTranslation).toHaveBeenCalledWith('rvr');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('stays plain text without a writer', () => {
    const { container } = renderAt('genre');
    expect(container.querySelector('span.rd-trans-pill')).not.toBeNull();
    expect(container.querySelector('button.rd-trans-pill')).toBeNull();
  });
});
