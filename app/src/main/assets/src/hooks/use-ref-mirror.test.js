/* Q5.1 infrastructure smoke test.
   ────────────────────────────────
   Q5.1 is the test-harness infrastructure landing commit. This file
   exists to prove the harness WORKS end-to-end: vitest discovers the
   file, jsdom provides window, React is global, @testing-library/react's
   renderHook lifts a hook into a test render, and assertions fire.

   It is INTENTIONALLY trivial. useRefMirror is the smallest hook in the
   codebase (one useRef + assign-during-render). Two assertions:
     1. The ref's .current updates when the input value changes
     2. The ref OBJECT identity is stable across renders

   Real test coverage starts in Q5.2 with _validateTabState (per the
   user-pinned priority: pure function, zero deps, 13 input→output rules
   — exactly the shape that "one rule wrong, nobody notices" bugs hide in).

   When this file fails, the harness is broken — not the hook. */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRefMirror } from './use-ref-mirror.js';

describe('useRefMirror (harness smoke)', () => {
  it('returns a ref whose .current reflects the latest value', () => {
    const { result, rerender } = renderHook(
      (/** @type {{ value: any }} */ { value }) => useRefMirror(value),
      { initialProps: /** @type {{ value: any }} */ ({ value: 1 }) }
    );
    expect(result.current.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current.current).toBe(2);
    rerender({ value: 'string' });
    expect(result.current.current).toBe('string');
  });

  it('maintains stable ref-object identity across renders', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useRefMirror(value),
      { initialProps: { value: 'a' } }
    );
    const firstRef = result.current;
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    // Same ref OBJECT — only .current changed. Critical invariant: callers
    // that capture the ref by identity (in closures, in deps arrays) need
    // it to be referentially equal across the component's lifetime.
    expect(result.current).toBe(firstRef);
  });
});
