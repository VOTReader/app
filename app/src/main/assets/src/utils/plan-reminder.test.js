/* plan-reminder (rp-s1): the runs turned into the list PlanReminder.kt keeps, and the guarded bridge around it. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newRun, tickItem, pauseRun, resumeRun } from '../data/plan-engine.js';
import {
  supported, isReminderTime, lastActive, doneToday, reminderPayload, syncPlanReminders, reminderStatus,
  askForReminders, openReminderSettings, onReminderOpen, _resetForTests,
} from './plan-reminder.js';

const at = (s, h = 9) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, h, 0); };
const items = (n) => Array.from({ length: n }, (_, i) => ({ k: 'gen:' + (i + 1), w: 500 }));
// Three chapters over three days, started Friday 2026-10-23, reminder at 07:30.
const run3 = (extra = {}) => ({
  ...newRun({ id: 'r1', plan: 'custom', name: 'Genesis', tracks: [{ kind: 'bible', by: 'count', items: items(3) }], pace: { mode: 'days', n: 3 } }, at('2026-10-23')),
  remind: '07:30', ...extra,
});

function fakeBridge(answer = '{"ok":true,"allowed":true,"next":5,"quiet":[]}') {
  const calls = { set: /** @type {string[]} */ ([]), status: 0, ask: 0, settings: 0, opened: /** @type {string[]} */ ([]) };
  let pending = '';
  return {
    calls,
    tap(id) { pending = id; },
    planReminderSet(json) { calls.set.push(json); return answer; },
    planReminderStatus() { calls.status++; return '{"ok":true,"allowed":false,"next":0,"quiet":["old"]}'; },
    planReminderAsk() { calls.ask++; },
    planReminderSettings() { calls.settings++; },
    planReminderOpened() { const p = pending; pending = ''; calls.opened.push(p); return p; },
  };
}

beforeEach(() => { _resetForTests(); });
afterEach(() => { delete window.AndroidBridge; delete window.__votPlanReminderOpen; delete window.__votNotificationsResult; });

describe('isReminderTime', () => {
  it('takes 24 h HH:MM only', () => {
    for (const ok of ['07:30', '7:30', '00:00', '23:59']) expect(isReminderTime(ok)).toBe(true);
    for (const bad of ['24:00', '7:60', '', '7', null, 730, '07:30:00']) expect(isReminderTime(bad)).toBe(false);
  });
});

describe('lastActive', () => {
  it('is the latest of the start, a tick, a resume and a saved change', () => {
    const r = run3({ updated: undefined });
    expect(lastActive(r)).toBe('2026-10-23');
    const ticked = { ...tickItem(r, 'gen:1', '2026-10-25', undefined), updated: undefined };
    expect(lastActive(ticked)).toBe('2026-10-25');
    const resumed = { ...resumeRun(pauseRun(r, at('2026-10-24')), at('2026-10-28')), updated: undefined };
    expect(lastActive(resumed)).toBe('2026-10-28');
    expect(lastActive({ ...r, updated: at('2026-10-30').getTime() })).toBe('2026-10-30');
    expect(lastActive(/** @type {any} */ ({ ticks: {}, start: 'bad' }))).toBe('');
  });
});

describe('doneToday', () => {
  it('is true once a day was finished today, reading ahead included', () => {
    const r = run3();
    expect(doneToday(r, at('2026-10-23'))).toBe(false);
    const one = tickItem(r, 'gen:1', '2026-10-23', 0);
    expect(doneToday(one, at('2026-10-23'))).toBe(true);
    // Read ahead into tomorrow's chapter the same day: still done today.
    const ahead = tickItem(one, 'gen:2', '2026-10-23', 0);
    expect(doneToday(ahead, at('2026-10-23'))).toBe(true);
    // Yesterday's reading does not count for today.
    expect(doneToday(one, at('2026-10-24'))).toBe(false);
    // Two chapters a day: today's two read and one of tomorrow's begun (the engine's doneToday turns false here).
    const two = { ...newRun({ id: 'r2', plan: 'custom', tracks: [{ kind: 'bible', by: 'count', items: items(4) }], pace: { mode: 'days', n: 2 } }, at('2026-10-23')), remind: '07:30' };
    let begun = two;
    for (const k of ['gen:1', 'gen:2', 'gen:3']) begun = tickItem(begun, k, '2026-10-23', 0);
    expect(doneToday(begun, at('2026-10-23'))).toBe(true);
    expect(doneToday(tickItem(two, 'gen:1', '2026-10-23', 0), at('2026-10-23'))).toBe(false);
  });
});

