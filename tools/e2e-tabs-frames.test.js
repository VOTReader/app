/* The two readings the tabs walk got wrong under load in gate rel3 (hub task 2045): see e2e-tabs-frames.mjs. */
import { describe, it, expect } from 'vitest';
import { inTimeOrder, settleStart } from './e2e-tabs-frames.mjs';

describe('a swipe screencast read in time order', () => {
  // loadB run2 letter-first-next x4, as the frames arrived (ms from release): the +275 ms frame came in last.
  const arrived = [-329, -279, 13, 29, 262, 283, 292, 563, 571, 722, 275].map((ms) => ({ t: 100 + ms / 1000, ms }));
  it('the settled frame is the latest one, not the last to arrive', () => {
    const f = inTimeOrder(arrived);
    expect(f[f.length - 1].ms).toBe(722);
    expect(arrived[arrived.length - 1].ms).toBe(275);   // what the walk used to take as settled
  });
  it('the release frame is the latest one before the release', () => {
    const out = [-1423, -327, -293, 32].map((ms) => ({ t: 100 + ms / 1000, ms }));
    out.push(out.splice(1, 1)[0]);   // -327 arrives after -293 (loadA run2)
    const f = inTimeOrder(out);
    let rel = -1;
    for (let i = 0; i < f.length; i++) if (f[i].t < 100) rel = i;
    expect(f[rel].ms).toBe(-293);
  });
  it('does not change the frames it is given', () => {
    const a = [{ t: 2 }, { t: 1 }];
    inTimeOrder(a);
    expect(a.map((x) => x.t)).toEqual([2, 1]);
  });
});

describe('the settle runs from when the page handled the lift', () => {
  it('a lift handled 510 ms late moves the window by 510 ms', () => {
    expect(settleStart(100, 100.51)).toEqual({ from: 100.51, lagMs: 510 });
  });
  it('no page time, or one before the send, keeps the send', () => {
    expect(settleStart(100, null)).toEqual({ from: 100, lagMs: 0 });
    expect(settleStart(100, 99.99)).toEqual({ from: 100, lagMs: 0 });
  });
});
