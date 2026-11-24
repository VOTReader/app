// @ts-nocheck — free-var corpus globals stubbed per test
/* progress-stats — the aggregation layer under the My Progress dashboard
   (and the Settings Mark-as-Read table, which shares buildProgressGroups).
   Everything here is a pure function over stubbed corpus globals, so each
   case sets exactly the free-variable surface it exercises. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  READ_VERSION_ID, progressCorporaReady, buildProgressGroups,
  countReadFor, groupBooks, tallyGroup,
  annotationSourceForKey, mostAnnotatedSources, groupWordStats, bookItemsFor,
} from './progress-stats.js';

/* Every Bible book id the group table dereferences on BOOKS. */
const BIBLE_IDS = [
  'matthew-plain', 'mark', 'luke', 'john', 'acts',
  'romans', '1corinthians', '2corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', '1thessalonians', '2thessalonians',
  '1timothy', '2timothy', 'titus', 'philemon', 'hebrews',
  'james', '1peter', '2peter', '1john', '2john', '3john', 'jude', 'revelation',
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings',
  '1chronicles', '2chronicles', 'ezra', 'nehemiah', 'esther',
  'job', 'psalms', 'proverbs', 'ecclesiastes', 'songofsolomon',
  'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
  'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum',
  'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi',
];

const CORPUS_GLOBALS = [
  'BOOKS', 'LETTERS_V1', 'LETTERS', 'LETTERS_V3', 'LETTERS_V4', 'LETTERS_V5',
  'LETTERS_V6', 'LETTERS_V7', 'LETTERS_TIMOTHY', 'LETTERS_FLOCK',
  'LETTERS_FLOCK_PREFACE', 'LETTERS_REBUKE', 'LETTERS_REBUKE_PREFACE',
  'colLetterArr', 'COL_BY_KEY', '_matthew', '_studies',
  'findEntryContext', 'BIBLE_BOOK_LIST',
];

function seedCorpora() {
  const books = {};
  BIBLE_IDS.forEach((id) => { books[id] = { chapters: [{}, {}] }; }); // 2 chapters each
  globalThis.BOOKS = books;
  globalThis.LETTERS_V1 = [{ id: 'l1' }, { id: 'l2' }];
  globalThis.LETTERS = [{ id: 'l3' }];
  globalThis.LETTERS_V3 = [];
  globalThis.LETTERS_V4 = [];
  globalThis.LETTERS_V5 = [];
  globalThis.LETTERS_V6 = [];
  globalThis.LETTERS_V7 = [];
  globalThis.LETTERS_TIMOTHY = [];
  globalThis.LETTERS_FLOCK = [];
  globalThis.LETTERS_FLOCK_PREFACE = null;
  globalThis.LETTERS_REBUKE = [{ id: 'r1' }];
  globalThis.LETTERS_REBUKE_PREFACE = { id: 'r0' };
  const wtlb1 = [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }];
  const cols = new Map([
    ['wtlb1', { volKey: 'wtlb1', globalName: 'WTLB_ONE' }],
    ['wtlb2', { volKey: 'wtlb2', globalName: 'WTLB_TWO' }],
    ['blessed', { volKey: 'blessed', globalName: 'THE_BLESSED' }],
    ['holydays', { volKey: 'holydays', globalName: 'HOLY_DAYS' }],
    ['hm', { volKey: 'hm', globalName: 'HIDDEN_MANNA' }],
  ]);
  globalThis.COL_BY_KEY = cols;
  globalThis.colLetterArr = (col) => {
    if (!col) return [];
    if (col.globalName === 'WTLB_ONE') return wtlb1;
    if (col.globalName === 'HIDDEN_MANNA') return [{ id: 'woe-to-dallas' }];
    return [];
  };
  globalThis._matthew = () => ({ chapters: new Array(28).fill({}) });
  globalThis._studies = () => [
    { slug: 'st1', title: 'Study One', locked: false, chapters: [{}, {}] },
    { slug: 'st2', title: 'Locked Study', locked: true, chapters: [{}] },
  ];
  window.__votCorpus = { loaded: true };
}

