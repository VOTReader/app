// @ts-nocheck
/* The label engine (w3 canvas stream, digest C2): the face, the measure
   cache, the collision grid and the ranked placement with hysteresis. */
import { describe, it, expect, vi } from 'vitest';
import {
  TEXT_MIN_CSS, WEB_FACE, WEB_FONT_URL, canvasFont, fontPx, setFont, createMeasure, boxesMeet, createGrid, placeRanked, ensureWebFont,
} from './label-engine.js';

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

describe('the face', () => {
  it('never under 12 CSS px, at full DPR, the shipped face first', () => {
    expect(TEXT_MIN_CSS).toBe(12);
    expect(canvasFont(10, 2)).toBe("24px 'SW Garamond', 'EB Garamond', Georgia, serif");
    expect(canvasFont(16, 2.6, 600)).toBe("600 41.6px 'SW Garamond', 'EB Garamond', Georgia, serif");
    expect(fontPx(11.5, 1)).toBe(12);
    expect(fontPx(28, 2)).toBe(56);
    expect(WEB_FACE).toBe('SW Garamond');
  });
  it('the face is the file the app ships, same origin: no network font', () => {
    expect(WEB_FONT_URL).toBe('fonts/eb-garamond-latin-wght-normal.woff2');
    expect(WEB_FONT_URL).not.toMatch(/^https?:|^\/\//);
  });
  it('registering it is a no-op where there is no FontFace (jsdom, node)', () => {
    expect(ensureWebFont()).toBe(false);
  });
  it('tracking is set only where the context has it', () => {
    const plain = { font: '' };
    setFont(plain, '12px x', 3);
    expect(plain).toEqual({ font: '12px x' });
    const tracked = { font: '', letterSpacing: '0px' };
    setFont(tracked, '12px x', 1.234);
    expect(tracked.letterSpacing).toBe('1.23px');
  });
});

/** A FontFace that loads at once and a document.fonts whose ready resolves when told, on a fresh module. */
async function withFace(run) {
  vi.resetModules();
  const added = [];
  let resolveReady = () => {};
  const ready = new Promise((r) => { resolveReady = r; });
  globalThis.FontFace = class {
    constructor(family) { this.family = family; this.status = 'unloaded'; }
    load() { this.status = 'loaded'; return Promise.resolve(this); }
  };
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: (f) => added.push(f), ready } });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  try {
    await run({ added, resolveReady, settle });
  } finally {
    delete globalThis.FontFace;
    delete document.fonts;
    vi.resetModules();
  }
}

describe('the face arriving', () => {
  it('tells each subscriber once, though both the face and document.fonts.ready resolve; one that unsubscribed hears nothing (w3 review: done ran twice, the callback held in a module global)', async () => {
    await withFace(async ({ added, resolveReady, settle }) => {
      const le = await import('./label-engine.js');
      const a = vi.fn(), b = vi.fn(), gone = vi.fn();
      const offA = le.onWebFontReady(a);
      le.onWebFontReady(b);
      const offGone = le.onWebFontReady(gone);
      offGone();
      expect(le.ensureWebFont()).toBe(false);
      expect(le.ensureWebFont()).toBe(false);
      expect(added.length, 'the face is registered once').toBe(1);
      await settle();
      resolveReady();
      await settle();
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      expect(gone).not.toHaveBeenCalled();
      expect(le.webFontReady()).toBe(true);
      expect(le.ensureWebFont()).toBe(true);
      offA();
    });
  });
});

describe('the measure cache', () => {
  it('measures a string once per context and font, and starts over when cleared', () => {
    let calls = 0;
    const ctx = { font: '', measureText: (t) => { calls++; return { width: t.length * 5 }; } };
    const m = createMeasure();
    expect(m.width(ctx, '12px a', 'Isaiah')).toBe(30);
    expect(m.width(ctx, '12px a', 'Isaiah')).toBe(30);
    expect(calls).toBe(1);
    m.width(ctx, '14px a', 'Isaiah');
    expect(calls).toBe(2);
    const other = { font: '', measureText: (t) => { calls++; return { width: t.length }; } };
    expect(m.width(other, '12px a', 'Isaiah')).toBe(6);
    expect(m.size).toBe(3);
    m.clear();
    expect(m.size).toBe(0);
    m.width(ctx, '12px a', 'Isaiah');
    expect(calls).toBe(4);
  });
  it('a tracked width ends at the last glyph, not after its gap', () => {
    const ctx = { font: '', letterSpacing: '0px', measureText: (t) => ({ width: t.length * 5 + t.length * parseFloat(ctx.letterSpacing) }) };
    expect(createMeasure().width(ctx, '12px a', 'GEN', 2)).toBe(15 + 6 - 2);
  });
  it('is bounded', () => {
    const ctx = { font: '', measureText: () => ({ width: 1 }) };
    const m = createMeasure(10);
    for (let i = 0; i < 25; i++) m.width(ctx, 'f', 't' + i);
    expect(m.size).toBeLessThanOrEqual(10);
  });
});

