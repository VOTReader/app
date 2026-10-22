// @ts-nocheck
/* labelFeed (pick.js): the label pass's per-frame list of every drawn thread a
   reader can see (digest C2, item 3). Its visibility is closed form (the
   half-ellipse's height over the frame's x range against the sky); here it is
   held against a brute-force walk of the curve on the real asset, with the
   camera on the baseline and up in the sky, with and without the top chrome's
   inset, with and without fly-overs. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as geo from './geometry.js';
import * as dec from './decode.js';
import { webFrame, webViewArgs } from './web-frame.js';
import { labelFeed, eachLabelThread } from './pick.js';

vi.setConfig({ testTimeout: 60000 });

const here = dirname(fileURLToPath(import.meta.url));
const g = dec.decodeGraph(runInNewContext(readFileSync(resolve(here, '../../data/scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const isa53 = (() => {
  const bi = g.books.findIndex((b) => b.id.startsWith('isaiah'));
  return g.chapters.find((c) => c[0] === bi && c[1] === 53)[2] + 5;
})();
const V = { W: 1600, H: 900, DPR: 1 };

function frame(zoom, camY, inset) {
  const cam = geo.createCamera(g.total);
  cam.ppv = geo.fitPPV(cam, V.W) * zoom;
  cam.x = isa53;
  cam.y = camY;
  const f = webFrame(V, false);
  const view = webViewArgs(V, cam, f, 'famous', { arc: -1, range: null, hover: -1, lit: null });
  return { cam, view: { width: V.W, base: view.base, squash: view.squash, density: 'famous', inset } };
}

/**
 * Brute force: walk every drawn thread's curve (by x every 2 px with the
 * frame's edges exactly, and by the ellipse's angle in 1024 steps, so the
 * steep legs and the flat crown are both sampled) and ask whether some point
 * lies in the sky: x on the frame, y between the inset and the baseline,
 * grown (loose) or shrunk (strict) by `tol` px.
 */
function brute(cam, view, tol) {
  const { fanA, fanB } = dec.fansOf(g);
  const camY = cam.y > 0 ? cam.y : 0;
  const yb = view.base + camY, top = view.inset > 0 ? view.inset : 0;
  const strict = new Set(), loose = new Set();
  const inSky = (x, h, t) => x >= 0 && x <= view.width && yb - h >= top - t && yb - h <= view.base + t;
  for (const bucket of g.buckets) {
    const end = bucket.off + dec.bucketDrawCount(bucket, view.density);
    for (let i = bucket.off; i < end; i++) {
      const x0 = geo.footX(cam, view.width, g.from[i], fanA[i]), x1 = geo.footX(cam, view.width, g.to[i], fanB[i]);
      if (x1 < 0 || x0 > view.width) continue;
      const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
      const R = (x1 - x0) / 2, cx = (x0 + x1) / 2;
      let s = false, l = false;
      const test = (x, h) => { if (!l && inSky(x, h, tol)) l = true; if (!s && inSky(x, h, -tol)) s = true; };
      const xa = Math.max(0, x0), xb = Math.min(view.width, x1);
      for (let x = xa; x <= xb && !(s && l); x += 2) test(x, geo.arcHeightAt(x, x0, x1, A));
      test(xb, geo.arcHeightAt(xb, x0, x1, A));
      for (let k = 0; k <= 1024 && !(s && l); k++) {
        const tau = (Math.PI * k) / 1024;
        test(cx - R * Math.cos(tau), A * Math.sin(tau));
      }
      if (s) strict.add(i);
      if (l) loose.add(i);
    }
  }
  return { strict, loose };
}

