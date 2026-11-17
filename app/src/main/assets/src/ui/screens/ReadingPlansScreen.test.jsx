// @ts-nocheck - ScreenLayout / LibraryNav / ConfirmStrip are free globals, as the other personal-study screens
/* Reading plans as a place (plans2, P2-plans-design.md): the list, a plan's preview, the plan's own page, its whole
   schedule and day sheet, a finished plan. PlansHub holds the views; the runs are real ReadingPlanStore records. */
import 'fake-indexeddb/auto';   // the runs are really saved: the rp1 move waits for that save
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within, act, waitFor } from '@testing-library/react';
import { PlansHub } from './PlansHub.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { builderSpec } from '../../data/plan-builder.js';
import { tickItem, todayKey, dayItems, markDay, pauseRun, runStatus, dayNum, dateOf, monthCells, streak, newRun, creditRead } from '../../data/plan-engine.js';
import { usePlanReminders } from '../../utils/plan-runs-view.js';
import { _resetPlanNavForTests } from '../../utils/plan-nav.js';
import { _resetForTests } from '../../utils/plan-reminder.js';

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12); return d; };
const tomorrowKey = () => dateOf(dayNum(todayKey(new Date())) + 1);

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ onBack, leftExtras, rightExtras }) => <div><button type="button" onClick={onBack}>Back</button>{leftExtras}{rightExtras}</div>;
  globalThis.ConfirmStrip = ({ question, yesLabel, onConfirm, onCancel }) => (
    <div><span>{question}</span><button type="button" onClick={onConfirm}>{yesLabel || 'Yes'}</button><button type="button" onClick={onCancel}>No</button></div>
  );
  localStorage.clear();
  _resetPlanNavForTests();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
});
afterEach(() => { cleanup(); delete globalThis.ReadingPlanStore; });

const base = (o) => ({ readingPlans: [], isRead: () => false, onPlansMoved: vi.fn(), onStartSession: vi.fn(), onBack: vi.fn(), ...o });
const runs = () => ReadingPlanStore.active();
const barTitle = () => document.querySelector('.plan-bar-title').textContent;
/** The running plan's row on the list (its aria-label starts with the name and the state). */
const openRow = (name = 'Bible in a Year') => fireEvent.click(screen.getByRole('button', { name: new RegExp('^' + name + ': (On track|Done today|Not started|Paused|[0-9]+ days? behind)') }));
const lateRun = () => {
  let run = startCatalogPlan('bible-year', null, daysAgo(4));
  for (const it of run.tracks[0].items.slice(0, 3)) run = tickItem(run, it.k, todayKey(daysAgo(4)), 1);
  return run;
};

