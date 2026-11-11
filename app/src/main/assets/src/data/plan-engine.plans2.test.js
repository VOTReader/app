/* plan-engine, plans2 (the reading-plans redesign, 2026-11-10): a later start date, credited reads, the whole
   schedule, the road, days in a row and this week, a paused plan never late, the finish drift in days, "90 days"
   means 90, singular counts, and old stored runs that load and read unchanged. */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  dayNum, dateOf, dayItems, newRun, runStatus, tickItem, markDay, pauseRun, resumeRun, changePace, changeWeekdays,
  isDayDone, dayDoneOn, schedule, sections, streak, lateDays, creditRead, readCount, startToday, untickItem, itemsCount,
  itemKinds, catchUp, spreadOut, totalDays,
} from './plan-engine.js';
import { BIBLE_BOOKS } from './reading-plans.js';
import { runRow } from '../utils/plan-runs-view.js';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h); };
const bibleItems = () => BIBLE_BOOKS.flatMap(([bid, , n]) => Array.from({ length: Number(n) }, (_, i) => ({ k: bid + ':' + (i + 1), w: 600 })));
const title = (bid) => String((BIBLE_BOOKS.find((b) => b[0] === bid) || [])[1] || '');
const bibleYear = (now, extra = {}) => newRun({ plan: 'bible-year', tracks: [{ kind: 'bible', by: 'count', items: bibleItems() }], pace: { mode: 'days', n: 365 }, ...extra }, now);
const readDay = (run, d, date) => dayItems(run, d).reduce((r, it) => tickItem(r, it.k, date, 1), run);
const plus = (s, n) => dateOf(/** @type {number} */ (dayNum(s)) + n);

describe('a later start date (startOn)', () => {
  it('starts on the chosen day: no portion until then, never late, the schedule begins there', () => {
    const run = bibleYear(at('2026-11-10'), { startOn: '2026-11-12' });
    expect(run.start).toBe('2026-11-12');
    const st = runStatus(run, at('2026-11-10'));
    expect(st.notStarted).toBe(true);
    expect(st.late).toBe(0);
    expect(st.projected).toBe(run.target);
    expect(schedule(run, at('2026-11-10'), title)[0].date).toBe('2026-11-12');
    expect(runStatus(run, at('2026-11-12')).notStarted).toBe(false);
  });
  it('a past or unreadable start date starts today', () => {
    expect(bibleYear(at('2026-11-10'), { startOn: '2026-11-01' }).start).toBe('2026-11-10');
    expect(bibleYear(at('2026-11-10'), { startOn: 'soon' }).start).toBe('2026-11-10');
  });
  it('Start today instead moves the start and the finish up', () => {
    const run = bibleYear(at('2026-11-10'), { startOn: '2026-11-15' });
    const moved = startToday(run, at('2026-11-10'));
    expect(moved.start).toBe('2026-11-10');
    expect(moved.target).toBe(plus(run.target, -5));
    expect(runStatus(moved, at('2026-11-10')).notStarted).toBe(false);
  });
});

describe('credited reads (Count my N)', () => {
  const isRead = (bid, cid) => bid === 'genesis' && Number(cid) <= 5;
  it('counts the read record\'s items toward progress, with no date', () => {
    const run = creditRead(bibleYear(at('2026-11-10')), isRead);
    expect(readCount(run.tracks, isRead)).toBe(5);
    expect(run.credited).toBe(5);
    expect(run.ticks['genesis:1']).toBe('');
    const st = runStatus(run, at('2026-11-10'));
    expect(st.itemsDone).toBe(5);
    expect(st.day).toBe(1);   // day 1 (Genesis 1-3) is done by credit: today's portion is day 2
  });
  it('credited ticks never make a day "done today" and never count as days in a row', () => {
    const run = creditRead(bibleYear(at('2026-11-10')), isRead);
    const st = runStatus(run, at('2026-11-10'));
    expect(st.doneToday).toBe(false);
    expect(isDayDone(run, 0)).toBe(true);
    expect(dayDoneOn(run, 0)).toBe('');
    expect(streak(run, at('2026-11-10')).inRow).toBe(0);
    expect(streak(run, at('2026-11-10')).weekDone).toBe(0);
  });
});

