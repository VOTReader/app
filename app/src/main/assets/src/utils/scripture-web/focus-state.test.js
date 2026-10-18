/* focus-state: the one shape of "what is chosen, hovered and lit" (CONTRACTS.md §2). A writer that
   sets one field must never drop the others, and the lit set's key must always follow the set. */
import { describe, it, expect } from 'vitest';
import { focusState, withLit, litKeyOf, prophecyIndexOf, chosenEnds } from './focus-state.js';

describe('focusState', () => {
  it('nothing chosen, hovered or lit is the default, with every field present', () => {
    expect(focusState()).toEqual({
      arc: -1, prophecy: false, underlay: false, range: null, range2: null, hover: -1, hoverProphecy: -1,
      hoverUnderlay: false, lit: null, litKey: '',
    });
  });

  it('hoverProphecy: the prophecy pair under the pointer when no arc is (GL review finding 2), -1 for none', () => {
    expect(focusState({ hoverProphecy: 4 }).hoverProphecy).toBe(4);
    expect(focusState({ hoverProphecy: undefined }).hoverProphecy).toBe(-1);
    expect(withLit(focusState({ hoverProphecy: 4 }), [1]).hoverProphecy).toBe(4);
  });

  it("My Web names which list arc and hover index: the reader's links, or Timothy's notes (fix-review #4)", () => {
    expect(focusState({ arc: 4, underlay: true })).toMatchObject({ arc: 4, underlay: true, hoverUnderlay: false });
    expect(focusState({ arc: 4, underlay: /** @type {any} */ (1) }).underlay).toBe(true);
    expect(focusState({ hover: 2, hoverUnderlay: /** @type {any} */ (undefined) }).hoverUnderlay).toBe(false);
    // a copy keeps them; a new choice drops them
    expect(withLit(focusState({ arc: 4, underlay: true, hover: 1, hoverUnderlay: true }), [1])).toMatchObject({ underlay: true, hoverUnderlay: true });
    expect(focusState({ arc: 2 }).underlay).toBe(false);
  });

  it('a patch lands over the defaults and the missing fields stay whole (the old { arc, range } writes dropped range2)', () => {
    const f = focusState({ arc: 7 });
    expect(f.arc).toBe(7);
    expect(f.range).toBeNull();
    expect(f.range2).toBeNull();
    expect(f.hover).toBe(-1);
    expect(focusState({ range: [3, 9], range2: undefined }).range2).toBeNull();
    expect(focusState({ arc: undefined }).arc).toBe(-1);
  });

  it('copies a lit array into an Int32Array and always recomputes its key', () => {
    const f = focusState({ lit: [4, 2, 9], litKey: 'stale' });
    expect(f.lit).toBeInstanceOf(Int32Array);
    expect(Array.from(f.lit)).toEqual([4, 2, 9]);
    expect(f.litKey).toBe(litKeyOf([4, 2, 9]));
    expect(focusState({ lit: [], litKey: 'stale' })).toMatchObject({ lit: null, litKey: '' });
  });

  it('withLit is a copy: the old focus keeps its set, the chosen arc and hover carry over', () => {
    const before = focusState({ arc: 3, hover: 5 });
    const after = withLit(before, [10, 11]);
    expect(before.lit).toBeNull();
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ arc: 3, hover: 5 });
    expect(Array.from(after.lit)).toEqual([10, 11]);
    expect(withLit(after, null)).toMatchObject({ arc: 3, lit: null, litKey: '' });
  });
});

describe('litKeyOf', () => {
  it('is empty for no set, and the same for the same ids however they are held', () => {
    expect(litKeyOf(null)).toBe('');
    expect(litKeyOf([])).toBe('');
    expect(litKeyOf([1, 2, 3])).toBe(litKeyOf(Int32Array.from([1, 2, 3])));
  });

  it('changes when an id, the order or the length changes (the renderer re-uploads on a change only)', () => {
    const keys = new Set([[1, 2, 3], [1, 2, 4], [3, 2, 1], [1, 2], [1, 2, 3, 0], [256], [1]].map(litKeyOf));
    expect(keys.size).toBe(7);
  });
});

describe('the prophecy list', () => {
  const g = {
    count: 2, from: Uint16Array.from([1, 5]), to: Uint16Array.from([8, 9]),
    prophecy: [{ a: 2, b: 30 }, { a: 1, b: 8 }],
  };

  it('prophecyIndexOf finds a pair in either order, -1 otherwise', () => {
    expect(prophecyIndexOf(g, 2, 30)).toBe(0);
    expect(prophecyIndexOf(g, 30, 2)).toBe(0);
    expect(prophecyIndexOf(g, 8, 1)).toBe(1);
    expect(prophecyIndexOf(g, 1, 9)).toBe(-1);
    expect(prophecyIndexOf({ prophecy: [] }, 1, 2)).toBe(-1);
    expect(prophecyIndexOf(null, 1, 2)).toBe(-1);
  });

  it('chosenEnds reads whichever list the arc indexes', () => {
    expect(chosenEnds(g, focusState({ arc: 1 }))).toEqual({ from: 5, to: 9 });
    expect(chosenEnds(g, focusState({ arc: 0, prophecy: true }))).toEqual({ from: 2, to: 30 });
    expect(chosenEnds(g, focusState())).toBeNull();
    expect(chosenEnds(g, focusState({ arc: 2 }))).toBeNull();
    expect(chosenEnds(g, focusState({ arc: 5, prophecy: true }))).toBeNull();
  });
});
