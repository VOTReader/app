// @ts-nocheck
/* TodayCard (rp1): the reader's plans for today on Home, built to the round-2
   mockups (lanes/myweb/out/mockups/rp1/r2-home-one.png, r2-home-two.png). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { TodayCard } from './TodayCard.jsx';

afterEach(cleanup);

const row = (o) => ({ id: 'bible-year', name: 'Bible in a Year', loading: false, label: 'Genesis 47-50', done: false,
  day: 46, totalDays: 365, percent: 13, behind: 0, finished: false, next: { bid: 'genesis', cid: 47 }, catchUpDay: -1, ...o });

describe('TodayCard', () => {
  it('shows nothing without a plan', () => {
    const { container } = render(<TodayCard rows={[]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('one plan: the day, the portion, the plan, Read and Listen, and the progress (r2-home-one)', () => {
    const onRead = vi.fn(), onListen = vi.fn();
    render(<TodayCard rows={[row()]} onRead={onRead} onListen={onListen} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByText('Today · Day 47 of 365')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Genesis 47-50' })).toBeTruthy();
    expect(screen.getByText('Bible in a Year')).toBeTruthy();
    expect(screen.getByText('13 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read Genesis 47-50' }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 47 }, 'bible-year');
    fireEvent.click(screen.getByRole('button', { name: 'Listen to Genesis 47-50' }));
    expect(onListen).toHaveBeenCalledWith({ bid: 'genesis', cid: 47 }, 'bible-year');
  });

  it('two plans: a row each with its check, and one Listen to today for the first not done (r2-home-two)', () => {
    const onRead = vi.fn(), onListen = vi.fn();
    const rows = [row({ done: true }), row({ id: 'volumes', name: 'The Volumes in Order', label: 'Volume Two, Letters 14-15', next: { bid: 'volume-two', cid: 'x' } })];
    render(<TodayCard rows={rows} onRead={onRead} onListen={onListen} onOpenPlans={vi.fn()} markAsReadEnabled />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.today-check').getAttribute('data-done')).toBe('1');
    expect(items[1].querySelector('.today-check').getAttribute('data-done')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /Read Volume Two, Letters 14-15/ }));
    expect(onRead).toHaveBeenCalledWith({ bid: 'volume-two', cid: 'x' }, 'volumes');
    fireEvent.click(screen.getByRole('button', { name: 'Listen to today' }));
    expect(onListen).toHaveBeenCalledWith({ bid: 'volume-two', cid: 'x' }, 'volumes');
  });

  it('never scores: a day behind is a quiet line to the Plans screen, and there is no streak', () => {
    const onOpenPlans = vi.fn();
    const { container } = render(<TodayCard rows={[row({ behind: 2 })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={onOpenPlans} markAsReadEnabled />);
    expect(container.textContent).not.toMatch(/streak/i);
    fireEvent.click(screen.getByRole('button', { name: '2 days to catch up' }));
    expect(onOpenPlans).toHaveBeenCalled();
  });

  it('says why nothing ticks when Mark as read is off', () => {
    render(<TodayCard rows={[row()]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled={false} />);
    expect(screen.getByText(/Mark as read is off/)).toBeTruthy();
  });

  it('a Volumes plan waiting for the letters to load says so', () => {
    render(<TodayCard rows={[row({ id: 'volumes', name: 'The Volumes in Order', loading: true, label: '', next: null })]} onRead={vi.fn()} onListen={vi.fn()} onOpenPlans={vi.fn()} markAsReadEnabled />);
    expect(screen.getByText('Loading the Volumes…')).toBeTruthy();
  });
});
