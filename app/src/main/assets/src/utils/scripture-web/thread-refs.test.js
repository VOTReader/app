// @ts-nocheck — the fixtures are hand-built graphs, typed loosely on purpose
/* Corbin's Scripture Web brief (2026-09-11), the two user-visible items:
     (a) "when zoomed close, each line shows its source and target beside it —
         the verse refs at the two feet, or at the body when the feet are
         off-screen"
     (b) "every line followable end to end: tapping a line highlights it and
         its two feet, and a follow control pans the camera to the far foot"
   The GEOMETRY of (a) and (b) lives in pick.js: threadEnds() says, for one
   thread, where each foot stands and — for a foot the frame does not hold —
   the body's nearest on-screen point, where its reference is written; and
   visibleArcs() enumerates the drawn threads a label pass walks. Both must
   use the SAME law the shader draws with (arcHeightAt, the fans, cam.y), so
   every case here derives its expectation from that law and not from a
   number typed in. The Canvas2D painting of the labels is unwitnessed under
   jsdom (no 2D context); the S22 look and the puppeteer strips are its witness.

   RED on the base tree: pick.threadEnds and pick.visibleArcs do not exist;
   the two module objects are read so the file LOADS on both trees and the
   count of reds can be quoted. */
import { describe, it, expect } from 'vitest';
import * as pick from './pick.js';
import * as geo from './geometry.js';
import { fansOf } from './decode.js';

const { arcShape, arcHeightAt, spanLogOf, squashFactor, createCamera, DOME } = geo;

function makeGraph(pairs, total = 100) {
  const chapters = [[0, 1, 0, 50], [0, 2, 50, 50]];
  const chapterOfVerse = new Uint16Array(total);
  for (let ci = 0; ci < chapters.length; ci++) {
    for (let v = 0; v < chapters[ci][3]; v++) chapterOfVerse[chapters[ci][2] + v] = ci;
  }
  const n = pairs.length;
  const from = new Uint16Array(n), to = new Uint16Array(n), votes = new Int16Array(n);
  pairs.forEach((p, i) => { from[i] = p[0]; to[i] = p[1]; votes[i] = 30; });
  return {
    total, count: n, from, to, votes,
    buckets: [{ off: 0, len: n, off20: n, off10: n, segments: 32, chunks: [] }],
    books: [{ id: 'alpha', title: 'Alpha', abbr: 'Alp', start: 0 }],
    chapters, chapterOfVerse, densityTiers: [20, 7],
    attribution: '', votEdges: [], prophecy: [], votLinks: [],
  };
}
const width = 1000, ceil = 240;
const viewOf = (base) => ({ width, height: base + 80, base, ceil, squash: squashFactor(ceil, width), localize: 1, density: 'famous', rulerDepth: 40 });
const camAt = (g, x, y = 0) => {
  const cam = createCamera(g.total);
  cam.ppv = 40; cam.x = x; cam.y = y;
  return cam;
};
/** the drawn height at screen x of thread i, by the law the shader uses */
function heightAt(g, cam, view, i, x) {
  const x0 = (g.from[i] - cam.x) * cam.ppv + width / 2, x1 = (g.to[i] - cam.x) * cam.ppv + width / 2;
  const rx = (x1 - x0) / 2, sl = spanLogOf(g.to[i] - g.from[i], g.total);
  const { fanA, fanB } = fansOf(g);
  const L = arcShape(rx, ceil, view.squash, view.localize, sl, fanA[i]);
  const R = arcShape(rx, ceil, view.squash, view.localize, sl, fanB[i]);
  // the strata (the density law, part 3): a thread whose feet have both left
  // the frame is lifted into its band; the label sits on the LIFTED body
  const lift = geo.strataLift(g.to[i] - g.from[i], g.total, x0, x1, width, ceil, view.localize);
  return arcHeightAt(x, x0, x1, L.R, R.R, L.A, DOME * view.localize) + lift;
}

