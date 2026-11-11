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
import * as ReactDOM from 'react-dom';
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
  globalThis.ReactDOM = ReactDOM;
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

const sortBtn = () => document.querySelector('.lib-qline .ui-tool');
const sideLabels = (side) => [...document.querySelectorAll('.link-row')]
  .map((row) => row.querySelectorAll('.link-half-title')[side === 'source' ? 0 : 1].textContent);
const pick = (name) => {
  fireEvent.click(sortBtn());
  fireEvent.click([...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes(name)));
};

describe('LinksScreen — the sort sheet reaches every implemented order', () => {
  it('starts newest-first and says so', () => {
    show();
    expect(sortBtn().getAttribute('aria-label')).toBe('Sort: Newest first');
    expect(sideLabels('source')).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('oldest-first', () => {
    show();
    pick('Oldest first');
    expect(sideLabels('source')).toEqual(['Zeta', 'Mu', 'Alpha']);
  });

  it('From A-Z — which nothing could reach before', () => {
    show();
    pick('From A-Z');
    expect(sideLabels('source')).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('To A-Z — likewise', () => {
    show();
    pick('To A-Z');
    expect(sideLabels('target')).toEqual(['Alpha', 'Mu', 'Tau']);
  });

  it('sorts the FILTERED list, not the whole store', () => {
    show();
    fireEvent.change(document.querySelector('input[type="search"]'), { target: { value: 'alpha' } });
    pick('From A-Z');
    // Both links touching Alpha survive; the Mu→Tau link does not.
    expect(sideLabels('source')).toEqual(['Alpha', 'Zeta']);
  });
});
