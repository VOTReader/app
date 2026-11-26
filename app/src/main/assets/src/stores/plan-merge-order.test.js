/* Merge order (review 11-26): merging tab A's copy of a pinned plan into tab B's, or B's into A's, gives the same
   calendar. mergePlanStore(base, ours, theirs) with ours and theirs swapped, and a restore's mergeForRestore (live,
   snapshot) both ways, keep the same record, so runStatus, monthCells and streak agree on every past day. Which copy is
   "newer" is decided by the stamps, never by the argument position, so each case runs with either copy the newer one.
   Cases: reading-plan-store.test.js (g), (h), (i), the reviewer's Ruth (refute 0e2c8009f), and the Jude days off. */

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { mergePlanStore } from './store-merge.js';
import { mergeForRestore } from '../utils/data-safety.js';
import { newRun, runStatus, monthCells, streak, tickItem, untickItem, catchUp, markDay, markOn, changePace, changeWeekdays, dayNum, dateOf } from '../data/plan-engine.js';

const at = (/** @type {string} */ s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const HOUR = 3600000;
const one = (/** @type {any[]} */ out, /** @type {string} */ id) => out.find((x) => x.id === id);

/** What the reader sees of the run on every day from Dec 1 to `to`, as of that day. @param {any} r @param {string} to */
function calendar(r, to) {
  const days = [];
  for (let n = dayNum('2026-12-01'); n <= /** @type {number} */ (dayNum(to)); n++) {
    const now = at(dateOf(n));
    days.push({ date: dateOf(n), status: runStatus(r, now), cells: monthCells(r, 2026, 11, now), streak: streak(r, now) });
  }
  return days;
}

/** `x` stamped an hour after `y`, unless it already is. @param {any} x @param {any} y */
const newerThan = (x, y) => (x.updated > y.updated ? x : { ...x, updated: y.updated + HOUR });

const ruthItems = [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 }));
const ruth = (/** @type {string} */ id, /** @type {number} */ n) => newRun({ id, plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: ruthItems }], pace: { mode: 'days', n } }, at('2026-12-01'));
const jude = () => {
  let r = newRun({ id: 'p-jude', plan: 'custom', weekdays: [false, false, true, true, true, true, true], tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3].map((c) => ({ k: 'jude:' + c, w: 500 })) }], pace: { mode: 'days', n: 9 } }, at('2026-12-01'));
  return changePace(tickItem(r, 'jude:1', '2026-12-02', 1), { mode: 'by', date: '2026-12-20' }, at('2026-12-04'));
};

/** @type {{ name: string, base: any, a: any, b: any, to: string }[]} */
const cases = [];
{
  // (g): the second tab (no pins) takes a read back or dates one back; this tab caught up on Dec 10.
  const before = tickItem(ruth('p-g', 20), 'ruth:1', '2026-12-03', at('2026-12-03').getTime());
  const r = catchUp(before, at('2026-12-10'));
  cases.push({ name: '(g) untick', base: before, a: r, b: untickItem(before, 'ruth:1', at('2026-12-11')), to: '2026-12-12' });
  cases.push({ name: '(g) Not read yet', base: before, a: r, b: markDay(before, 2, false, at('2026-12-11')), to: '2026-12-12' });
  cases.push({ name: '(g) I read it on Dec 5', base: before, a: r, b: markOn(before, '2026-12-05', at('2026-12-11')), to: '2026-12-12' });
  cases.push({ name: '(g) a plain read today', base: before, a: r, b: tickItem(before, 'ruth:2', '2026-12-11', at('2026-12-11').getTime()), to: '2026-12-12' });
}
{
  // (h): this copy took the Dec 4 read back before it pinned; the other still holds it.
  let base = tickItem(ruth('p-h', 10), 'ruth:1', '2026-12-03', at('2026-12-03').getTime());
  base = tickItem(base, 'ruth:2', '2026-12-04', at('2026-12-04').getTime());
  const mine = catchUp(untickItem(base, 'ruth:2', at('2026-12-05')), at('2026-12-08'));
  cases.push({ name: '(h)', base, a: mine, b: { ...base, notes: { 1: 'a note' }, updated: mine.updated }, to: '2026-12-09' });
}
{
  // (i) and the Jude days off: Tue-Sat, Jude 1 read Dec 2, Finish by Dec 20 set Dec 4, every day from Dec 10.
  const base = jude();
  const pinned = changeWeekdays(base, [true, true, true, true, true, true, true], at('2026-12-10'));
  expect(pinned.rested.off).toEqual([['2026-12-06', '2026-12-07']]);
  cases.push({ name: '(i) Jude: the other tab unticks Jude 1', base, a: pinned, b: untickItem(base, 'jude:1', at('2026-12-11')), to: '2026-12-12' });
  cases.push({ name: 'Jude: the other tab says I read it on Dec 3', base, a: pinned, b: markOn(base, '2026-12-03', at('2026-12-11')), to: '2026-12-12' });
  cases.push({ name: 'Jude: the pinned tab unticks Jude 1, the other adds a note', base, a: untickItem(pinned, 'jude:1', at('2026-12-11')), b: { ...base, notes: { 1: 'a note' }, updated: at('2026-12-11').getTime() }, to: '2026-12-12' });
}
{
  // The reviewer's Ruth: 20 days, caught up Dec 17; tab A unmarks Dec 13's read on Dec 21; tab B edits its old copy.
  let run = ruth('p-m', 20);
  run = tickItem(run, 'ruth:1', '2026-12-03', 1); run = tickItem(run, 'ruth:2', '2026-12-08', 1); run = tickItem(run, 'ruth:3', '2026-12-13', 1);
  const base = catchUp(run, at('2026-12-17'));
  cases.push({ name: 'reviewer Ruth', base, a: untickItem(base, 'ruth:3', at('2026-12-21')), b: { ...base, notes: { 3: 'a note' }, updated: at('2026-12-21').getTime() }, to: '2026-12-22' });
}

