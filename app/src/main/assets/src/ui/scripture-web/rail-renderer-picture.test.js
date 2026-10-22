/* rail-renderer — the w3 picture (the r2-05 mockup; spec §3 and §4.2, Q3, Q8).

   P1  the rails sit where the spec puts them: the Volumes rail 150 CSS px
       from the top on a PC, 78 on a phone (w4: 62 + a second row of names,
       both clear of a reader's pin),
       never below 0.4 of the baseline.
   P2  a line's ink follows the rails it is anchored to on screen: the
       overview is one ink (personalInk(1)), a thread whose foot sits on a
       zoomed rail takes that rail's depth, a thread whose only foot on screen
       is on the unzoomed rail keeps the overview's ink (so zooming the Bible
       does not brighten the whole field: C13 / C14), and a fly-over (no foot
       on screen, Q3 ii) at FLYOVER_LEG_WIDTH of its width, its ink held by
       its feet's presence like every thread's: near depth while they sit just
       past the edges, the overview's ink (never less) once they are far, so
       a corridor of them never piles into a saturated ribbon (C17; the
       fix-review #12 floor at the view's depth did, measured on the walk).
   P3  a chosen link recedes the rest to MYWEB_TAP_CONTEXT (My Web's own recede), never further.
   P4  the Volumes rail's type: sw-ink's face, 13 / 11 px tracked caps in the
       volumesLabel ink, the rail in volumesRail, and the overline "THE
       VOLUMES OF TRUTH" on a PC only; the phone's names take two rows (w4:
       every collection named, never dropped). */
import { describe, it, expect } from 'vitest';
import { buildVotRail, railSpan } from '../../utils/scripture-web/personal-graph.js';
import { drawPersonalWeb, personalInk, railFrame, linkPath, CONTEXT_GLOW_WIDTH, CONTEXT_GLOW_SHARE } from './rail-renderer.js';
import { css, FONT, MYWEB_TAP_CONTEXT, FLYOVER_LEG_WIDTH, INK } from '../../utils/scripture-web/sw-ink.js';

// My Web's own recede (w4 INK review finding 6, and the w4 myweb pair): TAP_CONTEXT rose to .60
const TAP_CONTEXT = MYWEB_TAP_CONTEXT;

const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', short: 'Vol I', items: Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, title: 'Letter ' + i })) },
  { volKey: 'two', label: 'Volume Two', short: 'Vol II', items: Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, title: 'Letter ' + i })) },
]);
const W = 1000, H = 600;
const base = {
  width: W, height: H, DPR: 1, base: 500, votRail: rail, verseTotal: 100,
  verseX: (v) => v * 10, votX: (p) => (p / 20) * W,
  chrome: { isLight: false, fsLabel: 11 }, showUnderlay: true, hoverIndex: -1, focusIndex: -1,
};

