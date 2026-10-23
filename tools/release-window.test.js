/* up1: the deploy publishes at 06:00 and 21:00 Denver only; GitHub's cron is UTC, so both DST candidates are
   scheduled and this gate lets the right one through (tools/release-window.mjs). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronInstant, zoneHour, isReleaseWindow, due, decide, windowStart } from './release-window.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = readFileSync(join(ROOT, '.github/workflows/deploy-web.yml'), 'utf8').replace(/\r\n/g, '\n');
const crons = [...WF.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
const z = (s) => new Date(s);

describe('cronInstant', () => {
  it('is the last firing at or before now, the day before when the hour is still ahead', () => {
    expect(cronInstant('0 12 * * *', z('2026-10-23T12:07:00Z'))?.toISOString()).toBe('2026-10-23T12:00:00.000Z');
    expect(cronInstant('0 3 * * *', z('2026-10-23T03:41:00Z'))?.toISOString()).toBe('2026-10-23T03:00:00.000Z');
    expect(cronInstant('0 13 * * *', z('2026-10-23T12:59:00Z'))?.toISOString()).toBe('2026-10-22T13:00:00.000Z');
    // A 23:50Z cron that started after midnight is still yesterday's.
    expect(cronInstant('50 23 * * *', z('2026-10-24T00:20:00Z'))?.toISOString()).toBe('2026-10-23T23:50:00.000Z');
  });
  it('refuses anything but a daily M H line', () => {
    for (const bad of ['', '0 12 * * 1', '*/5 * * * *', '0 24 * * *', '60 1 * * *', null]) expect(cronInstant(bad, new Date())).toBe(null);
  });
});

describe('the Denver hour, across the 2026-11-01 change back to standard time', () => {
  it('reads summer and winter time', () => {
    expect(zoneHour(z('2026-10-23T12:00:00Z'))).toBe(6);    // MDT, UTC-6
    expect(zoneHour(z('2026-11-02T13:00:00Z'))).toBe(6);    // MST, UTC-7
    expect(zoneHour(z('2026-10-24T03:00:00Z'))).toBe(21);
    expect(zoneHour(z('2026-11-03T04:00:00Z'))).toBe(21);
  });
});

describe('isReleaseWindow: exactly one of each pair goes through, whatever the season', () => {
  const pass = (cron, at) => isReleaseWindow(cron, z(at));
  it('summer time (MDT): 12Z and 03Z', () => {
    expect(pass('0 12 * * *', '2026-10-23T12:14:00Z')).toBe(true);
    expect(pass('0 13 * * *', '2026-10-23T13:09:00Z')).toBe(false);
    expect(pass('0 3 * * *', '2026-10-24T03:22:00Z')).toBe(true);
    expect(pass('0 4 * * *', '2026-10-24T04:05:00Z')).toBe(false);
  });
  it('winter time (MST): 13Z and 04Z', () => {
    expect(pass('0 12 * * *', '2026-11-02T12:10:00Z')).toBe(false);
    expect(pass('0 13 * * *', '2026-11-02T13:10:00Z')).toBe(true);
    expect(pass('0 3 * * *', '2026-11-03T03:10:00Z')).toBe(false);
    expect(pass('0 4 * * *', '2026-11-03T04:10:00Z')).toBe(true);
  });
  it('a late start does not move the window: the cron line decides, not the clock', () => {
    // 12Z cron starting 50 min late (12:50Z) is still the 06:00 window; the 13Z one is not, however early it ran.
    expect(pass('0 12 * * *', '2026-10-23T12:50:00Z')).toBe(true);
  });
  it('every day of a year, each window hour holds two of the workflow\'s own crons, off the hour', () => {
    expect([...crons].sort()).toEqual(['37 12 * * *', '37 13 * * *', '37 3 * * *', '37 4 * * *', '7 12 * * *', '7 13 * * *', '7 3 * * *', '7 4 * * *']);
    for (const c of crons) expect(c.startsWith('0 '), c).toBe(false);   // up2: GitHub sheds top-of-the-hour runs first
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86400000);
      const inWindow = crons.filter((c) => {
        const t = cronInstant(c, new Date(day.getTime() + 86400000 - 1));   // that UTC day's firing of c
        return t && isReleaseWindow(c, new Date(t.getTime() + 10 * 60000));
      });
      expect(inWindow.length, day.toISOString()).toBe(4);   // two windows, two runs each
    }
  });
});