afterEach(() => {
  CORPUS_GLOBALS.forEach((k) => { delete globalThis[k]; });
  delete window.__votCorpus;
});

describe('progressCorporaReady', () => {
  it('is false with neither corpus, either alone, and true with both', () => {
    expect(progressCorporaReady()).toBe(false);
    globalThis.BOOKS = { genesis: { chapters: [{}] } };
    expect(progressCorporaReady()).toBe(false);
    window.__votCorpus = { loaded: true };
    expect(progressCorporaReady()).toBe(true);
    delete globalThis.BOOKS;
    expect(progressCorporaReady()).toBe(false);
  });
});

describe('buildProgressGroups', () => {
  it('returns [] until both corpora are loaded', () => {
    expect(buildProgressGroups()).toEqual([]);
  });

  it('builds the 4 groups with live corpus totals when ready', () => {
    seedCorpora();
    const groups = buildProgressGroups();
    expect(groups.map((g) => g.id)).toEqual(['volumes', 'nt', 'ot', 'studies']);

    const volumes = groupBooks(groups[0]);
    // Empty collections are dropped; present ones carry their lengths.
    expect(volumes.find((b) => b.id === 'volume-one').total).toBe(2);
    expect(volumes.find((b) => b.id === 'volume-two').total).toBe(1);
    expect(volumes.find((b) => b.id === 'volume-three')).toBeUndefined();
    // Rebuke total includes its preface.
    expect(volumes.find((b) => b.id === 'lords-rebuke').total).toBe(2);
    expect(volumes.find((b) => b.id === 'wtlb-one').total).toBe(3);

    // NT/OT read chapter counts straight off BOOKS (2 each in the fixture).
    const nt = groupBooks(groups[1]);
    expect(nt.find((b) => b.id === 'revelation').total).toBe(2);
    expect(groupBooks(groups[2]).find((b) => b.id === 'psalms').total).toBe(2);

    // Studies: Matthew Study Bible + unlocked letter studies only.
    const studies = groupBooks(groups[3]);
    expect(studies.find((b) => b.id === 'matthew').total).toBe(28);
    expect(studies.find((b) => b.id === 'bible-study-st1').total).toBe(2);
    expect(studies.find((b) => b.id === 'bible-study-st2')).toBeUndefined();
  });
});

describe('countReadFor / tallyGroup', () => {
  const readItems = {
    [`${READ_VERSION_ID}:genesis:1`]: 1,
    [`${READ_VERSION_ID}:genesis:2`]: 1,
    [`${READ_VERSION_ID}:exodus:1`]: 1,
    [`${READ_VERSION_ID}:volume-one:l1`]: 1,
    'v0:genesis:3': 1, // foreign version prefix — never counted
  };

  it('counts only keys under v1:<bookId>:', () => {
    expect(countReadFor(readItems, 'genesis')).toBe(2);
    expect(countReadFor(readItems, 'exodus')).toBe(1);
    expect(countReadFor(readItems, 'volume-one')).toBe(1);
    expect(countReadFor(readItems, 'leviticus')).toBe(0);
    expect(countReadFor(null, 'genesis')).toBe(0);
  });

  it('does not let one book id prefix-match another (genesis vs genesis-x)', () => {
    expect(countReadFor({ [`${READ_VERSION_ID}:genesis-x:1`]: 1 }, 'genesis')).toBe(0);
  });

  it('tallyGroup sums read + total across every genre in the group', () => {
    const group = {
      id: 'g', label: 'G',
      genres: [
        { label: 'a', books: [{ id: 'genesis', label: 'Genesis', total: 50 }] },
        { label: 'b', books: [{ id: 'exodus', label: 'Exodus', total: 40 }] },
      ],
    };
    expect(tallyGroup(readItems, group)).toEqual({ read: 3, total: 90 });
  });
});