describe('threadEnds: where a thread\'s references are written', () => {
  it('is exported (RED on the base tree)', () => {
    expect(pick.threadEnds, 'pick.threadEnds is not exported on this tree').toBeTypeOf('function');
    expect(pick.visibleArcs, 'pick.visibleArcs is not exported on this tree').toBeTypeOf('function');
  });

  it('a foot the frame holds is reported at its screen x with no body point; the other foot, off-screen right, gets the body\'s point at the frame\'s right edge', () => {
    const g = makeGraph([[5, 35]]);
    const view = viewOf(520);
    const cam = camAt(g, 12);                       // from at x 220 (on screen), to at x 1420 (off)
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.from.verse).toBe(5);
    expect(ends.to.verse).toBe(35);
    expect(ends.from.onScreen).toBe(true);
    expect(ends.from.x).toBeCloseTo(220, 6);
    expect(ends.from.at).toBeNull();
    expect(ends.to.onScreen).toBe(false);
    expect(ends.to.at).not.toBeNull();
    expect(ends.to.at.x).toBeCloseTo(width, 0);
    // the point is ON the drawn curve: y = base - h(x) by the shader's law
    expect(ends.to.at.y).toBeCloseTo(view.base - heightAt(g, cam, view, 0, ends.to.at.x), 0);
    // the right quarter descends toward its foot: read left to right the tangent points down the frame, angle > 0
    expect(ends.to.at.angle).toBeGreaterThan(0);
    expect(ends.to.at.angle).toBeLessThan(Math.PI / 2);
  });

  it('both feet off-screen: the body enters at the left edge and leaves at the right, each end labelled at its own edge', () => {
    const g = makeGraph([[5, 35]]);
    const view = viewOf(520);
    const cam = camAt(g, 20);                       // x0 = -100, x1 = 1100
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.from.onScreen).toBe(false);
    expect(ends.to.onScreen).toBe(false);
    expect(ends.from.at.x).toBeCloseTo(0, 0);
    expect(ends.to.at.x).toBeCloseTo(width, 0);
    expect(ends.from.at.y).toBeCloseTo(view.base - heightAt(g, cam, view, 0, ends.from.at.x), 0);
    expect(ends.from.at.angle).toBeLessThan(0);     // the left quarter climbs away from its foot: read left to right it points up the frame
    expect(ends.to.at.angle).toBeGreaterThan(0);
  });

  it('the camera\'s y moves the body\'s point down the frame by exactly cam.y (RED if the labels ignore the y the shader draws with)', () => {
    const g = makeGraph([[5, 35]]);
    const view = viewOf(520);
    const flat = pick.threadEnds(g, camAt(g, 12, 0), view, 0);
    const raised = pick.threadEnds(g, camAt(g, 12, 100), view, 0);
    expect(raised.to.at.x).toBeCloseTo(flat.to.at.x, 0);
    expect(raised.to.at.y - flat.to.at.y).toBeCloseTo(100, 0);
  });

  it('a body that climbs past the frame top from an on-screen foot is labelled where it crosses the top: the far foot has its nearest on-screen point on the near quarter', () => {
    const g = makeGraph([[5, 35]]);
    const view = viewOf(100);                       // a sky 100 px tall under a 240 px ceiling: the crown is above the frame
    const cam = camAt(g, 12);                       // from at x 220 (on screen), to at 1420 (off)
    expect(heightAt(g, cam, view, 0, width / 2), 'precondition: the crown is above the frame').toBeGreaterThan(view.base);
    expect(heightAt(g, cam, view, 0, width), 'precondition: the right edge is above the frame too').toBeGreaterThan(view.base);
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.from.at).toBeNull();
    expect(ends.to.at.y).toBeCloseTo(0, 0);
    expect(ends.to.at.x).toBeGreaterThan(220);
    expect(ends.to.at.x).toBeLessThan(width);
    // and it is the crossing, not a sample near it: the height there is the frame's own
    expect(heightAt(g, cam, view, 0, ends.to.at.x)).toBeCloseTo(view.base, 0);
    // climbing toward the top, read left to right
    expect(ends.to.at.angle).toBeLessThan(0);
  });

  it('the chrome across the top is not sky: with view.inset the crossing is found at the inset line, not at the frame top (RED if the labels ignore it)', () => {
    const g = makeGraph([[5, 35]]);
    const view = Object.assign(viewOf(100), { inset: 40 });
    const cam = camAt(g, 12);
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.to.at.y).toBeCloseTo(40, 0);
    expect(heightAt(g, cam, view, 0, ends.to.at.x)).toBeCloseTo(view.base - 40, 0);
  });

  it('a foot within the fly-over margin but off the frame is off-screen: its reference goes on the body, not on a ruler tick nobody sees', () => {
    const g = makeGraph([[5, 35]]);
    const view = viewOf(520);
    const cam = camAt(g, 17.75);                    // from at x -10 (10 px off the left edge, inside FLYOVER_MARGIN)
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.from.x).toBeCloseTo(-10, 6);
    expect(ends.from.onScreen).toBe(false);
    expect(ends.from.at).not.toBeNull();
    expect(ends.from.at.x).toBeCloseTo(0, 0);
  });

  it('a fly-over labelled on its run sits on the DOME, not on a level run (RED if the label pass reads a flat arc)', () => {
    const g = makeGraph([[0, 99]]);
    const view = viewOf(520);
    const cam = camAt(g, 50);                       // x0 = -1500, x1 = 2460: both edges are on the run
    const ends = pick.threadEnds(g, cam, view, 0);
    expect(ends.from.at.x).toBeCloseTo(0, 0);
    const x0 = (0 - cam.x) * cam.ppv + width / 2, x1 = (99 - cam.x) * cam.ppv + width / 2;
    const { R, A } = arcShape((x1 - x0) / 2, ceil, view.squash, 1, spanLogOf(99, g.total));
    expect(x0 + R, 'precondition: the left edge is past the left quarter').toBeLessThan(0);
    expect(x1 - R, 'precondition: the right edge is before the right quarter').toBeGreaterThan(width);
    const level = view.base - A;
    expect(Math.abs(ends.from.at.y - level), 'the dome lifts the run here by a visible amount').toBeGreaterThan(8);
    expect(ends.from.at.y).toBeCloseTo(view.base - heightAt(g, cam, view, 0, ends.from.at.x), 0);
    expect(ends.to.at.y).toBeCloseTo(view.base - heightAt(g, cam, view, 0, ends.to.at.x), 0);
  });

  it('a thread with nothing on screen has no body point at either end', () => {
    const g = makeGraph([[5, 35]]);
    const ends = pick.threadEnds(g, camAt(g, 90), viewOf(520), 0);   // both feet 2,000+ px to the left
    expect(ends.from.at).toBeNull();
    expect(ends.to.at).toBeNull();
  });
});

describe('visibleArcs: the drawn threads a label pass walks', () => {
  it('returns the threads whose span crosses the frame, in draw order, and not the ones wholly off it', () => {
    const g = makeGraph([[5, 35], [60, 70], [0, 99], [30, 31]]);
    const view = viewOf(520);
    const cam = camAt(g, 20);                       // frame holds verses 7.5 .. 32.5
    const got = Array.from(pick.visibleArcs(g, cam, view, 100));
    expect(got).toEqual([0, 2, 3]);
  });

  it('honours the density prefix: a thread past bucketDrawCount is not drawn, so it is not walked', () => {
    const g = makeGraph([[5, 35], [10, 20]]);
    g.buckets = [{ off: 0, len: 2, off20: 1, off10: 2, segments: 32, chunks: [] }];   // Essential draws one, Famous both
    const view = Object.assign(viewOf(520), { density: 'essential' });
    const got = Array.from(pick.visibleArcs(g, camAt(g, 20), view, 100));
    expect(got).toEqual([0]);
  });

  it('stops at the limit', () => {
    const g = makeGraph([[5, 35], [10, 20], [12, 22]]);
    expect(Array.from(pick.visibleArcs(g, camAt(g, 20), viewOf(520), 2))).toHaveLength(2);
  });
});
