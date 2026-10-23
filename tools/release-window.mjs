/**
 * Is this scheduled deploy run a release window? (up1, 2026-10-23)
 *
 * Corbin, 10-23: "VOTReader has been flashing 'VOTReader was just updated' at me all day long ... have VOTReader
 * clients just take updates like in the morning and at night?" The site now publishes twice a day, at 06:00 and 21:00
 * America/Denver (DECISIONS 10-23; supersedes 08-11's publish on every green CI). CI still runs on every push; only
 * the publish waits. workflow_dispatch stays the "ship now" for a live break.
 *
 * GitHub's cron is UTC and knows no time zones, so deploy-web.yml schedules BOTH UTC hours each window can fall on
 * (06:00 Denver = 12:00Z in summer time, 13:00Z in winter time; 21:00 = 03:00Z or 04:00Z the next UTC day) and this
 * gate lets through only the run whose cron is the Denver hour on that day. It reads the run's own cron line
 * (github.event.schedule) rather than the clock: a scheduled run often starts 5-30 minutes late, and the hour it
 * starts in must not decide which window it was.
 *
 * Usage (the deploy's gate job): EVENT_NAME=<github.event_name> SCHEDULE=<github.event.schedule> node tools/release-window.mjs
 * Writes due=true|false to $GITHUB_OUTPUT (or stdout). A manual dispatch is always due.
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ZONE = 'America/Denver';
/** The release windows, Denver local hours. */
export const WINDOW_HOURS = [6, 21];

/**
 * The instant a daily cron line `M H * * *` (UTC) last fired at or before `now`, or null for any other shape.
 * @param {string} cron @param {Date} now @returns {Date | null}
 */
export function cronInstant(cron, now) {
  const m = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/.exec(String(cron || ''));
  if (!m) return null;
  const min = Number(m[1]), hour = Number(m[2]);
  if (min > 59 || hour > 23) return null;
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, min));
  if (t.getTime() > now.getTime()) t.setUTCDate(t.getUTCDate() - 1);
  return t;
}

/** The Denver local hour of an instant (0-23). @param {Date} t */
export function zoneHour(t) {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(t);
  return Number(h) % 24;
}

/**
 * Whether a run of this cron line, started at `now`, is a release window.
 * @param {string} cron @param {Date} now
 */
export function isReleaseWindow(cron, now) {
  const t = cronInstant(cron, now);
  return !!t && WINDOW_HOURS.includes(zoneHour(t));
}

/**
 * The gate's answer for one run.
 * @param {{ eventName?: string, schedule?: string, now?: Date }} p
 */
export function due(p) {
  if (p.eventName === 'workflow_dispatch') return true;
  if (p.eventName === 'schedule') return isReleaseWindow(p.schedule || '', p.now || new Date());
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ok = due({ eventName: process.env.EVENT_NAME, schedule: process.env.SCHEDULE });
  const line = `due=${ok}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
  console.error(`release window: event=${process.env.EVENT_NAME || '?'} cron=${process.env.SCHEDULE || '-'} due=${ok}`);
}
