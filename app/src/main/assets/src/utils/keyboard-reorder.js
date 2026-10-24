/* Alt+ArrowUp / Alt+ArrowDown reorder for a list of tiles (Home's cards, the Library's tiles; n199).
   Home had it alone; the Library's tiles reordered by long-press drag only, so a keyboard reader had
   no way to move one. One handler, so the two cannot drift.

   `order` is the stored id order (it may hold ids that are not shown); `shownIds` is the visible order
   the tile at `i` belongs to. Moving swaps the tile with its visible neighbour inside `order`. */

/**
 * @param {{ altKey: boolean, key: string, preventDefault: () => void }} e  the keydown event
 * @param {string[]} order     the stored order
 * @param {string[]} shownIds  the visible tiles' ids, in on-screen order
 * @param {number} i           the focused tile's index in shownIds
 * @returns {{ order: string[], up: boolean } | null}  the new order, or null when the key is not a move
 */
export function altArrowReorder(e, order, shownIds, i) {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return null;
  e.preventDefault();
  const up = e.key === 'ArrowUp';
  const targetId = shownIds[i + (up ? -1 : 1)];
  if (targetId == null) return null;
  const next = [...order];
  const from = next.indexOf(shownIds[i]), to = next.indexOf(targetId);
  if (from < 0 || to < 0) return null;
  [next[from], next[to]] = [next[to], next[from]];
  return { order: next, up };
}
