/* gen-mark-shifts (n4-02): the paragraph moves past corpus edits made, which the
   app's corpus mark remap may move readers' marks along. The history walk needs
   git (not run here); the rules it applies per entry are pinned. */
import { describe, it, expect } from 'vitest';
import { movesOf, kindOf, render } from './gen-mark-shifts.mjs';

describe('gen-mark-shifts', () => {
  it('a block inserted above: each unchanged block below it moved down one', () => {
    expect(movesOf(['a', 'b', 'c'], ['a', 'X', 'b', 'c'])).toEqual([[1, 2], [2, 3]]);
  });

  it('a block removed: the ones below moved up; a block that stayed is no move', () => {
    expect(movesOf(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toEqual([[2, 1], [3, 2]]);
  });

  it('a block found twice in either version says nothing (a repeated divider)', () => {
    expect(movesOf(['*', 'b', '*'], ['X', '*', 'b', '*'])).toEqual([[1, 2]]);
  });

  it('blocks that swapped are two moves; an edit in place is none', () => {
    expect(movesOf(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual([[0, 1], [1, 0]]);
    expect(movesOf(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual([]);
  });

  it('keys by the view that renders the file', () => {
    expect(kindOf('app/src/main/assets/src/data/answers.js')).toBe('wtlb');
    expect(kindOf('app/src/main/assets/src/data/the-blessed.js')).toBe('wtlb');
    expect(kindOf('app/src/main/assets/src/data/holy-days.js')).toBe('wtlb');
    expect(kindOf('app/src/main/assets/src/data/volume-two.js')).toBe('letter');
    expect(kindOf('app/src/main/assets/src/data/bible-studies.js')).toBe('letter');
  });

  it('renders a module the remap imports', () => {
    const src = render({ 'wtlb:x:': [1, 2, 2, 3] });
    expect(src).toContain('export const MARK_SHIFTS = {\n  "wtlb:x:": [1,2,2,3],\n};');
  });
});
