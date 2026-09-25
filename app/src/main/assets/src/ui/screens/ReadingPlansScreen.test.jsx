// @ts-nocheck - ScreenLayout / LibraryNav are free globals, as the other personal-study screens
/* ReadingPlansScreen (rp1): start, follow and stop a plan, built to the round-2
   mockup (lanes/myweb/out/mockups/rp1/r2-plans.png). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';

const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  globalThis.ConfirmStrip = ({ question, onConfirm, onCancel }) => (
    <div><span>{question}</span><button type="button" onClick={onConfirm}>Yes</button><button type="button" onClick={onCancel}>No</button></div>
  );
});
afterEach(cleanup);

const base = (o) => ({ readingPlans: [], isRead: () => false, markAsReadEnabled: true, onChangePlans: vi.fn(), onRead: vi.fn(), onBack: vi.fn(), ...o });

describe('ReadingPlansScreen', () => {
  it('offers both plans to start, and says the plans stay on this phone', () => {
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reading plans');
    expect(screen.getByText('Your plans stay on this phone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Bible in a Year' }));
    expect(p.onChangePlans).toHaveBeenCalledWith([{ id: 'bible-year', start: key(new Date()) }]);
  });

  it('starts the Volumes at the pace chosen', () => {
    const p = base();
    render(<ReadingPlansScreen {...p} />);
    fireEvent.click(screen.getByRole('radio', { name: '3 a day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start The Volumes in Order' }));
    expect(p.onChangePlans).toHaveBeenCalledWith([{ id: 'volumes', start: key(new Date()), pace: 3 }]);
  });

  it('a running plan shows its day and month, offers no Start, and catches up from the first day missed', () => {
    const p = base({ readingPlans: [{ id: 'bible-year', start: daysAgo(2) }] });
    render(<ReadingPlansScreen {...p} />);
    expect(screen.queryByRole('button', { name: 'Start Bible in a Year' })).toBeNull();
    const plan = screen.getByRole('region', { name: 'Bible in a Year' });
    expect(within(plan).getByText('Day 3 of 365 · 0 %')).toBeTruthy();
    expect(plan.querySelectorAll('.plans-day[data-state="missed"]').length).toBeGreaterThanOrEqual(1);
    expect(plan.querySelector('.plans-day[data-state="today"]')).not.toBeNull();
    fireEvent.click(within(plan).getByRole('button', { name: 'Catch up' }));
    expect(p.onRead).toHaveBeenCalledWith({ bid: 'genesis', cid: 1 });
  });

  it('stops a plan only after asking', () => {
    const p = base({ readingPlans: [{ id: 'bible-year', start: daysAgo(0) }] });
    render(<ReadingPlansScreen {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop Bible in a Year' }));
    expect(p.onChangePlans).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(p.onChangePlans).toHaveBeenCalledWith([]);
  });

  it('never scores the reader', () => {
    const { container } = render(<ReadingPlansScreen {...base({ readingPlans: [{ id: 'bible-year', start: daysAgo(4) }] })} />);
    expect(container.textContent).not.toMatch(/streak/i);
  });
});
