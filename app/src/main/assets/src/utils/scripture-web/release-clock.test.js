// The unit form of tools/e2e-myweb-r2.mjs arm R (the release fade), driven by
// a fake clock: no browser, no launch state, no GPU. Fails with the fade
// removed (f = 1 after the hold: the Verifier's bite iii), proven RED first.
import { describe, expect, it } from 'vitest';
import { createReleaseClock } from './release-clock.js';

const HOLD = 150, FADE = 250;
const clock = () => createReleaseClock({ holdMs: HOLD, fadeMs: FADE });

describe('release clock', () => {
  it('is idle at 1 before any gesture and needs no frame', () => {
    expect(clock().fraction(1000)).toEqual({ f: 1, pending: false });
  });

  it('holds 0 for holdMs after the last gesture, then eases to 1 over fadeMs', () => {
    const c = clock();
    c.live(1000);
    expect(c.fraction(1000)).toEqual({ f: 0, pending: true });
    expect(c.fraction(1149)).toEqual({ f: 0, pending: true });
    expect(c.fraction(1150)).toEqual({ f: 0, pending: true });      // the release starts here, at 0
    expect(c.fraction(1275).f).toBeCloseTo(0.5, 6);
    expect(c.fraction(1400)).toEqual({ f: 1, pending: false });
    expect(c.fraction(5000)).toEqual({ f: 1, pending: false });     // idle again
  });

  it('arm R gate at 4 ms frames: >= 3 fading frames spanning >= 100 ms, never falling, then 1', () => {
    const c = clock();
    c.live(1000);
    const trace = [];
    for (let t = 1000; t <= 1600; t += 4) trace.push({ t, f: c.fraction(t).f });
    const live = trace.filter((x) => x.f === 0), after = trace.slice(trace.indexOf(live[live.length - 1]));
    const fading = after.filter((x) => x.f > 0 && x.f < 1);
    expect(live.length).toBeGreaterThanOrEqual(Math.floor(HOLD / 4));
    expect(fading.length).toBeGreaterThanOrEqual(3);
    expect(fading[fading.length - 1].t - fading[0].t).toBeGreaterThanOrEqual(100);
    for (let i = 1; i < after.length; i++) expect(after[i].f).toBeGreaterThanOrEqual(after[i - 1].f);
    expect(after[after.length - 1].f).toBe(1);
  });

  it('a gesture during the fade snaps back to live and restarts the hold (a run of notches)', () => {
    const c = clock();
    c.live(1000);
    expect(c.fraction(1150)).toEqual({ f: 0, pending: true });      // the frame at the hold's end starts the release
    expect(c.fraction(1250).f).toBeCloseTo(0.4, 6);
    c.live(1250);
    expect(c.fraction(1250)).toEqual({ f: 0, pending: true });
    expect(c.fraction(1399)).toEqual({ f: 0, pending: true });
    expect(c.fraction(1400)).toEqual({ f: 0, pending: true });
    expect(c.fraction(1650)).toEqual({ f: 1, pending: false });
  });

  it('a hold that drew no frame still fades from 0 the moment it is next asked (the deferred release)', () => {
    const c = clock();
    c.live(1000);
    expect(c.fraction(1900)).toEqual({ f: 0, pending: true });      // first ask long after the hold: release starts now
    expect(c.fraction(2150)).toEqual({ f: 1, pending: false });
  });
});
