// @ts-nocheck
/**
 * The lens, retired, and the centre chapter that replaces it (Q2, spec 4.4;
 * CONTRACTS.md section 5). The lens (landing 10) kept every thread outside
 * the chapter under the frame's centre at 0.35 of its ink from 6x; Corbin's
 * call (Q2) is that nothing dims as the reader zooms. The chapter under the
 * canvas area's centre is EMPHASISED instead: its own arcs (a foot inside
 * it) brighter (x CENTRE_BRIGHT) and wider (x CENTRE_WIDTH), eased in from
 * 6x to full at 24x, and held while the centre stays near it so a pan that
 * grazes a boundary does not flicker. The rest of the web is left exactly as
 * it was: drawn, tappable, counted.
 *
 * This file pinned LENS_CONTEXT, the uLens/uLensDim shader lines and the
 * lens-dimmed pills; those cases are rewritten to the new law (digest
 * section 5 retires the lens). The cases that were never about dimming (the
 * pills hide nothing, the Nearby list, lensRange's chapter, hides nothing)
 * are kept as they were.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as geo from './geometry.js';
import * as dec from './decode.js';
import * as pick from './pick.js';
import * as frame from './web-frame.js';
import { CENTRE_BRIGHT, CENTRE_WIDTH } from './sw-ink.js';
import { SHADER_SOURCE } from '../../ui/scripture-web/web-renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');
const graph = dec.decodeGraph(runInNewContext(readFileSync(ASSET, 'utf8') + ';SCRIPTURE_WEB_DATA', {}));

const DPR = 2, W = 800 * DPR;
// the frame the pills and the labels read (E1: they walk its visible set): phone landscape
const CEIL = 256 * DPR, BASE = CEIL / 0.985, SQUASH = geo.squashFactor(CEIL, W);
const psalm107 = (() => {
  for (let ci = 0; ci < graph.chapters.length; ci++) {
    const ch = graph.chapters[ci];
    if (graph.books[ch[0]].id.startsWith('psalms') && ch[1] === 107) return { ci, ch };
  }
  throw new Error('Psalm 107 missing from the asset');
})();
const CENTRE = psalm107.ch[2] + psalm107.ch[3] / 2;
function camAt(zoom, x = CENTRE) {
  const cam = geo.createCamera(graph.total);
  cam.ppv = geo.fitPPV(cam, W) * zoom;
  cam.x = x;
  return cam;
}

describe('the lens is retired: nothing dims as the reader zooms (Q2)', () => {
  it('exports no LENS_CONTEXT or lensShareAt, and the shader has no uLens or uLensDim', () => {
    expect('LENS_CONTEXT' in geo).toBe(false);
    expect('lensShareAt' in geo).toBe(false);
    expect(SHADER_SOURCE.vertex).not.toMatch(/uLens|uLensDim|lensOn/);
  });

  it('the vertex stage dims a thread for one reason only, a tap: no zoom, centre or fly-over term multiplies the alpha down', () => {
    // every `dim` assignment, and every factor of the alpha that is not the
    // tap's own, is listed here; a new one has to be argued into this case
    const dims = SHADER_SOURCE.vertex.match(/\bdim\s*\*?=[^;]*;/g) || [];
    expect(dims.length).toBe(1);
    expect(dims[0]).toMatch(/focusing|uTapFade/);
    // the centre's factor on the alpha is a boost from 1 (mix(1., CENTRE_BRIGHT, cT)), never a cut
    expect(CENTRE_BRIGHT).toBeGreaterThan(1);
    expect(SHADER_SOURCE.vertex).toContain('mix(1., ' + geo.glslFloat(CENTRE_BRIGHT) + ', cT)');
  });

  it('the count at each foot dims nothing: geometry.lensDimFor is 1 inside the centre chapter and out', () => {
    const lens = pick.chapterRange(graph, psalm107.ci);
    expect(geo.lensDimFor(lens[0] - 40, lens[0] - 1, lens)).toBe(1);
    expect(geo.lensDimFor(lens[1] + 1, lens[1] + 3, lens, 0.35)).toBe(1);
    expect(geo.lensDimFor(lens[0], lens[1], lens)).toBe(1);
  });

  it('the pills count every thread at a cell and hide none: at 12x the cells carry thousands of feet, hidden 0', () => {
    const cam = camAt(12);
    const view = { width: W, base: BASE, squash: SQUASH, density: 'famous' };
    const cells = pick.footBundles(graph, cam, view, DPR);
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) expect(c.hidden).toBe(0);
    const total = cells.reduce((s, c) => s + c.drawn, 0);
    expect(total).toBeGreaterThan(1000);
  });
});

describe('the centre chapter is emphasised, gradually (spec 4.4, C20)', () => {
  it('the shader draws a centre arc (a foot in uCentre) wider and brighter by uCentreT, through the ink table\'s numbers', () => {
    expect(SHADER_SOURCE.vertex).toMatch(/uniform vec2\s+uCentre;/);
    expect(SHADER_SOURCE.vertex).toMatch(/uniform float uCentreT;/);
    expect(SHADER_SOURCE.vertex).toContain('float cT = uCentreT*inCentre*centreShortness(tSpan);');
    expect(SHADER_SOURCE.vertex).toContain('halfW *= mix(1., ' + geo.glslFloat(CENTRE_WIDTH) + ', cT);');
    // a foot in the half-open range [x0, x1), either foot
    expect(SHADER_SOURCE.vertex).toMatch(/a >= uCentre\.x && a < uCentre\.y\) \|\| \(b >= uCentre\.x && b < uCentre\.y/);
  });

  it('lifts the centre\'s own LOCAL arcs: a long leg through it is a hairline like any other (w4 INK review)', () => {
    // the emphasis rides on the span's own shortness at the w4 reach (geometry.centreShortness, 10 to
    // 56 verses; the wider span-ink plateau leaves it), so chapter 53's hundreds of reaches to the
    // New Testament do not become the widest, brightest fan on the screen at depth
    expect(SHADER_SOURCE.vertex).toContain('float cT = uCentreT*inCentre*centreShortness(tSpan);');
    const TOTAL = 31102;
    const at = (z, span) => frame.centreEmphasis(geo.localizeFactor(z), geo.centreShortness(geo.spanT(span, TOTAL)));
    for (const z of [24, 207, 1711]) {
      expect(at(z, 4).bright, `zoom ${z}: a local arc`).toBeCloseTo(CENTRE_BRIGHT, 12);
      expect(at(z, 4).width).toBeCloseTo(CENTRE_WIDTH, 12);
      expect(at(z, 9000), `zoom ${z}: Isaiah 53 to 1 Peter`).toEqual({ bright: 1, width: 1 });
      expect(at(z, 600)).toEqual({ bright: 1, width: 1 });
      // a span inside the ease (10 to 56 verses: CENTRE_T0 / CENTRE_T1, the w4 review 2's reach) is part lifted
      expect(at(z, 80)).toEqual({ bright: 1, width: 1 });
      const mid = at(z, 30);
      expect(mid.bright).toBeGreaterThan(1);
      expect(mid.bright).toBeLessThan(CENTRE_BRIGHT);
    }
    // the one-argument twin is the local arc's (shortness 1), as before
    expect(frame.centreEmphasis(1)).toEqual(frame.centreEmphasis(1, 1));
  });

  it('centreEmphasis (the shader\'s twin): 1 below 6x, full from 24x, never a jump of half the emphasis in one + press', () => {
    const at = (z) => frame.centreEmphasis(geo.localizeFactor(z));
    expect(at(1)).toEqual({ bright: 1, width: 1 });
    expect(at(geo.LOCALIZE_START)).toEqual({ bright: 1, width: 1 });
    expect(at(24).bright).toBeCloseTo(CENTRE_BRIGHT, 12);
    expect(at(24).width).toBeCloseTo(CENTRE_WIDTH, 12);
    expect(at(1711).bright).toBeCloseTo(CENTRE_BRIGHT, 12);
    let worst = 0;
    for (let z = 1; z < 2000; z *= 1.01) {
      const step = at(z * 1.6).bright - at(z).bright;
      expect(step).toBeGreaterThanOrEqual(-1e-12);
      worst = Math.max(worst, step);
    }
    expect(worst).toBeLessThan((CENTRE_BRIGHT - 1) / 2);
  });

  it('centreRange is the chapter under the frame\'s centre past 6x, null at the overview, and agrees with pick.lensRange with no panel open', () => {
    expect(frame.centreRange(graph, camAt(1), W, 0, null)).toBeNull();
    expect(frame.centreRange(graph, camAt(5.9), W, 0, null)).toBeNull();
    const own = pick.chapterRange(graph, psalm107.ci);
    for (const zoom of [6, 12, 30, 400, geo.maxZoomFor(graph.total, W / DPR)]) {
      expect(frame.centreRange(graph, camAt(zoom), W, 0, null), `zoom ${zoom}`).toEqual(own);
      expect(pick.lensRange(graph, camAt(zoom), W), `zoom ${zoom}`).toEqual(own);
    }
  });

  it('reads the canvas area\'s centre: with a panel covering the right 400 CSS px, the chapter mid-picture', () => {
    const next = graph.chapters[psalm107.ci + 1];
    const cam = camAt(400, next[2] + 2);
    expect(frame.centreRange(graph, cam, W, 0, null)).toEqual(pick.chapterRange(graph, psalm107.ci + 1));
    // the picture's centre sits inset / 2 to the left of the frame's: Psalm 107's last verses
    const inset = 400 * DPR;
    const shiftVerses = inset / (2 * cam.ppv);
    expect(shiftVerses).toBeGreaterThan(2);
    expect(frame.centreRange(graph, cam, W, inset, null)).toEqual(pick.chapterRange(graph, psalm107.ci));
  });

  it('holds the chapter while the centre stays within 15 % of it, then lets go', () => {
    const own = pick.chapterRange(graph, psalm107.ci);
    const width = own[1] + 1 - own[0];
    const zoom = 12;
    const cam = camAt(zoom);
    const frameVerses = W / cam.ppv;
    const hold = frame.CENTRE_HOLD * Math.min(width, frameVerses);
    expect(frame.CENTRE_HOLD).toBe(0.15);
    // just past the chapter's end, inside the hold: still Psalm 107
    cam.x = own[1] + 1 + hold * 0.9;
    expect(frame.centreRange(graph, cam, W, 0, own)).toBe(own);
    // with nothing held the same place is the next chapter
    expect(frame.centreRange(graph, cam, W, 0, null)).toEqual(pick.chapterRange(graph, psalm107.ci + 1));
    // past the hold: the next chapter
    cam.x = own[1] + 1 + hold * 1.1;
    expect(frame.centreRange(graph, cam, W, 0, own)).toEqual(pick.chapterRange(graph, psalm107.ci + 1));
    // and on the left edge the same
    cam.x = own[0] - hold * 0.9;
    expect(frame.centreRange(graph, cam, W, 0, own)).toBe(own);
  });

  it('the hold is never wider than 15 % of the frame: at the ceiling a long chapter lets go within a few verses', () => {
    let ci = -1;
    for (let k = 0; k < graph.chapters.length; k++) if (graph.chapters[k][3] > 150) { ci = k; break; }
    expect(ci, 'PRECONDITION: a chapter over 150 verses (Psalm 119)').toBeGreaterThanOrEqual(0);
    const own = pick.chapterRange(graph, ci);
    const ceil = geo.maxZoomFor(graph.total, W / DPR);
    const cam = camAt(ceil, own[1] + 1 + 6);
    expect(frame.centreRange(graph, cam, W, 0, own)).not.toBe(own);
  });

  it('centreOf over the centre range is the chapter, half-open, with t = localizeFactor (the contract\'s shape)', () => {
    const own = pick.chapterRange(graph, psalm107.ci);
    const c = frame.centreOf(graph, frame.centreRange(graph, camAt(12), W, 0, null), 12);
    expect(c).toEqual({ chapterIndex: psalm107.ci, book: psalm107.ch[0], chapter: 107,
      x0: own[0], x1: own[1] + 1, t: geo.localizeFactor(12) });
  });
});

describe('the Nearby list reads the lens (landing 15)', () => {
  it('nearbyChapter is the lens chapter past the overview and the centre chapter at fit; -1 for an empty graph', () => {
    expect(pick.nearbyChapter(graph, camAt(12), W)).toBe(psalm107.ci);
    // at fit there is no lens: the chapter under the centre verse (the camera's x), whatever it is
    expect(pick.nearbyChapter(graph, camAt(1), W)).toBe(graph.chapterOfVerse[Math.round(camAt(1).x)]);
    const next = graph.chapters[psalm107.ci + 1];
    expect(pick.nearbyChapter(graph, camAt(1, next[2] + 1), W)).toBe(psalm107.ci + 1);
    expect(pick.nearbyChapter({ count: 0 }, camAt(12), W)).toBe(-1);
  });

  it('nearbyThreads: every thread touches the chapter, the strongest lead, nothing is hidden by the cut but the tail', () => {
    const [lo, hi] = pick.chapterRange(graph, psalm107.ci);
    const all = pick.nearbyThreads(graph, lo, hi, 'famous', 0);
    const top = pick.nearbyThreads(graph, lo, hi, 'famous', 36);
    expect(all.length).toBe(pick.countTouching(graph, lo, hi, 'famous'));
    expect(top).toEqual(all.slice(0, 36));
    for (const i of top) {
      const a = graph.from[i], b = graph.to[i];
      expect((a >= lo && a <= hi) || (b >= lo && b <= hi)).toBe(true);
    }
    for (let k = 1; k < all.length; k++) expect(graph.votes[all[k - 1]]).toBeGreaterThanOrEqual(graph.votes[all[k]]);
  });
});

describe('the lens is the chapter under the frame\'s centre, past the overview only', () => {
  it('is null at fit and below 6x; at 6x and past it is Psalm 107\'s own range when the frame is centred there', () => {
    expect(pick.lensRange(graph, camAt(1), W)).toBeNull();
    expect(pick.lensRange(graph, camAt(5.9), W)).toBeNull();
    const [lo, hi] = pick.chapterRange(graph, psalm107.ci);
    for (const zoom of [6, 12, 30, 400, geo.maxZoomFor(graph.total, W / DPR)]) {
      expect(pick.lensRange(graph, camAt(zoom), W), `zoom ${zoom}`).toEqual([lo, hi]);
    }
  });

  it('slides with the pan: centred on the next chapter it is that chapter; centred on a verse of the previous one, that one', () => {
    const next = graph.chapters[psalm107.ci + 1], prev = graph.chapters[psalm107.ci - 1];
    expect(pick.lensRange(graph, camAt(30, next[2] + 2), W)).toEqual(pick.chapterRange(graph, psalm107.ci + 1));
    expect(pick.lensRange(graph, camAt(30, prev[2] + prev[3] - 1 + 0.5), W)).toEqual(pick.chapterRange(graph, psalm107.ci - 1));
  });

  it('holds whatever the camera\'s height: the lens is a range of verses, not of pixels', () => {
    const cam = camAt(12);
    cam.y = 900;
    expect(pick.lensRange(graph, cam, W)).toEqual(pick.chapterRange(graph, psalm107.ci));
  });

  it('is null for an empty graph or a frame with no width', () => {
    expect(pick.lensRange({ count: 0 }, camAt(12), W)).toBeNull();
    expect(pick.lensRange(graph, camAt(12), 0)).toBeNull();
  });

  it('hides nothing: the picker\'s drawn set at 12x is the same with the lens as without', () => {
    const cam = camAt(12);
    const view = { width: W, base: BASE, squash: SQUASH, dpr: DPR, localize: geo.localizeFactor(12), density: 'famous' };
    const without = pick.visibleArcs(graph, cam, view, 1e9);
    const lens = pick.lensRange(graph, cam, W);
    const withLens = pick.visibleArcs(graph, cam, Object.assign({}, view, { lens }), 1e9);
    expect(withLens.length).toBe(without.length);
    expect(without.length).toBeGreaterThan(10000);
  });
});
