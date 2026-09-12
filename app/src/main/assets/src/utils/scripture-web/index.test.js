/* index.test.js — the exact visible set over the shipped layout (w-sw-phase1, M2).
   ─────────────────────────────────────────────────────────────────────────
   Two halves. The LAW half is a brute force: every thread of a synthetic
   graph is tested with geometry.threadVisible against each of 300 random
   rectangles (overviews, deep zooms, raised cameras, and 1-verse pick boxes
   that catch legs), and the index's gathered list must equal that set —
   as a set difference in both directions, never a count, because matching
   totals survive two rows swapping places. The DATA half registers the
   numbers on the shipped asset that the plan's acceptance walk quotes:
   phone landscape, Famous, centre verse 15,000 — 142 threads at the 44 px
   ceiling visiting no more than 160 candidates, 37 at 132 px, 15 Essential,
   113 with the camera raised ten bands. Those are the "nothing far from the
   frame is touched" numbers; a chunk cull submitted 18,944 for the 142. */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildIndex, windowSize, walkVisible, gather, countVisible } from './index.js';
import { threadVisible } from './geometry.js';
import { decodeGraph, bucketDrawCount, deltaRuns } from './decode.js';

/** Deterministic PRNG (mulberry32) so a failing rectangle can be re-run by seed. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A graph laid out the way tools/gen-scripture-web.mjs lays the asset out:
 * span buckets, each sorted by density tier (>= 20 votes first) then by
 * `from` ascending — so `from` ascends within every (bucket, tier) run.
 */
function synth(seed, n, total) {
  const r = rng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const span = Math.max(1, Math.floor(Math.exp(r() * Math.log(total * 0.9))));
    const a = Math.floor(r() * (total - span));
    rows.push({ a, b: a + span, votes: r() < 0.3 ? 20 + Math.floor(r() * 50) : 7 + Math.floor(r() * 12) });
  }
  const edges = [50, 500, 5000, Infinity];
  const buckets = [];
  const from = [], to = [], votes = [];
  for (const hi of edges) {
    const lo = buckets.length ? edges[buckets.length - 1] : 0;
    const members = rows.filter((t) => t.b - t.a >= lo && t.b - t.a < hi);
    const tier20 = members.filter((t) => t.votes >= 20).sort((p, q) => p.a - q.a);
    const tier7 = members.filter((t) => t.votes < 20).sort((p, q) => p.a - q.a);
    const off = from.length;
    for (const t of tier20.concat(tier7)) { from.push(t.a); to.push(t.b); votes.push(t.votes); }
    buckets.push({ off, len: members.length, off20: tier20.length, off10: members.length, segments: 8, chunks: [] });
  }
  return {
    total, count: from.length, from: Uint16Array.from(from), to: Uint16Array.from(to),
    votes: Int16Array.from(votes), buckets, densityTiers: [20, 7],
  };
}

/** Every drawn thread the rectangle admits, by the predicate alone. */
function brute(g, rect, density) {
  const out = [];
  for (const b of g.buckets) {
    const end = b.off + bucketDrawCount(b, density);
    for (let p = b.off; p < end; p++) {
      if (threadVisible(g.from[p], g.to[p], rect.xa, rect.xb, rect.y0, rect.y1)) out.push(p);
    }
  }
  return out;
}

/** 300 rectangles: overviews, deep zooms, raised cameras, and pick boxes. */
function rects(seed, total, n) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const kind = r();
    if (kind < 0.25) {
      // a 1-verse pick box somewhere over the world, up to the tallest apex
      const x = r() * total, y = r() * r() * total / 2;
      out.push({ xa: x - 0.5, xb: x + 0.5, y0: y - 0.5, y1: y + 0.5 });
      continue;
    }
    const zoom = Math.exp(r() * Math.log(400));
    const w = total / zoom;
    const xa = r() * (total - w) - (r() < 0.1 ? w / 2 : 0);
    const band = w * (0.2 + r() * 0.6);
    const y0 = kind < 0.6 ? 0 : r() * r() * total / 4;
    out.push({ xa, xb: xa + w, y0, y1: y0 + band });
  }
  return out;
}

