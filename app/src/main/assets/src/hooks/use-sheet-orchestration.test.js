/* useSheetOrchestration tests.
   ────────────────────────────
   The transient-overlay orchestration hook (after the link-picker cluster
   was extracted to useLinkPickerOrchestration). Covers what previously had
   NO test at all: the 7 window bridges it owns, the openNoteSheet helper,
   the auto-dismiss-on-navigation effect, and that the extracted link-picker
   surface is still spread into the return.

   Bare-name cross-bundle globals (BookmarkStore / _bookmarkSourceLabel /
   __hideSelectionToolbar) are stubbed on window per the other hook tests.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSheetOrchestration } from './use-sheet-orchestration.js';

const baseArgs = (over) => ({
  screen: 'home', letterId: null, bookId: null,
  chapterNum: null, studyId: null, studyChapterId: null,
  ...over,
});

let _prev;
beforeEach(() => {
  _prev = {
    BookmarkStore: window.BookmarkStore,
    _bookmarkSourceLabel: window._bookmarkSourceLabel,
    hideSelectionToolbar: window.__hideSelectionToolbar,
  };
  window.BookmarkStore = { get: vi.fn((id) => (id === 'bk1' ? { id: 'bk1', hlKey: 'bible:genesis:1:1', label: 'L', thought: 'T' } : null)) };
  window._bookmarkSourceLabel = () => 'Genesis 1:1';
  window.__hideSelectionToolbar = vi.fn();
});
afterEach(() => {
  window.BookmarkStore = _prev.BookmarkStore;
  window._bookmarkSourceLabel = _prev._bookmarkSourceLabel;
  window.__hideSelectionToolbar = _prev.hideSelectionToolbar;
  ['__openNote', '__showAnnChip', '__showMultiNote', '__openBookmarkPopover',
   '__bookmarkCreate', '__openJournalInbound', '__bookmarkEdit',
   '__openLinkPicker', '__openLinkPickerForTarget', '__openLinkSidebar'].forEach((n) => { delete window[n]; });
});

const setup = (over) => renderHook((p) => useSheetOrchestration(p), { initialProps: baseArgs(over) });

describe('window bridges', () => {
  it('wires its 7 bridges on mount and the 3 delegated link bridges too', () => {
    const { unmount } = setup();
    // Owned by this hook:
    ['__openNote', '__showAnnChip', '__showMultiNote', '__openBookmarkPopover',
     '__bookmarkCreate', '__openJournalInbound', '__bookmarkEdit'].forEach((n) => {
      expect(typeof window[n]).toBe('function');
    });
    // Delegated to useLinkPickerOrchestration but mounted via the same hook:
    expect(typeof window.__openLinkPicker).toBe('function');
    expect(typeof window.__openLinkSidebar).toBe('function');
    unmount();
    expect(window.__openNote).toBeUndefined();
    expect(window.__showAnnChip).toBeUndefined();
    expect(window.__openLinkPicker).toBeUndefined();
  });

  it('__showAnnChip sets annChip; openNoteSheet sets the target + clears the chip', () => {
    const { result } = setup();
    act(() => window.__showAnnChip(10, 20, 'k', 'g1'));
    expect(result.current.annChip).toEqual({ x: 10, y: 20, hlKey: 'k', groupId: 'g1' });
    act(() => result.current.openNoteSheet('g1', true));
    expect(result.current.noteSheetTarget).toEqual({ groupId: 'g1', startInEditMode: true });
    expect(result.current.annChip).toBeNull(); // chip cleared on note open
  });

  it('__showMultiNote / __openBookmarkPopover / __bookmarkCreate / __openJournalInbound set their payloads', () => {
    const { result } = setup();
    act(() => window.__showMultiNote(['g1', 'g2'], 1, 2));
    expect(result.current.multiNotePayload).toEqual({ groupIds: ['g1', 'g2'], x: 1, y: 2 });
    act(() => window.__openBookmarkPopover(['b1'], 3, 4, 'k'));
    expect(result.current.bookmarkPopoverPayload).toEqual({ bkmIds: ['b1'], x: 3, y: 4, hlKey: 'k' });
    act(() => window.__bookmarkCreate({ hlKey: 'k', defaultLabel: 'D' }));
    expect(result.current.bookmarkCreatePending).toEqual({ hlKey: 'k', defaultLabel: 'D' });
    act(() => window.__openJournalInbound('letter:two/x', 'X'));
    expect(result.current.inboundJournalPayload).toEqual({ refKey: 'letter:two/x', label: 'X' });
  });

  it('__bookmarkEdit looks up the record and builds the edit-mode pending shape', () => {
    const { result } = setup();
    act(() => window.__bookmarkEdit('bk1', { atSource: true }));
    expect(result.current.bookmarkCreatePending).toMatchObject({
      editId: 'bk1', hlKey: 'bible:genesis:1:1', currentLabel: 'L', currentThought: 'T', atSource: true,
    });
  });
});

describe('auto-dismiss on navigation', () => {
  it('clears note/chip/multi/bookmark + calls __hideSelectionToolbar when nav position changes', () => {
    const { result, rerender } = setup();
    // Open several overlays. openNoteSheet FIRST — it clears annChip, so set
    // the chip after it (otherwise the chip we open would be cleared again).
    act(() => { result.current.openNoteSheet('g'); window.__showAnnChip(1, 1, 'k', 'g'); window.__showMultiNote(['g'], 1, 1); window.__openBookmarkPopover(['b'], 1, 1, 'k'); });
    expect(result.current.annChip).not.toBeNull();
    expect(result.current.noteSheetTarget).not.toBeNull();
    window.__hideSelectionToolbar.mockClear();
    // Navigate (screen change) → auto-dismiss fires.
    act(() => rerender(baseArgs({ screen: 'bible-ch', bookId: 'genesis', chapterNum: 1 })));
    expect(result.current.annChip).toBeNull();
    expect(result.current.noteSheetTarget).toBeNull();
    expect(result.current.multiNotePayload).toBeNull();
    expect(result.current.bookmarkPopoverPayload).toBeNull();
    expect(window.__hideSelectionToolbar).toHaveBeenCalled();
  });
});

describe('extracted link-picker surface is spread into the return', () => {
  it('exposes the link-picker slots/openers from useLinkPickerOrchestration', () => {
    const { result } = setup();
    expect(result.current).toHaveProperty('linkSidebarKey');
    expect(typeof result.current.openLinkPicker).toBe('function');
    expect(typeof result.current.openLinkSidebar).toBe('function');
    expect(typeof result.current.closeLinkPicker).toBe('function');
    expect(result.current).toHaveProperty('linkPickerOnPickRef');
  });
});