describe('annotationSourceForKey', () => {
  it('groups bible keys by book with the display title', () => {
    globalThis.BIBLE_BOOK_LIST = [{ id: 'psalms', title: 'Psalms' }];
    expect(annotationSourceForKey('bible:psalms:23:1')).toEqual({
      key: 'bible:psalms', label: 'Psalms', collection: 'Scripture',
    });
  });

  it('groups study keys by the book half of the fused id', () => {
    expect(annotationSourceForKey('study:matthew-22:5')).toEqual({
      key: 'study:matthew', label: 'Matthew', collection: 'Study Bible',
    });
  });

  it('resolves letter/wtlb keys through findEntryContext', () => {
    globalThis.findEntryContext = (id, kind) =>
      id === 'grafted-in' && kind === 'letter'
        ? { title: 'Grafted In', collection: 'Volume Three' }
        : null;
    expect(annotationSourceForKey('letter:grafted-in:4')).toEqual({
      key: 'letter:grafted-in', label: 'Grafted In', collection: 'Volume Three',
    });
    // Unresolvable id (corpus not loaded) stays out of the list entirely.
    expect(annotationSourceForKey('letter:unknown-slug:0')).toBeNull();
  });

  it('NEVER surfaces Hidden Manna (owner policy)', () => {
    seedCorpora();
    globalThis.findEntryContext = () => ({ title: 'Woe to Dallas', collection: 'Hidden Manna' });
    expect(annotationSourceForKey('letter:woe-to-dallas:2')).toBeNull();
  });

  it('skips journal keys and unknown kinds', () => {
    expect(annotationSourceForKey('journal:abc123:0')).toBeNull();
    expect(annotationSourceForKey('mystery:thing:1')).toBeNull();
    expect(annotationSourceForKey('')).toBeNull();
  });
});

describe('mostAnnotatedSources', () => {
  beforeEach(() => {
    globalThis.findEntryContext = (id, kind) => {
      const m = {
        'grafted-in': { title: 'Grafted In', collection: 'Volume Three' },
        'set-apart': { title: 'Set Apart', collection: 'Words To Live By: Part One' },
      };
      return (kind === 'letter' || kind === 'wtlb') ? m[id] || null : null;
    };
  });

  it('counts DISTINCT annotation groups per source, not segments or keys', () => {
    const ann = {
      // Two verses of one multi-verse highlight (shared groupId) + one solo.
      'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1' }, { id: 'a2', groupId: 'g2' }],
      'bible:psalms:23:2': [{ id: 'a3', groupId: 'g1' }],
      'letter:grafted-in:0': [{ id: 'b1' }], // no groupId → falls back to id
    };
    const out = mostAnnotatedSources(ann);
    expect(out).toEqual([
      { key: 'bible:psalms', label: 'Psalms', collection: 'Scripture', hlKey: 'bible:psalms:23:1', count: 2, words: 0, per1k: 0 },
      { key: 'letter:grafted-in', label: 'Grafted In', collection: 'Volume Three', hlKey: 'letter:grafted-in:0', count: 1, words: 0, per1k: 0 },
    ]);
  });

  it('[28] ranks by marks-per-1k-words when word counts resolve — length alone cannot win', () => {
    // Long letter: 10 marks over 5000 words = 2.0/1k. Short entry: 3 marks
    // over 300 words = 10.0/1k. Raw count says the long letter; density
    // says the short entry the user marked far more intensively.
    globalThis.findEntryContext = (id, kind) => {
      if (kind === 'letter' && id === 'long-letter') return { title: 'Long Letter', collection: 'Volume One', entry: { id, w: 5000 } };
      if (kind === 'wtlb' && id === 'short-entry') return { title: 'Short Entry', collection: 'WTLB', entry: { id, w: 300 } };
      return null;
    };
    globalThis.countItemWords = (item) => (item && item.w) || 0;
    try {
      const ann = { 'letter:long-letter:0': [], 'wtlb:short-entry:0': [] };
      for (let i = 0; i < 10; i++) ann['letter:long-letter:0'].push({ id: 'L' + i, groupId: 'L' + i });
      for (let i = 0; i < 3; i++) ann['wtlb:short-entry:0'].push({ id: 'S' + i, groupId: 'S' + i });
      const out = mostAnnotatedSources(ann);
      expect(out.map((s) => s.key)).toEqual(['wtlb:short-entry', 'letter:long-letter']);
      expect(out[0]).toMatchObject({ per1k: 10, words: 300, count: 3 });
      expect(out[1]).toMatchObject({ per1k: 2, words: 5000, count: 10 });
    } finally { delete globalThis.countItemWords; }
  });

  it('sorts by count desc, title asc on ties, and caps at the limit', () => {
    const ann = {};
    // 7 bible books, one group each — 'aaa…' titles from the fallback casing.
    ['ruth', 'joel', 'amos', 'ezra', 'job', 'jude', 'acts'].forEach((b, i) => {
      ann[`bible:${b}:1:1`] = [{ id: 'x' + i, groupId: 'x' + i }];
    });
    ann['bible:mark:1:1'] = [{ id: 'm1', groupId: 'm1' }, { id: 'm2', groupId: 'm2' }];
    const out = mostAnnotatedSources(ann, 5);
    expect(out.length).toBe(5);
    expect(out[0]).toMatchObject({ key: 'bible:mark', count: 2 });
    // The 4 remaining slots are the alphabetically-first of the 1-count ties.
    expect(out.slice(1).map((s) => s.label)).toEqual(['Acts', 'Amos', 'Ezra', 'Job']);
  });

  it('drops journal keys, empty segment lists, and unresolved sources', () => {
    const ann = {
      'journal:e1:0': [{ id: 'j1', groupId: 'j1' }],
      'bible:mark:1:1': [],
      'letter:unknown-slug:0': [{ id: 'u1', groupId: 'u1' }],
    };
    expect(mostAnnotatedSources(ann)).toEqual([]);
    expect(mostAnnotatedSources(null)).toEqual([]);
  });
});

