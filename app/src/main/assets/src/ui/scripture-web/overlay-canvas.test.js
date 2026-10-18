// @ts-nocheck
/* The canvas stream (w3): the overlay's wayfinding on the real asset, read
   off a recording 2D context. The deep-zoom ruler (r3-03), the overview's
   names (r2-01a), the cited strip (Q1 a), the centre chapter (§4.4), the
   hit boxes the tap path reads (hitOverlay), and the label engine fed from
   the frame (digest C2, item 3). */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as geo from '../../utils/scripture-web/geometry.js';
import * as dec from '../../utils/scripture-web/decode.js';
import { footBundles, lensRange, labelFeed } from '../../utils/scripture-web/pick.js';
import { webFrame, webViewArgs, centreOf } from '../../utils/scripture-web/web-frame.js';
import { citationsForVerse } from '../../utils/scripture-web/vot-citations.js';
import { css, TAP_CONTEXT } from '../../utils/scripture-web/sw-ink.js';
import { paintCanonOverlay, hitOverlay, stackRows, citedVerses, chipKeepers, DEEP_FULL, LABEL_RECEDE } from './overlay-renderer.js';

vi.setConfig({ testTimeout: 60000 });

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const g = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));

const bookIndex = (prefix) => g.books.findIndex((b) => b.id === prefix || b.id.startsWith(prefix + '-'));
const verseOf = (prefix, chapter, verse) => {
  const bi = bookIndex(prefix);
  const c = g.chapters.find((ch) => ch[0] === bi && ch[1] === chapter);
  return c[2] + verse - 1;
};
const ISA = bookIndex('isaiah');
const ISA53_6 = verseOf('isaiah', 53, 6);

const FRAMES = {
  pc: { W: 1600, H: 900, DPR: 1 },
  phone: { W: Math.round(891 * 2.6), H: Math.round(411 * 2.6), DPR: 2.6 },
};

/** A 2D context that records what is drawn; text is 0.5 em a glyph plus the tracking. */
function recorder(canvas = null) {
  const calls = [];
  const state = { font: '10px serif', letterSpacing: '0px', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter' };
  const stack = [];
  const ctx = Object.assign(Object.create(null), state, {
    canvas,
    save() { stack.push(Object.fromEntries(Object.keys(state).map((k) => [k, ctx[k]]))); },
    restore() { const s = stack.pop(); if (s) Object.assign(ctx, s); },
    measureText(t) { return { width: textWidth(ctx, t) }; },
    fillText(t, x, y) { calls.push({ op: 'fillText', t: String(t), x, y, font: ctx.font, align: ctx.textAlign, base: ctx.textBaseline, alpha: ctx.globalAlpha, fill: ctx.fillStyle, w: textWidth(ctx, t) }); },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h, fill: ctx.fillStyle }); },
    createLinearGradient() { return { addColorStop() {} }; },
  });
  for (const k of ['clearRect', 'strokeText', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'fill', 'stroke']) ctx[k] = (...a) => calls.push({ op: k, a });
  ctx.fill = (...a) => calls.push({ op: 'fill', a, fill: ctx.fillStyle, alpha: ctx.globalAlpha });
  return { ctx, calls, texts: () => calls.filter((c) => c.op === 'fillText') };
}
function fontPxOf(font) { return parseFloat(/([\d.]+)px/.exec(font)[1]); }
function textWidth(ctx, t) {
  const n = String(t).length;
  return (0.5 * fontPxOf(ctx.font) + (parseFloat(ctx.letterSpacing) || 0)) * n;
}
/** A drawn text's box (device px), from its alignment. */
function textBox(c) {
  const x0 = c.align === 'center' ? c.x - c.w / 2 : c.align === 'right' ? c.x - c.w : c.x;
  return { x0, x1: x0 + c.w };
}

function frameAt(name, zoom, verse, extra = {}) {
  const v = FRAMES[name];
  const cam = geo.createCamera(g.total);
  cam.ppv = geo.fitPPV(cam, v.W) * zoom;
  cam.x = verse;
  cam.y = 0;
  const f = webFrame(v, false);
  const view = webViewArgs(v, cam, f, 'famous', Object.assign({ arc: -1, range: null, hover: null, lit: null }, extra.focus || {}));
  const lens = lensRange(g, cam, v.W);
  const fs = {
    g, cam, view, v, chrome: { bg: '#000000', fsRuler: 13, fsLabel: 13 }, canvasH: v.H, inset: extra.inset == null ? 56 * v.DPR : extra.inset,
    yFrame: { base: f.base, ceil: f.ceil, squash: view.squash, maxSpan: dec.maxSpanOf(g) },
    density: 'famous', focusArc: view.focusArc, bundles: { cells: footBundles(g, cam, view, v.DPR) }, lens, lensDim: 1,
    centre: centreOf(g, lens, zoom), panelInset: extra.panelInset || null, hits: [],
  };
  return fs;
}
function paint(name, zoom, verse, extra) {
  const fs = frameAt(name, zoom, verse, extra);
  const rec = recorder(extra && extra.canvas);
  const out = paintCanonOverlay(rec.ctx, fs);
  fs.hits = out.hits;
  return { fs, rec, out };
}
const zMax = (name) => geo.maxZoomFor(g.total, FRAMES[name].W / FRAMES[name].DPR);

