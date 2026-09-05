// @ts-nocheck
/* RED — navigation-tabs-5 (Verifier reproduction, 2026-09-03)
   ─────────────────────────────────────────────────────────────────────────
   useTabs clamps the restored activeTabIdx to 998, not to the restored tab
   count. The READ side survives a desync (tabs[activeTabIdx] || tabs[0]) but
   the WRITE side does not: updateActiveTab maps over prev and patches only
   `i === activeTabIdx`, so with activeTabIdx past the end EVERY tabField
   setter — setScreen, setBookId, setLetterId, scroll memory, the tap-through
   stack — is a silent no-op while the UI keeps rendering tabs[0]. Every
   navigation becomes a no-op: the app looks alive and never moves.

   REACHABILITY (see verifier-repros.md): no app-written path persists a
   mismatched {tabs, activeTabIdx} — every close/reorder/dedupe path in
   use-tab-actions.js sets both in the same batch, mergeStateStore takes both
   from "ours", and usePersistedState writes them from one committed render.
   A .votbak import is accepted UNCOERCED ('vot-state': 'object' in
   import-validators.js), so a malformed or hand-edited backup is the one
   documented way in; a future bug is the other. The wedge itself is real and
   permanent once entered, which is why the clamp belongs at the source.

   CONTRACT PINNED HERE: activeTabIdx is clamped to the RESTORED tab array,
   and a tab-field write after any desync still lands on the tab the reader
   is looking at (tabs[0]) instead of being dropped. */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabs } from './use-tabs.js';

const wedged = () => ({
  saved: {
    tabs: [{ screen: 'home', bookId: null }],
    activeTabIdx: 3,          // persisted past the end of a one-tab array
  },
});

describe('navigation-tabs-5 — activeTabIdx persisted past the restored tab count', () => {
  it('CONTROL: with a consistent index a tab-field write lands on the active tab', () => {
    const { result } = renderHook(() => useTabs({ saved: { tabs: [{ screen: 'home' }], activeTabIdx: 0 } }));
    act(() => { result.current.tabField('screen')[1]('settings'); });
    expect(result.current.activeTab.screen).toBe('settings');
    expect(result.current.tabs[0].screen).toBe('settings');
  });

  it('activeTabIdx is clamped to the restored tab array, not to 998', () => {
    const { result } = renderHook(() => useTabs(wedged()));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabIdx).toBe(0);
  });

  it('a tab-field write after the desync is NOT dropped: setScreen must move the visible tab', () => {
    const { result } = renderHook(() => useTabs(wedged()));
    // The reader sees tabs[0] (the read-side fallback) …
    expect(result.current.activeTab.screen).toBe('home');
    // … taps into Settings …
    act(() => { result.current.tabField('screen')[1]('settings'); });
    // … and the write must land somewhere visible. Today it matches no index
    // in updateActiveTab's map and the screen stays 'home' forever.
    expect(result.current.activeTab.screen).toBe('settings');
  });

  it('every tab-scoped setter is affected (bookId, letterId, chapterNum)', () => {
    const { result } = renderHook(() => useTabs(wedged()));
    act(() => {
      result.current.tabField('bookId')[1]('john');
      result.current.tabField('letterId')[1]('a-letter');
      result.current.tabField('chapterNum')[1](3);
    });
    expect(result.current.activeTab).toMatchObject({ bookId: 'john', letterId: 'a-letter', chapterNum: 3 });
  });
});
