/* ═══════════════════════════════════════════════════════════════════════
   plan-engine — reading plans that follow the reader (mw18, 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   Corbin approved the robust plans brief ("Go with your picks", 10-22) and
   added a custom plan of anything, Bible and letters mixed. The design is in
   D:/Swarm/lanes/myweb/out/mw18/ENGINE.md; in short:

   - A RUN is one start of one plan. It carries its own items (frozen when it
     starts, so a corpus edit never moves a day), how they are cut into days
     (`segs`), the reading weekdays, a planned finish (`target`) and its own
     dated ticks. Progress is the run's ticks only, so a plan run twice starts
     clean (rp1 counted anything ever read, so a rerun started done).
   - TODAY is the first day not fully read. A missed day costs nothing: the
     projected finish moves and is shown honestly. Catch me up moves the
     target there; Spread it out re-cuts what is left to keep the target.
   - Bible days are cut by chapter count (the classic one-year table: 365
     days reproduce rp1's biblePortion exactly), letter days by words, so
     "2 letters" is never 1 minute one day and 25 the next.

   Dates are 'YYYY-MM-DD' local calendar dates and all arithmetic is on whole
   calendar days (UTC math on the date parts), so DST and the hour never move
   a day. Pure: no state, no DOM, no storage.
   ═══════════════════════════════════════════════════════════════════════ */

/** Reading speed for the minute estimates (words a minute). */
export const WORDS_PER_MIN = 200;

/**
 * @typedef {{ k: string, w: number, t?: string, s?: string }} PlanItem
 *   k '<bid>:<cid>' (the read-key tail), w its words, t/s a letter's title and collection short name
 * @typedef {{ kind: string, by: 'count' | 'words', items: PlanItem[] }} PlanTrack
 * @typedef {{ day0: number, from: number[], to: number[], days: number }} PlanSeg
 * @typedef {{ mode: 'days' | 'minutes' | 'items' | 'by', n?: number, date?: string }} PlanPace
 * @typedef {{ id: string, plan: string, name?: string, created?: number, updated?: number, start: string,
 *   status: 'running' | 'paused' | 'finished' | 'stopped', tracks: PlanTrack[], share?: 'side' | 'serial',
 *   weekdays: boolean[], segs: PlanSeg[], target: string, ticks: Record<string, string>,
 *   paused?: string, pauses?: string[][], pace?: PlanPace, finished?: string, from?: string, stopped?: string,
 *   known?: string }} PlanRun
 */

// ── dates ────────────────────────────────────────────────────────────────

/** @param {string} s @returns {number | null} whole days since the epoch, or null for a bad date */
export function dayNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const back = new Date(t);
  if (back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) return null;   // 2026-02-30
  return Math.round(t / 86400000);
}