describe('the whole schedule', () => {
  it('lists every day with its items, minutes, planned date and where a book ends', () => {
    const run = bibleYear(at('2026-11-10'));
    const days = schedule(run, at('2026-11-10'), title);
    expect(days.length).toBe(365);
    expect(days[0]).toMatchObject({ day: 0, date: '2026-11-10', done: false, today: true });
    expect(days[0].items.map((it) => it.k)).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
    expect(days[0].minutes).toBe(9);   // 3 x 600 words at 200 a minute
    expect(days[1].date).toBe('2026-11-11');
    const end = days.find((d) => d.ends.includes('Genesis'));
    expect(end && end.items.some((it) => it.k === 'genesis:50')).toBe(true);
  });
  it('a read day carries the date it was read; the days ahead move from the open date', () => {
    let run = bibleYear(at('2026-11-10'));
    run = readDay(run, 0, '2026-11-10');
    const days = schedule(run, at('2026-11-12'), title);
    expect(days[0]).toMatchObject({ done: true, doneOn: '2026-11-10', date: '2026-11-10' });
    expect(days[1]).toMatchObject({ done: false, date: '2026-11-12', today: true });
  });
  it('weekdays only: the planned dates skip the weekend', () => {
    const run = newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: bibleItems().slice(0, 10) }], pace: { mode: 'days', n: 10 },
      weekdays: [false, true, true, true, true, true, false] }, at('2026-11-13'));   // a Friday
    const days = schedule(run, at('2026-11-13'), title);
    expect(days[0].date).toBe('2026-11-13');
    expect(days[1].date).toBe('2026-11-16');   // Monday
  });
});

describe('the road (sections)', () => {
  it('one section per Bible book, in order, with its count, what is read and the days it spans', () => {
    let run = bibleYear(at('2026-11-10'));
    run = readDay(run, 0, '2026-11-10');
    const road = sections(run, title);
    expect(road.length).toBe(66);
    expect(road[0]).toMatchObject({ name: 'Genesis', count: 50, done: 3, firstDay: 0 });
    expect(road[1].name).toBe('Exodus');
    expect(road[1].firstDay).toBeGreaterThan(road[0].firstDay);
  });
  it('letters are sectioned by collection; a mixed plan lists both tracks by the day each begins', () => {
    const letters = { kind: 'letters', by: 'words', items: [
      { k: 'v1:p', w: 300, t: 'Preface', s: 'Volume One', p: /** @type {1} */ (1) }, { k: 'v1:a', w: 600, t: 'A', s: 'Volume One' },
      { k: 'v2:a', w: 600, t: 'B', s: 'Volume Two' }] };
    const bible = { kind: 'bible', by: 'count', items: bibleItems().slice(0, 4) };
    const run = newRun({ plan: 'together', tracks: [letters, bible], share: 'side', pace: { mode: 'days', n: 3 } }, at('2026-11-10'));
    const names = sections(run, title).map((s) => s.name);
    expect(names).toEqual(['Volume One', 'Genesis', 'Volume Two']);
  });
});

describe('days in a row and this week', () => {
  it('counts the dates a day was finished on; today still open does not end the run', () => {
    let run = bibleYear(at('2026-11-01'));   // a Sunday
    for (let d = 0; d < 6; d++) run = readDay(run, d, plus('2026-11-01', d));
    const s = streak(run, at('2026-11-07'));   // Saturday, not read yet
    expect(s.inRow).toBe(6);
    expect(s.weekDone).toBe(6);
    expect(s.weekDays).toBe(7);
    expect(s.week.map((w) => w.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.week[6].today).toBe(true);
  });
  it('a reading day with nothing finished ends the run; a day the plan does not read on does not', () => {
    let run = bibleYear(at('2026-11-02'));
    run = readDay(run, 0, '2026-11-02');
    run = readDay(run, 1, '2026-11-04');   // nothing on the 3rd
    expect(streak(run, at('2026-11-04')).inRow).toBe(1);
    const wk = newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: bibleItems().slice(0, 10) }], pace: { mode: 'days', n: 10 },
      weekdays: [false, true, true, true, true, true, false] }, at('2026-11-13'));
    let r2 = readDay(wk, 0, '2026-11-13');   // Friday
    r2 = readDay(r2, 1, '2026-11-16');       // Monday: the weekend passes over
    expect(streak(r2, at('2026-11-16')).inRow).toBe(2);
  });
});