describe('stackRows: the ruler stacks keep every row and close the gaps first', () => {
  const rows = [{ k: 'a', top: 4, h: 5 }, { k: 'b', top: 12, h: 30, min: 10 }, { k: 'c', top: 52, h: 9 }];
  it('lays the natural stack where it fits', () => {
    const st = stackRows(rows, 62, 100);
    expect(st.a).toEqual({ top: 4, h: 5 });
    expect(st.b).toEqual({ top: 12, h: 30 });
    expect(st.c).toEqual({ top: 52, h: 9 });
    expect(st.end).toBe(62);
  });
  it('a short band closes the gaps, then the flexible row gives height; rows stay in order and apart', () => {
    for (const avail of [55, 45, 30]) {
      const st = stackRows(rows, 62, avail);
      expect(st.a.top + st.a.h).toBeLessThanOrEqual(st.b.top);
      expect(st.b.top + st.b.h).toBeLessThanOrEqual(st.c.top);
      expect(st.b.h).toBeGreaterThanOrEqual(10);
      if (avail >= 30) expect(st.end).toBeLessThanOrEqual(avail + 1e-9);
    }
  });
});

describe('the cited strip marks exactly the verses the panel lists citations for (Q1 a)', () => {
  it('a verse is cited iff citationsForVerse lists something for it', () => {
    const { pre, count } = citedVerses(g);
    expect(count, 'the asset carries cited verses').toBeGreaterThan(100);
    const sample = [];
    for (let x = 0; x < g.total; x += 13) sample.push(x);
    const c53 = g.chapters.find((ch) => ch[0] === ISA && ch[1] === 53);
    for (let x = c53[2]; x < c53[2] + c53[3]; x++) sample.push(x);
    for (const x of sample) expect(pre[x + 1] - pre[x] > 0, 'verse ' + x).toBe(citationsForVerse(g, x, null).length > 0);
  });
  /* w3 review (major): one solid tick on every pixel column holding any cited verse saturated -
     3,367 of 31,102 verses are cited, and at the PC overview 85 % of the New Testament's columns
     were lit at the full ink, a continuous gold rule from Matthew to Revelation where r2-01a (and
     the states checklist, #1) asks for a sparse strip. Every cited verse still leaves a mark, but a
     column's ink follows how much of it is cited: one verse in nineteen is faint, the clusters
     stand out. */
  it("at the overview a column's ink follows how much of it is cited: one verse in nineteen is faint, the New Testament is not a solid rule", () => {
    const { pre } = citedVerses(g);
    const full = css('cited').match(/rgba\(196,164,105,([\d.]+)\)/);
    const inkA = Number(full[1]);
    for (const name of ['pc', 'phone']) {
      const { rec, fs } = paint(name, 1, g.total / 2);
      const W = fs.v.W, s = fs.v.DPR;
      const top = fs.view.base + (name === 'pc' ? 4 : 3) * s;
      // each strip column's alpha (the rects of one path take the fill that closes it)
      const colA = new Float64Array(W);
      let pending = [];
      for (const c of rec.calls) {
        if (c.op === 'beginPath') pending = [];
        else if (c.op === 'rect' && Math.abs(c.a[1] - top) < 1e-6) pending.push(c.a);
        else if (c.op === 'fill' && pending.length) {
          const m = String(c.fill).match(/^rgba\(196,164,105,([\d.]+)\)$/);
          if (m) for (const [x, , w] of pending) for (let k = Math.round(x); k < Math.round(x + w); k++) colA[k] = Number(m[1]) / inkA;
          pending = [];
        }
      }
      const mt = verseOf('matthew', 1, 1);
      let ntCols = 0, ntStrong = 0, lit = 0, drawn = 0;
      const rows = [];
      for (let c = 0; c < W; c++) {
        const lo = Math.max(0, Math.floor(geo.xToVerse(fs.cam, W, c))), hi = Math.min(g.total, Math.ceil(geo.xToVerse(fs.cam, W, c + 1)));
        const n = pre[hi] - pre[lo];
        if (n > 0) lit++;
        if (colA[c] > 0) drawn++;
        expect(colA[c] > 0, name + ': column ' + c + ' holds ' + n + ' cited verses').toBe(n > 0);
        if (n > 0) rows.push({ d: n / (hi - lo), a: colA[c], n, m: hi - lo });
        if (lo >= mt) { ntCols++; if (colA[c] >= 0.5) ntStrong++; }
      }
      expect(drawn, name + ': every column with a cited verse is marked').toBe(lit);
      // the ink rises with the share of the column that is cited
      rows.sort((p, q) => p.d - q.d);
      for (let k = 1; k < rows.length; k++) expect(rows[k].a, name + ' at density ' + rows[k].d.toFixed(3)).toBeGreaterThanOrEqual(rows[k - 1].a - 1e-9);
      // one cited verse in a column of many is faint; the densest columns take the full ink
      for (const r of rows) if (r.n === 1 && r.m >= 10) expect(r.a, name + ': 1 of ' + r.m).toBeLessThanOrEqual(0.35);
      expect(rows[rows.length - 1].a, name + ': the densest column').toBeCloseTo(1, 6);
      // the New Testament reads as clusters, not a rule
      expect(ntStrong / ntCols, name + ': ' + ntStrong + ' of ' + ntCols + ' NT columns at half the ink or more').toBeLessThan(0.45);
    }
  });

  it('the overview paints the strip in the cited gold, one run per lit pixel column', () => {
    const { rec } = paint('pc', 1, g.total / 2);
    const fills = rec.calls.filter((c) => c.op === 'fill');
    expect(fills.length).toBeGreaterThan(0);
    // the strip is a path of rects under the baseline; at least a few dozen columns are lit
    const rects = rec.calls.filter((c) => c.op === 'rect');
    expect(rects.length).toBeGreaterThan(30);
  });
});

