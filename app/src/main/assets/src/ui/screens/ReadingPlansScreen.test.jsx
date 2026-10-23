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
      ['The Letters', ['The Seven Volumes', 'Letters in a Year', 'Every letter, in order', 'One collection']],
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

  it('never scores the reader', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, daysAgo(4)));
    const { container } = render(<ReadingPlansScreen {...base()} />);
    expect(container.textContent).not.toMatch(/streak/i);
  });
});
