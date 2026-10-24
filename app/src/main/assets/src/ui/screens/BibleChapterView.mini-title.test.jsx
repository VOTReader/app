// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — a chapter landed on mid-way names itself (U04.7 / U07.3). A shared verse link or a search hit
   opens mid-chapter, where the top bar shows only icons. Once the hero has scrolled away, the band the letters have
   (MiniTitleBand) says "John · Chapter 3" over the hero's own title. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { BibleChapterView } from './BibleChapterView.jsx';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS',
];
let priorIO;

class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; FakeIO.all.push(this); }
  observe(el) { this.els.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fire(isIntersecting, bottom) {
    this.cb(this.els.map((target) => ({ target, isIntersecting, boundingClientRect: { top: bottom - 200, bottom }, rootBounds: { top: 72 } })));
  }
}
FakeIO.all = [];
const liveIO = () => FakeIO.all.filter((o) => !o.disconnected && o.els.includes(document.querySelector('.hero'))).pop();

beforeEach(() => {
  FakeIO.all = [];
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
  globalThis.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV', desc: 'x' }];
  priorIO = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
  globalThis.IntersectionObserver = FakeIO;
});
afterEach(() => {
  cleanup();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  if (priorIO) Object.defineProperty(globalThis, 'IntersectionObserver', priorIO);
  else delete globalThis.IntersectionObserver;
});

const CH = (num, title) => ({ num, title, sections: [{ heading: null, verses: [{ n: 16, text: 'For God so loved the world' }] }] });
const JOHN = { id: 'john', title: 'John', subtitle: 'The Gospel According to John', chapters: [CH(2, 'Water into Wine'), CH(3, 'The New Birth'), CH(4, 'The Woman of Samaria')] };
const at = (num, extra = {}) => (
  <BibleChapterView book={JOHN} chapter={JOHN.chapters[num - 2]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} showChapterTitle={true} {...extra} />
);
const band = () => document.querySelector('.mini-title');

describe('BibleChapterView — the sticky mini title (U04.7)', () => {
  it('names the book and chapter over the hero title, hidden while the hero shows', () => {
    render(at(3));
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('John \xB7 Chapter 3');
    expect(band().querySelector('.mini-title-name').textContent).toBe('The New Birth');
    expect(band().getAttribute('aria-hidden')).toBe('true');
    expect(band().parentElement.className).toBe('mini-title-anchor');
    const io = liveIO();
    expect(io.opts.root).toBe(document.querySelector('.screen-scroll'));
    act(() => io.fire(true, 300));
    expect(band().classList.contains('shown')).toBe(false);
    act(() => io.fire(false, 40));
    expect(band().classList.contains('shown')).toBe(true);
  });

  it('says the hero’s words: the book subtitle when chapter titles are off', () => {
    render(at(3, { showChapterTitle: false }));
    expect(band().querySelector('.mini-title-name').textContent).toBe('The Gospel According to John');
    expect(document.querySelector('.hero-title').textContent).toBe('The Gospel According to John');
  });

  it('hangs under the "Back to" row when there is one', () => {
    render(at(3, { backHint: { title: 'results', plain: true }, onTapThroughBack: () => {} }));
    expect(band().parentElement.classList.contains('back-hint-row')).toBe(true);
    expect(document.querySelectorAll('.mini-title')).toHaveLength(1);
  });

  it('a swipe peek draws no band, and the next chapter starts hidden', () => {
    const { rerender } = render(at(3));
    act(() => liveIO().fire(false, 40));
    expect(band().classList.contains('shown')).toBe(true);
    rerender(at(4));
    expect(band().classList.contains('shown')).toBe(false);
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('John \xB7 Chapter 4');
    cleanup();
    render(at(3, { inert: true }));
    expect(band()).toBeNull();
  });
});

/* A02.2: plain Matthew opens the same chapter in the Matthew Study Bible from its hero. */
describe('BibleChapterView — Read with study notes (A02.2)', () => {
  it('shows the link only when the route offers it, and a tap takes it', () => {
    let went = 0;
    render(at(3, { onStudyNotes: () => { went++; } }));
    const link = document.querySelector('.hero-study-link');
    expect(link.textContent).toBe('Read with study notes \u203A');
    link.click();
    expect(went).toBe(1);
    cleanup();
    render(at(3));
    expect(document.querySelector('.hero-study-link')).toBeNull();
  });
});