describe('the index over a synthetic layout: the gathered list IS the predicate\'s set', () => {
  const TOTAL = 4000, N = 2000;
  const g = synth(7, N, TOTAL);
  const idx = buildIndex(g);

  it('PRECONDITION: the synthetic layout has from ascending within every (bucket, tier) run, like the asset', () => {
    let runs = 0;
    for (const b of g.buckets) {
      for (const [start, len] of deltaRuns(b)) {
        runs++;
        for (let p = start + 1; p < start + len; p++) expect(g.from[p]).toBeGreaterThanOrEqual(g.from[p - 1]);
      }
    }
    expect(runs, 'runs in the synthetic graph').toBe(idx.runs.length);
    expect(g.count).toBe(N);
  });

  for (const density of /** @type {const} */ (['famous', 'essential'])) {
    it(`${density}: 300 rectangles, 0 missing and 0 extra, no thread listed twice, countVisible agrees`, () => {
      const out = { ids: new Uint32Array(N), count: 0, visited: 0 };
      let nonEmpty = 0, deep = 0;
      for (const rect of rects(11, TOTAL, 300)) {
        const want = brute(g, rect, density);
        gather(g, idx, rect, density, out);
        const got = Array.from(out.ids.subarray(0, out.count));
        const gotSet = new Set(got);
        expect(gotSet.size, `duplicates for ${JSON.stringify(rect)}`).toBe(got.length);
        const wantSet = new Set(want);
        const missing = want.filter((p) => !gotSet.has(p));
        const extra = got.filter((p) => !wantSet.has(p));
        expect(missing, `missing for ${JSON.stringify(rect)}`).toEqual([]);
        expect(extra, `extra for ${JSON.stringify(rect)}`).toEqual([]);
        expect(countVisible(g, idx, rect, density)).toBe(want.length);
        // GUARD: the regime switch reads the window before any walk; it must
        // be the number of candidates the walk then examines.
        expect(out.visited, `visited vs window for ${JSON.stringify(rect)}`).toBe(windowSize(g, idx, rect, density));
        if (want.length) nonEmpty++;
        if (want.length && rect.y0 > 0) deep++;
      }
      // the sample has teeth only if it reaches both empty and populated rectangles
      expect(nonEmpty).toBeGreaterThan(200);
      expect(deep, 'populated rectangles with a raised camera').toBeGreaterThan(20);
    });
  }

  it('walkVisible hands each visible position to emit exactly once, in bucket-major order', () => {
    const rect = { xa: 1000, xb: 1400, y0: 0, y1: 150 };
    const seen = [];
    walkVisible(g, idx, rect, 'famous', (p) => seen.push(p));
    expect(new Set(seen).size).toBe(seen.length);
    const bucketOf = (p) => g.buckets.findIndex((b) => p >= b.off && p < b.off + b.len);
    for (let i = 1; i < seen.length; i++) expect(bucketOf(seen[i])).toBeGreaterThanOrEqual(bucketOf(seen[i - 1]));
    expect(seen.length).toBe(brute(g, rect, 'famous').length);
  });

  it('a rectangle below every apex and one beside the world are both empty, and the walk visits nothing for the second', () => {
    expect(countVisible(g, idx, { xa: 0, xb: TOTAL, y0: TOTAL, y1: TOTAL + 10 }, 'famous')).toBe(0);
    const out = { ids: new Uint32Array(8), count: 0, visited: 0 };
    gather(g, idx, { xa: TOTAL + 5000, xb: TOTAL + 6000, y0: 0, y1: 100 }, 'famous', out);
    expect(out.count).toBe(0);
    expect(out.visited).toBe(0);
  });
});

