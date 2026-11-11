/* plan-nav (plans2): the Reading plans view stack. An entry from outside opens the list; a session or a note that
   leaves a plan page comes Back to that page (keepPlanNav), and a caller can open a plan page directly. */
import { describe, it, expect, beforeEach } from 'vitest';
import { planNavStack, planNavTop, openPlanNav, keepPlanNav, planNavMounted, pushPlanView, replacePlanView, popPlanView, planNavToList, _resetPlanNavForTests } from './plan-nav.js';

beforeEach(() => _resetPlanNavForTests());

describe('plan-nav', () => {
  it('push, replace and pop; Back at the list says so (the screen then leaves)', () => {
    pushPlanView({ v: 'preview', plan: 'psalms' });
    replacePlanView({ v: 'plan', id: 'r1' });
    expect(planNavStack().map((x) => x.v)).toEqual(['list', 'plan']);
    expect(popPlanView()).toBe(true);
    expect(popPlanView()).toBe(false);
    expect(planNavTop()).toEqual({ v: 'list' });
  });

  it('a mount from outside starts at the list', () => {
    pushPlanView({ v: 'plan', id: 'r1' });
    planNavMounted();
    expect(planNavStack()).toEqual([{ v: 'list' }]);
  });

  it('a session started from a plan page comes back to that page (kept once)', () => {
    pushPlanView({ v: 'plan', id: 'r1' });
    keepPlanNav();
    planNavMounted();
    expect(planNavTop()).toEqual({ v: 'plan', id: 'r1' });
    planNavMounted();                      // the next entry from outside is the list again
    expect(planNavStack()).toEqual([{ v: 'list' }]);
  });

  it('the Read tab row and the reminder open a plan page directly; Find the next plan goes to the list', () => {
    openPlanNav([{ v: 'list' }, { v: 'plan', id: 'r2' }]);
    planNavMounted();
    expect(planNavTop()).toEqual({ v: 'plan', id: 'r2' });
    planNavToList();
    expect(planNavStack()).toEqual([{ v: 'list' }]);
  });
});