describe('the overview ruler (r2-01a)', () => {
  for (const name of ['pc', 'phone']) {
    it(name + ': every book name is wholly on the frame, none overlaps another, the majors are named', () => {
      const { rec, fs, out } = paint(name, 1, g.total / 2);
      const names = new Set(g.books.flatMap((b) => [String(b.title).toUpperCase(), String(b.abbr).toUpperCase()]));
      const drawn = rec.texts().filter((c) => names.has(c.t));
      expect(drawn.length).toBeGreaterThan(20);
      for (const c of drawn) {
        const b = textBox(c);
        expect(b.x0, c.t + ' starts on the frame').toBeGreaterThanOrEqual(0);
        expect(b.x1, c.t + ' ends on the frame').toBeLessThanOrEqual(fs.v.W);
      }
      for (let i = 0; i < drawn.length; i++) {
        for (let j = i + 1; j < drawn.length; j++) {
          if (drawn[i].y !== drawn[j].y) continue;
          const a = textBox(drawn[i]), b = textBox(drawn[j]);
          expect(a.x1 <= b.x0 || b.x1 <= a.x0, drawn[i].t + ' / ' + drawn[j].t).toBe(true);
        }
      }
      const texts = drawn.map((c) => c.t);
      for (const major of ['GENESIS', 'ISAIAH', 'REVELATION']) {
        expect(texts.some((t) => t === major || g.books.some((b) => String(b.abbr).toUpperCase() === t && String(b.title).toUpperCase() === major)), major).toBe(true);
      }
      // each named book is a tap target
      expect(out.hits.filter((h) => h.hit.kind === 'book').length).toBe(drawn.length);
    });
  }

  it('no name is printed under a corner button (#20): the zones come from the screen root', () => {
    const v = FRAMES.phone, s = v.DPR;
    const root = { className: 'sw-root', offsetParent: null };
    const el = (left, top, w, h) => ({ offsetLeft: left, offsetTop: top, offsetWidth: w, offsetHeight: h, offsetParent: root });
    const els = { '.sw-hide-all': el(891 - 14 - 44, 411 - 8 - 44, 44, 44), '.sw-guide-btn': el(891 - 76 - 44, 411 - 8 - 44, 44, 44) };
    root.querySelector = (sel) => els[sel] || null;
    const canvas = { closest: () => root, offsetLeft: 0, offsetTop: 0, offsetParent: root };
    const { rec, fs } = paint('phone', 1, g.total / 2, { canvas });
    const zone = { x0: (891 - 76 - 44 - 8) * s, x1: v.W, y0: (411 - 8 - 44 - 8) * s, y1: v.H };
    const names = new Set(g.books.flatMap((b) => [String(b.title).toUpperCase(), String(b.abbr).toUpperCase()]));
    const drawn = rec.texts().filter((c) => names.has(c.t));
    expect(drawn.length).toBeGreaterThan(20);
    for (const c of drawn) {
      const b = textBox(c);
      const top = c.y - fontPxOf(c.font) * 0.7;
      const meets = b.x0 < zone.x1 && b.x1 > zone.x0 && top < zone.y1 && c.y > zone.y0;
      expect(meets, c.t + ' under the corner buttons').toBe(false);
    }
    // the right end is still named, on the row the buttons leave free
    expect(drawn.some((c) => textBox(c).x1 > fs.v.W * 0.95), 'a name at the right end').toBe(true);
  });

  it('the panel docking moves the corner buttons, and the very next frame keeps the text off them (w3 review: the 500 ms cache keyed on size and class)', () => {
    const v = FRAMES.phone, s = v.DPR, panel = 300;
    for (const zoom of [1, 40]) {
      const root = { className: 'sw-root', offsetParent: null };
      const el = (left, top, w, h) => ({ offsetLeft: left, offsetTop: top, offsetWidth: w, offsetHeight: h, offsetParent: root });
      const at = (dx) => ({ '.sw-hide-all': el(891 - dx - 14 - 44, 411 - 8 - 44, 44, 44), '.sw-guide-btn': el(891 - dx - 76 - 44, 411 - 8 - 44, 44, 44) });
      let els = at(0);
      root.querySelector = (sel) => els[sel] || null;
      const canvas = { closest: () => root, offsetLeft: 0, offsetTop: 0, offsetParent: root };
      paint('phone', zoom, ISA53_6, { canvas });
      // the panel docks on the right and the buttons move left with it; the frame right after
      els = at(panel);
      const { rec } = paint('phone', zoom, ISA53_6, { canvas, panelInset: { right: panel, bottom: 0 } });
      const zone = { x0: (891 - panel - 76 - 44 - 8) * s, x1: (891 - panel - 14 + 8) * s, y0: (411 - 8 - 44 - 8) * s, y1: v.H };
      const drawn = rec.texts().filter((c) => /^[0-9A-Z]+$/.test(c.t));
      expect(drawn.length, zoom + 'x').toBeGreaterThan(5);
      for (const c of drawn) {
        const b = textBox(c);
        const top = c.y - fontPxOf(c.font) * 0.7;
        const meets = b.x0 < zone.x1 && b.x1 > zone.x0 && top < zone.y1 && c.y > zone.y0;
        expect(meets, zoom + 'x: ' + c.t + ' under the moved corner buttons').toBe(false);
      }
    }
  });

  it('the top scrim is painted behind the header while the chrome shows, and not when it is hidden', () => {
    const shown = paint('pc', 1, g.total / 2);
    const hidden = paint('pc', 1, g.total / 2, { inset: 0 });
    const firstRect = (rec) => rec.calls.find((c) => c.op === 'rect');
    expect(firstRect(shown.rec).a.slice(0, 2)).toEqual([0, 0]);
    expect(firstRect(shown.rec).a[3]).toBeGreaterThanOrEqual(104);
    expect(firstRect(hidden.rec).a[1]).toBeGreaterThan(0);
  });
});

