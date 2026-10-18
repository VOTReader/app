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

const g = /** @type {any} */ (globalThis);
const STUBS = ['LinkStore', 'COLLECTIONS', 'READING_CHAIN', 'colLetterArr', 'colPreface', 'BIBLE_STUDIES'];

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

  it('is null before LinkStore exists, and never throws on a corpus with no studies', () => {
    delete g.LinkStore;
    expect(buildPersonal(GRAPH)).toBeNull();
    g.LinkStore = { all: () => [] };
    expect(() => buildPersonal(GRAPH)).not.toThrow();
  });
});
