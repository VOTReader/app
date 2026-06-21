/* tabs — pure tab-metadata helpers (TEST1).
   ─────────────────────────────────────────────────────────────────────
   These were load-bearing but 0% covered: tabContentKey drives tab dedup
   (deduplicateTabs) and scrollKeyForTab drives per-tab scroll-memory
   save/restore — a silent break mis-restores scroll or cross-contaminates
   tab content. The bare-name globals the helpers read (READING_SCREENS,
   COL_BY_LETTER_SC, colLetterArr, …) are stubbed on globalThis. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab } from './tabs.js';

beforeEach(() => {
  /** @type {any} */ (globalThis).READING_SCREENS = new Set(['bible-ch', 'matthew-ch', 'vot-letter', 'bible-study-chapter']);
  /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map([
    ['vot-letter', { kind: 'letter', label: 'Volume Two' }],
    ['blessed-entry', { kind: 'blessed', label: 'The Blessed' }],
    ['holyday-entry', { kind: 'holy-days', label: 'Holy Days' }],
  ]);
  /** @type {any} */ (globalThis).COL_BY_INDEX_SC = new Map();
});
afterEach(() => {
  delete (/** @type {any} */ (globalThis)).READING_SCREENS;
  delete (/** @type {any} */ (globalThis)).COL_BY_LETTER_SC;
  delete (/** @type {any} */ (globalThis)).COL_BY_INDEX_SC;
  delete (/** @type {any} */ (globalThis)).colLetterArr;
});

