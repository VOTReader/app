/* v2 keeps a record of reading as main does (reading-record.js; mw5, the 10-14 walk found v2 wrote none): the history
   entry, the place and the read marks, in main's shapes and main's stores, each behind main's own setting; a gate boot
   and a page whose text has not loaded write nothing. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  visitOf, withPlace, withRead, readKey, recordListen, useReadingRecord, DWELL_MS,
} from './reading-record.js';

const g = /** @type {any} */ (globalThis);
const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'LETTERS_V1_PREFACE', label: 'Volume One',
  kind: 'letter', indexScreen: 'vot-one-index' };
const HM = { volKey: 'hm', readKey: 'hidden-manna', globalName: 'HIDDEN_MANNA', prefaceGlobal: null, label: 'Hidden Manna',
  kind: 'letter', indexScreen: null };
const LETTER = { place: 'letter', collection: 'one', n: 2 };
const JOHN3 = { place: 'bible-chapter', book: 'john', chapter: 3 };

/** main's stores: vot-state kept in memory as StateStore keeps it, the rest spies. */
function install(state = {}, { ready = true } = {}) {
  const box = { state };
  g.StateStore = { isReady: () => ready, get: () => box.state, set: vi.fn((s) => { box.state = s; }) };
  g.HistoryStore = { isReady: () => ready, list: () => [], add: vi.fn() };
  g.ReadingStatsStore = { recordCompletion: vi.fn(), recordProgress: vi.fn(), recordPaceSample: vi.fn() };
  g.ReadingStreakStore = { recordReadingDay: vi.fn() };
  g.COL_BY_KEY = new Map([['one', ONE], ['hm', HM]]);
  g.LETTERS_V1 = [{ id: 'v1-01', num: 1, title: 'Chosen by God' }, { id: 'v1-02', num: 2, title: 'Honor Not the Day of the Dead' }];
  g.LETTERS_V1_PREFACE = { id: 'v1-preface', title: 'A Word of Warning' };
  g.HIDDEN_MANNA = [{ id: 'hm-01', num: 1, title: 'Manna' }];
  g.BOOKS = { john: { title: 'John', chapters: [{ num: 1 }, { num: 2 }, { num: 3, title: 'You Must Be Born Again' }] } };
  return box;
}

function Harness({ route, ready = true, live = true }) {
  const ref = React.useRef(null);
  useReadingRecord({ route, ready, scrollRef: ref, live });
  return <div ref={ref} />;
}

