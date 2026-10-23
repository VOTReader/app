// @ts-nocheck
/* PlanRibbon (mw18 S8): at the end of a chapter that is part of today's portion, "Bible in a Year · Today 1 of 3 ·
   Next: Genesis 2 ›"; nothing for a chapter outside today; × hides it for the day. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { PlanRibbon } from './PlanRibbon.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { tickItem, todayKey } from '../../data/plan-engine.js';

beforeEach(() => {
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
  globalThis.__votOpenPlanItem = vi.fn();
});
afterEach(() => { cleanup(); delete globalThis.ReadingPlanStore; delete globalThis.__votOpenPlanItem; });

describe('PlanRibbon', () => {
  it('says where today stands and opens the next item not read', () => {
    ReadingPlanStore.put(tickItem(startCatalogPlan('bible-year', null, new Date()), 'genesis:1', todayKey(new Date()), 1));
    render(<PlanRibbon bid="genesis" cid={1} />);
    expect(screen.getByText('Bible in a Year · Today 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Genesis 2 ›' }));
    expect(globalThis.__votOpenPlanItem).toHaveBeenCalledWith({ bid: 'genesis', cid: 2 });
  });

  it('shows nothing for a chapter outside today, or with no plan', () => {
    const { container } = render(<PlanRibbon bid="exodus" cid={1} />);
    expect(container.firstChild).toBeNull();
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    expect(render(<PlanRibbon bid="exodus" cid={1} />).container.firstChild).toBeNull();
  });

  it('× hides it for the rest of the day', () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    render(<PlanRibbon bid="genesis" cid={2} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Hide the plan line for today' })); });
    expect(screen.queryByRole('complementary', { name: 'Reading plan' })).toBeNull();
    expect(localStorage.getItem('vot-plan-ribbon-hidden')).toBe(todayKey(new Date()));
  });
});
