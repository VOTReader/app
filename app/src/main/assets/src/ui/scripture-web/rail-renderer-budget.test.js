/* rail-renderer — the frame budget (fix-review #5).

   w3 drew every visible thread with its full sample count (24 for a context
   thread, 48 for a link) and stroked one batch set per ink step of sixteen:
   63,567 lineTo calls at the overview of 2,648 threads where the base drew
   31,791, and 137 strokes at 20x / 3x where it drew 46. Here:

   B1  a line takes the samples its curve needs: the drawn polyline stays
       within EPS (2.5 CSS px for Timothy's threads, 0.5 for the reader's
       links) of the curve, and the overview's context takes about a dozen.
   B2  the context is stroked in at most INK_RUNGS inks a frame, spaced
       between the two rails' zooms with both ends exact, so the threads on a
       zoomed rail are that rail's ink exactly; the fly-overs take at most
       INK_RUNGS more, from the overview's ink (theirs once their feet are
       far) to the deeper rail's.
   B3  the picks prefilter on the drawn feet before building a path, and
       pick exactly what the draw draws. */
import { describe, it, expect } from 'vitest';
import { buildVotRail, railUnit, railSpan } from '../../utils/scripture-web/personal-graph.js';
import * as RR from './rail-renderer.js';

const { drawPersonalWeb, personalInk, pickUnderlayLinks, pickPersonalLinks, railFrame } = RR;
const threadPath = /** @type {any} */ (RR).threadPath;

/** Distance from a point to a polyline. */
function distToLine(line, p) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1], [x2, y2] = line[i];
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    let t = len > 0 ? ((p[0] - x1) * dx + (p[1] - y1) * dy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy)));
  }
  return best;
}

/** A context that counts lineTo calls and records each stroke's style and width. @returns {any} */
function countingCtx() {
  const c = { lineTo: 0, strokes: /** @type {Array<{style:string, width:number}>} */ ([]) };
  const st = { strokeStyle: '', lineWidth: 0 };
  const noop = () => {};
  return {
    c, canvas: {}, fillStyle: '', font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', letterSpacing: '0px',
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    beginPath: noop, moveTo: noop, lineTo() { c.lineTo++; }, arc: noop, fill: noop, fillText: noop, strokeText: noop,
    stroke() { c.strokes.push({ style: st.strokeStyle, width: st.lineWidth }); },
    measureText: (t) => ({ width: String(t).length * 8 }), clearRect: noop, save: noop, restore: noop,
  };
}
const contextStroke = (s) => /^rgba\((127,179,176|94,156,154|163,196,193|108,143,168),/.test(s.style);
const alphaOf = (style) => Number(/,\s*([\d.]+)\)$/.exec(style)[1]);

// a 1600 x 900 PC frame and a synthetic corpus: 2,648 threads, over half to the NT
const W = 1600, H = 900, BASE = 780, TOTAL = 31102;
const sizes = [150, 160, 140, 130, 120, 110, 100, 90, 120, 260, 120, 160, 60];
const rail = buildVotRail(sizes.map((n, k) => ({ volKey: 'c' + k, label: 'Col ' + k, items: Array.from({ length: n }, (_, i) => ({ id: k + '-' + i, title: 'L' + i })) })));
function corpus(N, seed0) {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const versePos = new Float32Array(N), votPos = new Float32Array(N), source = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    versePos[i] = rnd() < 0.55 ? TOTAL - 8000 + rnd() * 8000 : rnd() * TOTAL;
    votPos[i] = rnd() * rail.total; source[i] = (rnd() * 4) | 0;
  }
  return { count: N, versePos, votPos, source };
}
/** The frame with the Bible camera at zB about verse cB and the Volumes camera at zV about
 * rail position cV (a letter index; w4: the camera's axis is the rail's own unit, railUnit). */
