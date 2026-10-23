// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — a verse found in its KJV wording opens in the KJV for this visit (search200 idea A, 2026-10-22,
   PICKS.md A). The search anchor names the edition (`edition: 'kjv'`); the chapter shows it, under one row beneath
   "‹ Back to results": "Shown in KJV, as you searched" and "Read in <the reader's edition>". The saved edition is not
   touched: the row's button, another chapter or the next visit read the reader's own again. A loaded recording still
   wins (the words follow the voice). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { BibleChapterView } from './BibleChapterView.jsx';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS', 'BIBLE_KJV',
];
let priorScrollIntoView;

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
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.TRANSLATION_OPTIONS = [
    { id: 'nkjv', label: 'NKJV', desc: 'x' },
    { id: 'rnkjv', label: 'NKJV-R', desc: 'x' },
    { id: 'kjv', label: 'KJV', desc: 'x' },
  ];
  globalThis.BIBLE_KJV = { exodus: { 20: [{ n: 13, text: 'Thou shalt not kill.' }, { n: 14, text: 'Thou shalt not commit adultery.' }] } };
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
  delete Element.prototype.scrollTo;
});

const CH = (num) => ({ num, title: `Ch ${num}`, sections: [{ heading: null, verses: [
  { n: 13, text: 'You shall not murder.' }, { n: 14, text: 'You shall not commit adultery.' },
] }] });
const EXODUS = { id: 'exodus', title: 'Exodus', chapters: [CH(19), CH(20), CH(21)] };
const RESULTS = { title: 'results', volumeLabel: null, plain: true };
const at = (num, anchor, extra = {}) => (
  <BibleChapterView book={EXODUS} chapter={EXODUS.chapters[num - 19]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} surpriseAnchor={anchor} backHint={RESULTS} onTapThroughBack={() => {}} {...extra} />
);
const verse = (n) => document.querySelector('#v-' + n).textContent;
const row = () => document.querySelector('.visit-ed-row');

describe('BibleChapterView — the KJV for this visit (idea A)', () => {
  it('opens in the KJV under one row beneath Back to results, which reads the reader’s edition again', () => {
    render(at(20, { type: 'verse', verses: [13], edition: 'kjv' }));
    expect(verse(13)).toContain('Thou shalt not kill.');
    expect(row()).not.toBeNull();
    expect(row().closest('.back-hint-row')).not.toBeNull();
    expect(row().textContent).toContain('Shown in KJV, as you searched');
    const btn = row().querySelector('button');
    expect(btn.textContent).toBe('Read in NKJV');
    fireEvent.click(btn);
    expect(verse(13)).toContain('You shall not murder.');
    expect(row()).toBeNull();
  });

  it('names the reader’s own edition on the button (a restored-name reader reads NKJV-R)', () => {
    render(at(20, { type: 'verse', verses: [13], edition: 'kjv' }, { translation: 'rnkjv' }));
    expect(row().querySelector('button').textContent).toBe('Read in NKJV-R');
  });

  it('the visit ends with the chapter: the next one, and this one again, read the reader’s edition', () => {
    const anchor = { type: 'verse', verses: [13], edition: 'kjv' };
    const { rerender } = render(at(20, anchor));
    expect(verse(13)).toContain('Thou shalt not kill.');
    rerender(at(21, anchor));
    expect(row()).toBeNull();
    rerender(at(20, anchor));
    expect(verse(13)).toContain('You shall not murder.');
  });

  it('no edition on the anchor (or the reader’s own) is no visit', () => {
    const { rerender } = render(at(20, { type: 'verse', verses: [13] }));
    expect(verse(13)).toContain('You shall not murder.');
    expect(row()).toBeNull();
    rerender(at(20, { type: 'verse', verses: [13], edition: 'kjv' }, { translation: 'kjv' }));
    expect(row()).toBeNull();
  });

  /* search200 resume1 walk: "the way of the slothful" opened Proverbs 15 in the KJV ten verses above 15:19. The landing
     centred the verse at 150 ms; the KJV arrived after it (a lazy edition) and the row and the new words moved it off. */
  it('a KJV that arrives after the landing centres the landed verse again, once', () => {
    const kjv = globalThis.BIBLE_KJV;
    delete globalThis.BIBLE_KJV;
    const calls = [];
    Element.prototype.scrollIntoView = function (o) { calls.push([this.id, o && o.block]); };
    const anchor = { type: 'verse', verses: [13], edition: 'kjv' };
    const { rerender } = render(at(20, anchor));
    vi.advanceTimersByTime(200);
    expect(verse(13)).toContain('You shall not murder.');
    const landed = calls.length;
    globalThis.BIBLE_KJV = kjv;
    rerender(at(20, anchor));
    expect(verse(13)).toContain('Thou shalt not kill.');
    expect(calls.slice(landed)).toEqual([['v-13', 'center']]);
    rerender(at(20, anchor));
    expect(calls.length).toBe(landed + 1);
  });

  it('a swipe peek (inert) never takes the visit', () => {
    render(at(20, { type: 'verse', verses: [13], edition: 'kjv' }, { inert: true }));
    expect(verse(13)).toContain('You shall not murder.');
    expect(row()).toBeNull();
  });
});
