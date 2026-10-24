// @ts-nocheck - ScreenLayout / LibraryNav are free globals, as the other personal-study screens
/* ReadingPlansScreen: start, follow and stop a plan. rp1's look (lanes/myweb/out/mockups/rp1/r2-plans.png);
   since mw18 the plans are runs in ReadingPlanStore with the flexible engine. */
import 'fake-indexeddb/auto';   // the runs are really saved: the rp1 move waits for that save
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within, act, waitFor } from '@testing-library/react';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { tickItem, todayKey } from '../../data/plan-engine.js';
import { usePlanReminders, takePlanOpen } from '../../utils/plan-runs-view.js';
import { _resetForTests } from '../../utils/plan-reminder.js';

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12); return d; };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = ({ question, yesLabel, onConfirm, onCancel }) => (
    <div><span>{question}</span><button type="button" onClick={onConfirm}>{yesLabel || 'Yes'}</button><button type="button" onClick={onCancel}>No</button></div>
  );
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
});
afterEach(() => { cleanup(); delete globalThis.ReadingPlanStore; });

const base = (o) => ({ readingPlans: [], isRead: () => false, markAsReadEnabled: true, onPlansMoved: vi.fn(), onRead: vi.fn(), onBack: vi.fn(), ...o });
const runs = () => ReadingPlanStore.active();

