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
 * up2 (2026-10-23): the 06:00 release never fired. GitHub's scheduler drops runs at the top of the hour under load,
 * and on 10-23 it dropped the only one. So each window hour now has two crons off the hour (:07 and :37, both DST
 * offsets), and a window counts as done once the site has published since it began (LAST_PUBLISH_AT, the newest
 * successful github-pages deployment): the :37 run publishes only when the :07 one did not. A run in the hour after
 * a window (the other DST offset's crons) catches up a window that passed with nothing published, and so does a
 * dispatch with catchup=true, which the PC's catch-up row sends (D:/Swarm/tools/release-catchup.py). A window with
 * nothing new still publishes nothing (deploy-target.mjs, the build-sha floor), so a catch-up is harmless.
 *
 * Usage (the deploy's gate job): EVENT_NAME=<github.event_name> SCHEDULE=<github.event.schedule>
 *   LAST_PUBLISH_AT=<ISO time or empty> CATCHUP=<true|false> node tools/release-window.mjs
 * Writes due=true|false to $GITHUB_OUTPUT (or stdout). A manual dispatch (not a catch-up) is always due.
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

/** How long after a window began a run off the window hour may still catch it up (the next cron hour). */
export const CATCHUP_MS = 3 * 3600 * 1000;

/**
 * The instant the latest release window began at or before `t` (06:00 or 21:00 Denver). Denver's offset is whole
 * hours, so a window begins on a UTC hour.
 * @param {Date} t @returns {Date}
 */
export function windowStart(t) {
  const h = new Date(Math.floor(t.getTime() / 3600000) * 3600000);
  for (let i = 0; i < 48; i++) {
    if (WINDOW_HOURS.includes(zoneHour(h))) return h;
    h.setTime(h.getTime() - 3600000);
  }
  throw new Error('no release window in 48 hours');
}

/** @param {string | undefined | null} s @returns {Date | null} */
function parseTime(s) {
  if (!s) return null;
  const t = new Date(String(s).trim());
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * The gate's answer for one run, and why.
 * @param {{ eventName?: string, schedule?: string, now?: Date, lastPublishAt?: string | null, catchup?: boolean }} p
 * @returns {{ due: boolean, why: string }}
 */
export function decide(p) {
  const now = p.now || new Date();
  const last = parseTime(p.lastPublishAt);
  if (p.eventName === 'workflow_dispatch' && !p.catchup) return { due: true, why: 'ship now (manual dispatch)' };
  let t = now;
  if (p.eventName === 'schedule') {
    const c = cronInstant(p.schedule || '', now);
    if (!c) return { due: false, why: `not a daily cron line: ${p.schedule || '-'}` };
    t = c;
  } else if (p.eventName !== 'workflow_dispatch') {
    return { due: false, why: `${p.eventName || 'no event'} never publishes` };
  }
  const start = windowStart(t);
  const label = `${zoneHour(start)}:00 window of ${start.toISOString().slice(0, 10)}`;
  if (last && last.getTime() >= start.getTime()) return { due: false, why: `the ${label} already published (${last.toISOString()})` };
  if (p.eventName === 'workflow_dispatch') return { due: true, why: `catch-up of the ${label}` };
  if (WINDOW_HOURS.includes(zoneHour(t))) return { due: true, why: `the ${label}${last ? '' : ' (last publish unknown)'}` };
  // The other DST offset's hour, after the window: a catch-up, only when it is known that nothing published.
  if (last && t.getTime() - start.getTime() <= CATCHUP_MS) return { due: true, why: `catch-up of the ${label}: nothing published since it began` };
  return { due: false, why: `not a release window (Denver ${zoneHour(t)}:${String(t.getUTCMinutes()).padStart(2, '0')})` };
}

/**
 * The gate's yes or no for one run.
 * @param {{ eventName?: string, schedule?: string, now?: Date, lastPublishAt?: string | null, catchup?: boolean }} p
 */
export function due(p) {
  return decide(p).due;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const r = decide({
    eventName: process.env.EVENT_NAME, schedule: process.env.SCHEDULE,
    lastPublishAt: process.env.LAST_PUBLISH_AT || null, catchup: process.env.CATCHUP === 'true',
  });
  const line = `due=${r.due}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
  console.error(`release window: event=${process.env.EVENT_NAME || '?'} cron=${process.env.SCHEDULE || '-'} last=${process.env.LAST_PUBLISH_AT || '-'} due=${r.due}: ${r.why}`);
}