describe('the deep band (r3-03): chapter numerals, verse ticks and numerals, the sticky book', () => {
  it('pc 40x on Isaiah 53: the chapter numerals are the primary mark, 53 in gold, the frame inside Isaiah says so at the left edge', () => {
    const { rec, out, fs } = paint('pc', 40, ISA53_6);
    const t = rec.texts();
    const n53 = t.filter((c) => c.t === '53');
    expect(n53.length, 'chapter 53 is numbered').toBe(1);
    expect(fontPxOf(n53[0].font), 'at the spec size').toBe(28);
    expect(n53[0].fill, 'the centre chapter in gold').toBe('rgb(196,164,105)');
    const others = t.filter((c) => /^\d+$/.test(c.t) && c.t !== '53' && fontPxOf(c.font) === 28);
    expect(others.length, 'other chapters numbered').toBeGreaterThan(2);
    for (const c of others) expect(c.fill, c.t + ' plain').toBe(css('chapterNumeral'));
    expect(t.some((c) => c.t === '‹'), 'the sticky arrow').toBe(true);
    expect(t.some((c) => c.t === 'ISAIAH'), 'the sticky name').toBe(true);
    expect(t.some((c) => c.t === 'JEREMIAH' || c.t === 'JER'), 'the next book named at its start').toBe(true);
    // the numeral is a tap target that names its chapter
    const box = out.hits.find((h) => h.hit.kind === 'chapter' && h.hit.chapter === 53);
    expect(box && box.hit.book).toBe(ISA);
    const hit = hitOverlay(fs, (box.x0 + box.x1) / 2 / fs.v.DPR, (box.y0 + box.y1) / 2 / fs.v.DPR);
    expect(hit).toEqual({ kind: 'chapter', book: ISA, chapter: 53 });
  });

  it('phone 300x on Isaiah 53: verse numerals every 5th, later every verse; no text under 12 CSS px anywhere', () => {
    for (const [zoom, every] of [[300, 5], [zMax('phone'), 1]]) {
      const { rec, fs } = paint('phone', zoom, ISA53_6);
      const s = fs.v.DPR;
      const t = rec.texts();
      for (const c of t) expect(fontPxOf(c.font) / s, c.t + ' at ' + zoom + 'x').toBeGreaterThanOrEqual(12 - 1e-9);
      const vnums = t.filter((c) => c.align === 'center' && /^\d+$/.test(c.t) && Math.abs(fontPxOf(c.font) - 12 * s) < 1e-6);
      expect(vnums.length, 'verse numerals at ' + zoom + 'x').toBeGreaterThan(0);
      if (every === 5) for (const c of vnums) expect(Number(c.t) % 5, c.t).toBe(0);
      else expect(vnums.some((c) => Number(c.t) % 5 !== 0)).toBe(true);
    }
  });

  it('the next book is announced at the right when it starts within a frame width', () => {
    // the last verses of Malachi: Matthew is just past the right edge
    const end = verseOf('matthew', 1, 1) - 1;
    const v = FRAMES.pc;
    const zoom = 40;
    const ppv = geo.fitPPV({ total: g.total }, v.W) * zoom;
    const { rec } = paint('pc', zoom, end - (v.W * 0.55) / ppv);
    const t = rec.texts();
    expect(t.some((c) => c.t === '›'), 'the right arrow').toBe(true);
    expect(t.some((c) => c.t === 'MATTHEW')).toBe(true);
  });

  it('the sticky names black fade: no numeral under its solid part, the numerals beside it drawn over it, and the gold wash over it (w3 review: ghosted numerals, a dark box in the wash)', () => {
    const malachiEnd = verseOf('matthew', 1, 1) - 1;
    const ppvPc = geo.fitPPV({ total: g.total }, FRAMES.pc.W) * 40;
    for (const [name, zoom, verse, sides] of [
      ['pc', 40, ISA53_6, ['left']], ['phone', 300, ISA53_6, ['left']], ['phone', zMax('phone'), ISA53_6, ['left']],
      ['pc', 40, malachiEnd - (FRAMES.pc.W * 0.55) / ppvPc, ['right']],
    ]) {
      const { rec, fs } = paint(name, zoom, verse);
      const s = fs.v.DPR, Wc = fs.v.W, span = 160 * s, solid = 0.55 * span;
      const calls = rec.calls;
      const what = name + ' ' + Math.round(zoom) + 'x';
      for (const side of sides) {
        const gx = side === 'left' ? 0 : Wc - span;
        const gi = calls.findIndex((c) => c.op === 'rect' && Math.abs(c.a[0] - gx) < 1e-6 && Math.abs(c.a[2] - span) < 1e-6);
        expect(gi, what + ': the ' + side + ' fade').toBeGreaterThanOrEqual(0);
        const z0 = side === 'left' ? 0 : Wc - solid, z1 = side === 'left' ? solid : Wc;
        const f0 = side === 'left' ? 0 : Wc - span, f1 = side === 'left' ? span : Wc;
        let beside = 0;
        calls.forEach((c, k) => {
          if (c.op !== 'fillText' || !/^\d+$/.test(c.t)) return;
          const b = textBox(c);
          expect(b.x1 <= z0 || b.x0 >= z1, what + ': numeral ' + c.t + ' at ' + Math.round(b.x0) + ' under the solid fade').toBe(true);
          if (b.x1 > f0 && b.x0 < f1) { beside++; expect(k, what + ': numeral ' + c.t + ' drawn before the fade over it').toBeGreaterThan(gi); }
        });
        // the wash's gold top edge comes after the fade and over the baseline
        const edge = calls.findIndex((c) => c.op === 'rect' && Math.abs(c.a[1] - fs.view.base) < 1e-6 && Math.abs(c.a[3] - 1 * s) < 1e-6);
        const baseline = calls.findIndex((c) => c.op === 'fillRect' && Math.abs(c.y - fs.view.base) < 1e-6 && c.w === fs.v.W);
        if (edge >= 0) {
          expect(edge, what + ': the wash after the fade').toBeGreaterThan(gi);
          expect(edge, what + ': the wash edge over the baseline').toBeGreaterThan(baseline);
        }
        if (side === 'left' && name === 'pc') {
          expect(edge, what + ': the centre chapter is washed').toBeGreaterThanOrEqual(0);
          expect(beside, what + ': a numeral beside the fade').toBeGreaterThan(0);
        }
      }
    }
  });

  it('no chapter rule cuts through a numeral or a name, and under a stride no bare "1" stands for a book', () => {
    const tick = css('chapterTick');
    for (const [name, zoom] of [['pc', 6], ['pc', 40], ['phone', 6], ['phone', 40]]) {
      const { rec, fs } = paint(name, zoom, ISA53_6);
      const s = fs.v.DPR;
      const rules = rec.calls.filter((c) => c.op === 'fillRect' && c.fill === tick);
      expect(rules.length, name + ' ' + zoom + 'x rules').toBeGreaterThan(10);
      const texts = rec.texts();
      for (const c of texts) {
        const b = textBox(c), top = c.y - fontPxOf(c.font) * 0.7;
        expect(b.x0 >= 0 && b.x1 <= fs.v.W, name + ' ' + zoom + 'x: "' + c.t + '" wholly on the frame').toBe(true);
        for (const r of rules) {
          const cuts = r.x > b.x0 + 1 && r.x < b.x1 - 1 && r.y < c.y && r.y + r.h > top;
          expect(cuts, name + ' ' + zoom + 'x: a rule at ' + Math.round(r.x / s) + ' cuts "' + c.t + '"').toBe(false);
        }
      }
      // 6x and 40x number under a stride (Song of Songs, Lamentations, Jeremiah start on these frames)
      const bare = texts.filter((c) => c.t === '1' && Math.abs(fontPxOf(c.font) - fs.v.DPR * (name === 'pc' ? 28 : 20)) < 1e-6);
      expect(bare.length, name + ' ' + zoom + 'x bare "1"').toBe(0);
    }
  });

  it('the sticky name is pushed along by the next book, gives way to its abbreviation, and never slides off the frame', () => {
    const v = FRAMES.phone, s = v.DPR;
    const ppv = geo.fitPPV({ total: g.total }, v.W) * 6;
    const prov = verseOf('proverbs', 1, 1);
    const seen = new Set();
    for (let xs = 20; xs <= 420; xs += 10) {
      const { rec } = paint('phone', 6, prov - (xs * s - v.W / 2) / ppv);
      const t = rec.texts();
      for (const c of t) expect(textBox(c).x0, '"' + c.t + '" with Proverbs at ' + xs).toBeGreaterThanOrEqual(0);
      const arrow = t.find((c) => c.t === '‹');
      if (arrow) {
        const name = t.find((c) => Math.abs(c.y - arrow.y) < 1e-6 && c.t !== '‹' && c.x > arrow.x && c.x < arrow.x + 60 * s);
        expect(name, 'the arrow has its name at ' + xs).toBeTruthy();
        seen.add(name.t);
      }
    }
    expect(seen.has('PSALMS'), 'the title while it fits').toBe(true);
  });

  it('the overview hands over to the deep band: no chapter-length bars past it, no numerals before it', () => {
    const before = paint('pc', 3, ISA53_6).rec.texts().filter((c) => /^\d+$/.test(c.t));
    expect(before.length, 'no numerals at 3x').toBe(0);
    const after = paint('pc', DEEP_FULL + 0.5, ISA53_6).rec.calls.filter((c) => c.op === 'fillRect' && c.h > 4 && c.w > 1.5);
    expect(after.length, 'no bars at depth').toBe(0);
  });
});

