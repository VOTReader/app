/* The merge's cut for a read the other copy ADDS (refute aeb5ec7dd, 3adebd04e): it cuts the pins only when that copy
   was last saved on or after the day they end, compared as the start of that local day. Instants here are local
   wall-clock times (new Date(y, m, d, h, min)), so each case means the same in every zone. Run under
   TZ=America/Denver (local date behind UTC's at 23:30), TZ=Pacific/Auckland (ahead of it at 00:30),
   TZ=America/Santiago or America/Havana (clocks change at midnight) and UTC: the same answers (refute r5, 11-26).
   Pins ending Dec 10, on the US clock changes (Nov 1 2026, Mar 14 2027) and on Havana's (Mar 8 2026). */

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { mergePlanStore } from './store-merge.js';
import { newRun, tickItem, catchUp, dayNum, dateOf } from '../data/plan-engine.js';

const local = (/** @type {string} */ s, /** @type {number} */ h, mi = 0) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h, mi); };
const shift = (/** @type {string} */ s, /** @type {number} */ n) => dateOf(/** @type {number} */ (dayNum(s)) + n);
const HOUR = 3600000;

describe('an added read cuts the pins only if the other copy saved on or after the day they end, in any zone', () => {
  for (const until of ['2026-12-10', '2026-11-01', '2027-03-14', '2026-03-08']) {
    // Ruth over 8 days from 6 days before; nothing read; this tab caught up on `until` (pins end that day).
    const base = newRun({ id: 'p', plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: [1, 2, 3, 4].map((c) => ({ k: 'ruth:' + c, w: 600 })) }], pace: { mode: 'days', n: 8 } }, local(shift(until, -6), 9));
    const pinned = catchUp(base, local(until, 9));
    const read = shift(until, -3);
    for (const [when, saved, cut] of /** @type {[string, Date, boolean][]} */ ([
      ['23:30 the day before', local(shift(until, -1), 23, 30), false],
      ['23:59 the day before', local(shift(until, -1), 23, 59), false],
      ['00:30 on the day', local(until, 0, 30), true],
      ['01:30 on the day', local(until, 1, 30), true],
    ])) {
      it(`pins to ${until}; the other copy read ${read}, last saved ${when}: ${cut ? 'cut from the read' : 'pins stay'}`, () => {
        expect(pinned.rested.until).toBe(until);
        const other = tickItem(base, 'ruth:1', read, saved.getTime());
        const mine = { ...pinned, updated: Math.max(pinned.updated, other.updated) + HOUR };
        for (const out of [mergePlanStore([base], [mine], [other]), mergePlanStore([base], [other], [mine])]) {
          expect(out[0].ticks).toEqual({ 'ruth:1': read });
          expect(out[0].rested.until).toBe(cut ? read : until);
        }
      });
    }
  }
});
