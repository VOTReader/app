// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HighlightsScreen — the search box joins the other index searches (C2-C [C9]).
   ═══════════════════════════════════════════════════════════════════════
   Notes / Bookmarks / Links / History all render
   `<input class="notes-index-search" type="search">`. Highlights rendered
   `<input class="hlx-search" type="text">` — no platform clear affordance, no
   search keyboard, a private class, and its styling in a JS-INJECTED
   stylesheet that the static sheet's tooling cannot see.

   The input now carries BOTH classes and `type="search"`; the three
   `.hlx-search` rules moved to app.css (immediately after
   `.notes-index-search`, where they still win every property they declare),
   so the box renders exactly as it did.

   These are also this screen's first tests (BACKLOG [D6] names the gap).
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { HighlightsScreen } from './HighlightsScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AnnotationStore', 'relativeDate',
  '_bookmarkSourceLabel'];

const MARKS = {
  'bible:psalms:23:1': [
    { id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100, updated: 100 },
  ],
  'bible:john:3:16': [
    { id: 'a2', groupId: 'g2', kind: 'underline', color: 'blue', text: 'For God so loved the world', created: 200, updated: 200 },
  ],
};

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  globalThis.relativeDate = () => '';
  globalThis._bookmarkSourceLabel = (hlKey) => hlKey;
  globalThis.AnnotationStore = {
    subscribe: () => () => {}, getVersion: () => 0, all: () => MARKS,
  };
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const show = () => render(
  <HighlightsScreen onBack={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} />,
);

const box = () => document.querySelector('input[placeholder="Search marks…"]');
const rows = () => [...document.querySelectorAll('.hlx-row .hlx-text')].map((el) => el.textContent);

describe('HighlightsScreen — search-box parity [C9]', () => {
  it('is a real search input, not a text input', () => {
    show();
    expect(box().getAttribute('type')).toBe('search');
  });

  it('carries the shared index-search class alongside its own', () => {
    show();
    const cls = box().className.split(/\s+/);
    expect(cls).toContain('notes-index-search');
    expect(cls).toContain('hlx-search');
  });

  it('names itself the way its siblings do', () => {
    show();
    expect(box().getAttribute('aria-label')).toBe('Search marks');
  });

  it('still filters the marks it always filtered', () => {
    show();
    expect(rows()).toHaveLength(2);
    fireEvent.change(box(), { target: { value: 'shepherd' } });
    expect(rows()).toEqual(['“The Lord is my shepherd”']);
    fireEvent.change(box(), { target: { value: '' } });
    expect(rows()).toHaveLength(2);
  });

  it('keeps the sort toggle and the filter chips beside it untouched', () => {
    show();
    expect(document.querySelector('.hlx-sort-row .notes-index-sort-btn').textContent).toBe('Sort: Newest ↓');
    expect([...document.querySelectorAll('.hlx-type-chip')].map((c) => c.textContent))
      .toEqual(['All', 'Highlights', 'Underlines']);
  });
});

describe('HighlightsScreen — the migrated stylesheet [C9]', () => {
  it('no longer injects .hlx-search rules (they live in app.css now)', () => {
    show();
    const sheet = document.getElementById('hlx-styles');
    expect(sheet).toBeTruthy();                       // the rest of the screen still injects
    expect(sheet.textContent).toContain('.hlx-row');
    expect(sheet.textContent).not.toContain('.hlx-search');
  });

  it('keeps the classes the injected sheet still owns', () => {
    show();
    const sheet = document.getElementById('hlx-styles');
    for (const cls of ['.hlx-controls', '.hlx-sort-row', '.hlx-type-chip', '.hlx-list']) {
      expect(sheet.textContent, cls).toContain(cls);
    }
  });
});