function frame(zB, cB, zV, cV) {
  const ppvB = (zB * W) / TOTAL, ppvV = (zV * W) / railSpan(rail), cU = railUnit(rail, cV);
  return {
    width: W, height: H, DPR: 1, base: BASE, votRail: rail, verseTotal: TOTAL,
    verseX: (v) => (v - cB) * ppvB + W / 2, votX: (u) => (u - cU) * ppvV + W / 2,
    /** a letter position's x, as the draw places it */
    votAt: (p) => (railUnit(rail, p) - cU) * ppvV + W / 2,
    chrome: {}, showUnderlay: true, hoverIndex: -1, focusIndex: -1, capFraction: 1,
  };
}

describe('B1 a line takes the samples its curve needs', () => {
  const rails = railFrame({ H, DPR: 1 }, BASE);
  const gap = rails.bottomY - rails.topY, top = rails.topY, bot = rails.bottomY;
  const cases = /** @type {Array<any>} */ ([
    ['overview, short', [700, bot], [800, top], true],
    ['overview, mid', [300, bot], [900, top], true],
    ['overview, wide', [0, bot], [1600, top], true],
    ['overview, plumb', [800, bot], [805, top], true],
    ['leg, one screen', [800, bot], [3200, top], true],
    ['leg, twenty screens', [800, bot], [33600, top], true],
    ['leg from the edge', [0, bot], [33600, top], true],
    ['fly, one screen', [-1600, bot], [3200, top], true],
    ['fly, twenty screens', [-32000, bot], [33600, top], true],
    ['local, short', [700, bot], [820, bot], false],
    ['local, long', [100, bot], [1500, bot], false],
    ['local, leg', [800, bot], [40000, bot], false],
    ['local, fly', [-9000, top], [9000, top], false],
  ]);
  for (const [eps, n, who] of /** @type {Array<[number, number, string]>} */ ([[2.5, 24, 'a context thread'], [0.5, 48, 'a link']])) {
    it(`${who} strays at most ${eps} px from its curve`, () => {
      for (const [name, a, b, cross] of cases) {
        const pts = threadPath(a, b, cross, { width: W, gap, n, eps, up: true });
        const dense = threadPath(a, b, cross, { width: W, gap, n: 4000, up: true });
        let worst = 0;
        for (const p of dense) worst = Math.max(worst, distToLine(pts, p));
        expect(worst, `${name}: ${pts.length - 1} samples`).toBeLessThanOrEqual(eps);
      }
    });
  }
  it('the overview\'s context takes about a dozen samples a thread, a plumb line or a fly-over a handful', () => {
    const u = corpus(2648, 7);
    const ctx = countingCtx();
    drawPersonalWeb(ctx, null, u, frame(1, TOTAL / 2, 1, rail.total / 2));
    const rails0 = countingCtx();
    drawPersonalWeb(rails0, null, null, frame(1, TOTAL / 2, 1, rail.total / 2));
    const perThread = (ctx.c.lineTo - rails0.c.lineTo) / u.count;
    expect(perThread).toBeLessThan(14);
    expect(threadPath([800, bot], [805, top], true, { width: W, gap, n: 24, eps: 2.5 }).length - 1).toBe(4);
    expect(threadPath([-32000, bot], [33600, top], true, { width: W, gap, n: 24, eps: 2.5 }).length - 1).toBeLessThanOrEqual(6);
  });
});