describe('ReadingPlansScreen', () => {
  it('offers both plans to start, and says the plans stay on this phone', () => {
    render(<ReadingPlansScreen {...base()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reading plans');
    expect(screen.getByText('Your plans stay on this phone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Bible in a Year' }));
    expect(runs().map((r) => [r.plan, r.start])).toEqual([['bible-year', todayKey(new Date())]]);
    expect(screen.queryByRole('button', { name: 'Start Bible in a Year' })).toBeNull();
  });

  it('a running plan shows its day and month, offers no Start, and Catch me up clears behind', () => {
    let run = startCatalogPlan('bible-year', null, daysAgo(4));
    for (const it of run.tracks[0].items.slice(0, 3)) run = tickItem(run, it.k, todayKey(daysAgo(4)), 1);
    ReadingPlanStore.put(run);
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    expect(screen.queryByRole('button', { name: 'Start Bible in a Year' })).toBeNull();
    const plan = screen.getByRole('region', { name: 'Bible in a Year' });
    expect(within(plan).getByText(/^Day 2 of 365/)).toBeTruthy();       // the next unfinished day, not day 5 (days split by words: day 2 is Genesis 4-7)
    expect(plan.querySelector('.plans-day[data-state="today"]')).not.toBeNull();
    fireEvent.click(within(plan).getByRole('button', { name: 'Read today: Genesis 4-7' }));
    expect(p.onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 4 });
    expect(within(plan).getByText(/days? behind/)).toBeTruthy();
    fireEvent.click(within(plan).getByRole('button', { name: 'Catch up' }));
    expect(within(plan).getByText(/^At this pace you finish /)).toBeTruthy();
    act(() => { fireEvent.click(within(plan).getByRole('button', { name: /^Catch me up/ })); });
    expect(within(screen.getByRole('region', { name: 'Bible in a Year' })).queryByText(/days? behind/)).toBeNull();
  });

  it('stops a plan only after asking; the run is kept, stopped', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.getByRole('group', { name: /^(January|February|March|April|May|June|July|August|September|October|November|December)$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop Bible in a Year' }));
    expect(runs().length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, stop' }));   // C12: never "Delete"
    expect(runs().length).toBe(0);
    expect(ReadingPlanStore.all()[0].status).toBe('stopped');
  });

  it('moves rp1\'s settings plan into a run and clears it from settings once the run is saved', async () => {
    const p = base({ readingPlans: [{ id: 'bible-year', start: todayKey(daysAgo(1)) }], isRead: (b, c) => b === 'genesis' && c <= 3 });
    render(<ReadingPlansScreen {...p} />);
    expect(runs().map((r) => r.plan)).toEqual(['bible-year']);
    await waitFor(() => expect(p.onPlansMoved).toHaveBeenCalledWith([]));
    expect(within(screen.getByRole('region', { name: 'Bible in a Year' })).getByText(/^Day 2 of 365/)).toBeTruthy();
  });

  it('keeps rp1\'s settings plan when the run could not be saved', async () => {
    const whenSaved = ReadingPlanStore.whenSaved;
    ReadingPlanStore.whenSaved = () => Promise.resolve(false);
    try {
      const p = base({ readingPlans: [{ id: 'bible-year', start: todayKey(daysAgo(1)) }] });
      render(<ReadingPlansScreen {...p} />);
      await act(async () => { await Promise.resolve(); });
      expect(runs().length).toBe(1);
      expect(p.onPlansMoved).not.toHaveBeenCalled();
    } finally { ReadingPlanStore.whenSaved = whenSaved; }
  });

  it('opens on today: the portion, Read, Listen to today’s portion, its chapters as checks, this week and honest counts (C1, C5, C10)', () => {
    let run = startCatalogPlan('bible-year', null, new Date());
    run = tickItem(run, 'genesis:1', todayKey(new Date()), 1);
    ReadingPlanStore.put(run);
    const p = base({ onListen: vi.fn() });
    render(<ReadingPlansScreen {...p} />);
    const plan = screen.getByRole('region', { name: 'Bible in a Year' });
    expect(within(plan).getByRole('heading', { name: 'Genesis 1-3' })).toBeTruthy();
    expect(within(plan).getByText('1 of 3 today')).toBeTruthy();
    expect(within(plan).getByText(/^1 of 1,189 chapters · on pace to finish /)).toBeTruthy();
    expect(plan.textContent).not.toMatch(/%/);
    fireEvent.click(within(plan).getByRole('button', { name: 'Listen to today: Genesis 1-3' }));
    expect(p.onListen).toHaveBeenCalledWith([{ bid: 'genesis', cid: 2 }, { bid: 'genesis', cid: 3 }], 'Bible in a Year');
    fireEvent.click(within(plan).getByRole('button', { name: 'Read 3' }));
    expect(p.onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 3 });
    expect(within(plan).getByRole('group', { name: 'This week' }).querySelectorAll('.plans-day')).toHaveLength(7);
  });

  /* n354 (A09.7, s21.9): the week strip's days were role-less spans; a day with a reading is a button that
     opens it (today opens today's next), and every day says its whole name. */
  it('this week: today opens its reading, a later planned day opens its own, every day is named in full', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    const week = within(screen.getByRole('region', { name: 'Bible in a Year' })).getByRole('group', { name: 'This week' });
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = new Date().getDay();
    const today = within(week).getByRole('button', { name: new RegExp('^Open ' + names[day] + ' \\d+, today$') });
    fireEvent.click(today);
    expect(p.onRead).toHaveBeenLastCalledWith({ bid: 'genesis', cid: 1 });
    if (day < 6) {
      fireEvent.click(within(week).getByRole('button', { name: new RegExp('^Open ' + names[day + 1] + ' ') }));
      expect(p.onRead).toHaveBeenLastCalledWith({ bid: 'genesis', cid: 4 });
    }
    for (const el of week.querySelectorAll('.plans-day')) expect(el.getAttribute('aria-label')).toMatch(/^(Open )?(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day \d+/);
  });

  it('a day read through says Done today, tomorrow’s portion, Read ahead and Read again (C2)', () => {
    let run = startCatalogPlan('bible-year', null, new Date());
    for (const k of ['genesis:1', 'genesis:2', 'genesis:3']) run = tickItem(run, k, todayKey(new Date()), 1);
    ReadingPlanStore.put(run);
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    const plan = screen.getByRole('region', { name: 'Bible in a Year' });
    expect(within(plan).getByRole('heading', { name: 'Done today' })).toBeTruthy();
    expect(within(plan).getByText('Tomorrow: Genesis 4-7')).toBeTruthy();
    fireEvent.click(within(plan).getByRole('button', { name: 'Read ahead' }));
    expect(p.onRead).toHaveBeenLastCalledWith({ bid: 'genesis', cid: 4 });
    fireEvent.click(within(plan).getByRole('button', { name: 'Read again' }));
    expect(p.onRead).toHaveBeenLastCalledWith({ bid: 'genesis', cid: 1 });
  });

  it('Find a plan lists every catalog plan in its group, one tap to start; a running one says Following (Corbin: B)', () => {
    render(<ReadingPlansScreen {...base()} />);
    for (const [g, names] of [['The Bible', ['Bible in a Year', 'New Testament', 'Psalms', 'Proverbs in 31 days', 'The Gospels']],
      ['The Letters', ['The Seven Volumes', 'Letters in a Year', 'Every letter, in order', 'Letters by date', 'One collection']],
      ['Short starts', ['The Blessed', 'Timothy', 'Holy Days', 'Matthew Study Bible']]]) {
      const group = screen.getByRole('region', { name: g });
      for (const n of names) expect(within(group).getByText(n)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start Psalms' }));
    expect(runs().map((r) => r.plan)).toEqual(['psalms']);
    expect(screen.getByRole('button', { name: 'Psalms, following' }).disabled).toBe(true);
    expect(screen.getByText('A day ticks when you read it through or listen to the end.')).toBeTruthy();
  });

  it('Spread it out keeps the planned finish and asks a little more each day (C3)', () => {
    const run = startCatalogPlan('bible-year', null, daysAgo(6));
    ReadingPlanStore.put(run);
    render(<ReadingPlansScreen {...base()} />);
    const plan = screen.getByRole('region', { name: 'Bible in a Year' });
    fireEvent.click(within(plan).getByRole('button', { name: 'Catch up' }));
    const spread = within(plan).getByRole('button', { name: /^Spread it out/ });
    expect(spread.textContent).toMatch(/Keep .* · about \d+ min a day from now/);
    act(() => { fireEvent.click(spread); });
    const after = ReadingPlanStore.active()[0];
    expect(after.target).toBe(run.target);
    expect(screen.getByRole('region', { name: 'Bible in a Year' }).textContent).not.toMatch(/days? behind/);
  });

  it('pauses and resumes a plan from Plan details (C3)', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause plan' })); });
    expect(ReadingPlanStore.active()[0].status).toBe('paused');
    expect(screen.getByText(/^Paused since /)).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Resume' })); });
    expect(ReadingPlanStore.active()[0].status).toBe('running');
  });

  it('changes the pace and keeps what was read (C6)', () => {
    let run = startCatalogPlan('bible-year', null, new Date());
    run = tickItem(run, 'genesis:1', todayKey(new Date()), 1);
    ReadingPlanStore.put(run);
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change pace' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: '90 days' })); });
    const after = ReadingPlanStore.active()[0];
    expect(after.pace).toEqual({ mode: 'days', n: 90 });
    expect('genesis:1' in after.ticks).toBe(true);
    expect(screen.getByText(/^Day 1 of 90/)).toBeTruthy();
  });

  it('marks today read by hand (a link, or holding the chapters), and un-marks it (C4)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
      render(<ReadingPlansScreen {...base()} />);
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Mark today as read' })); });
      expect(screen.getByRole('heading', { name: 'Done today' })).toBeTruthy();
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Not read yet' })); });
      expect(screen.getByRole('heading', { name: 'Genesis 1-3' })).toBeTruthy();
      const hold = document.querySelector('.plans-hold');
      fireEvent.pointerDown(hold);
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByRole('heading', { name: 'Done today' })).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it('the month pages back and forth, and a planned day opens its reading (C9)', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    const month = screen.getByRole('group', { name: new RegExp('^' + MONTHS[next.getMonth()]) });
    // The first of next month is a planned day: it opens that day's first chapter.
    fireEvent.click(within(month).getByRole('button', { name: new RegExp('^Open ' + MONTHS[next.getMonth()] + ' 1, ahead') }));
    const [call] = p.onRead.mock.calls;
    expect(call[0].bid).toBe('genesis');
    expect(call[0].cid).toBeGreaterThan(3);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('group', { name: MONTHS[now.getMonth()] })).toBeTruthy();
  });

  it('a finished plan is celebrated quietly, listed with its dates, and can run again (C11)', () => {
    let run = startCatalogPlan('proverbs', null, daysAgo(2));
    run = { ...run, status: 'finished', finished: todayKey(new Date()) };
    ReadingPlanStore.put(run);
    render(<ReadingPlansScreen {...base()} />);
    const done = screen.getByRole('region', { name: 'You finished Proverbs in 31 days' });
    expect(within(done).getByText(/^Started .* · finished .* · 3 days$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run Proverbs in 31 days again' })).toBeTruthy();
    act(() => { fireEvent.click(within(done).getByRole('button', { name: 'Run it again' })); });
    expect(ReadingPlanStore.active().map((r) => r.plan)).toEqual(['proverbs']);
    expect(ReadingPlanStore.all().filter((r) => r.status === 'finished').length).toBe(1);
    expect(screen.queryByRole('region', { name: 'You finished Proverbs in 31 days' })).toBeNull();
  });

  it('a missed day can be marked read, and whole weeks read show as weeks on plan (S4)', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, daysAgo(1)));
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: /: mark it read$/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Mark it read' })); });
    const run = ReadingPlanStore.active()[0];
    expect(['genesis:1', 'genesis:2', 'genesis:3'].every((k) => run.ticks[k] === todayKey(daysAgo(1)))).toBe(true);
    expect(screen.queryByRole('button', { name: /: mark it read$/ })).toBeNull();
    expect(screen.getByText(/^\d+ weeks? on plan$/)).toBeTruthy();
  });

  it('writes the day\u2019s note in the Journal, and opens the same note again from the day (S5)', () => {
    const entries = [];
    globalThis.JournalStore = {
      add: (seed) => { const e = { id: 'j' + (entries.length + 1), title: seed.title }; entries.push(e); return e; },
      get: (id) => entries.find((e) => e.id === id) || null,
    };
    try {
      ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
      const onNote = vi.fn();
      render(<ReadingPlansScreen {...base()} onNote={onNote} />);
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Write a note' })); });
      expect(entries).toEqual([{ id: 'j1', title: 'Bible in a Year · Day 1 · Genesis 1-3' }]);
      expect(onNote).toHaveBeenLastCalledWith('j1');
      expect(ReadingPlanStore.active()[0].notes).toEqual({ 0: 'j1' });
      fireEvent.click(screen.getByRole('button', { name: 'Your note for this day' }));
      expect(onNote).toHaveBeenLastCalledWith('j1');
      expect(entries.length).toBe(1);
    } finally { delete globalThis.JournalStore; }
  });

  it('never scores the reader', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, daysAgo(4)));
    const { container } = render(<ReadingPlansScreen {...base()} />);
    expect(container.textContent).not.toMatch(/streak/i);
  });
});

