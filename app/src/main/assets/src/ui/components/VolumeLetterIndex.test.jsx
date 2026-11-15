// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* VolumeLetterIndex — the "~N min" reading-time chip on letter rows.
   ──────────────────────────────────────────────────────────────────
   The chip estimates from the row's OWN letter object (Format A blocks
   or Format B paragraphs) via the shared word-count module, at the
   user's measured pace when ReadingStatsStore has one (230-wpm default
   otherwise). Contracts pinned here: the estimate itself, the measured-
   pace override, the absent-counter guard (no chip, no crash), and the
   entry rows (Words To Live By) keep their chip too. */

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

  it('keeps the time estimate on an entry row (Words To Live By is one list now, not two columns)', () => {
    setupCounters();
    renderIndex({ letters: [ENTRY_B], noun: 'entry' });
    const row = document.querySelector('.ui-group .sty-row');
    expect(row.querySelector('.ui-row-over')).toBeNull();
    expect(row.querySelector('.ui-row-meta').textContent).toBe('Entry 11 · ~1 min');
  });
});

describe('VolumeLetterIndex — count-aware read marks (re-read UX)', () => {
  const rowMark = (c) => c.querySelector('.ui-group .ui-row-mark');
  it('a once-read letter renders the round tick named Read, no count', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true, readCount: () => 1 });
    expect(rowMark(container).classList.contains('is-tick')).toBe(true);
    expect(rowMark(container).getAttribute('aria-label')).toBe('Read');
  });

  it('a re-read letter renders ✓ ×N with an AT label', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true, readCount: () => 3 });
    expect(rowMark(container).querySelector('.sr-only').textContent).toBe('Read 3 times');   // s16.4: sr-only text, not aria-label on a span
    expect(rowMark(container).textContent).toContain('×3');
  });

  it('legacy callers without readCount still get the plain tick (guard path)', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true });
    expect(rowMark(container).classList.contains('is-tick')).toBe(true);
  });

  it('a read count of 0 on a letter marked read still shows the tick', () => {
    const { container } = renderIndex({ markAsReadEnabled: true, isRead: () => true, readCount: () => 0 });
    expect(rowMark(container)).not.toBeNull();
  });
});

describe('VolumeLetterIndex — the kit page (vot-ui 2026-11-15)', () => {
  const B = { id: 'b', num: 2, title: 'The Seventh Day', date: '4/18/05' };
  it('a row is the name and one meta line: "Letter N · date in words · time"', () => {
    const { container } = renderIndex({ letters: [LETTER_A] });
    const row = container.querySelector('.ui-group .sty-row');
    expect(row.querySelector('.ui-row-over')).toBeNull();
    expect(row.querySelector('.ui-row-title').textContent).toBe('The Wide Path');
    expect(row.querySelector('.ui-row-meta').textContent).toMatch(/^Letter 1 · March 28, 2005/);
  });
  it('nothing read: the card says Start here and opens the first letter', () => {
    const picked = [];
    const { container } = renderIndex({ letters: [LETTER_A, B], onSelect: (id) => picked.push(id) });
    const card = container.querySelector('.sty-next');
    expect(card.textContent).toContain('Start here');
    card.click();
    expect(picked).toEqual(['the-wide-path']);
  });
  it('one read: the card says Up next and the group says 1 of 2 read', () => {
    const { container } = renderIndex({ letters: [LETTER_A, B], markAsReadEnabled: true, isRead: (id) => id === 'the-wide-path' });
    expect(container.querySelector('.sty-next').textContent).toContain('Up next');
    expect(container.querySelector('.sty-next').textContent).toContain('The Seventh Day');
    expect(container.textContent).toContain('1 of 2 read');
  });
  it('the preface opens through onSelectPreface and its meta line starts "Preface"', () => {
    const got = [];
    const { container } = renderIndex({ preface: { id: 'pre', title: 'To the Reader' }, onSelectPreface: (id) => got.push(id) });
    const first = container.querySelector('.ui-group .sty-row');
    expect(first.querySelector('.ui-row-meta').textContent).toMatch(/^Preface/);
    first.click();
    expect(got).toEqual(['pre']);
  });
  it('the letter the reader is in is the current row', () => {
    const { container } = renderIndex({ letters: [LETTER_A, B], currentLetter: 'b' });
    expect(container.querySelector('.sty-row[aria-current="true"] .ui-row-title').textContent).toBe('The Seventh Day');
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
    expect(container.querySelector('.idx-min-chip').textContent).toBe('10% read · ~4 min left');
  });

  it('an in-progress letter shows "N% read · ~M min left" instead of the cold total', () => {
    /** @type {any} */ (globalThis).ReadingStatsStore = {
      measuredWpm: () => null,
      getProgress: (key) => key === 'v1:vol:the-wide-path' ? { b: 10, c: [0, 1, 2, 3, 4, 5], t: 1 } : null,
    };
    try {
      setupCounters();
      const { container } = renderIndex({ progressKeyFor: (id) => 'v1:vol:' + id });
      const chip = container.querySelector('.idx-min-chip');
      expect(chip.classList.contains('in-progress')).toBe(true);
      expect(chip.textContent).toMatch(/^60% read · ~\d+ min left$/);
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
