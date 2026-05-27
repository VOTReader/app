/* W1.5(a.1) — useModalRegistry + modalRegistry tests.
   ────────────────────────────────────────────────────
   The modal registry is the keystone of W1.5's Escape-key gating: the
   app-level dispatcher (W1.5(c) in useAndroidBack) reads peek().dismiss
   from this registry instead of calling handleAndroidBack when any
   modal is open. If the registry is buggy in any of these ways, the
   user-facing bug is silent UX corruption:
     - register/unregister out of order → Escape closes the wrong modal
     - shared-ID across instances → one unmount removes all peers
     - re-register doesn't move-to-top → bottom modal absorbs Escape
       instead of the top one
     - dismiss callback frozen at register-time → Escape calls a stale
       closure of the modal's state
     - StrictMode double-invoke leaks an entry → Escape misfires
   All caught here. */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { modalRegistry, useModalRegistry } from './use-modal-registry.js';

beforeEach(() => {
  modalRegistry._reset();
});

describe('modalRegistry imperative API — basic ops', () => {
  it('starts empty', () => {
    expect(modalRegistry.isAnyOpen()).toBe(false);
    expect(modalRegistry.openIds()).toEqual([]);
    expect(modalRegistry.peek()).toBe(null);
  });

  it('register adds an entry; unregister removes it', () => {
    const dismiss = () => {};
    modalRegistry.register({ id: 'foo', dismiss });
    expect(modalRegistry.isAnyOpen()).toBe(true);
    expect(modalRegistry.openIds()).toEqual(['foo']);

    modalRegistry.unregister('foo');
    expect(modalRegistry.isAnyOpen()).toBe(false);
    expect(modalRegistry.openIds()).toEqual([]);
  });

  it('unregister is idempotent for unknown ids', () => {
    expect(() => modalRegistry.unregister('never-registered')).not.toThrow();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('preserves insertion order in openIds()', () => {
    modalRegistry.register({ id: 'a', dismiss: () => {} });
    modalRegistry.register({ id: 'b', dismiss: () => {} });
    modalRegistry.register({ id: 'c', dismiss: () => {} });
    expect(modalRegistry.openIds()).toEqual(['a', 'b', 'c']);
  });

  it('peek() returns the last-registered entry (topmost-by-insertion)', () => {
    modalRegistry.register({ id: 'a', dismiss: () => {} });
    modalRegistry.register({ id: 'b', dismiss: () => {} });
    expect(modalRegistry.peek()?.id).toBe('b');

    modalRegistry.register({ id: 'c', dismiss: () => {} });
    expect(modalRegistry.peek()?.id).toBe('c');

    modalRegistry.unregister('c');
    expect(modalRegistry.peek()?.id).toBe('b');
  });

  it('peek() returns null on empty registry', () => {
    expect(modalRegistry.peek()).toBe(null);
  });

  it('peek().dismiss invokes the registered callback', () => {
    let calls = 0;
    modalRegistry.register({ id: 'foo', dismiss: () => { calls += 1; } });
    modalRegistry.peek().dismiss();
    expect(calls).toBe(1);
  });
});

describe('modalRegistry — defensive input handling', () => {
  it('ignores register without an id', () => {
    modalRegistry.register({ id: '', dismiss: () => {} });
    modalRegistry.register(/** @type {any} */ ({ id: undefined, dismiss: () => {} }));
    modalRegistry.register(/** @type {any} */ ({ id: null, dismiss: () => {} }));
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('ignores register without a function dismiss', () => {
    modalRegistry.register(/** @type {any} */ ({ id: 'foo', dismiss: null }));
    modalRegistry.register(/** @type {any} */ ({ id: 'foo', dismiss: 'not a function' }));
    modalRegistry.register(/** @type {any} */ ({ id: 'foo', dismiss: undefined }));
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('ignores register called with no arg', () => {
    /** @type {any} */
    const reg = modalRegistry.register;
    reg();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('ignores unregister with falsy id', () => {
    modalRegistry.register({ id: 'foo', dismiss: () => {} });
    modalRegistry.unregister('');
    modalRegistry.unregister(null);
    modalRegistry.unregister(undefined);
    expect(modalRegistry.openIds()).toEqual(['foo']);
  });
});

describe('modalRegistry — re-register moves to top (insertion-order update)', () => {
  it('re-registering an existing id moves it to the end of insertion order', () => {
    modalRegistry.register({ id: 'a', dismiss: () => {} });
    modalRegistry.register({ id: 'b', dismiss: () => {} });
    modalRegistry.register({ id: 'c', dismiss: () => {} });
    expect(modalRegistry.peek().id).toBe('c');

    // Re-register 'a' — it should now be topmost, not still at insertion[0].
    modalRegistry.register({ id: 'a', dismiss: () => {} });
    expect(modalRegistry.openIds()).toEqual(['b', 'c', 'a']);
    expect(modalRegistry.peek().id).toBe('a');
  });

  it('re-registering replaces the dismiss callback', () => {
    let firstCalls = 0;
    let secondCalls = 0;
    modalRegistry.register({ id: 'foo', dismiss: () => { firstCalls += 1; } });
    modalRegistry.register({ id: 'foo', dismiss: () => { secondCalls += 1; } });

    modalRegistry.peek().dismiss();
    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);
  });
});

describe('useModalRegistry hook — basic lifecycle', () => {
  it('registers on mount, unregisters on unmount', () => {
    const { unmount } = renderHook(() =>
      useModalRegistry({ id: 'test-modal', dismiss: () => {} })
    );
    expect(modalRegistry.openIds()).toEqual(['test-modal']);

    unmount();
    expect(modalRegistry.openIds()).toEqual([]);
  });

  it('does NOT register when active is false', () => {
    renderHook(() =>
      useModalRegistry({ id: 'inactive', dismiss: () => {}, active: false })
    );
    expect(modalRegistry.openIds()).toEqual([]);
  });

  it('does NOT register when id is empty', () => {
    renderHook(() =>
      useModalRegistry({ id: '', dismiss: () => {} })
    );
    expect(modalRegistry.openIds()).toEqual([]);
  });

  it('toggles registration when active flips', () => {
    const { rerender, unmount } = renderHook(
      ({ active }) => useModalRegistry({ id: 'toggler', dismiss: () => {}, active }),
      { initialProps: { active: false } }
    );
    expect(modalRegistry.openIds()).toEqual([]);

    rerender({ active: true });
    expect(modalRegistry.openIds()).toEqual(['toggler']);

    rerender({ active: false });
    expect(modalRegistry.openIds()).toEqual([]);

    unmount();
    expect(modalRegistry.openIds()).toEqual([]);
  });
});

describe('useModalRegistry hook — dismiss callback freshness (ref-mirror)', () => {
  it('peek().dismiss reads the LATEST dismiss prop, not the mount-time value', () => {
    let calls = [];
    const { rerender } = renderHook(
      ({ tag }) => useModalRegistry({
        id: 'fresh',
        dismiss: () => calls.push(tag),
      }),
      { initialProps: { tag: 'first' } }
    );

    rerender({ tag: 'second' });
    rerender({ tag: 'third' });

    // The dispatcher would call peek().dismiss when Escape fires.
    // The wrapped callback reads dismissRef.current — should hit 'third'.
    modalRegistry.peek().dismiss();
    expect(calls).toEqual(['third']);
  });

  it('does NOT churn registration when only dismiss changes (insertion order preserved)', () => {
    // First modal registers.
    const first = renderHook(
      ({ dismiss }) => useModalRegistry({ id: 'older', dismiss }),
      { initialProps: { dismiss: () => {} } }
    );
    // Second modal registers AFTER — should be at top.
    renderHook(() => useModalRegistry({ id: 'newer', dismiss: () => {} }));
    expect(modalRegistry.peek().id).toBe('newer');

    // Now re-render the older one with a fresh dismiss prop. The hook
    // MUST NOT re-register, or 'older' would jump above 'newer' in
    // insertion order and Escape would dismiss the wrong modal.
    first.rerender({ dismiss: () => {} });
    first.rerender({ dismiss: () => {} });
    first.rerender({ dismiss: () => {} });

    expect(modalRegistry.peek().id).toBe('newer');
    expect(modalRegistry.openIds()).toEqual(['older', 'newer']);
  });
});

describe('useModalRegistry hook — StrictMode double-invoke tolerance', () => {
  it('mount-cleanup-mount cycle ends with exactly one entry', () => {
    // React.StrictMode invokes effects setup→cleanup→setup in dev.
    // The registry MUST land in the same end state as a single mount.
    renderHook(() =>
      useModalRegistry({ id: 'strict-test', dismiss: () => {} }), {
        wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
      }
    );
    // Even under StrictMode's setup-cleanup-setup, only one entry survives.
    expect(modalRegistry.openIds()).toEqual(['strict-test']);
  });

  it('unmount under StrictMode leaves the registry empty', () => {
    const { unmount } = renderHook(() =>
      useModalRegistry({ id: 'strict-unmount', dismiss: () => {} }), {
        wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
      }
    );
    unmount();
    expect(modalRegistry.openIds()).toEqual([]);
  });
});

describe('useModalRegistry hook — multiple concurrent instances (unique-ID contract)', () => {
  it('two instances with distinct IDs both register', () => {
    renderHook(() => useModalRegistry({ id: 'instance-a', dismiss: () => {} }));
    renderHook(() => useModalRegistry({ id: 'instance-b', dismiss: () => {} }));
    expect(modalRegistry.openIds()).toEqual(['instance-a', 'instance-b']);
  });

  it('two instances with the SAME ID collapse — one unmount removes both (the bug unique IDs prevent)', () => {
    // This test documents the FAILURE mode that the unique-ID contract
    // (ConfirmStrip's useId() per instance) exists to prevent. If two
    // ConfirmStrip instances both registered under 'confirm-strip', this
    // is what would happen — exactly the silent bug we don't want.
    const a = renderHook(() => useModalRegistry({ id: 'shared', dismiss: () => {} }));
    renderHook(() => useModalRegistry({ id: 'shared', dismiss: () => {} }));
    expect(modalRegistry.openIds()).toEqual(['shared']);

    a.unmount();
    // BUG: the second instance is still mounted, but the shared id was
    // unregistered by the first instance's cleanup. peek() now returns
    // null even though a modal is visually open.
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('two instances with unique IDs do NOT collapse — the fix', () => {
    const a = renderHook(() => useModalRegistry({ id: 'confirm-strip:1', dismiss: () => {} }));
    renderHook(() => useModalRegistry({ id: 'confirm-strip:2', dismiss: () => {} }));
    expect(modalRegistry.openIds()).toEqual(['confirm-strip:1', 'confirm-strip:2']);

    a.unmount();
    expect(modalRegistry.openIds()).toEqual(['confirm-strip:2']);
    expect(modalRegistry.peek().id).toBe('confirm-strip:2');
  });
});

describe('useModalRegistry hook — id swap on rerender', () => {
  it('changing the id unregisters the old and registers the new', () => {
    const { rerender } = renderHook(
      ({ id }) => useModalRegistry({ id, dismiss: () => {} }),
      { initialProps: { id: 'first-id' } }
    );
    expect(modalRegistry.openIds()).toEqual(['first-id']);

    rerender({ id: 'second-id' });
    expect(modalRegistry.openIds()).toEqual(['second-id']);
  });
});
