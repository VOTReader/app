/* BibleChapterView swipe-decision tests — UX10.
   ─────────────────────────────────────────────
   The full screen render needs many free globals (ScreenLayout, NavButtons,
   StickyChapterNav, HighlightableText, …), so we pin the swipe DECISION
   directly. The body handler is a thin wrapper: it also guards multi-touch
   and an active text selection before consulting this, then maps +1→goNextCh
   / -1→goPrevCh (which themselves fall through to onPrevBook/onNextBook at
   book boundaries).
*/

import { describe, it, expect } from 'vitest';
import { bibleSwipeDir } from './BibleChapterView.jsx';

describe('bibleSwipeDir — UX10 swipe-to-change-chapter', () => {
  it('advances (+1) on a clear leftward drag', () => {
    expect(bibleSwipeDir(-90, 8)).toBe(1);
  });
  it('goes back (-1) on a clear rightward drag', () => {
    expect(bibleSwipeDir(90, -8)).toBe(-1);
  });
  it('ignores a tap', () => {
    expect(bibleSwipeDir(0, 0)).toBe(0);
  });
  it('ignores a mostly-vertical drag so reading-scroll never flips chapters', () => {
    expect(bibleSwipeDir(-90, 80)).toBe(0);
  });
  it('ignores a sub-threshold horizontal nudge', () => {
    expect(bibleSwipeDir(50, 0)).toBe(0);
  });
  it('honors the thresholds at the boundary', () => {
    expect(bibleSwipeDir(-60, 0)).toBe(0);
    expect(bibleSwipeDir(-61, 0)).toBe(1);
    expect(bibleSwipeDir(80, 45)).toBe(0);
    expect(bibleSwipeDir(80, 44)).toBe(-1);
  });
});
