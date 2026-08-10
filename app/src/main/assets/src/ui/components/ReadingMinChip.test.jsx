// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)

/* ReadingMinChip — the chip three screens share, and its three outcomes.
   ─────────────────────────────────────────────────────────────────────
   C2-D [D6]. This helper exists BECAUSE the chip had been copy-pasted into
   ChapterIndex and VolumeLetterIndex and History wanted a third copy; the
   whole point is that the chip a card shows and the chip a history row
   shows cannot disagree. Nothing tested it.

   Every cross-bundle read here is a guarded free global (countItemWords /
   readingMinutes in bundle-d, ReadingStatsStore in bundle-b), and the
   contract on all of them is the same: a missing or throwing counter HIDES
   the chip rather than rendering a wrong number. A reading estimate is a
   promise about someone's evening — "~4 min" on a chapter that takes
   twenty is worse than no chip. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readingMinChip, readingChipWpm } from './ReadingMinChip.jsx';

const GLOBALS = ['countItemWords', 'readingMinutes', 'ReadingStatsStore'];
const ITEM = { id: 'ch1', num: 1 };

/** Render whatever the chip returned; '' when it returned null. */
function chipOf(...args) {
  const el = readingMinChip(...args);
  if (el == null) return { text: '', className: null, node: null };
  const { container } = render(el);
  const node = container.firstElementChild;
  return { text: node.textContent, className: node.className, node };
}

beforeEach(() => {
  globalThis.countItemWords = () => 900;
  globalThis.readingMinutes = (words, wpm) => Math.round(words / (wpm || 230));
  globalThis.ReadingStatsStore = { measuredWpm: () => 300, getProgress: () => null };
});
afterEach(() => { cleanup(); GLOBALS.forEach((k) => delete globalThis[k]); });

describe('readingChipWpm — resolved once per screen, not once per row', () => {
  it('returns the measured pace when the store has one', () => {
    expect(readingChipWpm()).toBe(300);
  });

  it('returns null when the store is absent, so readingMinutes uses its own default', () => {
    delete globalThis.ReadingStatsStore;
    expect(readingChipWpm()).toBeNull();
  });

  it('returns null when the store exists but has no measuredWpm (an older bundle)', () => {
    globalThis.ReadingStatsStore = {};
    expect(readingChipWpm()).toBeNull();
  });
});

describe('readingMinChip — the COLD chip', () => {
  it('reads "~N min" at the reader\'s own measured pace', () => {
    expect(chipOf(ITEM, null, 300).text).toBe('~3 min');   // 900 / 300
  });

  it('uses the counter\'s default pace when no wpm is handed in', () => {
    expect(chipOf(ITEM).text).toBe('~4 min');              // 900 / 230, rounded
  });

  it('carries the plain chip class — no in-progress modifier', () => {
    expect(chipOf(ITEM, null, 300).className).toBe('idx-min-chip');
  });
});

describe('readingMinChip — the IN-PROGRESS chip', () => {
  const withProgress = (p) => { globalThis.ReadingStatsStore.getProgress = () => p; };

  it('reads "N% · ~M min left" from a frontier the tracker left inside', () => {
    withProgress({ b: 10, c: [1, 2, 3, 4, 5, 6], tw: 0, w: 0 });
    expect(chipOf(ITEM, 'v1:genesis:1', 300).text).toBe('60% · ~1 min left');
  });

  it('prefers the WORD-weighted fraction over the block count when both are present', () => {
    // 6 of 10 blocks read is 60%, but those blocks were 200 of 900 words —
    // block count would promise the reader far less remaining than there is.
    withProgress({ b: 10, c: [1, 2, 3, 4, 5, 6], tw: 900, w: 200 });
    const chip = chipOf(ITEM, 'v1:genesis:1', 300);
    expect(chip.text).toBe('22% · ~2 min left');
  });

  it('caps at 99% — a finished item is not this chip\'s job to claim', () => {
    withProgress({ b: 1000, c: Array.from({ length: 999 }, (_, i) => i), tw: 0, w: 0 });
    expect(chipOf(ITEM, 'v1:genesis:1', 300).text).toMatch(/^99% /);
  });

  it('carries the in-progress class so the two states can be styled apart', () => {
    withProgress({ b: 10, c: [1, 2, 3], tw: 0, w: 0 });
    expect(chipOf(ITEM, 'v1:genesis:1', 300).className).toBe('idx-min-chip in-progress');
  });

  it('falls back to the COLD chip when the frontier says untouched or complete', () => {
    withProgress({ b: 10, c: [], tw: 0, w: 0 });                       // nothing read yet
    expect(chipOf(ITEM, 'v1:genesis:1', 300).text).toBe('~3 min');
    withProgress({ b: 10, c: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], tw: 0, w: 0 });  // all read
    expect(chipOf(ITEM, 'v1:genesis:1', 300).text).toBe('~3 min');
  });

  it('ignores the progress lookup entirely when no key is handed in', () => {
    withProgress({ b: 10, c: [1, 2, 3], tw: 0, w: 0 });
    expect(chipOf(ITEM, null, 300).text).toBe('~3 min');
  });

  it('degrades to the cold chip when the stats store THROWS', () => {
    globalThis.ReadingStatsStore.getProgress = () => { throw new Error('degraded'); };
    expect(chipOf(ITEM, 'v1:genesis:1', 300).text).toBe('~3 min');
  });
});

describe('readingMinChip — when it shows NOTHING', () => {
  it('hides rather than guessing when the word counter is not loaded', () => {
    delete globalThis.countItemWords;
    expect(chipOf(ITEM, null, 300).node).toBeNull();
  });

  it('hides when the minutes helper is not loaded', () => {
    delete globalThis.readingMinutes;
    expect(chipOf(ITEM, null, 300).node).toBeNull();
  });

  it('hides on an item with no countable words (a stub, or a corpus not in yet)', () => {
    globalThis.countItemWords = () => 0;
    expect(chipOf(ITEM, null, 300).node).toBeNull();
  });

  it('hides when the estimate rounds to zero minutes rather than printing "~0 min"', () => {
    globalThis.countItemWords = () => 12;
    expect(chipOf(ITEM, null, 300).node).toBeNull();
  });
});