describe('Reading plans: the list (3.1)', () => {
  it('no plans yet: one sentence and Find a plan; the title is in the bar and the catalog is grouped', () => {
    render(<PlansHub {...base()} />);
    expect(barTitle()).toBe('Reading plans');
    expect(screen.getByText(/Pick a plan below/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Find a plan' })).toBeTruthy();
    expect([...document.querySelectorAll('.plan-group-title')].map((h) => h.textContent)).toEqual(['Start here', 'The Scriptures', 'The Letters', 'Together']);
    expect(screen.getByRole('button', { name: /^Bible in a Year: Genesis to Revelation, \d+ min a day, 365 days$/ })).toBeTruthy();
  });

  it('a tap on a catalog plan opens its preview and never starts it', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    expect(runs()).toEqual([]);
    expect(screen.getByText('Genesis to Revelation, straight through. About three chapters a day, read or listened to.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start plan' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/Pick a plan below/)).toBeTruthy();
  });

  it('running plans keep their start order and one state line each, led by the status (2235)', () => {
    const a = startCatalogPlan('bible-year', null, new Date());
    const b = pauseRun({ ...startCatalogPlan('psalms', null, new Date()), id: 'p_b' }, new Date());
    ReadingPlanStore.put(a);
    ReadingPlanStore.put(b);
    ReadingPlanStore.put({ ...a, updated: Date.now() });   // a save keeps its place
    render(<PlansHub {...base()} />);
    const rows = [...screen.getByRole('list', { name: 'Your plans' }).querySelectorAll('.plan-run-row')];
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Bible in a Year: On track · Today: Genesis 1-3 · 0 of 3', 'Psalms: Paused · Day 1 of 30']);
    // 0130/0430: every plan's way to change or stop it is the word Manage, a paused one's too (its sheet has Resume)
    expect([...document.querySelectorAll('.plan-manage-link')].map((b) => b.getAttribute('aria-label'))).toEqual(['Manage Bible in a Year', 'Manage Psalms']);
    expect(rows[1].querySelector('.plan-state b').textContent).toBe('Paused');
  });
});

describe('Reading plans: a later start with its first days already counted (L3)', () => {
  it('the Starts card shows the first day not yet counted, not a Day 1 that is ticked', () => {
    let run = { ...startCatalogPlan('bible-year', null, new Date()), start: tomorrowKey() };
    for (const it of run.tracks[0].items.slice(0, 3)) run = tickItem(run, it.k, todayKey(daysAgo(2)), 1);
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    const card = document.querySelector('.plan-today');
    expect(card.querySelector('.root-eyebrow').textContent).toMatch(/^Starts /);
    expect(card.querySelector('.plan-today-title').textContent).toBe('Genesis 4-7');
    expect(card.querySelector('.plan-today-sub').textContent).toMatch(/^Day 2 · about /);
  });
});

describe('Reading plans: the preview (3.2)', () => {
  it('says the facts and the first week, and START PLAN starts it and opens its page', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    const facts = screen.getByRole('list', { name: 'This plan' }).textContent;
    expect(facts).toMatch(/365days/);
    expect(facts).toMatch(/1,189chapters/);
    const week = within(screen.getByRole('list', { name: 'Your first week' })).getAllByRole('listitem');
    expect(week.map((li) => li.querySelector('.plan-day-portion').textContent)).toEqual(['Genesis 1-3', 'Genesis 4-7', 'Genesis 8-10']);
    expect(screen.getByText(/^Finishes .* · you can change any of this later$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(runs().map((r) => [r.plan, r.start])).toEqual([['bible-year', todayKey(new Date())]]);
    expect(barTitle()).toBe('Bible in a Year');
    expect(screen.getByRole('group', { name: 'This week' })).toBeTruthy();
  });

  it('Length changes the plan ("90 days" means 90), and Tomorrow starts it later', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    const run = runs()[0];
    expect(run.start).toBe(tomorrowKey());
    expect(runStatus(run, new Date()).total).toBe(90);
    expect(runStatus(run, new Date()).notStarted).toBe(true);
    expect(document.querySelector('.plan-status').textContent).toMatch(/^Not started · starts tomorrow · finishes /);
    fireEvent.click(screen.getByRole('button', { name: 'Start today instead' }));
    expect(runs()[0].start).toBe(todayKey(new Date()));
  });

  // Corbin 11-17 02:28: "reading plans should not be measured by what I've already read, but by a new, independent count
  // kept by the new plan". A reader who has read all of Genesis starts Bible in a Year at day 1, with nothing counted.
  it('a new plan starts at zero: Genesis 1-50 read before, Bible in a Year is at day 1 with nothing done, and a read afterwards ticks day 1 today', () => {
    const isRead = (b, c) => b === 'genesis' && Number(c) <= 50;
    render(<PlansHub {...base({ isRead })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    expect(screen.queryByText('Already read')).toBeNull();
    expect(screen.queryByText(/^Count my /)).toBeNull();
    const week = within(screen.getByRole('list', { name: 'Your first week' })).getAllByRole('listitem');
    expect(week.map((li) => li.querySelector('.plan-day-portion').textContent)).toEqual(['Genesis 1-3', 'Genesis 4-7', 'Genesis 8-10']);
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    const run = runs()[0];
    expect(run.ticks).toEqual({});
    expect(run.credited).toBeUndefined();
    const st = runStatus(run, new Date());
    expect(st.itemsDone).toBe(0);
    expect(st.percent).toBe(0);
    expect(st.ahead).toBe(0);
    expect(st.behind).toBe(0);
    expect(st.doneToday).toBe(false);
    expect(screen.getByText(/^Today · Genesis 1-3/)).toBeTruthy();
    act(() => { ReadingPlanStore.noteRead('genesis', 1); });
    expect(runs()[0].ticks).toEqual({ 'genesis:1': todayKey(new Date()) });
    expect(dayItems(runs()[0], 0).map((it) => it.k)).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);   // day 1
  });

  it('a plan that starts tomorrow counts nothing read today: its card still says Day 1 (0245, C6)', () => {
    const isRead = (b, c) => b === 'genesis' && Number(c) <= 50;
    render(<PlansHub {...base({ isRead })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    act(() => { ReadingPlanStore.noteRead('genesis', 1); });
    expect(runs()[0].ticks).toEqual({});
    const card = document.querySelector('.plan-today');
    expect(card.querySelector('.root-eyebrow').textContent).toMatch(/^Starts /);
    expect(card.querySelector('.plan-today-title').textContent).toBe('Genesis 1-3');
    expect(card.querySelector('.plan-today-sub').textContent).toMatch(/^Day 1 · about /);
  });

  it('Days: the seven toggles, at least one always on', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Psalms: / }));
    for (const d of ['Sunday', 'Saturday']) fireEvent.click(screen.getByRole('button', { name: d }));
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(runs()[0].weekdays).toEqual([false, true, true, true, true, true, false]);
  });
});

