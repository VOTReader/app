// @ts-nocheck
/* frame-set and the top pass's tessellation (GL item 3; digest C1, C3, item 10).
   The top pass redraws the lit, hovered and chosen threads over the web in the
   ink table's gold. These cases hold what that set is (and in which order),
   that its threads stand on the main pass's own feet, and that its curve is
   sampled finely enough that the gold shows no facet: an independent oracle
   walks the drawn chords against the true curve. */
import { describe, it, expect } from 'vitest';
import { prophecySet, topSet, topSetKey, isCompact, COMPACT_HEIGHT_CSS, TOP_ORDER } from './frame-set.js';
import { fansOf } from './decode.js';
import * as geo from './geometry.js';

/** A small graph: six arcs over 200 verses, two of them joining the same verses as a prophecy pair. */
function graph() {
  const from = new Uint16Array([10, 10, 40, 60, 60, 120]);
  const to = new Uint16Array([150, 30, 90, 70, 70, 190]);
  const votes = new Int16Array([30, 5, 12, 3, 40, 8]);
  return {
    total: 200, count: 6, from, to, votes,
    prophecy: [
      { a: 60, b: 70, studyId: 's', chapterId: 'c' },     // arcs 3 and 4 join these: the stronger (4) is its arc
      { a: 190, b: 120, studyId: 's', chapterId: 'c' },   // arc 5, given the other way round
      { a: 5, b: 180, studyId: 's', chapterId: 'c' },     // no arc: its own thread
    ],
  };
}

describe('prophecySet: the prophecy pairs as threads, on their arc\'s feet when they are one', () => {
  it('maps a pair to the strongest arc joining its verses, in canon order, with that arc\'s fans', () => {
    const g = graph();
    const ps = prophecySet(g);
    const fans = fansOf(g);
    expect(ps.count).toBe(3);
    expect([...ps.arcOf]).toEqual([4, 5, -1]);
    expect([ps.from[0], ps.to[0]]).toEqual([60, 70]);
    expect([ps.from[1], ps.to[1]]).toEqual([120, 190]);
    expect(ps.fanA[0]).toBe(fans.fanA[4]);
    expect(ps.fanB[0]).toBe(fans.fanB[4]);
    expect(ps.fanA[1]).toBe(fans.fanA[5]);
    expect(ps.fanB[1]).toBe(fans.fanB[5]);
  });

  it('a pair that is no arc stands mid-cell (fan 0), canon order', () => {
    const ps = prophecySet(graph());
    expect([ps.from[2], ps.to[2], ps.fanA[2], ps.fanB[2]]).toEqual([5, 180, 0, 0]);
  });

  it('is built once per graph, and an empty list is an empty set', () => {
    const g = graph();
    expect(prophecySet(g)).toBe(prophecySet(g));
    const none = prophecySet({ total: 10, count: 0, from: new Uint16Array(0), to: new Uint16Array(0), votes: new Int16Array(0) });
    expect(none.count).toBe(0);
  });
});

/* The prophecy class (GL item 4) joined the top set in the commit that draws it: every pair, always,
   first. The cases below were written for the set without it; rewritten to the same intent with the
   class leading (three pairs in the fixture). */
