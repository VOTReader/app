/* P7g — useReadProgress tests.
   ───────────────────────────────
   useReadProgress owns the App-level per-collection read-cursor state.
   The hook lives in useMarkAsRead.js (same module, distinct
   responsibility — see header for rationale).

   Silent-failure modes worth guarding:

     A) The markAsReadEnabled gate. markRead is supposed to NO-OP when
        the setting is off (existing marks survive). If the gate is
        inverted, every reading view silently disables progress
        tracking. Tested with ref-mirror reads-after-rerender to
        verify the closure sees the latest setting value.

     B) Key format collisions. The "v1:<bid>:<cid>" shape is the only
        thing keeping read-progress for "matthew:5" distinct from
        a hypothetical "matthe:w5". A bug in getReadKey is invisible
        because nothing else parses the key — tests pin the exact
        format string so a refactor can't silently change it.

     C) clearReadForBook precision. It must clear ONLY entries whose
        key matches `v1:<bid>:` exactly — a too-loose prefix would
        clear "matthew:5" when the user requested "matthe" cleanup.
        Mostly a guard against future refactors getting clever with
        startsWith semantics.

     D) State immutability — markRead/unmarkRead return new objects,
        not mutated ones. Critical for React's reference-equality
        change detection.
*/

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadProgress } from './useMarkAsRead.js';

const setup = (overrides = {}) => {
  const args = { savedReadItems: {}, markAsReadEnabled: true, ...overrides };
  return renderHook((p) => useReadProgress(p), { initialProps: args });
};

describe('useReadProgress — initial state', () => {
  it('hydrates from savedReadItems', () => {
    const { result } = setup({ savedReadItems: { 'v1:matthew:5': true } });
    expect(result.current.readItems).toEqual({ 'v1:matthew:5': true });
    expect(result.current.isRead('matthew', 5)).toBe(true);
  });

  it('defaults to {} when savedReadItems is missing/undefined', () => {
    const { result } = setup({ savedReadItems: undefined });
    expect(result.current.readItems).toEqual({});
  });
});

describe('useReadProgress — isRead + getReadKey shape', () => {
  it('isRead pins the v1:<bid>:<cid> key shape', () => {
    const { result } = setup({ savedReadItems: { 'v1:matthew:5': true } });
    expect(result.current.isRead('matthew', 5)).toBe(true);
    expect(result.current.isRead('matthew', 6)).toBe(false);
    expect(result.current.isRead('mark', 5)).toBe(false);
  });
});

describe('useReadProgress — markRead', () => {
  it('adds a key when markAsRead is enabled', () => {
    const { result } = setup();
    act(() => { result.current.markRead('matthew', 5); });
    expect(result.current.readItems['v1:matthew:5']).toBe(true);
    expect(result.current.isRead('matthew', 5)).toBe(true);
  });

  it('is idempotent — repeated markRead of same key produces the same object', () => {
    const { result } = setup({ savedReadItems: { 'v1:matthew:5': true } });
    const before = result.current.readItems;
    act(() => { result.current.markRead('matthew', 5); });
    // No change → same reference (the `if (!readItems[key])` guard).
    expect(result.current.readItems).toBe(before);
  });

  it('does NOT add when markAsRead is false (gate guard)', () => {
    const { result } = setup({ markAsReadEnabled: false });
    act(() => { result.current.markRead('matthew', 5); });
    expect(result.current.readItems).toEqual({});
  });

  it('respects the gate AFTER it flips mid-session (ref-mirror invariant)', () => {
    // The whole point of mirroring markAsReadEnabled via useRefMirror is
    // that markRead's closure sees the LATEST value. A test that
    // toggles the prop and assert the gate switches direction validates
    // the ref-mirror behavior.
    const { result, rerender } = renderHook(
      ({ enabled }) => useReadProgress({ savedReadItems: {}, markAsReadEnabled: enabled }),
      { initialProps: { enabled: true } }
    );

    act(() => { result.current.markRead('matthew', 5); });
    expect(result.current.isRead('matthew', 5)).toBe(true);

    // Disable mid-session.
    rerender({ enabled: false });

    act(() => { result.current.markRead('matthew', 6); });
    expect(result.current.isRead('matthew', 6)).toBe(false);  // gate caught it
    // Pre-existing mark survives.
    expect(result.current.isRead('matthew', 5)).toBe(true);

    // Re-enable.
    rerender({ enabled: true });
    act(() => { result.current.markRead('matthew', 7); });
    expect(result.current.isRead('matthew', 7)).toBe(true);
  });

  it('produces a new object reference (immutable update)', () => {
    const { result } = setup();
    const before = result.current.readItems;
    act(() => { result.current.markRead('matthew', 5); });
    expect(result.current.readItems).not.toBe(before);
  });
});

