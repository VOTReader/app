/* Q5.3 — hlTick cache-bust regression test (validates Bin 4 suppresses).
   ─────────────────────────────────────────────────────────────────────
   This test resolves an UNVERIFIED HYPOTHESIS: the 24 `eslint-disable-
   next-line react-hooks/exhaustive-deps -- cache-bust signal` cites
   added in Q3.3e-hlTick claim that listing `hlTick` in a useMemo's deps
   array is load-bearing — that removing it would cause consumers to see
   stale store data. Per [[test-the-suppresses]], every suppress is a
   hypothesis that tests must validate.

   The pattern under test (lifted verbatim from BookmarkIcon, NoteSheet,
   LibraryScreen, etc.):

       const x = React.useMemo(() => SomeStore.get(hlKey), [hlKey, hlTick]);

   We test it at the level it's actually used: a renderHook scenario
   that mirrors what a real React component does — hlKey and hlTick
   threaded as props so they're proper render-tracked values (ESLint's
   exhaustive-deps rule correctly rejects outer-const refs in deps).
   NO MOCKS on the stores per [[dont-over-mock]] — real AnnotationStore
   + jsdom localStorage.

   Two scenarios validated:
     A) WITH hlTick in deps (the production pattern): mutation + hlTick
        bump → consumer sees the new data.
     B) WITHOUT hlTick in deps (the would-be-broken pattern): mutation +
        rerender → consumer sees the OLD data (stale).

   If A passes and B passes (asserting stale), the suppress is JUSTIFIED.
   If both show fresh data, the suppress is unnecessary.
*/

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AnnotationStore } from './annotation-store.js';

beforeEach(() => {
  // Isolate each test: clear localStorage + bust the AnnotationStore
  // module cache so a fresh load() picks up the cleared storage.
  localStorage.clear();
  AnnotationStore._cache = null;
});

describe('AnnotationStore hlTick cache-bust regression (Bin 4 validation)', () => {
  it('A) WITH hlTick in deps — consumer sees fresh data after mutation + hlTick bump', () => {
    const { result, rerender } = renderHook(
      (/** @type {{ hlKey: string, hlTick: number }} */ { hlKey, hlTick }) => React.useMemo(
        () => AnnotationStore.get(hlKey),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal: this test EXERCISES the production Bin 4 pattern; the disable cite mirrors what BookmarkIcon/NoteSheet/etc. carry. (Removing the cite would lint-fail this very test that proves the pattern works.)
        [hlKey, hlTick]
      ),
      { initialProps: { hlKey: 'letter:test:0', hlTick: 0 } }
    );

    // Initial state — empty.
    expect(result.current).toEqual([]);

    // Mutate the store (the same way the app does on selection → highlight).
    act(() => {
      AnnotationStore.add('letter:test:0', {
        id: 'ann_1', groupId: 'ann_1', kind: 'highlight', color: 'yellow',
        start: 0, end: 10, text: 'hello world',
      });
    });

    // Bump hlTick — what the app does after every store mutation (via
    // setHlTick(t => t + 1)). This re-renders the consumer.
    rerender({ hlKey: 'letter:test:0', hlTick: 1 });

    // With hlTick in deps, the memo recomputes and the consumer sees
    // the new annotation.
    expect(result.current.length).toBe(1);
    expect(result.current[0].id).toBe('ann_1');
    expect(result.current[0].kind).toBe('highlight');
  });

  it('B) WITHOUT hlTick in deps — consumer sees stale data (suppress is justified)', () => {
    // The broken pattern: deps array is `[hlKey]` only. We don't even
    // pass hlTick — just rerender with the same hlKey to simulate a
    // parent re-render (e.g. a sibling state update). The memo's deps
    // don't change, so it returns the cached initial value forever.
    const { result, rerender } = renderHook(
      (/** @type {{ hlKey: string }} */ { hlKey }) => React.useMemo(
        () => AnnotationStore.get(hlKey),
        [hlKey]
      ),
      { initialProps: { hlKey: 'letter:test:0' } }
    );

    expect(result.current).toEqual([]);

    act(() => {
      AnnotationStore.add('letter:test:0', {
        id: 'ann_2', groupId: 'ann_2', kind: 'highlight', color: 'yellow',
        start: 0, end: 10, text: 'hello world',
      });
    });

    rerender({ hlKey: 'letter:test:0' });  // same hlKey — just retrigger render

    // Without hlTick in deps and with hlKey unchanged, useMemo returns
    // its cached result from the initial render — the empty array. The
    // consumer sees STALE data even though the store has been mutated
    // AND the parent re-rendered.
    //
    // This proves the Bin 4 cite is justified: removing hlTick from the
    // production pattern's deps would silently break highlight/note/
    // bookmark refresh after every store mutation.
    expect(result.current.length).toBe(0);
  });

  it('C) hlTick bump alone (no store mutation) — consumer state unchanged but memo recomputes', () => {
    // Edge case: hlTick increments but the store hasn't been mutated.
    // The memo recomputes (because hlTick is in deps) but returns the
    // same data. No false-positive update — just a (cheap) recompute.
    AnnotationStore.add('letter:test:0', {
      id: 'ann_seed', groupId: 'ann_seed', kind: 'highlight', color: 'yellow',
      start: 0, end: 5, text: 'seed',
    });

    const { result, rerender } = renderHook(
      (/** @type {{ hlKey: string, hlTick: number }} */ { hlKey, hlTick }) => React.useMemo(
        () => AnnotationStore.get(hlKey),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal (production Bin 4 pattern; see test A's cite)
        [hlKey, hlTick]
      ),
      { initialProps: { hlKey: 'letter:test:0', hlTick: 0 } }
    );

    expect(result.current.length).toBe(1);
    expect(result.current[0].id).toBe('ann_seed');

    rerender({ hlKey: 'letter:test:0', hlTick: 1 });

    // Same data — but the memo DID recompute (we can't directly observe
    // the recompute count without a spy; this is implicit).
    expect(result.current.length).toBe(1);
    expect(result.current[0].id).toBe('ann_seed');
  });

  it('D) hlKey change — memo recomputes via hlKey alone (the always-tracked dep)', () => {
    AnnotationStore.add('letter:test:0', {
      id: 'ann_a', groupId: 'ann_a', kind: 'highlight', color: 'yellow',
      start: 0, end: 5, text: 'a',
    });
    AnnotationStore.add('letter:test:1', {
      id: 'ann_b', groupId: 'ann_b', kind: 'underline', color: 'green',
      start: 0, end: 5, text: 'b',
    });

    // hlTick stays 0 — only hlKey changes. Proves hlKey alone drives
    // the recompute when the anchor changes (e.g. user navigates to a
    // different verse).
    const { result, rerender } = renderHook(
      (/** @type {{ hlKey: string, hlTick: number }} */ { hlKey, hlTick }) => React.useMemo(
        () => AnnotationStore.get(hlKey),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- cache-bust signal (production Bin 4 pattern; see test A's cite)
        [hlKey, hlTick]
      ),
      { initialProps: { hlKey: 'letter:test:0', hlTick: 0 } }
    );

    expect(result.current[0].id).toBe('ann_a');

    rerender({ hlKey: 'letter:test:1', hlTick: 0 });

    expect(result.current[0].id).toBe('ann_b');
    expect(result.current[0].kind).toBe('underline');
  });
});
