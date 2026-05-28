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
import { AnnotationStore, migrateAnnotations } from './annotation-store.js';
import { NoteStore } from './note-store.js';

beforeEach(() => {
  // Isolate each test: clear localStorage + bust the AnnotationStore
  // module cache so a fresh load() picks up the cleared storage.
  localStorage.clear();
  AnnotationStore._resetForTests({ forceLoaded: true });
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

/* ─────────────────────────────────────────────────────────────────────────
   Post-Q5.3: useSyncExternalStore pattern (Q7 migration).
   ─────────────────────────────────────────────────────────────────────────
   The new pattern that REPLACES the hlTick cache-bust. The store's _bump()
   call after each mutation notifies useSyncExternalStore subscribers, which
   triggers React to call getVersion() and re-render the component. The
   component then reads fresh data directly from the store — no useMemo,
   no phantom deps, no eslint disable.
   ───────────────────────────────────────────────────────────────────────── */
describe('AnnotationStore useSyncExternalStore (Q7.2 pattern)', () => {
  it('E) subscribe + read pattern — consumer sees fresh data after mutation', () => {
    const { result } = renderHook(
      (/** @type {{ hlKey: string }} */ { hlKey }) => {
        React.useSyncExternalStore(
          React.useCallback((cb) => AnnotationStore.subscribe(cb), []),
          () => AnnotationStore.getVersion()
        );
        return AnnotationStore.get(hlKey);
      },
      { initialProps: { hlKey: 'letter:test:0' } }
    );
    expect(result.current).toEqual([]);

    // Mutation triggers _bump() internally → useSyncExternalStore
    // notifies subscribers → React re-renders → fresh read.
    act(() => {
      AnnotationStore.add('letter:test:0', {
        id: 'ann_e', groupId: 'ann_e', kind: 'highlight', color: 'yellow',
        start: 0, end: 5, text: 'e',
      });
    });

    // NO rerender({...}) call needed — the store self-notified.
    expect(result.current.length).toBe(1);
    expect(result.current[0].id).toBe('ann_e');
  });

  it('F) every mutation method calls _bump (add / update / remove / removeGroup / recolorGroup / convertGroup)', () => {
    let notifyCount = 0;
    const unsubscribe = AnnotationStore.subscribe(() => { notifyCount++; });
    try {
      const baselineVersion = AnnotationStore.getVersion();

      // add
      AnnotationStore.add('letter:test:f', {
        id: 'ann_f1', groupId: 'g_f', kind: 'highlight', color: 'yellow',
        start: 0, end: 5, text: 'f1',
      });
      // update
      AnnotationStore.update('letter:test:f', 'ann_f1', { color: 'pink' });
      // recolorGroup
      AnnotationStore.recolorGroup('g_f', 'blue');
      // convertGroup
      AnnotationStore.convertGroup('g_f', 'underline');
      // remove
      AnnotationStore.remove('letter:test:f', 'ann_f1');
      // re-add for removeGroup test
      AnnotationStore.add('letter:test:f', {
        id: 'ann_f2', groupId: 'g_f2', kind: 'highlight', color: 'red',
        start: 0, end: 5, text: 'f2',
      });
      // removeGroup
      AnnotationStore.removeGroup('g_f2');

      // 7 mutations should have fired 7 notifications.
      expect(notifyCount).toBe(7);
      // getVersion should have incremented 7 times.
      expect(AnnotationStore.getVersion()).toBe(baselineVersion + 7);
    } finally {
      unsubscribe();
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   migrateAnnotations() — one-time legacy-shape upgrade.
   ─────────────────────────────────────────────────────────────────────────
   Pre-AnnotationStore the data lived in `vot-highlights` (one bag per
   hlKey of segment-with-optional-note records). The new model splits
   that into TWO stores:

     vot-annotations: hlKey → [{ id, groupId, kind, color, start, end,
                                 text, created, updated }, ...]
     vot-notes:       groupId → { groupId, body, color, notebookIds,
                                  fullText, keys, created, updated }

   migrateAnnotations() runs ONCE per browser profile (gated by the
   `vot-ann-migrated` LS flag) and transforms the bag. It auto-runs at
   module load, but each test below clears LS first and then re-invokes
   the function manually with a known LS state.

   Silent-failure modes covered:
     - Promoting kind on group-level (any segment with a note promotes
       the WHOLE group to kind:'note').
     - Default kind selection (style:'underline' → 'underline'; else
       'highlight') comes from the FIRST entry in the group, not the
       majority.
     - Empty `note` strings (whitespace-only) do NOT promote to note.
     - groupId inference: missing groupId falls back to the entry's id
       so orphan singles each get a unique group.
     - The longest non-empty note across multi-entry groups is the body.
   ───────────────────────────────────────────────────────────────────────── */
describe('migrateAnnotations() — legacy vot-highlights upgrade', () => {
  beforeEach(() => {
    localStorage.clear();
    AnnotationStore._resetForTests({ forceLoaded: true });
    NoteStore._resetForTests({ forceLoaded: true });
  });

  it('is a no-op when vot-ann-migrated flag is already set', () => {
    localStorage.setItem('vot-ann-migrated', '1');
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [{ id: 'ann_x', start: 0, end: 5, text: 'hi', style: 'highlight' }],
    }));

    migrateAnnotations();

    // No transformation performed — vot-annotations stays absent.
    expect(localStorage.getItem('vot-annotations')).toBeNull();
    expect(localStorage.getItem('vot-notes')).toBeNull();
    // The legacy raw stays untouched (left in place as a backup per the
    // module-level header comment).
    expect(localStorage.getItem('vot-highlights')).not.toBeNull();
  });

  it('is a no-op when no legacy vot-highlights data exists (still sets the flag)', () => {
    // Fresh LS — gate flag not set, nothing to migrate.
    expect(localStorage.getItem('vot-ann-migrated')).toBeNull();
    expect(localStorage.getItem('vot-highlights')).toBeNull();

    migrateAnnotations();

    // No annotations / notes were created (no legacy data to convert).
    expect(localStorage.getItem('vot-annotations')).toBeNull();
    expect(localStorage.getItem('vot-notes')).toBeNull();
    // But the gate flag IS set so a subsequent boot doesn't re-run.
    expect(localStorage.getItem('vot-ann-migrated')).toBe('1');
  });

  it('converts a legacy highlight to an annotation segment with kind:"highlight"', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        {
          id: 'ann_h1', start: 5, end: 12, color: 'yellow', style: 'highlight',
          text: 'beloved', created: 1700000000000,
        },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0']).toBeDefined();
    expect(ann['letter:v1:0'].length).toBe(1);
    const seg = ann['letter:v1:0'][0];
    expect(seg.id).toBe('ann_h1');
    expect(seg.kind).toBe('highlight');
    expect(seg.color).toBe('yellow');
    expect(seg.text).toBe('beloved');
    expect(seg.start).toBe(5);
    expect(seg.end).toBe(12);
  });

  it('assigns groupId from id when missing (orphan single gets its own group)', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        // No groupId field — should fall back to id.
        { id: 'ann_seed', start: 0, end: 5, color: 'green', text: 'hi', style: 'highlight' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].groupId).toBe('ann_seed');
  });

  it('preserves an explicit groupId when present (multi-segment group)', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'ann_a', groupId: 'grp_x', start: 0, end: 5, color: 'yellow', text: 'a', style: 'highlight' },
        { id: 'ann_b', groupId: 'grp_x', start: 6, end: 10, color: 'yellow', text: 'b', style: 'highlight' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    const segs = ann['letter:v1:0'];
    expect(segs.length).toBe(2);
    expect(segs[0].groupId).toBe('grp_x');
    expect(segs[1].groupId).toBe('grp_x');
  });

  it('maps style:"underline" → kind:"underline"', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'ann_u', start: 0, end: 5, color: 'pink', text: 'u', style: 'underline' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].kind).toBe('underline');
  });

  it('maps style other than "underline" → kind:"highlight" (default branch)', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        // style explicit but not 'underline' → highlight.
        { id: 'ann_h', start: 0, end: 5, color: 'yellow', text: 'h', style: 'highlight' },
      ],
      'letter:v1:1': [
        // style missing → highlight (default fallback).
        { id: 'ann_d', start: 0, end: 5, color: 'green', text: 'd' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].kind).toBe('highlight');
    expect(ann['letter:v1:1'][0].kind).toBe('highlight');
  });

  it('extracts a non-empty note into NoteStore AND promotes the group kind to "note"', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        {
          id: 'ann_n', groupId: 'grp_n', start: 0, end: 10, color: 'pink',
          text: 'pondered', style: 'highlight', note: 'My thoughts on this verse',
          created: 1700000000000,
        },
      ],
    }));

    migrateAnnotations();

    // Annotation side — kind promoted to 'note'.
    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].kind).toBe('note');

    // NoteStore side — record exists with the body + the hlKey in keys[].
    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    expect(notes['grp_n']).toBeDefined();
    expect(notes['grp_n'].body).toBe('My thoughts on this verse');
    expect(notes['grp_n'].groupId).toBe('grp_n');
    expect(notes['grp_n'].keys).toEqual(['letter:v1:0']);
    expect(notes['grp_n'].notebookIds).toEqual([]);
    expect(notes['grp_n'].color).toBe('pink');
  });

  it('whitespace-only note does NOT promote the group to "note"', () => {
    // The hasNote check uses `e.note && e.note.trim()` — a blank-after-
    // trim note must not flip kind to 'note'.
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        {
          id: 'ann_blank', start: 0, end: 5, color: 'yellow',
          text: 't', style: 'highlight', note: '   ',
        },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].kind).toBe('highlight');  // NOT note
    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    expect(notes['ann_blank']).toBeUndefined();  // no note record
  });

  it('multi-segment group: any segment with a note promotes the WHOLE group', () => {
    // First entry has no note; second entry HAS a note. The group's kind
    // should be 'note' for both segments (group-level decision).
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'a1', groupId: 'grp_z', start: 0, end: 5, color: 'yellow', text: 'a1', style: 'highlight' },
        { id: 'a2', groupId: 'grp_z', start: 6, end: 10, color: 'yellow', text: 'a2', style: 'highlight', note: 'see also' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].kind).toBe('note');
    expect(ann['letter:v1:0'][1].kind).toBe('note');
    // NoteStore has the note for the group.
    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    expect(notes['grp_z']).toBeDefined();
    expect(notes['grp_z'].body).toBe('see also');
  });

  it('picks the longest non-empty note as the canonical body', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'a1', groupId: 'grp_long', start: 0, end: 5, color: 'yellow', text: 'a', style: 'highlight', note: 'short' },
        { id: 'a2', groupId: 'grp_long', start: 6, end: 10, color: 'yellow', text: 'b', style: 'highlight', note: 'this is the longest note across the segments' },
        { id: 'a3', groupId: 'grp_long', start: 11, end: 15, color: 'yellow', text: 'c', style: 'highlight', note: 'mid-len' },
      ],
    }));

    migrateAnnotations();

    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    expect(notes['grp_long'].body).toBe('this is the longest note across the segments');
  });

  it('joins all texts in fullText with " … " separator', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'a1', groupId: 'grp_f', start: 0, end: 5, color: 'yellow', text: 'first', style: 'highlight', note: 'n' },
        { id: 'a2', groupId: 'grp_f', start: 6, end: 10, color: 'yellow', text: 'second', style: 'highlight' },
      ],
    }));

    migrateAnnotations();

    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    expect(notes['grp_f'].fullText).toBe('first … second');
  });

  it('uses fallback created/updated timestamps when the legacy entry has none', () => {
    // Anchor "now" so we can assert created/updated fell into a recent
    // window when the legacy field was missing.
    const t0 = Date.now();
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'no_ts', start: 0, end: 5, color: 'yellow', text: 't', style: 'highlight' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    const seg = ann['letter:v1:0'][0];
    // No created on legacy entry → falls back to Date.now() (>= t0).
    expect(seg.created).toBeGreaterThanOrEqual(t0);
    expect(seg.updated).toBeGreaterThanOrEqual(t0);
  });

  it('preserves color, defaulting to "yellow" when missing', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'with_color', start: 0, end: 5, color: 'pink', text: 'a', style: 'highlight' },
        { id: 'no_color', start: 6, end: 10, text: 'b', style: 'highlight' },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0'][0].color).toBe('pink');
    expect(ann['letter:v1:0'][1].color).toBe('yellow');
  });

  it('sets the vot-ann-migrated flag after success so subsequent calls are no-ops', () => {
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'ann_1', start: 0, end: 5, color: 'yellow', text: 't', style: 'highlight' },
      ],
    }));

    expect(localStorage.getItem('vot-ann-migrated')).toBeNull();

    migrateAnnotations();
    expect(localStorage.getItem('vot-ann-migrated')).toBe('1');

    // Second call is a no-op: pre-seed vot-annotations with marker data
    // and verify the function doesn't overwrite it.
    localStorage.setItem('vot-annotations', '{"marker":"untouched"}');
    migrateAnnotations();
    expect(localStorage.getItem('vot-annotations')).toBe('{"marker":"untouched"}');
  });

  it('preserves every field across the transformation (full-shape pin)', () => {
    // Pin a legacy entry with every documented field and verify each
    // maps to its new location with the expected coercion.
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:vol2:7': [
        {
          id: 'ann_pin',
          groupId: 'grp_pin',
          color: 'green',
          style: 'underline',  // but note will promote to 'note'
          text: 'the quick brown fox',
          note: 'A fox is a clever creature.',
          start: 17,
          end: 35,
          created: 1700000000000,
        },
      ],
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    const seg = ann['letter:vol2:7'][0];
    expect(seg.id).toBe('ann_pin');
    expect(seg.groupId).toBe('grp_pin');
    expect(seg.color).toBe('green');
    expect(seg.text).toBe('the quick brown fox');
    expect(seg.start).toBe(17);
    expect(seg.end).toBe(35);
    expect(seg.created).toBe(1700000000000);
    expect(seg.updated).toBe(1700000000000);  // copied from created when no separate updated
    // kind: hasNote wins over style:'underline' — promoted to 'note'.
    expect(seg.kind).toBe('note');

    const notes = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-notes')));
    const note = notes['grp_pin'];
    expect(note.groupId).toBe('grp_pin');
    expect(note.body).toBe('A fox is a clever creature.');
    expect(note.color).toBe('green');
    expect(note.notebookIds).toEqual([]);
    expect(note.fullText).toBe('the quick brown fox');
    expect(note.keys).toEqual(['letter:vol2:7']);
    expect(note.created).toBe(1700000000000);
    expect(note.updated).toBe(1700000000000);
  });

  it('skips empty buckets — keys with no resulting segments are omitted', () => {
    // The migration only writes keys that have at least one converted
    // segment. An empty input bucket should be dropped.
    localStorage.setItem('vot-highlights', JSON.stringify({
      'letter:v1:0': [
        { id: 'a', start: 0, end: 5, color: 'yellow', text: 'a', style: 'highlight' },
      ],
      'letter:v1:1': [],  // empty bucket
    }));

    migrateAnnotations();

    const ann = JSON.parse(/** @type {string} */ (localStorage.getItem('vot-annotations')));
    expect(ann['letter:v1:0']).toBeDefined();
    expect(ann['letter:v1:1']).toBeUndefined();
  });
});
