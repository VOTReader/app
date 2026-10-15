/* SettingsScreen — the "All Scriptures" tally counts the rows above it, nothing else.
   ─────────────────────────────────────────────────────────────────────────
   RED 2026-10-15 (sweep v075). The Mark as Read table's total row used
   Object.keys(readItems).length as its numerator, while its denominator summed
   only the table's books. Answers topics (v1:answers:*) and Hidden Manna letters
   (v1:hidden-manna:*) are marked read like any letter but have no row in the
   table, so each one raised "All Scriptures N / M" above the sum of the section
   rows (and could push N past M). The numerator now counts the same books the
   denominator does. Clear All still wipes every read mark, so it stays enabled
   while any mark exists, even one with no row. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { countReadFor } from '../../utils/progress-stats.js';

const GROUPS = [
  { id: 'volumes', label: 'The Volumes of Truth', genres: [
    { label: 'The Seven Volumes', books: [{ id: 'volume-one', label: 'Volume One', total: 10 }] },
  ] },
  { id: 'studies', label: 'Studies', genres: [
    { label: 'Studies', books: [{ id: 'matthew', label: 'Matthew Study', total: 28 }] },
  ] },
];

const totalTally = () => /** @type {HTMLElement} */ (document.querySelector('.total-row .progress-row-tally')).textContent;
const clearAllBtn = () => /** @type {HTMLButtonElement} */ (
  [...document.querySelectorAll('.total-row button')].find((b) => b.textContent === 'Clear All'));
const sectionTallies = () => [...document.querySelectorAll('.progress-section-toggle .progress-row-tally')]
  .map((t) => Number(t.textContent.split('/')[0]));

beforeEach(() => { setupSettingsGlobals({ buildProgressGroups: () => GROUPS, countReadFor }); });
afterEach(() => { cleanup(); teardownSettingsGlobals(); });

describe('SettingsScreen — All Scriptures counts only the books in the table', () => {
  it('leaves out Answers and Hidden Manna marks, which have no row', () => {
    const readItems = {
      'v1:volume-one:1': 1, 'v1:volume-one:2': 1, 'v1:matthew:3': 1,
      'v1:answers:topic-a': 1, 'v1:answers:topic-b': 1, 'v1:hidden-manna:hm-1': 1,
    };
    renderSettings({ markAsRead: true }, { readItems });
    expect(sectionTallies()).toEqual([2, 1]);
    expect(totalTally()).toBe('3 / 38');
  });

  it('never reads more than exist when the off-table marks outnumber the table', () => {
    const readItems = { 'v1:volume-one:1': 1 };
    for (let i = 0; i < 40; i++) readItems[`v1:answers:t${i}`] = 1;
    renderSettings({ markAsRead: true }, { readItems });
    expect(totalTally()).toBe('1 / 38');
  });

  it('keeps Clear All live while an off-table mark exists, since Clear All wipes it too', () => {
    renderSettings({ markAsRead: true }, { readItems: { 'v1:answers:topic-a': 1 } });
    expect(totalTally()).toBe('0 / 38');
    expect(clearAllBtn().disabled).toBe(false);
  });

  it('disables Clear All when there is nothing at all to clear', () => {
    renderSettings({ markAsRead: true }, { readItems: {} });
    expect(totalTally()).toBe('0 / 38');
    expect(clearAllBtn().disabled).toBe(true);
  });
});
