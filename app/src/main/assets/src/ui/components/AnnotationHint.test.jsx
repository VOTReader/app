/* AnnotationHint — first-run annotation discoverability tip.
   ─────────────────────────────────────────────────────────────────
   The long-press gesture is invisible chrome, so a pill teaches it — but
   ONLY to users with zero annotations/notes/bookmarks, and only after a
   short settle delay. The user's first mark extinguishes it permanently
   via the store subscriptions (data itself is the "seen" flag; nothing
   persisted). The ✕ dismisses for the session. Stores are bare globals. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { AnnotationHint } from './AnnotationHint.jsx';

function makeStore(overrides) {
  let version = 1;
  const subs = new Set();
  return {
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    getVersion() { return version; },
    _bumpForTest() { version++; subs.forEach((cb) => cb()); },
    ...overrides,
  };
}

function setupStores({ anns = {}, notes = 0, bkms = 0 } = {}) {
  window.AnnotationStore = makeStore({ all: () => anns });
  window.NoteStore = makeStore({ count: () => notes });
  window.BookmarkStore = makeStore({ count: () => bkms });
}

beforeEach(() => { vi.useFakeTimers(); delete window.__annHintDismissed; });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.AnnotationStore;
  delete window.NoteStore;
  delete window.BookmarkStore;
  delete window.__annHintDismissed;
});

const HINT_TEXT = /Press and hold any text/;

describe('AnnotationHint', () => {
  it('shows after the settle delay for a user with zero data', () => {
    setupStores();
    render(<AnnotationHint />);
    expect(screen.queryByText(HINT_TEXT)).toBeNull();          // not yet
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.getByText(HINT_TEXT)).toBeTruthy();
  });

  it('never renders when the user already has an annotation / note / bookmark', () => {
    setupStores({ anns: { 'bible:psalms:23:1': [{}] } });
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
    cleanup();
    setupStores({ notes: 1 });
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });

  it('extinguishes the moment the first annotation lands (store bump)', () => {
    let anns = {};
    setupStores();
    window.AnnotationStore.all = () => anns;
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.getByText(HINT_TEXT)).toBeTruthy();
    anns = { 'bible:john:3:16': [{}] };
    act(() => { window.AnnotationStore._bumpForTest(); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });

  it('✕ dismisses for the session (window-backed across remounts)', () => {
    setupStores();
    const first = render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    fireEvent.click(screen.getByLabelText('Dismiss tip'));
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
    first.unmount();
    render(<AnnotationHint />);                                 // e.g. next chapter
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });
});
