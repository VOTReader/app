// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* WtlbEntryView — the entry names itself once its hero has gone (search200 UX B10, item 1).
   The same band LetterView draws: a WTLB / Blessed / Holy Days entry or an Answers topic
   landed on mid-way says its eyebrow over its title once the hero has scrolled up. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

vi.mock('../../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; } }; });

const GLOBALS = ['ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'WTLB_PART_LABELS', 'COL_BY_KEY', 'colLetterArr', 'colPreface',
  'wtlbHlKey', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText', 'lookupVersesFromBooks', 'StaticSubtree', 'IntersectionObserver'];

class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; FakeIO.all.push(this); }
  observe(el) { this.els.push(el); }
  disconnect() { this.disconnected = true; }
  fire(isIntersecting, bottom) {
    this.cb(this.els.map((target) => ({ target, isIntersecting, boundingClientRect: { top: bottom - 200, bottom }, rootBounds: { top: 72 } })));
  }
}
FakeIO.all = [];
/* the band's observer: the live one watching the hero (the install card keeps one too) */
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
  globalThis.WTLB_PART_LABELS = { wtlb1: 'The Words of The Lord To His Brethren' };
  globalThis.COL_BY_KEY = new Map([
    ['wtlb1', { volKey: 'wtlb1', kind: 'wtlb', label: 'The Words of The Lord To His Brethren', letterScreen: 'wtlb-entry' }],
    ['answers', { volKey: 'answers', kind: 'wtlb', label: 'Answers', letterScreen: 'answers-entry' }],
  ]);
  globalThis.colLetterArr = () => [];
  globalThis.colPreface = () => null;
  globalThis.wtlbHlKey = (vol, id, i) => `${vol}:${id}:${i}`;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = () => null;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  globalThis.IntersectionObserver = FakeIO;
  window.navHandoff = { peek: () => null, clear: () => {} };
});
afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const ENTRY = {
  id: 'service-and-sacrifice', title: 'Service and Sacrifice', num: 12, type: 'wtlb',
  paragraphs: [{ align: 'justify', text: 'Love one another.' }], prevEntry: null, nextEntry: null,
};
const renderEntry = (props = {}, entry = ENTRY) => render(
  <WtlbEntryView entry={entry} volKey="wtlb1" partLabel="The Words of The Lord To His Brethren" theme="dark"
    markAsReadEnabled={false} footnotesMode={true} onNavigate={() => {}} {...props} />,
);
const band = () => document.querySelector('.mini-title');

describe('WtlbEntryView — the sticky mini title (B10 item 1)', () => {
  it('names the entry, its collection and number over its title, hidden until the hero has gone', () => {
    renderEntry();
    expect(band().querySelector('.mini-title-eyebrow').textContent).toBe('The Words of The Lord To His Brethren \xB7 12');
    expect(band().querySelector('.mini-title-name').textContent).toBe('Service and Sacrifice');
    expect(band().classList.contains('shown')).toBe(false);
    const io = liveIO();
    expect(io).toBeTruthy();
    act(() => io.fire(false, 30));
    expect(band().classList.contains('shown')).toBe(true);
  });

  it('an Answers topic says Answers and where it is filed, as its hero does', () => {
    renderEntry({ volKey: 'answers', partLabel: 'Answers' }, { ...ENTRY, id: 'regarding-obedience', title: 'Regarding Obedience', group: 'Commandment 1' });
    const eyebrow = band().querySelector('.mini-title-eyebrow').textContent;
    const words = (t) => t.replace(/\s+/g, ' ').trim(); // the hero keeps its dot with no-break spaces
    expect(eyebrow).toBe(words(document.querySelector('.hero-eyebrow').textContent));
    expect(eyebrow.startsWith('Answers \xB7 ')).toBe(true);
  });

  it('hangs under the "Back to" row when there is one; an inert peek draws none', () => {
    renderEntry({ backHint: { title: 'results' }, onBack: () => {} });
    expect(band().parentElement.classList.contains('back-hint-row')).toBe(true);
    cleanup();
    renderEntry({ inert: true });
    expect(band()).toBeNull();
  });
});
