/* us1: what the app's hooks put into the anonymous usage counts - ids and tags, never text. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DiagnosticLog } from './diagnostic-log.js';
import { HistoryStore } from '../stores/history-store.js';
import { BookmarkStore } from '../stores/bookmark-store.js';

let usage;
beforeEach(() => {
  usage = { count: vi.fn(), addSeconds: vi.fn() };
  /** @type {any} */ (window).UsageStats = usage;
  localStorage.clear();
  HistoryStore._resetForTests({ forceLoaded: true });
  BookmarkStore._resetForTests({ forceLoaded: true });
});
afterEach(() => { delete /** @type {any} */ (window).UsageStats; });

describe('DiagnosticLog', () => {
  it('counts an error by its tag and never passes the message on', () => {
    DiagnosticLog.error('Store', 'write failed for the note "my private prayer"');
    expect(usage.count).toHaveBeenCalledWith('err', 'store');
    expect(JSON.stringify(usage.count.mock.calls)).not.toContain('prayer');
  });

  it('warnings and other timings are not counted; the cold-start mark lands in a bucket', () => {
    DiagnosticLog.warn('quota', 'near the limit');
    DiagnosticLog.timing('corpus', 'lazy-load', 900);
    expect(usage.count).not.toHaveBeenCalled();
    DiagnosticLog.timing('boot', 'app-first-mount', 2500);
    expect(usage.count).toHaveBeenCalledWith('boot', '2to4s');
  });

  it('with no UsageStats on the page it records as before and throws nothing', () => {
    delete /** @type {any} */ (window).UsageStats;
    expect(() => DiagnosticLog.error('x', 'y')).not.toThrow();
  });
});

describe('opens and features', () => {
  it('an opened letter, Bible book or study is counted by id - never a title, a chapter or a verse', () => {
    HistoryStore.add({ type: 'letter', letterId: 'v1-12', title: 'A Just God and A Savior' });
    HistoryStore.add({ type: 'chapter', bookId: 'nkjv-john', chapterNum: 3, title: 'John 3' });
    HistoryStore.add({ type: 'study-chapter', studyId: 'lamb', studyChapterId: 'ch3' });
    expect(usage.count.mock.calls).toEqual([
      ['open', 'letter:v1-12'], ['open', 'bible:nkjv-john'], ['open', 'study:lamb'],
    ]);
  });

  it('a bookmark counts that one was made, not where', () => {
    BookmarkStore.add(/** @type {any} */ ({ id: 'b1', hlKey: 'nkjv:John:3:16', label: 'For God so loved' }));
    expect(usage.count.mock.calls).toEqual([['feat', 'bookmark']]);
  });
});
