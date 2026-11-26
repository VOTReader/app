/* tabs — pure tab-metadata helpers (TEST1).
   ─────────────────────────────────────────────────────────────────────
   These were load-bearing but 0% covered: tabContentKey drives tab dedup
   (deduplicateTabs) and scrollKeyForTab drives per-tab scroll-memory
   save/restore — a silent break mis-restores scroll or cross-contaminates
   tab content. The bare-name globals the helpers read (READING_SCREENS,
   COL_BY_LETTER_SC, colLetterArr, …) are stubbed on globalThis. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { describeTab, tabContentKey, tabHasProgressBar, scrollKeyForTab, navOriginLabel } from './tabs.js';
import { encodeSongsRoute } from './songs-route.js';

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
  delete (/** @type {any} */ (globalThis)).colPreface;
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

  // sweep v38: the key left out what a few screens keep outside the fixed fields
  // (the search words, the Songs/collection place, the journal entry), so the
  // Dedupe button folded a "mercy" search tab into a "grace" one and the overview
  // counted them as duplicates. Only the screen that shows a field keys on it.
  describe('screens whose content lives outside the fixed fields (sweep v38)', () => {
    it('search tabs for different words or a different scope stay apart', () => {
      const grace = tabContentKey({ screen: 'search', searchQuery: 'grace' });
      expect(grace).not.toBe(tabContentKey({ screen: 'search', searchQuery: 'mercy' }));
      expect(grace).not.toBe(tabContentKey({ screen: 'search' }));
      const inMatthew = { kind: 'book', bookId: 'matthew', label: 'Matthew' };
      expect(tabContentKey({ screen: 'search', searchQuery: 'grace', searchScope: inMatthew })).not.toBe(grace);
    });
    it('the same search still folds, surrounding spaces and all', () => {
      expect(tabContentKey({ screen: 'search', searchQuery: '  grace ' })).toBe(tabContentKey({ screen: 'search', searchQuery: 'grace' }));
    });
    it('an empty search keeps the key it always had (its thumbnail stays put)', () => {
      expect(tabContentKey({ screen: 'search', searchQuery: '' })).toBe('search|||||||');
      expect(tabContentKey({ screen: 'search', searchQuery: '   ' })).toBe('search|||||||');
    });
    it('a field left over from another screen does not split a real duplicate', () => {
      const plain = tabContentKey({ screen: 'bible-ch', bookId: 'john', chapterNum: 1 });
      expect(tabContentKey({ screen: 'bible-ch', bookId: 'john', chapterNum: 1, searchQuery: 'grace', audioColKey: 'v2', journalEntryId: 'j1' })).toBe(plain);
      expect(plain).toBe('bible-ch|john|1|||||');
    });
    it('collection tabs on different collections stay apart', () => {
      expect(tabContentKey({ screen: 'audio-library-collection', audioColKey: 'v2' }))
        .not.toBe(tabContentKey({ screen: 'audio-library-collection', audioColKey: 'study:matthew' }));
    });
    it('Songs tabs on different pages stay apart; the same page folds whatever the path to it', () => {
      const hub = { k: 'hub' };
      const songA = tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([hub, { k: 'song', v: 'fam-a' }]) });
      const songB = tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([hub, { k: 'song', v: 'fam-b' }]) });
      const songAViaList = tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([hub, { k: 'list', v: 'col:v2' }, { k: 'song', v: 'fam-a' }]) });
      expect(songA).not.toBe(songB);
      expect(songA).toBe(songAViaList);
      const found = tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([{ k: 'hub', q: 'sabbath' }]) });
      expect(found).not.toBe(tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([hub]) }));
    });
    it('the bare Songs hub keys as before, however its route is spelled', () => {
      expect(tabContentKey({ screen: 'audio-library-songs', audioColKey: encodeSongsRoute([{ k: 'hub' }]) })).toBe('audio-library-songs|||||||');
      expect(tabContentKey({ screen: 'audio-library-songs', audioColKey: null })).toBe('audio-library-songs|||||||');
    });
    it('journal tabs on different entries stay apart', () => {
      expect(tabContentKey({ screen: 'journal-viewer', journalEntryId: 'j1' }))
        .not.toBe(tabContentKey({ screen: 'journal-viewer', journalEntryId: 'j2' }));
    });
    it('never holds a newline (use-thumbnails joins the live keys with one)', () => {
      expect(tabContentKey({ screen: 'search', searchQuery: 'grace\nmercy' })).not.toMatch(/[\r\n]/);
    });
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
  it('index screens key per book / study / genre, as useScrollMemory saves them (sweep v119)', () => {
    expect(scrollKeyForTab({ screen: 'bible-idx', bookId: 'psalms' })).toBe('bible-idx-psalms');
    expect(scrollKeyForTab({ screen: 'bible-study-index', studyId: 'purity' })).toBe('bible-study-index-purity');
    expect(scrollKeyForTab({ screen: 'scripture-genre', genreId: 'law' })).toBe('scripture-genre-law');
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
  it('a volume preface resolves its own title, not the generic fallback (lw1: the tab kept the last letter name)', () => {
    /** @type {any} */ (globalThis).colLetterArr = () => [{ id: 'chosen-by-god', title: 'Chosen by God' }];
    /** @type {any} */ (globalThis).colPreface = () => ({ id: 'a-word-of-warning', title: 'A Word of Warning' });
    expect(describeTab({ screen: 'vot-letter', letterId: 'a-word-of-warning' })).toEqual({ title: 'A Word of Warning', subtitle: 'Volume Two', resolved: true });
    expect(describeTab({ screen: 'vot-letter', letterId: 'chosen-by-god' }).title).toBe('Chosen by God');
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
    expect(describeTab({ screen: 'totally-unknown' })).toEqual({ title: 'Home', subtitle: 'Read', resolved: true });
  });

  // P1-8: every personal-content screen used to fall THROUGH to the Home
  // default — and because that default is resolved:true, useTabTitleMemo
  // trusted it and burned "Home" into the tab's stored title, so the Tabs
  // overview labeled every journal/notes/library tab "Home" forever.
  describe('personal-content screens (P1-8: no more mislabeled "Home")', () => {
    it('labels every personal screen honestly (titles match the screen H1s)', () => {
      expect(describeTab({ screen: 'journal-home' })).toEqual({ title: 'Journal', subtitle: 'Journal entries', resolved: true });
      expect(describeTab({ screen: 'journal-viewer' })).toEqual({ title: 'Journal Entry', subtitle: 'Journal', resolved: true });
      expect(describeTab({ screen: 'journal-editor' })).toEqual({ title: 'Journal Entry', subtitle: 'Editing · Journal', resolved: true });
      expect(describeTab({ screen: 'notes-index' })).toEqual({ title: 'Notes', subtitle: 'Personal notes', resolved: true });
      expect(describeTab({ screen: 'links-index' })).toEqual({ title: 'Links', subtitle: 'Saved links', resolved: true });
      expect(describeTab({ screen: 'bookmarks-index' })).toEqual({ title: 'Bookmarks', subtitle: 'Saved places', resolved: true });
      expect(describeTab({ screen: 'highlights-index' })).toEqual({ title: 'Highlights & Underlines', subtitle: 'Marked passages', resolved: true });
      expect(describeTab({ screen: 'library' })).toEqual({ title: 'Library', subtitle: 'Your saved content', resolved: true });
      expect(describeTab({ screen: 'my-progress' })).toEqual({ title: 'Progress', subtitle: 'Reading progress', resolved: true });
      expect(describeTab({ screen: 'about' })).toEqual({ title: 'About', subtitle: 'VOTReader', resolved: true });
      expect(describeTab({ screen: 'audio-library' })).toEqual({ title: 'Listen', subtitle: 'Saved & recent recordings', resolved: true });
      expect(describeTab({ screen: 'audio-library-offline' })).toEqual({ title: 'Listen', subtitle: 'On this phone', resolved: true });
    });

    it('names a Scripture genre by its label, not its id (the 2026-09-25 walk)', () => {
      const g = /** @type {any} */ (globalThis);   // a bare runtime global, not typed on globalThis
      g.SCRIPTURE_GENRES = { ot: [{ id: 'history', label: 'History' }], nt: [{ id: 'gospels', label: 'Gospels' }] };
      try {
        expect(describeTab({ screen: 'scripture-genre', genreId: 'gospels' })).toEqual({ title: 'Gospels', subtitle: 'Browse by genre', resolved: true });
        expect(describeTab({ screen: 'scripture-genre', genreId: 'gone' })).toEqual({ title: 'Scriptures', subtitle: 'Browse by genre', resolved: false });
      } finally { delete g.SCRIPTURE_GENRES; }
    });

    it('names the Answers screens, a shelf by our short name under the site\'s label', () => {
      expect(describeTab({ screen: 'answers-home' })).toEqual({ title: 'Answers', subtitle: 'Answers Only God Can Give', resolved: true });
      expect(describeTab({ screen: 'answers-group', letterId: '5' })).toEqual({ title: 'Scripture & doctrine', subtitle: '5. Thus Says The Lord...', resolved: true });
      expect(describeTab({ screen: 'answers-group', letterId: 'other' }).title).toBe('The Lord and His Word');   // 0125 C: the app's name for the site's Other Topics
      expect(describeTab({ screen: 'answers-group', letterId: 'gone' }).title).toBe('Answers');
      expect(describeTab({ screen: 'answers-media' }).title).toBe('Charts and videos');
      expect(describeTab({ screen: 'answers-saved' })).toEqual({ title: 'Saved answers', subtitle: 'Answers Only God Can Give', resolved: true });
      // The retired screens are named for where they reopen (answers-retired.js).
      expect(describeTab({ screen: 'answers-az' }).title).toBe('Answers');
      expect(describeTab({ screen: 'answers-subject', letterId: 'walking-with-god' }).title).toBe('The walk of faith');
      expect(describeTab({ screen: 'answers-subject', letterId: 'the-end-of-this-age' }).title).toBe('Answers');
    });

    it('enumerates EVERY corpus-independent route — none but home itself may label "Home"', () => {
      // Every screen that needs no corpus lookup must describe itself with
      // resolved:true and a non-Home title; the Home default is reserved for
      // actual home tabs and unknown screens only. If a new route is added
      // without a describeTab case, this enumeration forces the oversight.
      const corpusIndependent = [
        'scriptures-home', 'volumes-home', 'audio-library', 'studies-home', 'garden-view',
        'search', 'history', 'settings', 'about', 'library', 'my-progress',
        'journal-home', 'journal-viewer', 'journal-editor', 'notes-index',
        'links-index', 'bookmarks-index', 'highlights-index', 'home',
        'answers-home', 'answers-az', 'answers-subject', 'answers-group', 'answers-media', 'answers-saved',
      ];
      for (const screen of corpusIndependent) {
        const d = describeTab({ screen });
        expect(d.resolved).toBe(true);
        if (screen !== 'home') expect(d.title).not.toBe('Home');
      }
    });
  });
});

