/* plan-engine (mw18): the reading-plan engine that follows the reader.
   Pins the brief's §5.4 list: rp1's table reproduced, a rerun starts clean, flexible today, Catch me up,
   Spread it out, Pause / Resume, a pace change keeps the ticks, manual marks, DST and a bad date. */

import { describe, it, expect } from 'vitest';
import {
  dayNum, dateOf, todayKey, cutPoints, planDays, dayItems, itemsLabel, itemsCount, newRun, runStatus, tickItem,
  markDay, catchUp, spreadOut, spreadPreview, changePace, pauseRun, resumeRun, monthCells, isReadingDay, weeksOnPlan, markOn,
  resumeAt, startFrom,
} from './plan-engine.js';
import { BIBLE_BOOKS, biblePortion, BIBLE_YEAR_DAYS } from './reading-plans.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const bibleItems = () => BIBLE_BOOKS.flatMap(([bid, , n]) => Array.from({ length: Number(n) }, (_, i) => ({ k: bid + ':' + (i + 1), w: 600 })));
const title = (bid) => (BIBLE_BOOKS.find((b) => b[0] === bid) || [])[1];
const bibleYear = (now) => newRun({ plan: 'bible-year', tracks: [{ kind: 'bible', by: 'count', items: bibleItems() }], pace: { mode: 'days', n: 365 } }, now);
const readDay = (run, d, date) => dayItems(run, d).reduce((r, it) => tickItem(r, it.k, date, 1), run);

describe('dates', () => {
  it('round-trips calendar dates and refuses impossible ones', () => {
    expect(dateOf(/** @type {number} */ (dayNum('2026-10-22')))).toBe('2026-10-22');
    expect(dayNum('2026-02-30')).toBeNull();
    expect(dayNum('garbage')).toBeNull();
  });
  it('counts whole calendar days across a DST change, whatever the hour', () => {
    // US DST ended 2026-11-01: the two dates are still one day apart.
    expect(/** @type {number} */ (dayNum(todayKey(at('2026-11-02', 0)))) - /** @type {number} */ (dayNum(todayKey(at('2026-11-01', 23))))).toBe(1);
  });
});

describe('cutting into days', () => {
  it('Bible in a Year by chapter count reproduces rp1\'s biblePortion day for day', () => {
    const run = bibleYear(at('2026-01-01'));
    expect(planDays(run).length).toBe(BIBLE_YEAR_DAYS);
    for (const d of [0, 1, 46, 180, 364]) {
      expect(dayItems(run, d).map((it) => it.k)).toEqual(biblePortion(d).items.map((it) => it.bid + ':' + it.cid));
    }
  });
  it('by words, each day carries about the same words even when items differ 60-fold', () => {
    const items = [80, 5000, 80, 80, 80, 2400, 2500, 80, 80, 5000, 90, 100].map((w, i) => ({ k: 'v:' + i, w, t: 'L' + i }));
    const pts = cutPoints(items, 0, items.length, 4, 'words');
    expect(pts[0]).toBe(0);
    expect(pts[pts.length - 1]).toBe(items.length);
    for (let d = 0; d < 4; d++) expect(pts[d + 1]).toBeGreaterThan(pts[d]);   // no empty day
  });
  it('labels a portion as a reader says it, and counts it', () => {
    const run = bibleYear(at('2026-01-01'));
    expect(itemsLabel(dayItems(run, 0), title)).toBe('Genesis 1-3');
    const mixed = [{ k: 'genesis:3', w: 1 }, { k: 'genesis:4', w: 1 }, { k: 'v7:x', w: 1, t: 'Letter 2', s: 'Volume Seven' }];
    expect(itemsLabel(mixed, title)).toBe('Genesis 3-4 · Volume Seven: Letter 2');
    expect(itemsCount(mixed)).toBe('2 chapters + 1 letter');
  });
});

