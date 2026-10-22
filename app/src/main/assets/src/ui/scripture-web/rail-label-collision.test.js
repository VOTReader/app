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
// w4 review: each collection also has its tiny form (the nav badges, _NAV_ICONS; the studies'
// own), and Volumes I-VII and the two WTLB parts each go to theirs together (personal-build.js)
/** @type {[string, string, number, string, string][]} */
const CHAIN = [
  ['one', 'Vol I', 30, 'V1', 'vol'], ['two', 'Vol II', 29, 'V2', 'vol'], ['three', 'Vol III', 30, 'V3', 'vol'],
  ['four', 'Vol IV', 29, 'V4', 'vol'], ['five', 'Vol V', 29, 'V5', 'vol'], ['six', 'Vol VI', 31, 'V6', 'vol'],
  ['seven', 'Vol VII', 67, 'V7', 'vol'], ['rebuke', 'Rebuke', 31, 'LR', 'rebuke'],
  ['wtlb1', 'WTLB I', 150, 'W1', 'wtlb'], ['wtlb2', 'WTLB II', 203, 'W2', 'wtlb'], ['blessed', 'Blessed', 9, 'TB', 'blessed'],
  ['flock', 'Flock', 62, 'LF', 'flock'], ['timothy', 'Timothy', 15, 'LT', 'timothy'], ['holydays', 'Holy Days', 16, 'HD', 'holydays'],
  ['study-more-than-a-man', 'MTaM', 31, 'MTaM', 'mtam'], ['study-odds-chart', 'Odds', 1, 'Odds', 'odds'],
  ['study-lamb-of-god', 'Lamb', 16, 'Lamb', 'lamb'], ['study-state-of-the-dead', 'SotD', 5, 'SotD', 'sotd'],
  ['study-grace-and-the-law', 'Grace', 7, 'Grace', 'grace'], ['study-trinity-exposed', 'Trinity', 6, 'Trin', 'trinity'],
  ['study-purity', 'Purity', 6, 'Pur', 'purity'],
];
const rail = buildVotRail(CHAIN.map(([volKey, short, n, tiny, group]) => ({
  volKey, label: short, short, tiny, group, items: Array.from({ length: n }, (_, i) => ({ id: volKey + '-' + i, title: short + ' ' + i })),
})));
/** The forms a collection may be named by on the rail, longest first. */
const formsOf = (i) => [CHAIN[i][1].toUpperCase(), CHAIN[i][3].toUpperCase()];
expect(rail.total).toBe(803);

// The web's face (EB Garamond 500, sw-ink FONT) at 11 px with no tracking, measureText().width in
// CSS px, Chrome headless (w4 fix pass, 2026-10-18); the fake adds the tracking the loop sets per
// glyph, as Chrome's letterSpacing does (VOL I 28.1 + 5 x 1.1 = 33.6, measured with it).
const WIDTH_11 = {
  'VOL I': 28.1, 'VOL II': 31.92, 'VOL III': 35.75, 'VOL IV': 35.62, 'VOL V': 31.79, 'VOL VI': 35.62, 'VOL VII': 39.45,
  'REBUKE': 43.09, 'WTLB I': 37.17, 'WTLB II': 41, 'BLESSED': 44.33, 'FLOCK': 36.28, 'TIMOTHY': 52.44, 'HOLY DAYS': 59.09,
  'MTAM': 34.21, 'ODDS': 30.28, 'LAMB': 30.74, 'SOTD': 29.19, 'GRACE': 37.81, 'TRINITY': 46.1, 'PURITY': 40.45,
  'V1': 12.99, 'V2': 12.99, 'V3': 12.99, 'V4': 12.99, 'V5': 12.99, 'V6': 12.99, 'V7': 12.99,
  'LR': 14.46, 'W1': 15.95, 'W2': 15.95, 'TB': 14.08, 'LF': 12.2, 'LT': 12.62, 'HD': 17.21, 'TRIN': 28.1, 'PUR': 22.45,
};
const VERSES = 31102;

/** A recording 2D context: the labels drawn (text, centre x, baseline y, measured width) and
 *  the ticks (moveTo at the tick's top). @returns {any} */
