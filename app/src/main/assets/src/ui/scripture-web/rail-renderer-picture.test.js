/* rail-renderer — the w3 picture (the r2-05 mockup; spec §3 and §4.2, Q3, Q8).

   P1  the rails sit where the spec puts them: the Volumes rail 150 CSS px
       from the top on a PC, 62 on a phone, never below 0.4 of the baseline.
   P2  a line's ink follows the rails it is anchored to on screen: the
       overview is one ink (personalInk(1)), a thread whose foot sits on a
       zoomed rail takes that rail's depth, a thread whose only foot on screen
       is on the unzoomed rail keeps the overview's ink (so zooming the Bible
       does not brighten the whole field: C13 / C14), and a fly-over (no foot
       on screen, Q3 ii) draws at FLYOVER_LEG_WIDTH of its width, alpha kept.
   P3  a chosen link recedes the rest to TAP_CONTEXT, never further.
   P4  the Volumes rail's type: sw-ink's face, 13 / 11 px tracked caps in the
       volumesLabel ink, the rail in volumesRail, and the overline "THE
       VOLUMES OF TRUTH" on a PC only; the phone's names keep one row. */
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { drawPersonalWeb, personalInk, railFrame } from './rail-renderer.js';
import { css, FONT, TAP_CONTEXT, FLYOVER_LEG_WIDTH } from '../../utils/scripture-web/sw-ink.js';

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
  const strokes = [], texts = [];
  const st = { strokeStyle: '', lineWidth: 0, font: '', fillStyle: '', letterSpacing: '0px' };
  const noop = () => {};
  return {
    strokes, texts,
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get letterSpacing() { return st.letterSpacing; }, set letterSpacing(v) { st.letterSpacing = v; },
    textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, clearRect: noop, save: noop, restore: noop,
    stroke() { strokes.push({ style: st.strokeStyle, width: st.lineWidth }); },
    measureText: (t) => ({ width: String(t).length * 7 }),
    fillText(t, x, y) { texts.push({ text: String(t), x, y, font: st.font, fill: st.fillStyle, spacing: st.letterSpacing }); },
  };
}
const alphaOf = (style) => Number(/,\s*([\d.]+)\)$/.exec(style)[1]);
/** The context's strokes: the ones in a Timothy source colour (not the rails, ticks or links). */
function contextStrokes(ctx) {
  return ctx.strokes.filter((s) => /^rgba\((127,179,176|94,156,154|163,196,193|108,143,168),/.test(s.style));
}

describe('P1 the rails sit where the spec puts them', () => {
  it('the Volumes rail is 150 CSS px down on a PC and 62 on a phone; the Bible rail keeps the baseline', () => {
    expect(railFrame({ H: 900, DPR: 1 }, 508)).toEqual({ topY: 150, bottomY: 508 });
    const phone = railFrame({ H: 411 * 2.6, DPR: 2.6 }, 319 * 2.6);
    expect(phone.topY).toBeCloseTo(62 * 2.6, 6);
    expect(phone.bottomY).toBeCloseTo(319 * 2.6, 6);
    // a frame too short for the spec's place keeps the rail above 0.4 of the baseline
    expect(railFrame({ H: 600, DPR: 1 }, 300).topY).toBe(120);
  });
  it('the Volumes rail clears the top chrome whatever its height: its names never print under the header', () => {
    // a phone header that ends at 60 CSS px (the spec's ends at 50): the names need 12 px over the rail
    const dpr = 2.6;
    const tall = railFrame({ H: 411 * dpr, DPR: dpr, inset: 60 * dpr }, 319 * dpr);
    expect(tall.topY).toBeCloseTo(72 * dpr, 6);
    // the spec's own header (to 50) leaves the spec's place (62)
    expect(railFrame({ H: 411 * dpr, DPR: dpr, inset: 50 * dpr }, 319 * dpr).topY).toBeCloseTo(62 * dpr, 6);
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
  it('a fly-over (no foot on screen) keeps its alpha and draws at FLYOVER_LEG_WIDTH of its width', () => {
    // both rails zoomed 10x: the line from verse 2 to Volumes position 18 crosses the screen with both feet off it
    const deep = Object.assign({}, base, { verseX: (v) => 500 + (v - 50) * 100, votX: (p) => 500 + (p - 10) * 500 });
    const u = { count: 1, versePos: new Float32Array([2]), votPos: new Float32Array([18]), source: new Uint8Array([3]) };
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, u, deep);
    const cs = contextStrokes(ctx);
    expect(cs.length).toBe(1);
    expect(alphaOf(cs[0].style)).toBeCloseTo(overview.alpha, 6);
    expect(cs[0].width).toBeCloseTo(overview.width * FLYOVER_LEG_WIDTH, 6);
  });
});

describe('P3 a chosen link recedes the rest to TAP_CONTEXT', () => {
  it('the other links and Timothy\'s threads drop to 0.30 of their ink; the chosen one keeps all of it', () => {
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
    // one row only: a crowded rail whose names take two rows on a PC keeps one on the phone
    // (the fake measures 7 px a glyph: names a little wider than their bands, so neighbours collide)
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
    expect(phone.length).toBeGreaterThan(0);
    expect(phone.length).toBeLessThan(40);
    expect(new Set(phone.map((t) => t.y)).size).toBe(1);
    expect(phone[0].y).toBeCloseTo(58 * dpr, 6);           // spec §3: names 46-58, under the chrome's 50
  });
});