describe('merge order: A into B and B into A give the same plan and calendar (review 11-26)', () => {
  for (const c of cases) {
    for (const [label, a, b] of [['A newer', newerThan(c.a, c.b), c.b], ['B newer', c.a, newerThan(c.b, c.a)]]) {
      it(c.name + ', ' + label + ': mergePlanStore and mergeForRestore, either way round', () => {
        expect(a.updated).not.toBe(b.updated);
        const id = c.base.id;
        const ab = one(mergePlanStore([c.base], [a], [b]), id), ba = one(mergePlanStore([c.base], [b], [a]), id);
        expect(ba).toEqual(ab);
        expect(calendar(ba, c.to)).toEqual(calendar(ab, c.to));
        const ra = one(mergeForRestore('vot-reading-plans', [a], [b]), id), rb = one(mergeForRestore('vot-reading-plans', [b], [a]), id);
        expect(rb).toEqual(ra);
        expect(calendar(rb, c.to)).toEqual(calendar(ra, c.to));
        // The copy the merge keeps is the newer one, whichever side it came in on.
        const newer = a.updated > b.updated ? a : b;
        expect(ab.updated).toBe(newer.updated);
        expect(ra.updated).toBe(newer.updated);
      });
    }
  }
});

describe('merge order: a read both copies hold, dated apart, takes no date from the argument position (review 11-26)', () => {
  // Ruth over 20 days, read Dec 3, caught up Dec 10 (pins up to Dec 10). Before the fix the date of a chapter both copies
  // held was always ours', so which tab saved second picked it: the calendar and the pins' cut changed with the order.
  const base = catchUp(tickItem(ruth('p-d', 20), 'ruth:1', '2026-12-03', at('2026-12-03').getTime()), at('2026-12-10'));
  const both = (/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ bs) => {
    const ab = one(mergePlanStore(bs, [a], [b]), base.id), ba = one(mergePlanStore(bs, [b], [a]), base.id);
    expect(ba).toEqual(ab);
    expect(calendar(ba, '2026-12-12')).toEqual(calendar(ab, '2026-12-12'));
    return ab;
  };

  it('one tab took Dec 3\'s read back and read it again Dec 11, the other only added a note: the new date, either order, either newer', () => {
    const reread = tickItem(untickItem(base, 'ruth:1', at('2026-12-11')), 'ruth:1', '2026-12-11', at('2026-12-11').getTime() + 1000);
    const noted = { ...base, notes: { 1: 'a note' }, updated: at('2026-12-11').getTime() };
    for (const [a, b] of [[newerThan(reread, noted), noted], [reread, newerThan(noted, reread)]]) {
      const m = both(a, b, [base]);
      expect(m.ticks).toEqual({ 'ruth:1': '2026-12-11' });
      expect(m.rested).toEqual(reread.rested);      // cut from Dec 3, as the untick cut the copy that made it
    }
  });

  it('both tabs marked Ruth 2, one by a read on Dec 11, one by "I read it on Dec 5": the newer copy\'s date, either order', () => {
    const read = tickItem(base, 'ruth:2', '2026-12-11', at('2026-12-11').getTime());
    const told = markOn(base, '2026-12-05', at('2026-12-11'));
    for (const [newer, older] of [[newerThan(read, told), told], [newerThan(told, read), read]]) {
      for (const bs of [[base], null]) expect(both(newer, older, bs).ticks['ruth:2']).toBe(newer.ticks['ruth:2']);
    }
  });
});