describe('the pills and the labels', () => {
  it('a pill is a tap target whose ids are the threads it counts', () => {
    const { out } = paint('pc', 40, ISA53_6);
    const pills = out.hits.filter((h) => h.hit.kind === 'pill');
    expect(pills.length, 'pills at 40x on Isaiah 53').toBeGreaterThan(0);
    expect(out.badges.length).toBe(pills.length);
    pills.forEach((p, k) => {
      const cell = out.badges[k].cell;
      expect(p.hit.ids.length, p.hit.label).toBe(cell.drawn + (cell.hidden || 0));
      expect(p.hit.label).toMatch(/^Isaiah|^Jeremiah|^Lamentations|^Ezekiel|^[1-3A-Z]/);
    });
  });

  it('a pill counts its threads once: every read of ids hands back the same array (w3 review: a walk of every thread per read)', () => {
    const { out } = paint('pc', 40, ISA53_6);
    const pills = out.hits.filter((h) => h.hit.kind === 'pill');
    expect(pills.length).toBeGreaterThan(0);
    for (const p of pills) {
      const first = p.hit.ids;
      expect(first).toBeInstanceOf(Int32Array);
      expect(p.hit.ids, p.hit.label).toBe(first);
    }
  });

  /* digest item 3: the old pass walked visibleArcs (the crossing set in bucket order, cut at a
     limit) and stopped among fly-overs far above the frame: 22 of the 86 threads on the frame were
     named. Fed from the frame, every thread with a foot on it is a candidate, ranked by votes, and
     the names reach across the frame. What is shown is what stays clean (C2, "fully zoomed in must
     look good and clean"): the chips at the feet, and over them a short column of far ends; the
     upper half of the sky is the threads'. */
  it('at the ceiling over Isaiah 53 the labels reach across the frame and leave the upper sky to the threads (digest item 3: 22 of 86)', () => {
    for (const [name, least] of [['pc', 40], ['phone', 25]]) {
      const { out, fs, rec } = paint(name, zMax(name), ISA53_6);
      const feed = labelFeed(g, fs.cam, { width: fs.v.W, base: fs.view.base, squash: fs.view.squash, density: 'famous', inset: fs.inset });
      const footed = feed.filter((f) => f.fromOn || f.toOn).length;
      expect(footed, name + ': threads with a foot on the frame').toBeGreaterThan(100);
      expect(out.labels, name + ': ' + out.labels + ' of ' + footed + ' named').toBeGreaterThanOrEqual(least);
      const named = rec.texts().filter((c) => /·|→|←/.test(c.t));
      expect(named.length).toBe(out.labels);
      for (let third = 0; third < 3; third++) {
        const inThird = named.filter((c) => { const b = textBox(c); const cx = (b.x0 + b.x1) / 2; return cx >= (third * fs.v.W) / 3 && cx < ((third + 1) * fs.v.W) / 3; });
        expect(inThird.length, name + ': labels in third ' + third).toBeGreaterThan(3);
      }
      const skyMid = (fs.inset + fs.view.base) / 2;
      for (const c of named) expect(c.y, name + ': ' + c.t + ' in the upper sky').toBeGreaterThan(skyMid);
    }
  });

  it('the chips stand about one per 160 px (PC) and 120 px (phone), never closer', () => {
    for (const [name, every] of [['pc', 160], ['phone', 120]]) {
      const { rec, fs } = paint(name, 200, ISA53_6);
      const xs = rec.texts().filter((c) => / · /.test(c.t) && c.align === 'center').map((c) => c.x).sort((a, b) => a - b);
      expect(xs.length, name + ' chips').toBeGreaterThan(2);
      for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1], name).toBeGreaterThanOrEqual(every * fs.v.DPR - 1e-6);
    }
  });

  it('labels never print in the open panel or under the scrim', () => {
    const v = FRAMES.pc;
    const { rec, fs } = paint('pc', zMax('pc'), ISA53_6, { panelInset: { right: 400, bottom: 0 } });
    const edge = v.W - 400 * v.DPR;
    const chips = rec.texts().filter((c) => /·|→|←/.test(c.t));
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      const b = textBox(c);
      expect(b.x1, c.t).toBeLessThanOrEqual(edge);
      expect(c.y, c.t).toBeGreaterThan(fs.inset);
    }
  });

  it('the chosen line with a foot under the open panel: no dot there, and that end is written beside the leg on the frame (w3 review: on0/on1 read W)', () => {
    const v = FRAMES.pc, s = v.DPR, right = 400, Wc = v.W - right * s;
    const probe = frameAt('pc', 40, ISA53_6);
    const { fanA, fanB } = dec.fansOf(g);
    let pick = -1;
    for (const bucket of g.buckets) {
      const end = bucket.off + dec.bucketDrawCount(bucket, 'famous');
      for (let i = bucket.off; i < end && pick < 0; i++) {
        const x0 = geo.footX(probe.cam, v.W, g.from[i], fanA[i]), x1 = geo.footX(probe.cam, v.W, g.to[i], fanB[i]);
        if (x0 > 80 * s && x0 < Wc - 300 * s && x1 > Wc + 40 * s && x1 < v.W - 40 * s && geo.arcShape((x1 - x0) / 2, probe.view.squash).A > 120 * s) pick = i;
      }
      if (pick >= 0) break;
    }
    expect(pick, 'a thread from the frame to under the panel').toBeGreaterThanOrEqual(0);
    const { rec, fs } = paint('pc', 40, ISA53_6, { focus: { arc: pick }, panelInset: { right, bottom: 0 } });
    expect(fs.focusArc).toBe(pick);
    const dots = rec.calls.filter((c) => c.op === 'arc' && c.a[2] === 4 * s);
    expect(dots.length, 'the foot on the frame is marked').toBe(1);
    for (const d of dots) expect(d.a[0], 'a dot under the panel').toBeLessThanOrEqual(Wc);
    const gold = rec.texts().filter((c) => c.fill === css('chosenLabel'));
    const far = gold.filter((c) => / →$|^← /.test(c.t));
    expect(far.length, 'the end under the panel written beside the leg: ' + gold.map((c) => c.t).join(', ')).toBe(1);
    expect(textBox(far[0]).x1).toBeLessThanOrEqual(Wc);
    expect(gold.length, 'one foot reference and the far end').toBe(2);
  });

  it('a chosen line makes the other labels step back with the threads, two thirds of their way (TAP_CONTEXT), never to black', () => {
    expect(LABEL_RECEDE).toBeCloseTo(1 - (1 - TAP_CONTEXT) * 0.65, 12);
    expect(LABEL_RECEDE).toBeGreaterThan(TAP_CONTEXT);
    expect(LABEL_RECEDE).toBeLessThan(1);
    const others = (rec) => rec.texts().filter((c) => /·|→|←/.test(c.t) && c.fill !== css('chosenLabel'));
    const free = others(paint('pc', zMax('pc'), ISA53_6).rec);
    expect(free.length).toBeGreaterThan(5);
    for (const c of free) expect(c.alpha, c.t).toBeCloseTo(1, 6);
    const probe = frameAt('pc', zMax('pc'), ISA53_6);
    const pick = labelFeed(g, probe.cam, { width: probe.v.W, base: probe.view.base, squash: probe.view.squash, density: 'famous', inset: probe.inset })
      .find((f) => f.fromOn && f.toOn).i;
    const chosen = others(paint('pc', zMax('pc'), ISA53_6, { focus: { arc: pick } }).rec);
    expect(chosen.length).toBeGreaterThan(5);
    for (const c of chosen) expect(c.alpha, c.t).toBeCloseTo(LABEL_RECEDE, 6);
  });

  it('hysteresis: a label placed on one frame keeps its thread on the next, a pixel later', () => {
    const a = paint('pc', zMax('pc'), ISA53_6);
    const b = paint('pc', zMax('pc'), ISA53_6 + 1 / a.fs.cam.ppv);
    const chips = (r) => new Set(r.rec.texts().filter((c) => /·/.test(c.t)).map((c) => c.t));
    const ca = chips(a), cb = chips(b);
    let kept = 0;
    for (const t of ca) if (cb.has(t)) kept++;
    expect(kept / Math.max(1, ca.size)).toBeGreaterThan(0.9);
  });
});