/** @param {number} n @returns {string} */
export function dateOf(n) {
  const d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

/** The local calendar date of `now`. @param {Date} now */
export function todayKey(now) {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/** 0 (Sunday) .. 6. @param {number} n */
const weekdayOf = (n) => ((n + 4) % 7 + 7) % 7;   // 1970-01-01 was a Thursday

/**
 * Whether date `n` is a reading day of the run: its weekday is on and no pause covers it.
 * @param {PlanRun} run @param {number} n
 */
export function isReadingDay(run, n) {
  const wd = Array.isArray(run.weekdays) && run.weekdays.length === 7 ? run.weekdays : null;
  if (wd && !wd.some(Boolean)) return true;   // no day on is a broken record: read every day
  if (wd && !wd[weekdayOf(n)]) return false;
  for (const p of run.pauses || []) {
    const a = dayNum(p[0]), b = dayNum(p[1]);
    if (a != null && b != null && n >= a && n <= b) return false;
  }
  if (run.paused) { const a = dayNum(run.paused); if (a != null && n >= a) return false; }
  return true;
}

/** The date of the `k`th reading day (0 = the first) on or after `from`, ignoring pauses still open. */
function nthReadingDay(run, from, k) {
  const r = { ...run, paused: undefined };
  let n = from, seen = -1;
  for (let guard = 0; guard < 40000; guard++, n++) {
    if (isReadingDay(r, n) && ++seen === k) return n;
  }
  return n;
}

/** Reading days in [a, b] (dates as day numbers). */
function readingDaysBetween(run, a, b) {
  const r = { ...run, paused: undefined };
  let c = 0;
  for (let n = a; n <= b; n++) if (isReadingDay(r, n)) c++;
  return c;
}

// ── cutting items into days ──────────────────────────────────────────────

/**
 * Cut items [from, to) into `days` runs: by count, run d is [from + round(d*N/days), ...); by words, each item
 * goes to the day its words' midpoint falls in, so every day carries about the same words. Returns the start
 * index of each day plus the end (days + 1 numbers).
 * @param {PlanItem[]} items @param {number} from @param {number} to @param {number} days @param {'count' | 'words'} by
 * @returns {number[]}
 */
export function cutPoints(items, from, to, days, by) {
  const n = Math.max(0, to - from), D = Math.max(1, Math.floor(days) || 1);
  const out = [from];
  if (by !== 'words') {
    for (let d = 1; d < D; d++) out.push(from + Math.round(d * n / D));
    out.push(to);
    return out;
  }
  let total = 0;
  for (let i = from; i < to; i++) total += Math.max(1, Number(items[i] && items[i].w) || 1);
  let acc = 0, d = 1;
  for (let i = from; i < to && d < D; i++) {
    const w = Math.max(1, Number(items[i] && items[i].w) || 1);
    // Item i starts day d when its midpoint passes d/D of the words (and every day keeps at least one item while
    // there are enough to go round).
    while (d < D && acc + w / 2 >= d * total / D && i > out[out.length - 1]) { out.push(i); d++; }
    acc += w;
  }
  while (out.length < D) out.push(to);
  out.push(to);
  return out;
}

const _cutMemo = new WeakMap();

/** Every day of the run: [{ parts: [[track, a, b], ...] }], built once per segs array. @param {PlanRun} run */
export function planDays(run) {
  const hit = _cutMemo.get(run.segs);
  if (hit && hit.tracks === run.tracks) return hit.days;
  /** @type {{ parts: number[][] }[]} */ const days = [];
  const segs = run.segs || [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    const end = s + 1 < segs.length ? segs[s + 1].day0 : seg.day0 + seg.days;
    const cuts = run.tracks.map((tr, t) => cutPoints(tr.items, seg.from[t], seg.to[t], seg.days, tr.by));
    for (let d = seg.day0; d < end && d - seg.day0 < seg.days; d++) {
      const j = d - seg.day0;
      const parts = [];
      for (let t = 0; t < run.tracks.length; t++) if (cuts[t][j + 1] > cuts[t][j]) parts.push([t, cuts[t][j], cuts[t][j + 1]]);
      days[d] = { parts };
    }
  }
  for (let d = 0; d < days.length; d++) if (!days[d]) days[d] = { parts: [] };
  _cutMemo.set(run.segs, { tracks: run.tracks, days });
  return days;
}

/** The items of day `d`. @param {PlanRun} run @param {number} d @returns {PlanItem[]} */
export function dayItems(run, d) {
  const day = planDays(run)[d];
  if (!day) return [];
  const out = [];
  for (const [t, a, b] of day.parts) for (let i = a; i < b; i++) out.push(run.tracks[t].items[i]);
  return out;
}

// ── labels ───────────────────────────────────────────────────────────────

/**
 * A run of items as a reader says it: "Genesis 1-4", "Genesis 50 - Exodus 3", "Volume Two: Letter 14",
 * "Volume Two: Letter 14 and 1 more". `bookTitle(bid)` names a Bible book.
 * @param {PlanItem[]} items @param {(bid: string) => string} bookTitle
 */
export function itemsLabel(items, bookTitle) {
  if (!items.length) return '';
  const bible = [], letters = [];
  for (const it of items) (it.t ? letters : bible).push(it);
  const parts = [];
  if (bible.length) {
    const split = (it) => { const i = it.k.lastIndexOf(':'); return [it.k.slice(0, i), it.k.slice(i + 1)]; };
    const [ab, ac] = split(bible[0]), [zb, zc] = split(bible[bible.length - 1]);
    const at = bookTitle(ab) || ab, zt = bookTitle(zb) || zb;
    parts.push(ab === zb ? (ac === zc ? at + ' ' + ac : at + ' ' + ac + '-' + zc) : at + ' ' + ac + ' - ' + zt + ' ' + zc);
  }
  if (letters.length) {
    const a = letters[0], z = letters[letters.length - 1];
    parts.push(letters.length === 1 ? (a.s ? a.s + ': ' : '') + a.t
      : a.s === z.s ? (a.s ? a.s + ': ' : '') + a.t + ' and ' + (letters.length - 1) + ' more'
        : (a.s ? a.s + ': ' : '') + a.t + ' - ' + (z.s ? z.s + ': ' : '') + z.t);
  }
  return parts.join(' · ');
}

/** "2 chapters + 1 letter" for a set of items. @param {PlanItem[]} items */
export function itemsCount(items) {
  let ch = 0, le = 0;
  for (const it of items) { if (it.t) le++; else ch++; }
  const p = [];
  if (ch) p.push(ch + (ch === 1 ? ' chapter' : ' chapters'));
  if (le) p.push(le + (le === 1 ? ' letter' : ' letters'));
  return p.join(' + ');
}

/** Words in a set of items. @param {PlanItem[]} items */
export const itemsWords = (items) => items.reduce((s, it) => s + (Number(it.w) || 0), 0);

/** Reading minutes for some words, at least 1. @param {number} words */
export const minutesFor = (words) => Math.max(1, Math.round(words / WORDS_PER_MIN));

// ── where a run stands ───────────────────────────────────────────────────

/** Whether every item of day d is ticked. */
function dayDone(run, d) {
  const items = dayItems(run, d);
  if (!items.length) return true;
  for (const it of items) if (!(it.k in (run.ticks || {}))) return false;
  return true;
}

/** Total days of the run. @param {PlanRun} run */
export function totalDays(run) {
  const segs = run.segs || [];
  if (!segs.length) return 0;
  const last = segs[segs.length - 1];
  return last.day0 + last.days;
}

/**
 * Where a run stands on `now`'s date.
 * @param {PlanRun} run @param {Date} now
 * @returns {{ total: number, day: number, finished: boolean, todayItems: PlanItem[], todayTicked: number,
 *   doneToday: boolean, doneDays: number, itemsDone: number, itemsTotal: number, projected: string, target: string,
 *   behind: number, ahead: number, paused: boolean, perDay: { items: number, words: number } }}
 */
export function runStatus(run, now) {
  const total = totalDays(run);
  const ticks = run.ticks || {};
  const today = dayNum(todayKey(now));
  let day = total;
  for (let d = 0; d < total; d++) if (!dayDone(run, d)) { day = d; break; }
  let doneDays = 0;
  for (let d = 0; d < total; d++) if (dayDone(run, d)) doneDays++;
  let itemsDone = 0, itemsTotal = 0;
  for (const tr of run.tracks) for (const it of tr.items) { itemsTotal++; if (it.k in ticks) itemsDone++; }
  const finished = day >= total;
  const todayItems = finished ? [] : dayItems(run, day);
  const todayTicked = todayItems.filter((it) => it.k in ticks).length;
  // A day finished today: the last tick of the day before `day` is dated today.
  let doneToday = false;
  if (day > 0) {
    const prev = dayItems(run, day - 1);
    doneToday = prev.length > 0 && prev.some((it) => ticks[it.k] === dateOf(/** @type {number} */ (today)))
      && todayTicked === 0;
  }
  const paused = run.status === 'paused' || !!run.paused;
  const remaining = total - day;
  const from = /** @type {number} */ (today) + (doneToday || paused ? 1 : 0);
  const projectedN = finished ? from - 1 : nthReadingDay(run, from, remaining - 1);
  const targetN = dayNum(run.target);
  let behind = 0, ahead = 0;
  if (!finished && targetN != null) {
    if (projectedN > targetN) behind = readingDaysBetween(run, targetN + 1, projectedN);
    else if (projectedN < targetN) ahead = readingDaysBetween(run, projectedN + 1, targetN);
  }
  const nextDays = Math.max(1, remaining);
  let leftItems = 0, leftWords = 0;
  for (let d = day; d < total; d++) for (const it of dayItems(run, d)) { leftItems++; leftWords += Number(it.w) || 0; }
  return {
    total, day, finished, todayItems, todayTicked, doneToday, doneDays, itemsDone, itemsTotal,
    projected: dateOf(projectedN), target: run.target, behind, ahead, paused,
    perDay: { items: leftItems / nextDays, words: leftWords / nextDays },
  };
}

/**
 * One month of a run for the calendar: each date's state.
 * read: something of this plan was read that day; missed: a reading day with nothing read; today; ahead: a
 * reading day still to come within the projected finish (with its planned day); none: outside the plan.
 * @param {PlanRun} run @param {number} year @param {number} month 0-11 @param {Date} now
 */
export function monthCells(run, year, month, now) {
  const st = runStatus(run, now);
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  const start = dayNum(run.start);
  const end = dayNum(st.projected);
  const known = run.known ? dayNum(run.known) : null;   // a moved rp1 plan: no dates before this
  const readOn = new Set(Object.values(run.ticks || {}).filter(Boolean));
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out = [];
  let planned = st.day;
  // Planned days before this month's first future date: count the reading days from today up to it.
  const first = /** @type {number} */ (dayNum(year + '-' + String(month + 1).padStart(2, '0') + '-01'));
  if (first > today) planned += readingDaysBetween(run, today + (st.doneToday ? 1 : 0), first - 1);
  for (let date = 1; date <= last; date++) {
    const n = first + date - 1;
    const key = dateOf(n);
    /** @type {'read' | 'missed' | 'today' | 'ahead' | 'none'} */ let state = 'none';
    /** @type {number | null} */ let day = null;
    if (start == null || n < start) state = 'none';
    else if (n === today) state = 'today';
    else if (n < today) state = readOn.has(key) ? 'read' : (isReadingDay(run, n) && !st.finished && !(known != null && n < known) ? 'missed' : 'none');
    else if (!st.finished && end != null && n <= end && isReadingDay({ ...run, paused: undefined }, n)) {
      state = 'ahead';
      day = planned++;
    }
    if (n === today && !st.doneToday && !st.finished) planned++;
    out.push({ date, weekday: weekdayOf(n), state, read: readOn.has(key), day });
  }
  return out;
}

// ── making and changing runs (pure: each returns a new run) ──────────────

/** How many days a pace asks for over `tracks`, from `from` (a date number), for the run's weekdays. */
function daysForPace(run, pace, startN, items) {
  const words = itemsWords(items);
  if (pace.mode === 'days') return Math.max(1, Math.floor(Number(pace.n) || 1));
  if (pace.mode === 'minutes') return Math.max(1, Math.ceil(words / (Math.max(1, Number(pace.n) || 1) * WORDS_PER_MIN)));
  if (pace.mode === 'items') return Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(Number(pace.n) || 1))));
  const end = dayNum(pace.date || '');
  if (end == null || end < startN) return 1;
  return Math.max(1, readingDaysBetween(run, startN, end));
}