/* ── the shipped asset ────────────────────────────────────────────────── */

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
let graph = null;
beforeAll(() => {
  const src = fs.readFileSync(ASSET, 'utf8');
  const m = /var SCRIPTURE_WEB_DATA = (\{[\s\S]*\});?\s*$/.exec(src);
  if (!m) throw new Error('the asset did not parse: nothing below is about the corpus');
  graph = decodeGraph(JSON.parse(m[1]));
});

/** Phone landscape 800x360 at DPR 2: frame base 520, squash 0.64, the camera at verse 15,000. */
const W = 1600, BASE = 520, SQUASH = 0.64, FIT = W / 31102;
function rectAt(ppv, camY, camX = 15000) {
  const half = W / ppv / 2;
  const y0 = camY > 0 ? camY : 0;
  return { xa: camX - half, xb: camX + half, y0, y1: y0 + BASE / (ppv * SQUASH) };
}

describe('the index over the shipped asset (63,418 threads)', () => {
  it('PRECONDITION: the shipped layout has from ascending within every (bucket, tier) run — the free byFrom the index relies on', () => {
    let runs = 0;
    for (const b of graph.buckets) {
      for (const [start, len] of deltaRuns(b)) {
        runs++;
        for (let p = start + 1; p < start + len; p++) {
          if (graph.from[p] < graph.from[p - 1]) throw new Error(`from descends at ${p}: ${graph.from[p - 1]} -> ${graph.from[p]}`);
        }
      }
    }
    expect(runs).toBe(8);
    expect(graph.count).toBe(63418);
  });

  it('byTo ascends within every run, and every position appears in it once', () => {
    const idx = buildIndex(graph);
    for (const run of idx.runs) {
      const seen = new Uint8Array(run.end - run.start);
      for (let k = 0; k < run.byTo.length; k++) {
        seen[run.byTo[k]] = 1;
        if (k) expect(graph.to[run.start + run.byTo[k]]).toBeGreaterThanOrEqual(graph.to[run.start + run.byTo[k - 1]]);
      }
      expect(seen.every((s) => s === 1), `run ${run.bucket}@${run.start} lists every position`).toBe(true);
    }
  });

  it('at fit, centred, every thread is visible and the walk visits each at most twice', () => {
    const idx = buildIndex(graph);
    const out = { ids: new Uint32Array(70000), count: 0, visited: 0 };
    gather(graph, idx, rectAt(FIT, 0, 31102 / 2), 'famous', out);
    expect(out.count).toBe(63418);
    expect(out.visited).toBeLessThanOrEqual(2 * 63418);
  });

  it('at the 44 px ceiling: 142 visible, no more than 160 candidates examined (a chunk cull submitted 18,944)', () => {
    const idx = buildIndex(graph);
    const out = { ids: new Uint32Array(1024), count: 0, visited: 0 };
    gather(graph, idx, rectAt(88, 0), 'famous', out);
    expect(out.count).toBe(142);
    expect(out.visited).toBeLessThanOrEqual(160);
    expect(countVisible(graph, idx, rectAt(88, 0), 'essential')).toBe(15);
    expect(countVisible(graph, idx, rectAt(264, 0), 'famous')).toBe(37);
  });

  it('a camera raised ten band heights at the ceiling sees the 113 threads whose stems cross that band', () => {
    const idx = buildIndex(graph);
    const band = BASE / (88 * SQUASH);
    expect(countVisible(graph, idx, rectAt(88, 10 * band), 'famous')).toBe(113);
  });

  it('the windows that decide the regime: 17,509 candidates at 16x and 26,986 at 8x on this frame', () => {
    // Registered as data: the renderer gathers when the window fits its
    // budget and draws whole buckets past it. These two straddle the budget.
    const idx = buildIndex(graph);
    expect(windowSize(graph, idx, rectAt(FIT * 16, 0), 'famous')).toBe(17509);
    expect(windowSize(graph, idx, rectAt(FIT * 8, 0), 'famous')).toBe(26986);
    expect(countVisible(graph, idx, rectAt(FIT * 16, 0), 'famous')).toBe(11557);
  });
});
