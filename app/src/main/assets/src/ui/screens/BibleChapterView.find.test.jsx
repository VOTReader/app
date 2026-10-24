// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — Find in this chapter (idea 160, Corbin yes 2026-10-23). A Bible chapter offers the ⋯ menu's
   "Find in this chapter" like a letter does: the same field and pill (FindInUnit), over this chapter's verses
   only, and an inert swipe peek offers nothing. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { BibleChapterView } from './BibleChapterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { findPlaces } from '../../search/snippet.js';
import { pageMenu } from '../../utils/page-menu.js';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry',
  'OT_BOOK_IDS', 'HighlightableText', 'translateVerse', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'Highlight',
];
class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
const REAL_CSS = globalThis.CSS;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div className="screen-scroll">{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.OT_BOOK_IDS = new Set();
  globalThis.HighlightableText = ({ text, hlKey }) => <span data-hl-key={hlKey}>{text}</span>;
  globalThis.translateVerse = (v) => v && v.text;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.Highlight = FakeHighlight;
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  window.VotSearchMini = { findPlaces };
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = () => {};
  Range.prototype.getBoundingClientRect = () => ({ top: 900, bottom: 920, left: 0, right: 50, width: 50, height: 20 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  delete window.VotSearchMini;
  delete Element.prototype.scrollTo;
  delete Element.prototype.scrollIntoView;
  delete Range.prototype.getBoundingClientRect;
  globalThis.__votPageMenu = null;
});

const CH = { num: 3, title: 'Ch 3', sections: [{ heading: null, verses: [
  { n: 16, text: 'For God so loved the world that He gave His only begotten Son' },
  { n: 17, text: 'For God did not send His Son into the world to condemn the world' },
  { n: 18, text: 'He who believes in Him is not condemned' },
  { n: 19, text: 'And this is the condemnation, that the light has come into the world' },
] }] };
const JOHN = { id: 'john', title: 'John', chapters: [CH] };

describe('BibleChapterView — Find in this chapter (idea 160)', () => {
  it('offers the ⋯ menu item and finds in the chapter\'s verses', () => {
    render(<BibleChapterView book={JOHN} chapter={CH} translation="nkjv" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} surpriseAnchor={null} />);
    const it = (pageMenu() || []).find((i) => i.key === 'find-in-unit');
    expect(it && it.label).toBe('Find in this chapter');
    act(() => { it.onSelect(); });
    const field = document.querySelector('.find-pill-input');
    expect(field).not.toBeNull();
    act(() => { fireEvent.change(field, { target: { value: 'condemn' } }); });
    act(() => { vi.advanceTimersByTime(200); });
    // "condemn" (17), "condemned" (18), "condemnation" (19): word starts, the reader's own matching
    expect(document.querySelector('.find-pill-count').textContent).toMatch(/^1 of \d$/);
    const marks = [...CSS.highlights.get('vot-find').ranges, ...CSS.highlights.get('vot-find-current').ranges].map((r) => r.toString());
    expect(marks.sort()).toEqual(['condemn', 'condemnation', 'condemned']);
  });

  it('an inert peek offers nothing', () => {
    render(<BibleChapterView book={JOHN} chapter={CH} translation="nkjv" theme="dark" markAsReadEnabled={false} onNavigate={() => {}} surpriseAnchor={null} inert />);
    expect(pageMenu()).toBeNull();
  });
});