describe('useReadProgress — unmarkRead', () => {
  it('removes a key', () => {
    const { result } = setup({ savedReadItems: { 'v1:matthew:5': true, 'v1:mark:1': true } });
    act(() => { result.current.unmarkRead('matthew', 5); });
    expect(result.current.isRead('matthew', 5)).toBe(false);
    // Other keys untouched.
    expect(result.current.isRead('mark', 1)).toBe(true);
  });

  it('is a no-op on an absent key (does not throw)', () => {
    const { result } = setup();
    act(() => { result.current.unmarkRead('nonexistent', 99); });
    expect(result.current.readItems).toEqual({});
  });

  it('produces a new object reference (immutable update)', () => {
    const { result } = setup({ savedReadItems: { 'v1:matthew:5': true } });
    const before = result.current.readItems;
    act(() => { result.current.unmarkRead('matthew', 5); });
    expect(result.current.readItems).not.toBe(before);
  });

  it('is NOT gated by markAsReadEnabled (user can always undo a mark)', () => {
    const { result } = setup({
      savedReadItems: { 'v1:matthew:5': true },
      markAsReadEnabled: false,
    });
    act(() => { result.current.unmarkRead('matthew', 5); });
    expect(result.current.isRead('matthew', 5)).toBe(false);
  });
});

describe('useReadProgress — clearAllProgress', () => {
  it('wipes the entire state', () => {
    const { result } = setup({ savedReadItems: { 'v1:a:1': true, 'v1:b:2': true } });
    act(() => { result.current.clearAllProgress(); });
    expect(result.current.readItems).toEqual({});
  });
});

describe('useReadProgress — clearReadForBook', () => {
  it('clears ONLY entries whose key starts with v1:<bid>:', () => {
    const seed = {
      'v1:matthew:5': true,
      'v1:matthew:6': true,
      'v1:mark:1': true,
      'v1:matt:99': true,  // different book — must survive
    };
    const { result } = setup({ savedReadItems: seed });
    act(() => { result.current.clearReadForBook('matthew'); });
    expect(result.current.readItems).toEqual({
      'v1:mark:1': true,
      'v1:matt:99': true,
    });
  });

  it('precision: clearReadForBook("matt") must NOT match v1:matthew:* (defensive)', () => {
    // The startsWith check is on `v1:matt:` (NOT `v1:matt`) so it
    // requires the COLON separator. Verify that match precision.
    const seed = {
      'v1:matt:99': true,
      'v1:matthew:5': true,
    };
    const { result } = setup({ savedReadItems: seed });
    act(() => { result.current.clearReadForBook('matt'); });
    expect(result.current.readItems['v1:matt:99']).toBeUndefined();
    expect(result.current.readItems['v1:matthew:5']).toBe(true);  // survives
  });

  it('is a no-op when no keys match the bookId', () => {
    const seed = { 'v1:matthew:5': true };
    const { result } = setup({ savedReadItems: seed });
    act(() => { result.current.clearReadForBook('nonexistent'); });
    expect(result.current.readItems).toEqual(seed);
  });
});

// ── Module surface check ────────────────────────────────────────────────

describe('useMarkAsRead.js — module exports both useMarkAsRead AND useReadProgress', () => {
  it('useReadProgress is a function exported alongside useMarkAsRead', async () => {
    const mod = await import('./useMarkAsRead.js');
    expect(typeof mod.useMarkAsRead).toBe('function');
    expect(typeof mod.useReadProgress).toBe('function');
  });
});