function recordingCtx() {
  const labels = [], ticks = [];
  const state = { font: '500 11px serif', textAlign: 'center', letterSpacing: '0px' };
  const fontPx = () => { const m = /(\d+(?:\.\d+)?)px/.exec(state.font); return m ? parseFloat(m[1]) : 11; };
  const width = (text) => {
    const base = WIDTH_11[text] != null ? WIDTH_11[text] : text.length * 0.62 * 11;   // unmeasured names: 0.62 em per glyph
    return base * (fontPx() / 11) + text.length * (parseFloat(state.letterSpacing) || 0);
  };
  const noop = () => {};
  return {
    labels, ticks,
    get font() { return state.font; }, set font(v) { state.font = v; },
    get textAlign() { return state.textAlign; }, set textAlign(v) { state.textAlign = v; },
    get letterSpacing() { return state.letterSpacing; }, set letterSpacing(v) { state.letterSpacing = v; },
    lineWidth: 0, strokeStyle: '', fillStyle: '', textBaseline: '', lineCap: '', lineJoin: '', globalAlpha: 1,
    beginPath: noop, lineTo: noop, arc: noop, stroke: noop, fill: noop, clearRect: noop, save: noop, restore: noop,
    moveTo(x, y) { ticks.push({ x, y }); },
    measureText: (text) => ({ width: width(String(text)) }),
    fillText(text, x, y) { const w = width(String(text)); labels.push({ text: String(text), x, y, w, size: fontPx(), left: x - w / 2, right: x + w / 2 }); },
    strokeText() {},   // the names' knockout (drawRailNames): not a label
  };
}

