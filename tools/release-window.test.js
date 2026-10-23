/* up1: the deploy publishes at 06:00 and 21:00 Denver only; GitHub's cron is UTC, so both DST candidates are
   scheduled and this gate lets the right one through (tools/release-window.mjs). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cronInstant, zoneHour, isReleaseWindow, due } from './release-window.mjs';

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
  it('every day of a year has exactly two releases among the workflow\'s own crons', () => {
    expect(crons.sort()).toEqual(['0 12 * * *', '0 13 * * *', '0 3 * * *', '0 4 * * *']);
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1) + d * 86400000);
      const runs = crons.filter((c) => {
        const t = cronInstant(c, new Date(day.getTime() + 86400000 - 1));   // that UTC day's firing of c
        return t && isReleaseWindow(c, new Date(t.getTime() + 10 * 60000));
      });
      expect(runs.length, day.toISOString()).toBe(2);
    }
  });
});

describe('due', () => {
  it('a manual dispatch always publishes; a CI completion or a push never does', () => {
    expect(due({ eventName: 'workflow_dispatch' })).toBe(true);
    expect(due({ eventName: 'workflow_run' })).toBe(false);
    expect(due({ eventName: 'push' })).toBe(false);
    expect(due({ eventName: 'schedule', schedule: '0 12 * * *', now: z('2026-10-23T12:05:00Z') })).toBe(true);
    expect(due({ eventName: 'schedule', schedule: '0 13 * * *', now: z('2026-10-23T13:05:00Z') })).toBe(false);
  });
});