describe('Reading plans: the plan page (3.3, 3.8)', () => {
  it('Today: each item reads inside the plan; Start reading begins the session on the day', () => {
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    const p = base();
    render(<PlansHub {...p} />);
    openRow();
    expect(screen.getByText('Day 1 of 365')).toBeTruthy();
    expect(screen.getByText('0 of 1,189 chapters read')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 2' }));
    expect(p.onStartSession).toHaveBeenLastCalledWith(run.id, 0, 'genesis:2');
    fireEvent.click(screen.getByRole('button', { name: 'Start reading' }));
    expect(p.onStartSession).toHaveBeenLastCalledWith(run.id, 0, undefined);
  });

  it('behind (2235): the same status on the list and the page; Catch up keeps the daily amount and it is On track', () => {
    ReadingPlanStore.put(lateRun());
    render(<PlansHub {...base()} />);
    const row = screen.getByRole('button', { name: /^Bible in a Year: [0-9]+ days? behind · finishes / });
    const said = row.querySelector('.plan-state b').textContent;
    expect(said).toMatch(/^[0-9]+ days? behind · finishes [A-Z][a-z]{2} [0-9]+(, [0-9]{4})?$/);
    openRow();
    expect(document.querySelector('.plan-status').textContent).toBe(said);
    fireEvent.click(screen.getByRole('button', { name: 'Catch up' }));
    const sheet = screen.getByRole('dialog', { name: 'Catch up' });
    expect(within(sheet).getByText(said)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /^Read two days today/ })).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /^Finish on time/ })).toBeTruthy();
    // what stays, under a head that already says when it finishes (2320 five-second test: 'the finish moves to' read as a change)
    expect(within(sheet).getByRole('button', { name: /^Keep my daily amount/ }).textContent).toBe('Keep my daily amountSame reading each day · still finishes ' + said.replace(/^.* finishes /, ''));
    act(() => { fireEvent.click(within(sheet).getByRole('button', { name: /^Keep my daily amount/ })); });
    expect(document.querySelector('.plan-status b').textContent).toBe('On track');
    // the dates that went unread stay on the week strip as history
    expect(screen.getByRole('group', { name: 'This week' }).querySelectorAll('[data-missed="1"]').length).toBeGreaterThan(0);
  });

  it('Read two days today starts one sitting over today and the next day', () => {
    const run = lateRun();
    ReadingPlanStore.put(run);
    const p = base();
    render(<PlansHub {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catch up: Bible in a Year' }));
    const sheet = screen.getByRole('dialog', { name: 'Catch up' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^Read two days today/ }));
    expect(p.onStartSession).toHaveBeenLastCalledWith(run.id, 1, undefined, 2);
  });

  it('a paused plan is never late: Paused since and Resume, nothing else', () => {
    ReadingPlanStore.put(pauseRun(lateRun(), new Date()));
    render(<PlansHub {...base()} />);
    openRow();
    expect(screen.getByText(/^Paused since /)).toBeTruthy();
    expect(screen.queryByText(/later than planned/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start reading' })).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Resume' })); });
    expect(runs()[0].status).toBe('running');
  });

  it('done today: tomorrow, Read ahead opens the next day’s sheet, Not read yet takes it back', () => {
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(markDay(run, 0, true, new Date()));
    const p = base();
    render(<PlansHub {...p} />);
    openRow();
    expect(document.querySelector('.plan-today-done .plan-today-title').textContent).toBe('Done today');
    expect(document.querySelector('.plan-status b').textContent).toBe('Done today');
    expect(screen.getByText(/^Tomorrow · Genesis 4-7/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read ahead' }));
    const sheet = screen.getByRole('dialog', { name: /^Day 2/ });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Read this day' }));
    expect(p.onStartSession).toHaveBeenLastCalledWith(run.id, 1, undefined);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Not read yet' })); });
    expect(runStatus(runs()[0], new Date()).itemsDone).toBe(0);
  });

  it('this week and days in a row (from 2 up only)', () => {
    let run = startCatalogPlan('bible-year', null, daysAgo(2));
    run = markDay(run, 0, true, daysAgo(2));
    run = markDay(run, 1, true, daysAgo(1));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    expect(screen.getByRole('group', { name: 'This week' }).textContent).toMatch(/2 days in a row/);
  });

  it('the road: books with their counts; a tap opens the schedule there', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<PlansHub {...base()} />);
    openRow();
    const road = screen.getByRole('list', { name: 'The road' });
    expect(within(road).getAllByRole('button').map((b) => b.querySelector('.plan-road-name').textContent)).toEqual(['Genesis', 'Exodus', 'Leviticus']);
    fireEvent.click(screen.getByRole('button', { name: 'All 66 books' }));
    expect(within(screen.getByRole('list', { name: 'The road' })).getAllByRole('button').length).toBe(66);
    fireEvent.click(screen.getByRole('button', { name: 'Exodus: 0 of 40 read' }));
    expect(barTitle()).toBe('Bible in a Year · Schedule');
  });

  it("0130: the list's 'Manage ›' opens the plan on its Manage sheet, once; the schedule says the plan's status", () => {
    const run = markDay(startCatalogPlan('bible-year', null, daysAgo(3)), 0, true, daysAgo(3));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Bible in a Year' }));
    expect(barTitle()).toBe('Bible in a Year');
    expect(screen.getByRole('dialog', { name: 'Manage plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop plan' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Manage plan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Whole schedule' }));
    expect(document.querySelector('.plan-sched-status').textContent).toMatch(/behind · finishes /);
    act(() => { window.history.back(); });
  });

  it('Manage plan: Stop is one tap with Undo; a stopped plan is kept under Past plans with Continue (2235)', () => {
    const run = markDay(startCatalogPlan('bible-year', null, daysAgo(3)), 0, true, daysAgo(3));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    expect(screen.getByRole('dialog', { name: 'Manage plan' })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop plan' })); });
    expect(runs().length).toBe(0);
    expect(ReadingPlanStore.all()[0].status).toBe('stopped');
    expect(barTitle()).toBe('Reading plans');
    // Undo puts it back as it was, ticks and all
    const toast = document.getElementById('vot-toast-plan-manage');
    expect(toast.textContent).toMatch(/^Stopped Bible in a Year/);
    act(() => { toast.querySelector('.vot-undo-btn').click(); });
    expect(runs().map((r) => [r.id, r.status, Object.keys(r.ticks).length])).toEqual([[run.id, 'running', 3]]);
    // stopped again, it is listed under Past plans; its page offers Continue, which keeps every tick
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop plan' })); });
    const past = screen.getByRole('list', { name: 'Past plans' });
    expect(within(past).getByRole('button').textContent).toMatch(/Stopped [A-Z][a-z]{2} [0-9]+ · day 2 of 365/);
    fireEvent.click(within(past).getByRole('button'));
    expect(screen.getByText('You stopped Bible in a Year')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Continue where I stopped' })); });
    expect(runs().map((r) => [r.id, r.status, Object.keys(r.ticks).length])).toEqual([[run.id, 'running', 3]]);
    expect(barTitle()).toBe('Bible in a Year');
  });

  it('Manage plan: Start over begins a new run from day 1 and keeps the old one under Past plans; Undo takes it back', () => {
    const run = markDay(startCatalogPlan('bible-year', null, daysAgo(3)), 0, true, daysAgo(3));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start over' })); });
    expect(runs().length).toBe(1);
    expect(runs()[0].id).not.toBe(run.id);
    expect(runStatus(runs()[0], new Date()).itemsDone).toBe(0);
    expect(ReadingPlanStore.get(run.id).status).toBe('stopped');
    expect(Object.keys(ReadingPlanStore.get(run.id).ticks).length).toBe(3);
    act(() => { document.getElementById('vot-toast-plan-manage').querySelector('.vot-undo-btn').click(); });
    expect(ReadingPlanStore.all().map((r) => [r.id, r.status])).toEqual([[run.id, 'running']]);
  });

  it('the gear: a new length keeps what was read; pause turns the page to Paused', () => {
    ReadingPlanStore.put(markDay(startCatalogPlan('bible-year', null, new Date()), 0, true, new Date()));
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('radio', { name: '2 years' })); });
    expect(runStatus(runs()[0], new Date()).total).toBe(730);
    expect(runStatus(runs()[0], new Date()).itemsDone).toBe(3);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause plan' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText(/^Paused since /)).toBeTruthy();
  });

  it('Write a note opens the day’s Journal note, and the same note again', () => {
    const entries = new Map();
    globalThis.JournalStore = { add: vi.fn((e) => { const x = { ...e, id: 'j' + (entries.size + 1) }; entries.set(x.id, x); return x; }), get: (id) => entries.get(id) || null };
    try {
      const run = startCatalogPlan('bible-year', null, new Date());
      ReadingPlanStore.put(markDay(run, 0, true, new Date()));
      const onNote = vi.fn();
      render(<PlansHub {...base({ onNote })} />);
      openRow();
      fireEvent.click(screen.getByRole('button', { name: 'Write a note' }));
      expect(globalThis.JournalStore.add).toHaveBeenCalledWith({ title: 'Bible in a Year · Day 1' });
      expect(onNote).toHaveBeenLastCalledWith('j1');
      expect(runs()[0].notes).toEqual({ 0: 'j1' });
      fireEvent.click(screen.getByRole('button', { name: 'Your note' }));
      expect(globalThis.JournalStore.add).toHaveBeenCalledTimes(1);
      expect(onNote).toHaveBeenLastCalledWith('j1');
    } finally { delete globalThis.JournalStore; }
  });
});

