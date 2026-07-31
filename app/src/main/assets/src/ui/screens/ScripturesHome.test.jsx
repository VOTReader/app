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
  onHistory: () => {}, onSettings: () => {}, onMatthewStudy: () => {},
  theme: 'dark', onThemeChange: () => {}, onCycleLayout: () => {},
  translation: 'nkjv',
};

const renderAt = (layout, extra) => render(<ScripturesHome {...props} layout={layout} {...extra} />);

describe('ScripturesHome layout branches', () => {
  it.each([
    ['genre', '.genre-columns'],
    ['compact', '.compact-list'],
    ['grid', '.flat-grid'],
    ['canonical', '.canon-scroll'],
  ])('renders the %s branch', (layout, sel) => {
    const { container } = renderAt(layout);
    expect(container.querySelector(sel)).not.toBeNull();
  });

  it('adds the fill-screen .scriptures-landing class only on the genre branch', () => {
    expect(renderAt('genre').container.querySelector('.home-screen.scriptures-landing')).not.toBeNull();
    cleanup();
    expect(renderAt('compact').container.querySelector('.scriptures-landing')).toBeNull();
  });

  it('falls through to the canonical scroll for an unknown persisted value', () => {
    const { container } = renderAt('some-retired-value');
    expect(container.querySelector('.canon-scroll')).not.toBeNull();
    expect(container.querySelector('.genre-columns')).toBeNull();
  });

  it('treats a missing value as the genre default', () => {
    const { container } = renderAt(undefined);
    expect(container.querySelector('.genre-columns')).not.toBeNull();
  });
});

describe('ScripturesHome layout cycle button', () => {
  const btn = (c) => c.querySelector('.scripture-layout-cycle-btn');

  it('carries the aria-label and names the CURRENT layout in its title', () => {
    const { container } = renderAt('grid');
    expect(btn(container).getAttribute('aria-label')).toBe('Change Scripture layout');
    expect(btn(container).getAttribute('title')).toBe('Layout: Book Grid — tap to change');
  });

  it('is present in every one of the four layouts', () => {
    for (const l of ['genre', 'compact', 'grid', 'canonical']) {
      const { container } = renderAt(l);
      expect(btn(container)).not.toBeNull();
      cleanup();
    }
  });

  it('fires onCycleLayout with the NEXT option id, in table order', () => {
    for (const [from, to] of [['genre', 'compact'], ['compact', 'grid'], ['grid', 'canonical']]) {
      const onCycleLayout = vi.fn();
      const { container } = renderAt(from, { onCycleLayout });
      fireEvent.click(btn(container));
      expect(onCycleLayout).toHaveBeenCalledWith(to);
      cleanup();
    }
  });

  it('wraps the last option back to the first', () => {
    const wrap = vi.fn();
    const { container } = renderAt('canonical', { onCycleLayout: wrap });
    fireEvent.click(btn(container));
    expect(wrap).toHaveBeenCalledWith('genre');
  });

  /* The silent-desync guard: an unknown persisted value resolves to
     options[0] exactly like SelectField does, so the FIRST tap lands on
     options[1] — never on an id outside the table. */
  it('cycles an unknown persisted value from the head of the table', () => {
    const onCycleLayout = vi.fn();
    const { container } = renderAt('some-retired-value', { onCycleLayout });
    expect(btn(container).getAttribute('title')).toBe('Layout: Genre Grid — tap to change');
    fireEvent.click(btn(container));
    expect(onCycleLayout).toHaveBeenCalledWith('compact');
  });

  it('shows the new layout label as a transient caption inside a polite live region', () => {
    vi.useFakeTimers();
    const { container } = renderAt('genre');

    const live = container.querySelector('.scripture-layout-cycle-caption');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');

    fireEvent.click(btn(container));
    expect(live.textContent).toBe('Compact List');

    act(() => { vi.advanceTimersByTime(1600); });
    expect(live.textContent).toBe('');
    vi.useRealTimers();
  });

  it('is omitted entirely when the option table is unavailable', () => {
    delete window.SCRIPTURE_LAYOUT_OPTIONS;
    const { container } = renderAt('genre');
    expect(btn(container)).toBeNull();
    expect(container.querySelector('.genre-columns')).not.toBeNull();
  });
});
