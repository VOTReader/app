// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — a verse landing's flash belongs to the chapter it landed in (v01-02).
   ──────────────────────────────────────────────────────────────────
   Improvement sweep 2026-09-22, finding v01-reading-02. A search or link lands on a verse: it
   gets the gold wash for 4 s and its hl-key goes to the read-along as `seekTo`. The chapter nav
   clears the anchor and shows the next chapter in the SAME component instance (no key), so the
   effect's cleanup cancelled the fade and nothing cleared the wash: verse 16 of the next
   chapter lit up, and a playing recording sought there. ChapterView.jsx carries the identical
   effect; its cases are in ChapterView.test.jsx. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { BibleChapterView } from './BibleChapterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry',
  'OT_BOOK_IDS', 'HighlightableText', 'translateVerse', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon',
];
let priorScrollIntoView;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.OT_BOOK_IDS = new Set();
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.translateVerse = (v) => v && v.text;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
});

const CH = (num) => ({ num, title: `Ch ${num}`, sections: [{ heading: null, verses: [
  { n: 1, text: 'In the beginning' }, { n: 2, text: 'And the earth was' },
] }] });
const JOHN = { id: 'john', title: 'John', chapters: [CH(1), CH(2), CH(3)] };
const at = (num, anchor) => (
  <BibleChapterView book={JOHN} chapter={JOHN.chapters[num - 1]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} surpriseAnchor={anchor} />
);

describe('BibleChapterView — a verse landing does not follow the reader to the next chapter (v01-02)', () => {
  it('flashes the landed verse, then lets go after 4 s (unchanged)', () => {
    render(at(2, { type: 'verse', verses: [2] }));
    expect(document.querySelector('#v-2').className).toContain('verse-surprise');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(document.querySelector('.verse-surprise')).toBeNull();
  });

  it('moving to the next chapter inside the 4 s does not carry the flash there', () => {
    const { rerender } = render(at(2, { type: 'verse', verses: [2] }));
    expect(document.querySelector('#v-2').className).toContain('verse-surprise');
    rerender(at(3, null));                       // the chapter nav clears the anchor, then moves
    expect(document.querySelector('.verse-surprise')).toBeNull();
  });

  it('nor when the way it moved left the anchor set', () => {
    const anchor = { type: 'verse', verses: [2] };
    const { rerender } = render(at(2, anchor));
    rerender(at(3, anchor));
    expect(document.querySelector('.verse-surprise')).toBeNull();
  });
});
