// @ts-nocheck - ScreenLayout / LibraryNav are free globals, as the other personal-study screens
/* PlanBuilder (mw18): build your own plan from the Plans screen: pick any mix of Bible and letters, set the goal,
   see each day's chapters, letters, words and minutes, start it. Corbin 2026-10-22: a mix shares each day side by
   side by default, one after the other as the option. */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, within, act } from '@testing-library/react';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { dayItems } from '../../data/plan-engine.js';

const COL = { volKey: 'seven', readKey: 'volume-seven', label: 'Volume Seven', letterScreen: 'seven-letter' };
const LETTERS = Array.from({ length: 4 }, (_, i) => ({ id: 'seven-' + (i + 1), title: 'Letter ' + (i + 1), paragraphs: [{ text: 'word '.repeat(600) }] }));

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => <main>{navChildren}{children}</main>;
  globalThis.LibraryNav = ({ onBack, backLabel }) => <button type="button" onClick={onBack}>{'Back to ' + backLabel}</button>;
  globalThis.ConfirmStrip = () => null;
  globalThis.READING_CHAIN = ['seven'];
  globalThis.COL_BY_KEY = new Map([['seven', COL]]);
  globalThis.colLetterArr = () => LETTERS;
  globalThis.colPreface = () => null;
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  globalThis.ReadingPlanStore = ReadingPlanStore;
});
afterEach(() => {
  cleanup();
  for (const k of ['ReadingPlanStore', 'READING_CHAIN', 'COL_BY_KEY', 'colLetterArr', 'colPreface']) delete globalThis[k];
});

const base = () => ({ readingPlans: [], isRead: () => false, markAsReadEnabled: true, onPlansMoved: vi.fn(), onRead: vi.fn(), onBack: vi.fn() });
/** The picks bar's status line, the word count in its own span (hidden at large text). */
const summary = () => document.querySelector('.build-summary').textContent;
const open = () => { render(<ReadingPlansScreen {...base()} />); fireEvent.click(screen.getByRole('button', { name: /Build your own plan/ })); };

describe('PlanBuilder', () => {
  it('picks a few chapters, sets chapters a day, shows each day, and starts the plan', () => {
    open();
    expect(screen.getByRole('heading', { name: 'What do you want to read?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pick chapters of Genesis' }));
    for (const c of [1, 2, 3, 4]) fireEvent.click(screen.getByRole('button', { name: 'Genesis ' + c }));
    expect(screen.getByRole('checkbox', { name: /^Genesis/ }).getAttribute('aria-checked')).toBe('mixed');
    expect(within(screen.getByRole('list', { name: 'Your picks' })).getByText('Genesis 1-4')).toBeTruthy();
    expect(summary()).toMatch(/^4 chapters · about [\d,]+ words$/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'How do you want to read it?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /chapter or letter a day/ }));
    fireEvent.click(screen.getByRole('button', { name: 'More: chapters or letters a day' }));
    const each = screen.getByRole('region', { name: 'Each day' });
    expect(within(each).getByText('2 chapters')).toBeTruthy();
    expect(within(each).getByText(/^Finishes .* · 2 reading days$/)).toBeTruthy();
    act(() => { fireEvent.click(within(each).getByRole('button', { name: 'Start plan' })); });
    const [run] = ReadingPlanStore.active();
    expect(run.plan).toBe('custom');
    expect(run.name).toBe('Genesis 1-4');
    expect(dayItems(run, 0).map((it) => it.k)).toEqual(['genesis:1', 'genesis:2']);
    expect(screen.getByRole('region', { name: 'Genesis 1-4' })).toBeTruthy();   // back on Plans, following it
  });

  it('mixes Bible and letters side by side by default, one after the other on request; Back steps back', () => {
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Ruth/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'The Letters' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Volume Seven/ }));
    expect(summary()).toMatch(/^4 chapters \+ 4 letters · about [\d,]+ words$/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const share = screen.getByRole('radiogroup', { name: 'Bible and letters on the same day?' });
    expect(within(share).getByRole('radio', { name: /Side by side/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /^In \d+ days/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Number of days' }), { target: { value: '4' } });
    expect(within(screen.getByRole('region', { name: 'Each day' })).getByText('1 chapter + 1 letter')).toBeTruthy();
    fireEvent.click(within(share).getByRole('radio', { name: /One after the other/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Plan name' }), { target: { value: 'Ruth, then Seven' } });
    // Back goes to step 1 with the picks kept, and forward again
    fireEvent.click(screen.getByRole('button', { name: 'Back to Reading plans' }));
    expect(screen.getByRole('list', { name: 'Your picks' }).textContent).toMatch(/Ruth.*Volume Seven/);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start plan' })); });
    const [run] = ReadingPlanStore.active();
    expect(run.name).toBe('Ruth, then Seven');
    expect(run.share).toBe('serial');
    expect(dayItems(run, 0).every((it) => !it.t)).toBe(true);
    expect(dayItems(run, 3).every((it) => it.t)).toBe(true);
  });

  it('a whole testament is one tap, and taps again to clear', () => {
    open();
    const nt = screen.getByRole('checkbox', { name: /^New Testament/ });
    fireEvent.click(nt);
    expect(nt.getAttribute('aria-checked')).toBe('true');
    expect(summary()).toMatch(/^260 chapters · about [\d,]+ words$/);
    fireEvent.click(nt);
    expect(screen.getByText('Nothing picked yet')).toBeTruthy();
  });

  it('the whole Bible is one chip in the picks bar, and its × clears it (mw-pb1)', () => {
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Old Testament/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^New Testament/ }));
    const bar = screen.getByRole('list', { name: 'Your picks' });
    expect(within(bar).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Whole Bible · 66 books · 1,189 ch×']);
    expect(screen.getByRole('checkbox', { name: /^Whole Bible/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Genesis/ }));   // one book out: back to the books, still one row per pick
    expect(within(bar).getAllByRole('listitem').map((li) => li.firstChild.textContent))
      .toEqual(['Exodus to Malachi · 38 books · 879 ch', 'New Testament · 27 books · 260 ch']);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Genesis/ }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Your picks' })).getByRole('button', { name: 'Remove Whole Bible' }));
    expect(screen.getByText('Nothing picked yet')).toBeTruthy();
  });
});

/* n354b: a built plan with letters the reader is partway through offers Start where I am beside Start plan. */
describe('PlanBuilder — Start where I am (n354b)', () => {
  const openReading = (isRead) => {
    render(<ReadingPlansScreen {...base()} isRead={isRead} />);
    fireEvent.click(screen.getByRole('button', { name: /Build your own plan/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Ruth/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'The Letters' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Volume Seven/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('starts the letters at the first unread; the Bible picks stay whole', () => {
    openReading((bid, cid) => (bid === 'volume-seven' && cid === 'seven-1') || bid === 'ruth');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Start where I am: Letter 2' })); });
    const [run] = ReadingPlanStore.active();
    const keys = run.tracks.flatMap((t) => t.items.map((it) => it.k));
    expect(keys.filter((k) => k.startsWith('volume-seven:'))).toEqual(['volume-seven:seven-2', 'volume-seven:seven-3', 'volume-seven:seven-4']);
    expect(keys.filter((k) => k.startsWith('ruth:'))).toHaveLength(4);
  });

  it('no offer with none of its letters read', () => {
    openReading((bid) => bid === 'ruth');
    expect(screen.queryByRole('button', { name: /^Start where I am/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start plan' })).toBeTruthy();
  });
});
