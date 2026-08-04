// @ts-nocheck — free-var corpus globals stubbed per test
/* progress-stats — the aggregation layer under the My Progress dashboard
   (and the Settings Mark-as-Read table, which shares buildProgressGroups).
   Everything here is a pure function over stubbed corpus globals, so each
   case sets exactly the free-variable surface it exercises. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  READ_VERSION_ID, progressCorporaReady, buildProgressGroups,
  countReadFor, groupBooks, tallyGroup,
  annotationSourceForKey, mostAnnotatedSources, groupWordStats,
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
      { key: 'bible:psalms', label: 'Psalms', collection: 'Scripture', count: 2 },
      { key: 'letter:grafted-in', label: 'Grafted In', collection: 'Volume Three', count: 1 },
    ]);
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

  it('degrades to zeros without the counter global (guard path)', () => {
    const grp = { id: 'x', label: 'X', genres: [{ label: 'g', books: [{ id: 'volume-one', label: 'V1', total: 1 }] }] };
    expect(groupWordStats({}, grp)).toEqual({ wordsRead: 0, wordsTotal: 0 });
  });
});
