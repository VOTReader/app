// @ts-nocheck — free-var globals stubbed per test
/* unasked — the one gate for what the app says without being asked (newcomer, 2026-11-27). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mayShow, claim, note, want, canShow, markFirstRunSession, spokeThisSession, finishedReadings, readOnEarlierDay, tipDue, WAIT_ORDER, ANSWERS, _resetUnasked } from './unasked.js';

const ALL = [...WAIT_ORDER, ...ANSWERS];
let readItems = {};
beforeEach(() => {
  _resetUnasked();
  readItems = { a: 1 };
  globalThis.StateStore = { get: () => ({ readItems }) };
});
afterEach(() => { delete globalThis.StateStore; delete globalThis.HistoryStore; _resetUnasked(); });

describe('mayShow: the rule', () => {
  const base = { spoke: null, firstRun: false, pause: true, finished: 1, wanting: [] };
  it('one a session: whatever spoke keeps it, nothing else is held to the pause rule after it', () => {
    for (const k of WAIT_ORDER) {
      expect(mayShow(k, { ...base, spoke: k })).toBe(true);
      for (const other of ALL.filter((x) => x !== k)) expect(mayShow(k, { ...base, spoke: other })).toBe(false);
    }
  });
  it('only at a pause, never in the session the welcome ran in, never before a finished reading', () => {
    for (const k of WAIT_ORDER) {
      expect(mayShow(k, base)).toBe(true);
      expect(mayShow(k, { ...base, pause: false })).toBe(false);
      expect(mayShow(k, { ...base, firstRun: true })).toBe(false);
      expect(mayShow(k, { ...base, finished: 0 })).toBe(false);
    }
  });
  it('an earlier one that is due goes first: the tip waits for install, the plan for both', () => {
    expect(mayShow('tip', { ...base, wanting: ['install'] })).toBe(false);
    expect(mayShow('plan', { ...base, wanting: ['tip'] })).toBe(false);
    expect(mayShow('plan', { ...base, wanting: ['install'] })).toBe(false);
    expect(mayShow('install', { ...base, wanting: ['tip', 'plan'] })).toBe(true);
  });
  it('the answering ones (Safari\'s first save, What\'s new) are never held back', () => {
    for (const k of ANSWERS) expect(mayShow(k, { ...base, spoke: 'install', firstRun: true, pause: false, finished: 0 })).toBe(true);
  });
  it('a surface nobody listed does not speak', () => {
    expect(mayShow('tour', base)).toBe(false);
  });
});

describe('claim: two can never show in one session', () => {
  /* Every order in which the surfaces could ask, at a pause with a reading finished: the first to claim is the
     only one that shows, and each answering one that shows after it shows alone of the held ones. */
  const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  it('in every order of asking, at most one held surface shows', () => {
    for (const order of perms([...WAIT_ORDER])) {
      _resetUnasked();
      const shown = order.filter((k) => claim(k, { pause: true }));
      expect(shown, order.join(' > ')).toEqual([order[0]]);
    }
  });
  it('after an answering surface showed, no held one shows', () => {
    for (const a of ANSWERS) {
      _resetUnasked();
      note(a);
      for (const k of WAIT_ORDER) expect(claim(k, { pause: true })).toBe(false);
      expect(spokeThisSession()).toBe(a);
    }
  });
  it('a held one that spoke first keeps the session; an answering one after it does not take it', () => {
    claim('plan', { pause: true });
    note('whats-new');
    expect(spokeThisSession()).toBe('plan');
  });
  it('a due install holds the plan back until it shows or stops being due', () => {
    want('install', true);
    expect(claim('plan', { pause: true })).toBe(false);
    want('install', false);
    expect(claim('plan', { pause: true })).toBe(true);
  });
  it('the welcome\'s session: nothing', () => {
    markFirstRunSession();
    for (const k of WAIT_ORDER) expect(claim(k, { pause: true })).toBe(false);
  });
  it('no read marks: nothing', () => {
    readItems = {};
    for (const k of WAIT_ORDER) expect(canShow(k, { pause: true })).toBe(false);
  });
});

describe('what it reads (nothing is counted or stored)', () => {
  it('finished readings are the read marks', () => {
    readItems = { a: 1, b: 2, c: 1 };
    expect(finishedReadings()).toBe(3);
    delete globalThis.StateStore;
    expect(finishedReadings()).toBe(0);
  });
  it('an earlier day is a history entry dated before today', () => {
    const now = new Date(2026, 10, 27, 9, 0).getTime();
    globalThis.HistoryStore = { list: () => [{ ts: new Date(2026, 10, 27, 0, 5).getTime() }] };
    expect(readOnEarlierDay(now)).toBe(false);
    globalThis.HistoryStore = { list: () => [{ ts: new Date(2026, 10, 27, 0, 5).getTime() }, { ts: new Date(2026, 10, 26, 23, 50).getTime() }] };
    expect(readOnEarlierDay(now)).toBe(true);
    delete globalThis.HistoryStore;
    expect(readOnEarlierDay(now)).toBe(false);
  });
  it('the tip is due only for a reader who never took the tour and has saved nothing', () => {
    const flag = (v) => ({ is: () => v });
    const stores = (n) => { globalThis.AnnotationStore = { all: () => (n ? { x: 1 } : {}) }; globalThis.NoteStore = { count: () => 0 }; globalThis.BookmarkStore = { count: () => 0 }; };
    try {
      globalThis.TourDoneFlagStore = flag(false); globalThis.AnnHintDismissedFlagStore = flag(false); stores(0);
      expect(tipDue()).toBe(true);
      stores(1); expect(tipDue()).toBe(false); stores(0);
      globalThis.TourDoneFlagStore = flag(true); expect(tipDue()).toBe(false); globalThis.TourDoneFlagStore = flag(false);
      globalThis.AnnHintDismissedFlagStore = flag(true); expect(tipDue()).toBe(false);
    } finally {
      ['TourDoneFlagStore', 'AnnHintDismissedFlagStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore'].forEach((k) => { delete globalThis[k]; });
    }
  });
});