/** A 2D context recording each stroke's style and width, and each text. @returns {any} */
function recordingCtx() {
  const strokes = [], texts = [], log = [];
  const st = { strokeStyle: '', lineWidth: 0, font: '', fillStyle: '', letterSpacing: '0px' };
  const noop = () => {};
  return {
    strokes, texts, log,
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get letterSpacing() { return st.letterSpacing; }, set letterSpacing(v) { st.letterSpacing = v; },
    textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, fill: noop, clearRect: noop, save: noop, restore: noop,
    arc(x, y) { log.push(['arc', x, y]); },
    stroke() { strokes.push({ style: st.strokeStyle, width: st.lineWidth }); },
    measureText: (t) => ({ width: String(t).length * 7 }),
    fillText(t, x, y) { log.push(['fill', String(t)]); texts.push({ text: String(t), x, y, font: st.font, fill: st.fillStyle, spacing: st.letterSpacing }); },
    strokeText(t) { log.push(['knock', String(t), st.strokeStyle, st.lineWidth]); },
  };
}
const alphaOf = (style) => Number(/,\s*([\d.]+)\)$/.exec(style)[1]);
const TIMOTHY = /^rgba\((127,179,176|94,156,154|163,196,193|85,148,158),/;
/** The context's strokes: the cores in a Timothy source colour (not the rails, ticks or
 * links, nor the soft glow under them: w4, CONTEXT_GLOW_WIDTH past a core that stops at 1.6 px). */
function contextStrokes(ctx) {
  return ctx.strokes.filter((s) => TIMOTHY.test(s.style) && s.width < CONTEXT_GLOW_WIDTH);
}
/** The soft glow under Timothy's threads (w4, r2-05): a Timothy colour, CONTEXT_GLOW_WIDTH past its core. */
function glowStrokes(ctx) {
  return ctx.strokes.filter((s) => TIMOTHY.test(s.style) && s.width >= CONTEXT_GLOW_WIDTH);
}

describe('P1 the rails sit where the spec puts them', () => {
  it('the Volumes rail is 150 CSS px down on a PC and 78 on a phone; the Bible rail keeps the baseline', () => {
    expect(railFrame({ H: 900, DPR: 1 }, 508)).toEqual({ topY: 150, bottomY: 508 });
    const phone = railFrame({ H: 411 * 2.6, DPR: 2.6 }, 319 * 2.6);
    // w4: the spec's 62 and a second 12 px row of names, so every collection is named, both
    // rows 4 px higher than the first w4 law so a reader's pin clears the lower one (review)
    expect(phone.topY).toBeCloseTo(78 * 2.6, 6);
    expect(phone.bottomY).toBeCloseTo(319 * 2.6, 6);
    // a frame too short for the spec's place keeps the rail above 0.4 of the baseline
    expect(railFrame({ H: 600, DPR: 1 }, 300).topY).toBe(120);
  });
  it('the Volumes rail clears the top chrome whatever its height: its names never print under the header', () => {
    // a phone header that ends at 60 CSS px (the spec's ends at 50): the names' two rows
    // need 28 px over the rail (w4; one row needed 12, and the first w4 rows 24)
    const dpr = 2.6;
    const tall = railFrame({ H: 411 * dpr, DPR: dpr, inset: 60 * dpr }, 319 * dpr);
    expect(tall.topY).toBeCloseTo(88 * dpr, 6);
    // the spec's own header (to 50) leaves the spec's place (78 with the second row)
    expect(railFrame({ H: 411 * dpr, DPR: dpr, inset: 50 * dpr }, 319 * dpr).topY).toBeCloseTo(78 * dpr, 6);
    // on a PC the overline and both rows need 58 px: a header to 75 leaves 150
    expect(railFrame({ H: 900, DPR: 1, inset: 75 }, 508).topY).toBe(150);
    expect(railFrame({ H: 900, DPR: 1, inset: 110 }, 508).topY).toBe(168);
    // the chrome hidden (inset 0): the spec's place
    expect(railFrame({ H: 900, DPR: 1, inset: 0 }, 508).topY).toBe(150);
  });
});

describe('P2 a line\'s ink follows the rails it is anchored to on screen', () => {
  const overview = personalInk(1).context;
  it('at the overview every thread is the overview ink', () => {
    const u = { count: 3, versePos: new Float32Array([5, 50, 95]), votPos: new Float32Array([1, 9, 18]), source: new Uint8Array([0, 1, 2]) };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, u, base);
    const cs = contextStrokes(ctx);
    expect(cs.length).toBe(3);
    for (const s of cs) { expect(alphaOf(s.style)).toBeCloseTo(overview.alpha, 6); expect(s.width).toBeCloseTo(overview.width, 6); }
  });
  it('zooming the Bible 10x deepens the threads on screen at the Bible rail and leaves the others at the overview ink', () => {
    // the Bible camera at 10x about verse 50; the Volumes camera at fit
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100 });
    const u = {
      count: 2, versePos: new Float32Array([50, 2]), votPos: new Float32Array([9, 9]), source: new Uint8Array([0, 0]),
    };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, u, deep);
    const cs = contextStrokes(ctx).map((s) => ({ a: alphaOf(s.style), w: s.width })).sort((p, q) => p.a - q.a);
    expect(cs.length).toBe(2);
    // verse 2 is 4,800 px off screen: its line hangs from the Volumes rail at the overview's ink
    expect(cs[0].a).toBeCloseTo(overview.alpha, 6);
    expect(cs[0].w).toBeCloseTo(overview.width, 6);
    // verse 50 is under the centre: its line takes the Bible rail's depth, within one ink step of 10x
    const ten = personalInk(10).context;
    expect(cs[1].a).toBeGreaterThan(overview.alpha * 2);
    expect(Math.abs(cs[1].a - ten.alpha)).toBeLessThan(0.03);
    expect(cs[1].w).toBeGreaterThan(overview.width);
  });
  it('a fly-over (no foot on screen) is held by its feet\'s presence at FLYOVER_LEG_WIDTH: near depth just past the edges, the overview\'s ink far off, never less', () => {
    // Both rails zoomed 10x. verse 2 to Volumes position 18 crosses the screen
    // with both feet far off it (4,800 and 4,000 px); verse 44.6 to position
    // 11.1 crosses with both just past the edges (40 and 50 px); verse 50 to
    // position 10 has both feet on it. Fix-review #12 gave every fly-over the
    // depth both rails share; on the walk (e2e-myweb-r2 T, both rails 16x) a
    // corridor of them then piled into two saturated ribbons across the screen
    // (the band's pixels at full ink: 0.139 of it at 800x360 against 0.060
    // with this law, base 0.064), the sky C17 forbids
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100, votX: (p) => 500 + (p - 10) * 500 });
    const ten = personalInk(10).context;
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, { count: 3, versePos: new Float32Array([2, 44.6, 50]), votPos: new Float32Array([18, 11.1, 10]), source: new Uint8Array([3, 2, 0]) }, deep);
    const cs = contextStrokes(ctx);
    expect(cs.length).toBe(3);
    const far = cs.find((s) => s.style.startsWith('rgba(85,148,158,'));
    const near = cs.find((s) => s.style.startsWith('rgba(163,196,193,'));
    const anchored = cs.find((s) => s.style.startsWith('rgba(127,179,176,'));
    expect(alphaOf(anchored.style)).toBeCloseTo(ten.alpha, 6);
    // far off: the overview's ink exactly, never less, at FLYOVER_LEG_WIDTH of the overview's width
    expect(alphaOf(far.style)).toBeCloseTo(overview.alpha, 6);
    expect(far.width).toBeCloseTo(overview.width * FLYOVER_LEG_WIDTH, 6);
    // just past the edges: within one rung of the depth, so a leg whose last foot leaves does not pop
    expect(alphaOf(near.style)).toBeGreaterThan(overview.alpha * 2);
    expect(Math.abs(alphaOf(near.style) - ten.alpha)).toBeLessThan(0.05);
  });
  it('w4 (r2-05): the threads with their feet on screen carry a soft glow, once a source, CONTEXT_GLOW_WIDTH past the core at CONTEXT_GLOW_SHARE of its alpha; a fly-over none, a live frame the same (w4 review)', () => {
    // the fly-over frame above, plus a second footnote thread beside the first
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100, votX: (p) => 500 + (p - 10) * 500 });
    const ten = personalInk(10).context;
    const u = { count: 4, versePos: new Float32Array([2, 44.6, 50, 51]), votPos: new Float32Array([18, 11.1, 10, 10.4]), source: new Uint8Array([3, 2, 0, 0]) };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, u, deep);
    const glows = glowStrokes(ctx);
    // one for the two footnote threads together; none for the two fly-overs, so a
    // corridor passing over a zoomed view never glows into a sky (C17)
    expect(glows.length).toBe(1);
    expect(glows[0].style.startsWith('rgba(127,179,176,')).toBe(true);
    expect(alphaOf(glows[0].style)).toBeCloseTo(ten.alpha * CONTEXT_GLOW_SHARE, 6);
    expect(glows[0].width).toBeCloseTo(ten.width + CONTEXT_GLOW_WIDTH, 6);
    // under its cores: the glow is stroked before them
    const at = ctx.strokes.indexOf(glows[0]);
    for (const s of contextStrokes(ctx).filter((x) => x.style.startsWith('rgba(127,179,176,'))) expect(ctx.strokes.indexOf(s)).toBeGreaterThan(at);
    // a live gesture keeps the same glow (w4 review, major 4: off mid-gesture, the field's
    // brightness dropped as a pinch began and came back as it ended; the cost is measured
    // on the walk, e2e-myweb's glow bench)
    const live = recordingCtx();
    drawPersonalWeb(live, null, u, Object.assign({}, deep, { capFraction: 0 }));
    expect(glowStrokes(live).map((s) => [s.style, s.width])).toEqual(glows.map((s) => [s.style, s.width]));
    expect(contextStrokes(live).length).toBeGreaterThan(0);
  });
  it('the walk\'s glow knob (contextGlow false, e2e-myweb --glow) draws the same cores and no glow, so the bench times the glow alone', () => {
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100, votX: (p) => 500 + (p - 10) * 500 });
    const u = { count: 2, versePos: new Float32Array([50, 51]), votPos: new Float32Array([10, 10.4]), source: new Uint8Array([0, 1]) };
    const on = recordingCtx(), off = recordingCtx();
    drawPersonalWeb(on, null, u, deep);
    drawPersonalWeb(off, null, u, Object.assign({}, deep, { contextGlow: false }));
    expect(glowStrokes(on).length).toBe(2);
    expect(glowStrokes(off).length).toBe(0);
    expect(contextStrokes(off).map((x) => [x.style, x.width])).toEqual(contextStrokes(on).map((x) => [x.style, x.width]));
  });
  it('w4 review: a leg (one foot on screen) glows only while its other foot is near, fading with that foot\'s presence, so a corridor of legs off a zoomed rail never fuses into a slab', () => {
    // both rails 10x (the frame above): a thread with both feet on screen (footnotes), a leg
    // whose Volumes foot sits just past the right edge (study notes) and one whose Volumes
    // foot is screens away (Words To Live By)
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100, votX: (p) => 500 + (p - 10) * 500 });
    const ten = personalInk(10).context;
    const u = { count: 3, versePos: new Float32Array([50, 52, 53]), votPos: new Float32Array([10, 19, 11.1]), source: new Uint8Array([0, 2, 1]) };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, u, deep);
    const glows = glowStrokes(ctx);
    const of = (rgb) => glows.filter((s) => s.style.startsWith('rgba(' + rgb + ','));
    // the anchored thread: the full glow
    expect(of('127,179,176').length).toBe(1);
    expect(alphaOf(of('127,179,176')[0].style)).toBeCloseTo(ten.alpha * CONTEXT_GLOW_SHARE, 6);
    // the far leg: its core, and no glow
    expect(contextStrokes(ctx).some((s) => s.style.startsWith('rgba(163,196,193,'))).toBe(true);
    expect(of('163,196,193').length).toBe(0);
    // the near leg: a glow, fainter than the anchored thread's
    expect(of('94,156,154').length).toBe(1);
    const near = alphaOf(of('94,156,154')[0].style);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(ten.alpha * CONTEXT_GLOW_SHARE - 1e-6);
  });
});

