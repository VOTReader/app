// @ts-nocheck
/* TodayCard (rp1): the reader's plans for today on Home, built to the round-2
   mockups (lanes/myweb/out/mockups/rp1/r2-home-one.png, r2-home-two.png). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { TodayCard, useNow } from './TodayCard.jsx';

afterEach(cleanup);

const row = (o) => ({ id: 'bible-year', name: 'Bible in a Year', loading: false, label: 'Genesis 47-50', done: false,
  day: 46, totalDays: 365, behind: 0, finished: false, next: { bid: 'genesis', cid: 47 }, again: null,
  listen: [{ bid: 'genesis', cid: 47 }, { bid: 'genesis', cid: 48 }], todayTicked: 0, todayCount: 4, minutes: 13, tomorrow: '', ...o });

describe('TodayCard', () => {
  it('shows nothing without a plan', () => {
    const { container } = render(<TodayCard rows={[]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('one plan: the day, the portion, "plan · 2 of 4 · about 13 min", Read, and Listen to today’s portion (mw18 r2-home-states)', () => {
    const onRead = vi.fn(), onListen = vi.fn();
    render(<TodayCard rows={[row({ todayTicked: 2, listen: [{ bid: 'genesis', cid: 49 }, { bid: 'genesis', cid: 50 }], next: { bid: 'genesis', cid: 49 } })]}
      onRead={onRead} onListen={onListen} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByText('Today · Day 47 of 365')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Genesis 47-50' })).toBeTruthy();
    expect(screen.getByText('Bible in a Year · 2 of 4 · about 13 min')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);   // C10: no percentage rounded down
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 47-50' }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 49 }, 'bible-year');
    fireEvent.click(screen.getByRole('button', { name: 'Listen to Genesis 47-50' }));
    expect(onListen).toHaveBeenCalledWith([{ bid: 'genesis', cid: 49 }, { bid: 'genesis', cid: 50 }], 'bible-year');
  });

  it('a day read through: Done today, tomorrow’s portion, Read ahead and Read again (C2)', () => {
    const onRead = vi.fn();
    render(<TodayCard rows={[row({ done: true, label: 'Genesis 47-50', tomorrow: 'Exodus 1-4', next: { bid: 'exodus', cid: 1 }, again: { bid: 'genesis', cid: 47 } })]}
      onRead={onRead} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByRole('heading', { name: 'Done today' })).toBeTruthy();
    expect(screen.getByText('Tomorrow: Exodus 1-4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read ahead' }));
    expect(onRead).toHaveBeenLastCalledWith({ bid: 'exodus', cid: 1 }, 'bible-year');
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }));
    expect(onRead).toHaveBeenLastCalledWith({ bid: 'genesis', cid: 47 }, 'bible-year');
    expect(screen.queryByRole('button', { name: /Listen/ })).toBeNull();
  });

  it('two plans: a row each with its check and day, and one Listen to today for the first not done (r2-home-two)', () => {
    const onRead = vi.fn(), onListen = vi.fn();
    const rows = [row({ done: true, tomorrow: 'Exodus 1-4' }), row({ id: 'volumes', name: 'The Volumes in Order', label: 'Volume Two, Letters 14-15', day: 11, next: { bid: 'volume-two', cid: 'x' }, listen: [{ bid: 'volume-two', cid: 'x' }] })];
    render(<TodayCard rows={rows} onRead={onRead} onListen={onListen} onOpenPlans={vi.fn()} markAsReadEnabled />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.today-check').getAttribute('data-done')).toBe('1');
    expect(items[1].querySelector('.today-check').getAttribute('data-done')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /Read Volume Two, Letters 14-15/ }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'volume-two', cid: 'x' }, 'volumes');
    fireEvent.click(screen.getByRole('button', { name: 'Listen to today' }));
    expect(onListen).toHaveBeenCalledWith([{ bid: 'volume-two', cid: 'x' }], 'volumes');
    expect(screen.getByText('The Volumes in Order · Day 12')).toBeTruthy();
    expect(screen.getByText('Done · Tomorrow: Exodus 1-4')).toBeTruthy();
  });

  it('never scores: a day behind is a quiet line to the Plans screen, and there is no streak', () => {
    const onOpenPlans = vi.fn();
    const { container } = render(<TodayCard rows={[row({ behind: 2 })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={onOpenPlans} markAsReadEnabled />);
    expect(container.textContent).not.toMatch(/streak/i);
    fireEvent.click(screen.getByRole('button', { name: '2 days to catch up' }));
    expect(onOpenPlans).toHaveBeenCalled();
  });

  it('says why nothing ticks when Mark as read is off, with a button that turns it on (C12)', () => {
    const on = vi.fn();
    render(<TodayCard rows={[row()]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled={false} onEnableMarkAsRead={on} />);
    expect(screen.getByText(/Mark as read is off/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn it on' }));
    expect(on).toHaveBeenCalled();
  });

  it('a Volumes plan waiting for the letters to load says so', () => {
    render(<TodayCard rows={[row({ id: 'volumes', name: 'The Volumes in Order', loading: true, label: '', next: null })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByText('Loading the Volumes…')).toBeTruthy();
  });
});

// Sweep low (mw9): the date was read again only on a return to the front, so a Home screen left open
// across midnight kept yesterday's portion, day number and 'behind' count.
describe('useNow', () => {
  function NowProbe() { return <span data-testid="now">{useNow().getDate()}</span>; }

  it('turns over at local midnight while the app stays open, and drops its timer on unmount', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 13, 23, 59, 30), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const { unmount } = render(<NowProbe />);
      expect(screen.getByTestId('now').textContent).toBe('13');
      act(() => { vi.advanceTimersByTime(29_000); });
      expect(screen.getByTestId('now').textContent).toBe('13');
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(screen.getByTestId('now').textContent).toBe('14');
      // ... and again the next night.
      act(() => { vi.advanceTimersByTime(24 * 3600_000); });
      expect(screen.getByTestId('now').textContent).toBe('15');
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
