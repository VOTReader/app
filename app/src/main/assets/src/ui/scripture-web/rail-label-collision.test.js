/* The Volumes rail's names keep their distance (sw-chrome-r3, item 5).
   ─────────────────────────────────────────────────────────────────────────
   Design & Perf's 1920-wide captures (2026-09-11): the short collections at the right end of
   the top rail — TIMOTHY, HOLY DAYS, MTAM, LAMB, FLOCK — print into one another. The loop in
   drawPersonalWeb placed a name that fits its band on row 0 and flipped a name up to twice
   its band between rows (`row = 1 - row`), tracking nothing about where the previous name on
   a row ENDED. MEASURED in headless Chrome with the vendored Cinzel (tools: measure-rail-labels,
   tree ed29295a, 30 zoom/pan reads per frame): at 1920 x 1080 @1 HOLY DAYS and MTAM sit 3 px
   apart on one row ("HOLY DAYSMTAM"); at the phone's landscape frame (952 CSS px wide, DPR 2)
   the worst same-row gap is 18 device px — no violation there today. The law both rails now
   share (placeRailLabels): two rows, prefer the top, a neighbour on the same row keeps a
   5 CSS px gap (the scripture rail's own pad), a name that fits on neither row is not printed
   and its tick stays.

   The rail here is the REAL chain in reading order with the real item counts (803 nodes:
   Vol I 30 … Holy Days 16, then the seven studies), so the band edges match the app's at
   the same width; the fake context returns the widths Chrome measured for Cinzel 600 at 11 px
   (scaled by the font size the loop sets, so DPR 2 reads in device px as the loop does). */
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { placeRailLabels } from '../../utils/scripture-web/rail-labels.js';
import * as RR from './rail-renderer.js';

const { drawPersonalWeb, railFrame } = RR;

if (typeof globalThis.Path2D === 'undefined') {
  /** @type {any} */ (globalThis).Path2D = class Path2D { moveTo() {} lineTo() {} arc() {} };
}

// READING_CHAIN order, then BIBLE_STUDIES order; counts as the corpus ships them (2026-09-11).
const CHAIN = [
  ['one', 'Vol I', 30], ['two', 'Vol II', 29], ['three', 'Vol III', 30], ['four', 'Vol IV', 29],
  ['five', 'Vol V', 29], ['six', 'Vol VI', 31], ['seven', 'Vol VII', 67], ['rebuke', 'Rebuke', 31],
  ['wtlb1', 'WTLB I', 150], ['wtlb2', 'WTLB II', 203], ['blessed', 'Blessed', 9], ['flock', 'Flock', 62],
  ['timothy', 'Timothy', 15], ['holydays', 'Holy Days', 16],
  ['study-more-than-a-man', 'MTaM', 31], ['study-odds-chart', 'Odds', 1], ['study-lamb-of-god', 'Lamb', 16],
  ['study-state-of-the-dead', 'SotD', 5], ['study-grace-and-the-law', 'Grace', 7],
  ['study-trinity-exposed', 'Trinity', 6], ['study-purity', 'Purity', 6],
];
const rail = buildVotRail(CHAIN.map(([volKey, short, n]) => ({
  volKey, label: short, short, items: Array.from({ length: n }, (_, i) => ({ id: volKey + '-' + i, title: short + ' ' + i })),
})));
expect(rail.total).toBe(803);

// Chrome 152, Cinzel 600 11px, measureText().width in CSS px (rail-labels-before-*.json).
const WIDTH_11 = {
  'VOL I': 32, 'VOL II': 38, 'VOL III': 42, 'VOL IV': 41, 'VOL V': 36, 'VOL VI': 41, 'VOL VII': 45,
  'REBUKE': 51, 'WTLB I': 44, 'WTLB II': 48, 'BLESSED': 55, 'FLOCK': 41, 'TIMOTHY': 58, 'HOLY DAYS': 70,
  'MTAM': 38, 'ODDS': 35, 'LAMB': 36, 'SOTD': 33, 'GRACE': 42, 'TRINITY': 51, 'PURITY': 47,
};
const VERSES = 31102;

/** A recording 2D context: the labels drawn (text, centre x, baseline y, measured width) and
 *  the ticks (moveTo at the tick's top). @returns {any} */