describe('labelFeed: every drawn thread a reader can see on the frame', () => {
  it('at the ceiling it holds every thread with a foot on the frame, and fly-overs only when asked', () => {
    const fs = frameAt('pc', zMax('pc'), ISA53_6);
    const view = { width: fs.v.W, base: fs.view.base, squash: fs.view.squash, density: 'famous', inset: fs.inset };
    const feed = labelFeed(g, fs.cam, view);
    const ids = new Set(feed.map((f) => f.i));
    const { fanA, fanB } = dec.fansOf(g);
    let footed = 0;
    for (const bucket of g.buckets) {
      const end = bucket.off + dec.bucketDrawCount(bucket, 'famous');
      for (let i = bucket.off; i < end; i++) {
        const x0 = geo.footX(fs.cam, fs.v.W, g.from[i], fanA[i]), x1 = geo.footX(fs.cam, fs.v.W, g.to[i], fanB[i]);
        if ((x0 >= 0 && x0 <= fs.v.W) || (x1 >= 0 && x1 <= fs.v.W)) { footed++; expect(ids.has(i), 'thread ' + i).toBe(true); }
      }
    }
    expect(feed.length).toBe(footed);
    const withFly = labelFeed(g, fs.cam, view, { flyovers: true });
    expect(withFly.length).toBeGreaterThanOrEqual(feed.length);
    for (const f of withFly) if (!f.fromOn && !f.toOn) expect(f.x0 < 0 && f.x1 > fs.v.W).toBe(true);
  });
});