describe('tabContentKey', () => {
  it('serializes the visible-content fields pipe-separated', () => {
    expect(tabContentKey({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 3 })).toBe('bible-ch|genesis|3|||||');
  });
  it('defaults screen to home and unset fields to empty', () => {
    expect(tabContentKey({})).toBe('home|||||||');
  });
  it('same content collides; a different chapter does not (drives dedup)', () => {
    const a = tabContentKey({ screen: 'bible-ch', bookId: 'john', chapterNum: 1 });
    const b = tabContentKey({ screen: 'bible-ch', bookId: 'john', chapterNum: 1 });
    const c = tabContentKey({ screen: 'bible-ch', bookId: 'john', chapterNum: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('scrollKeyForTab', () => {
  it('bible/matthew chapters key by book + chapter', () => {
    expect(scrollKeyForTab({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 3 })).toBe('genesis-3');
    expect(scrollKeyForTab({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 })).toBe('matthew-5');
  });
  it('study chapters key by study + study chapter', () => {
    expect(scrollKeyForTab({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: 'ch1' })).toBe('study-purity-ch1');
  });
  it('letter screens use the collection-kind prefix + letterId', () => {
    expect(scrollKeyForTab({ screen: 'vot-letter', letterId: 'the-wide-path' })).toBe('letter-the-wide-path');
    expect(scrollKeyForTab({ screen: 'holyday-entry', letterId: 'passover' })).toBe('holyday-passover');
    expect(scrollKeyForTab({ screen: 'blessed-entry', letterId: 'intro' })).toBe('blessed-intro');
  });
  it('hm-letter keys by entry; unknown screens fall back to the screen name (or home)', () => {
    expect(scrollKeyForTab({ screen: 'hm-letter', letterId: 'woe' })).toBe('entry-woe');
    expect(scrollKeyForTab({ screen: 'settings' })).toBe('settings');
    expect(scrollKeyForTab({})).toBe('home');
  });
});

describe('tabHasProgressBar', () => {
  it('true on reading screens, false elsewhere', () => {
    expect(tabHasProgressBar({ screen: 'bible-ch' })).toBe(true);
    expect(tabHasProgressBar({ screen: 'bible-study-chapter' })).toBe(true);
    expect(tabHasProgressBar({ screen: 'settings' })).toBe(false);
    expect(tabHasProgressBar({ screen: 'home' })).toBe(false);
  });
});

describe('describeTab', () => {
  it('names the simple meta screens', () => {
    expect(describeTab({ screen: 'scriptures-home' })).toEqual({ title: 'Scriptures', subtitle: 'The Scriptures of Truth', resolved: true });
    expect(describeTab({ screen: 'settings' })).toEqual({ title: 'Settings', subtitle: 'App configuration', resolved: true });
    expect(describeTab({ screen: 'history' })).toEqual({ title: 'History', subtitle: 'Recently visited', resolved: true });
  });
  it('search shows the query in quotes, or a generic label when empty', () => {
    expect(describeTab({ screen: 'search', searchQuery: 'grace' })).toEqual({ title: '"grace"', subtitle: 'Full-text search', resolved: true });
    expect(describeTab({ screen: 'search' })).toEqual({ title: 'Search', subtitle: 'Full-text search', resolved: true });
  });
  it('garden shows the page number (default 1)', () => {
    expect(describeTab({ screen: 'garden-view', gardenPage: 4 }).title).toBe('The Garden · Page 4');
    expect(describeTab({ screen: 'garden-view' }).title).toBe('The Garden · Page 1');
  });
  it('a letter screen resolves the letter title via the collection registry', () => {
    /** @type {any} */ (globalThis).colLetterArr = () => [{ id: 'the-wide-path', title: 'The Wide Path' }];
    expect(describeTab({ screen: 'vot-letter', letterId: 'the-wide-path' })).toEqual({ title: 'The Wide Path', subtitle: 'Volume Two', resolved: true });
  });
  it('marks a letter tab UNRESOLVED when the VOT corpus has not loaded (so the overview keeps the remembered title)', () => {
    // Corpus absent → colLetterArr returns [] → the letter isn't found → the
    // label falls back to a generic "Entry"/"Letter" AND resolved is false, the
    // signal the overview uses to prefer the tab's stored title instead.
    /** @type {any} */ (globalThis).colLetterArr = () => [];
    const d = describeTab({ screen: 'vot-letter', letterId: 'the-wide-path' });
    expect(d.resolved).toBe(false);
    expect(d.title).toBe('Letter'); // generic fallback (mock kind is 'letter')
  });
  it('does NOT throw for a Matthew tab before the lazy corpus loads (regression: ReferenceError MATTHEW)', () => {
    // MATTHEW / MATTHEW_PLAIN live in the lazy bundle-a-matthew. Describing a
    // Matthew tab from a Bible screen (its corpus not yet loaded) must fall
    // back gracefully, NOT throw a bare-identifier ReferenceError — the throw
    // crashed AppShellOverlays' ErrorBoundary to null, which hid the whole Tabs
    // overview AND stranded tabsOverviewOpen=true (silently killing scroll-
    // memory recording, since it skips while the overview is "open").
    delete (/** @type {any} */ (globalThis)).MATTHEW;
    delete (/** @type {any} */ (globalThis)).MATTHEW_PLAIN;
    expect(() => describeTab({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 })).not.toThrow();
    expect(describeTab({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 })).toEqual({ title: 'Reading', subtitle: 'Scripture', resolved: false });
    expect(() => describeTab({ screen: 'bible-ch', bookId: 'matthew-plain', chapterNum: 1 })).not.toThrow();
  });
  it('resolves the Matthew title once the lazy corpus is present', () => {
    /** @type {any} */ (globalThis).MATTHEW = { id: 'matthew', title: 'Matthew', chapters: [] };
    /** @type {any} */ (globalThis).OT_BOOK_IDS = new Set();
    expect(describeTab({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 }))
      .toEqual({ title: 'Matthew · Ch. 5', subtitle: 'New Testament · Gospels', resolved: true });
    delete (/** @type {any} */ (globalThis)).MATTHEW;
    delete (/** @type {any} */ (globalThis)).OT_BOOK_IDS;
  });
  it('falls back to Home for an unknown screen', () => {
    expect(describeTab({ screen: 'totally-unknown' })).toEqual({ title: 'Home', subtitle: 'VOT Study Bible', resolved: true });
  });
});
