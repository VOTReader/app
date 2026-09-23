// @ts-nocheck — free-var globals stubbed per test, as WtlbEntryView.modal.test.jsx does
/* WTLB ENTRIES TOOK NO ANCHOR AT ALL (2026-09-20): a search hit opened the entry at its first paragraph.
   The entry now takes `surpriseAnchor` like LetterView: an excerpt is matched against each paragraph's
   text in the index's own domain ({{refs}} removed, whitespace squashed), the paragraph scrolls, pulses,
   and its hl-key goes to ReadAlongHighlight as `seekTo`. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

const seekToSeen = [];
const seekOffsetSeen = [];
vi.mock('../components/ReadAlongHighlight.jsx', () => ({
  ReadAlongHighlight: (props) => { seekToSeen.push(props.seekTo); seekOffsetSeen.push(props.seekOffset); return null; },
}));

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav', 'useMarkAsRead',
  'WTLB_SCRIPTURES', 'COL_BY_KEY', 'colLetterArr', 'colPreface', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText',
  'lookupVersesFromBooks', 'StaticSubtree'];
const scrolled = [];
beforeEach(() => {
  vi.useFakeTimers();
  seekToSeen.length = 0; seekOffsetSeen.length = 0; scrolled.length = 0;
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.WTLB_SCRIPTURES = { 'Matthew 4:4': 'But He answered and said…' };
  globalThis.COL_BY_KEY = new Map();
  globalThis.colLetterArr = () => [];
  globalThis.colPreface = () => null;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = ({ text }) => <span>{text}</span>;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  Element.prototype.scrollIntoView = function () { scrolled.push(this.getAttribute('data-hl-key')); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); GLOBALS.forEach((k) => { delete globalThis[k]; }); delete Element.prototype.scrollIntoView; });

const ENTRY = {
  id: 'matters-of-the-heart', title: 'Matters of the Heart', num: 11,
  paragraphs: [
    { align: 'justify', text: 'Man lives not by bread alone {{ref:Matthew 4:4}} but by every word.' },
    { align: 'center', text: '_**Come to Me,**_\n\nAll who are weary,\n\nAnd I will give you rest...' },
  ],
  prevEntry: null, nextEntry: null,
};
const renderEntry = (props = {}) => render(
  <WtlbEntryView entry={ENTRY} volKey="wtlb2" partLabel="Part Two" theme="dark" markAsReadEnabled={false} footnotesMode={false}
    onNavigate={() => {}} onHome={() => {}} {...props} />,
);

describe('WtlbEntryView — an excerpt anchor lands on the paragraph that holds it', () => {
  it('scrolls and pulses the paragraph, and hands its hl-key to the read-along as seekTo', () => {
    renderEntry({ surpriseAnchor: { type: 'excerpt', text: 'All who are weary, And I will give you rest' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['wtlb:matters-of-the-heart:1']);
    expect(document.querySelector('[data-hl-key="wtlb:matters-of-the-heart:1"]').className).toContain('pulse');
    expect(seekToSeen.at(-1)).toBe('wtlb:matters-of-the-heart:1');
    // Where the words start, in the index's domain of that paragraph ({{refs}} out, whitespace squashed).
    expect(seekOffsetSeen.at(-1)).toBe('_**Come to Me,**_ All who are weary, And I will give you rest...'.indexOf('All who'));
  });

  it('matches in the index domain: the {{ref}} is gone from the doc text, so an excerpt spanning it still lands', () => {
    renderEntry({ surpriseAnchor: { type: 'excerpt', text: 'bread alone but by every word' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['wtlb:matters-of-the-heart:0']);
  });

  it('an excerpt cut across a paragraph boundary lands on the paragraph that holds its TAIL', () => {
    // Same rule as LetterView (study find, 2026-09-22): the engine's cut can open
    // with the previous paragraph's last words; the shortest head then matched
    // THAT paragraph. The tail is tried at every length before the head shrinks.
    renderEntry({ surpriseAnchor: { type: 'excerpt', text: 'by every word. _**Come to Me,**_ All who are weary, And' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual(['wtlb:matters-of-the-heart:1']);
    // the 40-char tail is the whole of "_**Come to Me,**_ All who are weary, And": the seek starts there
    expect(seekOffsetSeen.at(-1)).toBe(0);
  });

  it('an anchor made for ANOTHER entry is ignored', () => {
    renderEntry({ surpriseAnchor: { type: 'excerpt', text: 'All who are weary', letterId: 'some-other-entry' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual([]);
  });

  it('nothing found: nothing scrolls, nothing seeks', () => {
    renderEntry({ surpriseAnchor: { type: 'excerpt', text: 'zebra crossing at dawn' } });
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrolled).toEqual([]);
    expect(seekToSeen.every((v) => v == null)).toBe(true);
  });
});

describe('WtlbEntryView — an Answers topic renders before the letters have landed', () => {
  // WTLB_SCRIPTURES rides the VOT corpus; an Answers topic is its own corpus.
  // A restored tab reopened straight onto a topic after a reload threw
  // "WTLB_SCRIPTURES is not defined" and took the whole app to its error screen.
  it('builds its footnotes with no WTLB_SCRIPTURES global at all', () => {
    delete globalThis.WTLB_SCRIPTURES;
    const topic = {
      id: 'regarding-pride', title: 'Regarding Pride', num: 105,
      paragraphs: [
        { align: 'justify', text: 'The pride of man {{ref:Proverbs 16:18}} goes before destruction.' },
        { align: 'right', text: '~ [From “Pride” ~ Words To Live By: Part One]' },
      ],
      related: [{ id: 'the-messiah', title: 'The Messiah' }],
      siteUrl: 'https://answersonlygodcangive.com/Regarding_Pride',
      prevEntry: null, nextEntry: null,
    };
    expect(() => render(
      <WtlbEntryView entry={topic} volKey="answers" partLabel="Answers" theme="dark" markAsReadEnabled={false} footnotesMode={true}
        onNavigate={() => {}} onHome={() => {}} />,
    )).not.toThrow();
    expect(document.querySelector('.footnote-list')).toBeTruthy();
    // Where it is filed, not its number in the site's page list.
    expect(document.querySelector('.hero-eyebrow').textContent).toBe('Answers · Walking With God');
    expect(document.querySelector('.related-card').textContent).toContain('The Messiah');
    expect(document.querySelector('.wtlb-source-line a').getAttribute('href')).toBe('https://answersonlygodcangive.com/Regarding_Pride');
  });
});
