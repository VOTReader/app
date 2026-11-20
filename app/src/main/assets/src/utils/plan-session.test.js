/* plan-session (FIXB): a session is one sitting; leaving the day's items by any way but its own buttons ends it. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { startCatalogPlan } from '../data/plan-catalog.js';
import { beginPlanSession, planSession, notePlanSessionPlace, sessionKeyOf, _resetPlanSessionForTests,
  pausedPlanSession, resumePlanSession, endPlanSession, sessionNeighbours, sessionOpenKey, sessionReachedEnd, setPlanSessionHost,
  PLAN_SESSION_KEY } from './plan-session.js';
import { tickItem, todayKey } from '../data/plan-engine.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  /** @type {any} */ (globalThis).ReadingPlanStore = ReadingPlanStore;
  _resetPlanSessionForTests();
});
afterEach(() => { _resetPlanSessionForTests(); delete (/** @type {any} */ (globalThis)).ReadingPlanStore; vi.useRealTimers(); });

const start = () => {
  const run = startCatalogPlan('bible-year', null, new Date());
  ReadingPlanStore.put(run);
  beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' });
  return run;
};

describe('plan-session: where the screen is', () => {
  it('the screen it starts from does not end it; the day items and Next keep it', () => {
    start();
    notePlanSessionPlace(null);                       // still the plan page, before the first item opens
    vi.runAllTimers();
    expect(planSession()).not.toBeNull();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace('genesis', 2);               // Next
    vi.runAllTimers();
    expect(planSession()).not.toBeNull();
  });

  it('leaving by Back, the tab bar or another tab ends it, so a later read of a day item is not a session', () => {
    start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace(null);                       // Home, Library, another tab's screen
    vi.runAllTimers();
    expect(planSession()).toBeNull();
    expect(sessionKeyOf('genesis', 2)).toBeNull();    // no strip, no tick by reaching its end
  });

  it('another chapter in the reader ends it too', () => {
    start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace('exodus', 40);
    vi.runAllTimers();
    expect(planSession()).toBeNull();
  });
});

/* Corbin 11-19: reading plans become a container, "sort of like holy days album", kept "compartmentalized and clearly
   deliniated". While a day's reading is open the reader is inside the plan until it chooses to leave. */
describe('plan-session: the plan as a container', () => {
  it("swipe keeps the plan: a reading's neighbours are the day's readings, and there are none past either end", () => {
    start();
    expect(sessionNeighbours('genesis:1')).toEqual({ prev: null, next: 'genesis:2' });
    expect(sessionNeighbours('genesis:2')).toEqual({ prev: 'genesis:1', next: 'genesis:3' });
    expect(sessionNeighbours('genesis:3')).toEqual({ prev: 'genesis:2', next: null });   // never Genesis 4 (tomorrow)
  });

  it('a swipe inside the day never ends the sitting', () => {
    start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace('genesis', 2);
    notePlanSessionPlace('genesis', 1);
    vi.runAllTimers();
    expect(planSession()).not.toBeNull();
  });

  it('leaving another way (a link, search, a tab) pauses the sitting: no strip, but it comes back with what it wrote', () => {
    const run = start();
    const host = { markRead: vi.fn((b, c) => ReadingPlanStore.noteRead(b, c)), unmarkRead: vi.fn(), isRead: () => false,
      move: vi.fn(), open: vi.fn(), back: vi.fn(), openPlans: vi.fn(), openNote: vi.fn() };
    setPlanSessionHost(host);
    notePlanSessionPlace('genesis', 1);
    sessionReachedEnd('genesis:1');
    notePlanSessionPlace('nt', 5);                    // a link in the text to a letter
    vi.runAllTimers();
    expect(planSession()).toBeNull();
    expect(sessionKeyOf('genesis', 2)).toBeNull();
    const p = pausedPlanSession();
    expect(p && p.runId).toBe(run.id);
    expect(p && p.wrote).toEqual(['genesis:1']);
    const s = resumePlanSession();
    expect(s && s.wrote).toEqual(['genesis:1']);
    expect(planSession()).toBe(s);
    expect(pausedPlanSession()).toBeNull();
  });

  it('starting the same day again picks the paused sitting up rather than a new one', () => {
    start();
    const run = ReadingPlanStore.all()[0];
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    const before = pausedPlanSession();
    const s = beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' });
    expect(s && s.undone).toEqual(before && before.undone);
    expect(pausedPlanSession()).toBeNull();
  });

  it("a paused sitting survives an app restart, in its own key; the plan's own record is not touched", () => {
    const run = start();
    const plans = localStorage.getItem('vot-reading-plans');
    notePlanSessionPlace('genesis', 2);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    expect(localStorage.getItem('vot-reading-plans')).toBe(plans);
    expect(JSON.parse(localStorage.getItem(PLAN_SESSION_KEY) || 'null')).toMatchObject({ runId: run.id, day: 0, at: 'genesis:2' });
    _resetPlanSessionForTests({ keepStorage: true });            // the app restarts
    const p = pausedPlanSession();
    expect(p && p.runId).toBe(run.id);
    expect(p && p.keys).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
  });

  it('a restart that reopens a reading of the paused day is back inside the plan', () => {
    start();
    notePlanSessionPlace('genesis', 2);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    _resetPlanSessionForTests({ keepStorage: true });
    notePlanSessionPlace('genesis', 2);                          // the app comes back on Genesis 2
    expect(planSession()).not.toBeNull();
    expect(sessionKeyOf('genesis', 2)).toBe('genesis:2');
  });

  it("after the first screen a later read of a paused day's reading on its own stays outside (FIXB)", () => {
    start();
    notePlanSessionPlace('genesis', 2);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    notePlanSessionPlace('genesis', 3);
    expect(planSession()).toBeNull();
    expect(sessionKeyOf('genesis', 3)).toBeNull();
  });

  it('Stop for now forgets the sitting, paused or not', () => {
    start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    endPlanSession();
    expect(pausedPlanSession()).toBeNull();
    expect(localStorage.getItem(PLAN_SESSION_KEY)).toBeNull();
  });

  it('a sitting paused on another day is not offered again', () => {
    start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace(null);
    vi.runAllTimers();
    const saved = JSON.parse(localStorage.getItem(PLAN_SESSION_KEY) || '{}');
    localStorage.setItem(PLAN_SESSION_KEY, JSON.stringify({ ...saved, on: '2000-01-01' }));
    _resetPlanSessionForTests({ keepStorage: true });
    expect(pausedPlanSession()).toBeNull();
  });

  it('most-read is not read: a reading left before its end stays unticked, and coming back opens it first', () => {
    const run = start();
    notePlanSessionPlace('genesis', 1);
    notePlanSessionPlace('genesis', 2);                          // swiped on before the end of Genesis 1
    expect('genesis:1' in (ReadingPlanStore.get(run.id).ticks || {})).toBe(false);
    expect(sessionOpenKey()).toBe('genesis:1');
    ReadingPlanStore.put(tickItem(ReadingPlanStore.get(run.id), 'genesis:1', todayKey(new Date()), 1));
    expect(sessionOpenKey()).toBe('genesis:2');
    expect(sessionOpenKey('genesis:3')).toBe('genesis:3');       // a reading asked for by name opens itself
  });
});