describe('P3 a chosen link recedes the rest to MYWEB_TAP_CONTEXT', () => {
  it('My Web recedes by its own constant, .45 (the reader\'s links share the chosen one\'s gold)', () => {
    expect(MYWEB_TAP_CONTEXT).toBe(0.45);
  });

  it('the other links and Timothy\'s threads drop to 0.45 of their ink; the chosen one keeps all of it', () => {
    const personal = {
      count: 2, aRail: new Uint8Array([0, 0]), bRail: new Uint8Array([1, 1]),
      aPos: new Float32Array([20, 80]), bPos: new Float32Array([3, 15]), kind: new Uint8Array([2, 2]),
    };
    const u = { count: 1, versePos: new Float32Array([50]), votPos: new Float32Array([9]), source: new Uint8Array([0]) };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, personal, u, Object.assign({}, base, { focusIndex: 0 }));
    const L = personalInk(1).link;
    // the cores: gold strokes at the link's width (the chosen one at its hover width)
    const gold = ctx.strokes.filter((s) => s.style.startsWith('rgba(224,178,90,'));
    const cores = gold.filter((s) => [L.width, L.hoverWidth].some((w) => Math.abs(s.width - w) < 1e-6));
    expect(cores.length).toBe(2);
    const alphas = cores.map((s) => alphaOf(s.style)).sort();
    expect(alphas[0]).toBeCloseTo(L.alpha * TAP_CONTEXT, 6);
    expect(alphas[alphas.length - 1]).toBeCloseTo(L.alpha, 6);
    expect(alphaOf(contextStrokes(ctx)[0].style)).toBeCloseTo(personalInk(1).context.alpha * TAP_CONTEXT, 6);
  });
  it('w4 review: the receded links are drawn core only, no halo; the chosen one keeps its halo, and so does one under the pointer', () => {
    // their 7 px halo at .16 x TAP_CONTEXT still widened them into soft gold bands
    // round the chosen line, which is the one line that should carry a halo
    const personal = {
      count: 3, aRail: new Uint8Array([0, 0, 0]), bRail: new Uint8Array([1, 1, 1]),
      aPos: new Float32Array([20, 50, 80]), bPos: new Float32Array([3, 9, 15]), kind: new Uint8Array([2, 2, 2]),
    };
    const L = personalInk(1).link;
    const halos = (ctx) => ctx.strokes.filter((s) => s.style.startsWith('rgba(224,178,90,') && [L.halo, L.hoverHalo].some((w) => Math.abs(s.width - w) < 1e-6));
    const cores = (ctx) => ctx.strokes.filter((s) => s.style.startsWith('rgba(224,178,90,') && [L.width, L.hoverWidth].some((w) => Math.abs(s.width - w) < 1e-6));
    const tap = recordingCtx();
    drawPersonalWeb(tap, personal, null, Object.assign({}, base, { focusIndex: 0 }));
    expect(halos(tap).length).toBe(1);
    expect(halos(tap)[0].width).toBeCloseTo(L.hoverHalo, 6);
    expect(alphaOf(halos(tap)[0].style)).toBeCloseTo(L.hoverHaloAlpha, 6);
    expect(cores(tap).length).toBe(3);
    // a receded link under the pointer shows it with its halo
    const hover = recordingCtx();
    drawPersonalWeb(hover, personal, null, Object.assign({}, base, { focusIndex: 0, hoverIndex: 2 }));
    expect(halos(hover).length).toBe(2);
    // at rest every link keeps its halo
    const rest = recordingCtx();
    drawPersonalWeb(rest, personal, null, base);
    expect(halos(rest).length).toBe(3);
  });
  const personal2 = {
    count: 2, aRail: new Uint8Array([0, 0]), bRail: new Uint8Array([1, 1]),
    aPos: new Float32Array([20, 80]), bPos: new Float32Array([3, 15]), kind: new Uint8Array([2, 2]),
  };
  // two threads: source 0 (footnotes) and source 2 (Words To Live By)
  const two = { count: 2, versePos: new Float32Array([50, 30]), votPos: new Float32Array([9, 4]), source: new Uint8Array([0, 2]) };
  const WTLB = 'rgba(163,196,193,';
  it('a chosen Timothy thread: the rest recedes to TAP_CONTEXT and it is stroked last, in its own colour, at the chosen width with a halo (fix-review #4)', () => {
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, personal2, two, Object.assign({}, base, { focusIndex: 1, focusUnderlay: true }));
    const L = personalInk(1).link;
    // the reader's links all recede, none is taken for the chosen one
    const cores = ctx.strokes.filter((s) => s.style.startsWith('rgba(224,178,90,') && Math.abs(s.width - L.width) < 1e-6);
    expect(cores.length).toBe(2);
    for (const s of cores) expect(alphaOf(s.style)).toBeCloseTo(L.alpha * TAP_CONTEXT, 6);
    // the other thread recedes; the chosen one is not in the faint pass at all
    const below = { strokes: ctx.strokes.slice(0, -2) };
    const faint = contextStrokes(below).filter((s) => alphaOf(s.style) < 0.5);
    expect(faint.length).toBe(1);
    expect(faint[0].style.startsWith('rgba(127,179,176,')).toBe(true);
    expect(alphaOf(faint[0].style)).toBeCloseTo(personalInk(1).context.alpha * TAP_CONTEXT, 6);
    // its glow recedes with it (w4); the chosen one has none under it
    const glow = glowStrokes(below);
    expect(glow.length).toBe(1);
    expect(glow[0].style.startsWith('rgba(127,179,176,')).toBe(true);
    expect(alphaOf(glow[0].style)).toBeCloseTo(personalInk(1).context.glow.alpha * TAP_CONTEXT, 6);
    // last: its halo, then its core, in its own source's colour (never the reader's gold)
    const [halo, core] = ctx.strokes.slice(-2);
    expect(halo.style.startsWith(WTLB)).toBe(true);
    expect(alphaOf(halo.style)).toBeCloseTo(INK.chosenHalo.alpha, 6);
    expect(halo.width).toBeCloseTo(INK.chosenHalo.width, 6);
    expect(core.style.startsWith(WTLB)).toBe(true);
    expect(alphaOf(core.style)).toBeCloseTo(INK.chosen.alpha, 6);
    expect(core.width).toBeCloseTo(INK.chosen.width, 6);
  });
  it('the chosen and the hovered Timothy thread are stroked smooth: within 0.5 px of the curve, no corner (Q8, item 33; fix-review 2 #2)', () => {
    // the faint pass samples a thread to EPS_CONTEXT (2.5 px: thousands of
    // threads at 0.06 alpha); stroked alone at the chosen width with a halo,
    // those chords showed as facets, the one line the reader is looking at
    const one = { count: 1, versePos: new Float32Array([20]), votPos: new Float32Array([15]), source: new Uint8Array([0]) };
    const rails = railFrame({ H, DPR: 1 }, base.base);
    const a = [base.verseX(20), rails.bottomY], b = [base.votX(15.5), rails.topY];
    const curve = linkPath(a[0], a[1], b[0], b[1], true, 6000);
    for (const [name, o] of /** @type {Array<[string, any]>} */ ([
      ['chosen', { focusIndex: 0, focusUnderlay: true }],
      ['hovered', { hoverIndex: 0, hoverUnderlay: true }],
    ])) {
      const ctx = pathCtx();
      drawPersonalWeb(ctx, null, one, Object.assign({}, base, o));
      const core = ctx.strokes[ctx.strokes.length - 1].path;
      expect(core.length, name).toBeGreaterThan(8);
      expect(core[0], name).toEqual(a);
      expect(core[core.length - 1], name).toEqual(b);
      // every chord's quarter points lie on the curve, within half a pixel
      let worst = 0;
      for (let i = 1; i < core.length; i++) {
        for (const f of [0.25, 0.5, 0.75]) {
          const p = [core[i - 1][0] + (core[i][0] - core[i - 1][0]) * f, core[i - 1][1] + (core[i][1] - core[i - 1][1]) * f];
          worst = Math.max(worst, distTo(curve, p));
        }
      }
      expect(worst, name).toBeLessThanOrEqual(0.5);
      expect(turnOf(core), name).toBeLessThan(20);
    }
  });
  it('a Timothy thread under the pointer is drawn on top at the hover width, and nothing dims (C3, fix-review #11)', () => {
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, personal2, two, Object.assign({}, base, { hoverIndex: 1, hoverUnderlay: true }));
    const L = personalInk(1).link;
    // the reader's link 1 is NOT the hovered one: the hover indexes Timothy's list
    const gold = ctx.strokes.filter((s) => s.style.startsWith('rgba(224,178,90,'));
    expect(gold.some((s) => Math.abs(s.width - L.hoverWidth) < 1e-6)).toBe(false);
    for (const s of gold.filter((x) => Math.abs(x.width - L.width) < 1e-6)) expect(alphaOf(s.style)).toBeCloseTo(L.alpha, 6);
    const last = ctx.strokes[ctx.strokes.length - 1];
    expect(last.style.startsWith(WTLB)).toBe(true);
    expect(last.width).toBeCloseTo(INK.hover.width, 6);
    expect(alphaOf(last.style)).toBeCloseTo(INK.hover.alpha, 6);
    const below = contextStrokes({ strokes: ctx.strokes.slice(0, -2) });
    expect(below.length).toBe(2);
    for (const s of below) expect(alphaOf(s.style)).toBeCloseTo(personalInk(1).context.alpha, 6);
  });
});

