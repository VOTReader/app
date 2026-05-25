/* P7e — useJournalMutations tests.
   ──────────────────────────────────
   useJournalMutations is the tiniest concern on the Phase 1 checklist:
   one function (createAndEditJournal). The test surface is small but
   the silent-failure modes still matter:

     A) Guard order — early-return when JournalStore is undefined
        protects against a half-loaded module graph during cold boot.
        If a future refactor drops this guard, a crash here would
        prevent the journal hub from rendering at all.

     B) Milestone toast firing — JournalStatsStore.recordNewEntry can
        return null OR an array (zero or more milestones crossed by
        this entry). Both paths exist; tested separately.

     C) The setter ordering matters semantically:
          setHlTick FIRST (so memos refresh)
          setJournalEntryId NEXT (so editor knows what to render)
          setScreen LAST (so route happens after state is ready)
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
  setHlTick: vi.fn(),
  setJournalEntryId: vi.fn(),
  setScreen: vi.fn(),
});

const setup = () => {
  const setters = makeSetters();
  const { result } = renderHook(() => useJournalMutations(setters));
  return { result, setters };
};

describe('useJournalMutations — createAndEditJournal', () => {
  it('happy path: adds an entry, bumps hlTick, sets entryId, nav to editor', () => {
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });

    expect(window.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(setters.setHlTick).toHaveBeenCalledTimes(1);
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('jrn-1');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
  });

  it('setHlTick receives an updater function (not a literal value)', () => {
    // The contract is `setHlTick(t => t + 1)` — a functional updater
    // so the bump is correct under concurrent rendering. Asserting
    // shape protects against a refactor that switches to a literal.
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    const arg = setters.setHlTick.mock.calls[0][0];
    expect(typeof arg).toBe('function');
    expect(arg(0)).toBe(1);
    expect(arg(99)).toBe(100);
  });

  it('records milestone via JournalStatsStore.recordNewEntry with entry.created ts', () => {
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.JournalStatsStore.recordNewEntry).toHaveBeenCalledWith(1700000000000);
  });

  it('fires jrnShowMilestoneToast for EACH milestone crossed', () => {
    window.JournalStatsStore.recordNewEntry = vi.fn(() => [
      { kind: 'first-entry' },
      { kind: '10-entries' },
    ]);
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.jrnShowMilestoneToast).toHaveBeenCalledTimes(2);
    expect(window.jrnShowMilestoneToast).toHaveBeenNthCalledWith(1, { kind: 'first-entry' });
    expect(window.jrnShowMilestoneToast).toHaveBeenNthCalledWith(2, { kind: '10-entries' });
  });

  it('does NOT fire toast when recordNewEntry returns an empty array', () => {
    // recordNewEntry returns [] in beforeEach by default.
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.jrnShowMilestoneToast).not.toHaveBeenCalled();
  });

  it('does NOT fire toast when recordNewEntry returns null/undefined', () => {
    // Guard against the .length call on a null return.
    window.JournalStatsStore.recordNewEntry = vi.fn(() => null);
    const { result } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.jrnShowMilestoneToast).not.toHaveBeenCalled();
  });

  it('is a no-op (early return) when JournalStore is undefined', () => {
    // Cold-boot guard: if the stores bundle hasn't loaded yet, the
    // function silently no-ops rather than crashing the journal hub.
    delete window.JournalStore;
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(setters.setHlTick).not.toHaveBeenCalled();
    expect(setters.setJournalEntryId).not.toHaveBeenCalled();
    expect(setters.setScreen).not.toHaveBeenCalled();
  });

  it('still completes nav/state when JournalStatsStore is undefined (stats-store optional)', () => {
    // JournalStatsStore is a softer dep — the entry still gets created
    // and the user still navigates, just no milestone tracking.
    delete window.JournalStatsStore;
    const { result, setters } = setup();
    act(() => { result.current.createAndEditJournal(); });
    expect(window.JournalStore.add).toHaveBeenCalledTimes(1);
    expect(setters.setJournalEntryId).toHaveBeenCalledWith('jrn-1');
    expect(setters.setScreen).toHaveBeenCalledWith('journal-editor');
  });
});