/** The remaining item ranges per track from day `d` on. */
function remainingFrom(run, d) {
  const days = planDays(run);
  return run.tracks.map((tr, t) => {
    let a = tr.items.length;
    for (let x = d; x < days.length; x++) {
      const p = days[x].parts.find((q) => q[0] === t);
      if (p) { a = p[1]; break; }
    }
    return a;
  });
}

/**
 * A new run. `tracks` are frozen as given; side-by-side tracks share every day, serial ones are joined into one.
 * @param {{ plan: string, name?: string, tracks: PlanTrack[], share?: 'side' | 'serial', weekdays?: boolean[], pace: PlanPace,
 *   id?: string }} spec
 * @param {Date} now
 * @returns {PlanRun}
 */
export function newRun(spec, now) {
  const startKey = todayKey(now);
  const startN = /** @type {number} */ (dayNum(startKey));
  let tracks = spec.tracks.filter((t) => t && Array.isArray(t.items) && t.items.length);
  if (spec.share === 'serial' && tracks.length > 1) {
    tracks = [{ kind: 'mixed', by: 'words', items: tracks.flatMap((t) => t.items) }];
  }
  const run = /** @type {PlanRun} */ ({
    id: spec.id || ('p_' + now.getTime().toString(36) + '_' + Math.random().toString(36).slice(2, 6)),
    plan: spec.plan, created: now.getTime(), updated: now.getTime(), start: startKey, status: 'running',
    tracks, share: spec.share === 'serial' ? 'serial' : 'side',
    weekdays: Array.isArray(spec.weekdays) && spec.weekdays.length === 7 ? spec.weekdays.map(Boolean) : [true, true, true, true, true, true, true],
    segs: [], target: startKey, ticks: {}, pauses: [], pace: spec.pace,
  });
  if (spec.name) run.name = spec.name;
  const all = tracks.flatMap((t) => t.items);
  // Side by side: every track spread over the same days; a track with fewer items than days just ends sooner.
  const days = daysForPace(run, spec.pace, startN, all);
  run.segs = [{ day0: 0, from: tracks.map(() => 0), to: tracks.map((t) => t.items.length), days }];
  const firstDay = isReadingDay(run, startN) ? startN : nthReadingDay(run, startN, 0);
  run.target = dateOf(nthReadingDay(run, firstDay, days - 1));
  return run;
}

