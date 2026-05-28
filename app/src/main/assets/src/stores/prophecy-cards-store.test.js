/* ProphecyCardsStore — getAll/getOne/setOne/setAll tests.
   ──────────────────────────────────────────────────────────
   Record<string, boolean> map where truthy = expanded, absent =
   collapsed. setAll() filters falsy values so the persisted map stays
   minimal. getAll() returns a defensive copy.
*/

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProphecyCardsStore } from './prophecy-cards-store.js';

beforeEach(() => {
  localStorage.clear();
  ProphecyCardsStore._resetForTests({ forceLoaded: true });
});

/* ═══════════════════════════════════════════════════════════════════
   getAll() — defensive copy
   ═══════════════════════════════════════════════════════════════════ */

describe('ProphecyCardsStore — getAll()', () => {
  it('returns {} on empty store', () => {
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('returns all truthy keys', () => {
    ProphecyCardsStore.setOne('a', true);
    ProphecyCardsStore.setOne('b', true);
    expect(ProphecyCardsStore.getAll()).toEqual({ a: true, b: true });
  });

  it('returns a defensive copy (mutating it does not affect cache)', () => {
    ProphecyCardsStore.setOne('a', true);
    const copy = ProphecyCardsStore.getAll();
    copy.smuggled = true;
    expect(ProphecyCardsStore.getOne('smuggled')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   getOne()
   ═══════════════════════════════════════════════════════════════════ */

describe('ProphecyCardsStore — getOne()', () => {
  it('returns false for missing key', () => {
    expect(ProphecyCardsStore.getOne('missing')).toBe(false);
  });

  it('returns true for set key', () => {
    ProphecyCardsStore.setOne('x', true);
    expect(ProphecyCardsStore.getOne('x')).toBe(true);
  });

  it('returns false for deleted key', () => {
    ProphecyCardsStore.setOne('x', true);
    ProphecyCardsStore.setOne('x', false);
    expect(ProphecyCardsStore.getOne('x')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   setOne() — mutation
   ═══════════════════════════════════════════════════════════════════ */

describe('ProphecyCardsStore — setOne()', () => {
  it('sets a key to true', () => {
    ProphecyCardsStore.setOne('card1', true);
    expect(ProphecyCardsStore.getOne('card1')).toBe(true);
  });

  it('deletes a key when value is false', () => {
    ProphecyCardsStore.setOne('card1', true);
    ProphecyCardsStore.setOne('card1', false);
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('deletes a key when value is 0', () => {
    ProphecyCardsStore.setOne('card1', true);
    // @ts-expect-error — testing defensive falsy handling
    ProphecyCardsStore.setOne('card1', 0);
    expect(ProphecyCardsStore.getOne('card1')).toBe(false);
  });

  it('deletes a key when value is null', () => {
    ProphecyCardsStore.setOne('card1', true);
    ProphecyCardsStore.setOne('card1', null);
    expect(ProphecyCardsStore.getOne('card1')).toBe(false);
  });

  it('no-op when key is empty string', () => {
    const v0 = ProphecyCardsStore.getVersion();
    ProphecyCardsStore.setOne('', true);
    expect(ProphecyCardsStore.getVersion()).toBe(v0);
  });

  it('bumps version on successful mutation', () => {
    const v0 = ProphecyCardsStore.getVersion();
    ProphecyCardsStore.setOne('a', true);
    expect(ProphecyCardsStore.getVersion()).toBe(v0 + 1);
  });

  it('notifies subscribers', () => {
    const spy = vi.fn();
    ProphecyCardsStore.subscribe(spy);
    ProphecyCardsStore.setOne('a', true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   setAll() — full replacement with falsy filtering
   ═══════════════════════════════════════════════════════════════════ */

describe('ProphecyCardsStore — setAll()', () => {
  it('replaces entire cache', () => {
    ProphecyCardsStore.setOne('old', true);
    ProphecyCardsStore.setAll({ newKey: true });
    expect(ProphecyCardsStore.getOne('old')).toBe(false);
    expect(ProphecyCardsStore.getOne('newKey')).toBe(true);
  });

  it('filters falsy values', () => {
    // @ts-expect-error — testing defensive falsy filtering
    ProphecyCardsStore.setAll({ a: true, b: false, c: true, d: 0, e: null, f: undefined });
    expect(ProphecyCardsStore.getAll()).toEqual({ a: true, c: true });
  });

  it('setAll(null) becomes {}', () => {
    ProphecyCardsStore.setOne('x', true);
    ProphecyCardsStore.setAll(null);
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('setAll(undefined) becomes {}', () => {
    ProphecyCardsStore.setAll(undefined);
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('setAll(non-object) becomes {}', () => {
    // @ts-expect-error — testing defensive non-object handling
    ProphecyCardsStore.setAll('string');
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('setAll([]) becomes {} (arrays are not plain objects)', () => {
    // @ts-expect-error — testing defensive array handling
    ProphecyCardsStore.setAll([]);
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('setAll({}) is valid empty map', () => {
    ProphecyCardsStore.setOne('x', true);
    ProphecyCardsStore.setAll({});
    expect(ProphecyCardsStore.getAll()).toEqual({});
  });

  it('bumps version', () => {
    const v0 = ProphecyCardsStore.getVersion();
    ProphecyCardsStore.setAll({ a: true });
    expect(ProphecyCardsStore.getVersion()).toBe(v0 + 1);
  });
});