describe('the flexible schedule', () => {
  it('a new run starts clean: nothing read before it counts (a rerun is not done on day one)', () => {
    const run = bibleYear(at('2026-10-01'));
    const st = runStatus(run, at('2026-10-01'));
    expect(st.day).toBe(0);
    expect(st.doneDays).toBe(0);
    expect(st.finished).toBe(false);
  });

  it('today is the next unfinished day: three missed days cost nothing but move the finish', () => {
    let run = bibleYear(at('2026-10-01'));
    run = readDay(run, 0, '2026-10-01');
    const st = runStatus(run, at('2026-10-05'));
    expect(st.day).toBe(1);                       // not day 4: the reader resumes where they stopped
    expect(st.behind).toBe(3);                    // Oct 2, 3, 4 read nothing
    expect(st.projected).toBe(dateOf(/** @type {number} */ (dayNum(run.target)) + 3));
  });

  it('Catch me up moves the planned finish to the projected one; nothing is behind after', () => {
    let run = readDay(bibleYear(at('2026-10-01')), 0, '2026-10-01');
    run = catchUp(run, at('2026-10-05'));
    const st = runStatus(run, at('2026-10-05'));
    expect(st.behind).toBe(0);
    expect(st.day).toBe(1);
  });

  it('Spread it out keeps the planned finish and shares what is left, a little more each day', () => {
    let run = readDay(bibleYear(at('2026-10-01')), 0, '2026-10-01');
    const before = runStatus(run, at('2026-10-11'));
    const preview = spreadPreview(run, at('2026-10-11'));
    run = spreadOut(run, at('2026-10-11'));
    const st = runStatus(run, at('2026-10-11'));
    expect(st.behind).toBe(0);
    expect(st.projected).toBe(run.target);
    expect(st.perDay.items).toBeGreaterThan(before.perDay.items);
    expect(preview && preview.days).toBe(st.total - st.day);
    // the day already read keeps its portion
    expect(dayItems(run, 0).map((it) => it.k)).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
  });

  it('a pace change mid-plan keeps every tick and re-cuts only what is left', () => {
    let run = bibleYear(at('2026-10-01'));
    for (let d = 0; d < 10; d++) run = readDay(run, d, dateOf(/** @type {number} */ (dayNum('2026-10-01')) + d));
    const ticks = Object.keys(run.ticks).length;
    run = changePace(run, { mode: 'days', n: 80 }, at('2026-10-11'));
    const st = runStatus(run, at('2026-10-11'));
    expect(Object.keys(run.ticks).length).toBe(ticks);
    expect(st.day).toBe(10);
    expect(st.total).toBe(90);
    expect(st.behind).toBe(0);
    expect(dayItems(run, 9).map((it) => it.k)).toEqual(biblePortion(9).items.map((it) => it.bid + ':' + it.cid));
  });

  it('Pause stops the clock; Resume moves the planned finish back by the paused reading days', () => {
    let run = readDay(bibleYear(at('2026-10-01')), 0, '2026-10-01');
    const target = run.target;
    run = pauseRun(run, at('2026-10-02'));
    expect(runStatus(run, at('2026-10-06')).paused).toBe(true);
    run = resumeRun(run, at('2026-10-06'));            // Oct 2-5 paused
    expect(run.target).toBe(dateOf(/** @type {number} */ (dayNum(target)) + 4));
    expect(runStatus(run, at('2026-10-06')).behind).toBe(0);
    expect(isReadingDay(run, /** @type {number} */ (dayNum('2026-10-03')))).toBe(false);
  });

  it('5-day weeks: weekends are not reading days and do not make the reader behind', () => {
    const wk = [false, true, true, true, true, true, false];
    let run = newRun({ plan: 'nt', tracks: [{ kind: 'bible', by: 'count', items: bibleItems().slice(929) }], weekdays: wk, pace: { mode: 'days', n: 52 } }, at('2026-10-23'));   // a Friday
    run = readDay(run, 0, '2026-10-23');
    const st = runStatus(run, at('2026-10-26'));        // Monday
    expect(st.day).toBe(1);
    expect(st.behind).toBe(0);
  });
});

describe('ticks and marks', () => {
  it('a tick outside the run is ignored; the last tick finishes the run', () => {
    let run = newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'jude:1', w: 600 }] }], pace: { mode: 'days', n: 1 } }, at('2026-10-22'));
    expect(tickItem(run, 'john:1', '2026-10-22', 1)).toBe(run);
    run = tickItem(run, 'jude:1', '2026-10-22', 1);
    expect(run.status).toBe('finished');
    expect(run.finished).toBe('2026-10-22');
  });
  it('a long-press marks a day done (dated today) or not done', () => {
    let run = bibleYear(at('2026-10-01'));
    run = markDay(run, 0, true, at('2026-10-02'));
    expect(runStatus(run, at('2026-10-02')).day).toBe(1);
    expect(runStatus(run, at('2026-10-02')).doneToday).toBe(true);
    run = markDay(run, 0, false, at('2026-10-02'));
    expect(runStatus(run, at('2026-10-02')).day).toBe(0);
  });
});

describe('mixed plans', () => {
  const letters = Array.from({ length: 6 }, (_, i) => ({ k: 'v7:' + i, w: 1200, t: 'Letter ' + (i + 1), s: 'Volume Seven' }));
  const gen = bibleItems().slice(0, 12);
  it('side by side: every day has some Bible and some letters, and both end on the last day', () => {
    const run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: gen }, { kind: 'letters', by: 'words', items: letters }], share: 'side', pace: { mode: 'days', n: 6 } }, at('2026-10-22'));
    for (let d = 0; d < 6; d++) {
      const its = dayItems(run, d);
      expect(its.some((it) => !it.t)).toBe(true);
      expect(its.some((it) => it.t)).toBe(true);
    }
  });
  it('one after the other: the Bible comes first, then the letters', () => {
    const run = newRun({ plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: gen }, { kind: 'letters', by: 'words', items: letters }], share: 'serial', pace: { mode: 'minutes', n: 9 } }, at('2026-10-22'));
    expect(dayItems(run, 0).every((it) => !it.t)).toBe(true);
    const total = planDays(run).length;
    expect(dayItems(run, total - 1).every((it) => it.t)).toBe(true);
  });
});