describe('P4 the Volumes rail in the spec\'s type and ink', () => {
  it('on a PC: 13 px tracked caps in the web\'s face and the volumesLabel ink, the overline over them', () => {
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, base);
    const names = ctx.texts.filter((t) => t.text.startsWith('VOL '));
    expect(names.map((t) => t.text).sort()).toEqual(['VOL I', 'VOL II']);
    for (const t of names) {
      expect(t.font).toContain('13px');
      expect(t.font).toContain(FONT);
      expect(t.spacing).toBe('1.30px');
      expect(t.fill).toBe(css('volumesLabel'));
      expect(t.y).toBeLessThan(150);
    }
    const over = ctx.texts.filter((t) => t.text === 'THE VOLUMES OF TRUTH');
    expect(over.length).toBe(1);
    expect(over[0].font).toContain('14px');
    expect(over[0].fill).toBe(css('volumesOverline'));
    expect(ctx.strokes.some((s) => s.style === css('volumesRail'))).toBe(true);
  });
  it('on a phone: 11 px names and no overline (the header holds that band)', () => {
    const ctx = recordingCtx();
    const dpr = 2.6;
    drawPersonalWeb(ctx, null, null, Object.assign({}, base, {
      width: 891 * dpr, height: 411 * dpr, DPR: dpr, base: 319 * dpr,
      verseX: (v) => v * 8.91 * dpr, votX: (p) => (p / 20) * 891 * dpr,
    }));
    const names = ctx.texts.filter((t) => t.text.startsWith('VOL '));
    expect(names.length).toBe(2);
    for (const t of names) expect(t.font).toContain((11 * dpr) + 'px');
    expect(ctx.texts.some((t) => t.text === 'THE VOLUMES OF TRUTH')).toBe(false);
    // two rows on the phone too (w4: every collection named, never dropped; through w3 the
    // phone kept one row and a crowded rail lost names to it). The fake measures 7 px a
    // glyph: names a little wider than their bands, so neighbours collide
    const many = (label) => buildVotRail(Array.from({ length: 40 }, (_, k) => ({
      volKey: 'c' + k, label: label + String(k).padStart(2, '0'), short: label + String(k).padStart(2, '0'), items: [{ id: 'x' + k, title: 'X' }],
    })));
    const crowd = (o, label) => {
      const c = recordingCtx();
      drawPersonalWeb(c, null, null, Object.assign({}, o, { votRail: many(label), votX: (p) => (p / 40) * o.width }));
      return c.texts.filter((t) => t.text.startsWith(label));
    };
    const pc = crowd(base, 'C ');                      // 25 px bands, 28 px names
    expect(new Set(pc.map((t) => t.y)).size).toBe(2);
    const phoneFrame = Object.assign({}, base, { width: 891 * dpr, height: 411 * dpr, DPR: dpr, base: 319 * dpr });
    const phone = crowd(phoneFrame, 'COLLECT ');       // 58 px bands, 70 px names
    expect(phone.length).toBe(40);
    expect([...new Set(phone.map((t) => t.y))].sort((p, q) => p - q)).toEqual([58 * dpr, 70 * dpr].map((y) => expect.closeTo(y, 6)));
    // spec §3 amended (w4): names on two rows, 8 and 20 px over the rail at 78, under the chrome's 50
    // fix-review #13: every placed name is one ink, the second row's too
    for (const t of pc) expect(t.fill).toBe(css('volumesLabel'));
  });
  it('w4: on a phone every one of the 21 collections is named at the overview, on two rows, none dropped and none over another', () => {
    // the brief: "every collection named on the phone rail; abbreviate or stack, never
    // drop". At equal slots (w4) a phone gives each collection 38-42 px and the names
    // run 37-71 px ("HOLY DAYS"); one row dropped five of them (VOL VII, WTLB I,
    // BLESSED, TIMOTHY, TRINITY at 891x411). The widths are the web's face as Chrome
    // measures it at 11 px with the loop's 0.1 em tracking (w4 fix pass, 2026-10-18), scaled
    // by the size the loop sets; the short names alone (no tiny forms) all stand at these
    // frames, and the review's gap (0.9 em, NAME_GAP_EM) holds between them.
    const WIDTH_11 = {
      'VOL I': 33.6, 'VOL II': 38.52, 'VOL III': 43.45, 'VOL IV': 42.22, 'VOL V': 37.29, 'VOL VI': 42.22, 'VOL VII': 47.15,
      'REBUKE': 49.69, 'WTLB I': 43.77, 'WTLB II': 48.7, 'BLESSED': 52.03, 'FLOCK': 41.78, 'TIMOTHY': 60.14, 'HOLY DAYS': 68.99,
      'MTAM': 38.61, 'ODDS': 34.68, 'LAMB': 35.14, 'SOTD': 33.59, 'GRACE': 43.31, 'TRINITY': 53.8, 'PURITY': 47.05,
    };
    const shorts = ['Vol I', 'Vol II', 'Vol III', 'Vol IV', 'Vol V', 'Vol VI', 'Vol VII', 'Rebuke', 'WTLB I', 'WTLB II',
      'Blessed', 'Flock', 'Timothy', 'Holy Days', 'MTaM', 'Odds', 'Lamb', 'SotD', 'Grace', 'Trinity', 'Purity'];
    const all = buildVotRail(shorts.map((s, k) => ({ volKey: 'c' + k, label: s, short: s, items: Array.from({ length: 3 + k * 7 }, (_, i) => ({ id: k + '-' + i, title: 'L' })) })));
    const upper = shorts.map((s) => s.toUpperCase());
    for (const [cw, ch, dpr] of [[891, 411, 2.6], [800, 360, 2], [740, 360, 3], [732, 360, 2]]) {
      const w = cw * dpr;
      const ctx = recordingCtx();
      ctx.measureText = (t) => ({ width: WIDTH_11[String(t)] * Number(/([\d.]+)px/.exec(ctx.font)[1]) / 11 });
      drawPersonalWeb(ctx, null, null, Object.assign({}, base, {
        width: w, height: ch * dpr, DPR: dpr, base: (ch - 92) * dpr, votRail: all, votX: (u) => (u / railSpan(all)) * w,
      }));
      const tag = cw + 'x' + ch;
      const names = ctx.texts.filter((t) => upper.includes(t.text));
      expect(names.map((t) => t.text).sort(), tag).toEqual(upper.slice().sort());
      const ys = [...new Set(names.map((t) => t.y))];
      expect(ys.length, tag).toBeLessThanOrEqual(2);
      for (const y of ys) {
        const row = names.filter((t) => t.y === y).map((t) => {
          const half = (WIDTH_11[t.text] * dpr) / 2;
          return { l: t.x - half, r: t.x + half, text: t.text };
        }).sort((p, q) => p.l - q.l);
        for (let i = 0; i < row.length; i++) {
          expect(row[i].l, tag + ' ' + row[i].text).toBeGreaterThanOrEqual(0);
          expect(row[i].r, tag + ' ' + row[i].text).toBeLessThanOrEqual(w);
          if (i) expect(row[i].l - row[i - 1].r, tag + ' ' + row[i - 1].text + ' | ' + row[i].text).toBeGreaterThanOrEqual(0.9 * 11 * dpr - 1e-6);
        }
      }
    }
  });
  it('w4 review: on a phone a reader\'s pin at the Volumes rail clears the lower row of names (its ring 5.5 px and its 1 px stroke under the baseline)', () => {
    // the first w4 rows sat 4 and 16 px over the rail: a pin's ring overprinted the F of
    // FLOCK and the tails of VOL III and VOL VI (the knockout cut it round the letters, but
    // the gold still touched them)
    const dpr = 2.6, w = 891 * dpr;
    const phone = Object.assign({}, base, { width: w, height: 411 * dpr, DPR: dpr, base: 319 * dpr, votX: (p) => (p / 20) * w });
    const personal = {
      count: 1, aRail: new Uint8Array([0]), bRail: new Uint8Array([1]),
      aPos: new Float32Array([20]), bPos: new Float32Array([4.5]), kind: new Uint8Array([2]),
    };
    const ctx = recordingCtx();
    const rails = drawPersonalWeb(ctx, personal, null, phone);
    const L = personalInk(1).link;
    const names = ctx.texts.filter((t) => t.text.startsWith('VOL '));
    expect(names.length).toBe(2);
    for (const t of names) expect(rails.topY - t.y, t.text).toBeGreaterThanOrEqual((L.ring + 1) * dpr);
    // and the second row still sits under the header (the rail at 78, its names within 20 px of it)
    for (const t of ctx.texts) expect(t.y).toBeGreaterThanOrEqual(rails.topY - 20 * dpr - 1e-6);
  });
  it('a reader\'s pin under a name never prints over it: the names are painted last, each over a knockout in the canvas ink (fix-review 2 #3)', () => {
    // on the phone the names sat 4 px over the rail (now 8) and a pin's ring is 5.5 px:
    // painted before the links, the gold covered "VOL I" and "REBUKE"
    const dpr = 2.6, w = 891 * dpr;
    const phone = Object.assign({}, base, {
      width: w, height: 411 * dpr, DPR: dpr, base: 319 * dpr, votX: (p) => (p / 20) * w,
    });
    // a link from Genesis to the middle of Vol I, right under its name
    const personal = {
      count: 1, aRail: new Uint8Array([0]), bRail: new Uint8Array([1]),
      aPos: new Float32Array([20]), bPos: new Float32Array([4.5]), kind: new Uint8Array([2]),
    };
    for (const [name, o] of /** @type {Array<[string, any]>} */ ([['phone', phone], ['PC', base]])) {
      const ctx = recordingCtx();
      drawPersonalWeb(ctx, personal, null, o);
      const at = (pred) => ctx.log.findIndex(pred);
      const lastPin = ctx.log.reduce((k, e, i) => (e[0] === 'arc' ? i : k), -1);
      const vol1 = at((e) => e[0] === 'fill' && e[1] === 'VOL I');
      const cut = at((e) => e[0] === 'knock' && e[1] === 'VOL I');
      expect(lastPin, name).toBeGreaterThan(-1);
      expect(vol1, name).toBeGreaterThan(lastPin);
      expect(cut, name).toBeGreaterThan(lastPin);
      expect(cut, name).toBeLessThan(vol1);
      const knock = ctx.log[cut];
      expect(knock[2], name).toBe(css('canvas'));
      expect(knock[3], name).toBeGreaterThanOrEqual(2 * o.DPR);
      // the name keeps its place and its ink
      const t = ctx.texts.find((x) => x.text === 'VOL I');
      expect(t.fill, name).toBe(css('volumesLabel'));
    }
  });
  it('no tick crosses a printed name, and every name sits inside the screen (fix-review #3)', () => {
    // the phone's band ticks ran 7 px over the rail, through its names (the
    // names' baseline sits 4 px over it); and a band cut by the left edge
    // centred its name over the sliver on screen, so "VOL I" printed past x = 0
    const dpr = 2.6, w = 891 * dpr;
    const phone = Object.assign({}, base, { width: w, height: 411 * dpr, DPR: dpr, base: 319 * dpr });
    const pc = base;
    // a rail of 200 letters: at the overview the letter ticks stand 12 px apart, under every name
    const dense = buildVotRail([
      { volKey: 'one', label: 'Volume One', short: 'Vol I', items: Array.from({ length: 100 }, (_, i) => ({ id: 'l' + i, title: 'Letter ' + i })) },
      { volKey: 'two', label: 'Volume Two', short: 'Vol II', items: Array.from({ length: 100 }, (_, i) => ({ id: 'm' + i, title: 'Letter ' + i })) },
    ]);
    const crowded = buildVotRail(Array.from({ length: 40 }, (_, k) => ({
      volKey: 'c' + k, label: 'VOL C' + String(k).padStart(2, '0'), short: 'VOL C' + String(k).padStart(2, '0'), items: [{ id: 'x' + k, title: 'X' }],
    })));
    const frames = /** @type {Array<[string, any]>} */ ([
      ['phone, overview', Object.assign({}, phone, { votX: (p) => (p / 20) * w })],
      ['phone, dense ticks', Object.assign({}, phone, { votRail: dense, votX: (p) => (p / 200) * w })],
      // names a little wider than their bands (the fake measures 7 px a glyph): each overhangs a neighbour's tick
      ['phone, crowded', Object.assign({}, phone, { votRail: crowded, votX: (p) => (p / 40) * w })],
      ['phone, Vol I cut by the left edge', Object.assign({}, phone, { votX: (p) => (p - 10) * (w / 8) + 12 * dpr })],
      ['phone, Vol II cut by the right edge', Object.assign({}, phone, { votX: (p) => (p - 10) * (w / 8) + w - 12 * dpr })],
      ['PC, overview', pc],
      ['PC, dense ticks', Object.assign({}, pc, { votRail: dense, votX: (p) => (p / 200) * W })],
      ['PC, Vol I cut by the left edge', Object.assign({}, pc, { votX: (p) => (p - 10) * (W / 8) + 12 })],
    ]);
    for (const [name, o] of frames) {
      const ctx = segmentCtx();
      drawPersonalWeb(ctx, null, null, o);
      const names = ctx.texts.filter((t) => t.text.startsWith('VOL '));
      expect(names.length, name).toBeGreaterThan(0);
      for (const t of names) {
        expect(t.left, `${name}: ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${name}: ${t.text}`).toBeLessThanOrEqual(o.width);
        for (const [x1, y1, x2, y2] of ctx.ticks) {
          const crossesX = Math.max(x1, x2) >= t.left && Math.min(x1, x2) <= t.right;
          const crossesY = Math.max(y1, y2) > t.y - t.size && Math.min(y1, y2) < t.y;
          expect(crossesX && crossesY, `${name}: a tick at ${x1.toFixed(0)} crosses ${t.text}`).toBe(false);
        }
      }
    }
  });
});