/* n177: Back names where it goes. */
describe('navOriginLabel', () => {
  it('no origin is Home; a corpus-free screen is named as its tab would be', () => {
    expect(navOriginLabel(null)).toBe('Home');
    expect(navOriginLabel({ screen: 'reading-plans' })).toBe('Reading plans');
    expect(navOriginLabel({ screen: 'volumes-home' })).toBe('Volumes');
  });
});
/* votreader-tests-7 item 8: the describeTab branches the corpus-backed
   screens take (BOOKS / MATTHEW_PLAIN / studies / index collections) and
   the content-key / scroll-key fallbacks no earlier case reached. */
describe('describeTab — corpus-backed screens (tests-7 item 8)', () => {
  const g = /** @type {any} */ (globalThis);
  afterEach(() => {
    delete g.BOOKS; delete g.OT_BOOK_IDS; delete g.MATTHEW_PLAIN;
    delete g.SCRIPTURE_GENRES; delete g._studies;
  });

  it('a tab with no screen at all is Home', () => {
    expect(describeTab({})).toEqual({ title: 'Home', subtitle: 'Read', resolved: true });
  });

  it('a BOOKS chapter names the book, its testament, and a missing chapter as ?', () => {
    g.BOOKS = {
      genesis: { id: 'genesis', title: 'Genesis' },
      john: { id: 'john', title: 'John' },
    };
    g.OT_BOOK_IDS = new Set(['genesis']);
    expect(describeTab({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 }))
      .toEqual({ title: 'Genesis · Ch. 1', subtitle: 'Old Testament', resolved: true });
    expect(describeTab({ screen: 'bible-ch', bookId: 'john' }))
      .toEqual({ title: 'John · Ch. ?', subtitle: 'New Testament', resolved: true });
  });

  it('the plain Matthew resolves through MATTHEW_PLAIN once its corpus is present', () => {
    g.MATTHEW_PLAIN = { id: 'matthew-plain', title: 'Matthew (plain)' };
    g.OT_BOOK_IDS = new Set();
    expect(describeTab({ screen: 'bible-ch', bookId: 'matthew-plain', chapterNum: 2 }))
      .toEqual({ title: 'Matthew (plain) · Ch. 2', subtitle: 'New Testament · Gospels', resolved: true });
  });

  it('book index screens name the book and its testament, or fall back unresolved', () => {
    g.BOOKS = { genesis: { id: 'genesis', title: 'Genesis' }, john: { id: 'john', title: 'John' } };
    g.OT_BOOK_IDS = new Set(['genesis']);
    expect(describeTab({ screen: 'bible-idx', bookId: 'genesis' }))
      .toEqual({ title: 'Genesis', subtitle: 'Old Testament', resolved: true });
    expect(describeTab({ screen: 'matthew-idx', bookId: 'john' }))
      .toEqual({ title: 'John', subtitle: 'New Testament', resolved: true });
    expect(describeTab({ screen: 'bible-idx', bookId: 'gone' }))
      .toEqual({ title: 'Book', subtitle: 'New Testament', resolved: false });
  });

  it('a genre tab before the genre table loads is unresolved, and a one-sided table still names its genres', () => {
    expect(describeTab({ screen: 'scripture-genre', genreId: 'law' }))
      .toEqual({ title: 'Scriptures', subtitle: 'Browse by genre', resolved: false });
    g.SCRIPTURE_GENRES = { ot: [{ id: 'law', label: 'The Law' }] };
    expect(describeTab({ screen: 'scripture-genre', genreId: 'law' }).title).toBe('The Law');
    g.SCRIPTURE_GENRES = { nt: [{ id: 'gospels', label: 'Gospels' }] };
    expect(describeTab({ screen: 'scripture-genre', genreId: 'gospels' }).title).toBe('Gospels');
  });

  it('an entry collection falls back to Entry, and index collections name their index', () => {
    g.colLetterArr = () => [];
    expect(describeTab({ screen: 'blessed-entry', letterId: 'intro' }))
      .toEqual({ title: 'Entry', subtitle: 'The Blessed', resolved: false });
    g.COL_BY_INDEX_SC = new Map([
      ['vot-index', { kind: 'letter', label: 'Volume Two' }],
      ['blessed-index', { kind: 'blessed', label: 'The Blessed' }],
    ]);
    expect(describeTab({ screen: 'vot-index' })).toEqual({ title: 'Volume Two', subtitle: 'Letter index', resolved: true });
    expect(describeTab({ screen: 'blessed-index' })).toEqual({ title: 'The Blessed', subtitle: 'Entry index', resolved: true });
  });

  it('names the remaining Listen shelves and the Scripture Web', () => {
    expect(describeTab({ screen: 'audio-library-volumes' }).subtitle).toBe('The Volumes of Truth');
    expect(describeTab({ screen: 'audio-library-collection' }).subtitle).toBe('Recordings in one source');
    expect(describeTab({ screen: 'audio-library-saved' }).subtitle).toBe('Saved recordings');
    expect(describeTab({ screen: 'audio-library-bible' }).subtitle).toBe('The Bible');
    expect(describeTab({ screen: 'audio-library-studies' }).subtitle).toBe('Bible/Letter Studies');
    expect(describeTab({ screen: 'audio-library-songs' })).toEqual({ title: 'Songs of the Letters', subtitle: 'Sung by the flock', resolved: true });
    expect(describeTab({ screen: 'scripture-web' })).toEqual({ title: 'The Scripture Web', subtitle: 'Cross-reference atlas', resolved: true });
    expect(describeTab({ screen: 'studies-home' }).title).toBe('Studies');
  });

  it('study index and chapter screens resolve through the studies table, or fall back unresolved', () => {
    g._studies = () => [
      { slug: 'purity', title: 'Purity', chapters: [{ id: 'ch1', title: 'Chapter One' }] },
      { slug: 'bare', title: 'Bare Study' },
    ];
    expect(describeTab({ screen: 'bible-study-index', studyId: 'purity' }))
      .toEqual({ title: 'Purity', subtitle: 'Bible Letter Study', resolved: true });
    expect(describeTab({ screen: 'bible-study-index', studyId: 'gone' }))
      .toEqual({ title: 'Study', subtitle: 'Bible Letter Study', resolved: false });
    expect(describeTab({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: 'ch1' }))
      .toEqual({ title: 'Chapter One', subtitle: 'Purity', resolved: true });
    expect(describeTab({ screen: 'bible-study-chapter', studyId: 'purity', studyChapterId: 'gone' }))
      .toEqual({ title: 'Study Chapter', subtitle: 'Purity', resolved: false });
    expect(describeTab({ screen: 'bible-study-chapter', studyId: 'bare', studyChapterId: 'ch1' }))
      .toEqual({ title: 'Study Chapter', subtitle: 'Bare Study', resolved: false });
    expect(describeTab({ screen: 'bible-study-chapter', studyId: 'gone' }))
      .toEqual({ title: 'Study Chapter', subtitle: 'Bible Letter Study', resolved: false });
  });
});

