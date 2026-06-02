/* useLinkPickerOrchestration tests.
   ─────────────────────────────────
   The link-picker / link-sidebar sub-domain extracted from
   useSheetOrchestration. The label-resolution logic in openLinkPicker
   (bible / study / letter / journal hlKey → human label) was never
   unit-tested while it lived in the parent hook; this is its first cover.

   The hook reads bare-name cross-bundle globals (_allBooks /
   findEntryContext / JournalStore / JournalHelpers) — stubbed on globalThis
   in beforeEach, mirroring the other hook tests.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLinkPickerOrchestration } from './use-link-picker-orchestration.js';

let _prev;

beforeEach(() => {
  _prev = {
    allBooks: window._allBooks,
    findEntryContext: window.findEntryContext,
    JournalStore: window.JournalStore,
    JournalHelpers: window.JournalHelpers,
  };
  window._allBooks = () => ({ genesis: { title: 'Genesis' } });
  window.findEntryContext = () => ({ title: 'The Wide Path' });
  window.JournalStore = { get: (id) => (id ? { id } : null) };
  window.JournalHelpers = { entryDisplayTitle: () => 'My Memo' };
});

afterEach(() => {
  window._allBooks = _prev.allBooks;
  window.findEntryContext = _prev.findEntryContext;
  window.JournalStore = _prev.JournalStore;
  window.JournalHelpers = _prev.JournalHelpers;
  // Clean any bridges a test left on window.
  delete window.__openLinkPicker;
  delete window.__openLinkPickerForTarget;
  delete window.__openLinkSidebar;
});

const setup = () => renderHook(() => useLinkPickerOrchestration());

describe('openLinkPicker — label resolution', () => {
  it('bible key → "Title chap:verse"', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker('bible:genesis:1:1'));
    expect(result.current.linkPickerSource).toMatchObject({ key: 'bible:genesis:1:1', label: 'Genesis 1:1' });
  });

  it('study key → "Book chap:verse" (verse omitted when 0)', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker('study:matthew-4:7'));
    expect(result.current.linkPickerSource.label).toBe('Matthew 4:7');
    act(() => result.current.closeLinkPicker());
    act(() => result.current.openLinkPicker('study:matthew-4:0'));
    expect(result.current.linkPickerSource.label).toBe('Matthew 4');
  });

  it('letter key → findEntryContext title', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker('letter:the-wide-path:0'));
    expect(result.current.linkPickerSource.label).toBe('The Wide Path');
  });

  it('journal key → "Journal · <display title>"', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker('journal:j_1:0'));
    expect(result.current.linkPickerSource.label).toBe('Journal · My Memo');
  });

  it('object selInfo carries start/end/text onto the source', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker({ hlKey: 'bible:genesis:1:1', start: 2, end: 5, text: 'foo' }));
    expect(result.current.linkPickerSource).toMatchObject({ key: 'bible:genesis:1:1', start: 2, end: 5, text: 'foo' });
  });

  it('empty hlKey is a no-op (no source set)', () => {
    const { result } = setup();
    act(() => result.current.openLinkPicker(''));
    expect(result.current.linkPickerSource).toBeNull();
    act(() => result.current.openLinkPicker({ hlKey: '' }));
    expect(result.current.linkPickerSource).toBeNull();
  });
});

describe('target-picker mode + close', () => {
  it('openLinkPickerForTarget sets the sentinel source, mode, and onPick ref', () => {
    const { result } = setup();
    const onPick = () => {};
    act(() => result.current.openLinkPickerForTarget('card', onPick));
    expect(result.current.linkPickerSource).toMatchObject({ key: null, label: null, picker: true });
    expect(result.current.linkPickerMode).toBe('card');
    expect(result.current.linkPickerOnPickRef.current).toBe(onPick);
  });

  it('closeLinkPicker clears source, mode, refine, lastCreated, and the onPick ref', () => {
    const { result } = setup();
    act(() => result.current.openLinkPickerForTarget('excerpt', () => {}));
    act(() => { result.current.setLinkRefineRequest({ kind: 'x' }); result.current.setLastLinkCreated({ id: 'l1' }); });
    act(() => result.current.closeLinkPicker());
    expect(result.current.linkPickerSource).toBeNull();
    expect(result.current.linkPickerMode).toBeNull();
    expect(result.current.linkRefineRequest).toBeNull();
    expect(result.current.lastLinkCreated).toBeNull();
    expect(result.current.linkPickerOnPickRef.current).toBeNull();
  });
});

describe('link sidebar', () => {
  it('open sets the key, close clears it', () => {
    const { result } = setup();
    act(() => result.current.openLinkSidebar('bible:genesis:1:1'));
    expect(result.current.linkSidebarKey).toBe('bible:genesis:1:1');
    act(() => result.current.closeLinkSidebar());
    expect(result.current.linkSidebarKey).toBeNull();
  });
});

describe('window bridges', () => {
  it('wires the 3 link bridges on mount and tears them down on unmount', () => {
    const { unmount } = setup();
    expect(typeof window.__openLinkPicker).toBe('function');
    expect(typeof window.__openLinkPickerForTarget).toBe('function');
    expect(typeof window.__openLinkSidebar).toBe('function');
    unmount();
    expect(window.__openLinkPicker).toBeUndefined();
    expect(window.__openLinkPickerForTarget).toBeUndefined();
    expect(window.__openLinkSidebar).toBeUndefined();
  });
});