describe('windowStart', () => {
  it('is the latest 06:00 or 21:00 Denver at or before the instant, in either season', () => {
    expect(windowStart(z('2026-10-23T12:37:00Z')).toISOString()).toBe('2026-10-23T12:00:00.000Z');   // 06:37 MDT
    expect(windowStart(z('2026-10-23T11:59:00Z')).toISOString()).toBe('2026-10-23T03:00:00.000Z');   // 05:59 MDT: last night's 21:00
    expect(windowStart(z('2026-11-02T13:07:00Z')).toISOString()).toBe('2026-11-02T13:00:00.000Z');   // 06:07 MST
    expect(windowStart(z('2026-11-03T04:37:00Z')).toISOString()).toBe('2026-11-03T04:00:00.000Z');   // 21:37 MST
  });
});

describe('decide (up2): once per window, a catch-up for a missed one', () => {
  const at = (cron, now, lastPublishAt) => decide({ eventName: 'schedule', schedule: cron, now: z(now), lastPublishAt });
  it('a manual dispatch ships now; a CI completion or a push never publishes', () => {
    expect(due({ eventName: 'workflow_dispatch' })).toBe(true);
    expect(due({ eventName: 'workflow_run' })).toBe(false);
    expect(due({ eventName: 'push' })).toBe(false);
  });
  it('the window\'s first run publishes; the second skips once the site published since the window began', () => {
    expect(at('7 12 * * *', '2026-10-23T12:20:00Z', '2026-10-23T08:03:07Z').due).toBe(true);
    expect(at('37 12 * * *', '2026-10-23T12:45:00Z', '2026-10-23T12:24:00Z').due).toBe(false);
  });
  it('the second run publishes when the first never came (the 10-23 06:00 drop)', () => {
    expect(at('37 12 * * *', '2026-10-23T12:50:00Z', '2026-10-23T08:03:07Z').due).toBe(true);
  });
  it('a window-hour run publishes when the last publish is unknown (the lookup failed)', () => {
    expect(at('7 12 * * *', '2026-10-23T12:10:00Z', '').due).toBe(true);
    expect(at('7 12 * * *', '2026-10-23T12:10:00Z', 'garbage').due).toBe(true);
  });
  it('the hour after a window catches it up only when it is known that nothing published', () => {
    // Summer: 13Z is 07:07 MDT, the hour after the 06:00 window.
    expect(at('7 13 * * *', '2026-10-23T13:10:00Z', '2026-10-23T08:03:07Z').due).toBe(true);
    expect(at('7 13 * * *', '2026-10-23T13:10:00Z', '2026-10-23T12:20:00Z').due).toBe(false);
    expect(at('7 13 * * *', '2026-10-23T13:10:00Z', null).due).toBe(false);
    // Winter: 12Z is 05:07 MST, nine hours after last night's window: no catch-up that late.
    expect(at('7 12 * * *', '2026-11-02T12:10:00Z', '2026-11-01T20:00:00Z').due).toBe(false);
  });
  it('a late start still counts for its own window: the cron line decides, not the clock', () => {
    expect(at('7 12 * * *', '2026-10-23T13:40:00Z', '2026-10-23T08:03:07Z').due).toBe(true);
  });
  it('a catch-up dispatch (the PC row) publishes only when nothing published since the window began', () => {
    const d = (now, last) => decide({ eventName: 'workflow_dispatch', catchup: true, now: z(now), lastPublishAt: last });
    expect(d('2026-10-23T12:50:00Z', '2026-10-23T08:03:07Z').due).toBe(true);
    expect(d('2026-10-23T12:50:00Z', '2026-10-23T12:20:00Z').due).toBe(false);
    expect(d('2026-10-23T12:50:00Z', '').due).toBe(true);
  });
  it('says why, for the run log', () => {
    expect(at('37 12 * * *', '2026-10-23T12:45:00Z', '2026-10-23T12:24:00Z').why).toMatch(/6:00 window of 2026-10-23 already published/);
  });
});

describe('the deploy workflow wires the gate', () => {
  it('reads the last publish, passes it and the catch-up input to the gate, and a catch-up picks like a window', () => {
    expect(WF).toMatch(/deployments: read/);
    expect(WF).toMatch(/LAST_PUBLISH_AT: \$\{\{ steps\.last\.outputs\.at \}\}/);
    expect(WF).toMatch(/catchup:\n\s+description:/);
    expect(WF).toMatch(/DISPATCH_SHA: \$\{\{ github\.event_name == 'workflow_dispatch' && !inputs\.catchup && github\.sha \|\| '' \}\}/);
  });
});
