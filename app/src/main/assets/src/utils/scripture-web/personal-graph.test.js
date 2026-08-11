/**
 * scripture-web/personal-graph tests.
 *
 * These pin the adapter between the reader's stored links and the dual-rail
 * web: every endpoint type lands on the right rail, char-span suffixes
 * collapse to one node, and a link the corpus can no longer resolve is
 * skipped rather than thrown — a deleted letter must not blank the screen.
 */
import { describe, it, expect } from 'vitest';
import {
  VOT_TYPES, baseKey, buildVotRail, placeEndpoint, buildPersonalGraph,
  buildCuratedUnderlay, refKeyToRailEndpoint,
} from './personal-graph.js';

// Bottom rail: 2 books x 2 chapters x 10 verses, matching the geometry tests.
const CHAPTER_START = {
  'alpha:1': 0, 'alpha:2': 10, 'beta:1': 20, 'beta:2': 30,
  'matthew-plain:1': 40, 'matthew-plain:4': 50,
};
const verseIdOf = (bookId, chapter, verse) => {
  const start = CHAPTER_START[bookId + ':' + chapter];
  return start === undefined ? -1 : start + (verse - 1);
};

const votRail = buildVotRail([
  { volKey: 'one', label: 'Volume One', items: [{ id: 'the-wide-path', title: 'The Wide Path' }, { id: 'duty', title: 'Duty' }] },
  { volKey: 'wtlb1', label: 'Words To Live By', items: [{ id: 'matters-of-the-heart', title: 'Matters of the Heart' }] },
  { volKey: 'blessed', label: 'The Blessed', items: [{ id: 'blessed-are-those-who-seek-me', title: 'Blessed Are Those Who Seek Me' }] },
]);
const ctx = { verseIdOf, votRail };

describe('buildVotRail', () => {
  it('lays collections out in reading order with contiguous segments', () => {
    expect(votRail.total).toBe(4);
    expect(votRail.segments).toEqual([
      { volKey: 'one', label: 'Volume One', start: 0, count: 2 },
      { volKey: 'wtlb1', label: 'Words To Live By', start: 2, count: 1 },
      { volKey: 'blessed', label: 'The Blessed', start: 3, count: 1 },
    ]);
  });

  it('indexes by scoped key AND bare id (endpoints often omit the volume)', () => {
    expect(votRail.index.get('one:duty')).toBe(1);
    expect(votRail.index.get('duty')).toBe(1);
  });

  it('survives an empty corpus without throwing', () => {
    const empty = buildVotRail([]);
    expect(empty.total).toBe(0);
    expect(empty.segments).toEqual([]);
  });
});

describe('baseKey', () => {
  it('strips the char-span suffix a target endpoint carries', () => {
    expect(baseKey('letter:the-wide-path:2:10-40')).toBe('letter:the-wide-path:2');
    expect(baseKey('bible:john:3:16-18:12-47')).toBe('bible:john:3:16-18');
  });
  it('leaves a bare source key alone', () => {
    expect(baseKey('letter:the-wide-path:2')).toBe('letter:the-wide-path:2');
    expect(baseKey('bible:genesis:1:1')).toBe('bible:genesis:1:1');
  });
  it('tolerates missing keys', () => {
    expect(baseKey(undefined)).toBe('');
    expect(baseKey(null)).toBe('');
  });
});

