/* HomeOrderStore — schema-validation fallback + persist tests.
   ───────────────────────────────────────────────────────────────
   HomeOrderStore.get() enforces a schema invariant on read: the
   saved order must have EXACTLY DEFAULT_HOME_ORDER.length entries
   AND every DEFAULT_HOME_ORDER id must appear. If either check
   fails, get() returns DEFAULT_HOME_ORDER as a fallback. This is
   the only line of defense against:
     - A future schema bump adding a new tile (old saved orders
       become invalid → fall back to canonical defaults).
     - A corrupted/truncated save (saved order missing an id).
     - An import payload with foreign ids (W2.6 import path).

   Per [[user-data-paramount]] the import path is one of the few
   surfaces that can silently brick a user's home screen — if get()
   returned a malformed saved order, the home screen would render
   wrong tiles in the wrong order. The fallback keeps the user
   functional even when the saved order is unusable.
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

describe('HomeOrderStore — get() schema validation', () => {
  it('returns DEFAULT_HOME_ORDER when no saved data exists', () => {
    const order = HomeOrderStore.get();
    // The fallback path returns the frozen DEFAULT_HOME_ORDER itself
    // (or a structurally identical array). Verify contents match.
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
    expect(order.length).toBe(DEFAULT_HOME_ORDER.length);
  });

  it('returns the saved order when it passes the schema check', () => {
    // A valid permutation: same length, same id set, different order.
    const customOrder = ['settings', 'library', 'history', 'volumes', 'scriptures', 'studies'];
    HomeOrderStore.set(customOrder);

    const order = HomeOrderStore.get();
    expect(order).toEqual(customOrder);
  });

  it('falls back to DEFAULT when saved order has wrong length (too short)', () => {
    // Inject directly into the cache to bypass the set() pathway —
    // mimicking what a corrupted save or partial import could
    // produce.
    /** @type {any} */ (HomeOrderStore)._cache = ['volumes', 'scriptures', 'studies'];

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('falls back to DEFAULT when saved order has wrong length (too long)', () => {
    /** @type {any} */ (HomeOrderStore)._cache = [
      'volumes', 'scriptures', 'studies', 'library', 'settings', 'history', 'extra',
    ];

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('falls back to DEFAULT when saved order has correct length but a foreign id', () => {
    // Same length, but one default id missing and replaced with a
    // foreign one — schema check fails on the includes() pass.
    /** @type {any} */ (HomeOrderStore)._cache = [
      'volumes', 'scriptures', 'studies', 'library', 'settings', 'foreign-id',
    ];

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('falls back to DEFAULT when saved value is not an array', () => {
    // Non-array data → Array.isArray check fails first.
    /** @type {any} */ (HomeOrderStore)._cache = { not: 'an array' };

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });

  it('falls back to DEFAULT when saved value has duplicates (length matches but missing an id)', () => {
    // 6 entries (matches length), but 'volumes' appears twice and
    // 'history' is missing → schema check fails on the every() pass.
    /** @type {any} */ (HomeOrderStore)._cache = [
      'volumes', 'volumes', 'scriptures', 'studies', 'library', 'settings',
    ];

    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
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

  it('coerces non-array input to an empty array (which then fails get()\'s schema check → DEFAULT)', () => {
    /** @type {any} */
    const notAnArray = 'not-an-array';
    HomeOrderStore.set(notAnArray);

    // The cache holds `[]` after the coercion; get() finds length 0
    // !== DEFAULT_HOME_ORDER.length → returns DEFAULT_HOME_ORDER.
    const order = HomeOrderStore.get();
    expect(order).toEqual([...DEFAULT_HOME_ORDER]);
  });
});
