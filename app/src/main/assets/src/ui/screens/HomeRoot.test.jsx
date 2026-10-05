// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HomeRoot — the gold pill under the title (rs1, overhaul).
   With a last place it reads "Continue reading" and goes there; on a fresh
   install (no place) it reads "Start reading": today's plan portion when a
   plan has one ready, otherwise Volume One, Letter 1 (after the Volumes load). */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { HomeRoot } from './HomeRoot.jsx';
import { ReadingDotContext } from '../components/ResumeReadingNavBtn.jsx';

// The Today rows are the plan engine's; each test sets the rows it needs.
let todayRows = [];
vi.mock('../components/TodayCard.jsx', () => ({ TodayCard: () => null, useTodayRows: () => todayRows }));

const GLOBALS =['ScreenLayout', 'LibraryNav', 'COL_BY_KEY', 'colLetterArr', 'BottomTabs'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.BottomTabs = { select: () => {} };
}

afterEach(() => {
  cleanup();
  todayRows = [];
  GLOBALS.forEach((k) => { delete globalThis[k]; });
  delete window.__loadVotCorpus;
});

const renderRoot = (props = {}, dot = {}) => {
  setupGlobals();
  return render(
    <ReadingDotContext.Provider value={dot}>
      <HomeRoot onSelect={() => {}} onSurprise={() => {}} showSurprise={false} onSearch={() => {}}
        translation="kjv" readingPlans={undefined} isRead={() => false} markAsReadEnabled onPlanRead={() => {}}
        {...props} />
    </ReadingDotContext.Provider>,
  );
};

describe('HomeRoot — Continue / Start reading pill', () => {
  it('reads "Continue reading" and goes to the last place when there is one', () => {
    const onGo = vi.fn();
    renderRoot({}, { hasPlace: true, onGo });
    expect(screen.queryByText('Start reading')).toBeNull();
    fireEvent.click(screen.getByText('Continue reading'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('reads "Start reading" with no last place and opens Volume One, Letter 1 once the Volumes load', async () => {
    const onPlanRead = vi.fn();
    const col = { volKey: 'one', readKey: 'volume-one' };
    window.__loadVotCorpus = vi.fn(async () => {
      globalThis.COL_BY_KEY = new Map([['one', col]]);
      globalThis.colLetterArr = (c) => (c === col ? [{ id: 'v1-l1' }, { id: 'v1-l2' }] : []);
    });
    renderRoot({ onPlanRead }, { hasPlace: false });
    expect(screen.queryByText('Continue reading')).toBeNull();
    fireEvent.click(screen.getByText('Start reading'));
    await waitFor(() => expect(onPlanRead).toHaveBeenCalledWith({ bid: 'volume-one', cid: 'v1-l1' }));
    expect(window.__loadVotCorpus).toHaveBeenCalledTimes(1);
  });

  it("opens today's plan portion when a plan has one (the first not yet done), without loading the Volumes", () => {
    const onPlanRead = vi.fn();
    window.__loadVotCorpus = vi.fn(async () => {});
    todayRows = [
      { id: 'bible-year', loading: false, done: true, next: { bid: 'genesis', cid: 47 } },
      { id: 'volumes', loading: false, done: false, next: { bid: 'volume-two', cid: 'x' } },
    ];
    renderRoot({ onPlanRead });
    fireEvent.click(screen.getByText('Start reading'));
    expect(onPlanRead).toHaveBeenCalledWith({ bid: 'volume-two', cid: 'x' });
    expect(window.__loadVotCorpus).not.toHaveBeenCalled();
  });

  it('falls back to the Volume One index when the letters cannot be read', async () => {
    const onSelect = vi.fn();
    const onPlanRead = vi.fn();
    window.__loadVotCorpus = vi.fn(async () => {});
    renderRoot({ onSelect, onPlanRead });
    fireEvent.click(screen.getByText('Start reading'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('volume-one'));
    expect(onPlanRead).not.toHaveBeenCalled();
  });

  it('says so when the Volumes fail to load', async () => {
    window.__loadVotCorpus = vi.fn(async () => { throw new Error('offline'); });
    renderRoot();
    fireEvent.click(screen.getByText('Start reading'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Could not open Volume One/));
  });

  it('shows no pill when there is no place and nothing to open it with', () => {
    renderRoot({ onPlanRead: undefined });
    expect(screen.queryByText('Start reading')).toBeNull();
    expect(screen.queryByText('Continue reading')).toBeNull();
  });
});
