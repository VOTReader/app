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
   - TODAY is the first day not fully read. A day not read costs nothing:
     the projected finish moves and the plan page says so once, quietly
     ("4 days later than planned", lateDays). Keep my daily amount moves
     the target there (catchUp); Finish on time re-cuts what is left to
     keep the target (spreadOut). A paused plan, or one whose start date
     is still ahead, is never late.
   - plans2 (2026-11-10, the reading-plans redesign): a run may start on a
     later date (`start` in the future: no portion until then); reads made
     before the start can be credited (ticks with no date: they count
     toward progress, never toward "done today" or days in a row);
     schedule() lists every day, sections() the road (books or
     collections), streak() the days in a row and this week.

   The decisions the screens read, in one place:
     - is day d done?            isDayDone(run, d)
     - what is today's portion?  runStatus(run, now).day / .todayItems
                                 (none while .notStarted or .finished)
     - is the plan late?         runStatus(run, now).late (calendar days
                                 later than planned; 0 while paused,
                                 before the start, or finished)
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
 * @typedef {{ k: string, w: number, t?: string, s?: string, p?: 1 }} PlanItem
 *   k '<bid>:<cid>' (the read-key tail), w its words, t/s a letter's title and collection short name, p 1 on a
 *   collection's preface (plans2: counted apart, "29 letters and a preface"; older runs have no p)
 * @typedef {{ kind: string, by: 'count' | 'words', items: PlanItem[] }} PlanTrack
 * @typedef {{ day0: number, from: number[], to: number[], days: number, even?: boolean }} PlanSeg
 * @typedef {{ mode: 'days' | 'minutes' | 'items' | 'by', n?: number, date?: string }} PlanPace
 * @typedef {{ id: string, plan: string, name?: string, created?: number, updated?: number, start: string,
 *   status: 'running' | 'paused' | 'finished' | 'stopped', tracks: PlanTrack[], share?: 'side' | 'serial',
 *   weekdays: boolean[], segs: PlanSeg[], target: string, ticks: Record<string, string>,
 *   paused?: string, pauses?: string[][], pace?: PlanPace, finished?: string, from?: string, stopped?: string,
 *   rested?: { until: string, dates: string[] },
 *   known?: string, notes?: Record<string, string>, remind?: string, autoAudio?: boolean, credited?: number,
 *   seen?: boolean }} PlanRun
 *   autoAudio: false turns off the plan week's automatic download (dl-d5); absent is on
 *   credited: how many reads from before the start were counted (plans2; their ticks carry no date)
 *   seen: a finished run's finish page was opened or its Home row dismissed (plans2); false is written at the finish
 *   (FIXB), and a run with no seen (finished before plans2) counts as seen
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

/**
 * Whether a spread-out plan gave nothing to read on past date `n`: what its Today card said that day ("Nothing to read
 * today", runStatus().spreadOn after the date), worked out from the reads made before it. The next reading follows
 * the date the last one was finished, so a reader who read late or early rests on the days the app told them to and
 * is never marked missed for it, while a day a reading was due and not read stays missed. The week strip (streak)
 * and the month calendar (monthCells) both ask this, for spread-out plans only (hasEmptyDays).
 *
 * Every date between two read dates sees the same reads, and with the same reads the card's next reading date is the
 * same whatever the date (only whether that date is still ahead changes), so one runStatus serves the whole stretch:
 * `rests()` makes the per-call memo that streak and monthCells pass in (a long streak asked one runStatus per date).
 * @param {PlanRun} run @param {number} n @param {RestMemo} [memo]
 */
function restedOn(run, n, memo = rests(run)) {
  const key = dateOf(n);
  // Before a change to the target or the layout (pinRests): what the card said then, kept.
  if (memo.pinned && key < memo.pinned.until) return memo.pinned.dates.has(key);
  // The latest read date before n: the stretch n belongs to (none: from the start).
  const { dates, next } = memo;
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (dates[mid] < key) lo = mid + 1; else hi = mid; }
  const cut = lo ? dates[lo - 1] : '';
  let due = next.get(cut);
  if (due === undefined) {
    /** @type {Record<string, string>} */ const ticks = {};
    for (const [k, v] of Object.entries(run.ticks || {})) if (!v || v <= cut) ticks[k] = v;   // credited reads ('') count
    // The stretch's first date (never before the start, where the plan has not begun).
    const startN = dayNum(run.start);
    const first = Math.max(cut ? /** @type {number} */ (dayNum(cut)) + 1 : -Infinity, startN ?? n);
    const d = new Date(first * 86400000);
    const then = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
    due = runStatus({ ...run, ticks, status: 'running', paused: undefined }, then).spreadOn;
    next.set(cut, due);
  }
  return due > key;
}

/** @typedef {{ dates: string[], next: Map<string, string>, of: unknown[], pinned: { until: string, dates: Set<string> } | null }} RestMemo */
const _restMemo = new WeakMap();
/**
 * The memo restedOn uses for one run: its read dates in order, and each stretch's next reading date. Kept per ticks
 * object (a tick makes a new one) while the plan's layout, days off, pauses, start and target are the same objects,
 * so the Today card, the list and the plan page share one set of runStatus calls. @param {PlanRun} run @returns {RestMemo}
 */
function rests(run) {
  const ticks = run.ticks || {};
  const of = [run.segs, run.tracks, run.weekdays, run.pauses, run.start, run.target, run.rested, Object.keys(ticks).length];
  const hit = run.ticks ? _restMemo.get(run.ticks) : null;
  if (hit && hit.of.every((v, i) => v === of[i])) return hit;
  const r = run.rested;
  const pinned = r && typeof r.until === 'string' && Array.isArray(r.dates) ? { until: r.until, dates: new Set(r.dates) } : null;
  const memo = { dates: [...new Set(Object.values(ticks).filter(Boolean))].sort(), next: new Map(), of, pinned };
  if (run.ticks) _restMemo.set(run.ticks, memo);
  return memo;
}