describe('C4: a read one copy took back and the other read again on a new day is kept, in either order (review 11-26)', () => {
  // The header says a chapter un-marked in one tab stays un-marked "unless the other tab changed it too"; the merge
  // dropped it whenever one copy lacked it, so the other tab's new read was lost (in both orders). Losing a read is the
  // worse error: the new read stays, and the pins are cut from the earliest date that differs, as on the copy that
  // made the read.
  const before = tickItem(ruth('p-c4', 20), 'ruth:1', '2026-12-03', at('2026-12-03').getTime());
  const pinned = catchUp(before, at('2026-12-10'));
  const variants = [
    // Both tabs had the pins (caught up Dec 10); A takes Ruth 1 back on Dec 11, B takes it back and reads it again Dec 12.
    { name: 'both pinned', base: pinned, a: untickItem(pinned, 'ruth:1', at('2026-12-11')),
      b: tickItem(untickItem(pinned, 'ruth:1', at('2026-12-11')), 'ruth:1', '2026-12-12', at('2026-12-12').getTime()) },
    // Only A caught up (and then took Ruth 1 back); B, from before the pins, took it back and read it again Dec 12.
    { name: 'only the untick copy pinned', base: before, a: untickItem(pinned, 'ruth:1', at('2026-12-11')),
      b: tickItem(untickItem(before, 'ruth:1', at('2026-12-11')), 'ruth:1', '2026-12-12', at('2026-12-12').getTime()) },
  ];
  for (const v of variants) {
    for (const [label, a, b] of [['A newer', newerThan(v.a, v.b), v.b], ['B newer', v.a, newerThan(v.b, v.a)]]) {
      it(v.name + ', ' + label, () => {
        const ab = one(mergePlanStore([v.base], [a], [b]), v.base.id), ba = one(mergePlanStore([v.base], [b], [a]), v.base.id);
        expect(ba).toEqual(ab);
        expect(calendar(ba, '2026-12-13')).toEqual(calendar(ab, '2026-12-13'));
        expect(ab.ticks).toEqual({ 'ruth:1': '2026-12-12' });
        // The pins as the untick cut them (from Dec 3): the read of Dec 12 is after they end, so it cuts nothing more.
        expect(ab.rested).toEqual(v.a.rested);
        expect(ab.rested.until).toBe('2026-12-03');
      });
    }
  }

  it('the Jude days off: Jude 1 taken back on the pinned copy, read again Dec 12 on the copy from before the change of days', () => {
    const base = jude();
    const pinnedJ = changeWeekdays(base, [true, true, true, true, true, true, true], at('2026-12-10'));
    const a = untickItem(pinnedJ, 'jude:1', at('2026-12-11'));
    const b = tickItem(untickItem(base, 'jude:1', at('2026-12-11')), 'jude:1', '2026-12-12', at('2026-12-12').getTime());
    for (const [x, y] of [[newerThan(a, b), b], [a, newerThan(b, a)]]) {
      const ab = one(mergePlanStore([base], [x], [y]), base.id), ba = one(mergePlanStore([base], [y], [x]), base.id);
      expect(ba).toEqual(ab);
      expect(ab.ticks).toEqual({ 'jude:1': '2026-12-12' });
      // The newer copy's rested: the pinned copy's (days off kept) when it is the newer; else the older plan's, whose
      // Tue-Sat days (the record is the newer copy's) make Dec 6 and 7 days off on their own.
      const newer = x.updated > y.updated ? x : y;
      expect(ab.rested).toEqual(newer.rested);
      if (newer === x) expect(ab.rested.off).toEqual([['2026-12-06', '2026-12-07']]);
      expect(monthCells(ab, 2026, 11, at('2026-12-13')).filter((c) => c.date === 6 || c.date === 7).map((c) => c.state)).toEqual(['none', 'none']);
    }
  });

  it('a chapter one copy took back while the other left it as it was stays taken back (C4 unchanged)', () => {
    const a = untickItem(pinned, 'ruth:1', at('2026-12-11'));
    const b = { ...pinned, notes: { 1: 'a note' }, updated: at('2026-12-12').getTime() };
    for (const [x, y] of [[a, b], [b, a]]) expect(one(mergePlanStore([pinned], [x], [y]), pinned.id).ticks).toEqual({});
  });
});
