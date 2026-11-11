// @ts-nocheck
/* TodayCard (rp1): Home's up-next card, slim rows to the layout mock read.png (2026-11-10). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { TodayCard, useNow } from './TodayCard.jsx';

afterEach(cleanup);

const row = (o) => ({ id: 'bible-year', name: 'Bible in a Year', loading: false, label: 'Genesis 47-50', done: false,
  day: 46, totalDays: 365, behind: 0, finished: false, next: { bid: 'genesis', cid: 47 }, again: null,
  listen: [{ bid: 'genesis', cid: 47 }, { bid: 'genesis', cid: 48 }], todayTicked: 0, todayCount: 4, minutes: 13, tomorrow: '', ...o });

describe('TodayCard (the up-next card)', () => {
  it('shows nothing with no plan, no offer and no Continue row', () => {
    const { container } = render(<TodayCard rows={[]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('one plan: one slim row, "Today · Day 47 of 365", the portion, Read, and a Listen pill for today’s portion', () => {
    const onRead = vi.fn(), onListen = vi.fn();
    const { container } = render(<TodayCard rows={[row({ todayTicked: 2, listen: [{ bid: 'genesis', cid: 49 }, { bid: 'genesis', cid: 50 }], next: { bid: 'genesis', cid: 49 } })]}
      onRead={onRead} onListen={onListen} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(container.querySelectorAll('.upnext-row')).toHaveLength(1);
    expect(screen.getByText('Today · Day 47 of 365')).toBeTruthy();
    expect(screen.getByText('Genesis 47-50')).toBeTruthy();
    expect(container.textContent).not.toMatch(/%|Plans/);   // C10: no percentage; plans live in the Library
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 47-50' }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 49 }, 'bible-year');
    const listen = screen.getByRole('button', { name: 'Listen to Genesis 47-50' });
    expect(listen.className).toBe('upnext-pill');
    fireEvent.click(listen);
    expect(onListen).toHaveBeenCalledWith([{ bid: 'genesis', cid: 49 }, { bid: 'genesis', cid: 50 }], 'bible-year');
  });

  it('a day read through is one row: "Today’s reading is done" and Read ahead, no pills', () => {
    const onRead = vi.fn();
    const { container } = render(<TodayCard rows={[row({ done: true, tomorrow: 'Exodus 1-4', next: { bid: 'exodus', cid: 1 }, again: { bid: 'genesis', cid: 47 } })]}
      onRead={onRead} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(container.querySelectorAll('.upnext-row')).toHaveLength(1);
    expect(screen.getByText('Today’s reading is done')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read ahead' }));
    expect(onRead).toHaveBeenLastCalledWith({ bid: 'exodus', cid: 1 }, 'bible-year');
    expect(screen.queryByRole('button', { name: /Listen|^Read Genesis/ })).toBeNull();
  });

  it('two plans: a row each, named by plan and day; a third waits on the Reading plans screen', () => {
    const onRead = vi.fn();
    const rows = [row(), row({ id: 'volumes', name: 'The Volumes in Order', label: 'Volume Two, Letters 14-15', day: 11, totalDays: 120, next: { bid: 'volume-two', cid: 'x' }, listen: [{ bid: 'volume-two', cid: 'x' }] }),
      row({ id: 'third', name: 'Third', label: 'Psalm 1' })];
    const { container } = render(<TodayCard rows={rows} onRead={onRead} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(container.querySelectorAll('[data-plan]')).toHaveLength(2);
    expect(screen.getByText('Bible in a Year · Day 47 of 365')).toBeTruthy();
    expect(screen.getByText('The Volumes in Order · Day 12 of 120')).toBeTruthy();
    expect(screen.queryByText('Psalm 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read Volume Two, Letters 14-15' }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'volume-two', cid: 'x' }, 'volumes');
  });

  it('never scores: behind is a small second line to the Plans screen, and there is no streak', () => {
    const onOpenPlans = vi.fn();
    const { container } = render(<TodayCard rows={[row({ behind: 3 })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={onOpenPlans} markAsReadEnabled />);
    expect(container.textContent).not.toMatch(/streak/i);
    expect(container.querySelectorAll('.upnext-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '3 days to catch up' }));
    expect(onOpenPlans).toHaveBeenCalled();
  });

  it('Mark as read off: a small line that turns it on (C12)', () => {
    const on = vi.fn();
    render(<TodayCard rows={[row({ behind: 2 })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled={false} onEnableMarkAsRead={on} />);
    expect(screen.queryByRole('button', { name: /to catch up/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on Mark as read to track this' }));
    expect(on).toHaveBeenCalled();
  });

  it('with no plan, offers one in one row: "Start a reading plan ›" opens the plans, × (Not now) hides it (C8)', () => {
    const onOpenPlans = vi.fn(), onHideOffer = vi.fn();
    const { container } = render(<TodayCard rows={[]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={onOpenPlans} offerStart onHideOffer={onHideOffer} />);
    expect(container.querySelectorAll('.upnext-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Start a reading plan/ }));
    expect(onOpenPlans).toHaveBeenCalled();
    const x = screen.getByRole('button', { name: 'Not now' });
    expect(x.textContent).toBe('×');
    fireEvent.click(x);
    expect(onHideOffer).toHaveBeenCalled();
  });

  it('Continue (the children) is the card’s last row, and holds the card up alone', () => {
    const cont = <button type="button" className="upnext-row upnext-go">Continue</button>;
    const { container } = render(<TodayCard rows={[row()]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled>{cont}</TodayCard>);
    const rowsNow = container.querySelectorAll('.upnext-row');
    expect(rowsNow).toHaveLength(2);
    expect(rowsNow[1].textContent).toBe('Continue');
    cleanup();
    const alone = render(<TodayCard rows={[]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()}>{cont}</TodayCard>);
    expect(alone.container.querySelectorAll('.upnext-row')).toHaveLength(1);
  });

  it('a Volumes plan waiting for the letters to load says so, with nothing to press yet', () => {
    render(<TodayCard rows={[row({ id: 'volumes', name: 'The Volumes in Order', loading: true, label: '', next: null })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByText('Loading the Volumes…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
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