describe('labelFeed against a brute-force walk of the curve', () => {
  for (const [label, zoom, camY, inset] of [
    ['baseline, 200x, under the top chrome', 200, 0, 56],
    ['up in the sky, 200x, camY 900, under the top chrome', 200, 900, 56],
    ['up in the sky, 60x, camY 2500, no chrome', 60, 2500, 0],
    ['up in the sky, 60x, camY 2500, a deep inset (300 px)', 60, 2500, 300],
  ]) {
    it(label + ': strict brute set <= feed <= loose brute set', () => {
      const { cam, view } = frame(zoom, camY, inset);
      const feed = labelFeed(g, cam, view, { flyovers: true });
      const ids = new Set(feed.map((f) => f.i));
      expect(ids.size, 'no thread twice').toBe(feed.length);
      const { strict, loose } = brute(cam, view, 2);
      expect(strict.size, 'the frame holds threads').toBeGreaterThan(20);
      for (const i of strict) expect(ids.has(i), 'brute sees thread ' + i).toBe(true);
      for (const i of ids) expect(loose.has(i), 'the feed holds thread ' + i + ', which brute force never sees').toBe(true);
    });
  }

  it('up in the sky a thread with a foot on the frame whose whole body is under the frame\'s bottom edge is left out; one whose crown reaches the sky is in', () => {
    const { cam, view } = frame(200, 900, 56);
    const feed = labelFeed(g, cam, view);
    const ids = new Set(feed.map((f) => f.i));
    const { fanA, fanB } = dec.fansOf(g);
    let low = 0, high = 0;
    for (const bucket of g.buckets) {
      const end = bucket.off + dec.bucketDrawCount(bucket, 'famous');
      for (let i = bucket.off; i < end; i++) {
        const x0 = geo.footX(cam, V.W, g.from[i], fanA[i]), x1 = geo.footX(cam, V.W, g.to[i], fanB[i]);
        if (!((x0 >= 0 && x0 <= V.W) || (x1 >= 0 && x1 <= V.W))) continue;
        const { A } = geo.arcShape((x1 - x0) / 2, view.squash);
        if (A < cam.y - 1) { low++; expect(ids.has(i), 'thread ' + i + ' crowns ' + A.toFixed(0) + ' px, under the frame').toBe(false); }
        // its crown on the frame and in the sky
        const cx = (x0 + x1) / 2;
        if (cx >= 0 && cx <= V.W && A > cam.y + 1 && A < view.base + cam.y - 56 - 1) { high++; expect(ids.has(i), 'thread ' + i).toBe(true); }
      }
    }
    expect(low, 'threads wholly under the frame').toBeGreaterThan(10);
    expect(high, 'threads crowning in the sky').toBeGreaterThan(3);
  });

  it('fly-overs (neither foot on the frame) come only when asked for, and each spans the frame', () => {
    const { cam, view } = frame(60, 2500, 0);
    const plain = labelFeed(g, cam, view);
    const withFly = labelFeed(g, cam, view, { flyovers: true });
    expect(plain.every((f) => f.fromOn || f.toOn)).toBe(true);
    const flies = withFly.filter((f) => !f.fromOn && !f.toOn);
    expect(flies.length, 'fly-overs in the sky').toBeGreaterThan(10);
    for (const f of flies) expect(f.x0 < 0 && f.x1 > V.W).toBe(true);
    expect(withFly.length).toBe(plain.length + flies.length);
  });

  it('eachLabelThread visits exactly what labelFeed lists, in the same order, and stops at the limit', () => {
    for (const [zoom, camY] of [[6, 0], [200, 900]]) {
      const { cam, view } = frame(zoom, camY, 56);
      const feed = labelFeed(g, cam, view, { flyovers: true });
      const seen = [];
      const n = eachLabelThread(g, cam, view, { flyovers: true }, (i, x0, x1, A, fromOn, toOn) => seen.push([i, x0, x1, A, fromOn, toOn]));
      expect(n).toBe(feed.length);
      expect(seen).toEqual(feed.map((f) => [f.i, f.x0, f.x1, f.A, f.fromOn, f.toOn]));
      expect(eachLabelThread(g, cam, view, { flyovers: true, limit: 7 }, () => {})).toBe(Math.min(7, feed.length));
    }
  });
});
