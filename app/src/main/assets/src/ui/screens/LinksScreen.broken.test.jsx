// @ts-nocheck — free-var globals stubbed per test (bundle-g screen contract)
/* W49 — the Links screen no longer calls valid links broken.
   ═══════════════════════════════════════════════════════════════════════
   The "N links point to content that can no longer be found ... Long-press a
   link to remove it" callout checks each end against the loaded corpora. The
   Bible, the VOT letters and the Bible Studies all load lazily, so on a fresh
   session every Bible, letter and study link counted as broken, and the
   screen invited the reader to delete them. An end whose corpus has not
   landed is now "unknown, assume OK"; the screen re-checks the moment a corpus
   lands, and loads the studies when only they can decide. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { LinksScreen, _endpointResolves } from './LinksScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'LinkStore', 'relativeDate', 'ConfirmStrip',
  'findEntryContext', '_allBooks', '_matthew', 'BOOKS', 'BIBLE_STUDIES'];
const WINDOW_KEYS = ['__votCorpus', '__bibleCorpus', '__matthewCorpus', 'loadBibleStudies'];

/** A lazy corpus as index.html's __makeLazyLoader hands it out. */
function lazyCorpus(loaded = false) {
  const listeners = new Set();
  let version = 0;
  return {
    loaded,
    getVersion: () => version,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    land() { this.loaded = true; version += 1; listeners.forEach((cb) => cb()); },
  };
}

/** findEntryContext over whatever is loaded: letters live in the VOT corpus, chapters in BIBLE_STUDIES. */
let LETTERS;
function stubFindEntryContext() {
  globalThis.findEntryContext = (id, kind) => {
    if (window.__votCorpus && window.__votCorpus.loaded && LETTERS.includes(id)) return { kind: 'letter', title: id };
    if ((!kind || kind === 'letter') && typeof BIBLE_STUDIES !== 'undefined') {
      for (const s of BIBLE_STUDIES) {
        if (s.chapters.some((c) => c.id === id)) return { kind: 'study-letter', title: id };
      }
    }
    return null;
  };
}

let links;
beforeEach(() => {
  LETTERS = ['the-wide-path'];
  links = [];
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = () => null;
  globalThis.relativeDate = () => '';
  globalThis.LinkStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => links, remove: () => {} };
  globalThis._allBooks = () => (typeof BOOKS !== 'undefined' ? BOOKS : {});
  globalThis._matthew = () => null;
  stubFindEntryContext();
  window.__votCorpus = lazyCorpus(false);
  window.__bibleCorpus = lazyCorpus(false);
  window.__matthewCorpus = lazyCorpus(false);
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  WINDOW_KEYS.forEach((k) => { delete window[k]; });
});

const bible = (bookId) => ({ type: 'bible', key: 'bible:' + bookId + ':3:16', bookId, chapter: 3, verse: 16, label: bookId });
const letter = (id) => ({ type: 'letter', key: 'letter:' + id + ':2', letterId: id, label: id });
const studyCh = (id) => ({ type: 'study-letter', key: 'letter:' + id + ':0', label: id });
const show = () => render(<LinksScreen onBack={() => {}} onSearch={() => {}} onHistory={() => {}} theme="dark" onThemeChange={() => {}} />);
const callout = () => document.querySelector('.links-broken-callout');

describe('_endpointResolves: an end whose corpus has not landed is unknown, not broken (W49)', () => {
  it('a Bible end before the Bible corpus has loaded', () => {
    expect(_endpointResolves(bible('john'))).toBe(true);
    globalThis.BOOKS = { john: { chapters: [] } };
    expect(_endpointResolves(bible('john'))).toBe(true);
    expect(_endpointResolves(bible('no-such-book'))).toBe(false);   // loaded and missing: broken
  });

  it('a letter end before the VOT corpus has loaded', () => {
    expect(_endpointResolves(letter('the-wide-path'))).toBe(true);
    expect(_endpointResolves(letter('gone-letter'))).toBe(true);
    window.__votCorpus.loaded = true;
    globalThis.BIBLE_STUDIES = [];
    expect(_endpointResolves(letter('the-wide-path'))).toBe(true);
    expect(_endpointResolves(letter('gone-letter'))).toBe(false);
  });

  it('a study chapter end before the Bible Studies have loaded', () => {
    window.__votCorpus.loaded = true;
    expect(_endpointResolves(studyCh('lamb-of-god-1'))).toBe(true);
    globalThis.BIBLE_STUDIES = [{ chapters: [{ id: 'lamb-of-god-1' }] }];
    expect(_endpointResolves(studyCh('lamb-of-god-1'))).toBe(true);
    expect(_endpointResolves(studyCh('gone-chapter'))).toBe(false);
  });
});

describe('LinksScreen broken-links callout (W49)', () => {
  it('a fresh session (nothing loaded) shows no callout for valid links', () => {
    links = [
      { id: 'l1', created: 1, source: bible('john'), target: letter('the-wide-path') },
      { id: 'l2', created: 2, source: studyCh('lamb-of-god-1'), target: bible('romans') },
    ];
    window.loadBibleStudies = vi.fn(() => new Promise(() => {}));
    show();
    expect(callout()).toBeNull();
  });

  it('re-checks when the VOT corpus lands: a truly gone letter then shows', () => {
    globalThis.BIBLE_STUDIES = [];
    links = [{ id: 'l1', created: 1, source: letter('the-wide-path'), target: letter('gone-letter') }];
    show();
    expect(callout()).toBeNull();
    act(() => { window.__votCorpus.land(); });
    expect(callout()).not.toBeNull();
    expect(callout().textContent).toMatch(/^1 link points/);
  });

  it('loads the Bible Studies when only they can decide, then re-checks', async () => {
    window.__votCorpus.loaded = true;
    links = [
      { id: 'l1', created: 1, source: letter('the-wide-path'), target: studyCh('lamb-of-god-1') },
      { id: 'l2', created: 2, source: letter('the-wide-path'), target: studyCh('gone-chapter') },
    ];
    let finish;
    window.loadBibleStudies = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    show();
    expect(window.loadBibleStudies).toHaveBeenCalledTimes(1);
    expect(callout()).toBeNull();
    await act(async () => {
      globalThis.BIBLE_STUDIES = [{ chapters: [{ id: 'lamb-of-god-1' }] }];
      finish(true);
    });
    expect(callout()).not.toBeNull();
    expect(callout().textContent).toMatch(/^1 link points/);
  });

  it('never loads the Bible Studies when no link needs them', () => {
    window.__votCorpus.loaded = true;
    links = [{ id: 'l1', created: 1, source: bible('john'), target: letter('the-wide-path') }];
    window.loadBibleStudies = vi.fn(() => Promise.resolve(true));
    show();
    expect(window.loadBibleStudies).not.toHaveBeenCalled();
  });
});
