/* W1.5(b) — useHistorySync tests.
   ──────────────────────────────────
   Focus: the suppress mechanism + initial-mount guard + dep-change push.
   What we're NOT testing here (per PLAN.txt): popstate dispatching —
   jsdom's history implementation doesn't fire popstate reliably across
   programmatic pushState calls. That's validated via preview_eval against
   real browsers (Chrome/Firefox/Edge) in W1.6.

   The bugs this catches:
     - Initial mount pushing a redundant entry (would double-up the
       bootstrap state, requiring an extra back press to exit)
     - StrictMode setup-cleanup-setup pushing a spurious entry
     - Nav-key change failing to push (would defeat the entire layer)
     - suppress flag failing to consume (would block legitimate pushes)
     - suppress flag stranding after a "false" return (would silently
       skip the next legitimate user nav)
     - Android guard failing (would push history inside the APK shell
       where Kotlin handles back via window.handleAndroidBack — overhead
       at best, behavioral interference at worst)
     - __historyReady flag never set (would break Firefox's
       popstate-on-load guard in W1.5(d))
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useHistorySync,
  suppressNextHistoryPush,
  clearSuppressNextHistoryPush,
} from './use-history-sync.js';

const _origPushState = history.pushState;
let _pushCalls = [];

beforeEach(() => {
  _pushCalls = [];
  // Spy on pushState — jsdom implements it but lets us count calls.
  history.pushState = function(state, title, url) {
    _pushCalls.push({ state, title, url });
    return _origPushState.call(history, state, title, url);
  };
  // Clear the Android guard between tests.
  delete window.AndroidBridge;
  delete window.__historyReady;
  // Defensively clear any stranded suppress flag from a prior test.
  clearSuppressNextHistoryPush();
});

/** Build a standard nav-key with sensible defaults. */
function nav(overrides) {
  return {
    screen: 'home',
    bookId: null,
    chapterNum: null,
    letterId: null,
    studyId: null,
    studyChapterId: null,
    genreId: null,
    gardenPage: null,
    ...overrides,
  };
}

describe('useHistorySync — initial mount', () => {
  it('does NOT push on first mount (bootstrap state is already the current entry)', () => {
    renderHook(() => useHistorySync(nav({ screen: 'home' })));
    expect(_pushCalls).toEqual([]);
  });

  it('sets window.__historyReady = true after first mount (Firefox guard)', () => {
    renderHook(() => useHistorySync(nav({ screen: 'home' })));
    expect(window.__historyReady).toBe(true);
  });
});

describe('useHistorySync — nav-key changes', () => {
  it('pushes on screen change', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    expect(_pushCalls).toEqual([]);
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(1);
  });

  it('pushes on bookId change', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 }) },
    });
    rerender({ k: nav({ screen: 'bible-ch', bookId: 'exodus', chapterNum: 1 }) });
    expect(_pushCalls.length).toBe(1);
  });

  it('pushes on chapterNum change', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 }) },
    });
    rerender({ k: nav({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 2 }) });
    expect(_pushCalls.length).toBe(1);
  });

  it('does NOT push when no nav-key field changed (StrictMode safety / re-render no-op)', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    // Re-render with structurally identical key — should not push.
    rerender({ k: nav({ screen: 'home' }) });
    rerender({ k: nav({ screen: 'home' }) });
    expect(_pushCalls).toEqual([]);
  });

  it('pushes empty state object (Option B from PLAN.txt + [[root-of-history-pwa]])', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(1);
    expect(_pushCalls[0].state).toEqual({});
  });

  it('accumulates pushes across multiple sequential nav changes', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    rerender({ k: nav({ screen: 'library' }) });
    rerender({ k: nav({ screen: 'notes-index' }) });
    rerender({ k: nav({ screen: 'library' }) });
    rerender({ k: nav({ screen: 'home' }) });
    // 4 nav changes = 4 pushes (this is the "rapid nav inflates back stack"
    // known UX rough edge documented in PLAN.txt; the test asserts the
    // behavior is intentional and consistent).
    expect(_pushCalls.length).toBe(4);
  });
});

describe('useHistorySync — suppressNextHistoryPush', () => {
  it('suppresses exactly one push, then resumes normal behavior', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });

    suppressNextHistoryPush();
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(0); // suppressed

    rerender({ k: nav({ screen: 'notes-index' }) });
    expect(_pushCalls.length).toBe(1); // resumed
  });

  it('suppress is idempotent across multiple calls (still one-shot)', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });

    suppressNextHistoryPush();
    suppressNextHistoryPush();
    suppressNextHistoryPush();
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(0); // still one push suppressed

    rerender({ k: nav({ screen: 'home' }) });
    expect(_pushCalls.length).toBe(1); // resumed on the next
  });

  it('clearSuppressNextHistoryPush() prevents stranding when no nav change follows', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });

    // Simulate the W1.5(c)/(d) "false" return path: suppress + back-nav
    // call that returns "false" + caller calls clear because no state
    // change followed.
    suppressNextHistoryPush();
    // ...handleAndroidBack returns "false" → no state change → no effect ...
    clearSuppressNextHistoryPush();

    // The next legitimate user nav MUST push normally — the flag must
    // not have stranded.
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(1);
  });

  it('suppress survives across renders that DID change nav-key but were no-op for the effect', () => {
    // Edge case: suppress called while no nav change is pending. The
    // flag should persist until the NEXT real nav change consumes it.
    suppressNextHistoryPush();

    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    // Initial mount records the key but doesn't push — and CRITICALLY
    // shouldn't consume the suppress flag (the flag is meant for
    // future back-induced navs, not initial mount).
    expect(_pushCalls).toEqual([]);

    rerender({ k: nav({ screen: 'library' }) });
    // Hmm — what's the right behavior here? The suppress was called
    // BEFORE the hook mounted. The first dep-change push should
    // consume it. This is a defensible design choice; the test pins
    // the behavior so future changes are deliberate.
    expect(_pushCalls.length).toBe(0); // suppress consumed

    rerender({ k: nav({ screen: 'home' }) });
    expect(_pushCalls.length).toBe(1); // resumed
  });
});

describe('useHistorySync — Android guard', () => {
  it('does NOT push on Android (window.AndroidBridge present)', () => {
    window.AndroidBridge = { stub: true };

    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
    });
    rerender({ k: nav({ screen: 'library' }) });
    rerender({ k: nav({ screen: 'notes-index' }) });
    expect(_pushCalls).toEqual([]);
  });

  it('does NOT set __historyReady on Android (the Firefox guard is web-only)', () => {
    window.AndroidBridge = { stub: true };
    renderHook(() => useHistorySync(nav({ screen: 'home' })));
    expect(window.__historyReady).toBeUndefined();
  });
});

describe('useHistorySync — StrictMode tolerance', () => {
  it('does not push on initial mount under StrictMode (setup-cleanup-setup)', () => {
    renderHook(() => useHistorySync(nav({ screen: 'home' })), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    // Even with the double-invoke, no spurious push.
    expect(_pushCalls).toEqual([]);
  });

  it('pushes ONCE per nav-key change under StrictMode', () => {
    const { rerender } = renderHook(({ k }) => useHistorySync(k), {
      initialProps: { k: nav({ screen: 'home' }) },
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    rerender({ k: nav({ screen: 'library' }) });
    expect(_pushCalls.length).toBe(1);
  });
});
