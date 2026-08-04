// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* VolumeLetterIndex — the "~N min" reading-time chip on letter rows.
   ──────────────────────────────────────────────────────────────────
   The chip estimates from the row's OWN letter object (Format A blocks
   or Format B paragraphs) via the shared word-count module, at the
   user's measured pace when ReadingStatsStore has one (230-wpm default
   otherwise). Contracts pinned here: the estimate itself, the measured-
   pace override, the absent-counter guard (no chip, no crash), and the
   two-col exception — compact centered cards carry no chip. */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VolumeLetterIndex } from './VolumeLetterIndex.jsx';
import { countItemWords, readingMinutes } from '../../utils/word-count.js';

const GLOBALS = ['countItemWords', 'readingMinutes', 'ReadingStatsStore'];

function setupCounters() {
  globalThis.countItemWords = countItemWords;
  globalThis.readingMinutes = readingMinutes;
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const words = (n) => Array.from({ length: n }, () => 'w').join(' ');
// Format A letter — 460 words at the 230-wpm default → 2 min.
const LETTER_A = {
  id: 'the-wide-path', num: 1, title: 'The Wide Path', date: '3/28/05',
  blocks: [{ type: 'para', segments: [{ t: 'text', v: words(460) }] }],
};
// Format B entry — paragraphs shape resolves through the same counter.
const ENTRY_B = {
  id: 'matters-of-the-heart', num: 11, title: 'Matters of the Heart', date: '',
  paragraphs: [{ align: 'justify', text: words(230) }],
};

const renderIndex = (props = {}) => render(
  <VolumeLetterIndex
    volumeTitle="Volume One"
    letters={[LETTER_A]}
    onSelect={() => {}}
    currentLetter={null}
    isRead={() => false}
    markAsReadEnabled={false}
    {...props}
  />
);

describe('VolumeLetterIndex — "~N min" reading-time chip', () => {
  it('renders the chip from the letter word count at the default pace', () => {
    setupCounters();
    renderIndex();
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~2 min');
  });

  it('counts Format B paragraph entries through the same shared counter', () => {
    setupCounters();
    renderIndex({ letters: [ENTRY_B] });
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~1 min');
  });

  it('uses the measured pace when ReadingStatsStore has one', () => {
    setupCounters();
    globalThis.ReadingStatsStore = { measuredWpm: () => 100 };
    renderIndex();
    expect(document.querySelector('.idx-min-chip').textContent).toBe('~5 min');
  });

  it('renders no chip when the word counters are absent (guard path)', () => {
    renderIndex();
    expect(document.querySelector('.idx-min-chip')).toBeNull();
  });

  it('keeps the time estimate in the two-col compact cards', () => {
    setupCounters();
    renderIndex({ letters: [ENTRY_B], columns: 2 });
    expect(document.querySelector('.two-col-inner')).not.toBeNull();
    expect(document.querySelector('.two-col-meta .idx-min-chip').textContent).toBe('~1 min');
  });
});

describe('VolumeLetterIndex — count-aware read marks (re-read UX)', () => {
  it('a once-read letter renders the plain check, no count', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true, readCount: () => 1 });
    expect(container.querySelector('.read-check')).not.toBeNull();
    expect(container.querySelector('.read-check-count')).toBeNull();
  });

  it('a re-read letter renders ✓ ×N with an AT label', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true, readCount: () => 3 });
    const mark = container.querySelector('.read-check');
    expect(mark.getAttribute('aria-label')).toBe('Read 3 times');
    expect(container.querySelector('.read-check-count').textContent).toBe('×3');
  });

  it('legacy callers without readCount still get the plain check (guard path)', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true });
    expect(container.querySelector('.read-check')).not.toBeNull();
    expect(container.querySelector('.read-check-count')).toBeNull();
  });

  it('keeps the re-read count in the two-col compact cards', () => {
    const { container } = renderIndex({ columns: 2, markAsReadEnabled: true, isRead: () => true, readCount: () => 3 });
    expect(container.querySelector('.two-col-meta .read-check').getAttribute('aria-label')).toBe('Read 3 times');
  });
});

describe('VolumeLetterIndex — smart-resume progress chip ([26])', () => {
  it('weights the percentage and time-left by words, not paragraph count', () => {
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      measuredWpm: () => null,
      getProgress: () => ({ b: 4, c: [0, 1], w: 100, tw: 1000, t: 1 }),
    };
    setupCounters();
    const { container } = renderIndex({ progressKeyFor: (id) => 'v1:vol:' + id });
    expect(container.querySelector('.idx-min-chip').textContent).toBe('10% · ~4 min left');
  });

  it('an in-progress letter shows "N% · ~M min left" instead of the cold total', () => {
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      measuredWpm: () => null,
      getProgress: (key) => key === 'v1:vol:the-wide-path' ? { b: 10, c: [0, 1, 2, 3, 4, 5], t: 1 } : null,
    };
    try {
      setupCounters();
      const { container } = renderIndex({ progressKeyFor: (id) => 'v1:vol:' + id });
      const chip = container.querySelector('.idx-min-chip');
      expect(chip.classList.contains('in-progress')).toBe(true);
      expect(chip.textContent).toMatch(/^60% · ~\d+ min left$/);
    } finally { delete /** @type {any} */ (globalThis).ReadingStatsStore; }
  });

  it('no frontier (or a complete one) falls back to the cold "~N min" chip', () => {
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      measuredWpm: () => null,
      getProgress: () => ({ b: 5, c: [0, 1, 2, 3, 4], t: 1 }),   // fully credited
    };
    try {
      setupCounters();
      const { container } = renderIndex({ progressKeyFor: (id) => 'k:' + id });
      const chip = container.querySelector('.idx-min-chip');
      expect(chip.classList.contains('in-progress')).toBe(false);
      expect(chip.textContent).toMatch(/^~\d+ min$/);
    } finally { delete /** @type {any} */ (globalThis).ReadingStatsStore; }
  });
});
