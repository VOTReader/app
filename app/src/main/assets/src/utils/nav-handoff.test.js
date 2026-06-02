/* D2 — navHandoff tests.
   ─────────────────────────
   The typed one-shot navigation hand-off slots (utils/nav-handoff.js).
   Verifies the set / take / peek / clear / has contract, null handling,
   and that state lives on window so every bundle's module copy shares it.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { navHandoff } from './nav-handoff.js';

beforeEach(() => {
  navHandoff._resetForTests();
});

describe('navHandoff', () => {
  it('set + peek round-trips a value without clearing it', () => {
    navHandoff.set('pendingHighlight', { excerpt: 'x', letterId: 'l1' });
    expect(navHandoff.peek('pendingHighlight')).toEqual({ excerpt: 'x', letterId: 'l1' });
    // peek does NOT consume — a second peek still sees it.
    expect(navHandoff.peek('pendingHighlight')).toEqual({ excerpt: 'x', letterId: 'l1' });
    expect(navHandoff.has('pendingHighlight')).toBe(true);
  });

  it('take reads AND clears (one-shot consume)', () => {
    navHandoff.set('pendingSearchQuery', 'hello');
    expect(navHandoff.take('pendingSearchQuery')).toBe('hello');
    // gone after take
    expect(navHandoff.peek('pendingSearchQuery')).toBeNull();
    expect(navHandoff.has('pendingSearchQuery')).toBe(false);
    expect(navHandoff.take('pendingSearchQuery')).toBeNull();
  });

  it('peek / take on an absent slot return null (never throw)', () => {
    expect(navHandoff.peek('nope')).toBeNull();
    expect(navHandoff.take('nope')).toBeNull();
    expect(navHandoff.has('nope')).toBe(false);
  });

  it('clear drops a slot and is idempotent', () => {
    navHandoff.set('notesReturnCtx', { tab: 'all-notes', drilledNbId: null });
    navHandoff.clear('notesReturnCtx');
    expect(navHandoff.peek('notesReturnCtx')).toBeNull();
    expect(() => navHandoff.clear('notesReturnCtx')).not.toThrow(); // idempotent
  });

  it('set(null) is read back as null but the slot exists until cleared', () => {
    // Matches the old `window.__x = null` convention: a writer can stamp null.
    navHandoff.set('pendingScrollHlKey', null);
    expect(navHandoff.has('pendingScrollHlKey')).toBe(true);
    expect(navHandoff.peek('pendingScrollHlKey')).toBeNull();
    expect(navHandoff.take('pendingScrollHlKey')).toBeNull();
    expect(navHandoff.has('pendingScrollHlKey')).toBe(false);
  });

  it('slots are independent', () => {
    navHandoff.set('a', 1);
    navHandoff.set('b', 2);
    expect(navHandoff.take('a')).toBe(1);
    expect(navHandoff.peek('b')).toBe(2); // taking 'a' left 'b' alone
  });

  it('state is backed by window so separate module copies share it (cross-bundle)', () => {
    // Simulate a second bundle's module copy by operating directly on the
    // window-held backing Map the module reads/writes.
    navHandoff.set('pendingOpenNote', 'g9');
    expect(window.__navHandoffSlots.get('pendingOpenNote')).toBe('g9');
    // A write made "from the other bundle" (directly on the shared Map) is
    // visible through the navHandoff API.
    window.__navHandoffSlots.set('pendingOpenNote', 'g-other');
    expect(navHandoff.peek('pendingOpenNote')).toBe('g-other');
  });

  it('_resetForTests wipes every slot', () => {
    navHandoff.set('a', 1);
    navHandoff.set('b', 2);
    navHandoff._resetForTests();
    expect(navHandoff.has('a')).toBe(false);
    expect(navHandoff.has('b')).toBe(false);
  });
});