describe('topSet: the prophecy class, then the lit, the hovered and the chosen, chosen last', () => {
  it('lays the kinds out in TOP_ORDER, each thread on the main pass\'s feet', () => {
    const g = graph();
    const fans = fansOf(g);
    expect(TOP_ORDER).toEqual(['prophecy', 'lit', 'hover', 'chosen']);
    const s = topSet(g, { lit: Int32Array.from([1, 2]), litKey: 'k', hoverArc: 3, focusArc: 0, focusProphecy: -1 });
    expect(s.ranges).toEqual([
      { kind: 'prophecy', first: 0, count: 3 }, { kind: 'lit', first: 3, count: 2 },
      { kind: 'hover', first: 5, count: 1 }, { kind: 'chosen', first: 6, count: 1 },
    ]);
    expect([...s.from]).toEqual([60, 120, 5, 10, 40, 60, 10]);
    expect([...s.to]).toEqual([70, 190, 180, 30, 90, 70, 150]);
    expect(s.fanA[6]).toBe(fans.fanA[0]);
    expect(s.fanB[6]).toBe(fans.fanB[0]);
  });

  it('the prophecy class is every pair on prophecySet\'s feet, whatever is asked about', () => {
    const g = graph();
    const ps = prophecySet(g);
    const s = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 });
    expect(s.ranges[0]).toEqual({ kind: 'prophecy', first: 0, count: ps.count });
    expect([...s.from.slice(0, 3)]).toEqual([...ps.from]);
    expect([...s.fanA.slice(0, 3)]).toEqual([...ps.fanA]);
    expect([...s.fanB.slice(0, 3)]).toEqual([...ps.fanB]);
  });

  it('a hover on the chosen line is not drawn twice; ids outside the graph are dropped', () => {
    const s = topSet(graph(), { lit: Int32Array.from([-1, 2, 99]), litKey: 'x', hoverArc: 0, focusArc: 0, focusProphecy: -1 });
    expect(s.ranges.map((r) => r.count)).toEqual([3, 1, 0, 1]);
  });

  it('a chosen prophecy pair is the chosen thread, on prophecySet\'s feet', () => {
    const g = graph();
    const s = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: 2 });
    expect(s.ranges.find((r) => r.kind === 'chosen')).toEqual({ kind: 'chosen', first: 3, count: 1 });
    expect([s.from[3], s.to[3], s.fanA[3], s.fanB[3]]).toEqual([5, 180, 0, 0]);
  });

  it('nothing asked about is the prophecy class alone; the same ask is the same set (no re-upload), a new one is new', () => {
    const g = graph();
    const none = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 });
    expect(none.count).toBe(3);
    expect(none.ranges.slice(1).every((r) => r.count === 0)).toBe(true);
    const v = { lit: null, litKey: '', hoverArc: 2, focusArc: -1, focusProphecy: -1 };
    const a = topSet(g, v, none);
    expect(a).not.toBe(none);
    expect(topSet(g, Object.assign({}, v), a)).toBe(a);
    expect(topSet(g, Object.assign({}, v, { hoverArc: 1 }), a)).not.toBe(a);
    expect(topSetKey(v)).toBe('|2|-1|-1');
    // a graph with no prophecy and nothing asked about: no top pass at all
    const bare = Object.assign(graph(), { prophecy: [] });
    expect(topSet(bare, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 }).count).toBe(0);
  });

  it('pairOf: an arc that joins a pair\'s verses names it; any other arc is not there', () => {
    const ps = prophecySet(graph());
    expect(ps.pairOf.get(4)).toBe(0);
    expect(ps.pairOf.get(5)).toBe(1);
    expect(ps.pairOf.has(3)).toBe(false);   // the weaker arc over the same verses: the pair's arc is 4
    expect(ps.pairOf.has(0)).toBe(false);
  });
});

describe('compact mode reads the frame\'s height (the spec: the root at most 500 CSS px)', () => {
  it('500 CSS px is compact, 501 is not, an unmeasured frame is not', () => {
    expect(COMPACT_HEIGHT_CSS).toBe(500);
    expect(isCompact(500)).toBe(true);
    expect(isCompact(501)).toBe(false);
    expect(isCompact(0)).toBe(false);
  });
});

/* The oracle: the top pass samples tau uniformly over the window's piece of
   the arc (the shader's mix(arcTau(lo), arcTau(hi), t)); between two samples
   the drawn chord is straight. Walk each chord against the true curve at
   sub-steps and take the farthest stray, over the part a reader can see. */
