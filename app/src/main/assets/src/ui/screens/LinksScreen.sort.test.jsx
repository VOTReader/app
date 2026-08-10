// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* LinksScreen — the sort modes stop being dead code (C2-C [C10]).
   ═══════════════════════════════════════════════════════════════════════
   displayLinks' comparator has always carried four branches: 'oldest',
   'source-az', 'target-az', and the newest-first default. The affordance
   above it was a two-state recent/oldest toggle, so two of those four were
   UNREACHABLE — implemented, tested by nothing, reachable by no one, and
   indistinguishable from a finished feature to the next reader of the file.

   Wire or delete; the half-state is the finding. Wired: the same one button
   (this screen's existing control shape) now cycles the whole list.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LinksScreen } from './LinksScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'LinkStore', 'relativeDate', 'ConfirmStrip'];

/** created ASC: zeta→alpha oldest, alpha→mu newest. */
const LINKS = [
  { id: 'l1', created: 100, source: { type: 'bible', label: 'Zeta', bookId: 'zeta', chapter: 1 }, target: { type: 'bible', label: 'Alpha', bookId: 'alpha', chapter: 1 } },
  { id: 'l2', created: 200, source: { type: 'bible', label: 'Mu', bookId: 'mu', chapter: 1 }, target: { type: 'bible', label: 'Tau', bookId: 'tau', chapter: 1 } },
  { id: 'l3', created: 300, source: { type: 'bible', label: 'Alpha', bookId: 'alpha', chapter: 1 }, target: { type: 'bible', label: 'Mu', bookId: 'mu', chapter: 1 } },
];

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.relativeDate = () => '';
  globalThis.LinkStore = {
    subscribe: () => () => {}, getVersion: () => 0,
    all: () => LINKS.slice(), remove: () => {},
  };
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const show = () => render(
  <LinksScreen onBack={() => {}} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />,
);

const sortBtn = () => document.querySelector('.notes-index-sort-btn');
const sideLabels = (side) => [...document.querySelectorAll('.link-row-' + side + ' .link-row-side-label')]
  .map((el) => el.textContent);
const step = () => fireEvent.click(sortBtn());

describe('LinksScreen — the sort cycle reaches every implemented mode', () => {
  it('starts newest-first', () => {
    show();
    expect(sortBtn().textContent).toBe('Sort: Newest ↓');
    expect(sideLabels('source')).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('steps to oldest-first', () => {
    show();
    step();
    expect(sortBtn().textContent).toBe('Sort: Oldest ↑');
    expect(sideLabels('source')).toEqual(['Zeta', 'Mu', 'Alpha']);
  });

  it('reaches source A-Z — which nothing could reach before', () => {
    show();
    step(); step();
    expect(sortBtn().textContent).toBe('Sort: Source A-Z');
    expect(sideLabels('source')).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('reaches target A-Z — likewise', () => {
    show();
    step(); step(); step();
    expect(sortBtn().textContent).toBe('Sort: Target A-Z');
    expect(sideLabels('target')).toEqual(['Alpha', 'Mu', 'Tau']);
  });

  it('wraps back to the start on the fourth press', () => {
    show();
    step(); step(); step(); step();
    expect(sortBtn().textContent).toBe('Sort: Newest ↓');
    expect(sideLabels('source')).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('names itself as a cycle, not a toggle', () => {
    show();
    expect(sortBtn().getAttribute('title')).toBe('Cycle sort order');
  });

  it('sorts the FILTERED list, not the whole store', () => {
    show();
    fireEvent.change(document.querySelector('input.notes-index-search'), { target: { value: 'alpha' } });
    step(); step();   // → source A-Z
    // Both links touching Alpha survive; the Mu→Tau link does not.
    expect(sideLabels('source')).toEqual(['Alpha', 'Zeta']);
  });
});