describe('groupWordStats — words-based progress (2026-08-03)', () => {
  afterEach(() => {
    delete /** @type {any} */ (globalThis).countItemWords;
    delete /** @type {any} */ (globalThis).LETTERS_V1;
    delete /** @type {any} */ (globalThis).BOOKS;
    delete /** @type {any} */ (globalThis)._matthew;
    delete /** @type {any} */ (globalThis)._studies;
  });

  it('weighs read items by words against the group word total', () => {
    /** @type {any} */ (globalThis).countItemWords = (it) => it.w;
    /** @type {any} */ (globalThis).LETTERS_V1 = [
      { id: 'a', w: 100 }, { id: 'b', w: 900 },
    ];
    const grp = { id: 'vot', label: 'VOT', genres: [{ label: 'g', books: [{ id: 'volume-one', label: 'Volume One', total: 2 }] }] };
    // Only the SHORT letter is read: item-count says 50%, words say 10%.
    const out = groupWordStats({ 'v1:volume-one:a': 1 }, grp);
    expect(out).toEqual({ wordsRead: 100, wordsTotal: 1000 });
  });

  it('bible books key chapters by num; unknown books contribute nothing', () => {
    /** @type {any} */ (globalThis).countItemWords = (it) => it.w;
    /** @type {any} */ (globalThis).BOOKS = { mark: { chapters: [{ num: 1, w: 10 }, { num: 2, w: 30 }] } };
    const grp = { id: 'nt', label: 'NT', genres: [{ label: 'g', books: [
      { id: 'mark', label: 'Mark', total: 2 },
      { id: 'no-such-book', label: 'Ghost', total: 5 },
    ] }] };
    expect(groupWordStats({ 'v1:mark:2': true }, grp)).toEqual({ wordsRead: 30, wordsTotal: 40 });
  });

  it('includes Matthew and Bible Study chapters with their real read keys', () => {
    /** @type {any} */ (globalThis).countItemWords = (it) => it.w;
    /** @type {any} */ (globalThis)._matthew = () => ({ chapters: [{ num: 1, w: 100 }, { num: 2, w: 300 }] });
    /** @type {any} */ (globalThis)._studies = () => [{
      slug: 'faith', chapters: [{ id: 'faith-a', w: 500 }, { id: 'faith-b', w: 100 }],
    }];
    const grp = { id: 'studies', label: 'Studies', genres: [{ label: 'g', books: [
      { id: 'matthew', label: 'Matthew Study Bible', total: 2 },
      { id: 'bible-study-faith', label: 'Faith', total: 2 },
    ] }] };
    expect(groupWordStats({
      'v1:matthew:2': 1,
      'v1:bible-study-faith:faith-a': 1,
    }, grp)).toEqual({ wordsRead: 800, wordsTotal: 1000 });
  });

  it('degrades to zeros without the counter global (guard path)', () => {
    const grp = { id: 'x', label: 'X', genres: [{ label: 'g', books: [{ id: 'volume-one', label: 'V1', total: 1 }] }] };
    expect(groupWordStats({}, grp)).toEqual({ wordsRead: 0, wordsTotal: 0 });
  });
});

