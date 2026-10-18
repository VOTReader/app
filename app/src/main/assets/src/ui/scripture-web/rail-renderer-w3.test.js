/* rail-renderer — w3, the My Web stream (2026-10-18).

   item 29: the Nearby list on My Web was the first 36 links in store order
   wherever the camera stood, so "Nearby" was not near and link 37 on could
   be reached only by finding it on the canvas. nearestLinks orders EVERY
   link by how near its drawn line passes the middle of the view (the same
   path the draw and the pick use); nearestUnderlay does the same for
   Timothy's threads, the list's fallback before the reader has a link. */
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { nearestLinks, nearestUnderlay, railFrame } from './rail-renderer.js';

const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', items: Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, title: 'Letter ' + i })) },
]);
const opts = {
  width: 1000, height: 600, H: 600, DPR: 1, base: 500, votRail: rail,
  verseTotal: 100,
  verseX: (verse) => verse * 10,
};

/** Links from Bible verse `a[i]` to Volumes position `b[i]` (rail 0 -> rail 1). */
function crossLinks(a, b) {
  return {
    count: a.length,
    aRail: new Uint8Array(a.length), bRail: new Uint8Array(a.length).fill(1),
    aPos: new Float32Array(a), bPos: new Float32Array(b),
  };
}

describe('item 29: Nearby is nearest, and lists every link', () => {
  it('orders the links by how near their lines pass the middle of the view', () => {
    // verse 50 sits under the centre (x 500); the letters are 100 px apart from x 50
    const p = crossLinks([10, 48, 90, 52], [0, 4, 9, 5]);
    const order = nearestLinks(p, opts).map((h) => h.index);
    expect(order.slice(0, 2).sort()).toEqual([1, 3]);
    expect(order.slice(2).sort()).toEqual([0, 2]);
  });

  it('lists every link, past the old 36, each once', () => {
    const n = 50;
    const p = crossLinks(Array.from({ length: n }, (_, i) => i * 2), Array.from({ length: n }, (_, i) => i % 10));
    const order = nearestLinks(p, opts).map((h) => h.index);
    expect(order.length).toBe(n);
    expect(new Set(order).size).toBe(n);
  });

  it('a link with no foot on screen is still listed, after the ones in view', () => {
    // zoomed in 10x on verse 50: verse 0 and verse 99 are far off either side
    const deep = Object.assign({}, opts, { verseX: (v) => 500 + (v - 50) * 100, votX: (pos) => 500 + (pos - 5.5) * 1000 });
    const p = crossLinks([0, 50], [0, 5]);     // link 1 drops straight through the centre (letter 5's middle is 5.5)
    const order = nearestLinks(p, deep).map((h) => h.index);
    expect(order).toEqual([1, 0]);
  });

  it('Timothy\'s threads, nearest first, up to the limit', () => {
    const underlay = { count: 5, versePos: new Float32Array([0, 30, 50, 70, 99]), votPos: new Float32Array([0, 3, 5, 7, 9]) };
    const order = nearestUnderlay(underlay, opts, 3).map((h) => h.index);
    expect(order.length).toBe(3);
    expect(order[0]).toBe(2);
    expect(order.slice(1).sort()).toEqual([1, 3]);
  });

  it('the middle of the view is mid-gap, between the rails', () => {
    const rails = railFrame({ H: 600, DPR: 1 }, 500);
    // two Bible-to-Bible links at the same distance across: the shorter hump (nearer the
    // rail, farther from mid-gap) comes after the taller one
    const p = {
      count: 2, aRail: new Uint8Array([0, 0]), bRail: new Uint8Array([0, 0]),
      aPos: new Float32Array([49, 40]), bPos: new Float32Array([51, 60]),
    };
    expect(rails.bottomY).toBe(500);
    expect(nearestLinks(p, opts).map((h) => h.index)).toEqual([1, 0]);
  });
});
