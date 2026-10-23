// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* WtlbEntryView — the inline scripture sheet's verse text follows the corpus (sweep v73).
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT. openSheetForRef looked the verse up ONCE, at tap time, and kept
   the answer in state. lookupVerse falls back to lookupVersesFromBooks, which
   returns null until the lazy Bible corpus (BOOKS) has loaded. A reader who
   tapped a cite that neither entry.scriptures nor WTLB_SCRIPTURES carries
   before the corpus landed (an Answers topic on a cold boot) got "Verse text
   not available in app data", and it stayed that way after the corpus loaded
   and App re-rendered the entry, while the footnote list under the same entry
   (which looks the verse up on every render) filled in.

   The sheet now derives its text from scriptureRef at render time.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { modalRegistry } from '../../hooks/use-modal-registry.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('../../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; } }; });

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'useMarkAsRead', 'WTLB_SCRIPTURES', 'colLetterArr', 'colPreface',
  'wtlbHlKey', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText',
  'lookupVersesFromBooks', 'StaticSubtree', 'COL_BY_KEY'];

const REF = 'John 3:16';
const VERSE = 'For God so loved the world…';

/** The lazy Bible corpus, as lookupVersesFromBooks sees it: null until loaded. */
let bibleLoaded = false;

beforeEach(() => {
  bibleLoaded = false;
  modalRegistry._reset();
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children }) => <div data-testid="screen-layout">{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = () => null;
  globalThis.useMarkAsRead = () => {};
  // The ref is in neither dict, so only the Bible corpus can answer it.
  globalThis.WTLB_SCRIPTURES = { 'Matthew 4:4': 'But He answered and said…' };
  globalThis.COL_BY_KEY = new Map();
  globalThis.colLetterArr = () => [];
  globalThis.colPreface = () => null;
  globalThis.wtlbHlKey = (id, i) => `${id}:${i}`;
  globalThis.ExpandableVerse = ({ text }) => <span className="fn-list-verse">{text}</span>;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = ({ text }) => <span>{text}</span>;
  globalThis.lookupVersesFromBooks = (ref) => (bibleLoaded && ref === REF ? VERSE : null);
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

// A Format B entry (WTLB Part Two). Answers topics draw their own page (AnswersTopic.jsx, inline cites only),
// and the sheet these tests read is the same one every Format B entry opens.
const ENTRY = {
  id: 'what-is-love', title: 'What Is Love?', num: 3,
  paragraphs: [{ align: 'justify', text: 'He gave His only Son {{ref:John 3:16}} for the world.' }],
  prevEntry: null, nextEntry: null,
};

const view = (footnotesMode) => (
  <WtlbEntryView
    entry={ENTRY}
    volKey="wtlb2"
    partLabel="Part Two"
    theme="dark"
    markAsReadEnabled={false}
    footnotesMode={footnotesMode}
    onNavigate={() => {}}
    onHome={() => {}}
  />
);

const sheetVerse = () => document.querySelector('.fn-sheet .sc-sheet-verse').textContent;

describe('WtlbEntryView scripture sheet text — follows the lazy Bible corpus (sweep v73)', () => {
  it('fills in the open sheet once the Bible corpus loads and the entry re-renders', () => {
    const { rerender } = render(view(false));
    fireEvent.click(document.querySelector('a.wtlb-cite'));
    // Tapped before BOOKS landed: nothing can answer the ref yet.
    expect(sheetVerse()).toBe('Verse text not available in app data');

    // The corpus lands; useLazyBundles re-renders App, which re-renders the entry.
    bibleLoaded = true;
    rerender(view(false));
    // THE RED PROOF: pre-fix the sheet kept the null it stored at tap time.
    expect(sheetVerse()).toBe(VERSE);
  });

  it('agrees with the footnote list under the same entry after the corpus loads', () => {
    const { rerender } = render(view(true));
    fireEvent.click(document.querySelector('.fn-ref, a.wtlb-cite'));
    bibleLoaded = true;
    rerender(view(true));
    expect(document.querySelector('.footnote-list .fn-list-verse').textContent).toBe(VERSE);
    expect(sheetVerse()).toBe(VERSE);
  });

  it('still shows the dict text straight away when the ref is in WTLB_SCRIPTURES', () => {
    globalThis.WTLB_SCRIPTURES = { [REF]: 'dict text' };
    render(view(false));
    fireEvent.click(document.querySelector('a.wtlb-cite'));
    expect(sheetVerse()).toBe('dict text');
  });
});