/** Re-cut what is left from today over `days` reading days. */
function recut(run, days, now) {
  const st = runStatus(run, now);
  if (st.finished) return run;
  const from = remainingFrom(run, st.day);
  const segs = run.segs.filter((s) => s.day0 < st.day);
  segs.push({ day0: st.day, from, to: run.tracks.map((t) => t.items.length), days: Math.max(1, days) });
  return { ...run, segs, updated: now.getTime() };
}

/** The first reading day the re-cut schedule starts on. */
function recutStart(run, now) {
  const st = runStatus(run, now);
  const t = /** @type {number} */ (dayNum(todayKey(now))) + (st.doneToday ? 1 : 0);
  return isReadingDay({ ...run, paused: undefined }, t) ? t : nthReadingDay(run, t, 0);
}

/** Catch me up: keep the daily amount, move the planned finish to the projected one. */
export function catchUp(run, now) {
  const st = runStatus(run, now);
  return { ...run, target: st.projected, updated: now.getTime() };
}

/** Spread it out: keep the planned finish, share what is left over the reading days until it. */
export function spreadOut(run, now) {
  const st = runStatus(run, now);
  const startN = recutStart(run, now), targetN = dayNum(run.target);
  if (st.finished || targetN == null || targetN < startN) return run;
  return recut(run, readingDaysBetween(run, startN, targetN), now);
}

