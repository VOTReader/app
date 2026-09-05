/* rail-camera — the Volumes rail rides the same camera as scripture (M1).
   ─────────────────────────────────────────────────────────────────────────
   Corbin, on My Web: only the Bible half zooms. The cause is a per-layer
   coordinate mapping, not a hit-test bound. `endpointPoint` sent a scripture
   endpoint through the camera (`verseX`) and a Volumes endpoint through the
   VIEWPORT (`(pos + 0.5) / n * width`), so the bottom rail spread on zoom and
   the top rail stayed pinned to the screen.

   Three places mapped a rail position to x, not one: the endpoint, and the
   two ends of every collection's segment band. Moving only the endpoint would
   be worse than moving nothing — before, both readings were wrong and at
   least AGREED; after a half-fix they disagree by construction and every
   endpoint drifts off the label that names it. `segmentSpan` is the shared
   mapping, and the containment case below is the guard that a half-fix fails.

   design-perf's spec target M1 (scripture-web-depth/spec.md): "one camera,
   two axes. A top-rail endpoint at position p of n maps through the same
   camera as a verse at (p + 0.5) / n · total … top-rail item pitch is
   zoom · W / n". The 44 px zoom ceiling (Z1) and the ribbon shape/dim work
   (D1, S1-S4) are a separate branch; this file is M1 only.
*/
import { describe, it, expect } from 'vitest';
import { buildVotRail } from '../../utils/scripture-web/personal-graph.js';
import { createCamera, fitPPV, verseToX } from '../../utils/scripture-web/geometry.js';
import { endpointPoint, railFrame, segmentSpan, votRailX } from './rail-renderer.js';

/** Two collections, five letters — enough for a band with a neighbour. */
const rail = buildVotRail([
  { volKey: 'one', label: 'Volume One', short: 'Vol I', items: [
    { id: 'a1', title: 'A1' }, { id: 'a2', title: 'A2' }, { id: 'a3', title: 'A3' }] },
  { volKey: 'two', label: 'Volume Two', short: 'Vol II', items: [
    { id: 'b1', title: 'B1' }, { id: 'b2', title: 'B2' }] },
]);

const W = 1000;
const TOTAL = 31102;               // verses in the canon, the camera's own axis
const RAILS = railFrame({ H: 600, DPR: 1 }, 500);

/** Renderer opts with the camera parked at `zoom` × fit, centred. */
function optsAt(zoom) {
  const cam = createCamera(TOTAL);
  cam.ppv = fitPPV(cam, W) * zoom;
  return {
    width: W, height: 600, H: 600, DPR: 1, base: 500, votRail: rail,
    verseTotal: cam.total,
    verseX: (verse) => verseToX(cam, W, verse),
  };
}

