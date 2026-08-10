// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* ChapterView — the screen stops asserting "Matthew" (C2-C [C2]).
   ═══════════════════════════════════════════════════════════════════════
   ChapterView renders whatever `book` it is handed. It said "Matthew" in
   five places — the hero eyebrow and BOTH bottom-nav cards unconditionally,
   plus two `book.title || 'Matthew'` fallbacks feeding the chapter bookmark
   label and the "Back to …" pill of anything the study's scripture sheet
   navigates to. Today it only ever hosts the Matthew Study Bible, so nothing
   was visibly wrong — but a hardcoded book name on a component parameterised
   by book is a mislabel waiting for its second caller, and the misattribution
   class is exactly what the corpus audits exist to prevent.

   One derived label now feeds every site, and a book with no title drops the
   book half rather than inventing one.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChapterView } from './ChapterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

const GLOBALS = ['ScreenLayout', 'StickyChapterNav', 'LibraryNav', 'HomeBtn', 'NavButtons',
  'ChapterBookmarkBtn', 'HighlightableText', 'LinkIcon', 'BookmarkIcon', 'InlineEcho',
  'InlineNotes', 'ScriptureSheet', 'StudyPanels', 'studyHlKey', 'useMarkAsRead',
  'useModalRegistry'];

let bookmarkProps;

beforeEach(() => {
  bookmarkProps = null;
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.StickyChapterNav = () => null;
  globalThis.LibraryNav = LibraryNav;     // the REAL nav — the back label is its contract
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = ({ chapterBookmark }) => { bookmarkProps = chapterBookmark; return null; };
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.InlineEcho = () => null;
  globalThis.InlineNotes = () => null;
  globalThis.ScriptureSheet = () => null;
  globalThis.StudyPanels = () => null;
  globalThis.studyHlKey = (id, n) => `study:${id}:${n}`;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const CH = (num) => ({
  num, title: `Ch ${num}`,
  verses: [{ n: 1, text: 'a verse of the chapter' }],
  sections: [{ heading: null, verses: [{ n: 1, text: 'a verse of the chapter' }] }],
});

const book = (over = {}) => ({ id: 'matthew', title: 'Matthew', chapters: [CH(1), CH(2), CH(3)], ...over });

const renderCh = (bk = book(), chapterNum = 2, props = {}) => render(
  <ChapterView
    book={bk}
    chapter={bk.chapters.find((c) => c.num === chapterNum)}
    mode="pdf"
    theme="dark"
    markAsReadEnabled={false}
    onNavigate={() => {}}
    onIndex={() => {}}
    {...props}
  />,
);

const eyebrow = () => document.querySelector('.hero-eyebrow').textContent;
const navTitles = () => [...document.querySelectorAll('.bottom-nav-title')].map((t) => t.textContent);

describe('ChapterView — every label follows the book it was handed', () => {
  it('names Matthew when Matthew is the book (unchanged behaviour)', () => {
    renderCh();
    expect(eyebrow()).toBe('Matthew \xA0\xB7\xA0 Chapter 2');
    expect(navTitles()).toEqual(['Matthew 1', 'Matthew 3']);
    expect(bookmarkProps.label).toBe('Matthew 2 (Study)');
  });

  it('names a DIFFERENT book instead of saying Matthew', () => {
    // Pre-fix: eyebrow "Matthew · Chapter 2", nav cards "Matthew 1"/"Matthew 3",
    // bookmark "Matthew 2 (Study)" — on a screen showing Mark.
    renderCh(book({ id: 'mark', title: 'Mark' }));
    expect(eyebrow()).toBe('Mark \xA0\xB7\xA0 Chapter 2');
    expect(navTitles()).toEqual(['Mark 1', 'Mark 3']);
    expect(bookmarkProps.label).toBe('Mark 2 (Study)');
    expect(document.body.textContent).not.toContain('Matthew');
  });

  it('drops the book half rather than inventing one when the book has no title', () => {
    renderCh(book({ id: 'unknown', title: undefined }));
    expect(eyebrow()).toBe('Chapter 2');
    expect(navTitles()).toEqual(['Chapter 1', 'Chapter 3']);
    expect(bookmarkProps.label).toBe('Chapter 2 (Study)');
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('keys the chapter bookmark off book.id, not the label', () => {
    renderCh(book({ id: 'mark', title: 'Mark' }));
    expect(bookmarkProps.hlKey).toBe('study:mark-2');
  });

  it('names the book in the back affordance', () => {
    renderCh(book({ id: 'mark', title: 'Mark' }));
    const back = document.querySelector('.nav-back-icon');
    expect(back.getAttribute('aria-label')).toBe('Back to Mark');
  });
});