/** What Spread it out would ask each day: { items, words, minutes, days }, or null when it cannot. */
export function spreadPreview(run, now) {
  const next = spreadOut(run, now);
  if (next === run) return null;
  const st = runStatus(next, now);
  return { items: st.perDay.items, words: st.perDay.words, minutes: minutesFor(st.perDay.words), days: st.total - st.day };
}

/** A new pace or length for what is left; the target follows. @param {PlanRun} run @param {PlanPace} pace @param {Date} now */
export function changePace(run, pace, now) {
  const st = runStatus(run, now);
  if (st.finished) return run;
  const startN = recutStart(run, now);
  const left = [];
  for (let d = st.day; d < st.total; d++) left.push(...dayItems(run, d));
  const days = daysForPace(run, pace, startN, left);
  const next = recut({ ...run, pace }, days, now);
  return { ...next, target: dateOf(nthReadingDay(next, startN, days - 1)) };
}

/** New reading weekdays; the schedule from today follows. */
export function changeWeekdays(run, weekdays, now) {
  const next = { ...run, weekdays: weekdays.map(Boolean), updated: now.getTime() };
  return run.pace ? changePace(next, run.pace.mode === 'by' ? run.pace : { mode: 'days', n: totalDays(run) - runStatus(run, now).day }, now) : next;
}

/** Pause from today. */
export function pauseRun(run, now) {
  if (run.paused) return run;
  return { ...run, status: 'paused', paused: todayKey(now), updated: now.getTime() };
}

/** Resume: the pause becomes a closed range and the target moves back by the reading days it covered. */
export function resumeRun(run, now) {
  if (!run.paused) return run;
  const a = /** @type {number} */ (dayNum(run.paused)), b = /** @type {number} */ (dayNum(todayKey(now))) - 1;
  const base = { ...run, paused: undefined, status: /** @type {'running'} */ ('running') };
  delete base.paused;
  if (b < a) return { ...base, updated: now.getTime() };
  const lost = readingDaysBetween(base, a, b);
  const targetN = dayNum(run.target);
  const pauses = (run.pauses || []).concat([[dateOf(a), dateOf(b)]]);
  const next = { ...base, pauses, updated: now.getTime() };
  if (targetN == null || lost === 0) return next;
  return { ...next, target: dateOf(nthReadingDay(next, targetN + 1, lost - 1)) };
}

/** Tick one item read on `dateKey` (a no-op if it is not in the run or already ticked). @param {PlanRun} run @param {string} k */
export function tickItem(run, k, dateKey, at) {
  if (k in (run.ticks || {})) return run;
  if (!run.tracks.some((t) => t.items.some((it) => it.k === k))) return run;
  const next = { ...run, ticks: { ...(run.ticks || {}), [k]: dateKey }, updated: at };
  return finishIfDone(next, dateKey);
}

/** Mark day d done (every item ticked today) or not done (its ticks removed). */
export function markDay(run, d, done, now) {
  const key = todayKey(now);
  const ticks = { ...(run.ticks || {}) };
  for (const it of dayItems(run, d)) {
    if (done) { if (!(it.k in ticks)) ticks[it.k] = key; } else delete ticks[it.k];
  }
  const next = { ...run, ticks, updated: now.getTime() };
  if (!done && next.status === 'finished') { next.status = 'running'; delete next.finished; }
  return done ? finishIfDone(next, key) : next;
}

/** A run whose every day is read is finished on `dateKey`. */
function finishIfDone(run, dateKey) {
  if (run.status === 'finished' || run.status === 'stopped') return run;
  for (let d = 0; d < totalDays(run); d++) if (!dayDone(run, d)) return run;
  return { ...run, status: 'finished', finished: dateKey };
}