describe('placeEndpoint — all endpoint types', () => {
  it('places a bible verse from structured fields', () => {
    expect(placeEndpoint(
      { type: 'bible', key: 'bible:beta:1:5', bookId: 'beta', chapter: 1, verse: 5 }, ctx
    )).toMatchObject({ rail: 'bible', pos: 24 });
  });

  it('places a bible verse by parsing the key when fields are absent', () => {
    expect(placeEndpoint({ type: 'bible', key: 'bible:alpha:2:3' }, ctx))
      .toMatchObject({ rail: 'bible', pos: 12 });
  });

  it('treats a chapter-only bible endpoint as its first verse', () => {
    expect(placeEndpoint({ type: 'bible', key: 'bible:beta:2' }, ctx))
      .toMatchObject({ rail: 'bible', pos: 30 });
  });

  it('routes the Study Bible onto the SCRIPTURE rail, not the VOT rail', () => {
    // `study` is Matthew with commentary — it is a Bible verse and belongs on
    // the canon axis, or the two webs would disagree about where Matthew is.
    expect(placeEndpoint(
      { type: 'study', key: 'study:matthew-4:7', bookId: 'matthew', chapter: 4, verse: 7 }, ctx
    )).toMatchObject({ rail: 'bible', pos: 56 });
  });

  it('pins the matthew alias: `matthew` resolves to plain Matthew verses', () => {
    const viaField = placeEndpoint({ type: 'bible', bookId: 'matthew', chapter: 1, verse: 1 }, ctx);
    const viaAlias = placeEndpoint({ type: 'bible', bookId: 'matthew-plain', chapter: 1, verse: 1 }, ctx);
    expect(viaField.pos).toBe(viaAlias.pos);
    expect(viaField.pos).toBe(40);
  });

  it('splits a "<book>-<chapter>" study key when there is no chapter field', () => {
    expect(placeEndpoint({ type: 'study', key: 'study:matthew-4:7', bookId: 'matthew-4', verse: 7 }, ctx))
      .toMatchObject({ rail: 'bible', pos: 56 });
  });

  it('places every VOT type on the top rail', () => {
    const cases = [
      ['letter', { type: 'letter', key: 'letter:the-wide-path:2', letterId: 'the-wide-path' }, 0],
      ['wtlb', { type: 'wtlb', key: 'wtlb:matters-of-the-heart:0', entryId: 'matters-of-the-heart' }, 2],
      ['blessed', { type: 'blessed', key: 'wtlb:blessed-are-those-who-seek-me:0', entryId: 'blessed-are-those-who-seek-me' }, 3],
      ['holy-days', { type: 'holy-days', key: 'wtlb:duty:0', entryId: 'duty' }, 1],
      ['study-letter', { type: 'study-letter', key: 'letter:duty:0', letterId: 'duty' }, 1],
      ['journal', { type: 'journal', key: 'journal:the-wide-path:0', entryId: 'the-wide-path' }, 0],
    ];
    for (const row of cases) {
      const name = /** @type {string} */ (row[0]);
      const ep = /** @type {any} */ (row[1]);
      const pos = /** @type {number} */ (row[2]);
      expect(placeEndpoint(ep, ctx), name).toMatchObject({ rail: 'vot', pos });
    }
    expect(VOT_TYPES.size).toBe(6);
  });

  it('prefers the volume-scoped id when the endpoint names its volume', () => {
    expect(placeEndpoint(
      { type: 'letter', key: 'letter:duty:0', letterId: 'duty', volKey: 'one' }, ctx
    )).toMatchObject({ rail: 'vot', pos: 1 });
  });

  it('collapses a char-span excerpt onto the same node as its bare key', () => {
    const bare = placeEndpoint({ type: 'letter', key: 'letter:duty:2', letterId: 'duty' }, ctx);
    const span = placeEndpoint({ type: 'letter', key: 'letter:duty:2:10-40', letterId: 'duty' }, ctx);
    expect(span.pos).toBe(bare.pos);
    expect(span.key).toBe(bare.key);
  });

  it('returns null — never throws — on malformed or unresolvable endpoints', () => {
    expect(placeEndpoint(null, ctx)).toBeNull();
    expect(placeEndpoint({}, ctx)).toBeNull();
    expect(placeEndpoint({ type: 'bible' }, ctx)).toBeNull();               // no book
    expect(placeEndpoint({ type: 'bible', bookId: 'alpha' }, ctx)).toBeNull(); // no chapter
    expect(placeEndpoint({ type: 'bible', bookId: 'nope', chapter: 1, verse: 1 }, ctx)).toBeNull();
    expect(placeEndpoint({ type: 'letter', letterId: 'deleted-letter' }, ctx)).toBeNull();
    expect(placeEndpoint({ type: 'nonsense', key: 'x:y' }, ctx)).toBeNull();
  });
});

