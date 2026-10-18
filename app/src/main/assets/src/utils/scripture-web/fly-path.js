/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/fly-path — the camera's way from one place to another.
   Cluster F (bundle-d), used by ui/scripture-web/use-web-camera.js (flyTo).
   ═══════════════════════════════════════════════════════════════════════

   A3 (w2 digest): Follow and go-to fly, and a long hop zooms out then in, so
   the reader sees where they went from and where they landed (Gen 3:15 to
   Rev 12 is a long way along the canon). The path is van Wijk and Nuij's
   "smooth and efficient zooming and panning" (2003), the one d3's
   interpolateZoom draws: in the canvas area's own terms, its centre c and its
   width w in verses, it is the path the eye reads as shortest, rising to see
   both ends when they are far apart and nearly straight when they are close.
   rho (sqrt 2, the paper's and d3's) is how much it prefers to zoom out over
   panning. Pure: no camera, no view; the caller clamps w to its own fit. */

const RHO = Math.SQRT2;
const RHO2 = RHO * RHO, RHO4 = RHO2 * RHO2;

/**
 * The path from (c0, w0) to (c1, w1): `S` its length in the paper's units (0 when there is nowhere
 * to go), and `at(s)` the centre and width at s in [0, 1] of the way.
 * @param {number} c0  the start's centre, verses
 * @param {number} w0  the start's width, verses (> 0)
 * @param {number} c1
 * @param {number} w1
 * @returns {{ S: number, at: (s: number) => [number, number] }}
 */
export function flyPath(c0, w0, c1, w1) {
  const dx = c1 - c0;
  const d2 = dx * dx;
  if (!(w0 > 0) || !(w1 > 0)) return { S: 0, at: () => [c1, w1] };
  if (d2 < 1e-12) {
    // only the zoom changes: an exponential in w, so each step looks the same size
    const S = Math.log(w1 / w0) / RHO;
    return { S: Math.abs(S), at: (s) => [c0 + s * dx, w0 * Math.exp(RHO * s * S)] };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / RHO;
  const cosh0 = Math.cosh(r0), sinh0 = Math.sinh(r0);
  return {
    S,
    at: (s) => {
      if (s >= 1) return [c1, w1];
      const r = RHO * s * S + r0;
      const u = (w0 / (RHO2 * d1)) * (cosh0 * Math.tanh(r) - sinh0);
      return [c0 + u * dx, (w0 * cosh0) / Math.cosh(r)];
    },
  };
}

/** How long a fly of path length S takes, ms: the spec's 600-900 for a go-to, longer for a
 * longer hop (a neighbouring chapter is quick; Genesis to Revelation takes the most). */
export function flyMs(S) {
  return Math.round(Math.min(900, Math.max(600, 520 + 42 * Math.abs(S))));
}

/** The ease along the path: slow out, slow in. */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
