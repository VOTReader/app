/* e2e-walk-lib — the two readings the update-reload walk got wrong once each (2026-09-11).
   ─────────────────────────────────────────────────────────────────────────────
   1. update-walk-follow-sample-1: the walk classified the post-restore position from ONE
      sample and read 887 against 900 while the read-along follow was still scrolling
      toward 698 — "moved for no reason this walk can name". A position is a reading only
      once the scroller has been still.
   2. kill-cadence-armd-sibling-1: after the kill + relaunch on a PERSISTENT profile Chrome
      restores the previous session's app tab, so a second document of the origin boots the
      player beside the measured page. The walk must count and close what it did not open.
   Pure helpers, fake clock; the walk itself imports them. */

import { describe, it, expect } from 'vitest';
import { settleRead, classifyRestoredPages, settleLine } from './e2e-walk-lib.mjs';

/** A fake clock: `sleep` advances it; `now` reads it. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
/** read() hands out the series in order and repeats its last value forever. */
function series(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('settleRead — a position is a reading only once the scroller is still', () => {
  it('waits out a mid-scroll read and returns the settled position, not the first sample', async () => {
    const c = clock();
    const read = series([900, 887, 850, 780, 720, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698, 698]);
    const r = await settleRead(read, { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(698);                 // sample 1 alone would have said 887
    expect(r.waitedMs).toBeGreaterThan(250);
    expect(r.stillMs).toBeGreaterThanOrEqual(250);
    // The moves are on the record, so a report can say what happened before it settled.
    expect(r.samples.map((s) => s.y)).toEqual([900, 887, 850, 780, 720, 698]);
  });

  it('a scroller still moving past the first still window is read only when it stops (the window resets on every change)', async () => {
    const c = clock();
    const moving = Array.from({ length: 30 }, (_, i) => 900 - i * 7);   // 30 moves over 464 ms of fake clock, then still at 697
    const r = await settleRead(series(moving), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(697);                 // a window measured from the FIRST read would have returned 788 at +256 ms
    expect(r.samples).toHaveLength(30);
    expect(r.waitedMs).toBe(16 * 29 + 256);
  });

  it('an already-still scroller settles after exactly the still window', async () => {
    const c = clock();
    const r = await settleRead(series([698]), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(698);
    expect(r.waitedMs).toBe(256);          // 16 × 16 ms polls: the first tick past 250
    expect(r.samples).toHaveLength(1);
  });

  it('a scroller that never settles is reported as NOT settled at the deadline, with its last position', async () => {
    const c = clock();
    let y = 0;
    const r = await settleRead(() => (y += 1), { stillMs: 250, maxMs: 1000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(false);
    expect(r.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(r.y).toBe(y);                   // the last read, never an earlier one
    expect(r.stillMs).toBeLessThan(250);
  });

  it('a null reading (no scroller yet) counts as a value, so a scroller appearing late is a change', async () => {
    const c = clock();
    const r = await settleRead(series([null, null, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900, 900]), { stillMs: 250, maxMs: 4000, everyMs: 16, now: c.now, sleep: c.sleep });
    expect(r.settled).toBe(true);
    expect(r.y).toBe(900);
    expect(r.samples.map((s) => s.y)).toEqual([null, 900]);
  });
});

describe('classifyRestoredPages — what a persistent profile brought back at relaunch', () => {
  const BASE = 'http://127.0.0.1:4321/index.html';

  it('counts the restored APP tab on a persistent profile (the second document the walk never opened)', () => {
    const r = classifyRestoredPages(['about:blank', 'http://127.0.0.1:4321/index.html'], BASE);
    expect(r.total).toBe(2);
    expect(r.appTabs).toBe(1);
    expect(r.appUrls).toEqual(['http://127.0.0.1:4321/index.html']);
    expect(r.others).toEqual(['about:blank']);
  });

  it('a fresh launch (one blank page) has no app tab', () => {
    const r = classifyRestoredPages(['about:blank'], BASE);
    expect(r).toEqual({ total: 1, appTabs: 0, appUrls: [], others: ['about:blank'] });
  });

  it('another origin on the same host/port shape is not the app; a malformed url is tolerated', () => {
    const r = classifyRestoredPages(['http://127.0.0.1:9999/index.html', 'not a url', 'http://127.0.0.1:4321/?tab=2'], BASE);
    expect(r.appTabs).toBe(1);
    expect(r.appUrls).toEqual(['http://127.0.0.1:4321/?tab=2']);
    expect(r.others).toEqual(['http://127.0.0.1:9999/index.html', 'not a url']);
  });
});

describe('settleLine — the report sentence carries the moves, not only the verdict', () => {
  it('names the settled position, the still window and every move', () => {
    const line = settleLine({ y: 698, settled: true, waitedMs: 336, stillMs: 256, samples: [{ t: 0, y: 900 }, { t: 16, y: 887 }, { t: 80, y: 698 }] });
    expect(line).toBe('still at 698 for 256 ms, read at +336 ms after moving 2x (900 -> 887 -> 698)');
  });
  it('says NOT still when the deadline won', () => {
    const line = settleLine({ y: 41, settled: false, waitedMs: 1008, stillMs: 0, samples: [{ t: 0, y: 1 }, { t: 16, y: 2 }] });
    expect(line.startsWith('NOT still: 41 at +1008 ms')).toBe(true);
  });
});