describe('Reading plans: the whole schedule and the day sheet (3.4)', () => {
  it('Coming up lists every day with section ends; a day sheet marks a day read; What I’ve read lists it', () => {
    const run = startCatalogPlan('bible-year', null, new Date());
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getAllByRole('button', { name: 'Whole schedule' })[0]);
    expect(screen.getByRole('tab', { name: 'Coming up' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Genesis finished/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Day 2, .*: Genesis 4-7/ }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Mark day as read' })); });
    expect(dayItems(runs()[0], 1).every((it) => it.k in runs()[0].ticks)).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'What I’ve read' }));
    expect(screen.getByRole('list', { name: 'What I’ve read' }).textContent).toMatch(/Genesis 4-7/);
  });
});

describe('Reading plans: missed days on screen (2235)', () => {
  it('What I’ve read draws the month with each unread reading day dashed, as monthCells counts them', () => {
    const run = lateRun();
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getAllByRole('button', { name: 'Whole schedule' })[0]);
    fireEvent.click(screen.getByRole('tab', { name: 'What I’ve read' }));
    const now = new Date();
    const want = monthCells(run, now.getFullYear(), now.getMonth(), now).filter((c) => c.state === 'missed').map((c) => String(c.date));
    const cal = document.querySelector('.plan-cal');
    expect([...cal.querySelectorAll('.plan-cal-grid [data-missed="1"]')].map((el) => el.textContent)).toEqual(want);
    if (want.length) expect(cal.getAttribute('aria-label')).toMatch(new RegExp(', ' + want.length + ' missed$'));
    // the week strip says the same of this week
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const weekMissed = [...screen.getByRole('group', { name: 'This week' }).querySelectorAll('[role="img"]')].filter((d) => /, missed$/.test(d.getAttribute('aria-label')));
    expect(weekMissed.length).toBe(streak(run, now).week.filter((d) => d.missed).length);
  });
});