/* w3 review (major): from 4x to 40x the chip pass made a candidate for every foot on the frame
   (about 17,000 threads at 6x) and sorted every 40 px bucket of them, to keep three a bucket:
   panning at 6x cost 8.3 ms a frame against the spine's 0.6. The keepers are now chosen in one
   pass with no sort, and nothing is made for a foot that cannot win. */
describe('the tap targets are a finger wide (w3 review: the hit boxes ran 14-30 px tall against 44)', () => {
  const TAP = 44;
  for (const [name, zoom] of [['phone', 1], ['phone', 40], ['phone', 300], ['pc', 1], ['pc', 40]]) {
    it(name + ' ' + zoom + 'x: every hit box is at least 44 CSS px each way, in the ruler band, around what it names', () => {
      const { out, fs } = paint(name, zoom, ISA53_6, { panelInset: name === 'pc' ? { right: 400, bottom: 0 } : null });
      const s = fs.v.DPR, Wc = fs.v.W - (name === 'pc' ? 400 * s : 0);
      expect(out.hits.length, 'tap targets').toBeGreaterThan(3);
      const kinds = new Set(out.hits.map((h) => h.hit.kind));
      expect(kinds.has(zoom === 1 ? 'book' : 'chapter')).toBe(true);
      for (const h of out.hits) {
        const what = h.hit.kind + ' ' + (h.hit.chapter || h.hit.book || h.hit.label);
        expect(h.y1 - h.y0, what + ' tall').toBeGreaterThanOrEqual(TAP * s - 1e-6);
        expect(h.x1 - h.x0, what + ' wide').toBeGreaterThanOrEqual(TAP * s - 1e-6);
        expect(h.y0, what + ' under the baseline').toBeGreaterThanOrEqual(fs.view.base - 1e-6);
        expect(h.y1, what + ' on the canvas').toBeLessThanOrEqual(fs.v.H + 1e-6);
        expect(h.x0, what).toBeGreaterThanOrEqual(-1e-6);
        expect(h.x1, what + ' left of the panel').toBeLessThanOrEqual(Wc + 1e-6);
        expect(h.core, what + ' keeps its drawn box').toBeTruthy();
        expect(h.core.x0 >= h.x0 - 1e-6 && h.core.x1 <= h.x1 + 1e-6 && h.core.y0 >= h.y0 - 1e-6 && h.core.y1 <= h.y1 + 1e-6, what + ' inside').toBe(true);
      }
    });
  }

  it('a tap a little off a numeral still finds it, and where two grown targets meet the nearer drawn one wins', () => {
    const { out, fs } = paint('phone', 40, ISA53_6);
    const s = fs.v.DPR;
    const at = (x, y) => hitOverlay(fs, x / s, y / s);
    const ch = out.hits.filter((h) => h.hit.kind === 'chapter');
    expect(ch.length).toBeGreaterThan(2);
    for (const h of ch) {
      const cx = (h.core.x0 + h.core.x1) / 2;
      // just under and just over the drawn box, inside the grown one
      for (const y of [h.core.y1 + 4 * s, h.core.y0 - 4 * s]) {
        if (y < h.y0 || y > h.y1) continue;
        const hit = at(cx, y);
        expect(hit, 'chapter ' + h.hit.chapter).toBeTruthy();
        if (hit.kind === 'chapter') expect(hit.chapter).toBe(h.hit.chapter);
      }
    }
    // the overview's two name rows: a tap nearer one row's name reads that name
    const ov = paint('phone', 1, ISA53_6);
    const books = ov.out.hits.filter((h) => h.hit.kind === 'book');
    let pairs = 0;
    for (const a of books) {
      for (const b of books) {
        if (a === b || !(a.core.y0 > b.core.y1)) continue;   // a on the lower row, b on the upper
        const x = Math.max(a.core.x0, b.core.x0), x1 = Math.min(a.core.x1, b.core.x1);
        if (!(x1 > x)) continue;
        const mx = (x + x1) / 2;
        expect(hitOverlay(ov.fs, mx / s, (a.core.y0 - 1 * s) / s), 'just over the lower name').toBe(a.hit);
        expect(hitOverlay(ov.fs, mx / s, (b.core.y1 + 1 * s) / s), 'just under the upper name').toBe(b.hit);
        pairs++;
      }
    }
    expect(pairs, 'names on both rows over each other').toBeGreaterThan(3);
  });
});

