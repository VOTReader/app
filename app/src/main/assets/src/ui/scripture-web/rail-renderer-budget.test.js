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

/** A context stroke at least this wide (device px at DPR 1) is the soft glow under Timothy's
 * threads (w4, r2-05): CONTEXT_GLOW_WIDTH past a core that stops at 1.6 px. */
const GLOW_MIN = RR.CONTEXT_GLOW_WIDTH;
/** A context that counts lineTo calls (the cores' in lineTo, the glow's in glowLineTo) and
 * records each stroke's style and width. @returns {any} */
function countingCtx() {
  const c = { lineTo: 0, glowLineTo: 0, strokes: /** @type {Array<{style:string, width:number}>} */ ([]) };
  const st = { strokeStyle: '', lineWidth: 0 };
  const noop = () => {};
  return {
    c, canvas: {}, fillStyle: '', font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', letterSpacing: '0px',
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    beginPath: noop, moveTo: noop, lineTo() { if (st.lineWidth >= GLOW_MIN) c.glowLineTo++; else c.lineTo++; }, arc: noop, fill: noop, fillText: noop, strokeText: noop,
    stroke() { c.strokes.push({ style: st.strokeStyle, width: st.lineWidth }); },
    measureText: (t) => ({ width: String(t).length * 8 }), clearRect: noop, save: noop, restore: noop,
  };
}
const TIMOTHY = /^rgba\((127,179,176|94,156,154|163,196,193|108,143,168),/;
/** A context core (not the rails, ticks, links, nor the glow under the cores). */
const contextStroke = (s) => TIMOTHY.test(s.style) && s.width < GLOW_MIN;
const glowStroke = (s) => TIMOTHY.test(s.style) && s.width >= GLOW_MIN;
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
    // the glow (w4) traces those same samples once more, never more than the cores
    // do (each source's threads as one path; the fly-overs not at all)
    expect(ctx.c.glowLineTo - rails0.c.glowLineTo).toBeGreaterThan(0);
    expect(ctx.c.glowLineTo - rails0.c.glowLineTo).toBeLessThanOrEqual(ctx.c.lineTo - rails0.c.lineTo);
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
    // the glow under them (w4) takes at most GLOW_LEVELS inks a rung (w4 review: a leg's glow
    // fades with its far foot's presence, in GLOW_LEVELS steps; through the first pass one a rung)
    const glows = new Set(ctx.c.strokes.filter(glowStroke).map((s) => alphaOf(s.style).toFixed(6) + '/' + s.width.toFixed(6)));
    expect(glows.size).toBeGreaterThan(0);
    expect(glows.size).toBeLessThanOrEqual(RR.INK_RUNGS * RR.GLOW_LEVELS);
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
    // the glow (w4) is the anchored rungs' only, none for a fly-over: at most GLOW_LEVELS inks
    // a rung (w4 review, as above)
    const glows = new Set(ctx.c.strokes.filter(glowStroke).map((s) => alphaOf(s.style).toFixed(6) + '/' + s.width.toFixed(6)));
    expect(glows.size).toBeLessThanOrEqual(RR.INK_RUNGS * RR.GLOW_LEVELS);
  });
});

/** A raster of the context's ink, `cell` device px a cell: a stroke covers the cells its path
 * passes within half its width of, ONCE however often the path crosses them (as the canvas
 * paints one path), at its alpha, or alpha x width / cell for a line thinner than a cell (its
 * share of the cell); the cells compose the strokes over them (1 - prod(1 - a)). Only
 * Timothy's colours count (not the rails, ticks, names or links). @returns {any} */
function inkCtx(width, height, cell = 3) {
  const nx = Math.ceil(width / cell), ny = Math.ceil(height / cell);
  const T = new Float32Array(nx * ny).fill(1);
  const stamp = new Int32Array(nx * ny);
  let id = 0;
  /** @type {Array<Array<[number, number]>>} */ let path = [];
  /** @type {Array<[number, number]>} */ let cur = [];
  const st = { strokeStyle: '', lineWidth: 1 };
  const noop = () => {};
  return {
    canvas: {}, fillStyle: '', font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', letterSpacing: '0px',
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    beginPath() { path = []; }, moveTo(x, y) { cur = [[x, y]]; path.push(cur); }, lineTo(x, y) { cur.push([x, y]); },
    arc: noop, fill: noop, fillText: noop, strokeText: noop, measureText: (t) => ({ width: String(t).length * 8 }),
    clearRect: noop, save: noop, restore: noop,
    stroke() {
      if (!TIMOTHY.test(st.strokeStyle)) return;
      id++;
      const r = Math.max(cell / 2, st.lineWidth / 2), rc = Math.ceil(r / cell);
      const a = alphaOf(st.strokeStyle) * Math.min(1, st.lineWidth / cell);
      for (const line of path) {
        for (let k = 1; k < line.length; k++) {
          const [x1, y1] = line[k - 1], [x2, y2] = line[k];
          const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cell / 2)));
          for (let s = 0; s <= n; s++) {
            const x = x1 + ((x2 - x1) * s) / n, y = y1 + ((y2 - y1) * s) / n;
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
            for (let dy = -rc; dy <= rc; dy++) {
              for (let dx = -rc; dx <= rc; dx++) {
                const gx = cx + dx, gy = cy + dy;
                if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
                const ex = (gx + 0.5) * cell - x, ey = (gy + 0.5) * cell - y;
                if (ex * ex + ey * ey > r * r) continue;
                const c = gy * nx + gx;
                if (stamp[c] === id) continue;
                stamp[c] = id;
                T[c] *= 1 - a;
              }
            }
          }
        }
      }
    },
    /** the summed ink, in device px^2 of full ink */
    ink() { let s = 0; for (let i = 0; i < T.length; i++) s += 1 - T[i]; return s * cell * cell; },
  };
}

describe('B4 a live frame keeps the rest frame\'s ink (w4 review, major 4)', () => {
  // with the glow off while a gesture was live, the field dropped to about a quarter of its
  // ink as a pinch began and came back as it ended; the live cap (LIVE_CAP) alone thins only
  // the densest corridors
  const u = corpus(2648, 7);
  for (const [name, zB, cB, zV, cV] of /** @type {Array<[string, number, number, number, number]>} */ ([
    ['the overview', 1, TOTAL / 2, 1, rail.total / 2],
    ['the Bible at 10x on the Gospels', 10, 24000, 1, rail.total / 2],
    ['both rails 4x', 4, 26000, 4, rail.total * 0.4],
  ])) {
    it(`${name}: the live frame's summed ink is within 15% of the rest frame's`, () => {
      const rest = inkCtx(W, H), live = inkCtx(W, H);
      drawPersonalWeb(rest, null, u, frame(zB, cB, zV, cV));
      drawPersonalWeb(live, null, u, Object.assign(frame(zB, cB, zV, cV), { capFraction: 0 }));
      const r = rest.ink(), l = live.ink();
      expect(r).toBeGreaterThan(0);
      expect(Math.abs(l - r) / r, `live ${l.toFixed(0)} / rest ${r.toFixed(0)}`).toBeLessThanOrEqual(0.15);
    });
  }
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
