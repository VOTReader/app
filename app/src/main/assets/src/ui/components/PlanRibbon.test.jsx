// @ts-nocheck
/* PlanRibbon and the reading session (plans2 3.5, 3.6). Outside a session a plan item ends with one quiet line,
   "Counts for Bible in a Year · Day 1 · 1 of 3" and Next. Inside a session: the strip, and at the end of each item a
   panel; reaching it counts the item as read through the read record, Not read yet takes that back, Next moves in
   place, FINISH DAY shows Day done once, and DONE goes back to where the session began. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { PlanRibbon, PlanSessionStrip } from './PlanRibbon.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { tickItem, todayKey, pauseRun } from '../../data/plan-engine.js';
import { beginPlanSession, setPlanSessionHost, planSession, _resetPlanSessionForTests } from '../../utils/plan-session.js';

let read;
let host;
beforeEach(() => {
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
  globalThis.__votOpenPlanItem = vi.fn();
  _resetPlanSessionForTests();
  read = new Set();
  host = {
    // the read record ticks the plans that hold the read, as useMarkAsRead's markRead does
    markRead: vi.fn((bid, cid) => { read.add(bid + ':' + cid); ReadingPlanStore.noteRead(bid, cid); }),
    unmarkRead: vi.fn((bid, cid) => { read.delete(bid + ':' + cid); }),
    isRead: (bid, cid) => read.has(bid + ':' + cid),
    move: vi.fn(), back: vi.fn(), openPlans: vi.fn(), openNote: vi.fn(),
  };
  setPlanSessionHost(host);
});
afterEach(() => { cleanup(); delete globalThis.ReadingPlanStore; delete globalThis.__votOpenPlanItem; _resetPlanSessionForTests(); });

const start = () => {
  const run = startCatalogPlan('bible-year', null, new Date());
  ReadingPlanStore.put(run);
  act(() => { beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' }); });
  return run;
};
const ticks = (id) => ReadingPlanStore.get(id).ticks;

describe('PlanRibbon outside a session', () => {
  it('one line: what it counts for, and Next opens the next item not read', () => {
    ReadingPlanStore.put(tickItem(startCatalogPlan('bible-year', null, new Date()), 'genesis:1', todayKey(new Date()), 1));
    render(<PlanRibbon bid="genesis" cid={1} />);
    expect(screen.getByText('Counts for Bible in a Year · Day 1 · 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(globalThis.__votOpenPlanItem).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
  });

  it('nothing for a chapter outside today, with no plan, or for a paused plan', () => {
    expect(render(<PlanRibbon bid="exodus" cid={1} />).container.firstChild).toBeNull();
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    expect(render(<PlanRibbon bid="exodus" cid={1} />).container.firstChild).toBeNull();
    ReadingPlanStore.put(pauseRun(ReadingPlanStore.active()[0], new Date()));
    expect(render(<PlanRibbon bid="genesis" cid={1} />).container.firstChild).toBeNull();
  });
});

describe('the reading session', () => {
  it('the strip names the plan and the day, where the reader is, and the minutes left', () => {
    start();
    render(<PlanSessionStrip bid="genesis" cid={2} />);
    expect(screen.getByText('Bible in a Year · Day 1')).toBeTruthy();
    expect(screen.getByText(/^2 of 3 · \d+ min left$/)).toBeTruthy();
    cleanup();
    expect(render(<PlanSessionStrip bid="exodus" cid={1} />).container.firstChild).toBeNull();   // not part of it
  });

  it('reaching the end counts the item as read, through the read record; Not read yet takes it back', () => {
    const run = start();
    render(<PlanRibbon bid="genesis" cid={1} />);   // jsdom has no IntersectionObserver: shown = reached
    expect(host.markRead).toHaveBeenCalledWith('genesis', 1);
    expect('genesis:1' in ticks(run.id)).toBe(true);
    expect(screen.getByText(/Genesis 1 read/)).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Not read yet' })); });
    expect('genesis:1' in ticks(run.id)).toBe(false);
    expect(host.unmarkRead).toHaveBeenCalledWith('genesis', 1);
  });

  it('a read the reader had before is not taken back from the read record by Not read yet', () => {
    const run = start();
    read.add('genesis:1');
    render(<PlanRibbon bid="genesis" cid={1} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Not read yet' })); });
    expect('genesis:1' in ticks(run.id)).toBe(false);
    expect(host.unmarkRead).not.toHaveBeenCalled();
  });

  it('Next moves in place to the next item; the last one is FINISH DAY, then Day done and DONE goes back', () => {
    const run = start();
    const first = render(<PlanRibbon bid="genesis" cid={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next · Genesis 2 →' }));
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
    first.unmount();
    const second = render(<PlanRibbon bid="genesis" cid={2} />);
    expect(screen.getByText(/^Last one for today · about \d+ min$/)).toBeTruthy();
    second.unmount();
    render(<PlanRibbon bid="genesis" cid={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finish day 1' }));
    expect(screen.getByRole('dialog', { name: 'Day 1 done' })).toBeTruthy();
    expect(screen.getByText('Genesis 1-3 · Bible in a Year')).toBeTruthy();
    expect(screen.getByText('Genesis 4-7')).toBeTruthy();                  // tomorrow
    expect(Object.keys(ticks(run.id)).sort()).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Done' })); });
    expect(planSession()).toBeNull();
    expect(host.back).toHaveBeenCalled();
  });

  it('Stop for now ends the session and goes back', () => {
    start();
    render(<PlanRibbon bid="genesis" cid={1} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop for now' })); });
    expect(planSession()).toBeNull();
    expect(host.back).toHaveBeenCalled();
  });
});
