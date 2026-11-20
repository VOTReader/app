// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView inside a reading plan's sitting (Corbin 11-19: "if you just swipe right or left, you lose the reading
   plan interface"). Inside a sitting the swipe, the arrows and the end of the page move between the day's readings only,
   the Holy Days album's way: never past either end of the day, never out of it. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { BibleChapterView } from './BibleChapterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { beginPlanSession, setPlanSessionHost, _resetPlanSessionForTests } from '../../utils/plan-session.js';

let capturedPager;
let host;
const STUBBED = ['ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav', 'useMarkAsRead', 'useModalRegistry',
  'useFocusTrap', 'OT_BOOK_IDS', 'HighlightableText', 'translateVerse', 'bibleHlKey', 'LinkIcon', 'BookmarkIcon', 'BOOKS', 'ReadingPlanStore'];

const CH = (num) => ({ num, title: `Ch ${num}`, sections: [{ heading: null, verses: [{ n: 1, text: 'In the beginning' }] }] });
const GENESIS = { id: 'genesis', title: 'Genesis', chapters: [CH(1), CH(2), CH(3), CH(4), CH(5)] };
const EXODUS = { id: 'exodus', title: 'Exodus', chapters: [CH(1)] };

beforeEach(() => {
  capturedPager = null;
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, pager }) => { capturedPager = pager; return <main>{children}</main>; };
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.useFocusTrap = () => null;
  globalThis.OT_BOOK_IDS = new Set();
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.translateVerse = (v) => v && v.text;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.BOOKS = { genesis: GENESIS, exodus: EXODUS };
  _resetPlanSessionForTests();
  host = { move: vi.fn(), open: vi.fn(), back: vi.fn(), markRead: vi.fn(), unmarkRead: vi.fn(), isRead: () => false, openPlans: vi.fn(), openNote: vi.fn() };
  setPlanSessionHost(host);
});
afterEach(() => { cleanup(); _resetPlanSessionForTests(); STUBBED.forEach((k) => { delete globalThis[k]; }); });

const sitting = () => {
  const run = startCatalogPlan('bible-year', null, new Date());     // day 1: Genesis 1-3
  ReadingPlanStore.put(run);
  act(() => { beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' }); });
};
const renderCh = (num, extra) => render(
  <BibleChapterView book={GENESIS} chapter={GENESIS.chapters[num - 1]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={vi.fn()} nextBook={EXODUS} onNextBook={vi.fn()} {...extra} />,
);

describe('BibleChapterView: swipe keeps the plan', () => {
  it('the last reading of the day: no page drags in after it (never Genesis 4, tomorrow), and the one before is the real page', () => {
    sitting();
    const onNavigate = vi.fn();
    renderCh(3, { onNavigate });
    expect(capturedPager.peek('next')).toBe(null);
    const prev = capturedPager.peek('prev');
    expect(prev.kind).toBe('screen');
    expect(prev.el.props.chapter.num).toBe(2);
    act(() => { capturedPager.onNext(); });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(host.move).not.toHaveBeenCalled();
    act(() => { capturedPager.onPrev(); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the first reading of the day: nothing before it; the next reading is the day’s', () => {
    sitting();
    renderCh(1);
    expect(capturedPager.peek('prev')).toBe(null);
    act(() => { capturedPager.onNext(); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
  });

  it('inside the sitting the page ends on the plan, not on Previous/Next chapter', () => {
    sitting();
    const { container } = renderCh(2);
    expect(container.querySelector('.bottom-nav')).toBeNull();
    expect(container.querySelector('.plan-end')).not.toBeNull();
  });

  it('outside a sitting the chapter swipes the Bible’s way, as before', () => {
    const onNavigate = vi.fn();
    const { container } = renderCh(3, { onNavigate });
    expect(container.querySelector('.bottom-nav')).not.toBeNull();
    expect(capturedPager.peek('next').el.props.chapter.num).toBe(4);
    act(() => { capturedPager.onNext(); });
    expect(onNavigate).toHaveBeenCalledWith(4);
  });
});