/* rp-s1: the page's side of the daily Android reminder (utils/plan-reminder.js; the native half is PlanReminder.kt). */
function fakeBridge({ allowed = true, quiet = [] } = {}) {
  const b = {
    sent: [], opened: '',
    planReminderSet: vi.fn((json) => { b.sent.push(JSON.parse(json)); return JSON.stringify({ ok: true, allowed, next: 1, quiet }); }),
    planReminderStatus: vi.fn(() => JSON.stringify({ ok: true, allowed, next: 1, quiet })),
    planReminderAsk: vi.fn(() => { if (typeof window.__votNotificationsResult === 'function') window.__votNotificationsResult(allowed); }),
    planReminderSettings: vi.fn(),
    planReminderOpened: vi.fn(() => { const o = b.opened; b.opened = ''; return o; }),
  };
  return b;
}

describe('the daily reminder (rp-s1)', () => {
  afterEach(() => { delete window.AndroidBridge; _resetForTests(); });

  it('on the web nothing offers a reminder', () => {
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Bible in a Year' }));
    expect(screen.queryByText(/A reminder each day/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.queryByRole('button', { name: 'Remind me each day' })).toBeNull();
  });

  it('a plan just started offers one; yes keeps 07:30 on the run and asks the phone once', () => {
    const b = fakeBridge();
    window.AndroidBridge = b;
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Bible in a Year' }));
    expect(screen.getByText('A reminder each day at 7:30 AM?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remind me' }));
    expect(runs()[0].remind).toBe('07:30');
    expect(b.planReminderAsk).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/A reminder each day/)).toBeNull();
  });

  it('no thanks leaves it off; the details turn it on, change its time and turn it off', () => {
    window.AndroidBridge = fakeBridge();
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Bible in a Year' }));
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(runs()[0].remind).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remind me each day' }));
    expect(runs()[0].remind).toBe('07:30');
    fireEvent.change(screen.getByLabelText('Reminder each day at'), { target: { value: '21:15' } });
    expect(runs()[0].remind).toBe('21:15');
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect('remind' in runs()[0]).toBe(false);
  });

  it('notifications refused: the details say so and open the phone’s settings', () => {
    const b = fakeBridge({ allowed: false });
    window.AndroidBridge = b;
    ReadingPlanStore.put({ ...startCatalogPlan('bible-year', null, new Date()), remind: '07:30' });
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan details' }));
    expect(screen.getByText(/Notifications are off for this app/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(b.planReminderSettings).toHaveBeenCalled();
  });

  it('a quiet plan asks once whether to keep its reminder; Turn it off drops it', () => {
    const run = { ...startCatalogPlan('bible-year', null, daysAgo(10)), remind: '07:30' };
    window.AndroidBridge = fakeBridge({ quiet: [run.id] });
    ReadingPlanStore.put(run);
    const first = render(<ReadingPlansScreen {...base()} />);
    expect(screen.getByText('Keep the daily reminder for Bible in a Year?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn it off' }));
    expect('remind' in runs()[0]).toBe(false);
    first.unmount();
    ReadingPlanStore.put({ ...runs()[0], remind: '07:30', updated: run.updated });
    render(<ReadingPlansScreen {...base()} />);
    expect(screen.queryByText(/Keep the daily reminder/)).toBeNull();     // asked once for this quiet stretch
  });

  it('the app hands the native side the running plans on each change, and a tapped reminder opens its plan', async () => {
    const b = fakeBridge();
    b.opened = 'none-yet';
    window.AndroidBridge = b;
    const run = { ...startCatalogPlan('bible-year', null, new Date()), remind: '06:45' };
    const openPlans = vi.fn();
    function App() { usePlanReminders(openPlans); return null; }
    const cold = render(<App />);
    expect(openPlans).toHaveBeenCalledTimes(1);                               // the tap that cold-started the app
    expect(takePlanOpen()).toBe('none-yet');
    cold.unmount();
    render(<><App /><ReadingPlansScreen {...base()} /></>);
    act(() => { ReadingPlanStore.put(run); });
    expect(b.sent.at(-1).plans.map((p) => [p.id, p.time, p.name])).toEqual([[run.id, '06:45', 'Bible in a Year']]);
    act(() => { ReadingPlanStore.put({ ...run, status: 'stopped', updated: Date.now() }); });
    expect(b.sent.at(-1).plans).toEqual([]);                                   // a stopped plan drops its reminder
    act(() => { ReadingPlanStore.put({ ...run, updated: Date.now() }); });
    expect(screen.queryByRole('button', { name: 'Stop Bible in a Year' })).toBeNull();
    act(() => { window.__votPlanReminderOpen(run.id); });                     // a later tap while the page runs
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Bible in a Year' })).toBeTruthy());
    expect(openPlans).toHaveBeenCalledTimes(2);
  });
});

