// @ts-nocheck
/**
 * The one chunk walk (chunk-walk.js) against the four loops it replaced.
 *
 * Before F0 the renderer's draw, pick.pickArcs, pick.visibleArcs and
 * pick.footBundles each carried their own copy of the walk over a bucket's
 * drawn chunks. The two shapes are kept here verbatim as oracles: the
 * picker's (every visible chunk's instances, chunk by chunk) and the
 * renderer's (coalesced runs, one draw each, a bucket without chunks drawn
 * whole). On the real asset, at both densities and across windows that sit
 * on, just inside and just outside every chunk edge, the shared walk must
 * give the picker the same instances in the same order and the renderer the
 * same draws.
 *
 * The one input the two old shapes disagreed on between THEMSELVES is a NaN
 * window (the picker walked every chunk, the renderer drew none); no camera
 * produces one (clampCamera keeps ppv positive and finite, and x comes from
 * finite pointer, key and verse values), so it is not exercised here. The
 * shared walk takes the renderer's reading.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { walkDrawnRuns } from './chunk-walk.js';
import { decodeGraph, bucketDrawCount } from './decode.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const data = runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {});
const graph = decodeGraph(data);
const CHUNK = data.chunkSize || 256;

/** The picker's loop (pick.js before F0): the instances it visited, in order. */
function pickerOracle(bucket, draw, chunkSize, lo, hi) {
  const out = [];
  const chunks = bucket.chunks || [];
  const chunkCount = Math.ceil(draw / chunkSize);
  for (let c = 0; c < chunkCount; c++) {
    const ext = chunks[c];
    if (ext && (ext[1] < lo || ext[0] > hi)) continue;
    const start = bucket.off + c * chunkSize;
    const end = Math.min(start + chunkSize, bucket.off + draw);
    for (let i = start; i < end; i++) out.push(i);
  }
  return out;
}

/** The renderer's loop (web-renderer.js before F0): its draws as [first, n]. */
function rendererOracle(bucket, count, chunkSize, viewLo, viewHi) {
  const draws = [];
  if (count <= 0) return draws;
  const chunks = bucket.chunks || [];
  let runStart = -1;
  const flush = (endExclusive) => {
    if (runStart < 0) return;
    const first = runStart;
    const n = endExclusive - first;
    if (n > 0) draws.push([bucket.off + first, n]);
    runStart = -1;
  };
  if (!chunks.length) { draws.push([bucket.off, count]); return draws; }
  for (let c = 0; c * chunkSize < count; c++) {
    const ext = chunks[c];
    const start = c * chunkSize;
    const end = Math.min(start + chunkSize, count);
    const visible = !ext || (ext[1] >= viewLo && ext[0] <= viewHi);
    if (visible) { if (runStart < 0) runStart = start; }
    else flush(start);
    if (end >= count) flush(end);
  }
  flush(count);
  return draws;
}

const runsOf = (bucket, draw, chunkSize, lo, hi) => {
  const runs = [];
  walkDrawnRuns(bucket, draw, chunkSize, lo, hi, (s, e) => { runs.push([s, e - s]); });
  return runs;
};
const instancesOf = (bucket, draw, chunkSize, lo, hi) => {
  const out = [];
  walkDrawnRuns(bucket, draw, chunkSize, lo, hi, (s, e) => { for (let i = s; i < e; i++) out.push(i); });
  return out;
};

/** Windows on, inside and outside the chunk edges, plus a sweep of the canon. */
function windowsFor(bucket) {
  const w = [];
  for (const ext of (bucket.chunks || []).slice(0, 24)) {
    for (const d of [-1, -0.5, 0, 0.5, 1]) {
      w.push([ext[0] + d, ext[0] + d + 40]);
      w.push([ext[1] + d - 40, ext[1] + d]);
      w.push([ext[0] + d, ext[1] + d]);
    }
  }
  for (let lo = -12; lo < graph.total + 12; lo += 997) {
    for (const width of [0, 3.5, 60, 1200, 31102]) w.push([lo, lo + width]);
  }
  w.push([-Infinity, Infinity], [Infinity, -Infinity], [0, 0], [graph.total - 1, graph.total - 1]);
  return w;
}

describe('walkDrawnRuns is the four loops it replaced', () => {
  it('the asset has chunked buckets to walk (the control)', () => {
    expect(graph.buckets.length).toBeGreaterThan(2);
    expect(graph.buckets.some((b) => b.chunks && b.chunks.length > 4)).toBe(true);
  });

  for (const density of ['essential', 'famous']) {
    it(density + ': the picker visits the same instances in the same order', () => {
      let checked = 0;
      for (const bucket of graph.buckets) {
        const draw = bucketDrawCount(bucket, density);
        for (const [lo, hi] of windowsFor(bucket)) {
          expect(instancesOf(bucket, draw, CHUNK, lo, hi)).toEqual(pickerOracle(bucket, draw, CHUNK, lo, hi));
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(1000);
    });

    it(density + ': the renderer makes the same draws', () => {
      for (const bucket of graph.buckets) {
        const count = bucketDrawCount(bucket, density);
        for (const [lo, hi] of windowsFor(bucket)) {
          expect(runsOf(bucket, count, CHUNK, lo, hi)).toEqual(rendererOracle(bucket, count, CHUNK, lo, hi));
        }
      }
    });
  }

  it('a bucket without chunks is one run; missing extents are visible; an empty prefix walks nothing', () => {
    const plain = { off: 40, chunks: [] };
    expect(runsOf(plain, 700, 256, 5, 9)).toEqual(rendererOracle(plain, 700, 256, 5, 9));
    expect(instancesOf(plain, 700, 256, 5, 9)).toEqual(pickerOracle(plain, 700, 256, 5, 9));
    const short = { off: 3, chunks: [[0, 10], [50, 60]] };   // fewer extents than chunks
    for (const [lo, hi] of [[20, 30], [0, 5], [55, 58], [100, 200]]) {
      expect(runsOf(short, 900, 256, lo, hi)).toEqual(rendererOracle(short, 900, 256, lo, hi));
      expect(instancesOf(short, 900, 256, lo, hi)).toEqual(pickerOracle(short, 900, 256, lo, hi));
    }
    expect(runsOf(short, 0, 256, 0, 100)).toEqual([]);
    expect(pickerOracle(short, 0, 256, 0, 100)).toEqual([]);
  });

  it('a visit that returns true stops the walk', () => {
    const bucket = { off: 0, chunks: [[0, 1], [500, 600], [2, 3]] };
    const seen = [];
    const stopped = walkDrawnRuns(bucket, 768, 256, 0, 10, (s, e) => { seen.push([s, e]); return true; });
    expect(stopped).toBe(true);
    expect(seen).toEqual([[0, 256]]);
    expect(walkDrawnRuns(bucket, 768, 256, 0, 10, () => {})).toBe(false);
  });
});
