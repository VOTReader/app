/* altArrowReorder — Alt+ArrowUp / Alt+ArrowDown reorder for a list of tiles.
   Pure: no imports. `order` is the stored id order (it may hold ids that are
   not shown); `shownIds` is the visible order. Moving swaps the tile with its
   visible neighbour inside `order`. */
import { describe, it, expect } from 'vitest';
import { altArrowReorder } from './keyboard-reorder.js';

function keyEvent(key, altKey = true) {
  let calls = 0;
  return { e: { altKey, key, preventDefault: () => { calls += 1; } }, calls: () => calls };
}

describe('altArrowReorder', () => {
  it('returns null and does not preventDefault without Alt', () => {
    const { e, calls } = keyEvent('ArrowUp', false);
    expect(altArrowReorder(e, ['a', 'b'], ['a', 'b'], 1)).toBeNull();
    expect(calls()).toBe(0);
  });

  it('returns null and does not preventDefault for a non-arrow key', () => {
    const { e, calls } = keyEvent('ArrowLeft');
    expect(altArrowReorder(e, ['a', 'b'], ['a', 'b'], 1)).toBeNull();
    expect(calls()).toBe(0);
    const plain = keyEvent('a');
    expect(altArrowReorder(plain.e, ['a', 'b'], ['a', 'b'], 1)).toBeNull();
    expect(plain.calls()).toBe(0);
  });

  it('ArrowUp swaps the tile with its previous visible neighbour', () => {
    const { e, calls } = keyEvent('ArrowUp');
    const out = altArrowReorder(e, ['a', 'b', 'c'], ['a', 'b', 'c'], 1);
    expect(out).toEqual({ order: ['b', 'a', 'c'], up: true });
    expect(calls()).toBe(1);
  });

  it('ArrowDown swaps the tile with its next visible neighbour', () => {
    const { e, calls } = keyEvent('ArrowDown');
    const out = altArrowReorder(e, ['a', 'b', 'c'], ['a', 'b', 'c'], 1);
    expect(out).toEqual({ order: ['a', 'c', 'b'], up: false });
    expect(calls()).toBe(1);
  });

  it('ArrowUp on the first visible tile returns null', () => {
    const { e, calls } = keyEvent('ArrowUp');
    expect(altArrowReorder(e, ['a', 'b', 'c'], ['a', 'b', 'c'], 0)).toBeNull();
    // preventDefault runs before the boundary check, so it still fires.
    expect(calls()).toBe(1);
  });

  it('ArrowDown on the last visible tile returns null', () => {
    const { e, calls } = keyEvent('ArrowDown');
    expect(altArrowReorder(e, ['a', 'b', 'c'], ['a', 'b', 'c'], 2)).toBeNull();
    expect(calls()).toBe(1);
  });

  it('swaps inside the stored order, leaving hidden ids in place', () => {
    const { e } = keyEvent('ArrowDown');
    // 'x' is stored but not shown; 'a' and 'b' are visible neighbours.
    const out = altArrowReorder(e, ['x', 'a', 'b'], ['a', 'b'], 0);
    expect(out).toEqual({ order: ['x', 'b', 'a'], up: false });
  });

  it('visible neighbours need not be adjacent in the stored order', () => {
    const { e } = keyEvent('ArrowUp');
    // 'a' and 'c' are visible neighbours with hidden 'x' between them in storage.
    const out = altArrowReorder(e, ['a', 'x', 'c'], ['a', 'c'], 1);
    expect(out).toEqual({ order: ['c', 'x', 'a'], up: true });
  });

  it('returns null when the focused id is not in the stored order', () => {
    const { e } = keyEvent('ArrowDown');
    expect(altArrowReorder(e, ['a', 'b'], ['a', 'z'], 1)).toBeNull();
  });

  it('returns null when the target id is not in the stored order', () => {
    const { e } = keyEvent('ArrowDown');
    expect(altArrowReorder(e, ['a'], ['a', 'z'], 0)).toBeNull();
  });

  it('returns null for an out-of-range index', () => {
    const { e } = keyEvent('ArrowDown');
    expect(altArrowReorder(e, ['a', 'b'], ['a', 'b'], 5)).toBeNull();
    expect(altArrowReorder(e, ['a', 'b'], ['a', 'b'], -1)).toBeNull();
  });

  it('does not mutate the stored order', () => {
    const { e } = keyEvent('ArrowUp');
    const order = ['a', 'b', 'c'];
    const out = altArrowReorder(e, order, ['a', 'b', 'c'], 2);
    expect(out.order).toEqual(['a', 'c', 'b']);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(out.order).not.toBe(order);
  });
});
