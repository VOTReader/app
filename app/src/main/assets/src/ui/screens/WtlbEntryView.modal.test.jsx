// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* WtlbEntryView — modal-registry participation + back destination (C2-C).
   ═══════════════════════════════════════════════════════════════════════
   [C1] THE DEFECT. The inline scripture sheet claimed only
        window.__closeSheet — the older, DISJOINT slot the Android back
        handler reads (use-android-back.js:221). It never registered with
        the modal registry, so every registry consumer believed nothing was
        open while a reader had a verse sheet up on any of the ~400 Format B
        entries. The one that shows: use-autoscroll's `isModalOpen()` gate
        asks modalRegistry.isAnyOpen(); it read false and the transport kept
        scrolling the page out from under the open sheet.

        LetterView's two sheets have registered since W1.5(a.2); this is the
        sibling that was missed. Registration ONLY — the Escape LISTENER
        stays single-source in useAndroidBack's dispatcher, and the test
        below pins that no keydown listener was added here (two listeners
        race: the local one dismisses and unregisters, then the dispatcher
        sees an empty registry and navigates back — one press, two effects).

   [C3] The back affordance said "Index" — a generic noun, not a place —
        while every sibling reading screen names its destination.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { modalRegistry } from '../../hooks/use-modal-registry.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'useMarkAsRead', 'WTLB_SCRIPTURES', 'colLetterArr', 'colPreface',
  'wtlbHlKey', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText',
  'lookupVersesFromBooks', 'StaticSubtree', 'COL_BY_KEY'];

beforeEach(() => {
  modalRegistry._reset();
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;   // the REAL nav — [C3] is its contract
  globalThis.useMarkAsRead = () => {};
  globalThis.WTLB_SCRIPTURES = { 'Matthew 4:4': 'But He answered and said…' };
  globalThis.COL_BY_KEY = new Map();
  globalThis.colLetterArr = () => [];
  globalThis.colPreface = () => null;
  globalThis.wtlbHlKey = (id, i) => `${id}:${i}`;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = ({ text }) => <span>{text}</span>;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const ENTRY = {
  id: 'matters-of-the-heart', title: 'Matters of the Heart', num: 11,
  paragraphs: [{ align: 'justify', text: 'Man lives not by bread alone {{ref:Matthew 4:4}} but by every word.' }],
  prevEntry: null, nextEntry: null,
};

const renderEntry = (props = {}) => render(
  <WtlbEntryView
    entry={ENTRY}
    volKey="wtlb2"
    partLabel="Part Two"
    theme="dark"
    markAsReadEnabled={false}
    footnotesMode={false}
    onNavigate={() => {}}
    onHome={() => {}}
    {...props}
  />,
);

/** The inline `(Matthew 4:4)` cite — the only way in to this sheet. */
const openSheet = () => fireEvent.click(document.querySelector('a.wtlb-cite'));
const sheet = () => document.querySelector('.fn-sheet');

describe('WtlbEntryView scripture sheet — modal registry [C1]', () => {
  it('registers with the registry while the sheet is open (it never did)', () => {
    renderEntry();
    expect(modalRegistry.isAnyOpen()).toBe(false);
    openSheet();
    // THE RED PROOF: pre-fix this stayed false with the sheet visibly open,
    // which is exactly what use-autoscroll asked before it kept scrolling.
    expect(modalRegistry.isAnyOpen()).toBe(true);
    expect(modalRegistry.openIds()).toContain('wtlb-scripture-sheet');
    expect(sheet().className).toContain('open');
  });

  it('unregisters when the sheet closes, so the gate reopens', () => {
    renderEntry();
    openSheet();
    expect(modalRegistry.isAnyOpen()).toBe(true);
    fireEvent.click(document.querySelector('.fn-sheet-backdrop'));
    expect(modalRegistry.isAnyOpen()).toBe(false);
    expect(sheet().className).not.toContain('open');
  });

  it('hands the dispatcher a dismiss that actually closes the sheet', () => {
    renderEntry();
    openSheet();
    const top = modalRegistry.peek();
    expect(top.id).toBe('wtlb-scripture-sheet');
    act(() => { top.dismiss(); });      // what useAndroidBack's Escape branch calls
    expect(modalRegistry.isAnyOpen()).toBe(false);
    expect(sheet().className).not.toContain('open');
  });

  it('unregisters on unmount, leaving no phantom entry behind', () => {
    const view = renderEntry();
    openSheet();
    expect(modalRegistry.isAnyOpen()).toBe(true);
    view.unmount();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('adds NO keydown listener of its own — Escape stays single-source', () => {
    // The documented trap (use-modal-registry.js header): a per-modal Escape
    // listener races the app-level dispatcher and one press both dismisses
    // AND navigates back.
    const spy = vi.spyOn(window, 'addEventListener');
    renderEntry();
    openSheet();
    expect(spy.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(0);
    spy.mockRestore();
  });

  it('leaves the __closeSheet wiring intact (the back handler still works)', () => {
    renderEntry();
    openSheet();
    expect(typeof window.__closeSheet).toBe('function');
    act(() => { window.__closeSheet(); });
    expect(sheet().className).not.toContain('open');
  });
});

describe('WtlbEntryView back affordance [C3]', () => {
  const backBtn = () => document.querySelector('.nav-back-icon');

  it('names the part it returns to instead of the word "Index"', () => {
    renderEntry();
    expect(backBtn().getAttribute('title')).toBe('← Part Two');
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Part Two');
  });

  it('names The Blessed / Holy Days the same way', () => {
    renderEntry({ partLabel: 'Regarding The Holy Days' });
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Regarding The Holy Days');
  });

  it('keeps the old wording only when no part label exists at all', () => {
    renderEntry({ partLabel: null });
    expect(backBtn().getAttribute('aria-label')).toBe('Back to Index');
  });
});