describe('the calendar', () => {
  it('marks read days, missed reading days, today and the days still ahead', () => {
    let run = bibleYear(at('2026-10-01'));
    run = readDay(run, 0, '2026-10-01');
    run = readDay(run, 1, '2026-10-03');
    const cells = monthCells(run, 2026, 9, at('2026-10-05'));
    const st = (d) => cells[d - 1].state;
    expect(st(1)).toBe('read');
    expect(st(2)).toBe('missed');
    expect(st(3)).toBe('read');
    expect(st(5)).toBe('today');
    expect(st(6)).toBe('ahead');
    expect(cells[5].day).toBe(3);   // Oct 6 reads day 4 (0-based 3) on the flexible schedule
  });
});

describe('weeks on plan (S4)', () => {
  // 2026-10-04 is a Sunday. Read every day from Sun 10-04 to Sat 10-17 (two whole weeks), then this week so far.
  const readDays = (run, days) => days.reduce((r, d) => markOn(r, d, at(d)), run);
  const dates = (a, b) => { const out = []; for (let n = dayNum(a); n <= dayNum(b); n++) out.push(dateOf(n)); return out; };

  it('counts whole weeks with every reading day read, and this week once its days so far are read', () => {
    let run = bibleYear(at('2026-10-04'));
    run = readDays(run, dates('2026-10-04', '2026-10-20'));
    expect(weeksOnPlan(run, at('2026-10-20'))).toBe(3);   // two whole weeks + this week (Sun-Tue) so far
    expect(weeksOnPlan(run, at('2026-10-21'))).toBe(3);   // Wed not read yet: still on plan, today is open
  });

  it('a week short ends the count; repairing the missed day by hand puts it back', () => {
    let run = bibleYear(at('2026-10-04'));
    run = readDays(run, dates('2026-10-04', '2026-10-10').concat(dates('2026-10-12', '2026-10-17')));   // Sun 10-11 missed
    expect(weeksOnPlan(run, at('2026-10-17'))).toBe(0);
    run = markOn(run, '2026-10-11', at('2026-10-18'));
    expect(weeksOnPlan(run, at('2026-10-18'))).toBe(2);   // both whole weeks again; the new week has nothing read yet
  });

  it('markOn ticks the next unfinished day with the date given', () => {
    const run = markOn(bibleYear(at('2026-10-04')), '2026-10-05', at('2026-10-06'));
    expect(dayItems(run, 0).every((it) => run.ticks[it.k] === '2026-10-05')).toBe(true);
    expect(runStatus(run, at('2026-10-06')).day).toBe(1);
  });
});

/* n354b (hub call 2026-10-23 19:30): a plan with letters can start where the reader is. The next unread is the
   first letter, in the plan's own order, the reader has not marked read; no offer when nothing is read yet, or
   when that letter is already the plan's first. */
describe('start where I am (n354b)', () => {
  const L = (id, t) => ({ k: 'one:' + id, w: 100, t: t || 'Letter ' + id, s: 'V1' });
  const letters = { kind: 'letters', by: 'words', items: [L('a'), L('b'), L('c'), L('d')] };
  const bible = { kind: 'bible', by: 'count', items: [{ k: 'genesis:1', w: 600 }, { k: 'genesis:2', w: 600 }] };
  const readOf = (ids) => (bid, cid) => bid === 'one' && ids.includes(cid);

  it('names the first unread letter in plan order once something is read', () => {
    expect(resumeAt([letters], readOf(['a', 'b']))).toEqual({ k: 'one:c', t: 'Letter c' });
    expect(resumeAt([letters], readOf(['a', 'c']))).toEqual({ k: 'one:b', t: 'Letter b' });
  });

  it('offers nothing when nothing is read, when the first letter is still unread, or when every letter is read', () => {
    expect(resumeAt([letters], readOf([]))).toBeNull();
    expect(resumeAt([letters], readOf(['c']))).toBeNull();
    expect(resumeAt([letters], readOf(['a', 'b', 'c', 'd']))).toBeNull();
  });

  it('looks at the letters only: Bible chapters read or not change nothing', () => {
    const isRead = (bid, cid) => bid === 'genesis' || (bid === 'one' && cid === 'a');
    expect(resumeAt([bible, letters], isRead)).toEqual({ k: 'one:b', t: 'Letter b' });
    expect(resumeAt([bible], () => true)).toBeNull();
  });

  it('startFrom drops the letters before it from their track and leaves the rest alone', () => {
    const out = startFrom([bible, letters], 'one:c');
    expect(out[0]).toBe(bible);
    expect(out[1].items.map((it) => it.k)).toEqual(['one:c', 'one:d']);
    expect(letters.items).toHaveLength(4);                      // not mutated
    expect(startFrom([letters], 'one:zz')[0]).toBe(letters);    // a key it does not hold changes nothing
  });

  it('a run started from there opens on that letter', () => {
    const run = newRun({ plan: 'volumes', tracks: startFrom([letters], 'one:c'), pace: { mode: 'items', n: 1 } }, at('2026-10-23'));
    expect(dayItems(run, 0).map((it) => it.k)).toEqual(['one:c']);
    expect(planDays(run)).toHaveLength(2);
  });
});