afterEach(() => {
  cleanup();
  for (const k of ['StateStore', 'HistoryStore', 'ReadingStatsStore', 'ReadingStreakStore', 'COL_BY_KEY', 'LETTERS_V1',
    'LETTERS_V1_PREFACE', 'HIDDEN_MANNA', 'BOOKS', '__onReadingComplete', '__readTrackerMeta', '__votAudioListened']) delete g[k];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('what a page is, in main\'s terms', () => {
  it("a letter: main's history entry, its collection's place and read key", () => {
    install();
    expect(visitOf(LETTER)).toEqual({
      key: 'lt:one:v1-02', active: 'vol:one', slot: 'lastReadLetterMap', at: 'one', value: 'v1-02', read: 'v1:volume-one:v1-02',
      entry: { type: 'letter', letterId: 'v1-02', letterTitle: 'Honor Not the Day of the Dead', letterNum: 2, volumeScreen: 'vot-one-index' },
    });
  });

  it('a preface is a letter with no number; Hidden Manna keeps its place and marks but never enters the history', () => {
    install();
    expect(visitOf({ place: 'letter', collection: 'one', preface: true }).entry)
      .toEqual({ type: 'letter', letterId: 'v1-preface', letterTitle: 'A Word of Warning', letterNum: null, volumeScreen: 'vot-one-index' });
    const hm = visitOf({ place: 'letter', collection: 'hm', n: 1 });
    expect(hm.entry).toBe(null);
    expect([hm.active, hm.read]).toEqual(['vol:hm', 'v1:hidden-manna:hm-01']);
  });

  it("a Bible chapter: main's chapter entry, lastReadChapters and v1:<book>:<chapter>", () => {
    install();
    expect(visitOf(JOHN3)).toEqual({
      key: 'ch:john:3', active: 'john', slot: 'lastReadChapters', at: 'john', value: 3, read: 'v1:john:3',
      entry: { type: 'chapter', bookId: 'john', bookTitle: 'John', chapterNum: 3, chapterTitle: 'You Must Be Born Again' },
    });
  });

  it('nothing while the text has not loaded, for a missing letter or chapter, or for a page that is not reading', () => {
    install();
    delete g.LETTERS_V1;
    delete g.BOOKS;
    expect(visitOf(LETTER)).toBe(null);
    expect(visitOf(JOHN3)).toBe(null);
    install();
    expect(visitOf({ place: 'letter', collection: 'one', n: 9 })).toBe(null);
    expect(visitOf({ place: 'bible-chapter', book: 'john', chapter: 22 })).toBe(null);
    expect(visitOf({ place: 'collection', collection: 'one' })).toBe(null);
    expect(visitOf({ place: 'bible-book', book: 'john' })).toBe(null);
  });

  it('the place and a read change only their own keys', () => {
    const s = { tabs: [1], activeReadKey: 'john', lastReadLetterMap: { two: 'v2-05' }, lastReadChapters: { john: 2 }, readItems: { a: true } };
    install();
    const v = visitOf(LETTER);
    expect(withPlace(s, v)).toEqual({ ...s, activeReadKey: 'vol:one', lastReadLetterMap: { two: 'v2-05', one: 'v1-02' } });
    const there = { ...s, activeReadKey: 'vol:one', lastReadLetterMap: { one: 'v1-02' } };
    expect(withPlace(there, v)).toBe(there);
    expect(withRead(s, 'a').readItems).toEqual({ a: 2 });
    expect(withRead({}, readKey('john', 3)).readItems).toEqual({ 'v1:john:3': 1 });
  });
});

describe('a real boot records the visit', () => {
  it('a letter: one history entry and the place, kept beside everything else in vot-state', () => {
    const box = install({ theme: 'dark', lastReadChapters: { john: 2 }, activeReadKey: 'john' });
    const { rerender } = render(<Harness route={LETTER} />);
    expect(g.HistoryStore.add).toHaveBeenCalledTimes(1);
    expect(g.HistoryStore.add).toHaveBeenCalledWith(visitOf(LETTER).entry);
    expect(box.state).toEqual({ theme: 'dark', lastReadChapters: { john: 2 }, activeReadKey: 'vol:one', lastReadLetterMap: { one: 'v1-02' } });
    rerender(<Harness route={{ ...LETTER }} />);
    expect(g.HistoryStore.add).toHaveBeenCalledTimes(1);
    expect(g.StateStore.set).toHaveBeenCalledTimes(1);
  });

  it('a chapter, then the next one: each gets its entry and moves the place', () => {
    const box = install();
    const { rerender } = render(<Harness route={JOHN3} />);
    rerender(<Harness route={{ place: 'bible-chapter', book: 'john', chapter: 2 }} />);
    expect(g.HistoryStore.add.mock.calls.map((c) => c[0].chapterNum)).toEqual([3, 2]);
    expect(box.state).toEqual({ activeReadKey: 'john', lastReadChapters: { john: 2 } });
  });

  it('history off: the place still moves, no entry', () => {
    const box = install({ settings: { historyEnabled: false } });
    render(<Harness route={JOHN3} />);
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
    expect(box.state.lastReadChapters).toEqual({ john: 3 });
  });

  it('nothing before the page is ready, before the stores have loaded, or on a gate boot', () => {
    install();
    render(<Harness route={LETTER} ready={false} />);
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
    cleanup();
    install({}, { ready: false });
    render(<Harness route={LETTER} />);
    expect(g.StateStore.set).not.toHaveBeenCalled();
    cleanup();
    install();
    g.__onReadingComplete = null;
    g.__votAudioListened = null;
    render(<Harness route={LETTER} live={false} />);
    expect(g.HistoryStore.add).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect([g.__onReadingComplete, g.__votAudioListened]).toEqual([null, null]);
  });

  it('a reading day after 20 s of visible time on the page, not before', () => {
    vi.useFakeTimers();
    install();
    render(<Harness route={LETTER} />);
    act(() => { vi.advanceTimersByTime(DWELL_MS - 100); });
    expect(g.ReadingStreakStore.recordReadingDay).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(g.ReadingStreakStore.recordReadingDay).toHaveBeenCalledTimes(1);
  });

  it('leaving before the dwell: no reading day', () => {
    vi.useFakeTimers();
    install();
    const { rerender } = render(<Harness route={LETTER} />);
    act(() => { vi.advanceTimersByTime(5000); });
    rerender(<Harness route={{ place: 'collection', collection: 'one' }} />);
    act(() => { vi.advanceTimersByTime(DWELL_MS); });
    expect(g.ReadingStreakStore.recordReadingDay).not.toHaveBeenCalled();
  });
});

describe('read marks', () => {
  it("a completed read (main's detector) adds one, goes to the reading record and the streak", () => {
    const box = install({ readItems: { 'v1:volume-one:v1-02': 1 } });
    render(<Harness route={LETTER} />);
    expect(g.__readTrackerMeta).toEqual({ key: 'v1:volume-one:v1-02' });
    act(() => { g.__onReadingComplete({ words: 900, activeMs: 90000, coverage: 0.95 }); });
    expect(box.state.readItems).toEqual({ 'v1:volume-one:v1-02': 2 });
    expect(g.ReadingStatsStore.recordCompletion).toHaveBeenCalledWith({ key: 'v1:volume-one:v1-02', words: 900, activeMs: 90000, wasReadBefore: true });
    expect(g.ReadingStreakStore.recordReadingDay).toHaveBeenCalled();
  });

  it('the bridge is held only on a reading page', () => {
    install();
    const { rerender } = render(<Harness route={JOHN3} />);
    expect(typeof g.__onReadingComplete).toBe('function');
    rerender(<Harness route={{ place: 'bible-book', book: 'john' }} />);
    expect(g.__onReadingComplete).toBe(null);
    expect(g.__readTrackerMeta).toBe(null);
  });

  it('marking off: no mark, no record', () => {
    const box = install({ settings: { markAsRead: false } });
    render(<Harness route={JOHN3} />);
    act(() => { g.__onReadingComplete({ words: 300, activeMs: 30000, coverage: 1 }); });
    expect(box.state.readItems).toBe(undefined);
    expect(g.ReadingStatsStore.recordCompletion).not.toHaveBeenCalled();
  });

  it('a recording heard to the end marks its letter or chapter (not a whole-book recording)', () => {
    const box = install();
    render(<Harness route={{ place: 'home' }} />);
    act(() => { g.__votAudioListened('one', 'v1-01', 0); });
    act(() => { g.__votAudioListened('bible-nkjv', 'john', 3); });
    act(() => { g.__votAudioListened('bible-nkjv', 'john', 0); });
    expect(box.state.readItems).toEqual({ 'v1:volume-one:v1-01': 1, 'v1:john:3': 1 });
    expect(g.ReadingStatsStore.recordCompletion).not.toHaveBeenCalled();
    expect(recordListen('nope', 'x', 0)).toBe(false);
  });

  it("main's own detector marks a letter read once the reader has seen it all for long enough", () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const box = install();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      /** @type {any} */ ({ top: 0, bottom: 600, height: 600, left: 0, right: 400, width: 400, x: 0, y: 0 }));
    function Page() {
      const ref = React.useRef(null);
      useReadingRecord({ route: LETTER, ready: true, scrollRef: ref, live: true });
      return <div ref={ref}><p data-hl-key="letter:v1-02:0">Honor not the day of the dead</p><p data-hl-key="letter:v1-02:1">Honor God</p></div>;
    }
    render(<Page />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(box.state.readItems).toBe(undefined);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(box.state.readItems).toEqual({ 'v1:volume-one:v1-02': 1 });
    expect(g.ReadingStatsStore.recordCompletion).toHaveBeenCalledWith(expect.objectContaining({ key: 'v1:volume-one:v1-02', words: 9, wasReadBefore: false }));
  });
});