/* n354b (hub call 2026-10-23 19:30): a letters plan the reader is partway through offers "Start where I am: <title>"
   beside the normal start; with nothing of it read the tap starts it as before. */
describe('ReadingPlansScreen — Start where I am (n354b)', () => {
  const KEYS = ['COL_BY_KEY', 'colLetterArr', 'colPreface', 'READING_CHAIN'];
  let saved;
  beforeEach(() => {
    saved = KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    const col = { volKey: 'blessed', readKey: 'the-blessed', label: 'The Blessed', short: 'Blessed', letterScreen: 'blessed-letter' };
    const letters = [{ id: 'b1', title: 'First' }, { id: 'b2', title: 'Second' }, { id: 'b3', title: 'Third' }];
    globalThis.COL_BY_KEY = new Map([['blessed', col]]);
    globalThis.colLetterArr = (c) => (c === col ? letters : []);
    globalThis.colPreface = () => null;
    globalThis.READING_CHAIN = ['blessed'];
  });
  afterEach(() => {
    for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  });
  const readOf = (ids) => (bid, cid) => bid === 'the-blessed' && ids.includes(cid);

  it('with a letter read, the tap offers both starts; Start where I am begins at the first unread', () => {
    render(<ReadingPlansScreen {...base({ isRead: readOf(['b1']) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start The Blessed' }));
    expect(runs()).toHaveLength(0);
    const group = screen.getByRole('group', { name: 'Start The Blessed' });
    expect(within(group).getByRole('button', { name: 'From the beginning' })).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Start where I am: Second' }));
    expect(runs()).toHaveLength(1);
    expect(runs()[0].tracks[0].items.map((it) => it.k)).toEqual(['the-blessed:b2', 'the-blessed:b3']);
  });

  it('From the beginning starts the whole plan', () => {
    render(<ReadingPlansScreen {...base({ isRead: readOf(['b1']) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start The Blessed' }));
    fireEvent.click(screen.getByRole('button', { name: 'From the beginning' }));
    expect(runs()[0].tracks[0].items).toHaveLength(3);
  });

  it('with nothing read the tap starts the plan at once, no offer', () => {
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start The Blessed' }));
    expect(screen.queryByRole('group', { name: 'Start The Blessed' })).toBeNull();
    expect(runs()).toHaveLength(1);
    expect(runs()[0].tracks[0].items).toHaveLength(3);
  });

  it('a second tap on the row puts the offer away', () => {
    render(<ReadingPlansScreen {...base({ isRead: readOf(['b1']) })} />);
    const row = screen.getByRole('button', { name: 'Start The Blessed' });
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(row);
    expect(screen.queryByRole('group', { name: 'Start The Blessed' })).toBeNull();
    expect(runs()).toHaveLength(0);
  });
});
