/* P7e — useJournalMutations tests.
   ──────────────────────────────────
   useJournalMutations is the tiniest concern on the Phase 1 checklist:
   one function (createAndEditJournal). The test surface is small but
   the silent-failure modes still matter:

     A) Guard order — early-return when JournalStore is undefined
        protects against a half-loaded module graph during cold boot.
        If a future refactor drops this guard, a crash here would
        prevent the journal hub from rendering at all.

     B) Deferred stats handoff (P1-5/P1-7) — the hook must NOT record
        stats or fire milestone toasts at creation (that fired the toast
        on the New-Entry tap, before a word was written, and a backed-out
        blank entry still advanced the streak). It leaves a localStorage
        marker for the editor's first-non-empty-save trigger instead.

     C) The setter ordering matters semantically:
          setJournalEntryId FIRST (so editor knows what to render)
          setScreen NEXT (so route happens after state is ready)
        A reorder would still produce a visible editor in practice
        (React batches), but the per-setter assertions guarantee the
        contract documented in the hook header.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJournalMutations } from './use-journal-mutations.js';

// ── Global stubs ────────────────────────────────────────────────────────
let _prevJournalStore, _prevJournalStatsStore, _prevToast;

beforeEach(() => {
  _prevJournalStore = window.JournalStore;
  _prevJournalStatsStore = window.JournalStatsStore;
  _prevToast = window.jrnShowMilestoneToast;
  localStorage.clear();

  window.JournalStore = { add: vi.fn(() => ({ id: 'jrn-1', created: 1700000000000 })) };
  window.JournalStatsStore = { recordNewEntry: vi.fn(() => []) };
  window.jrnShowMilestoneToast = vi.fn();
});

afterEach(() => {
  window.JournalStore = _prevJournalStore;
  window.JournalStatsStore = _prevJournalStatsStore;
  window.jrnShowMilestoneToast = _prevToast;
});

const makeSetters = () => ({
  setJournalEntryId: vi.fn(),
  setScreen: vi.fn(),
});

const setup = () => {
  const setters = makeSetters();
  const { result } = renderHook(() => useJournalMutations(setters));
  return { result, setters };
};

describe('useJournalMutations — createAndEditJournal', () => {
  it('happy path: adds an entry, sets entryId, nav to editor', () => {
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });

    expect(window.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('jrn-1');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
  });

  it('does NOT record stats or fire milestone toasts at creation (P1-5 — deferred to the first non-empty save)', () => {
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    // The bug: the milestone toast fired on the New-Entry TAP, before a word
    // was written. Both side-effects now live in the editor's first save.
    expect(window.JournalStatsStore.recordNewEntry).not.toHaveBeenCalled();
    expect(window.jrnShowMilestoneToast).not.toHaveBeenCalled();
  });

  it('leaves the first-save stats marker naming the new entry id (editor handoff)', () => {
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    // JournalEditorScreen consumes/clears this on the first non-empty save
    // (or on prune-on-exit if the entry dies blank).
    expect(localStorage.getItem('vot-journal-new-entry-stats')).toBe('jrn-1');
  });

  it('still creates + navigates when the marker write is unavailable (localStorage throws)', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('jrn-1');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
    setSpy.mockRestore();
  });

  it('is a no-op (early return) when JournalStore is undefined', () => {
    // Cold-boot guard: if the stores bundle hasn't loaded yet, the
    // function silently no-ops rather than crashing the journal hub.
    delete window.JournalStore;
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
    expect(localStorage.getItem('vot-journal-new-entry-stats')).toBeNull();
  });

  it('still completes nav/state when JournalStatsStore is undefined (stats-store optional)', () => {
    // JournalStatsStore is not referenced by the hook at all anymore —
    // recording happens in the editor. This pins that the hub flow never
    // depends on the stats bundle being loaded.
    delete window.JournalStatsStore;
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('jrn-1');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
  });
});