describe('the face arriving (w3 review: the overlay kept the last frame, its ctx and graph, in a module global)', () => {
  it('the overlay paints nothing on its own when the face loads; whoever subscribed (the screen schedule) is told once', async () => {
    vi.resetModules();
    globalThis.FontFace = class {
      constructor(family) { this.family = family; this.status = 'unloaded'; }
      load() { this.status = 'loaded'; return Promise.resolve(this); }
    };
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, ready: Promise.resolve() } });
    try {
      const le = await import('../../utils/scripture-web/label-engine.js');
      const ov = await import('./overlay-renderer.js');
      const schedule = vi.fn();
      const off = le.onWebFontReady(schedule);
      const rec = recorder();
      ov.paintCanonOverlay(rec.ctx, frameAt('pc', 40, ISA53_6));
      const n = rec.calls.length;
      expect(n).toBeGreaterThan(100);
      await new Promise((r) => setTimeout(r, 0));
      expect(le.webFontReady()).toBe(true);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(rec.calls.length, 'no repaint of the old frame from inside the overlay').toBe(n);
      off();
    } finally {
      delete globalThis.FontFace;
      delete document.fonts;
      vi.resetModules();
    }
  });
});

describe('the chip pass chooses its keepers in one pass', () => {
  /** The sort per bucket the pass replaced (the old cull), as the reference. */
  function sortedKeepers(fs, memo, left, right, bucketW, keep) {
    const view = { width: fs.v.W, base: fs.view.base, squash: fs.view.squash, density: 'famous', inset: fs.inset };
    const c = fs.centre;
    const by = new Map();
    for (const f of labelFeed(g, fs.cam, view)) {
      for (let side = 0; side < 2; side++) {
        if (!(side ? f.toOn : f.fromOn)) continue;
        const fx = side ? f.x1 : f.x0;
        if (fx < left || fx > right) continue;
        const near = side ? g.to[f.i] : g.from[f.i];
        const cand = { key: f.i * 2 + side, tier: c && near >= c.x0 && near < c.x1 ? 1 : 2, score: g.votes[f.i], fx };
        const k = Math.floor(fx / bucketW);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(cand);
      }
    }
    const was = (p) => (memo.has(p.key) ? 0 : 1);
    const out = [];
    for (const l of by.values()) {
      l.sort((p, q) => (p.tier - q.tier) || (was(p) - was(q)) || (q.score - p.score) || (p.key - q.key));
      l.forEach((p, j) => { if (j < keep || !was(p)) out.push(p); });
    }
    return { out, view };
  }

  for (const [name, zoom] of [['pc', 6], ['phone', 6], ['pc', 40], ['phone', 300]]) {
    it(name + ' ' + zoom + 'x: the same feet as a full sort of every bucket, with and without a memory', () => {
      const fs = frameAt(name, zoom, ISA53_6);
      const s = fs.v.DPR, every = (name === 'pc' ? 160 : 120) * s;
      const left = 16 * s, right = fs.v.W - 16 * s;
      const probe = sortedKeepers(fs, new Map(), left, right, every / 4, 3);
      // a memory of every 7th foot the frame holds, whatever its rank
      const memo = new Map();
      for (const f of labelFeed(g, fs.cam, probe.view)) if (f.i % 7 === 0) memo.set(f.i * 2 + (f.fromOn ? 0 : 1), 0);
      for (const m of [new Map(), memo]) {
        const want = sortedKeepers(fs, m, left, right, every / 4, 3).out;
        const got = chipKeepers(g, fs.cam, probe.view, { left, right, bucketW: every / 4, keep: 3, centre: fs.centre, memory: m });
        const key = (p) => p.key + ':' + p.tier + ':' + p.score + ':' + p.fx;
        expect(got.map(key).sort(), name + ' ' + zoom + 'x, memory of ' + m.size).toEqual(want.map(key).sort());
        expect(got.length, 'keepers').toBeGreaterThan(10);
        if (m.size) expect(got.length).toBeGreaterThan(probe.out.length);
      }
    });
  }

  it('panning at 6x: a frame costs about what one labelFeed walk does, not a sort of every foot', () => {
    // a context that draws nothing, so the overlay's own work is what is timed
    const nop = () => {};
    const ctx = Object.assign(Object.create(null), { font: '10px serif', letterSpacing: '0px', globalAlpha: 1, canvas: null,
      save: nop, restore: nop, clearRect: nop, fillText: nop, strokeText: nop, fillRect: nop, beginPath: nop, closePath: nop,
      moveTo: nop, lineTo: nop, arc: nop, arcTo: nop, rect: nop, fill: nop, stroke: nop,
      measureText(t) { return { width: String(t).length * 7 }; }, createLinearGradient() { return { addColorStop: nop }; } });
    for (const name of ['pc', 'phone']) {
      const ppv = geo.fitPPV({ total: g.total }, FRAMES[name].W) * 6;
      const frames = [];
      for (let k = 0; k < 40; k++) frames.push(frameAt(name, 6, ISA53_6 + (k * 3) / ppv));   // 3 device px a frame
      const view = (fs) => ({ width: fs.v.W, base: fs.view.base, squash: fs.view.squash, density: 'famous', inset: fs.inset });
      for (const fs of frames.slice(0, 8)) { paintCanonOverlay(ctx, fs); labelFeed(g, fs.cam, view(fs)); }
      const tp = [], tf = [];
      for (const fs of frames) {
        let t0 = performance.now();
        paintCanonOverlay(ctx, fs);
        tp.push(performance.now() - t0);
        t0 = performance.now();
        labelFeed(g, fs.cam, view(fs));
        tf.push(performance.now() - t0);
      }
      const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      // measured in node: the sorting pass 5.4 ms a frame against a 0.75 ms walk (7x); one pass about 1 ms (1.3x)
      expect(med(tp), name + ': ' + med(tp).toFixed(2) + ' ms a frame against a ' + med(tf).toFixed(2) + ' ms walk').toBeLessThan(3.5 * med(tf));
    }
  });
});