function frame(widthCss, DPR, heightCss = 600) {
  const W = widthCss * DPR, H = heightCss * DPR;
  return {
    W, H, DPR,
    opts: {
      width: W, height: H, H, DPR, base: H - Math.min(80, heightCss / 4) * DPR, votRail: rail, verseTotal: VERSES,
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
  // the Volumes rail's names sit above the top rail line (the PC's overline names the rail, not a collection)
  return ctx.labels.filter((l) => l.y < rails.topY && l.text !== 'THE VOLUMES OF TRUTH');
};

describe('the Volumes rail keeps its names apart (one placement law for both rails)', () => {
  /* w4 fix pass (review, major 1): a reader must tell the gap between two names from the gap
     inside one. Tracked caps put about 0.4 em between the words of one name ("HOLY DAYS",
     "VOL IV"); the pad between names was 5 px, the same, so on a PC "TIMOTHY HOLY DAYS MTAM"
     read as one string and on the phone "VOL I VOL II VOL III VOL IV" as one line. The law
     now keeps 0.9 em at least (a name's box ends after its own tracking). */
  const GAP_EM = 0.9;
  // w4 review (major 3): at 732 x 360 a name wider than twice its slot was dropped (HOLY DAYS),
  // and a portrait phone (426 x 952) took the PC's 13 px type by its height and lost most
  // names; the frames below run from the PC down to a 360 px portrait phone
  const FRAMES = /** @type {Array<[number, number, number]>} */ ([
    [1920, 1080, 1], [1600, 900, 1], [952, 600, 2], [891, 411, 2.6], [800, 360, 2], [732, 360, 2], [640, 360, 2],
    [1024, 768, 1], [768, 1024, 2], [426, 952, 2], [412, 915, 2.6], [360, 780, 3],
  ]);
  for (const [wCss, hCss, dpr] of FRAMES) {
    it(`${wCss} x ${hCss} @${dpr}: every collection named, and no two names on one row nearer than ${GAP_EM} em`, () => {
      const f = frame(wCss, dpr, hCss);
      const ctx = recordingCtx();
      drawPersonalWeb(ctx, null, null, f.opts);
      const names = topRailLabels(ctx, f);
      // the precondition: the rail is populated the way the app populates it, so an empty
      // rail cannot pass the distance law for free
      expect(names.length, 'names drawn: ' + names.map((l) => l.text).join(',')).toBe(CHAIN.length);
      const gaps = sameRowGaps(names);
      const size = names[0].size;
      expect(gaps[0].gap, `closest pair ${gaps[0].a}|${gaps[0].b} at y${gaps[0].y}`).toBeGreaterThanOrEqual(GAP_EM * size - 1e-6);
      // each by one of its own forms, in rail order, inside the screen
      names.forEach((l, i) => {
        expect(formsOf(i), `${i}: ${l.text}`).toContain(l.text);
        expect(l.left, l.text).toBeGreaterThanOrEqual(0);
        expect(l.right, l.text).toBeLessThanOrEqual(f.W);
      });
      // Volumes I-VII read as one family: all by the short form or all by the tiny one
      expect(new Set(names.slice(0, 7).map((l) => (l.text.startsWith('VOL ') ? 'short' : 'tiny'))).size, names.slice(0, 7).map((l) => l.text).join(',')).toBe(1);
      expect(new Set(names.slice(8, 10).map((l) => (l.text.startsWith('WTLB') ? 'short' : 'tiny'))).size).toBe(1);
    });
  }

  it('a frame narrower than a PC names the rail in the phone\'s 11 px type whatever its height, three rows under the overline (w4 review: 426 x 952 took the PC\'s 13 px)', () => {
    for (const [wCss, hCss, dpr] of /** @type {Array<[number, number, number]>} */ ([[426, 952, 2], [360, 780, 3]])) {
      const f = frame(wCss, dpr, hCss);
      const ctx = recordingCtx();
      drawPersonalWeb(ctx, null, null, f.opts);
      const names = topRailLabels(ctx, f);
      expect(names.length).toBe(CHAIN.length);
      for (const l of names) expect(l.size, l.text).toBeCloseTo(11 * dpr, 6);
      const rails = railFrame({ H: f.H, DPR: f.DPR }, f.opts.base);
      const ys = [...new Set(names.map((l) => l.y))].sort((p, q) => q - p);
      expect(ys.length).toBeLessThanOrEqual(3);
      // the lowest row clears a reader's pin (its 5.5 px ring and 1 px stroke)
      expect(rails.topY - ys[0]).toBeGreaterThanOrEqual(6.5 * dpr);
      // the overline still names the rail, its baseline a clear 5 px over the top row's caps (0.7 em)
      const over = ctx.labels.find((l) => l.text === 'THE VOLUMES OF TRUTH');
      expect(over).toBeTruthy();
      expect(ys[ys.length - 1] - 0.7 * 11 * dpr - over.y).toBeGreaterThanOrEqual(5 * dpr - 1e-6);
    }
    // a PC keeps its 13 px, on its one row (w5: a second row is for a frame one row cannot name)
    const pc = frame(1600, 1, 900);
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, pc.opts);
    const names = topRailLabels(ctx, pc);
    for (const l of names) expect(l.size).toBe(13);
    expect(new Set(names.map((l) => l.y)).size).toBe(1);
  });

  /* w4 readdown item 3: HOLY DAYS stood raised on a second row over TIMOTHY and MTAM, where r2-05
     names the rail on one row. One row, every collection by its short name: HOLY DAYS and its
     neighbours slide over their own slots, either way, to make room. */
  it('1600 x 900 @1 (s10): one row, every collection by its short name; HOLY DAYS and its neighbours slide over their own slots between TIMOTHY and MTAM', () => {
    const f = frame(1600, 1, 900);
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, f.opts);
    const names = topRailLabels(ctx, f);
    const slot = f.W / CHAIN.length;
    CHAIN.forEach(([, short], i) => {
      const t = names.find((l) => l.text === short.toUpperCase());
      expect(t, short).toBeTruthy();
      // over its own slot: its centre at most half of it from the slot's
      expect(Math.abs(t.x - (i + 0.5) * slot), short).toBeLessThanOrEqual(slot / 2 + 1e-6);
    });
    expect(new Set(names.map((l) => l.y)).size, 'one row').toBe(1);
    const x = (s) => names.find((l) => l.text === s).x;
    expect(x('TIMOTHY')).toBeLessThan(x('HOLY DAYS'));
    expect(x('HOLY DAYS')).toBeLessThan(x('MTAM'));
  });

  it('w5: the PC and the landscape phone name every collection on one row, abbreviated only as far as one row needs', () => {
    for (const [wCss, hCss, dpr] of /** @type {Array<[number, number, number]>} */ ([[1920, 1080, 1], [1600, 900, 1], [891, 411, 2.6]])) {
      const f = frame(wCss, dpr, hCss);
      const ctx = recordingCtx();
      drawPersonalWeb(ctx, null, null, f.opts);
      const names = topRailLabels(ctx, f);
      const tag = wCss + ' x ' + hCss + ': ' + names.map((l) => l.text).join(' ');
      expect(names.length, tag).toBe(CHAIN.length);
      expect(new Set(names.map((l) => l.y)).size, tag).toBe(1);
      // a PC needs no abbreviation at all
      if (wCss >= 1600) names.forEach((l, i) => expect(l.text, tag).toBe(CHAIN[i][1].toUpperCase()));
    }
  });

  it('w4 review: with the panel docked over the right of the frame, every name stands in the canvas area, centred on what it holds of its band', () => {
    for (const [wCss, hCss, dpr, panel] of /** @type {Array<[number, number, number, number]>} */ ([[1600, 900, 1, 400], [891, 411, 2.6, 300]])) {
      const f = frame(wCss, dpr, hCss);
      const area = f.W - panel * dpr;
      const ctx = recordingCtx();
      drawPersonalWeb(ctx, null, null, Object.assign({}, f.opts, { areaWidth: area }));
      const names = topRailLabels(ctx, f);
      expect(names.length).toBeGreaterThan(5);
      for (const l of names) expect(l.right, `${wCss}: ${l.text}`).toBeLessThanOrEqual(area + 1e-6);
      // the bands wholly under the panel go unnamed; every band wholly left of it is named. The
      // band its edge cuts is named by its family's own form or not at all (w4 fix round 2: it
      // stepped down to its badge, "LT" or "HD", where no sibling wore one; this pinned it named)
      const slot = f.W / CHAIN.length;
      const all = names.map((l) => l.text).join(',');
      const at = (i) => names.find((l) => formsOf(i).includes(l.text));
      CHAIN.forEach((_, i) => {
        if (i * slot >= area) expect(at(i), `${all}: ${CHAIN[i][1]} is under the panel`).toBeUndefined();
        else if ((i + 1) * slot <= area) expect(at(i), `${all}: ${CHAIN[i][1]} is whole`).toBeTruthy();
        else if (at(i)) expect(at(i).text, all).toBe(formsOf(i)[0]);
      });
    }
  });

  /* w4 fix round 2 (review, major): panning a zoomed Volumes rail flipped a whole family between
     its names and its nav badges ("VOL III | VOL IV | VOL V" to "V3 | V4 | V5 | V6 | V7" and
     back) because a band cut to a sliver by the screen or panel edge failed the room test and
     stepped its family down, and at the docked panel's edge TIMOTHY read "LT". A cut band never
     steps its family: it takes its family's form, or none, and its name comes back as the band
     comes on screen. */
  const ZOOM = 5, STEPS = 40;
  const formAt = new Map();
  // a collection whose badge is its name (MTAM, LAMB) has the one form, 0
  CHAIN.forEach((_, i) => formsOf(i).forEach((t, k) => { if (!formAt.has(t)) formAt.set(t, { i, k }); }));
  /** The names of one frame, keyed to their collection and form (0 the name, 1 the badge). */
  const read = (f, extra) => {
    const ctx = recordingCtx();
    drawPersonalWeb(ctx, null, null, Object.assign({}, f.opts, extra));
    return topRailLabels(ctx, f).map((l) => Object.assign({ text: l.text }, formAt.get(l.text)));
  };
  for (const [wCss, hCss, dpr, panel] of /** @type {Array<[number, number, number, number]>} */ ([
    [1600, 900, 1, 0], [891, 411, 2.6, 0], [732, 360, 2, 0], [1600, 900, 1, 400], [891, 411, 2.6, 300],
  ])) {
    it(`${wCss} x ${hCss} @${dpr}${panel ? `, panel ${panel}` : ''}: panning a ${ZOOM}x Volumes rail never flips a family between its names and its badges`, () => {
      const f = frame(wCss, dpr, hCss);
      const area = f.W - panel * dpr;
      const span = rail.span || rail.total;
      const slot = (f.W * ZOOM) / CHAIN.length;
      // the precondition: at 5x every slot is wider than any name in any form, so a band wholly
      // on screen never lacks room and its family has no reason to step down
      expect(slot).toBeGreaterThan(70 * dpr * 2);
      let prev = null;
      for (let s = 0; s < STEPS; s++) {
        const off = (s / (STEPS - 1)) * (ZOOM - 1) * f.W;
        const votX = (u) => (u / span) * f.W * ZOOM - off;
        const names = read(f, Object.assign({ votX }, panel ? { areaWidth: area } : {}));
        const where = `step ${s}: ` + names.map((n) => n.text).join(' | ');
        for (const n of names) expect(n.k, where).toBe(0);
        // every band wholly in the canvas area is named
        CHAIN.forEach((_, i) => {
          const x0 = i * slot - off, x1 = (i + 1) * slot - off;
          if (x0 >= 0 && x1 <= area) expect(names.some((n) => n.i === i), `${where}: ${CHAIN[i][1]} is whole and unnamed`).toBe(true);
        });
        // a family keeps its form from one step to the next
        const fam = new Map(names.map((n) => [CHAIN[n.i][4], n.k]));
        if (prev) for (const [g, k] of fam) if (prev.has(g)) expect(k, `${where}: ${g} changed form`).toBe(prev.get(g));
        prev = fam;
      }
    });
  }

  it('with the panel docked at fit, no family takes a tinier form than it has with the panel closed (w4 review: TIMOTHY read LT at the panel\'s edge)', () => {
    for (const [wCss, hCss, dpr, panel] of /** @type {Array<[number, number, number, number]>} */ ([
      [1600, 900, 1, 400], [891, 411, 2.6, 300], [732, 360, 2, 280], [891, 411, 2.6, 330], [891, 411, 2.6, 360],
    ])) {
      const f = frame(wCss, dpr, hCss);
      const open = new Map(read(f, {}).map((n) => [CHAIN[n.i][4], n.k]));
      for (const n of read(f, { areaWidth: f.W - panel * dpr })) {
        expect(n.k, `${wCss} panel ${panel}: ${n.text}`).toBeLessThanOrEqual(open.get(CHAIN[n.i][4]));
      }
    }
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