describe('reminderPayload', () => {
  it('lists running plans with a reminder on, with their weekdays, last touch and today done', () => {
    const now = at('2026-10-23');
    const runs = [
      run3(),
      run3({ id: 'off', remind: undefined }),
      run3({ id: 'bad', remind: '25:00' }),
      { ...pauseRun(run3({ id: 'paused' }), now) },
      run3({ id: 'fin', status: 'finished' }),
      tickItem(run3({ id: 'done' }), 'gen:1', '2026-10-23', now.getTime()),
      null,
    ];
    const out = reminderPayload(/** @type {any} */ (runs), now, (r) => (r.id === 'r1' ? 'Genesis in three days' : ''));
    expect(out.plans.map((p) => p.id)).toEqual(['r1', 'done']);
    expect(out.plans[0]).toEqual({ id: 'r1', name: 'Genesis in three days', time: '07:30', active: '2026-10-23', weekdays: [true, true, true, true, true, true, true] });
    expect(out.plans[1].done).toBe('2026-10-23');
    expect(out.plans[1].name).toBe('Genesis');
    expect(reminderPayload(/** @type {any} */ (null), now).plans).toEqual([]);
  });
});

describe('the bridge', () => {
  it('is a quiet no-op on the web', () => {
    expect(supported()).toBe(false);
    expect(syncPlanReminders([run3()])).toBe(null);
    expect(reminderStatus()).toBe(null);
    let answer = /** @type {boolean | null} */ (null);
    askForReminders((a) => { answer = a; });
    expect(answer).toBe(false);
    openReminderSettings();
    const off = onReminderOpen(() => { throw new Error('no'); });
    off();
  });

  it('sends the list, once while it is unchanged, and reads the status', () => {
    const b = fakeBridge();
    window.AndroidBridge = b;
    expect(supported()).toBe(true);
    const st = syncPlanReminders([run3()], { now: at('2026-10-23') });
    expect(st).toEqual({ ok: true, allowed: true, next: 5, quiet: [] });
    expect(JSON.parse(b.calls.set[0]).plans[0].id).toBe('r1');
    syncPlanReminders([run3()], { now: at('2026-10-23') });
    expect(b.calls.set.length).toBe(1);
    expect(b.calls.status).toBe(1);
    syncPlanReminders([run3()], { now: at('2026-10-23'), force: true });
    expect(b.calls.set.length).toBe(2);
    // A new day re-sends nothing new unless the list changed; a tick today does change it.
    syncPlanReminders([tickItem(run3(), 'gen:1', '2026-10-23', 0)], { now: at('2026-10-23') });
    expect(b.calls.set.length).toBe(3);
    expect(reminderStatus()).toEqual({ ok: true, allowed: false, next: 0, quiet: ['old'] });
  });

  it('sends again after a refusal, and a throwing or garbled bridge reads as null', () => {
    const refused = fakeBridge('{"ok":false,"allowed":true,"next":0,"quiet":[]}');
    syncPlanReminders([run3()], { bridge: refused });
    syncPlanReminders([run3()], { bridge: refused });
    expect(refused.calls.set.length).toBe(2);
    expect(syncPlanReminders([run3()], { bridge: { planReminderSet: () => { throw new Error('x'); } } })).toBe(null);
    expect(syncPlanReminders([run3()], { bridge: { planReminderSet: () => 'nope' } })).toBe(null);
    expect(reminderStatus({ planReminderSet() {}, planReminderStatus: () => { throw new Error('x'); } })).toBe(null);
  });

  it('asks for notifications and hands the answer back once, keeping the other listener', () => {
    const b = fakeBridge();
    const seen = [];
    window.__votNotificationsResult = (g) => seen.push('other:' + g);
    const answers = [];
    askForReminders((a) => answers.push(a), b);
    expect(b.calls.ask).toBe(1);
    window.__votNotificationsResult(true);
    expect(answers).toEqual([true]);
    expect(seen).toEqual(['other:true']);
    window.__votNotificationsResult(false);   // the restored listener only
    expect(answers).toEqual([true]);
    openReminderSettings(b);
    expect(b.calls.settings).toBe(1);
  });

  it('opens the tapped plan on a cold start, and on a tap while the page runs, once each', () => {
    const b = fakeBridge();
    b.tap('r1');
    const opened = [];
    const off = onReminderOpen((id) => opened.push(id), b);
    expect(opened).toEqual(['r1']);
    b.tap('r2');
    window.__votPlanReminderOpen('r2');
    expect(opened).toEqual(['r1', 'r2']);
    // Taken, so a later boot does not reopen it.
    expect(b.planReminderOpened()).toBe('');
    off();
    expect(window.__votPlanReminderOpen).toBeUndefined();
  });
});