describe('the collision grid', () => {
  it('finds a box that meets one added, across cell edges, and honours the pad', () => {
    const grid = createGrid(64);
    grid.add(box(60, 60, 70, 70));
    expect(grid.hits(box(65, 65, 66, 66))).toBe(true);
    expect(grid.hits(box(71, 60, 80, 70))).toBe(false);
    expect(grid.hits(box(71, 60, 80, 70), 2)).toBe(true);
    expect(grid.hits(box(-500, -500, -400, -400))).toBe(false);
    expect(grid.count).toBe(1);
  });
  it('a test may pass over some boxes (the band reads the padded corner zones at their own edge, w4)', () => {
    const grid = createGrid(64);
    const zone = box(100, 100, 140, 140), label = box(10, 100, 60, 110);
    grid.add(zone);
    grid.add(label);
    const q = box(66, 100, 96, 110);
    expect(grid.hits(q, 8)).toBe(true);
    expect(grid.hits(q, 8, (b) => b === zone)).toBe(true);
    expect(grid.hits(q, 8, (b) => b === zone || b === label)).toBe(false);
    expect(grid.hits(box(120, 120, 125, 125), 0, (b) => b === zone)).toBe(false);
  });
  it('agrees with a brute-force check on random boxes', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const grid = createGrid(48);
    const all = [];
    for (let i = 0; i < 300; i++) {
      const x = rnd() * 2000 - 200, y = rnd() * 900, b = box(x, y, x + rnd() * 120, y + rnd() * 30);
      grid.add(b);
      all.push(b);
    }
    for (let i = 0; i < 300; i++) {
      const x = rnd() * 2000 - 200, y = rnd() * 900, q = box(x, y, x + rnd() * 120, y + rnd() * 30);
      expect(grid.hits(q, 3)).toBe(all.some((b) => boxesMeet(q, b, 3)));
    }
  });
});

describe('ranked placement with hysteresis', () => {
  const run = (cands, memory) => {
    const grid = createGrid();
    return placeRanked(cands, memory, (b) => !grid.hits(b), (b) => grid.add(b));
  };
  it('the stronger tier and the higher score take the contested slot', () => {
    const slot = box(0, 0, 50, 10);
    const res = run([
      { key: 'a', tier: 2, score: 99, slots: [slot] },
      { key: 'b', tier: 1, score: 1, slots: [slot] },
      { key: 'c', tier: 1, score: 5, slots: [slot] },
    ], null);
    expect(res.placed.map((p) => p.cand.key)).toEqual(['c']);
  });
  it('a label placed last frame keeps its thread and its slot over a stronger newcomer of its tier', () => {
    const s0 = box(0, 0, 50, 10), s1 = box(0, 20, 50, 30);
    const first = run([{ key: 'old', tier: 1, score: 1, slots: [s0, s1] }], new Map([['old', 1]]));
    expect(first.placed[0].slot).toBe(1);
    const next = run([
      { key: 'new', tier: 1, score: 50, slots: [s1] },
      { key: 'old', tier: 1, score: 1, slots: [s0, s1] },
    ], first.memory);
    expect(next.placed.map((p) => [p.cand.key, p.slot])).toEqual([['old', 1]]);
  });
  it('slots may be built lazily, once per candidate tried', () => {
    let built = 0;
    const lazy = (key, b) => ({ key, tier: 1, score: 0, slots: () => { built++; return [b]; } });
    const res = run([lazy('x', box(0, 0, 10, 10)), lazy('y', box(20, 0, 30, 10)), { key: 'z', tier: 1, score: 0, slots: [null] }], null);
    expect(built).toBe(2);
    expect(res.placed.map((p) => p.cand.key).sort()).toEqual(['x', 'y']);
  });
});