function recordingCtx() {
  const labels = [], ticks = [];
  const state = { font: '600 11px Cinzel', textAlign: 'center' };
  const fontPx = () => { const m = /(\d+(?:\.\d+)?)px/.exec(state.font); return m ? parseFloat(m[1]) : 11; };
  const width = (text) => {
    const base = WIDTH_11[text] != null ? WIDTH_11[text] : text.length * 0.7 * 11;   // unmeasured names: 0.7 em per glyph
    return base * (fontPx() / 11);
  };
  const noop = () => {};
  return {
    labels, ticks,
    get font() { return state.font; }, set font(v) { state.font = v; },
    get textAlign() { return state.textAlign; }, set textAlign(v) { state.textAlign = v; },
    lineWidth: 0, strokeStyle: '', fillStyle: '', textBaseline: '', lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath: noop, lineTo: noop, arc: noop, stroke: noop, fill: noop, clearRect: noop, save: noop, restore: noop,
    moveTo(x, y) { ticks.push({ x, y }); },
    measureText: (text) => ({ width: width(String(text)) }),
    fillText(text, x, y) { const w = width(String(text)); labels.push({ text: String(text), x, y, w, left: x - w / 2, right: x + w / 2 }); },
  };
}

function frame(widthCss, DPR) {
  const W = widthCss * DPR, H = 600 * DPR;
  return {
    W, H, DPR,
    opts: {
      width: W, height: H, H, DPR, base: H - 80 * DPR, votRail: rail, verseTotal: VERSES,
      verseX: (verse) => (verse / VERSES) * W,                     // the fit camera: the canon spans the frame
      chrome: { isLight: false, fsLabel: 11 }, showUnderlay: false, hoverIndex: -1, focusIndex: -1,
    },
  };
}

/** Same-row gaps between neighbouring names, smallest first. */
function sameRowGaps(labels) {
  const gaps = [];
  for (const y of [...new Set(labels.map((l) => l.y))]) {
    const row = labels.filter((l) => l.y === y).sort((a, b) => a.left - b.left);
    for (let i = 1; i < row.length; i++) gaps.push({ y, a: row[i - 1].text, b: row[i].text, gap: row[i].left - row[i - 1].right });
  }
  return gaps.sort((a, b) => a.gap - b.gap);
}

const topRailLabels = (ctx, f) => {
  const rails = railFrame({ H: f.H, DPR: f.DPR }, f.opts.base);
  return ctx.labels.filter((l) => l.y < rails.topY);      // the Volumes rail's names sit above the top rail line
};

describe('the Volumes rail keeps its names apart (one placement law for both rails)', () => {
  it('1920 x 1080 @1: no two names on one row closer than 5 px — today HOLY DAYS|MTAM are 3 px apart', () => {
    const f = frame(1920, 1);
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, f.opts);
    const names = topRailLabels(ctx, f);
    // The precondition: the rail is populated the way the app populates it (15 names at fit,
    // measured), so an empty rail cannot pass the distance law for free.
    expect(names.length, 'names drawn: ' + names.map((l) => l.text).join(',')).toBeGreaterThanOrEqual(14);
    const gaps = sameRowGaps(names);
    expect(gaps[0].gap, `closest pair ${gaps[0].a}|${gaps[0].b} at y${gaps[0].y}`).toBeGreaterThanOrEqual(5 * f.DPR);
  });

  it('952 CSS px wide @2 (the phone in landscape), in device px: the same law — a control here, worst gap today 18 px', () => {
    /* Cannot fail on today's rule at this frame (30 zoom/pan reads measured, worst 18 device px);
       it is the phone-frame control for the new law: names must stay (>= 13, measured today)
       and stay apart. The 1920 case is the one with teeth. */
    const f = frame(952, 2);
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, f.opts);
    const names = topRailLabels(ctx, f);
    expect(names.length, 'names drawn: ' + names.map((l) => l.text).join(',')).toBeGreaterThanOrEqual(13);
    const gaps = sameRowGaps(names);
    expect(gaps[0].gap, `closest pair ${gaps[0].a}|${gaps[0].b}`).toBeGreaterThanOrEqual(5 * f.DPR);
  });

  it('every visible collection keeps its tick whether or not its name was printed', () => {
    const f = frame(952, 2);
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, f.opts);
    const rails = railFrame({ H: f.H, DPR: f.DPR }, f.opts.base);
    const tickTops = ctx.ticks.filter((t) => Math.abs(t.y - (rails.topY - 7 * f.DPR)) < 0.01);
    expect(tickTops.length).toBe(CHAIN.length);
  });
});

describe('placeRailLabels — the law itself', () => {
  it('a name that would touch the previous one on the top row takes the second; a third that fits neither is not placed', () => {
    const rows = placeRailLabels([{ left: 0, right: 40 }, { left: 42, right: 80 }, { left: 44, right: 70 }], 5);
    expect(rows).toEqual([0, 1, -1]);
  });
  it('far enough apart, everyone stays on the top row; exactly the pad is enough', () => {
    expect(placeRailLabels([{ left: 0, right: 40 }, { left: 45, right: 80 }, { left: 85, right: 90 }], 5)).toEqual([0, 0, 0]);
  });
  it('an empty or inverted box is skipped, not placed', () => {
    expect(placeRailLabels([{ left: 10, right: 10 }, { left: 20, right: 15 }, { left: 0, right: 5 }], 5)).toEqual([-1, -1, 0]);
  });
});
