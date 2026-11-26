// @ts-nocheck — test-only (vitest)
/* look-6 (11-26): Up next titles take up to three lines, so its rows differ in height. A grip drag counted the rows it
   passed by the DRAGGED row's height (Math.round(dy / ownHeight)): a one-line row dragged past a three-line one moved
   two places for one. rowsPassed counts each passed row by its own height, passing it once the drag is past its middle. */
import { describe, it, expect } from 'vitest';
import { rowsPassed } from './PlayerSheets.jsx';
import { voiceTileWord } from './AudioManagerSheet.jsx';

describe('rowsPassed: a grip drag by the heights of the rows it passes', () => {
  it('equal rows behave as before: a row is passed past its middle', () => {
    const rows = [64, 64, 64];
    expect(rowsPassed(31, [], rows)).toBe(0);
    expect(rowsPassed(33, [], rows)).toBe(1);
    expect(rowsPassed(97, [], rows)).toBe(2);
    expect(rowsPassed(-33, rows, [])).toBe(-1);
  });
  it('a short row dragged past a tall one moves one place, not two', () => {
    // the dragged row is 64 high, the next is 140 (a three-line title): 120 px down is past its middle (70), short of the
    // one after; the old count, Math.round(120 / 64), said 2
    expect(rowsPassed(120, [], [140, 64])).toBe(1);
    expect(Math.round(120 / 64)).toBe(2);
  });
  it('a tall row dragged past short ones passes each of them', () => {
    expect(rowsPassed(100, [], [64, 64, 64])).toBe(2);   // the old count, Math.round(100 / 140), said 1
  });
  it('never passes more rows than there are', () => {
    expect(rowsPassed(5000, [], [64, 64])).toBe(2);
    expect(rowsPassed(-5000, [64], [])).toBe(-1);
    expect(rowsPassed(0, [64], [64])).toBe(0);
  });
});

describe('voiceTileWord: the Voice tile shows the reader\'s name', () => {
  it('drops "Read by " so the fixed-width tile is not cut ("Read by Benj…")', () => {
    expect(voiceTileWord('Read by Benjamin')).toBe('Benjamin');
    expect(voiceTileWord('Text-to-speech')).toBe('Text-to-speech');
    expect(voiceTileWord(null)).toBe('');
  });
});
