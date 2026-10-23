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
  globalThis.ConfirmStrip = ({ question, onConfirm, onCancel }) => (
    <div><span>{question}</span><button type="button" onClick={onConfirm}>Yes</button><button type="button" onClick={onCancel}>No</button></div>
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
    act(() => { fireEvent.click(within(plan).getByRole('button', { name: 'Catch me up' })); });
    expect(within(screen.getByRole('region', { name: 'Bible in a Year' })).queryByText(/days? behind/)).toBeNull();
  });

  it('stops a plan only after asking; the run is kept, stopped', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<ReadingPlansScreen {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Bible in a Year' }));
    expect(runs().length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
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

  it('never scores the reader', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, daysAgo(4)));
    const { container } = render(<ReadingPlansScreen {...base()} />);
    expect(container.textContent).not.toMatch(/streak/i);
  });
});