describe('tabContentKey / scrollKeyForTab fallbacks (tests-7 item 8)', () => {
  it('a scope without words still keys the search tab; volume and kind-only scopes spell out', () => {
    const plain = tabContentKey({ screen: 'search' });
    const byVolume = tabContentKey({ screen: 'search', searchScope: { volumeId: 'v2' } });
    expect(byVolume).not.toBe(plain);
    expect(byVolume.endsWith('|:v2|')).toBe(true);
    const byKind = tabContentKey({ screen: 'search', searchScope: { kind: 'book' } });
    expect(byKind.endsWith('|book:|')).toBe(true);
    // A scope that is not an object, and words that are not a string, add nothing.
    expect(tabContentKey({ screen: 'search', searchScope: 'book' })).toBe(plain);
    expect(tabContentKey(/** @type {any} */ ({ screen: 'search', searchQuery: 42 }))).toBe(plain);
  });

  it('journal-editor keys on its entry like the viewer; a collection without a key keeps the plain key', () => {
    expect(tabContentKey({ screen: 'journal-editor', journalEntryId: 'j9' }))
      .not.toBe(tabContentKey({ screen: 'journal-editor', journalEntryId: 'j8' }));
    expect(tabContentKey({ screen: 'journal-editor' })).toBe('journal-editor|||||||');
    expect(tabContentKey({ screen: 'audio-library-collection' })).toBe('audio-library-collection|||||||');
  });

  it('scroll keys fall back to empty ids, and an Answers shelf keys on its group', () => {
    expect(scrollKeyForTab({ screen: 'bible-study-chapter' })).toBe('study--');
    expect(scrollKeyForTab({ screen: 'bible-idx' })).toBe('bible-idx-');
    expect(scrollKeyForTab({ screen: 'bible-study-index' })).toBe('bible-study-index-');
    expect(scrollKeyForTab({ screen: 'scripture-genre' })).toBe('scripture-genre-');
    expect(scrollKeyForTab({ screen: 'answers-group', letterId: '5' })).toBe('answers-group-5');
    expect(scrollKeyForTab({ screen: 'answers-group' })).toBe('answers-group-');
  });

  it('navOriginLabel is Home for an empty screen, a nameless title, and a describe that throws', () => {
    const g = /** @type {any} */ (globalThis);
    expect(navOriginLabel({ screen: '' })).toBe('Home');
    g.COL_BY_INDEX_SC = new Map([['x-index', { kind: 'letter', label: '' }]]);
    expect(navOriginLabel({ screen: 'x-index' })).toBe('Home');
    // colLetterArr is not stubbed here: describing a letter tab throws, and
    // Back must still speak a name.
    expect(navOriginLabel({ screen: 'vot-letter', letterId: 'x' })).toBe('Home');
  });
});

