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
import { beginPlanSession, setPlanSessionHost, planSession, pausedPlanSession, notePlanSessionPlace, _resetPlanSessionForTests } from '../../utils/plan-session.js';

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
    move: vi.fn(), open: vi.fn(), back: vi.fn(), openPlans: vi.fn(), openNote: vi.fn(),
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

  it('Next moves in place to the next item; the last one is FINISH DAY, then Day done and DONE goes back', async () => {
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
    await new Promise((r) => setTimeout(r, 5));              // back once the overlay has gone
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

/* Corbin 11-19: "you should be able to tap a simple button and go back, although it should still be marked read for
   that day if you already read it all the way through"; reading plans as a "container" kept "clearly deliniated". */
describe('the plan as a container', () => {
  const tick = (run, k) => ReadingPlanStore.put(tickItem(ReadingPlanStore.get(run.id), k, todayKey(new Date()), 1));

  it("back keeps the tick: the strip's back goes to the previous reading and unticks nothing", () => {
    const run = start();
    tick(run, 'genesis:1');
    render(<PlanSessionStrip bid="genesis" cid={2} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Back to Genesis 1' })); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    expect('genesis:1' in ticks(run.id)).toBe(true);
    expect(planSession()).not.toBeNull();
  });

  it('on the first reading, back leaves the plan the way the reader came in', () => {
    start();
    render(<PlanSessionStrip bid="genesis" cid={1} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Leave the plan' })); });
    expect(host.back).toHaveBeenCalled();
    expect(host.move).not.toHaveBeenCalled();
    expect(planSession()).toBeNull();
    expect(pausedPlanSession()).toBeNull();
  });

  it("the phone's Back takes the same steps: the previous reading, then out of the plan", () => {
    const run = start();
    tick(run, 'genesis:1');
    const r = render(<PlanSessionStrip bid="genesis" cid={2} />);
    let used;
    act(() => { used = window.__screenBack(); });
    expect(used).toBe(true);
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    expect('genesis:1' in ticks(run.id)).toBe(true);
    r.unmount();
    expect(window.__screenBack == null).toBe(true);            // the strip's Back goes with it
    render(<PlanSessionStrip bid="genesis" cid={1} />);
    act(() => { used = window.__screenBack(); });
    expect(used).toBe(false);                                  // the ordinary Back runs: out to where the reader came from
    expect(planSession()).toBeNull();
  });

  it("a swipe peek draws the strip its page will have, and leaves the phone's Back to the live page", () => {
    start();
    const live = render(<PlanSessionStrip bid="genesis" cid={2} />);
    const fn = window.__screenBack;
    const peek = render(<PlanSessionStrip bid="genesis" cid={3} inert />);
    expect(peek.container.querySelector('.plan-strip').textContent).toContain('3 of 3');   // no strip-less page drags in
    expect(window.__screenBack).toBe(fn);                                                  // the peek takes no Back
    peek.unmount();
    expect(window.__screenBack).toBe(fn);
    let used;
    act(() => { used = window.__screenBack(); });
    expect(used).toBe(true);
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    live.unmount();
  });

  it('each segment is a button to that reading, and says whether it is read', () => {
    const run = start();
    tick(run, 'genesis:1');
    render(<PlanSessionStrip bid="genesis" cid={2} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Genesis 1, read' })); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Genesis 3' })); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 3 });
    expect(screen.getByRole('button', { name: 'Genesis 2, open now' })).toBeTruthy();
  });

  it('the close ends the sitting and goes back, as Stop for now does', () => {
    start();
    render(<PlanSessionStrip bid="genesis" cid={2} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop for now' })); });
    expect(planSession()).toBeNull();
    expect(pausedPlanSession()).toBeNull();
    expect(host.back).toHaveBeenCalled();
  });

  it("the title opens the day's readings with their ticks; a tap goes to that reading", () => {
    const run = start();
    tick(run, 'genesis:1');
    render(<PlanSessionStrip bid="genesis" cid={2} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year · Day 1: the day's readings$/ })); });
    expect(screen.getByRole('button', { name: 'Read Genesis 1, read' })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 3' })); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 3 });
    expect(planSession()).not.toBeNull();
  });

  it("inside a sitting the day sheet's button says what it does from here, never 'Read this day' (hub 21:32)", () => {
    const run = start();
    tick(run, 'genesis:1');
    const openSheet = () => act(() => { fireEvent.click(screen.getByRole('button', { name: /: the day's readings$/ })); });
    // on the first reading not read: the button only takes the reader back to it
    const a = render(<PlanSessionStrip bid="genesis" cid={2} />);
    openSheet();
    expect(screen.queryByRole('button', { name: 'Read this day' })).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Keep reading' })); });
    expect(host.move).not.toHaveBeenCalled();
    expect(document.getElementById('plan-day-sheet')).toBeNull();
    a.unmount();
    // past it: the button goes to the first reading not read, and says which
    render(<PlanSessionStrip bid="genesis" cid={3} />);
    openSheet();
    const next = screen.getByRole('button', { name: 'Next unread reading: Genesis 2' });
    expect(next.textContent).toBe('Next unread reading');
    act(() => { fireEvent.click(next); });
    expect(host.move).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
  });

  it("with the whole day read, the sheet's button stays on the page (it used to jump to the day's first reading)", () => {
    const run = start();
    for (const k of ['genesis:1', 'genesis:2', 'genesis:3']) tick(run, k);
    render(<PlanSessionStrip bid="genesis" cid={3} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /: the day's readings$/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Keep reading' })); });
    expect(host.move).not.toHaveBeenCalled();
  });

  it('paused: a page outside the day shows the way back in, and Resume opens the first reading not read', () => {
    const run = start();
    tick(run, 'genesis:1');
    vi.useFakeTimers();
    try {
      notePlanSessionPlace('genesis', 2);
      notePlanSessionPlace('nt', 5);
      vi.runAllTimers();
    } finally { vi.useRealTimers(); }
    expect(planSession()).toBeNull();
    render(<PlanSessionStrip bid="nt" cid={5} />);
    expect(screen.getByText('Bible in a Year · Day 1')).toBeTruthy();
    expect(screen.getByText('1 of 3 read')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Resume' })); });
    expect(planSession()).not.toBeNull();
    expect(host.open).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });   // opened as a new page: Back returns to this one
  });

  it("the paused line's close forgets the sitting and ticks nothing off", () => {
    const run = start();
    tick(run, 'genesis:1');
    vi.useFakeTimers();
    try { notePlanSessionPlace('genesis', 2); notePlanSessionPlace(null); vi.runAllTimers(); } finally { vi.useRealTimers(); }
    render(<PlanSessionStrip bid="nt" cid={5} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop for now' })); });
    expect(pausedPlanSession()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    expect(Object.keys(ticks(run.id))).toEqual(['genesis:1']);
  });

  it('a finished day opened again keeps every tick and ends on Done, not a second Day done', () => {
    const run = start();
    for (const k of ['genesis:1', 'genesis:2', 'genesis:3']) tick(run, k);
    act(() => { beginPlanSession({ runId: run.id, day: 0, name: 'Bible in a Year' }); });
    render(<PlanRibbon bid="genesis" cid={3} />);
    expect(screen.queryByRole('button', { name: 'Finish day 1' })).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Done' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(planSession()).toBeNull();
    expect(host.back).toHaveBeenCalled();
    expect(Object.keys(ticks(run.id)).sort()).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
  });
});