describe('B2 the context is stroked in a bounded set of inks, both rails\' own exact', () => {
  it('at 40x on the Bible and the overview on the Volumes: at most INK_RUNGS inks, the two ends exact', () => {
    // threads with their Bible feet spread over three screens: on screen,
    // in the fade past each edge, and beyond it
    const N = 600, centre = 16000;
    const span = (3 * TOTAL) / 40;
    const u = { count: N, versePos: new Float32Array(N), votPos: new Float32Array(N), source: new Uint8Array(N) };
    for (let i = 0; i < N; i++) { u.versePos[i] = centre - span / 2 + (span * i) / N; u.votPos[i] = (i * 7) % rail.total; u.source[i] = i % 4; }
    const ctx = countingCtx();
    drawPersonalWeb(ctx, null, u, frame(40, centre, 1, rail.total / 2));
    const inks = new Set(ctx.c.strokes.filter(contextStroke).map((s) => alphaOf(s.style).toFixed(6) + '/' + s.width.toFixed(6)));
    expect(inks.size).toBeLessThanOrEqual(RR.INK_RUNGS);
    const alphas = [...inks].map((k) => Number(k.split('/')[0]));
    expect(Math.max(...alphas)).toBeCloseTo(personalInk(40).context.alpha, 6);
    expect(Math.min(...alphas)).toBeCloseTo(personalInk(1).context.alpha, 6);
  });
  it('with fly-overs too: at most twice INK_RUNGS stroke inks, the far fly-overs at the overview\'s ink', () => {
    const u = corpus(2648, 11);
    const ctx = countingCtx();
    drawPersonalWeb(ctx, null, u, frame(20, 26000, 3, rail.total * 0.3));
    const cs = ctx.c.strokes.filter(contextStroke);
    const inks = new Set(cs.map((s) => alphaOf(s.style).toFixed(6) + '/' + s.width.toFixed(6)));
    expect(inks.size).toBeLessThanOrEqual(2 * RR.INK_RUNGS);
    // the far fly-overs keep the overview's ink, never less
    expect(Math.min(...cs.map((s) => alphaOf(s.style)))).toBeCloseTo(personalInk(1).context.alpha, 6);
    // the threads hanging from the Volumes rail at 3x are that rail's ink exactly, at full width
    const v3 = personalInk(3).context;
    expect(cs.some((s) => Math.abs(alphaOf(s.style) - v3.alpha) < 1e-6 && Math.abs(s.width - v3.width) < 1e-6)).toBe(true);
  });
});

describe('B3 the picks prefilter on the drawn feet and pick what is drawn', () => {
  it('a pick equals the brute-force nearest drawn path, at the overview and under zoom', () => {
    const u = corpus(800, 5);
    const rails = railFrame({ H, DPR: 1 }, BASE);
    for (const f of [frame(1, TOTAL / 2, 1, rail.total / 2), frame(20, 26000, 3, rail.total * 0.3), frame(6, 15000, 1, rail.total / 2)]) {
      for (const [px, py] of [[800, 465], [120, 300], [1500, 700], [800, 160]]) {
        const got = pickUnderlayLinks(u, f, px, py, 14, 8).map((h) => h.index);
        // brute force: every thread's drawn path, as the draw builds it
        const want = [];
        for (let i = 0; i < u.count; i++) {
          const a = [f.verseX(u.versePos[i]), rails.bottomY], b = [f.votAt(u.votPos[i] + 0.5), rails.topY];
          const pts = threadPath(a, b, true, { width: W, gap: rails.bottomY - rails.topY, n: 24, eps: 2.5 });
          if (!pts) continue;
          const d = distToLine(pts, [px, py]);
          if (d < 14) want.push({ i, d });
        }
        want.sort((p, q) => p.d - q.d || p.i - q.i);
        expect(got, `${px},${py}`).toEqual(want.slice(0, 8).map((w) => w.i));
      }
    }
  });
  it('a reader\'s link is picked along its drawn path, and a far one is skipped before its path is built', () => {
    const personal = {
      count: 3, aRail: new Uint8Array([0, 0, 1]), bRail: new Uint8Array([1, 0, 1]),
      aPos: new Float32Array([16000, 15000, 100]), bPos: new Float32Array([700, 26000, 1200]), kind: new Uint8Array([2, 2, 2]),
    };
    const f = frame(6, 15000, 1, rail.total / 2);
    const rails = railFrame({ H, DPR: 1 }, BASE);
    // a point on link 0's drawn path is link 0
    const a = [f.verseX(16000), rails.bottomY], b = [f.votAt(700.5), rails.topY];
    const pts = threadPath(a, b, true, { width: W, gap: rails.bottomY - rails.topY, n: 48, eps: 0.5 });
    const mid = pts[Math.floor(pts.length / 2)];
    expect(pickPersonalLinks(personal, f, mid[0], mid[1], 6, 4)[0].index).toBe(0);
  });
});