describe('Reading plans: finished (3.7)', () => {
  it('a finished plan is kept under Finished; its page marks it seen; Run it again starts a new run', () => {
    let run = startCatalogPlan('psalms', null, daysAgo(30));
    for (let d = 0; d < 30; d++) run = markDay(run, d, true, daysAgo(30 - d));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    const fin = screen.getByRole('list', { name: 'Past plans' });
    fireEvent.click(within(fin).getByRole('button'));
    expect(screen.getByText('You finished Psalms')).toBeTruthy();
    expect(ReadingPlanStore.get(run.id).seen).toBe(true);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Run it again' })); });
    expect(runs().map((r) => r.plan)).toEqual(['psalms']);
    expect(screen.getByRole('group', { name: 'This week' })).toBeTruthy();
  });
});

describe('Reading plans: the old settings plans (rp1)', () => {
  it('moves rp1\'s settings plan into a run and clears it from settings once the run is saved', async () => {
    const p = base({ readingPlans: [{ id: 'bible-year', start: todayKey(daysAgo(1)) }], isRead: (b, c) => b === 'genesis' && c <= 3 });
    render(<PlansHub {...p} />);
    expect(runs().map((r) => r.plan)).toEqual(['bible-year']);
    await waitFor(() => expect(p.onPlansMoved).toHaveBeenCalledWith([]));
    expect(screen.getByRole('button', { name: /^Bible in a Year: (On track|[0-9]+ days? behind)/ })).toBeTruthy();
  });

  it('keeps rp1\'s settings plan when the run could not be saved', async () => {
    const whenSaved = ReadingPlanStore.whenSaved;
    ReadingPlanStore.whenSaved = () => Promise.resolve(false);
    try {
      const p = base({ readingPlans: [{ id: 'bible-year', start: todayKey(daysAgo(1)) }] });
      render(<PlansHub {...p} />);
      await act(async () => { await Promise.resolve(); });
      expect(runs().length).toBe(1);
      expect(p.onPlansMoved).not.toHaveBeenCalled();
    } finally { ReadingPlanStore.whenSaved = whenSaved; }
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

describe('the daily reminder (rp-s1, plans2)', () => {
  afterEach(() => { delete window.AndroidBridge; _resetForTests(); });

  it('on the web nothing offers a reminder', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    expect(screen.queryByRole('switch', { name: 'Remind me each day' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    expect(screen.queryByRole('switch', { name: 'Remind me each day' })).toBeNull();
  });

  it('the preview offers it, on at 7:30; starting keeps 07:30 on the run and asks the phone once', () => {
    const b = fakeBridge();
    window.AndroidBridge = b;
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    expect(screen.getByRole('switch', { name: 'Remind me each day' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(runs()[0].remind).toBe('07:30');
    expect(b.planReminderAsk).toHaveBeenCalledTimes(1);
  });

  it('the gear changes its time and turns it off; refused notifications say so and open the phone’s settings', () => {
    const b = fakeBridge({ allowed: false });
    window.AndroidBridge = b;
    ReadingPlanStore.put({ ...startCatalogPlan('bible-year', null, new Date()), remind: '07:30' });
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    expect(screen.getByText(/Notifications are off for this app/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(b.planReminderSettings).toHaveBeenCalled();
    act(() => { fireEvent.change(screen.getByLabelText('Reminder time'), { target: { value: '21:15' } }); });
    expect(runs()[0].remind).toBe('21:15');
    act(() => { fireEvent.click(screen.getByRole('switch', { name: 'Remind me each day' })); });
    expect('remind' in runs()[0]).toBe(false);
  });

  it('a quiet plan asks once whether to keep its reminder; Turn it off drops it', () => {
    const run = { ...startCatalogPlan('bible-year', null, daysAgo(10)), remind: '07:30' };
    window.AndroidBridge = fakeBridge({ quiet: [run.id] });
    ReadingPlanStore.put(run);
    const first = render(<PlansHub {...base()} />);
    openRow();
    expect(screen.getByText('Keep the daily reminder for this plan?')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Turn it off' })); });
    expect('remind' in runs()[0]).toBe(false);
    first.unmount();
    ReadingPlanStore.put({ ...runs()[0], remind: '07:30', updated: run.updated });
    render(<PlansHub {...base()} />);
    openRow();
    expect(screen.queryByText(/Keep the daily reminder/)).toBeNull();     // asked once for this quiet stretch
  });

  it('the app hands the native side the running plans on each change, and a tapped reminder opens its plan page', async () => {
    const b = fakeBridge();
    window.AndroidBridge = b;
    const run = { ...startCatalogPlan('bible-year', null, new Date()), remind: '06:45' };
    const openPlans = vi.fn();
    function App() { usePlanReminders(openPlans); return null; }
    render(<><App /><PlansHub {...base()} /></>);
    act(() => { ReadingPlanStore.put(run); });
    expect(b.sent.at(-1).plans.map((p) => [p.id, p.time, p.name])).toEqual([[run.id, '06:45', 'Bible in a Year']]);
    act(() => { ReadingPlanStore.put({ ...run, status: 'stopped', updated: Date.now() }); });
    expect(b.sent.at(-1).plans).toEqual([]);                                   // a stopped plan drops its reminder
    act(() => { ReadingPlanStore.put({ ...run, updated: Date.now() }); });
    act(() => { window.__votPlanReminderOpen(run.id); });                     // a tap while the page runs
    await waitFor(() => expect(barTitle()).toBe('Bible in a Year'));
    expect(openPlans).toHaveBeenCalled();
  });
});

/* n354b, plans2: a letters plan the reader is partway through offers "Where I am" as a Start choice, saying what it
   leaves out; with nothing of it read the choice is not there. */
describe('Reading plans: Start where I am (n354b)', () => {
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

  it('with a letter read, Where I am starts at the first unread and says what it skips', () => {
    render(<PlansHub {...base({ isRead: readOf(['b1']) })} />);
    fireEvent.click(screen.getByRole('button', { name: /^The Blessed: / }));
    fireEvent.click(screen.getByRole('radio', { name: 'Where I am' }));
    expect(screen.getByText('Starts at Second · skips 1 earlier reading')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(runs()[0].tracks[0].items.map((it) => it.k)).toEqual(['the-blessed:b2', 'the-blessed:b3']);
  });

  it('with nothing read there is no Where I am, and the plan starts whole', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^The Blessed: / }));
    expect(screen.queryByRole('radio', { name: 'Where I am' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(runs()[0].tracks[0].items.length).toBe(3);
  });
});

describe('changing a custom plan after it starts (2310)', () => {
  it('Manage plan > Change what is in it: the builder opens on its picks; Save makes a new run keeping every tick, the old one stopped; Undo puts it back', () => {
    const spec = builderSpec({ picks: [{ t: 'b', bid: 'ruth', ch: null }, { t: 'b', bid: 'jonah', ch: null }, { t: 'b', bid: 'esther', ch: null }], order: 'picked', share: 'side',
      goal: { mode: 'items', n: 2 }, weekdays: Array(7).fill(true), name: 'Two short books' }, null);
    let run = newRun(spec, daysAgo(2));
    run = tickItem(tickItem(run, 'ruth:1', todayKey(daysAgo(2)), 1), 'ruth:2', todayKey(daysAgo(2)), 1);
    run = tickItem(tickItem(run, 'ruth:3', todayKey(daysAgo(1)), 2), 'ruth:4', todayKey(daysAgo(1)), 2);
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    openRow('Two short books');
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change what\u2019s in it' }));
    expect(screen.getByText('Change your plan · Step 1 of 2')).toBeTruthy();
    // its picks are in: drop Esther (none of it read)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Esther' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('list', { name: 'Your picks' }).textContent).toMatch(/Ruth.*Jonah/);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
    expect(screen.getByText(/4 read so far/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Plan name' }).value).toBe('Two short books');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(runs().length).toBe(1);
    const fresh = runs()[0];
    expect(fresh.id).not.toBe(run.id);
    expect(fresh.tracks.flatMap((t) => t.items.map((it) => it.k))).toEqual(['ruth:1', 'ruth:2', 'ruth:3', 'ruth:4', 'jonah:1', 'jonah:2', 'jonah:3', 'jonah:4']);
    expect(fresh.ticks).toEqual(run.ticks);
    expect(ReadingPlanStore.get(run.id)).toMatchObject({ status: 'stopped', ticks: run.ticks, segs: run.segs });
    expect(barTitle()).toBe('Two short books');
    act(() => { document.getElementById('vot-toast-plan-manage').querySelector('.vot-undo-btn').click(); });
    expect(ReadingPlanStore.all().map((r) => [r.id, r.status])).toEqual([[run.id, 'running']]);
    expect(ReadingPlanStore.get(run.id)).toEqual(run);
  });

  it('Save changes with only the name changed: the same run renamed, with Undo; with nothing changed: nothing saved, no toast', () => {
    const spec = builderSpec({ picks: [{ t: 'b', bid: 'ruth', ch: null }, { t: 'b', bid: 'jonah', ch: null }], order: 'picked', share: 'side',
      goal: { mode: 'items', n: 2 }, weekdays: Array(7).fill(true), name: 'Two short books' }, null);
    const run = tickItem(newRun(spec, daysAgo(1)), 'ruth:1', todayKey(daysAgo(1)), 1);
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    const change = () => {
      openRow('Two short books');
      fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
      fireEvent.click(screen.getByRole('button', { name: 'Change what’s in it' }));
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
    };
    change();
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan name' }), { target: { value: 'Ruth and Jonah' } });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(ReadingPlanStore.all().map((r) => [r.id, r.name, r.status])).toEqual([[run.id, 'Ruth and Jonah', 'running']]);
    const toast = document.getElementById('vot-toast-plan-manage');
    expect(toast.textContent).toMatch(/^Renamed Ruth and Jonah/);
    act(() => { toast.querySelector('.vot-undo-btn').click(); });
    expect(ReadingPlanStore.all().map((r) => [r.id, r.name, r.status])).toEqual([[run.id, 'Two short books', 'running']]);
    expect(ReadingPlanStore.get(run.id).ticks).toEqual(run.ticks);
    // nothing changed
    const before = JSON.stringify(ReadingPlanStore.all());
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change what’s in it' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); });
    expect(JSON.stringify(ReadingPlanStore.all())).toBe(before);
    expect(document.querySelector('#vot-toast-plan-manage.show')).toBeNull();
  });

  it('a catalog plan has no Change what is in it (Start over instead)', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    expect(screen.queryByRole('button', { name: 'Change what\u2019s in it' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeTruthy();
  });
});

describe('Reading plans: Manage on every plan surface a reader meets (0430, second blind test)', () => {
  const dialog = () => screen.queryByRole('dialog', { name: 'Manage plan' });
  const toSchedule = () => { openRow(); fireEvent.click(screen.getAllByRole('button', { name: 'Whole schedule' })[0]); };

  it("a paused plan's row has 'Manage ›' as a running one does; it opens the plan on Manage, Resume first", () => {
    ReadingPlanStore.put(pauseRun(startCatalogPlan('psalms', null, new Date()), new Date()));
    render(<PlansHub {...base()} />);
    const li = document.querySelector('.plan-run-li');
    expect(li.querySelector('.plan-chev')).toBeNull();
    expect(li.querySelector('.plan-manage-link').textContent).toBe('Manage ›');
    fireEvent.click(screen.getByRole('button', { name: 'Manage Psalms' }));
    expect(barTitle()).toBe('Psalms');
    expect(dialog()).toBeTruthy();
    expect(dialog().querySelector('.plan-sheet-actions .ui-btn').textContent).toBe('Resume plan');
  });

  it("the schedule's bar has the plan page's Manage: the same sheet over the schedule; Done and Back keep the way back", () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<PlansHub {...base()} />);
    toSchedule();
    expect(barTitle()).toBe('Bible in a Year · Schedule');
    const btn = screen.getByRole('button', { name: 'Manage plan' });
    expect(btn.textContent).toBe('Manage');
    fireEvent.click(btn);
    expect(dialog()).toBeTruthy();
    expect(dialog().id).toBe('plan-settings');
    expect(barTitle()).toBe('Bible in a Year · Schedule');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(dialog()).toBeNull();
    expect(barTitle()).toBe('Bible in a Year · Schedule');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(barTitle()).toBe('Bible in a Year');
    expect(dialog()).toBeNull();
  });

  it("from the schedule's sheet: Pause stays on the schedule; Stop goes to the list with Undo, the plan in Past plans", () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<PlansHub {...base()} />);
    toSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause plan' })); });
    expect(runStatus(runs()[0], new Date()).paused).toBe(true);
    expect(barTitle()).toBe('Bible in a Year · Schedule');
    expect(screen.getByRole('button', { name: 'Resume plan' })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop plan' })); });
    expect(runs().length).toBe(0);
    expect(ReadingPlanStore.all()[0].status).toBe('stopped');
    expect(barTitle()).toBe('Reading plans');
    expect(dialog()).toBeNull();
  });

  it("Start over from the schedule's sheet opens the new run's page, and Back goes to the list, never the old run", () => {
    const run = markDay(startCatalogPlan('bible-year', null, daysAgo(3)), 0, true, daysAgo(3));
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    toSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start over' })); });
    expect(runs().length).toBe(1);
    expect(runs()[0].id).not.toBe(run.id);
    expect(barTitle()).toBe('Bible in a Year');
    expect(dialog()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(barTitle()).toBe('Reading plans');
  });

  it("a preview's schedule has nothing to manage: no Manage in its bar", () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis to Revelation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Whole schedule' }));
    // (jsdom has no Volumes, so the draft's schedule body is empty; the view is the preview's schedule all the same)
    expect(screen.queryByRole('button', { name: 'Manage plan' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Manage plan' })).toBeNull();
  });
});

describe("Reading plans: Manage's 'Count only this plan's reading' (0450)", () => {
  /** Bible in a Year from 10 days ago, the first 30 chapters counted from before it began, the first day read since. */
  const creditedRun = () => {
    let run = startCatalogPlan('bible-year', null, daysAgo(10));
    const first30 = new Set(run.tracks[0].items.slice(0, 30).map((it) => it.k));
    run = creditRead(run, (b, c) => first30.has(b + ':' + c));
    for (const it of run.tracks[0].items.slice(30, 33)) run = tickItem(run, it.k, todayKey(daysAgo(1)), 1);
    return run;
  };

  it('says what the tap does before it; the tap starts again from today with the dated reading; Undo puts the stored run back exactly', () => {
    const run = creditedRun();
    ReadingPlanStore.put(run);
    const stored = JSON.stringify(ReadingPlanStore.get(run.id));
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Bible in a Year' }));
    const sheet = screen.getByRole('dialog', { name: 'Manage plan' });
    expect(sheet.querySelector('.plan-own-only-text').textContent).toBe('30 chapters you had read before this plan began count toward it.');
    expect(sheet.textContent).toMatch(/Starts the plan again from today\. What you read for it stays ticked; you give up the days the earlier reading put you ahead\./);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Count only this plan’s reading' })); });
    expect(runs().length).toBe(1);
    const fresh = runs()[0];
    expect(fresh.id).not.toBe(run.id);
    expect([fresh.start, fresh.credited, Object.keys(fresh.ticks).length]).toEqual([todayKey(new Date()), undefined, 3]);
    expect(ReadingPlanStore.get(run.id).status).toBe('stopped');
    expect(barTitle()).toBe('Bible in a Year');
    expect(screen.queryByRole('dialog', { name: 'Manage plan' })).toBeNull();
    const toast = document.getElementById('vot-toast-plan-manage');
    expect(toast.textContent).toMatch(/^Started again from today/);
    act(() => { toast.querySelector('.vot-undo-btn').click(); });
    expect(ReadingPlanStore.get(fresh.id)).toBeFalsy();
    expect(JSON.stringify(ReadingPlanStore.get(run.id))).toBe(stored);
    expect(runs().map((r) => r.id)).toEqual([run.id]);
  });

  it('from the schedule: the new run opens on its page and Back goes to the list', () => {
    ReadingPlanStore.put(creditedRun());
    render(<PlansHub {...base()} />);
    openRow();
    fireEvent.click(screen.getAllByRole('button', { name: 'Whole schedule' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Manage plan' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Count only this plan’s reading' })); });
    expect(barTitle()).toBe('Bible in a Year');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(barTitle()).toBe('Reading plans');
  });

  it('no row for a plan that counts nothing from before, nor for an rp1 plan', () => {
    const credited = creditedRun();
    ReadingPlanStore.put({ ...startCatalogPlan('psalms', null, daysAgo(2)), id: 'p_plain' });
    ReadingPlanStore.put({ ...credited, id: 'p_rp1', from: 'rp1' });
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Psalms' }));
    expect(screen.getByRole('dialog', { name: 'Manage plan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Count only this plan’s reading' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage Bible in a Year' }));
    expect(screen.getByRole('dialog', { name: 'Manage plan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Count only this plan’s reading' })).toBeNull();
  });
});