/**
 * Keep what a spread-out plan's Today card said on the days before today when the target or the layout changes
 * (Catch me up, Spread it out, a new pace or Finish by date, new days, new contents, Start today, Resume): whether a
 * past day was a rest day depends on the target (a reader behind it gets no rest day), so judging the past against
 * the new one turned rest days into missed days and missed days into rest days. `after` gets the rest days up to
 * yesterday as `before` had them (its own earlier pins included). A plan read day after day before and after is
 * returned unchanged. @param {PlanRun} before @param {PlanRun} after @param {Date} now @returns {PlanRun}
 */
function pinRests(before, after, now) {
  if (after === before || (!hasEmptyDays(before) && !before.rested && !hasEmptyDays(after))) return after;
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  const startN = dayNum(before.start);
  if (startN == null || today <= startN) return after;
  const memo = rests(before), spread = hasEmptyDays(before), was = memo.pinned;
  const nopause = { ...before, paused: undefined };
  // The days an earlier change pinned are kept as they were, whatever the reading days are now (a rest day under the
  // old weekdays stays one after a second change of days); only the days since are judged, against `before`.
  const dates = was ? [...was.dates].filter((k) => k < was.until).sort() : [];
  const from = was ? Math.max(startN, /** @type {number} */ (dayNum(was.until))) : startN;
  for (let n = from; n < today; n++) if ((spread || was) && isReadingDay(nopause, n) && restedOn(before, n, memo)) dates.push(dateOf(n));
  return { ...after, rested: { until: dateOf(Math.max(today, was ? /** @type {number} */ (dayNum(was.until)) : today)), dates } };
}

/**
 * Whether the run has an empty day before a day with readings: a plan spread over more days than it has readings
 * (d682e8ed7). Every other plan (one reading day after another, an old short cut's empty last days included) keeps
 * the days in a row, week strip and month calendar it had before spread-out plans (03d0ea090), exactly.
 * @param {PlanRun} run
 */