function worstStray(x0, x1, width, height, base, squash, segments) {
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const { A } = geo.arcShape((right - left) / 2, squash);
  const lo = Math.max(left, -geo.CLIP_MARGIN), hi = Math.max(Math.min(right, width + geo.CLIP_MARGIN), lo);
  const t0 = geo.arcTauOf(lo, left, right), t1 = geo.arcTauOf(hi, left, right);
  const at = (tau) => { const p = geo.arcPointAt(tau, left, right, A); return [p.x, base - p.h]; };
  const seen = (p) => p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
  let stray = 0, longest = 0;
  for (let i = 0; i < segments; i++) {
    const ta = t0 + ((t1 - t0) * i) / segments, tb = t0 + ((t1 - t0) * (i + 1)) / segments;
    const a = at(ta), b = at(tb);
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (seen(a) && seen(b)) longest = Math.max(longest, len);
    for (let k = 1; k < 8; k++) {
      const p = at(ta + ((tb - ta) * k) / 8);
      if (!seen(p) || !(len > 0)) continue;
      stray = Math.max(stray, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len);
    }
  }
  return { stray, longest };
}

describe('topSegmentsFor: the gold shows no facet at any zoom', () => {
  const W = 2400, H = 1000, base = 820, dpr = 1.5;
  const squash = geo.squashFactor(base * 0.985, W);
  // feet on screen, a foot off, both off (a fly-over), the canon-wide arc at the overview and at the ceiling
  const cases = [
    ['short, both feet on screen', 1100, 1180],
    ['mid, both feet on screen', 300, 2100],
    ['the whole frame', 0, 2400],
    ['left foot on screen, right far off', 900, 60000],
    ['both feet off, the crown over the frame', -50000, 52000],
    ['the ceiling\'s widest: a foot on screen, 440,000 px wide', 1200, 441200],
  ];
  for (const [name, x0, x1] of cases) {
    it(`${name}: no chord strays ${geo.TOP_CHORD_TOL_CSS} CSS px from the curve, none longer than ${geo.TOP_SEGMENT_CSS} CSS px`, () => {
      const n = geo.topSegmentsFor(x0, x1, W, squash, dpr, 512);
      expect(n).toBeGreaterThanOrEqual(geo.TOP_SEGMENT_MIN);
      expect(n).toBeLessThanOrEqual(512);
      const { stray, longest } = worstStray(x0, x1, W, H, base, squash, n);
      expect(stray, `${n} segments`).toBeLessThanOrEqual(geo.TOP_CHORD_TOL_CSS * dpr + 1e-6);
      if (n < 512) expect(longest, `${n} segments`).toBeLessThanOrEqual(geo.TOP_SEGMENT_CSS * dpr + 1e-6);
    });
  }

  it('CONTROL: the main pass\'s sampling of the same line (what drew the chosen line before) strays over three times as far at the overview', () => {
    const fitSegments = 48;   // the asset's widest bucket, drawn whole at the overview (localize 0)
    const n = geo.segmentsFor(fitSegments, 0, W / 2, base * 0.985, W, dpr, squash);
    const { stray } = worstStray(0, W, W, H, base, squash, n);
    expect(stray).toBeGreaterThan(3 * geo.TOP_CHORD_TOL_CSS * dpr);
    expect(geo.topSegmentsFor(0, W, W, squash, dpr, 512)).toBeGreaterThan(n);
  });

  it('a thread with nothing in the window takes the fewest segments, and the cap holds', () => {
    expect(geo.topSegmentsFor(-9000, -4000, W, squash, dpr, 512)).toBe(geo.TOP_SEGMENT_MIN);
    expect(geo.topSegmentsFor(5000, 9000, W, squash, dpr, 512)).toBe(geo.TOP_SEGMENT_MIN);
    expect(geo.topSegmentsFor(1200, 441200, W, squash, dpr, 192)).toBeLessThanOrEqual(192);
    // the feet in either order are the same thread
    expect(geo.topSegmentsFor(2100, 300, W, squash, dpr, 512)).toBe(geo.topSegmentsFor(300, 2100, W, squash, dpr, 512));
  });
});
