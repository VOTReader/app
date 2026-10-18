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
  buildCuratedUnderlay, linkIndexById,
} from './personal-graph.js';

// Bottom rail: 2 books x 2 chapters x 10 verses, matching the geometry tests.
const CHAPTER_START = {
  'alpha:1': 0, 'alpha:2': 10, 'beta:1': 20, 'beta:2': 30,
  'matthew-plain:1': 40, 'matthew-plain:4': 50, 'matthew-plain:22': 60,
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
      { volKey: 'one', label: 'Volume One', short: 'Volume One', start: 0, count: 2 },
      { volKey: 'wtlb1', label: 'Words To Live By', short: 'Words To Live By', start: 2, count: 1 },
      { volKey: 'blessed', label: 'The Blessed', short: 'The Blessed', start: 3, count: 1 },
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
  it('maps STUDY edges through their study-<id> rail segment', () => {
    // Study edges carry {studyId, chapterId} rather than letterId/entryId.
    // Before this branch existed, all 781 of them silently vanished from the
    // underlay — reported from the device as albums missing from My Web.
    const rail = buildVotRail([
      { volKey: 'one', label: 'Volume One', items: [{ id: 'duty', title: 'Duty' }] },
      { volKey: 'study-lamb-of-god', label: 'The Lamb of God', items: [
        { id: 'lamb-of-god-ch3', title: 'Chapter 3' },
      ] },
    ]);
    const u = buildCuratedUnderlay([
      { v: 4, kind: 'study', studyId: 'lamb-of-god', chapterId: 'lamb-of-god-ch3' },
      { v: 6, kind: 'footnote', volKey: 'one', letterId: 'duty' },
      { v: 8, kind: 'study', studyId: 'not-on-rail', chapterId: 'x-ch1' },
    ], { votRail: rail });
    expect(u.count).toBe(2);
    expect(Array.from(u.versePos)).toEqual([4, 6]);
    expect(Array.from(u.votPos)).toEqual([1, 0]);
  });

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

/* ── w3 My Web stream: the correctness pack (REDs first, 2026-10-18) ────────
   Item 25: 23 letter ids are shared between collections (Holy Days carries
   letters from the Volumes; WTLB and The Blessed share entry ids), and the
   bare-id lookup is first-writer-wins, so a link into the later collection
   landed on the earlier one's letter. The endpoint names its collection
   (nav-index writes `collection`, and now `volKey`); the rail resolves that
   scope before the bare id. Item 26: the Study Bible's key fuses
   "<book>-<chapter>" and puts the verse THIRD ("study:matthew-22:11"), and
   the key-only path read the verse slot as the chapter. */
describe('w3 placement: every endpoint lands on its own letter and verse', () => {
  const shared = buildVotRail([
    { volKey: 'one', label: 'Volume One', items: [{ id: 'intro', title: 'Intro' }, { id: 'duty', title: 'Duty' }] },
    { volKey: 'two', label: 'Volume Two', items: [{ id: 'intro', title: 'Intro (II)' }] },
    { volKey: 'wtlb1', label: 'Words To Live By: Part One', items: [{ id: 'introduction', title: 'Introduction' }] },
    { volKey: 'blessed', label: 'The Blessed', items: [{ id: 'introduction', title: 'Introduction (Blessed)' }] },
    { volKey: 'holydays', label: 'Holy Days', items: [{ id: 'duty', title: 'Duty (Holy Days)' }] },
    { volKey: 'study-lamb-of-god', label: 'The Lamb of God', items: [{ id: 'intro', title: 'Lamb ch1' }] },
  ]);
  const sctx = { verseIdOf, votRail: shared };
  const at = (ep) => { const p = placeEndpoint(ep, sctx); return p && p.pos; };

  it('item 25: a shared id resolves through the collection the endpoint names, not the first writer', () => {
    // nav-index endpoints carry the collection LABEL (and, from w3, its volKey)
    expect(at({ type: 'letter', key: 'letter:intro:0', letterId: 'intro', collection: 'Volume Two' })).toBe(2);
    expect(at({ type: 'letter', key: 'letter:intro:0', letterId: 'intro', volKey: 'two' })).toBe(2);
    expect(at({ type: 'blessed', key: 'wtlb:introduction:0', entryId: 'introduction', collection: 'The Blessed' })).toBe(4);
    // the endpoint's own type names the collection when nothing else does
    expect(at({ type: 'holy-days', key: 'wtlb:duty:0', entryId: 'duty' })).toBe(5);
    expect(at({ type: 'blessed', key: 'wtlb:introduction:0', entryId: 'introduction' })).toBe(4);
    // a study chapter rides its study's segment
    expect(at({ type: 'study-letter', key: 'letter:intro:0', letterId: 'intro', studyId: 'lamb-of-god' })).toBe(6);
    // the first writer still answers an endpoint that names nothing
    expect(at({ type: 'letter', key: 'letter:intro:0', letterId: 'intro' })).toBe(0);
    // a named collection the rail does not hold falls back to the bare id rather than losing the link
    expect(at({ type: 'letter', key: 'letter:duty:0', letterId: 'duty', collection: 'Gone Volume' })).toBe(1);
  });

  it('item 26: a key-only study endpoint reads "<book>-<chapter>" then the verse', () => {
    expect(placeEndpoint({ type: 'study', key: 'study:matthew-22:11' }, ctx)).toMatchObject({ rail: 'bible', pos: 70 });
    // the chapter-level key (verse slot 0) is the chapter's first verse
    expect(placeEndpoint({ type: 'study', key: 'study:matthew-4:0' }, ctx)).toMatchObject({ rail: 'bible', pos: 50 });
    // a fused bookId with no verse field takes the verse from the key
    expect(placeEndpoint({ type: 'study', key: 'study:matthew-22:11', bookId: 'matthew-22' }, ctx)).toMatchObject({ rail: 'bible', pos: 70 });
    // a bible key is unchanged: book, chapter, verse
    expect(placeEndpoint({ type: 'bible', key: 'bible:beta:2:3' }, ctx)).toMatchObject({ rail: 'bible', pos: 32 });
  });
});

describe('w3 counts: a record is drawn and counted once', () => {
  it('a link record the store holds twice (same id) is one link, and not a skipped one', () => {
    const one = { id: 'L1', source: { type: 'bible', bookId: 'alpha', chapter: 1, verse: 1 }, target: { type: 'letter', letterId: 'duty' } };
    const g = buildPersonalGraph([one, Object.assign({}, one), { id: 'L2', source: one.source, target: { type: 'letter', letterId: 'gone' } }], ctx);
    expect(g.count).toBe(1);
    expect(g.skipped).toBe(1);
  });

  it('two links between the same two places are both the reader’s, so both stay', () => {
    const a = { type: 'bible', bookId: 'alpha', chapter: 1, verse: 1 }, b = { type: 'letter', letterId: 'duty' };
    expect(buildPersonalGraph([{ id: 'x', source: a, target: b }, { id: 'y', source: b, target: a }], ctx).count).toBe(2);
  });

  it('a curated edge listed twice is one thread: the count is the threads drawn', () => {
    const u = buildCuratedUnderlay([
      { v: 5, kind: 'footnote', volKey: 'one', letterId: 'duty' },
      { v: 5, kind: 'votNote', volKey: 'one', letterId: 'duty' },
      { v: 6, kind: 'footnote', volKey: 'one', letterId: 'duty' },
    ], ctx);
    expect(u.count).toBe(2);
    expect(Array.from(u.versePos)).toEqual([5, 6]);
  });

  it('item 30: a link is found again by its id, whatever its index became', () => {
    const mk = (id, verse) => ({ id, source: { type: 'bible', bookId: 'alpha', chapter: 1, verse }, target: { type: 'letter', letterId: 'duty' } });
    const before = buildPersonalGraph([mk('a', 1), mk('b', 2), mk('c', 3)], ctx);
    const after = buildPersonalGraph([mk('b', 2), mk('c', 3)], ctx);
    expect(linkIndexById(before, 'c')).toBe(2);
    expect(linkIndexById(after, 'c')).toBe(1);
    expect(linkIndexById(after, 'a')).toBe(-1);
    expect(linkIndexById(null, 'a')).toBe(-1);
  });
});