describe('bookItemsFor — full case sweep (tests-6 item 4)', () => {
  it('maps every volume/collection id to its corpus items when loaded', () => {
    seedCorpora();
    globalThis.LETTERS_V3 = [{ id: 'v3a' }];
    globalThis.LETTERS_V4 = [{ id: 'v4a' }, { id: 'v4b' }];
    globalThis.LETTERS_V5 = [{ id: 'v5a' }];
    globalThis.LETTERS_V6 = [{ id: 'v6a' }];
    globalThis.LETTERS_V7 = [{ id: 'v7a' }];
    globalThis.LETTERS_TIMOTHY = [{ id: 't1' }];
    globalThis.LETTERS_FLOCK = [{ id: 'f1' }];
    globalThis.LETTERS_FLOCK_PREFACE = { id: 'f0' };
    expect(bookItemsFor('volume-one').map((x) => x.key)).toEqual(['l1', 'l2']);
    expect(bookItemsFor('volume-two').map((x) => x.key)).toEqual(['l3']);
    expect(bookItemsFor('volume-three').map((x) => x.key)).toEqual(['v3a']);
    expect(bookItemsFor('volume-four').map((x) => x.key)).toEqual(['v4a', 'v4b']);
    expect(bookItemsFor('volume-five').map((x) => x.key)).toEqual(['v5a']);
    expect(bookItemsFor('volume-six').map((x) => x.key)).toEqual(['v6a']);
    expect(bookItemsFor('volume-seven').map((x) => x.key)).toEqual(['v7a']);
    expect(bookItemsFor('letters-timothy').map((x) => x.key)).toEqual(['t1']);
    expect(bookItemsFor('little-flock').map((x) => x.key)).toEqual(['f1', 'f0']);
    expect(bookItemsFor('lords-rebuke').map((x) => x.key)).toEqual(['r1', 'r0']);
    expect(bookItemsFor('wtlb-one').map((x) => x.key)).toEqual(['w1', 'w2', 'w3']);
    expect(bookItemsFor('wtlb-two')).toEqual([]);
    expect(bookItemsFor('the-blessed')).toEqual([]);
    expect(bookItemsFor('holy-days')).toEqual([]);
  });

  it('little-flock / lords-rebuke skip a null preface, and every id is [] unloaded', () => {
    seedCorpora(); // flock preface null, rebuke preface { id: 'r0' }
    expect(bookItemsFor('little-flock')).toEqual([]);
    expect(bookItemsFor('lords-rebuke').map((x) => x.key)).toEqual(['r1', 'r0']);
    ['LETTERS_V1', 'LETTERS', 'LETTERS_V3', 'LETTERS_V4', 'LETTERS_V5',
      'LETTERS_V6', 'LETTERS_V7', 'LETTERS_TIMOTHY', 'LETTERS_FLOCK',
      'LETTERS_FLOCK_PREFACE', 'LETTERS_REBUKE', 'LETTERS_REBUKE_PREFACE',
      'COL_BY_KEY', 'colLetterArr'].forEach((k) => { delete globalThis[k]; });
    for (const id of ['volume-one', 'volume-two', 'volume-three', 'volume-four',
      'volume-five', 'volume-six', 'volume-seven', 'letters-timothy',
      'little-flock', 'lords-rebuke', 'wtlb-one', 'wtlb-two', 'the-blessed', 'holy-days']) {
      expect(bookItemsFor(id)).toEqual([]);
    }
  });

  it('matthew and bible-study ids degrade when their loaders are missing or empty', () => {
    expect(bookItemsFor('matthew')).toEqual([]); // _matthew undefined
    globalThis._matthew = () => null;
    expect(bookItemsFor('matthew')).toEqual([]);
    globalThis._matthew = () => ({ chapters: 'not-an-array' });
    expect(bookItemsFor('matthew')).toEqual([]);
    globalThis._matthew = () => ({ chapters: [{ num: 1 }, { num: 2 }] });
    expect(bookItemsFor('matthew').map((x) => x.key)).toEqual([1, 2]);

    expect(bookItemsFor('bible-study-faith')).toEqual([]); // _studies undefined
    globalThis._studies = () => [null, { slug: 'faith', chapters: 'not-an-array' }, { slug: 'empty', chapters: [] }];
    expect(bookItemsFor('bible-study-faith')).toEqual([]);
    expect(bookItemsFor('bible-study-empty')).toEqual([]);
    expect(bookItemsFor('bible-study-missing')).toEqual([]);
    globalThis._studies = () => [{ slug: 'faith', chapters: [{ id: 'a' }, { id: 'b' }] }];
    expect(bookItemsFor('bible-study-faith').map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('bible-book ids read chapters off BOOKS, and [] when the book is absent', () => {
    expect(bookItemsFor('mark')).toEqual([]); // BOOKS undefined
    globalThis.BOOKS = { mark: { chapters: [{ num: 1 }, { num: 2 }] }, ruth: {} };
    expect(bookItemsFor('mark').map((x) => x.key)).toEqual([1, 2]);
    expect(bookItemsFor('ruth')).toEqual([]); // book without chapters
    globalThis.BOOKS = null;
    expect(bookItemsFor('mark')).toEqual([]);
  });
});

describe('buildProgressGroups — non-empty collections and loader edges (tests-6 item 4)', () => {
  it('includes non-empty later volumes, timothy, flock, and the wtlb/blessed/holy-days collections', () => {
    seedCorpora();
    globalThis.LETTERS_V3 = [{ id: 'v3a' }];
    globalThis.LETTERS_V4 = [{ id: 'v4a' }];
    globalThis.LETTERS_V5 = [{ id: 'v5a' }];
    globalThis.LETTERS_V6 = [{ id: 'v6a' }];
    globalThis.LETTERS_V7 = [{ id: 'v7a' }];
    globalThis.LETTERS_TIMOTHY = [{ id: 't1' }];
    globalThis.LETTERS_FLOCK = [{ id: 'f1' }];
    globalThis.LETTERS_FLOCK_PREFACE = { id: 'f0' };
    globalThis.LETTERS_REBUKE_PREFACE = null;
    globalThis.colLetterArr = (col) => {
      if (!col) return [];
      if (col.globalName === 'WTLB_ONE') return [{ id: 'w1' }];
      if (col.globalName === 'WTLB_TWO') return [{ id: 'w2a' }, { id: 'w2b' }];
      if (col.globalName === 'THE_BLESSED') return [{ id: 'b1' }];
      if (col.globalName === 'HOLY_DAYS') return [{ id: 'h1' }];
      if (col.globalName === 'HIDDEN_MANNA') return [{ id: 'woe-to-dallas' }];
      return [];
    };
    const volumes = groupBooks(buildProgressGroups()[0]);
    expect(volumes.find((b) => b.id === 'volume-three').total).toBe(1);
    expect(volumes.find((b) => b.id === 'volume-seven').total).toBe(1);
    expect(volumes.find((b) => b.id === 'letters-timothy').total).toBe(1);
    expect(volumes.find((b) => b.id === 'little-flock').total).toBe(2); // + preface
    expect(volumes.find((b) => b.id === 'lords-rebuke').total).toBe(1); // preface now null
    expect(volumes.find((b) => b.id === 'wtlb-two').total).toBe(2);
    expect(volumes.find((b) => b.id === 'the-blessed').total).toBe(1);
    expect(volumes.find((b) => b.id === 'holy-days').total).toBe(1);
  });

  it('matthew with no chapters scores 0, and a studies list with no open study drops the genre', () => {
    seedCorpora();
    globalThis._matthew = () => null;
    globalThis._studies = () => [
      { slug: 'locked', title: 'L', locked: true, chapters: [{}] },
      { slug: 'noch', title: 'N', locked: false },
      { slug: 'empty', title: 'E', locked: false, chapters: [] },
    ];
    const studies = groupBooks(buildProgressGroups()[3]);
    expect(studies.find((b) => b.id === 'matthew').total).toBe(0);
    expect(studies.find((b) => b.id.startsWith('bible-study-'))).toBeUndefined();
  });

  it('drops empty rebuke/wtlb collections and counts a preface-less flock at its length', () => {
    seedCorpora();
    globalThis.LETTERS_REBUKE = [];
    globalThis.LETTERS_FLOCK = [{ id: 'f1' }]; // preface stays null from seed
    globalThis.colLetterArr = (col) => {
      if (!col) return [];
      if (col.globalName === 'WTLB_TWO') return [{ id: 'w2a' }];
      return []; // WTLB_ONE empty here
    };
    const volumes = groupBooks(buildProgressGroups()[0]);
    expect(volumes.find((b) => b.id === 'lords-rebuke')).toBeUndefined();
    expect(volumes.find((b) => b.id === 'little-flock').total).toBe(1);
    expect(volumes.find((b) => b.id === 'wtlb-one')).toBeUndefined();
    expect(volumes.find((b) => b.id === 'wtlb-two').total).toBe(1);
  });
});

describe('progressCorporaReady — loaded:false and null BOOKS (tests-6 item 4)', () => {
  it('is false when the VOT corpus is present but not loaded, and when BOOKS is null', () => {
    globalThis.BOOKS = { genesis: { chapters: [{}] } };
    window.__votCorpus = { loaded: false };
    expect(progressCorporaReady()).toBe(false);
    window.__votCorpus = { loaded: true };
    expect(progressCorporaReady()).toBe(true);
    globalThis.BOOKS = null;
    expect(progressCorporaReady()).toBe(false);
  });
});

describe('annotationSourceForKey — guard branches (tests-6 item 4)', () => {
  it('bible keys without a book and study keys without a chapter number resolve to null', () => {
    expect(annotationSourceForKey('bible:')).toBeNull();
    expect(annotationSourceForKey('bible')).toBeNull();
    expect(annotationSourceForKey('study:')).toBeNull();
    expect(annotationSourceForKey('study:matthew')).toBeNull();
    expect(annotationSourceForKey('letter::0')).toBeNull();
  });

  it('letter keys resolve to null when findEntryContext is absent', () => {
    // No findEntryContext global at all (and no COL_BY_KEY, so the Hidden
    // Manna guard takes its early-false path).
    expect(annotationSourceForKey('letter:grafted-in:0')).toBeNull();
  });

  it('defaults a missing collection to an empty string', () => {
    globalThis.findEntryContext = () => ({ title: 'Title Only' }); // no collection
    expect(annotationSourceForKey('letter:title-only:0')).toEqual({
      key: 'letter:title-only', label: 'Title Only', collection: '',
    });
  });

  it('Hidden Manna guard returns false when the hm collection is missing or colLetterArr is absent', () => {
    seedCorpora();
    globalThis.COL_BY_KEY = new Map(); // no 'hm' entry
    globalThis.findEntryContext = () => ({ title: 'Woe to Dallas', collection: 'Hidden Manna' });
    expect(annotationSourceForKey('letter:woe-to-dallas:0')).toEqual({
      key: 'letter:woe-to-dallas', label: 'Woe to Dallas', collection: 'Hidden Manna',
    });
    delete globalThis.colLetterArr;
    globalThis.COL_BY_KEY = new Map([['hm', { volKey: 'hm' }]]);
    expect(annotationSourceForKey('letter:woe-to-dallas:0')).toEqual({
      key: 'letter:woe-to-dallas', label: 'Woe to Dallas', collection: 'Hidden Manna',
    });
  });
});

describe('mostAnnotatedSources — word-count and segment paths (tests-6 item 4)', () => {
  afterEach(() => { delete globalThis.countItemWords; });

  it('sums bible chapters for density when countItemWords is set', () => {
    globalThis.BOOKS = { psalms: { chapters: [{ num: 1, w: 100 }, { num: 2, w: 200 }] } };
    globalThis.countItemWords = (it) => (it && it.w) || 0;
    const out = mostAnnotatedSources({ 'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1' }] });
    expect(out).toEqual([
      { key: 'bible:psalms', label: 'Psalms', collection: 'Scripture', hlKey: 'bible:psalms:23:1', count: 1, words: 300, per1k: 3.3 },
    ]);
  });

  it('letter sources with an unresolvable or wordless entry carry per1k 0', () => {
    globalThis.findEntryContext = (id, _kind) => {
      if (id === 'no-entry') return { title: 'No Entry', collection: 'V1' }; // no entry
      if (id === 'has-entry') return { title: 'Has Entry', collection: 'V1', entry: { id, w: 400 } };
      return null;
    };
    globalThis.countItemWords = (it) => (it && it.w) || 0;
    const ann = {
      'letter:no-entry:0': [{ id: 'n1', groupId: 'n1' }],
      'letter:has-entry:0': [{ id: 'h1', groupId: 'h1' }],
      'letter:ghost:0': [{ id: 'g1', groupId: 'g1' }],
    };
    const out = mostAnnotatedSources(ann);
    // ghost never resolves (findEntryContext null) so it is dropped;
    // no-entry resolves but has no entry → words 0, per1k 0.
    expect(out.map((s) => s.key)).toEqual(['letter:has-entry', 'letter:no-entry']);
    expect(out[0]).toMatchObject({ words: 400, per1k: 2.5 });
    expect(out[1]).toMatchObject({ words: 0, per1k: 0 });
  });

  it('skips falsy segments and non-array segment lists, and rejects non-object input', () => {
    const out = mostAnnotatedSources({ 'bible:mark:1:1': [null, { id: 'm1', groupId: 'm1' }, undefined] });
    expect(out).toEqual([
      { key: 'bible:mark', label: 'Mark', collection: 'Scripture', hlKey: 'bible:mark:1:1', count: 1, words: 0, per1k: 0 },
    ]);
    const out2 = mostAnnotatedSources({
      'bible:mark:1:1': 'not-an-array',
      'bible:luke:1:1': [{ id: 'l1', groupId: 'l1' }],
    });
    expect(out2.map((s) => s.key)).toEqual(['bible:luke']);
    expect(mostAnnotatedSources('not-an-object')).toEqual([]);
    expect(mostAnnotatedSources(42)).toEqual([]);
  });
});

describe('groupWordStats — null readItems (tests-6 item 4)', () => {
  afterEach(() => { delete globalThis.countItemWords; });

  it('counts zero words read when readItems is null', () => {
    globalThis.countItemWords = (it) => it.w;
    globalThis.LETTERS_V1 = [{ id: 'a', w: 100 }];
    const grp = { id: 'vot', label: 'VOT', genres: [{ label: 'g', books: [{ id: 'volume-one', label: 'Volume One', total: 1 }] }] };
    expect(groupWordStats(null, grp)).toEqual({ wordsRead: 0, wordsTotal: 100 });
  });
});