/** A context recording each stroke's style, width and the points of its path. @returns {any} */
function pathCtx() {
  const ctx = recordingCtx();
  let path = [];
  ctx.beginPath = () => { path = []; };
  ctx.moveTo = (x, y) => { path.push([x, y]); };
  ctx.lineTo = (x, y) => { path.push([x, y]); };
  ctx.stroke = () => { ctx.strokes.push({ style: ctx.strokeStyle, width: ctx.lineWidth, path: path.slice() }); };
  return ctx;
}
/** Distance from a point to a polyline. */
function distTo(line, p) {
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
/** The sharpest turn between consecutive segments of a polyline, degrees. */
function turnOf(pts) {
  let worst = 0;
  for (let i = 2; i < pts.length; i++) {
    const h1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
    const h2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    let d = Math.abs(h2 - h1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
}

/** A context recording the tick segments (volumesTick strokes) and each name's box. @returns {any} */
function segmentCtx() {
  const ticks = [], texts = [];
  let path = [];
  const st = { strokeStyle: '', font: '', letterSpacing: '0px' };
  const noop = () => {};
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(st.font)[1]);
  const spacing = () => parseFloat(st.letterSpacing) || 0;
  return {
    ticks, texts,
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get letterSpacing() { return st.letterSpacing; }, set letterSpacing(v) { st.letterSpacing = v; },
    lineWidth: 0, fillStyle: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath() { path = []; }, moveTo(x, y) { path.push([[x, y]]); }, lineTo(x, y) { path[path.length - 1].push([x, y]); },
    arc: noop, fill: noop, clearRect: noop, save: noop, restore: noop, strokeText: noop,
    stroke() {
      if (st.strokeStyle !== css('volumesTick')) return;
      for (const sub of path) for (let i = 1; i < sub.length; i++) ticks.push([sub[i - 1][0], sub[i - 1][1], sub[i][0], sub[i][1]]);
    },
    measureText: (t) => ({ width: String(t).length * (7 + spacing()) }),
    fillText(t, x, y) {
      const wd = String(t).length * (7 + spacing());
      texts.push({ text: String(t), x, y, size: size(), left: x - wd / 2, right: x + wd / 2 });
    },
  };
}