describe('late, in days, and never while paused', () => {
  it('four days not read: the finish moves four days later than planned', () => {
    const run = bibleYear(at('2026-11-10'));
    expect(lateDays(run, at('2026-11-10'))).toBe(0);
    expect(lateDays(run, at('2026-11-14'))).toBe(4);
    expect(runStatus(run, at('2026-11-14')).projected).toBe(plus(run.target, 4));
  });
  it('a paused plan is never late, however long the pause', () => {
    let run = readDay(bibleYear(at('2026-11-10')), 0, '2026-11-10');
    run = pauseRun(run, at('2026-11-11'));
    const st = runStatus(run, at('2026-12-20'));
    expect(st.paused).toBe(true);
    expect(st.late).toBe(0);
    expect(st.behind).toBe(0);
    expect(runRow(run, at('2026-12-20')).pace).not.toMatch(/later|behind|catch/i);
    // Resume moves the planned finish by the pause: on time again.
    expect(lateDays(resumeRun(run, at('2026-12-20')), at('2026-12-20'))).toBe(0);
  });
  it('Keep my daily amount moves the planned finish; Finish on time re-cuts to keep it', () => {
    const run = bibleYear(at('2026-11-10'));
    const now = at('2026-11-14');
    expect(lateDays(catchUp(run, now), now)).toBe(0);
    const kept = spreadOut(run, now);
    expect(kept.target).toBe(run.target);
    expect(lateDays(kept, now)).toBe(0);
  });
  it('the row speaks one phrase: "N days later than planned"', () => {
    const row = runRow(bibleYear(at('2026-11-10')), at('2026-11-11'));
    expect(row.pace).toMatch(/^Finishes .* · 1 day later than planned$/);
  });
});

describe('lengths and counts', () => {
  it('"90 days" means 90, the days already read included', () => {
    let run = bibleYear(at('2026-11-01'));
    for (let d = 0; d < 10; d++) run = readDay(run, d, plus('2026-11-01', d));
    run = changePace(run, { mode: 'days', n: 90 }, at('2026-11-11'));
    expect(totalDays(run)).toBe(90);
    expect(runStatus(run, at('2026-11-11')).day).toBe(10);
  });
  it('a weekday change keeps the days left', () => {
    const run = bibleYear(at('2026-11-10'));
    expect(totalDays(changeWeekdays(run, [false, true, true, true, true, true, false], at('2026-11-10')))).toBe(365);
  });
  it('singular and plural, and a preface named apart', () => {
    expect(itemsCount([{ k: 'genesis:1', w: 1 }])).toBe('1 chapter');
    expect(itemsCount([{ k: 'v:a', w: 1, t: 'A' }, { k: 'v:b', w: 1, t: 'B' }])).toBe('2 letters');
    expect(itemsCount([{ k: 'v:p', w: 1, t: 'P', p: 1 }, { k: 'v:a', w: 1, t: 'A' }])).toBe('1 letter and a preface');
    expect(itemKinds([{ k: 'v:p', w: 1, t: 'P', p: 1 }])).toEqual({ chapters: 0, letters: 0, prefaces: 1 });
    const one = newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'philemon:1', w: 400 }] }], pace: { mode: 'days', n: 1 } }, at('2026-11-10'));
    expect(runRow(one, at('2026-11-10')).counts).toBe('0 of 1 chapter');
  });
  it('the session\'s "Not read yet" unticks one item and reopens a finished run', () => {
    let run = newRun({ plan: 'x', tracks: [{ kind: 'bible', by: 'count', items: [{ k: 'philemon:1', w: 400 }] }], pace: { mode: 'days', n: 1 } }, at('2026-11-10'));
    run = tickItem(run, 'philemon:1', '2026-11-10', 1);
    expect(run.status).toBe('finished');
    run = untickItem(run, 'philemon:1', at('2026-11-10'));
    expect(run.status).toBe('running');
    expect(run.ticks).toEqual({});
  });
});

