/* plan-session (FIXB): a session is one sitting; leaving the day's items by any way but its own buttons ends it. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadingPlanStore } from '../stores/reading-plan-store.js';
import { startCatalogPlan } from '../data/plan-catalog.js';
import { beginPlanSession, planSession, notePlanSessionPlace, sessionKeyOf, _resetPlanSessionForTests } from './plan-session.js';

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
