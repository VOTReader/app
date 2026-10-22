// @ts-nocheck — free-var globals stubbed per test (the bundle-d module contract)
/**
 * personal-build: My Web's inputs read from the live app (LinkStore, the
 * Volumes in READING_CHAIN order, the Bible studies) into the dual rail.
 *
 * w3 (My Web stream, 2026-10-18), RED first: a collection's PREFACE is a
 * page the reader can link to (nav-index offers it, letterNum 0), but the
 * rail was built from colLetterArr alone, so a link to a preface was
 * skipped as unresolvable and the preface had no place on the top rail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildPersonal } from './personal-build.js';
import { _NAV_ICONS } from '../../data/scripture-resolution.js';

const g = /** @type {any} */ (globalThis);
const STUBS = ['LinkStore', 'COLLECTIONS', 'READING_CHAIN', 'colLetterArr', 'colPreface', 'BIBLE_STUDIES', '_NAV_ICONS'];

const GRAPH = {
  books: [{ id: 'genesis' }, { id: 'john' }],
  chapters: [[0, 1, 0, 31], [1, 3, 31, 36]],
  votEdges: [{ v: 2, kind: 'footnote', volKey: 'one', letterId: 'one-preface' }],
};

beforeEach(() => {
  g.READING_CHAIN = ['one', 'two'];
  g.COLLECTIONS = [
    { volKey: 'one', label: 'Volume One', prefaceGlobal: 'V1_PREFACE' },
    { volKey: 'two', label: 'Volume Two' },
  ];
  g.colLetterArr = (col) => (col.volKey === 'one'
    ? [{ id: 'a-word', title: 'A Word' }, { id: 'shared', title: 'Shared (I)' }]
    : [{ id: 'shared', title: 'Shared (II)' }]);
  g.colPreface = (col) => (col.volKey === 'one' ? { id: 'one-preface', title: 'Preface to Volume One' } : null);
  g.LinkStore = { all: () => [] };
});
afterEach(() => { STUBS.forEach((k) => delete g[k]); });

describe('buildPersonal', () => {
  it('puts each collection\'s preface first in its segment, so a link to it lands', () => {
    g.LinkStore = { all: () => [{
      id: 'p', source: { type: 'bible', bookId: 'john', chapter: 3, verse: 16 },
      target: { type: 'letter', key: 'letter:one-preface:0', letterId: 'one-preface', collection: 'Volume One' },
    }] };
    const built = buildPersonal(GRAPH);
    expect(built.votRail.nodes.map((n) => n.id)).toEqual(['one-preface', 'a-word', 'shared', 'shared']);
    expect(built.votRail.segments[0]).toMatchObject({ volKey: 'one', start: 0, count: 3 });
    expect(built.graph.count).toBe(1);
    expect(built.graph.skipped).toBe(0);
    expect(built.graph.bPos[0]).toBe(0);
    // and a curated thread cited from the preface has its foot there too
    expect(built.underlay.count).toBe(1);
    expect(built.underlay.votPos[0]).toBe(0);
  });

  it('places a shared id in the collection the link names (item 25, end to end)', () => {
    g.LinkStore = { all: () => [{
      id: 's', source: { type: 'bible', bookId: 'genesis', chapter: 1, verse: 1 },
      target: { type: 'letter', key: 'letter:shared:0', letterId: 'shared', collection: 'Volume Two' },
    }] };
    const built = buildPersonal(GRAPH);
    expect(built.graph.bPos[0]).toBe(3);
  });

  it('w4 review: each collection carries a tiny form for a narrow rail (the nav badges; the studies\' own) and Volumes I-VII, and the WTLB parts, a family', () => {
    // the rail's names step down short -> tiny when the short ones do not fit (rail-renderer
    // drawRails); a family steps down together so "VOL I" never stands by "V2"
    g._NAV_ICONS = _NAV_ICONS;
    g.READING_CHAIN = ['one', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'holydays'];
    g.COLLECTIONS = g.READING_CHAIN.map((volKey) => ({ volKey, label: volKey }));
    g.colLetterArr = (col) => [{ id: col.volKey + '-a', title: 'A' }];
    g.colPreface = () => null;
    g.BIBLE_STUDIES = [
      { id: 'more-than-a-man', title: 'More Than a Man', chapters: [{ id: 'm1' }] },
      { id: 'trinity-exposed', title: 'The Trinity Exposed', chapters: [{ id: 't1' }] },
      { id: 'purity', title: 'Purity', chapters: [{ id: 'p1' }] },
    ];
    const segs = buildPersonal(GRAPH).votRail.segments;
    expect(segs.map((x) => [x.short, x.tiny, x.group])).toEqual([
      ['Vol I', 'V1', 'vol'], ['Vol VII', 'V7', 'vol'], ['Rebuke', 'LR', 'rebuke'],
      ['WTLB I', 'W1', 'wtlb'], ['WTLB II', 'W2', 'wtlb'], ['Holy Days', 'HD', 'holydays'],
      ['MTaM', 'MTaM', 'study-more-than-a-man'], ['Trinity', 'Trin', 'study-trinity-exposed'], ['Purity', 'Pur', 'study-purity'],
    ]);
    // the Volumes' tiny forms ARE the nav badges, so the rail and the nav never disagree
    for (const x of segs.slice(0, 6)) expect(x.tiny).toBe(_NAV_ICONS[x.volKey]);
  });

  it('is null before LinkStore exists, and never throws on a corpus with no studies', () => {
    delete g.LinkStore;
    expect(buildPersonal(GRAPH)).toBeNull();
    g.LinkStore = { all: () => [] };
    expect(() => buildPersonal(GRAPH)).not.toThrow();
  });
});