describe('old stored runs load unchanged', () => {
  // A run as mw18 stored it (2026-10-22): no credited, seen, or preface marks; an rp1 move with undated ticks.
  const OLD = {
    id: 'rp1_bible-year_2026-09-01', plan: 'bible-year', created: 1, updated: 2, start: '2026-09-01', status: 'running',
    tracks: [{ kind: 'bible', by: 'count', items: bibleItems() }], share: 'side', weekdays: [true, true, true, true, true, true, true],
    segs: [{ day0: 0, from: [0], to: [1189], days: 365 }], target: '2026-08-31', ticks: { 'genesis:1': '', 'genesis:2': '', 'genesis:3': '', 'genesis:4': '2026-10-01' },
    pauses: [], pace: { mode: 'days', n: 365 }, from: 'rp1', known: '2026-10-01',
  };
  const OLD_LETTERS = {
    id: 'p_old', plan: 'seven-volumes', created: 1, updated: 2, start: '2026-10-20', status: 'paused', paused: '2026-10-25',
    tracks: [{ kind: 'letters', by: 'words', items: [{ k: 'v1:p', w: 300, t: 'Preface', s: 'Volume One' }, { k: 'v1:a', w: 900, t: 'A', s: 'Volume One' }] }],
    share: 'side', weekdays: [true, true, true, true, true, true, true], segs: [{ day0: 0, from: [0], to: [2], days: 2 }], target: '2026-10-21',
    ticks: { 'v1:p': '2026-10-20' }, pauses: [], pace: { mode: 'minutes', n: 5 }, notes: { 0: 'j1' }, remind: '07:30',
  };
  beforeEach(() => { localStorage.clear(); ReadingPlanStore._resetForTests({ forceLoaded: true }); });

  it('the store takes them as they are, and saving keeps every field', () => {
    const json = JSON.stringify([OLD, OLD_LETTERS]);
    ReadingPlanStore.replaceAll(JSON.parse(json));
    expect(JSON.stringify(ReadingPlanStore.all())).toBe(json);
    ReadingPlanStore.put(ReadingPlanStore.get(OLD.id));
    expect(JSON.stringify(ReadingPlanStore.all())).toBe(json);
  });
  it('every new reading works on them', () => {
    const now = at('2026-11-10');
    for (const r of [OLD, OLD_LETTERS]) {
      const run = /** @type {any} */ (JSON.parse(JSON.stringify(r)));
      expect(() => { runStatus(run, now); schedule(run, now, title); sections(run, title); streak(run, now); runRow(run, now); }).not.toThrow();
    }
    expect(runStatus(/** @type {any} */ (OLD), now).itemsDone).toBe(4);
    expect(runStatus(/** @type {any} */ (OLD_LETTERS), now).late).toBe(0);   // paused
    expect(itemsCount(OLD_LETTERS.tracks[0].items)).toBe('2 letters');      // no preface mark on an old run: counted as before
  });
});

describe('the store keeps the order and says what a read is', () => {
  beforeEach(() => { localStorage.clear(); ReadingPlanStore._resetForTests({ forceLoaded: true }); });
  it('saving a run does not move it: running plans keep their start order', () => {
    const a = bibleYear(at('2026-11-10'), { id: 'a' }), b = bibleYear(at('2026-11-10'), { id: 'b' });
    ReadingPlanStore.put(a); ReadingPlanStore.put(b);
    ReadingPlanStore.put(markDay(ReadingPlanStore.get('a'), 0, true, at('2026-11-10')));
    expect(ReadingPlanStore.active().map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('noteRead says whether a plan being followed holds the read (and then it is a plan tick)', () => {
    ReadingPlanStore.put(bibleYear(at('2026-11-10'), { id: 'a' }));
    expect(ReadingPlanStore.holds('genesis', 1)).toBe(true);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-11-10'))).toBe(true);
    expect(ReadingPlanStore.noteRead('genesis', 1, at('2026-11-10'))).toBe(true);   // already ticked: still a plan item
    expect(ReadingPlanStore.noteRead('nowhere', 1, at('2026-11-10'))).toBe(false);
  });
});
