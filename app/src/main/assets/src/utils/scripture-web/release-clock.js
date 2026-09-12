/**
 * release-clock.js — the live cap's clock, pure so a unit test can drive it
 * with a fake `now` (the walk's arm R can only see it through the page).
 *
 * A gesture makes the picture LIVE (fraction 0: LIVE_CAP layers a bin) and
 * keeps it live for holdMs after the last one, so a run of wheel notches never
 * flickers between the two pictures. When the hold ends the fraction rises
 * from 0 to 1 over fadeMs (the coverage ease back to every layer), then the
 * clock is idle at 1. `pending` says a frame must be scheduled (live or
 * fading); the caller draws exactly when the clock says so and never polls.
 */

/**
 * @param {{ holdMs: number, fadeMs: number }} o
 * @returns {{ live: (now: number) => void, fraction: (now: number) => { f: number, pending: boolean } }}
 */
export function createReleaseClock({ holdMs, fadeMs }) {
  let liveUntil = 0, releaseAt = 0;
  return {
    live(now) { liveUntil = now + holdMs; releaseAt = 0; },
    fraction(now) {
      if (now < liveUntil) return { f: 0, pending: true };
      if (!liveUntil) return { f: 1, pending: false };
      if (!releaseAt) releaseAt = now;
      const f = Math.min(1, (now - releaseAt) / fadeMs);
      if (f >= 1) { liveUntil = 0; releaseAt = 0; return { f: 1, pending: false }; }
      return { f, pending: true };
    },
  };
}
