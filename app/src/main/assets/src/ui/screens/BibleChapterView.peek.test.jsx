// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — cross-BOOK pager peeks (2026-07-19, owner-directed).
   ──────────────────────────────────────────────────────────────────
   A book boundary used to peek a "Next Book · 1 Timothy 1" card while the
   in-book neighbor peeked the real annotated page — the owner's screenshot.
   prevBook/nextBook are full BIBLE_BOOK_LIST book objects (same corpus), so
   the boundary now peeks the REAL neighbor book's first/last chapter through
   the same inert-screen path. The lone pseudo-book (Revelation's "Volume
   One" bridge — cross-corpus, cross-component) has no `id` and keeps the
   card. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { BibleChapterView } from './BibleChapterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

let capturedPager;

const STUBBED = [
  'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry',
  'OT_BOOK_IDS', 'HighlightableText', 'translateVerse', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon',
];

beforeEach(() => {
  capturedPager = null;
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = (props) => { capturedPager = props.pager; return <div data-testid="sl" />; };
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
});
afterEach(() => {
  cleanup();
  STUBBED.forEach((k) => { delete globalThis[k]; });
});

const CH = (num) => ({ num, title: `Ch ${num}`, sections: [{ heading: null, verses: [{ n: 1, text: 'In the beginning' }] }] });
const THESS = { id: '2thessalonians', title: '2 Thessalonians', chapters: [CH(1), CH(2), CH(3)] };
const TIMOTHY = { id: '1timothy', title: '1 Timothy', chapters: [CH(1), CH(2)] };
const PSEUDO_V1 = { title: 'Volume One', chapters: [{ num: 1 }] }; // the Revelation bridge — no id

const renderCh = (extra) => render(
  <BibleChapterView
    book={THESS}
    chapter={THESS.chapters[2]}   // chapter 3 — the last (the owner's screenshot position)
    translation="nkjv"
    theme="dark"
    markAsReadEnabled={false}
    onNavigate={() => {}}
    {...extra}
  />,
);

describe('BibleChapterView pager.peek at a BOOK boundary', () => {
  it('keeps the tappable chapter title as an h1 containing a native button', () => {
    globalThis.ScreenLayout = ({ children, pager }) => { capturedPager = pager; return <main>{children}</main>; };
    renderCh({ showChapterTitle: true, titleFocusHidden: false, setTitleFocusHidden: () => {} });
    expect(screen.getByRole('heading', { level: 1, name: 'Ch 3' })).toBeTruthy();
    // The button's accessible name IS the title text (name-from-content) — an
    // aria-label here would hide the title from screen readers entirely.
    expect(screen.getByRole('button', { name: 'Ch 3' })).toBeTruthy();
  });

  it('peeks the REAL next book’s first chapter — not a card (the owner’s 2 Thess → 1 Tim case)', () => {
    renderCh({ nextBook: TIMOTHY });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.book).toBe(TIMOTHY);
    expect(desc.el.props.chapter).toBe(TIMOTHY.chapters[0]);
    expect(desc.el.props.inert).toBe(true);
  });

  it('peeks the REAL previous book’s LAST chapter from a first chapter', () => {
    renderCh({ chapter: THESS.chapters[0], prevBook: TIMOTHY });
    const desc = capturedPager.peek('prev');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.book).toBe(TIMOTHY);
    expect(desc.el.props.chapter).toBe(TIMOTHY.chapters[1]); // last chapter
  });

  it('an in-book neighbor still peeks the current book (unchanged path)', () => {
    renderCh({ chapter: THESS.chapters[1] });
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.book).toBe(THESS);
    expect(desc.el.props.chapter).toBe(THESS.chapters[2]);
  });

  it('the Revelation → Volume One pseudo-book (no id) keeps the boundary card', () => {
    renderCh({ nextBook: PSEUDO_V1, nextBoundaryTitle: 'Volume One · Letter 1' });
    const desc = capturedPager.peek('next');
    expect(desc).toEqual({ kind: 'boundary', eyebrow: 'Next Book', title: 'Volume One · Letter 1' });
  });

  it('a true dead end (no neighbor book) peeks nothing (rubber-band)', () => {
    renderCh({});
    expect(capturedPager.peek('next')).toBe(null);
  });
});
