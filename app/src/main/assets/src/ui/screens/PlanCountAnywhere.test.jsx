// @ts-nocheck - ScreenLayout / LibraryNav / ConfirmStrip are free globals, as in ReadingPlansScreen.test.jsx
/* plan-own (Corbin 11-26 18:20): the plan's "Count reading from anywhere" switch on the start sheet and in Manage plan,
   and the "In Bible in a Year · Count it" line for a plan item finished from elsewhere. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { PlansHub } from './PlansHub.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { tickItem, todayKey } from '../../data/plan-engine.js';
import { usePlanCountOffer, COUNT_TOAST } from '../../utils/plan-runs-view.js';
import { setPlanSessionHost, _resetPlanSessionForTests } from '../../utils/plan-session.js';
import { _resetPlanNavForTests } from '../../utils/plan-nav.js';
import { _resetToasts } from '../../utils/toast.js';

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ onBack, leftExtras, rightExtras }) => <div><button type="button" onClick={onBack}>Back</button>{leftExtras}{rightExtras}</div>;
  globalThis.ConfirmStrip = ({ question, yesLabel, onConfirm, onCancel }) => (
    <div><span>{question}</span><button type="button" onClick={onConfirm}>{yesLabel || 'Yes'}</button><button type="button" onClick={onCancel}>No</button></div>
  );
  localStorage.clear();
  _resetPlanNavForTests();
  _resetToasts();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  ReadingPlanStore.setSitting(null);
  globalThis.ReadingPlanStore = ReadingPlanStore;
  _resetPlanSessionForTests();
});
afterEach(() => { cleanup(); _resetPlanSessionForTests(); _resetToasts(); delete globalThis.ReadingPlanStore; });

const base = (o) => ({ readingPlans: [], isRead: () => false, onPlansMoved: vi.fn(), onStartSession: vi.fn(), onBack: vi.fn(), ...o });
const sw = () => screen.getByRole('switch', { name: 'Count reading from anywhere' });

describe('the start sheet: Count reading from anywhere', () => {
  it('a new plan starts with it off, and says what that means; started so, the run counts only its own reading', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Only what you open from this plan counts.')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start plan' })); });
    expect(ReadingPlanStore.active()[0].countAnywhere).toBe(false);
  });

  it('turned on before Start, the run counts reading from anywhere', () => {
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Bible in a Year: Genesis/ }));
    fireEvent.click(sw());
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Its readings count wherever you read them.')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start plan' })); });
    expect(ReadingPlanStore.active()[0].countAnywhere).toBe(true);
  });
});

describe('Manage plan: Count reading from anywhere', () => {
  it('a plan from before the switch shows it on; turning it off saves false and unticks nothing', () => {
    let run = startCatalogPlan('bible-year', null, new Date());
    run = tickItem(run, run.tracks[0].items[0].k, todayKey(new Date()), 1);
    ReadingPlanStore.put(run);
    render(<PlansHub {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Bible in a Year' }));
    expect(sw().getAttribute('aria-checked')).toBe('true');
    act(() => { fireEvent.click(sw()); });
    const saved = ReadingPlanStore.get(run.id);
    expect(saved.countAnywhere).toBe(false);
    expect(saved.ticks).toEqual(run.ticks);
    expect(sw().getAttribute('aria-checked')).toBe('false');
    act(() => { fireEvent.click(sw()); });
    expect(ReadingPlanStore.get(run.id).countAnywhere).toBe(true);
  });
});

describe('the Count it line', () => {
  function App() { usePlanCountOffer(); return null; }

  it('a plan item finished elsewhere shows "In Bible in a Year" with Count it; the tap ticks the plan and writes the read record', () => {
    const run = { ...startCatalogPlan('bible-year', null, new Date()), countAnywhere: false };
    ReadingPlanStore.put(run);
    const host = { move() {}, open() {}, back() {}, openPlans() {}, openNote() {}, unmarkRead() {}, isRead: () => false,
      markRead: vi.fn((bid, cid) => { ReadingPlanStore.noteRead(bid, cid); }) };
    setPlanSessionHost(host);
    render(<App />);
    act(() => { ReadingPlanStore.noteRead('genesis', 1); });
    const toast = document.getElementById(COUNT_TOAST);
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.firstChild.textContent).toBe('In Bible in a Year');
    const btn = toast.querySelector('button');
    expect(btn.textContent).toBe('Count it');
    expect(ReadingPlanStore.get(run.id).ticks).toEqual({});
    act(() => { btn.click(); });
    expect(Object.keys(ReadingPlanStore.get(run.id).ticks)).toEqual(['genesis:1']);
    expect(host.markRead).toHaveBeenCalledWith('genesis', 1);
    expect(toast.classList.contains('show')).toBe(false);
  });

  it('no line for a plan that counts reading from anywhere, and two plans that do not are named as a count', () => {
    ReadingPlanStore.put({ ...startCatalogPlan('bible-year', null, new Date()), id: 'on' });
    render(<App />);
    act(() => { ReadingPlanStore.noteRead('genesis', 1); });
    expect(document.getElementById(COUNT_TOAST)).toBeNull();
    ReadingPlanStore.put({ ...startCatalogPlan('bible-year', null, new Date()), id: 'a', countAnywhere: false });
    ReadingPlanStore.put({ ...startCatalogPlan('bible-year', null, new Date()), id: 'b', countAnywhere: false });
    act(() => { ReadingPlanStore.noteRead('genesis', 2); });
    expect(document.getElementById(COUNT_TOAST).firstChild.textContent).toBe('In 2 of your plans');
  });
});
