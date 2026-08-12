import { describe, it, expect } from 'vitest';
import {
  buildVotRail,
} from '../../utils/scripture-web/personal-graph.js';
import {
  endpointPoint, linkPath, pickUnderlayLinks, pickPersonalLinks, railFrame,
} from './rail-renderer.js';

const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', items: [{ id: 'letter-1', title: 'Letter One' }] },
]);
const opts = {
  width: 1000, height: 600, H: 600, DPR: 1, base: 500, votRail: rail,
  verseX: (verse) => verse * 10,
};

describe('rail picking', () => {
  it('keeps a visible curated underlay line tappable', () => {
    const underlay = {
      count: 1,
      versePos: new Float32Array([5]),
      votPos: new Float32Array([0]),
      records: [{ kind: 'votNote', letterId: 'letter-1', volKey: 'one' }],
    };
    const rails = railFrame(opts, opts.base);
    const a = [opts.verseX(5), rails.bottomY];
    const b = endpointPoint({ rail: 1, pos: 0 }, opts.verseX, rail, opts.width, rails);
    const point = linkPath(a[0], a[1], b[0], b[1], true, 12)[6];
    expect(pickUnderlayLinks(underlay, opts, point[0], point[1], 4, 4))
      .toMatchObject([{ index: 0, record: underlay.records[0] }]);
  });

  it('returns overlapping personal links as candidates', () => {
    const personal = {
      count: 2,
      aRail: new Uint8Array([0, 0]), bRail: new Uint8Array([1, 1]),
      aPos: new Float32Array([5, 5]), bPos: new Float32Array([0, 0]),
    };
    const rails = railFrame(opts, opts.base);
    const a = [opts.verseX(5), rails.bottomY];
    const b = endpointPoint({ rail: 1, pos: 0 }, opts.verseX, rail, opts.width, rails);
    const point = linkPath(a[0], a[1], b[0], b[1], true, { n: 28 })[14];
    expect(pickPersonalLinks(personal, opts, point[0], point[1], 4, 4)
      .map((hit) => hit.index)).toEqual([0, 1]);
  });
});
