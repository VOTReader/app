// @ts-nocheck
/* frame-set and the top pass's tessellation (GL item 3; digest C1, C3, item 10).
   The top pass redraws the lit, hovered and chosen threads over the web in the
   ink table's gold. These cases hold what that set is (and in which order),
   that its threads stand on the main pass's own feet, and that its curve is
   sampled finely enough that the gold shows no facet: an independent oracle
   walks the drawn chords against the true curve. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  prophecySet, topSet, topSetKey, topDraws, TOP_CLASSES, isCompact, COMPACT_HEIGHT_CSS, TOP_ORDER,
  drawOrder, frameSetAt, frameSet, inFrame, RUN_DRAW_VERTICES, ORDER_STEPS, spanStep,
} from './frame-set.js';
import * as dec from './decode.js';
import { fansOf } from './decode.js';
import * as geo from './geometry.js';
import * as pick from './pick.js';
import { webFrame } from './web-frame.js';

// the visible-set cases scan the whole asset at ten frames: give them the time they take under coverage
vi.setConfig({ testTimeout: 60000 });

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

  /* The asset carries one pair twice (131 distinct of 132): drawn twice, its line doubled its ink
     (.80 over .80 is .96, the glow .23); picked twice, the chooser offered the same row twice. */
  it('a pair given twice is one thread: its twin names the first, the class draws it once', () => {
    const g = Object.assign(graph(), { prophecy: [...graph().prophecy, { a: 180, b: 5, studyId: 's2', chapterId: 'c2' }] });
    const ps = prophecySet(g);
    expect(ps.count).toBe(4);
    expect(ps.unique).toBe(3);
    expect([...ps.twin]).toEqual([0, 1, 2, 2]);
    const s = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 });
    expect(s.ranges[0]).toEqual({ kind: 'prophecy', first: 0, count: 3 });
    expect([...s.from]).toEqual([60, 120, 5]);
    expect(topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 }, s)).toBe(s);
    // CONTROL: the fixture without the twin has none
    expect(prophecySet(graph()).unique).toBe(3);
    expect([...prophecySet(graph()).twin]).toEqual([0, 1, 2]);
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
    expect(TOP_ORDER).toEqual(['prophecy', 'prophecyInRange', 'lit', 'hover', 'chosen']);
    const s = topSet(g, { lit: Int32Array.from([1, 2]), litKey: 'k', hoverArc: 3, focusArc: 0, focusProphecy: -1 });
    expect(s.ranges).toEqual([
      { kind: 'prophecy', first: 0, count: 3 }, { kind: 'prophecyInRange', first: 3, count: 0 }, { kind: 'lit', first: 3, count: 2 },
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
    expect(s.ranges.map((r) => r.count)).toEqual([3, 0, 1, 0, 1]);
  });

  /* GL review 2026-10-18 (finding 2): 107 of the asset's pairs are no OpenBible arc, so hoverArc
     cannot name them and a hover on one drew nothing. hoverProphecy names the pair. */
  it('a hovered prophecy pair that is no arc is the hover thread, on prophecySet\'s feet; never twice, and an arc under the pointer wins', () => {
    const g = graph();
    const s = topSet(g, { lit: null, litKey: '', hoverArc: -1, hoverProphecy: 2, focusArc: -1, focusProphecy: -1 });
    expect(s.ranges.find((r) => r.kind === 'hover')).toEqual({ kind: 'hover', first: 3, count: 1 });
    expect([s.from[3], s.to[3], s.fanA[3], s.fanB[3]]).toEqual([5, 180, 0, 0]);
    // the chosen pair under the pointer is drawn once, as the chosen
    const chosen = topSet(g, { lit: null, litKey: '', hoverArc: -1, hoverProphecy: 2, focusArc: -1, focusProphecy: 2 });
    expect(chosen.ranges.map((r) => r.count)).toEqual([3, 0, 0, 0, 1]);
    // an arc under the pointer is the hover; the pair beside it is not a second one
    const both = topSet(g, { lit: null, litKey: '', hoverArc: 2, hoverProphecy: 2, focusArc: -1, focusProphecy: -1 });
    expect(both.ranges.find((r) => r.kind === 'hover').count).toBe(1);
    expect([both.from[3], both.to[3]]).toEqual([40, 90]);
    // a pair outside the list is nothing
    expect(topSet(g, { lit: null, litKey: '', hoverArc: -1, hoverProphecy: 9, focusArc: -1, focusProphecy: -1 })
      .ranges.find((r) => r.kind === 'hover').count).toBe(0);
  });

  it('a new hovered pair is a new set (the pointer moved from one lone pair to the next)', () => {
    const g = graph();
    const v = { lit: null, litKey: '', hoverArc: -1, hoverProphecy: 2, focusArc: -1, focusProphecy: -1 };
    const a = topSet(g, v);
    expect(topSet(g, Object.assign({}, v), a)).toBe(a);
    const b = topSet(g, Object.assign({}, v, { hoverProphecy: -1 }), a);
    expect(b).not.toBe(a);
    expect(b.ranges.find((r) => r.kind === 'hover').count).toBe(0);
    expect(topSetKey(v)).not.toBe(topSetKey(Object.assign({}, v, { hoverProphecy: 0 })));
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
    expect(topSetKey(v)).toBe('|2|-1|-1|-1||');
    // a graph with no prophecy and nothing asked about: no top pass at all
    const bare = Object.assign(graph(), { prophecy: [] });
    expect(topSet(bare, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 }).count).toBe(0);
  });

  /* GL review 2026-10-18 (finding 3): the class receded all or nothing. The main pass keeps the
     ink of a thread with a foot in the chosen range (with a group chosen, a foot in each range:
     the shader's inRange / pair), so the prophecy class keeps it by the same law. */
  it('a chosen range splits the class: the pairs the shader would keep lit are prophecyInRange, the rest recede', () => {
    const g = graph();
    const ask = (range, range2, prev) => topSet(g, {
      lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1, focusRange: range, focusRange2: range2,
    }, prev);
    const counts = (s) => [s.ranges[0].count, s.ranges[1].count];
    const one = ask([55, 65], null);   // pair 0's foot 60
    expect(one.ranges[1]).toEqual({ kind: 'prophecyInRange', first: 2, count: 1 });
    expect([one.from[2], one.to[2]]).toEqual([60, 70]);
    expect([...one.from.slice(0, 2)]).toEqual([120, 5]);
    expect(counts(ask([180, 180], null)), 'inclusive, either foot').toEqual([2, 1]);
    expect(counts(ask([55, 75], null)), 'both feet in it: one thread').toEqual([2, 1]);
    // a group: a foot in each range, either way round
    expect(counts(ask([55, 75], [175, 185])), 'pair 0 has no foot in the group').toEqual([3, 0]);
    expect(counts(ask([0, 10], [175, 185]))).toEqual([2, 1]);
    expect(counts(ask([175, 185], [0, 10]))).toEqual([2, 1]);
    // a group without a range is no group (the shader reads range2 only with a range); none is none
    expect(counts(ask(null, [175, 185]))).toEqual([3, 0]);
    expect(counts(ask(null, null))).toEqual([3, 0]);
    // the same range is the same set; a new one is new
    expect(ask([55, 65], null, one)).toBe(one);
    expect(ask([55, 66], null, one)).not.toBe(one);
    expect(ask([55, 65], [1, 2], one)).not.toBe(one);
    expect(topSetKey({ focusRange: [55, 65] })).not.toBe(topSetKey({ focusRange: [55, 65], focusRange2: [1, 2] }));
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

  /* Restated for E1 (GL step 2): the main pass's count is geometry.frameSegments
     now (the bucket's own count and segmentsFor are retired). Its chords are
     pushed out to straddle the curve; the top pass samples unpushed, so the
     main pass's count would facet the gold. */
  it('CONTROL: the main pass\'s segment count for the same line (frameSegments, its chords pushed) strays over three times as far unpushed, as the top pass samples', () => {
    const { A } = geo.arcShape(W / 2, squash);
    const n = geo.frameSegments(0, Math.PI, W / 2, A, dpr);
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

/* ── the visible set (E1, GL step 2) ─────────────────────────────────────
   One pass per camera: every thread of the density whose body touches the
   frame, its segments by its own size, and the anchored count. The renderer
   draws it, the picker hits it, the labels walk it and the pills count it,
   so the four are one set by construction. These cases hold the set's own
   shape on the asset, its cull against a full brute-force scan, its
   consumers, and the vertex targets the brief set (the overview under half
   of the old ~4.4M invocations; the ceiling down from ~4M to the low
   thousands), measured deterministically, without a GPU. */
describe('the visible set: drawn, counted, labelled and picked are one set (E1)', () => {
  const ASSET = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/scripture-web-data.js');
  const g = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
  const fans = fansOf(g);
  /** the old renderer's main-pass vertex invocations at the PC overview (perf.md, before) */
  const OLD_OVERVIEW = 4395988;
  const devices = [
    { name: 'pc', W: 1600, H: 900, DPR: 1 },
    { name: 'phone', W: Math.round(891 * 2.6), H: Math.round(411 * 2.6), DPR: 2.6 },
  ];
  const frameOf = (dev) => {
    const f = webFrame(dev, false);
    return { W: dev.W, DPR: dev.DPR, base: f.base, ceil: f.ceil, squash: geo.squashFactor(f.ceil, dev.W) };
  };
  const cameras = (fr) => {
    const fit = fr.W / g.total, zMax = geo.maxZoomFor(g.total, fr.W / fr.DPR);
    return [
      { name: 'overview', x: g.total / 2, y: 0, ppv: fit },
      { name: '6.5x', x: 14000.3, y: 0, ppv: fit * 6.55 },
      { name: '42.9x', x: 14000.3, y: 0, ppv: fit * 42.9 },
      { name: 'ceiling', x: 14000.3, y: 0, ppv: fit * zMax },
      { name: 'sky 42.9x', x: 14000.3, y: 3 * fr.ceil, ppv: fit * 42.9 },
    ];
  };
  const setOf = (fr, c) => frameSetAt(g, 'famous', fr.W, fr.base, fr.squash, c.x, c.y, c.ppv, fr.DPR);
  const order = drawOrder(g, 'famous');

  it('its shape: inFrame is the list, in rank order; the runs cut it in order, each at the most segments its threads ask for, and the vertices add up', () => {
    for (const dev of devices) {
      const fr = frameOf(dev);
      for (const c of cameras(fr)) {
        const set = setOf(fr, c);
        const where = `${dev.name} ${c.name}`;
        const bad = [];
        const listed = new Set(set.list.subarray(0, set.count));
        if (listed.size !== set.count) bad.push('duplicate ids in the list');
        let members = 0;
        for (let i = 0; i < g.count; i++) {
          if (!inFrame(set, i)) continue;
          members++;
          if (!listed.has(i)) bad.push(`inFrame ${i} not listed`);
        }
        if (members !== set.count) bad.push(`inFrame holds ${members}, count ${set.count}`);
        // the list in rank order: the shortest drawn span step first, the order the web is blended in
        for (let k = 1; k < set.count; k++) {
          if (order.rankOf[set.list[k]] <= order.rankOf[set.list[k - 1]]) bad.push(`list out of rank at ${k}`);
        }
        let vertices = 0, own = 0, at = 0;
        for (let k = 0; k < set.runs; k++) {
          if (set.runFirst[k] !== at) bad.push(`run ${k} starts at ${set.runFirst[k]}, not ${at}`);
          if (!(set.runCount[k] > 0)) bad.push(`run ${k} is empty`);
          let most = 0;
          for (let j = at; j < at + set.runCount[k]; j++) {
            const n = set.segments[order.rankOf[set.list[j]]];
            if (!(n > 0)) bad.push(`list ${j} has no segments`);
            if (n > most) most = n;
            own += 2 * (n + 1);
          }
          // a run draws every thread at its threads' most: never fewer segments than one asked for
          if (set.runN[k] !== most) bad.push(`run ${k} draws ${set.runN[k]} segments, its most is ${most}`);
          at += set.runCount[k];
          vertices += 2 * (set.runN[k] + 1) * set.runCount[k];
        }
        if (at !== set.count) bad.push(`runs hold ${at}, count ${set.count}`);
        expect(bad.slice(0, 5), where).toEqual([]);
        expect(set.vertices, where).toBe(vertices);
        expect(set.count, where).toBeGreaterThan(0);
        // the runs' price: a few dozen draws, and at most 2.5 times what each thread's own count would
        // cost (or a couple of draws' worth, for a frame of a hundred threads)
        expect(set.runs, where).toBeLessThanOrEqual(96);
        expect(set.vertices, where).toBeGreaterThanOrEqual(own);
        expect(set.vertices, where).toBeLessThanOrEqual(Math.max(2.5 * own, own + 2 * RUN_DRAW_VERTICES));
      }
    }
  });

  /* Restated (GL step 2, the stepped order): the overview's runs were held to
     one per segment count, true while the order was by exact span, so the
     counts rose once each. Ranked by span step and by x inside a step, the
     counts rise and fall within a step; what the runs owe is the same
     intent, the overview drawn at about each thread's own count. */
  it('the drawing order: by span step, shortest first, then by from-verse, then the asset\'s order', () => {
    const bad = [];
    let steps = 1;
    for (let r = 1; r < order.count; r++) {
      const p = order.ids[r - 1], q = order.ids[r];
      const sp = spanStep((g.to[p] + fans.fanB[p]) - (g.from[p] + fans.fanA[p]));
      const sq = spanStep((g.to[q] + fans.fanB[q]) - (g.from[q] + fans.fanA[q]));
      if (sq < sp) bad.push(`rank ${r}: step ${sq} after ${sp}`);
      else if (sq === sp && g.from[q] < g.from[p]) bad.push(`rank ${r}: from ${g.from[q]} after ${g.from[p]} in step ${sq}`);
      else if (sq === sp && g.from[q] === g.from[p] && q < p) bad.push(`rank ${r}: id ${q} after ${p}`);
      if (sq !== sp) steps++;
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // a step is an eighth of an octave: the asset's 1 .. 31,093-verse spans fill some 120 of them
    expect(ORDER_STEPS).toBe(8);
    expect(steps).toBeGreaterThan(60);
    expect(steps).toBeLessThan(200);
  });

  it('consecutive draws stand side by side: at 6.5x the next thread\'s foot is a few percent of the frame away, not across it', () => {
    // ranked by exact span the 6.5x frame's threads scattered (a mean step of 61% of its width) and
    // the 890M paid 12.9 ms for a frame it draws in 6.4 by step and x (perf.md)
    for (const dev of devices) {
      const fr = frameOf(dev);
      const c = cameras(fr)[1];
      const set = setOf(fr, c);
      let dx = 0;
      for (let k = 1; k < set.count; k++) dx += Math.abs(g.from[set.list[k]] - g.from[set.list[k - 1]]);
      const mean = dx / (set.count - 1), width = fr.W / c.ppv;
      expect(mean / width, dev.name).toBeLessThan(0.05);
    }
  });

  it('a run splits only where it saves more than a draw, and the overview is drawn at about each thread\'s own count', () => {
    const fr = frameOf(devices[0]);
    const set = setOf(fr, cameras(fr)[0]);
    let own = 0;
    for (let k = 0; k < set.count; k++) own += 2 * (set.segments[order.rankOf[set.list[k]]] + 1);
    // a step's threads differ by under 9% in span and their counts by about half that
    expect(set.vertices).toBeLessThanOrEqual(1.05 * own);
    expect(set.runs).toBeLessThanOrEqual(64);
    // every boundary the runs keep saves more than RUN_DRAW_VERTICES against merging the pair
    for (let k = 0; k + 1 < set.runs; k++) {
      const a = set.runCount[k], b = set.runCount[k + 1], na = set.runN[k], nb = set.runN[k + 1];
      const merged = 2 * (a + b) * (Math.max(na, nb) + 1), apart = 2 * a * (na + 1) + 2 * b * (nb + 1);
      expect(merged - apart, `boundary ${k}`).toBeGreaterThan(RUN_DRAW_VERTICES);
    }
  });

  it('its cull is a full scan\'s: every thread whose body touches the frame (arcFrameTau on its drawn feet) and no other, whichever scan found the candidates', () => {
    const tau = [0, 0];
    for (const dev of devices) {
      const fr = frameOf(dev);
      for (const c of cameras(fr)) {
        const set = setOf(fr, c);
        const cam = { x: c.x, y: c.y, ppv: c.ppv, total: g.total };
        const [hLo, hHi] = geo.frameHeights(fr.base, c.y, fr.DPR);
        const bad = [];
        let want = 0;
        for (const b of g.buckets) {
          const end = b.off + dec.bucketDrawCount(b, 'famous');
          for (let i = b.off; i < end; i++) {
            const x0 = geo.footX(cam, fr.W, g.from[i], fans.fanA[i]), x1 = geo.footX(cam, fr.W, g.to[i], fans.fanB[i]);
            const { A } = geo.arcShape((x1 - x0) / 2, fr.squash);
            const hit = geo.arcFrameTau(x0, x1, fr.W, A, hLo, hHi, tau);
            if (hit) want++;
            if (inFrame(set, i) !== hit) bad.push(`thread ${i}: drawn ${inFrame(set, i)}, in the frame ${hit}`);
          }
        }
        expect(bad.slice(0, 5), `${dev.name} ${c.name}`).toEqual([]);
        expect(set.count).toBe(want);
      }
    }
    // the deep frames found their candidates by the feet, the overview over every rank
    const fr = frameOf(devices[0]);
    const scans = cameras(fr).map((c) => setOf(fr, c).scan);
    expect(scans[0]).toBe('all');
    expect(scans.slice(2)).toEqual(['feet', 'feet', 'feet']);
  });

  it('anchored is the crowding law\'s own count, pick.countAnchored, at rest and in the sky (C14: anchored whatever the camera\'s height)', () => {
    for (const dev of devices) {
      const fr = frameOf(dev);
      for (const c of cameras(fr)) {
        const cam = { x: c.x, y: c.y, ppv: c.ppv, total: g.total };
        expect(setOf(fr, c).anchored, `${dev.name} ${c.name}`).toBe(pick.countAnchored(g, cam, fr.W, 'famous'));
      }
    }
  });

  it('its consumers: the labels walk it, the picker hits nothing outside it; the pills count every anchored thread at its feet (C14)', () => {
    const fr = frameOf(devices[1]);
    for (const c of cameras(fr).slice(1)) {
      const cam = { x: c.x, y: c.y, ppv: c.ppv, total: g.total };
      const view = { width: fr.W, base: fr.base, squash: fr.squash, density: 'famous', dpr: fr.DPR, localize: 1 };
      const set = frameSet(g, cam, view);
      expect(set, c.name).toBe(setOf(fr, c));
      expect(pick.visibleArcs(g, cam, view, 1e9)).toEqual(Array.from(set.list.subarray(0, set.count)));
      expect(pick.visibleArcs(g, cam, view, 5)).toEqual(Array.from(set.list.subarray(0, Math.min(5, set.count))));
      const outside = [];
      let hits = 0;
      for (let k = 0; k < 240; k++) {
        const px = (fr.W * (k + 0.5)) / 240, py = fr.base * (0.25 + (0.74 * ((k * 37) % 240)) / 240);
        for (const r of pick.pickArcs(g, cam, view, px, py, 12, 8)) {
          hits++;
          if (!inFrame(set, r.index)) outside.push(r.index);
        }
      }
      expect(outside, c.name).toEqual([]);
      expect(hits, c.name).toBeGreaterThan(0);
      // the pills: a thread counts at each foot cell it stands in (once when both feet share one),
      // every thread of the density anchored to the frame, whatever its body: the sheet's count
      // (bundleGroups) and the crowding law's (countAnchored). Until GL review 2026-10-18
      // (finding 7) this read "only a thread of the set", which in the sky dropped the threads
      // whose bodies pass under the frame from the pill and not from its sheet.
      const cells = pick.footBundles(g, cam, view, fr.DPR);
      const cellOf = new Map();
      cells.forEach((cell, k) => { for (let v = cell.lo; v <= cell.hi; v++) cellOf.set(v, k); });
      const want = new Array(cells.length).fill(0);
      for (const i of order.ids.subarray(0, order.count)) {
        const x0 = geo.footX(cam, fr.W, g.from[i], fans.fanA[i]), x1 = geo.footX(cam, fr.W, g.to[i], fans.fanB[i]);
        if (!geo.arcAnchored(x0, x1, fr.W)) continue;
        const ca = cellOf.has(g.from[i]) ? cellOf.get(g.from[i]) : -1;
        const cb = cellOf.has(g.to[i]) ? cellOf.get(g.to[i]) : -1;
        if (ca >= 0) want[ca]++;
        if (cb >= 0 && cb !== ca) want[cb]++;
      }
      expect(cells.map((cell) => cell.drawn), c.name).toEqual(want);
      expect(want.some((n) => n > 0), c.name).toBe(true);
    }
  });

  it('a camera asked for again is the same set; two other cameras evict it, and it comes back the same', () => {
    const fr = frameOf(devices[0]);
    const [a, b, c] = cameras(fr).slice(1, 4);
    const first = setOf(fr, a);
    const serial = first.serial, count = first.count, vertices = first.vertices;
    expect(setOf(fr, a)).toBe(first);
    expect(setOf(fr, a).serial).toBe(serial);
    setOf(fr, b);
    expect(setOf(fr, a).serial, 'one other camera keeps it').toBe(serial);
    setOf(fr, b);
    setOf(fr, c);
    const again = setOf(fr, a);
    expect(again.serial).not.toBe(serial);
    expect([again.count, again.vertices]).toEqual([count, vertices]);
  });

  it('E1 targets, deterministic on the asset: the overview under half the old 4.4M vertex invocations, the ceiling in the low thousands, every zoom between falling', () => {
    for (const dev of devices) {
      const fr = frameOf(dev);
      const [overview, z6, z43, ceiling] = cameras(fr).map((c) => {
        const s = setOf(fr, c);
        return { count: s.count, vertices: s.vertices };
      });
      expect(overview.count, `${dev.name}: every thread is drawn at the overview`).toBe(order.count);
      expect(overview.vertices, dev.name).toBeLessThan(OLD_OVERVIEW / 2);
      expect(z6.vertices, dev.name).toBeLessThan(overview.vertices / 3);
      expect(z43.vertices, dev.name).toBeLessThan(z6.vertices / 3);
      expect(ceiling.vertices, dev.name).toBeLessThan(10000);
      expect(ceiling.count, dev.name).toBeGreaterThan(0);
    }
  });
});

/* The top pass over the asset (GL review 2026-10-18). */
describe('the top pass on the asset: the class follows the chosen range', () => {
  const ASSET = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/scripture-web-data.js');
  const g = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
  const chapter = (bookId, ch) => {
    const bi = g.books.findIndex((b) => b.id === bookId);
    const row = g.chapters.find((c) => c[0] === bi && c[1] === ch);
    return [row[2], row[2] + row[3] - 1];
  };
  /** the oracle: the asset's distinct pairs with a foot in [lo, hi], straight off g.prophecy */
  const pairsIn = ([lo, hi]) => {
    const keys = new Set();
    for (const p of g.prophecy) {
      if ((p.a >= lo && p.a <= hi) || (p.b >= lo && p.b <= hi)) keys.add(Math.min(p.a, p.b) + ':' + Math.max(p.a, p.b));
    }
    return keys;
  };

  it('Isaiah 7 chosen: its pairs (7:14 to Matthew 1:22, to 1:18 given twice, to John 1:14) keep their ink, every other pair recedes', () => {
    const isa7 = chapter('isaiah', 7);
    const want = pairsIn(isa7);
    const i714 = isa7[0] + 13, m122 = chapter('matthew-plain', 1)[0] + 21;
    expect(want.has(Math.min(i714, m122) + ':' + Math.max(i714, m122)), 'PRECONDITION: Isaiah 7:14 to Matthew 1:22 is a pair').toBe(true);
    expect(want.size, 'PRECONDITION: three distinct pairs (the asset gives 7:14 to Matthew 1:18 twice)').toBe(3);
    const s = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1, focusRange: isa7, focusRange2: null });
    const [rest, kept] = s.ranges;
    expect(kept.kind).toBe('prophecyInRange');
    expect(kept.count).toBe(want.size);
    const got = new Set();
    for (let j = kept.first; j < kept.first + kept.count; j++) got.add(s.from[j] + ':' + s.to[j]);
    expect([...got].sort()).toEqual([...want].sort());
    expect(rest.count + kept.count, 'the class is whole: every distinct pair, once').toBe(prophecySet(g).unique);
    for (let j = rest.first; j < rest.first + rest.count; j++) {
      expect(want.has(s.from[j] + ':' + s.to[j]), 'a receding pair has no foot in Isaiah 7').toBe(false);
    }
  });
});

/* GL review 2026-10-18 (finding 4): the top pass drew every thread of its set, in one draw per
   kind at the kind's most segments, wherever the camera stood (~50k vertex invocations a frame
   for the prophecy class alone). topDraws culls it by the main pass's own test (arcFrameTau on
   the drawn feet, the heights widened by the kind's ribbon) and draws each kind in runs by
   segment class (TOP_CLASSES), so a thread is drawn at most about sqrt 2 over its own count. */

/** The oracle: whether any point of the drawn curve stands inside the frame's box widened by
 *  `pad` (the ribbon) and `grow` (the sampling's slack), sampled densely along its parameter. */
function touchesFrame(x0, x1, f, pad, grow) {
  const A = ((x1 - x0) / 2) * f.squash;
  const [hLo, hHi] = geo.frameHeights(f.base, f.camY, f.dpr);
  const m = geo.CLIP_MARGIN + grow;
  for (let i = 0; i <= 6000; i++) {
    const p = geo.arcPointAt((Math.PI * i) / 6000, x0, x1, A);
    if (p.x >= -m && p.x <= f.width + m && p.h >= hLo - pad - grow && p.h <= hHi + pad + grow) return true;
  }
  return false;
}
const footsOf = (set, j, f) => [
  (set.from[j] + 0.5 + set.fanA[j] - f.camX) * f.ppv + f.width / 2,
  (set.to[j] + 0.5 + set.fanB[j] - f.camX) * f.ppv + f.width / 2,
];
const CAPS = TOP_ORDER.map((k) => (k === 'hover' || k === 'chosen' ? 512 : 192));
const PADS = TOP_ORDER.map((k) => (k === 'hover' || k === 'chosen' ? 5.5 : 2.5));

/** Every law topDraws keeps, checked against the oracle and the set it was handed. */
function checkDraws(set, f, td, label) {
  // the runs: in TOP_ORDER, each inside one kind, cutting [0, count) in order
  let at = 0, vertices = 0, own = 0;
  const kinds = set.ranges.map((r) => r.kind);
  let lastKind = -1;
  for (const run of td.runs) {
    expect(run.first, label).toBe(at);
    expect(run.count, label).toBeGreaterThan(0);
    const ki = kinds.indexOf(run.kind);
    expect(ki, label + ': kinds in order').toBeGreaterThanOrEqual(lastKind);
    lastKind = ki;
    const range = set.ranges[ki];
    for (let k = run.first; k < run.first + run.count; k++) {
      const j = td.ids[k];
      expect(j >= range.first && j < range.first + range.count, label + ': a run holds its own kind').toBe(true);
      expect([td.from[k], td.to[k], td.fanA[k], td.fanB[k]]).toEqual([set.from[j], set.to[j], set.fanA[j], set.fanB[j]]);
      const [x0, x1] = footsOf(set, j, f);
      const n = geo.topSegmentsFor(x0, x1, f.width, f.squash, f.dpr, CAPS[TOP_ORDER.indexOf(run.kind)]);
      expect(run.segments, label + ': never under its own count (no facet)').toBeGreaterThanOrEqual(n);
      if (run.segments > geo.TOP_SEGMENT_MIN) {
        expect(run.segments, label + ': at most about sqrt 2 over it').toBeLessThanOrEqual(Math.ceil(Math.SQRT2 * n));
      }
      own += 2 * (n + 1);
    }
    vertices += 2 * (run.segments + 1) * run.count;
    at += run.count;
  }
  expect(at, label).toBe(td.count);
  expect(td.vertices, label).toBe(vertices);
  expect(td.vertices, label).toBeLessThanOrEqual(Math.SQRT2 * own + 2 * td.count);
  // the cull: every thread whose ribbon touches the frame, and no other
  const drawn = new Set(Array.from(td.ids.subarray(0, td.count)));
  for (const range of set.ranges) {
    const pad = PADS[TOP_ORDER.indexOf(range.kind)];
    for (let j = range.first; j < range.first + range.count; j++) {
      const [x0, x1] = footsOf(set, j, f);
      if (touchesFrame(x0, x1, f, pad, 0)) expect(drawn.has(j), `${label}: ${range.kind} ${j} shows and is drawn`).toBe(true);
      else if (!touchesFrame(x0, x1, f, pad, 3)) expect(drawn.has(j), `${label}: ${range.kind} ${j} is nowhere near and is culled`).toBe(false);
    }
  }
  return { vertices, own };
}

describe('topDraws: the top pass draws what touches the frame, each thread near its own segments', () => {
  const W = 800, base = 260, squash = geo.squashFactor(240, 800);
  const at = (camX, ppv, over) => Object.assign({ width: W, base, camX, camY: 0, ppv, squash, dpr: 1 }, over);
  const ask = { lit: null, litKey: '', hoverArc: -1, focusArc: 0, focusProphecy: -1 };

  it('TOP_CLASSES: from TOP_SEGMENT_MIN up by sqrt 2, rounded up', () => {
    expect(TOP_CLASSES[0]).toBe(geo.TOP_SEGMENT_MIN);
    expect(Array.from(TOP_CLASSES.slice(0, 9))).toEqual([16, 23, 32, 46, 64, 91, 128, 182, 256]);
    for (let c = 1; c < TOP_CLASSES.length; c++) expect(TOP_CLASSES[c] / TOP_CLASSES[c - 1]).toBeLessThan(1.46);
    expect(TOP_CLASSES[TOP_CLASSES.length - 1]).toBeGreaterThanOrEqual(512);
  });

  it('the overview draws every thread; a deep camera only those under it, by the oracle', () => {
    const g = graph();
    const set = topSet(g, ask);
    const fit = W / g.total;
    const wide = topDraws(set, at(100, fit), CAPS, PADS);
    expect(wide.count, 'the overview: the class and the chosen line').toBe(set.count);
    checkDraws(set, at(100, fit), wide, 'overview');
    // verses 55 to 75 across the frame: pair 0 (60 to 70) stands in it; the chosen arc (10 to 150)
    // and the pairs 120 to 190 and 5 to 180 pass far above it or beside it
    const deep = topDraws(set, at(65, 40), CAPS, PADS);
    expect(Array.from(deep.ids.subarray(0, deep.count))).toEqual([0]);
    expect(deep.runs).toEqual([{ kind: 'prophecy', first: 0, count: 1, segments: deep.runs[0].segments }]);
    checkDraws(set, at(65, 40), deep, 'deep');
    // in the sky the same feet are under the frame: nothing of them is there to see
    const sky = topDraws(set, at(65, 40, { camY: 4000 }), CAPS, PADS);
    checkDraws(set, at(65, 40, { camY: 4000 }), sky, 'sky');
    expect(sky.count).toBe(0);
  });

  it('the same frame is the same draws; a pan that keeps the packing is not fresh, one that changes it is', () => {
    const g = graph();
    const set = topSet(g, ask);
    const a = topDraws(set, at(65, 40), CAPS, PADS);
    expect(a.fresh, 'the first is always fresh').toBe(true);
    expect(topDraws(set, at(65, 40), CAPS, PADS, a)).toBe(a);
    const b = topDraws(set, at(65.01, 40), CAPS, PADS, a);
    expect(b).not.toBe(a);
    expect(b.fresh, 'the same threads in the same order: nothing to upload').toBe(false);
    const c = topDraws(set, at(100, W / g.total), CAPS, PADS, b);
    expect(c.fresh).toBe(true);
    // a new set is always fresh, a new ribbon or cap is a new draws
    expect(topDraws(topSet(g, Object.assign({}, ask, { focusArc: 1 })), at(100, W / g.total), CAPS, PADS, c).fresh).toBe(true);
    expect(topDraws(set, at(100, W / g.total), CAPS, PADS.map((p) => p + 1), c)).not.toBe(c);
  });

  it('nothing in the set: nothing drawn', () => {
    const bare = Object.assign(graph(), { prophecy: [] });
    const set = topSet(bare, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 });
    const td = topDraws(set, at(100, 4), CAPS, PADS);
    expect([td.count, td.runs.length, td.vertices]).toEqual([0, 0, 0]);
  });
});

describe('topDraws on the asset: the prophecy class culled and drawn near its own segments', () => {
  const ASSET = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/scripture-web-data.js');
  const g = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
  const devices = [
    { name: 'pc', W: 1600, H: 900, DPR: 1 },
    { name: 'phone', W: Math.round(891 * 2.6), H: Math.round(411 * 2.6), DPR: 2.6 },
  ];
  const set = topSet(g, { lit: null, litKey: '', hoverArc: -1, focusArc: -1, focusProphecy: -1 });
  /** the old top pass: every thread of a kind in one draw at the kind's most segments */
  const uncut = (f) => {
    let v = 0;
    for (const range of set.ranges) {
      let most = 0;
      for (let j = range.first; j < range.first + range.count; j++) {
        const [x0, x1] = footsOf(set, j, f);
        most = Math.max(most, geo.topSegmentsFor(x0, x1, f.width, f.squash, f.dpr, CAPS[TOP_ORDER.indexOf(range.kind)]));
      }
      v += 2 * (most + 1) * range.count;
    }
    return v;
  };

  /* Measured 2026-10-18 (vertex invocations, the class alone; uncut is the old pass): PC overview
     24,446 of 50,566, 6.5x 17,152, 42.9x 8,026, the ceiling 386; phone overview 15,180 of 35,894,
     42.9x 7,118, the ceiling 0. Every pin below has headroom over those. */
  it('at every camera the laws hold, and the class costs a fraction of the uncut pass, less the deeper the camera', () => {
    const report = [];
    for (const dev of devices) {
      const wf = webFrame(dev, false);
      const squash = geo.squashFactor(wf.ceil, dev.W);
      const fit = dev.W / g.total, zMax = geo.maxZoomFor(g.total, dev.W / dev.DPR);
      const cams = [
        { name: 'overview', x: g.total / 2, y: 0, ppv: fit },
        { name: '6.5x', x: 14000.3, y: 0, ppv: fit * 6.55 },
        { name: '42.9x', x: 14000.3, y: 0, ppv: fit * 42.9 },
        { name: 'ceiling', x: 14000.3, y: 0, ppv: fit * zMax },
        { name: 'sky 42.9x', x: 14000.3, y: 3 * wf.ceil, ppv: fit * 42.9 },
        { name: 'Isaiah 7 at 42.9x', x: 17795, y: 0, ppv: fit * 42.9 },
      ];
      for (const c of cams) {
        const f = { width: dev.W, base: wf.base, camX: c.x, camY: c.y, ppv: c.ppv, squash, dpr: dev.DPR };
        const td = topDraws(set, f, CAPS, PADS);
        const label = `${dev.name} ${c.name}`;
        checkDraws(set, f, td, label);
        report.push({ label, count: td.count, vertices: td.vertices, uncut: uncut(f), runs: td.runs.length });
      }
    }
    const of = (label) => report.find((r) => r.label === label);
    for (const dev of devices) {
      const o = of(dev.name + ' overview');
      expect(o.count, `${dev.name}: the overview draws the whole class`).toBe(set.count);
      expect(o.runs, `${dev.name}: in a few runs`).toBeLessThanOrEqual(9);
      expect(o.vertices, `${dev.name}: the overview at about half the uncut pass`).toBeLessThan(o.uncut * 0.55);
      for (const name of ['42.9x', 'ceiling', 'sky 42.9x']) {
        const r = of(dev.name + ' ' + name);
        expect(r.vertices, `${dev.name} ${name}: under a fifth of the uncut pass`).toBeLessThan(r.uncut / 5);
      }
      const falling = ['overview', '6.5x', '42.9x', 'ceiling'].map((name) => of(dev.name + ' ' + name).vertices);
      for (let k = 1; k < falling.length; k++) expect(falling[k], `${dev.name}: deeper sends less`).toBeLessThan(falling[k - 1]);
      expect(falling[3], `${dev.name}: the ceiling in the hundreds`).toBeLessThan(1000);
      expect(of(dev.name + ' Isaiah 7 at 42.9x').count, `${dev.name}: Isaiah 7's pairs stand in the frame`).toBeGreaterThan(0);
    }
  });
});
