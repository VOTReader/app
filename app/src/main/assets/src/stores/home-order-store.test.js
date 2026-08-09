/* HomeOrderStore — schema-tolerant merge on read + persist tests.
   ───────────────────────────────────────────────────────────────
   HomeOrderStore.get() MERGES the saved order against the current
   defaults instead of demanding an exact match: saved ids that are
   no longer in DEFAULT_HOME_ORDER are dropped in place, then every
   default id the save is missing is appended at the end in default
   order. Only a value that isn't an array of strings falls back to
   DEFAULT_HOME_ORDER wholesale.

   Why tolerant, not strict: the old exact-length + full-membership
   check meant a single schema move — adding a 7th home tile, or
   retiring one — silently discarded every user's hand-arranged home
   screen. Per [[user-data-paramount]] a schema change must never
   cost a user their arrangement. The merge keeps the arrangement AND
   keeps the screen renderable, since the result can never carry an
   unknown id or omit a real tile — which is what the fallback was
   guarding in the first place:
     - A schema bump adding a new tile (old saves keep their order,
       the new tile appears at the end).
     - A retired tile still sitting in an old save (dropped, the
       rest of the arrangement survives).
     - A corrupted/truncated save (missing ids restored at the end).
     - An import payload with foreign ids (W2.6 import path).
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { HomeOrderStore, DEFAULT_HOME_ORDER } from './home-order-store.js';

beforeEach(() => {
  localStorage.clear();
  HomeOrderStore._resetForTests({ forceLoaded: true });
});

describe('HomeOrderStore — DEFAULT_HOME_ORDER constant', () => {
  it('is frozen (Object.isFrozen)', () => {
    expect(Object.isFrozen(DEFAULT_HOME_ORDER)).toBe(true);
  });

  it('has exactly 6 entries (the canonical tile count)', () => {
    expect(DEFAULT_HOME_ORDER.length).toBe(6);
  });

  it('contains the canonical tile ids', () => {
    expect(new Set(DEFAULT_HOME_ORDER)).toEqual(new Set([
      'volumes', 'scriptures', 'studies', 'library', 'settings', 'history',
    ]));
  });
});

describe('HomeOrderStore — get() schema merge', () => {
  it('returns DEFAULT_HOME_ORDER when no saved data exists', () => {
    const order = HomeOrderStore.get();
    // The fallback path returns the frozen DEFAULT_HOME_ORDER itself
    // (or a structurally identical array). Verify contents match.
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
    expect(order.length).toBe(DEFAULT_HOME_ORDER.length);
  });

  it('returns a full valid permutation as-is', () => {
    // Same length, same id set, different order.
    const customOrder = ['settings', 'library', 'history', 'volumes', 'scriptures', 'studies'];
    HomeOrderStore.set(customOrder);

    const order = HomeOrderStore.get();
    expect(order).toEqual(customOrder);
  });

  it('GROWS: a save predating a new tile keeps its arrangement, new tile appended', () => {
    // The shape every install has on the day a tile is ADDED: the save
    // is a custom arrangement of the ids that existed then, and knows
    // nothing about the newcomer ('studies' stands in for the 7th tile
    // landing later today).
    /** @type {any} */ (HomeOrderStore)._cache = [
      'settings', 'library', 'history', 'volumes', 'scriptures',
    ];

    expect(HomeOrderStore.get()).toEqual(
      ['settings', 'library', 'history', 'volumes', 'scriptures', 'studies']);
  });

  it('SHRINKS: a retired id is dropped in place, the rest of the arrangement survives', () => {
    // The shape every install has on the day a tile is REMOVED — the
    // saved order still names it. Dropping it must not cost the user
    // the other five, and must not append anything.
    /** @type {any} */ (HomeOrderStore)._cache = [
      'settings', 'retired-tile', 'library', 'history', 'volumes', 'scriptures', 'studies',
    ];

    expect(HomeOrderStore.get()).toEqual(
      ['settings', 'library', 'history', 'volumes', 'scriptures', 'studies']);
  });

  it('drops a foreign id from an import payload the same way', () => {
    /** @type {any} */ (HomeOrderStore)._cache = [
      'history', 'settings', 'library', 'studies', 'scriptures', 'foreign-id',
    ];

    // 'volumes' was never in the save, so it lands at the end.
    expect(HomeOrderStore.get()).toEqual(
      ['history', 'settings', 'library', 'studies', 'scriptures', 'volumes']);
  });

  it('dedupes a corrupted save and restores the missing ids at the end', () => {
    /** @type {any} */ (HomeOrderStore)._cache = ['volumes', 'volumes', 'history'];

    expect(HomeOrderStore.get()).toEqual(
      ['volumes', 'history', 'scriptures', 'studies', 'library', 'settings']);
  });

  it('falls back to DEFAULT when saved value is not an array', () => {
    // Non-array data → Array.isArray check fails first.
    /** @type {any} */ (HomeOrderStore)._cache = { not: 'an array' };

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('falls back to DEFAULT when the saved array holds non-strings', () => {
    // Nothing here is a tile id, so a merge would be guesswork —
    // the whole value is untrustworthy.
    /** @type {any} */ (HomeOrderStore)._cache = ['volumes', 42, 'history'];
    expect(HomeOrderStore.get()).toEqual([...DEFAULT_HOME_ORDER]);

    /** @type {any} */ (HomeOrderStore)._cache = [{ id: 'volumes' }, null];
    expect(HomeOrderStore.get()).toEqual([...DEFAULT_HOME_ORDER]);
  });
});

describe('HomeOrderStore — set()', () => {
  it('persists a valid order', () => {
    const customOrder = ['history', 'settings', 'library', 'studies', 'scriptures', 'volumes'];
    HomeOrderStore.set(customOrder);

    expect(HomeOrderStore.get()).toEqual(customOrder);
  });

  it('persists a defensive COPY — caller cannot mutate the cache by mutating its input', () => {
    /** @type {any} */
    const input = ['volumes', 'scriptures', 'studies', 'library', 'settings', 'history'];
    HomeOrderStore.set(input);

    // Mutate the caller's array — the saved data should not change.
    input.push('smuggled');

    const stored = HomeOrderStore.get();
    // The stored order is still 6 entries and matches DEFAULT_HOME_ORDER
    // (the input's mutation didn't bleed in).
    expect(stored.length).toBe(6);
    expect(stored).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('coerces non-array input to an empty array (which then merges to the full DEFAULT)', () => {
    /** @type {any} */
    const notAnArray = 'not-an-array';
    HomeOrderStore.set(notAnArray);

    // The cache holds `[]` after the coercion; get() finds nothing to
    // keep, so every default id is appended → DEFAULT_HOME_ORDER.
    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });
});