describe('M1 — both halves zoom', () => {
  it('spreads the Volumes rail with the camera: item pitch is zoom · W / n', () => {
    // BEFORE: pitch is W / n at every zoom — the top rail is pinned to the
    // screen, which is the whole of the defect Corbin reported.
    for (const zoom of [1, 40, 400]) {
      const o = optsAt(zoom);
      const pitch = votRailX(1.5, o) - votRailX(0.5, o);
      expect(pitch, 'pitch at ' + zoom + 'x').toBeCloseTo(zoom * W / rail.total, 6);
    }
  });

  it('scales both endpoints of a cross link by the same factor when the camera zooms', () => {
    // "Both halves move together" measured as the thing that is actually
    // true of an affine camera: displacement from the screen centre scales
    // by the zoom ratio, for a scripture endpoint and a Volumes endpoint
    // alike. design-perf's tolerance is ±0.5 px.
    const at = (zoom) => {
      const o = optsAt(zoom);
      return [
        endpointPoint({ rail: 0, pos: 9000 }, o, RAILS)[0] - W / 2,
        endpointPoint({ rail: 1, pos: 3 }, o, RAILS)[0] - W / 2,
      ];
    };
    const [bible1, vot1] = at(1);
    const [bible40, vot40] = at(40);
    expect(bible40 / bible1, 'scripture endpoint').toBeCloseTo(40, 6);
    expect(vot40 / vot1, 'Volumes endpoint').toBeCloseTo(40, 6);
    expect(Math.abs(vot40 - vot1 * 40), 'Volumes endpoint, in px').toBeLessThan(0.5);
  });

  it('keeps every endpoint inside its own collection band, at 1x and at depth', () => {
    // THIS CASE PASSES ON MAIN. On main the endpoint and the band are both
    // pinned to the viewport, so they agree by accident. Its job is the
    // HALF-FIX: send the endpoint through the camera and leave the bands on
    // the viewport and every endpoint lands outside the label naming it.
    // Proven to bite by a poison run, not asserted — see the handoff.
    for (const zoom of [1, 40, 400]) {
      const o = optsAt(zoom);
      for (const seg of rail.segments) {
        const span = segmentSpan(seg, o);
        if (!span) continue;                       // off screen: nothing drawn
        for (let p = seg.start; p < seg.start + seg.count; p++) {
          const x = endpointPoint({ rail: 1, pos: p }, o, RAILS)[0];
          expect(x, 'endpoint ' + p + ' at ' + zoom + 'x').toBeGreaterThanOrEqual(span.x0);
          expect(x, 'endpoint ' + p + ' at ' + zoom + 'x').toBeLessThanOrEqual(span.x1);
        }
      }
    }
  });

  it('is identical to the pinned-to-viewport mapping at fit zoom (D2: 1x does not move)', () => {
    // The control that comes free with the fix. At fit zoom the two forms are
    // algebraically equal — fitPPV = W / total and cam.x = total / 2 give
    // verseToX(v) = v · W / total, and substituting (p + 0.5) / n · total
    // returns (p + 0.5) / n · W exactly. So ANY difference at 1x is a scale
    // error I did not intend, which is what makes this a real bite-catcher
    // rather than a restatement of the fix.
    const o = optsAt(1);
    for (let p = 0; p < rail.total; p++) {
      expect(votRailX(p + 0.5, o), 'endpoint ' + p).toBeCloseTo(((p + 0.5) / rail.total) * W, 9);
    }
    for (const seg of rail.segments) {
      const span = segmentSpan(seg, o);
      expect(span.x0).toBeCloseTo((seg.start / rail.total) * W, 9);
      expect(span.x1).toBeCloseTo(((seg.start + seg.count) / rail.total) * W, 9);
      // A fully visible band claims its whole width for its label, exactly as
      // before — the clip below only ever narrows a band that runs off screen.
      expect(span.room).toBeCloseTo(span.x1 - span.x0, 9);
      expect(span.labelX).toBeCloseTo((span.x0 + span.x1) / 2, 9);
    }
  });

  it('drops a band that has left the frame and clips the label of one that straddles it', () => {
    // At depth most of the rail is off screen. A band that misses the frame
    // is not measured or painted; a band the frame cuts keeps its label on
    // the visible part, because a name printed at the true midpoint of a
    // 40-screen-wide band is a name nobody ever sees.
    const o = optsAt(400);
    const spans = rail.segments.map((seg) => segmentSpan(seg, o));
    expect(spans.some((s) => s === null), 'some band is off screen at 400x').toBe(true);
    for (const [i, span] of spans.entries()) {
      if (!span) continue;
      expect(span.labelX, 'band ' + i + ' label x').toBeGreaterThanOrEqual(0);
      expect(span.labelX, 'band ' + i + ' label x').toBeLessThanOrEqual(W);
      expect(span.room, 'band ' + i + ' room').toBeLessThanOrEqual(W);
    }
  });

  it('refuses to render a top-rail x when the camera verse count is missing', () => {
    // A missing verseTotal makes every top-rail x NaN: an invisible rail and
    // a dead hit test, which reads as a rendering bug rather than the wiring
    // bug it is. A null must never be able to impersonate a value.
    const o = optsAt(1);
    delete o.verseTotal;
    expect(() => votRailX(0.5, o)).toThrow(/verseTotal/);
  });
});
