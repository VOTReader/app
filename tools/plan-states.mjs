/* plan-states: every reading-plan state as real plan runs, dated around a given day, so a walk, a picture or a test
   can draw each one without waiting days (task 2235, 2026-11-16). Data only: the app has no clock override.

   planStates(now) -> { [state]: PlanRun } built with the app's own engine:
     ontrack      Bible in a Year, day 6, the five days before read on their days, today not read yet
     donetoday    the same, today's portion read today
     missed1      nothing read yesterday (1 day behind)
     missed3      nothing read the last three days (3 days behind)
     paused       paused three days ago
     notstarted   starts in four days
     finished     Ruth, read through, finished today and not yet seen
     stopped      stopped six days ago on day 10
     custom       a plan built here (Ruth, Jonah, Esther; 5 min a day), day 5, on track

   Run:  node tools/plan-states.mjs --list
         node tools/plan-states.mjs --json STATE[,STATE...] [--date YYYY-MM-DD]   (the runs as JSON on stdout)
   In a page: ReadingPlanStore.replaceAll(<that JSON>) then reload, or seed localStorage 'vot-reading-plans' before
   the app boots (the store reads IndexedDB first; replaceAll writes both). */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../app/src/main/assets/src');
const imp = (p) => import(pathToFileURL(resolve(SRC, p)).href);

export const STATES = ['ontrack', 'donetoday', 'missed1', 'missed3', 'paused', 'notstarted', 'finished', 'stopped', 'custom'];

/** @param {Date} now a local date (noon is safest) */
export async function planStates(now) {
  const E = await imp('data/plan-engine.js');
  const C = await imp('data/plan-catalog.js');
  const B = await imp('data/plan-builder.js');
  const at = (n) => { const d = new Date(now.getTime()); d.setDate(d.getDate() + n); d.setHours(12, 0, 0, 0); return d; };
  const key = (n) => E.todayKey(at(n));
  /** Day d of the run read on date offset `when` (relative to now). */
  const read = (run, d, when) => { for (const it of E.dayItems(run, d)) run = E.tickItem(run, it.k, key(when), at(when).getTime()); return run; };
  const bibleYear = (startAgo, id) => ({ ...C.startCatalogPlan('bible-year', null, at(-startAgo)), id });
  /** Days 0..n-1 read, each on its own date from the start. */
  const readDays = (run, startAgo, n) => { for (let d = 0; d < n; d++) run = read(run, d, -startAgo + d); return run; };

  const out = {};
  out.ontrack = readDays(bibleYear(5, 'st-ontrack'), 5, 5);
  out.donetoday = read(readDays(bibleYear(5, 'st-donetoday'), 5, 5), 5, 0);
  out.missed1 = readDays(bibleYear(5, 'st-missed1'), 5, 4);
  out.missed3 = readDays(bibleYear(8, 'st-missed3'), 8, 5);
  out.paused = E.pauseRun(readDays(bibleYear(10, 'st-paused'), 10, 7), at(-3));
  out.notstarted = { ...C.startCatalogPlan('bible-year', null, at(0), { startOn: key(4) }), id: 'st-notstarted' };
  // Ruth as the builder makes it (node has no letters for a collection plan)
  const ruth = { ...E.newRun(B.builderSpec({ picks: [{ t: 'b', bid: 'ruth' }], order: 'picked', share: 'serial', goal: { mode: 'days', n: 4 },
    weekdays: [true, true, true, true, true, true, true], name: 'Ruth in four days' }, null), at(-3)), id: 'st-finished' };
  out.finished = readDays(ruth, 3, 4);
  // as plan-runs-view stopRun writes it
  out.stopped = { ...readDays(bibleYear(20, 'st-stopped'), 20, 10), status: 'stopped', updated: at(-6).getTime(), stopped: key(-6) };
  const spec = B.builderSpec({ picks: [{ t: 'b', bid: 'ruth' }, { t: 'b', bid: 'jonah' }, { t: 'b', bid: 'esther' }], order: 'picked', share: 'serial',
    goal: { mode: 'minutes', n: 5 }, weekdays: [true, true, true, true, true, true, true], name: 'Three short books' }, null);
  out.custom = readDays({ ...E.newRun(spec, at(-4)), id: 'st-custom' }, 4, 4);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--list')) { console.log(STATES.join('\n')); process.exit(0); }
  const want = (opt('--json') || STATES.join(',')).split(',');
  const d = opt('--date') ? new Date(opt('--date') + 'T12:00:00') : new Date();
  const all = await planStates(d);
  const bad = want.filter((s) => !all[s]);
  if (bad.length) { console.error('unknown state: ' + bad.join(', ') + ' (see --list)'); process.exit(2); }
  console.log(JSON.stringify(want.map((s) => all[s])));
}