describe('buildPersonalGraph', () => {
  const links = [
    { id: 'l1', source: { type: 'bible', key: 'bible:alpha:1:1', bookId: 'alpha', chapter: 1, verse: 1 },
      target: { type: 'letter', key: 'letter:duty:2:10-40', letterId: 'duty' } },
    { id: 'l2', source: { type: 'bible', key: 'bible:alpha:1:1', bookId: 'alpha', chapter: 1, verse: 1 },
      target: { type: 'bible', key: 'bible:beta:2:5', bookId: 'beta', chapter: 2, verse: 5 } },
    { id: 'l3', source: { type: 'letter', key: 'letter:the-wide-path:0', letterId: 'the-wide-path' },
      target: { type: 'wtlb', key: 'wtlb:matters-of-the-heart:0', entryId: 'matters-of-the-heart' } },
    { id: 'l4', source: { type: 'letter', letterId: 'a-letter-that-no-longer-exists' },
      target: { type: 'bible', bookId: 'alpha', chapter: 1, verse: 2 } },
  ];

  it('classifies each link as scripture, volumes, or a bridge between them', () => {
    const g = buildPersonalGraph(links, ctx);
    expect(g.count).toBe(3);
    expect(Array.from(g.kind)).toEqual([2, 0, 1]);   // bridge, scripture, volumes
    expect(Array.from(g.aRail)).toEqual([0, 0, 1]);
    expect(Array.from(g.bRail)).toEqual([1, 0, 1]);
  });

  it('skips unresolvable links and counts them instead of throwing', () => {
    const g = buildPersonalGraph(links, ctx);
    expect(g.skipped).toBe(1);
    expect(g.records.map((r) => /** @type {any} */ (r).id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('records positions on both rails', () => {
    const g = buildPersonalGraph(links, ctx);
    expect(Array.from(g.aPos)).toEqual([0, 0, 0]);
    expect(Array.from(g.bPos)).toEqual([1, 34, 2]);
  });

  it('counts node degree so busy anchors can be drawn larger', () => {
    const g = buildPersonalGraph(links, ctx);
    expect(g.degree.get('bible:0')).toBe(2);   // Alpha 1:1 is in two links
    expect(g.degree.get('vot:1')).toBe(1);
  });

  it('handles an empty or absent link set', () => {
    expect(buildPersonalGraph([], ctx).count).toBe(0);
    expect(buildPersonalGraph(null, ctx).count).toBe(0);
    expect(buildPersonalGraph([null, {}], ctx).skipped).toBe(2);
  });
});

describe('curated underlay', () => {
  it('pairs corpus votEdges onto the two rails', () => {
    const u = buildCuratedUnderlay([
      { v: 5, kind: 'footnote', volKey: 'one', letterId: 'duty' },
      { v: 9, kind: 'wtlb', volKey: 'wtlb1', entryId: 'matters-of-the-heart' },
      { v: 3, kind: 'footnote', volKey: 'one', letterId: 'gone' },   // unresolvable
      { v: 7, kind: 'study', studyId: 'lamb-of-god' },               // no VOT node
    ], ctx);
    expect(u.count).toBe(2);
    expect(Array.from(u.versePos)).toEqual([5, 9]);
    expect(Array.from(u.votPos)).toEqual([1, 2]);
  });

  it('is empty when there is no rail yet', () => {
    expect(buildCuratedUnderlay([{ v: 1, volKey: 'one', letterId: 'duty' }], {}).count).toBe(0);
  });
});

describe('journal-index refKey translation', () => {
  it('translates the journal grammar into rail-placeable endpoints', () => {
    // The journal index uses its OWN grammar, distinct from hlKeys.
    expect(placeEndpoint(refKeyToRailEndpoint('chapter:beta:1'), ctx))
      .toMatchObject({ rail: 'bible', pos: 20 });
    expect(placeEndpoint(refKeyToRailEndpoint('verse:alpha:2:4'), ctx))
      .toMatchObject({ rail: 'bible', pos: 13 });
    expect(placeEndpoint(refKeyToRailEndpoint('letter:one/duty'), ctx))
      .toMatchObject({ rail: 'vot', pos: 1 });
  });

  it('returns null for grammars it does not own', () => {
    expect(refKeyToRailEndpoint('bookmark:abc')).toBeNull();
    expect(refKeyToRailEndpoint('note:xyz')).toBeNull();
    expect(refKeyToRailEndpoint('nonsense')).toBeNull();
    expect(refKeyToRailEndpoint('')).toBeNull();
  });
});