export function hasEmptyDays(run) {
  let empty = false;
  for (const day of planDays(run)) { if (!day.parts.length) empty = true; else if (empty) return true; }
  return false;
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
 * With `opts.fit` a words cut still starts a new day early when the items left only just cover the days left, so no
 * day goes empty while there are items; with `opts.spread` fewer items than days are spread out, the first on the
 * first day and the last on the last.
 * @param {PlanItem[]} items @param {number} from @param {number} to @param {number} days @param {'count' | 'words'} by
 * @param {{ fit?: boolean, spread?: boolean }} [opts]
 * @returns {number[]}
 */
export function cutPoints(items, from, to, days, by, opts = {}) {
  const n = Math.max(0, to - from), D = Math.max(1, Math.floor(days) || 1);
  const out = [from];
  if (opts.spread && by === 'words' && n > 0 && n < D) {
    // Fewer readings than days: the first on the first day, the last on the last, the rest evenly between.
    const dayOf = (i) => (n === 1 ? 0 : Math.round(i * (D - 1) / (n - 1)));
    for (let d = 1; d < D; d++) { let c = 0; while (c < n && dayOf(c) < d) c++; out.push(from + c); }
    out.push(to);
    return out;
  }
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
    while (d < D && i > out[out.length - 1] && (acc + w / 2 >= d * total / D || (opts.fit && to - i <= D - d))) { out.push(i); d++; }
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
    // A segment cut since 2026-11-26 (`even`) keeps an item on every day while there are enough, and a one-track plan
    // shorter than its days spreads them out; older segments keep the cut their readers already have.
    const opts = seg.even ? { fit: true, spread: run.tracks.length === 1 } : {};
    const cuts = run.tracks.map((tr, t) => cutPoints(tr.items, seg.from[t], seg.to[t], seg.days, tr.by, opts));
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

/** How many chapters, letters and prefaces a set of items holds (a preface is never a letter). @param {PlanItem[]} items */
export function itemKinds(items) {
  let chapters = 0, letters = 0, prefaces = 0;
  for (const it of items) { if (!it.t) chapters++; else if (it.p) prefaces++; else letters++; }
  return { chapters, letters, prefaces };
}

/** "1 chapter", "3 letters", "2 chapters + 1 letter", "29 letters and a preface". @param {PlanItem[]} items */
export function itemsCount(items) {
  const { chapters: ch, letters: le, prefaces: pr } = itemKinds(items);
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');
  const p = [];
  if (ch) p.push(fmt(ch) + (ch === 1 ? ' chapter' : ' chapters'));
  if (le) p.push(fmt(le) + (le === 1 ? ' letter' : ' letters'));
  let s = p.join(' + ');
  if (pr) s += (s ? ' and ' : '') + (pr === 1 ? 'a preface' : fmt(pr) + ' prefaces');
  return s;
}

/** Words in a set of items. @param {PlanItem[]} items */
export const itemsWords = (items) => items.reduce((s, it) => s + (Number(it.w) || 0), 0);

/** Reading minutes for some words, at least 1. @param {number} words */
export const minutesFor = (words) => Math.max(1, Math.round(words / WORDS_PER_MIN));

// ── where a run stands ───────────────────────────────────────────────────

/**
 * THE "is this day done" decision: every item of day d is ticked (a credited tick, read before the start, counts).
 * @param {PlanRun} run @param {number} d
 */
export function isDayDone(run, d) {
  const items = dayItems(run, d);
  if (!items.length) return true;
  for (const it of items) if (!(it.k in (run.ticks || {}))) return false;
  return true;
}
const dayDone = isDayDone;

/**
 * The date day d was finished on: its latest dated tick. '' when it is done only by credited (undated) ticks, null
 * when it is not done. @param {PlanRun} run @param {number} d @returns {string | null}
 */
export function dayDoneOn(run, d) {
  if (!isDayDone(run, d)) return null;
  let best = '';
  for (const it of dayItems(run, d)) { const v = (run.ticks || {})[it.k]; if (v && v > best) best = v; }
  return best;
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
 *   behind: number, ahead: number, late: number, paused: boolean, notStarted: boolean, percent: number,
 *   perDay: { items: number, words: number }, spreadOn: string, lastDay: number, todayDay: number }}
 *   todayDay: the plan's own day today (0-based, from its start), for "Day N of M": a spread-out plan's empty day
 *   counts as its own day, never as the next reading's.
 *   spreadOn: the date the portion falls on when a spread-out plan's empty days put it after today ('' otherwise).
 *   lastDay: the last day with readings before the portion (-1 when none); day - 1 unless empty days lie between.
 *   day: the portion's day (the first day not fully read); todayItems its items. notStarted: the start date is
 *   still ahead (no portion yet). late: calendar days the projected finish lies past the planned one (0 when
 *   paused, not started or finished). behind / ahead: the same in reading days (older callers).
 */
export function runStatus(run, now) {
  const total = totalDays(run);
  const ticks = run.ticks || {};
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  let day = total;
  for (let d = 0; d < total; d++) if (!dayDone(run, d)) { day = d; break; }
  let doneDays = 0;
  for (let d = 0; d < total; d++) if (dayDone(run, d)) doneDays++;
  let itemsDone = 0, itemsTotal = 0;
  for (const tr of run.tracks) for (const it of tr.items) { itemsTotal++; if (it.k in ticks) itemsDone++; }
  const finished = day >= total;
  const todayItems = finished ? [] : dayItems(run, day);
  const todayTicked = todayItems.filter((it) => it.k in ticks).length;
  // A day finished today: the last tick of the last day with readings before `day` is dated today. A spread-out plan
  // (d682e8ed7) has empty days between its readings; an empty day is never "read", so the check looks past them.
  let last = day - 1;
  while (last >= 0 && !dayItems(run, last).length) last--;
  const gap = day - 1 - last;   // empty days between the last day with readings and the portion
  let doneToday = false;
  // A finished plan whose last days are empty is not "done today" (as on 03d0ea090): the day just read is not its last.
  if (last >= 0 && !(finished && last < day - 1)) {
    const prev = dayItems(run, last);
    doneToday = prev.some((it) => ticks[it.k] === dateOf(today)) && todayTicked === 0;
  }
  const paused = run.status === 'paused' || !!run.paused;
  const startN = dayNum(run.start);
  const notStarted = !finished && startN != null && today < startN;
  const remaining = total - day;
  let from = notStarted ? /** @type {number} */ (startN) : today + (doneToday || paused ? 1 : 0);
  // The empty days still take their reading days: the portion after them falls on its spread day, counted from the
  // date the last reading was finished, never sooner (reading Ruth 1 on Thursday keeps Ruth 2 on Saturday).
  let spreadOn = '';
  // The plan's own day today, counted from its start ("Day N of M"): the day just read once today's is done, else the
  // portion's; on a spread-out plan's empty day, that empty day's own number.
  let todayDay = doneToday ? last : day;
  if (!finished && !notStarted && gap > 0) {
    // A day done only by credit (read before the start) counts as read on the start date, so the empty days after it
    // still come first: Ruth 1 credited, the start day is Day 1 and Ruth 2 falls on day 3, never on the start day.
    // Only a real day with readings can be credited: a plan that opens with empty days (2 Peter over 7 days) has no
    // day read yet, and its empty days count from the start date as the layout lays them out.
    const doneOn = last >= 0 ? dayDoneOn(run, last) : null;
    const lastOn = last < 0 ? (startN == null ? null : startN - 1) : doneOn === '' ? startN : dayNum(doneOn || '');
    const due = lastOn == null ? null : nthReadingDay(run, lastOn + 1, gap);
    // A paused or stopped plan's day stays where it was on the pause or stop date.
    // (Never before the start: a plan paused or stopped before it began holds its first day, as resumeRun counts.)
    let held = dayNum((paused ? run.paused : run.status === 'stopped' ? run.stopped : '') || '');
    if (held != null && startN != null && held < startN) held = startN;
    const t = held != null && held < today ? held : today;
    if (lastOn != null && due != null && due > t + (doneToday ? 1 : 0)) {
      // A paused plan keeps no date ahead (its finish waits) but still counts its day as the card did.
      if (!paused && t === today) { from = due; spreadOn = dateOf(due); }
      // On or before the day just read: that day. After it: the empty day the next reading day is, counted one reading
      // day each from the day after it (a day off, the weekend after a Friday read, takes the next one, as on a plan
      // read day after day), never past the portion.
      if (!doneToday) todayDay = t <= lastOn ? last : Math.min(day, last + 1 + readingDaysBetween(run, lastOn + 1, t - 1));
    }
  }
  // A plan not started yet that opens with empty days is on its Day 1 (its first day is empty, so "the portion" is a
  // later day); a plan read day after day keeps 03d0ea090's portion.
  if (notStarted && last < 0 && gap > 0) todayDay = 0;
  let projectedN = finished ? from - 1 : nthReadingDay(run, from, remaining - 1);
  const targetN = dayNum(run.target);
  let behind = 0, ahead = 0, late = 0;
  // A reader behind the target gets no rest days: the next portion is offered today (and the reminder stays), so each
  // read day gains the empty days back; the rest days come back once the plan is on schedule again.
  if (spreadOn && !finished && !paused && !notStarted && targetN != null && projectedN > targetN) {
    spreadOn = ''; from = today + (doneToday ? 1 : 0); todayDay = doneToday ? last : day;
    projectedN = nthReadingDay(run, from, remaining - 1);
  }
  if (!finished && !paused && !notStarted && targetN != null) {
    if (projectedN > targetN) { behind = readingDaysBetween(run, targetN + 1, projectedN); late = projectedN - targetN; }
    else if (projectedN < targetN) ahead = readingDaysBetween(run, projectedN + 1, targetN);
  }
  const nextDays = Math.max(1, remaining);
  let leftItems = 0, leftWords = 0;
  for (let d = day; d < total; d++) for (const it of dayItems(run, d)) { leftItems++; leftWords += Number(it.w) || 0; }
  return {
    total, day, finished, todayItems, todayTicked, doneToday, doneDays, itemsDone, itemsTotal,
    projected: paused && !finished ? run.target : dateOf(projectedN), target: run.target, behind, ahead, late, paused, notStarted,
    percent: finished ? 100 : itemsTotal ? Math.min(99, Math.round(itemsDone * 100 / itemsTotal)) : 0,
    perDay: { items: leftItems / nextDays, words: leftWords / nextDays }, spreadOn, lastDay: last, todayDay,
  };
}

/**
 * The day a paused or stopped plan's line names ("Day N of M", "Day N is waiting for you"): the portion on a plan read
 * day after day (as on 03d0ea090, even when today's was just read); on a spread-out plan, the Today card's own day,
 * since its empty days are never "the portion". @param {PlanRun} run @param {{ day: number, todayDay: number }} st
 */
export function heldDay(run, st) { return hasEmptyDays(run) ? st.todayDay : st.day; }

/** THE "is this plan late" decision, in calendar days later than planned (0 = on time, paused or not started). */
export const lateDays = (/** @type {PlanRun} */ run, /** @type {Date} */ now) => runStatus(run, now).late;

/** The first date day `from` (a portion not read yet) can be read on: the start, else today. */
function firstOpenDate(run, st, today) {
  const startN = dayNum(run.start);
  const base = st.notStarted && startN != null ? startN : today + (st.doneToday ? 1 : 0);
  return Math.max(nthReadingDay(run, base, 0), dayNum(st.spreadOn || '') ?? 0);
}

/**
 * Every day of the run, for the whole schedule: its items, minutes, whether it is done and on what date, the date it
 * is planned for (a day still to read: from the open date on, one reading day each), and the sections (books or
 * collections) whose last item it holds. `name` is a section's name (sections()).
 * @param {PlanRun} run @param {Date} now @param {(bid: string) => string} [bookTitle]
 * @returns {{ day: number, items: PlanItem[], minutes: number, done: boolean, doneOn: string | null, credited: boolean,
 *   date: string, today: boolean, ends: string[] }[]}
 */
export function schedule(run, now, bookTitle) {
  const st = runStatus(run, now);
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  const open = st.finished ? today : firstOpenDate(run, st, today);
  const ends = new Map();
  for (const s of sections(run, bookTitle || (() => ''))) {
    if (s.lastDay < 0) continue;
    if (!ends.has(s.lastDay)) ends.set(s.lastDay, []);
    ends.get(s.lastDay).push(s.name);
  }
  const out = [];
  const total = st.total;
  let cursor = open;
  for (let d = 0; d < total; d++) {
    const items = dayItems(run, d);
    const doneOn = dayDoneOn(run, d);
    const done = doneOn != null;
    let date = doneOn || '';
    if (d >= st.day) {
      // A day from the portion on (read ahead or not): planned one reading day each from the open date.
      const n = nthReadingDay(run, cursor, 0);
      date = dateOf(n);
      cursor = n + 1;
    }
    out.push({
      day: d, items, minutes: items.length ? minutesFor(itemsWords(items)) : 0, done, doneOn, credited: doneOn === '',
      date, today: !st.finished && !st.notStarted && !st.paused && d === st.day && !st.doneToday && !st.spreadOn, ends: ends.get(d) || [],
    });
  }
  return out;
}

/**
 * The road: the run's sections in reading order, a Bible book or a letter collection each (a mixed run lists both
 * tracks', by the day each begins). count / done its items; firstDay / lastDay the days it starts and ends on.
 * @param {PlanRun} run @param {(bid: string) => string} bookTitle
 * @returns {{ key: string, name: string, track: number, count: number, done: number, firstDay: number, lastDay: number }[]}
 */
export function sections(run, bookTitle) {
  const days = planDays(run);
  /** @type {number[][]} */ const dayOf = run.tracks.map((tr) => new Array(tr.items.length).fill(-1));
  days.forEach((day, d) => { for (const [t, a, b] of day.parts) for (let i = a; i < b; i++) dayOf[t][i] = d; });
  const ticks = run.ticks || {};
  /** @typedef {{ key: string, name: string, track: number, count: number, done: number, firstDay: number, lastDay: number }} Section */
  /** @type {Section[]} */ const out = [];
  run.tracks.forEach((tr, t) => {
    /** @type {Section | null} */ let last = null;
    tr.items.forEach((it, i) => {
      const bid = it.k.slice(0, it.k.lastIndexOf(':'));
      const key = it.t ? 'l:' + (it.s || bid) : 'b:' + bid;
      /** @type {Section} */ let cur;
      if (!last || last.key !== key) {
        cur = { key, name: it.t ? (it.s || bid) : (bookTitle(bid) || bid), track: t, count: 0, done: 0, firstDay: -1, lastDay: -1 };
        out.push(cur);
        last = cur;
      } else cur = last;
      cur.count++;
      if (it.k in ticks) cur.done++;
      const d = dayOf[t][i];
      if (d >= 0) { if (cur.firstDay < 0) cur.firstDay = d; cur.lastDay = Math.max(cur.lastDay, d); }
    });
  });
  return out.map((s, i) => ({ s, i })).sort((a, b) => (a.s.firstDay - b.s.firstDay) || (a.s.track - b.s.track) || (a.i - b.i)).map((x) => x.s);
}

/**
 * Days in a row and this week, from the dates days were finished on (credited days never count). A reading day with
 * nothing finished ends the run of days, except today, which is still open; days the plan does not read on (its
 * weekdays off, a pause) are passed over. Never a count of what was not read.
 * @param {PlanRun} run @param {Date} now
 * @returns {{ inRow: number, weekDone: number, weekDays: number, week: { date: string, n: number, done: boolean, today: boolean, missed: boolean, off: boolean }[] }}
 */
export function streak(run, now) {
  const done = new Set();
  const total = totalDays(run);
  for (let d = 0; d < total; d++) { const on = dayDoneOn(run, d); if (on) done.add(on); }
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  const startN = dayNum(run.start) ?? today;
  // A plan spread over more days than it has readings (d682e8ed7) has empty days: a date holds a reading only when
  // the plan's day for it has items. From today on that is the day the schedule plans for the date; before today, a
  // day the Today card did not say "Nothing to read today" (restedOn).
  // Every other plan counts every reading day, as it always did (03d0ea090).
  const spread = hasEmptyDays(run);
  const memo = rests(run);
  const planned = new Set();
  if (spread) for (const d of schedule(run, now)) if (!d.done && d.items.length && d.date) planned.add(d.date);
  const pins = !!memo.pinned;   // a plan that was spread out before a change keeps its past rest days (pinRests)
  const holds = (/** @type {number} */ n) => (!spread ? n >= startN && isReadingDay({ ...run, paused: undefined }, n) && !(pins && n < today && restedOn(run, n, memo))
    : n >= today ? planned.has(dateOf(n)) : n >= startN && isReadingDay({ ...run, paused: undefined }, n) && !restedOn(run, n, memo));
  let inRow = 0;
  for (let n = today, guard = 0; n >= startN && guard < 4000; n--, guard++) {
    if (done.has(dateOf(n))) { inRow++; continue; }
    if (n === today || !isReadingDay(run, n) || ((spread || pins) && !holds(n))) continue;
    break;
  }
  const sunday = today - weekdayOf(today);
  const week = [];
  let weekDone = 0, weekDays = 0;
  // 2235 (Corbin 11-16, "detect if day is missed"): each past date says what it was, as the month view does
  // (monthCells): missed = a reading day of the plan with nothing of it read; off = a day the plan does not read on
  // (its weekdays off, a pause). The status counts schedule slip (runStatus.behind); these are the dates themselves.
  const readOn = new Set(Object.values(run.ticks || {}).filter(Boolean));
  const known = run.known ? dayNum(run.known) : null;
  const fin = run.status === 'finished' && run.finished ? dayNum(run.finished) : null;
  const stop = run.status === 'stopped' && run.stopped ? dayNum(run.stopped) : null;
  for (let n = sunday; n < sunday + 7; n++) {
    const key = dateOf(n);
    const isDone = done.has(key);
    if (isDone) weekDone++;
    const holdsReading = ((spread || pins) && isDone) || holds(n);
    if (holdsReading) weekDays++;
    const inPlan = n >= startN && (fin == null || n <= fin) && (stop == null || n < stop) && !(known != null && n < known);
    const off = inPlan && !isReadingDay(run, n);
    const missed = inPlan && !off && n < today && !isDone && !readOn.has(key) && holdsReading;
    week.push({ date: key, n: Number(key.slice(8)), done: isDone, today: n === today, missed, off });
  }
  return { inRow, weekDone, weekDays: Math.max(weekDays, weekDone), week };
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
  // The days still to read on the dates the schedule plans them (the one place a spread-out plan's empty days and a
  // next reading's spread day are laid out): a date is ahead only when its planned day holds a reading.
  // Every other plan keeps 03d0ea090's calendar: each reading day up to the finish holds the next day, one each.
  const spread = hasEmptyDays(run);
  const memo = rests(run);
  const nopause = { ...run, paused: undefined };
  /** @type {Map<string, number>} */ const plannedOn = new Map();
  if (spread) for (const d of schedule(run, now)) if (!d.done && d.items.length && d.date && d.day >= st.day) plannedOn.set(d.date, d.day);
  const first = /** @type {number} */ (dayNum(year + '-' + String(month + 1).padStart(2, '0') + '-01'));
  let planned = st.day;
  // Planned days before this month's first future date: count the reading days from today up to it.
  if (!spread && first > today) planned += readingDaysBetween(run, today + (st.doneToday ? 1 : 0), first - 1);
  for (let date = 1; date <= last; date++) {
    const n = first + date - 1;
    const key = dateOf(n);
    /** @type {'read' | 'missed' | 'today' | 'ahead' | 'none'} */ let state = 'none';
    /** @type {number | null} */ let day = null;
    if (start == null || n < start) state = 'none';
    else if (n === today) state = 'today';
    else if (n < today) {
      state = readOn.has(key) ? 'read'
        : (isReadingDay(run, n) && !st.finished && !(known != null && n < known) && (!(spread || memo.pinned) || !restedOn(run, n, memo)) ? 'missed' : 'none');
    }
    else if (!st.finished && end != null && n <= end && (spread ? plannedOn.has(key) : isReadingDay(nopause, n))) {
      state = 'ahead';
      day = spread ? /** @type {number} */ (plannedOn.get(key)) : planned++;
    }
    // Today's portion takes today only when today is a reading day: 03d0ea090 counted it on a day off too, so every
    // day after one read one too high.
    if (!spread && n === today && !st.doneToday && !st.finished && isReadingDay(nopause, n)) planned++;
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
 *   id?: string, startOn?: string }} spec
 *   startOn: a later start date ('YYYY-MM-DD'); today when absent, unreadable or past
 * @param {Date} now
 * @returns {PlanRun}
 */
export function newRun(spec, now) {
  const todayN = /** @type {number} */ (dayNum(todayKey(now)));
  const askedN = spec.startOn ? dayNum(spec.startOn) : null;
  const startN = askedN != null && askedN > todayN ? askedN : todayN;
  const startKey = dateOf(startN);
  let tracks = spec.tracks.filter((t) => t && Array.isArray(t.items) && t.items.length);
  if (spec.share === 'serial' && tracks.length > 1) {
    tracks = [{ kind: 'mixed', by: tracks.every((t) => t.by === 'count') ? 'count' : 'words', items: tracks.flatMap((t) => t.items) }];
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
  run.segs = [{ day0: 0, from: tracks.map(() => 0), to: tracks.map((t) => t.items.length), days, even: true }];
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
  segs.push({ day0: st.day, from, to: run.tracks.map((t) => t.items.length), days: Math.max(1, days), even: true });
  return { ...run, segs, updated: now.getTime() };
}

/** The first reading day the re-cut schedule starts on. */
function recutStart(run, now) {
  const st = runStatus(run, now);
  const t = st.notStarted ? /** @type {number} */ (dayNum(run.start)) : /** @type {number} */ (dayNum(todayKey(now))) + (st.doneToday ? 1 : 0);
  return isReadingDay({ ...run, paused: undefined }, t) ? t : nthReadingDay(run, t, 0);
}

/** Catch me up: keep the daily amount, move the planned finish to the projected one (a finish-by date moves with it,
    FIXB: left at the old date, a later re-cut to it crammed everything left into one day). */
function catchUpRaw(run, now) {
  const st = runStatus(run, now);
  const pace = run.pace && run.pace.mode === 'by' ? { ...run.pace, date: st.projected } : run.pace;
  return { ...run, ...(pace ? { pace } : {}), target: st.projected, updated: now.getTime() };
}

/** The first date a change of pace can re-cut from ('YYYY-MM-DD'): the earliest "Finish by" the plan can take. */
export function firstRecutDate(run, now) {
  return dateOf(recutStart(run, now));
}

/**
 * The pace a finished run runs again with: a "Finish by" date is behind it now, so it runs again over as many days
 * as it had (FIXB: the old date gave the new run one day holding every item).
 * @param {PlanRun} run @returns {PlanPace | undefined}
 */
export function againPace(run) {
  return run.pace && run.pace.mode === 'by' ? { mode: 'days', n: Math.max(1, totalDays(run)) } : run.pace;
}

/**
 * The reading days a whole-plan length of `n` days leaves for what is still to read: n less the days already read
 * ("90 days" means 90), but never more each day than twice that length's own daily amount (FIXB: a plan already at
 * or past the length put everything left into one day).
 * @param {PlanRun} run @param {number} n @param {number} day the first day not read @param {PlanItem[]} left
 */
function lengthDays(run, n, day, left) {
  const all = run.tracks.flatMap((t) => t.items);
  const total = itemsWords(all), rest = itemsWords(left);
  const share = total > 0 ? rest / total : (all.length ? left.length / all.length : 0);
  return Math.max(1, n - day, Math.ceil(n * share / 2));
}

/** Spread it out: keep the planned finish, share what is left over the reading days until it. */
function spreadOutRaw(run, now) {
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

/**
 * A new pace or length for what is left; the target follows. A length in days is the whole plan's ("90 days" means
 * 90: the days already read count toward it, plans2), never more each day than twice that length's daily amount.
 * A "Finish by" date before the first day it can re-cut from changes nothing.
 * @param {PlanRun} run @param {PlanPace} pace @param {Date} now @param {number} [keepDays] re-cut over exactly this many days
 */
function changePaceRaw(run, pace, now, keepDays) {
  const st = runStatus(run, now);
  if (st.finished) return run;
  const startN = recutStart(run, now);
  const left = [];
  for (let d = st.day; d < st.total; d++) left.push(...dayItems(run, d));
  if (keepDays == null && pace.mode === 'by') {
    // FIXB: a finish-by date before the first day it can re-cut from has no days to share; nothing changes.
    const end = dayNum(pace.date || '');
    if (end == null || end < startN) return run;
  }
  const days = keepDays != null ? Math.max(1, keepDays)
    : pace.mode === 'days' ? lengthDays(run, Math.max(1, Math.floor(Number(pace.n) || 1)), st.day, left) : daysForPace(run, pace, startN, left);
  const next = recut({ ...run, pace }, days, now);
  return { ...next, target: dateOf(nthReadingDay(next, startN, days - 1)) };
}

/** New reading weekdays; the days left stay as many (a finish-by date is kept instead), so the finish follows. */
function changeWeekdaysRaw(run, weekdays, now) {
  const next = { ...run, weekdays: weekdays.map(Boolean), updated: now.getTime() };
  if (!run.pace) return next;
  // FIXB: a finish-by date already behind the re-cut start keeps the days left instead (it gave one day).
  const byEnd = run.pace.mode === 'by' ? dayNum(run.pace.date || '') : null;
  return byEnd != null && byEnd >= recutStart(next, now) ? changePace(next, run.pace, now)
    : changePace(next, run.pace, now, totalDays(run) - runStatus(run, now).day);
}

/**
 * Credit reads from before the start (plans2 "Count my N"): every item the read record holds is ticked with no
 * date, so it counts toward progress but never toward "done today" or days in a row. `credited` keeps how many.
 * @param {PlanRun} run @param {(bid: string, cid: string) => boolean} isRead @returns {PlanRun}
 */
export function creditRead(run, isRead) {
  const ticks = { ...(run.ticks || {}) };
  let n = 0;
  for (const tr of run.tracks) for (const it of tr.items) {
    if (it.k in ticks) continue;
    const i = it.k.lastIndexOf(':');
    if (isRead(it.k.slice(0, i), it.k.slice(i + 1))) { ticks[it.k] = ''; n++; }
  }
  if (!n) return run;
  return finishIfDone({ ...run, ticks, credited: (run.credited || 0) + n }, run.start);
}

/** How many items of these tracks the read record already holds (the "Count my N" offer). */
export function readCount(/** @type {PlanTrack[]} */ tracks, /** @type {(bid: string, cid: string) => boolean} */ isRead) {
  let n = 0;
  for (const tr of tracks) for (const it of tr.items) { const i = it.k.lastIndexOf(':'); if (isRead(it.k.slice(0, i), it.k.slice(i + 1))) n++; }
  return n;
}

/**
 * A custom plan with new contents (2310, Corbin 11-16 "change it"): a NEW run of `spec` from today (or the old run's
 * later start), never a re-cut of the old one, so nothing stored changes shape. Every tick of an item still in the plan
 * carries over by its key with its own date (an undated, credited tick stays undated and counted); the reminder and the
 * download choice carry too. What is left is then cut at the plan's pace by changePace, so a length stays the whole
 * plan's ("90 days" with 40 read leaves 50) and a Finish by date stays that date; a paused plan stays paused. Day
 * notes are keyed by day number and stay on the old run. The caller keeps the old run, stopped, under Past plans.
 * @param {PlanRun} run the plan as it is @param {{ plan: string, name?: string, tracks: PlanTrack[], share?: 'side' | 'serial',
 *   weekdays?: boolean[], pace: PlanPace }} spec its new contents and choices @param {Date} now @returns {PlanRun}
 */
function replaceContentsRaw(run, spec, now) {
  const todayN = /** @type {number} */ (dayNum(todayKey(now)));
  const startN = dayNum(run.start);
  let next = newRun({ ...spec, startOn: startN != null && startN > todayN ? run.start : undefined }, now);
  const keys = new Set(next.tracks.flatMap((t) => t.items.map((it) => it.k)));
  /** @type {Record<string, string>} */ const ticks = {};
  let carried = 0, credited = 0;
  for (const [k, v] of Object.entries(run.ticks || {})) if (keys.has(k)) { ticks[k] = v; carried++; if (!v) credited++; }
  next = { ...next, ticks };
  if (credited) next.credited = credited;
  if (run.remind) next.remind = run.remind;
  if (run.autoAudio === false) next.autoAudio = false;
  if (carried) {
    next = finishIfDone(next, todayKey(now));
    // A length counts the days the reader has read on the OLD run (its days done), never the new cut's: added books
    // put before the read ones, or more each day, would otherwise give the read days back (refuter 2310).
    const pace = next.pace;
    if (next.status !== 'finished' && pace && pace.mode === 'days') {
      const left = next.tracks.flatMap((t) => t.items).filter((it) => !(it.k in ticks));
      next = changePace(next, pace, now, lengthDays(next, Math.max(1, Math.floor(Number(pace.n) || 1)), runStatus(run, now).day, left));
    } else if (next.status !== 'finished' && pace) next = changePace(next, pace, now);
  }
  if (next.status !== 'finished' && (run.status === 'paused' || run.paused)) next = pauseRun(next, now);
  return next;
}

/**
 * "Count only this plan's reading" (0450, hub's pick on 0245 Part B): a run that counted reads from before it began
 * (credited > 0, plans2's Count my N) starts again from today as a NEW run of the same plan, tracks, days and pace
 * (againPace: a Finish by date becomes the plan's own length, or a restart would cram), holding only the old run's
 * DATED ticks: what was read for the plan stays read, the credited (undated) ones go, and `credited` with them. The
 * reminder and the download choice carry; a paused plan stays paused; day notes stay on the old run, which the caller
 * keeps, stopped, under Past plans. Never for an rp1 run (its undated ticks are its own reading) or one with no credit:
 * null then. @param {PlanRun} run @param {Date} now @returns {PlanRun | null}
 */
export function freshFromDated(run, now) {
  if (!canCountOwnOnly(run)) return null;
  let next = newRun({ plan: run.plan, name: run.name, tracks: run.tracks, share: run.share, pace: /** @type {PlanPace} */ (againPace(run)), weekdays: run.weekdays }, now);
  /** @type {Record<string, string>} */ const ticks = {};
  for (const [k, v] of Object.entries(run.ticks || {})) if (v) ticks[k] = v;
  next = { ...next, ticks };
  if (run.remind) next.remind = run.remind;
  if (run.autoAudio === false) next.autoAudio = false;
  next = finishIfDone(next, todayKey(now));
  if (next.status !== 'finished' && (run.status === 'paused' || run.paused)) next = pauseRun(next, now);
  return next;
}

/** Whether a run offers "Count only this plan's reading": it counts reads from before it began, and is not an rp1 run. @param {PlanRun} run */
export function canCountOwnOnly(run) {
  return !!run && (run.credited || 0) > 0 && run.from !== 'rp1' && (run.status === 'running' || run.status === 'paused');
}

/** Start today instead of a later start date: the plan's days move up with it. */
function startTodayRaw(run, now) {
  const st = runStatus(run, now);
  if (!st.notStarted) return run;
  const key = todayKey(now);
  const moved = { ...run, start: key, updated: now.getTime() };
  const days = totalDays(run);
  const todayN = /** @type {number} */ (dayNum(key));
  const first = isReadingDay(moved, todayN) ? todayN : nthReadingDay(moved, todayN, 0);
  return { ...moved, target: dateOf(nthReadingDay(moved, first, days - 1)) };
}

/** Untick one item (the session's "Not read yet"). @param {PlanRun} run @param {string} k @param {Date} now */
export function untickItem(run, k, now) {
  if (!(k in (run.ticks || {}))) return run;
  const ticks = { ...(run.ticks || {}) };
  delete ticks[k];
  const next = { ...run, ticks, updated: now.getTime() };
  if (next.status === 'finished') { next.status = 'running'; delete next.finished; }
  return next;
}

/** Pause from today. */
export function pauseRun(run, now) {
  if (run.paused) return run;
  return { ...run, status: 'paused', paused: todayKey(now), updated: now.getTime() };
}

/** Resume: the pause becomes a closed range and the target moves later by the reading days it covered. Days before
 *  the plan's start were never reading days, so a pause made before a later start counts only from the start. */
function resumeRunRaw(run, now) {
  if (!run.paused) return run;
  const startN = dayNum(run.start);
  const pausedN = /** @type {number} */ (dayNum(run.paused));
  const a = startN != null && startN > pausedN ? startN : pausedN, b = /** @type {number} */ (dayNum(todayKey(now))) - 1;
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

/**
 * S4, weeks on plan (never a streak alarm): how many weeks in a row, Sunday to Saturday, every reading day had
 * something of the plan read on it. This week counts once a day of it is read and none before today missed; a week the plan had not
 * started is not counted, and the first one short ends the count. A missed day repaired by hand (markOn) counts.
 * @param {PlanRun} run @param {Date} now
 */
export function weeksOnPlan(run, now) {
  const start = dayNum(run.start), today = dayNum(todayKey(now));
  if (start == null || today == null) return 0;
  const readOn = new Set(Object.values(run.ticks || {}).filter(Boolean));
  let sunday = today - weekdayOf(today), weeks = 0;
  for (; sunday + 6 >= start; sunday -= 7) {
    let days = 0, ok = true;
    for (let n = Math.max(sunday, start); n <= Math.min(sunday + 6, today); n++) {
      if (!isReadingDay(run, n)) continue;
      if (readOn.has(dateOf(n))) { days++; continue; }
      if (n === today) continue;   // today not read yet: still open, it neither counts nor ends the week
      ok = false;
      break;
    }
    if (!ok) break;
    if (days) weeks++;
  }
  return weeks;
}

/**
 * S4 repair: the reader read on `dateKey` (in print, elsewhere): the plan's next unfinished day is ticked with that
 * date, so the plan moves on and that day counts as read.
 * @param {PlanRun} run @param {string} dateKey @param {Date} now
 */
export function markOn(run, dateKey, now) {
  const st = runStatus(run, now);
  if (st.finished) return run;
  const ticks = { ...(run.ticks || {}) };
  for (const it of dayItems(run, st.day)) if (!(it.k in ticks)) ticks[it.k] = dateKey;
  return finishIfDone({ ...run, ticks, updated: now.getTime() }, todayKey(now));
}

/** A run whose every day is read is finished on `dateKey`; `seen: false` until its finish page is opened (FIXB). */
function finishIfDone(run, dateKey) {
  if (run.status === 'finished' || run.status === 'stopped') return run;
  for (let d = 0; d < totalDays(run); d++) if (!dayDone(run, d)) return run;
  return { ...run, status: 'finished', finished: dateKey, seen: false };
}

/**
 * Whether a finished run still waits to be seen (the Read tab's "You finished" row). Only a finish this build made
 * says so (`seen: false`): a run finished before plans2 has no `seen` at all and counts as seen, so the update never
 * brings back plans finished long ago, and nothing stored is rewritten to say so (FIXB).
 * @param {any} run
 */
export function finishUnseen(run) {
  return !!run && run.status === 'finished' && run.seen === false;
}

// ── start where I am (n354b, hub call 2026-10-23) ────────────────────────

/**
 * The letter a plan could start at instead of its first: the first letter, in the plan's own order (its tracks in
 * order, each in its own order), the reader has not marked read. Null when no letter of it is read yet, when that
 * letter is the plan's first anyway, or when every letter is read. Bible chapters (items with no title) never count.
 * @param {PlanTrack[]} tracks @param {(bid: string, cid: string) => boolean} isRead
 * @returns {{ k: string, t: string, skipped: number } | null}  skipped: the earlier readings it leaves out (plans2 says so)
 */
export function resumeAt(tracks, isRead) {
  const letters = tracks.flatMap((tr) => (tr && Array.isArray(tr.items) ? tr.items : [])).filter((it) => it.t);
  const read = (/** @type {PlanItem} */ it) => { const i = it.k.lastIndexOf(':'); return !!isRead(it.k.slice(0, i), it.k.slice(i + 1)); };
  const at = letters.findIndex((it) => !read(it));
  if (at <= 0) return null;
  return { k: letters[at].k, t: String(letters[at].t), skipped: at };
}

/**
 * The tracks with the letters before `k` left out of the track that holds it (the others as they are).
 * @param {PlanTrack[]} tracks @param {string} k @returns {PlanTrack[]}
 */
export function startFrom(tracks, k) {
  return tracks.map((tr) => {
    const i = tr.items.findIndex((it) => it.k === k);
    return i > 0 ? { ...tr, items: tr.items.slice(i) } : tr;
  });
}

/** catchUp, keeping the past rest days as they were (pinRests). @type {typeof catchUpRaw} */
export const catchUp = (run, now) => pinRests(run, catchUpRaw(run, now), now);

/** spreadOut, keeping the past rest days as they were (pinRests). @type {typeof spreadOutRaw} */
export const spreadOut = (run, now) => pinRests(run, spreadOutRaw(run, now), now);

/** changePace, keeping the past rest days as they were (pinRests). @type {typeof changePaceRaw} */
export const changePace = (run, pace, now, keepDays) => pinRests(run, changePaceRaw(run, pace, now, keepDays), now);

/** changeWeekdays, keeping the past rest days as they were (pinRests). @type {typeof changeWeekdaysRaw} */
export const changeWeekdays = (run, weekdays, now) => pinRests(run, changeWeekdaysRaw(run, weekdays, now), now);

/** replaceContents, keeping the past rest days as they were (pinRests). @type {typeof replaceContentsRaw} */
export const replaceContents = (run, spec, now) => pinRests(run, replaceContentsRaw(run, spec, now), now);

/** startToday, keeping the past rest days as they were (pinRests). @type {typeof startTodayRaw} */
export const startToday = (run, now) => pinRests(run, startTodayRaw(run, now), now);

/** resumeRun, keeping the past rest days as they were (pinRests). @type {typeof resumeRunRaw} */
export const resumeRun = (run, now) => pinRests(run, resumeRunRaw(run, now), now);
