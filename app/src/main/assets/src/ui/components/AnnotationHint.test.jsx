/* AnnotationHint — first-run annotation discoverability tip.
   ─────────────────────────────────────────────────────────────────
   The long-press gesture is invisible chrome, so a pill teaches it — but
   ONLY to users with zero annotations/notes/bookmarks, and only after a
   short settle delay. The user's first mark extinguishes it permanently
   via the store subscriptions (data itself is the "seen" flag; nothing
   persisted). The ✕ dismissal is DURABLE (W0 P1-1): it records
   AnnHintDismissedFlagStore so the hint never re-pitches on a cold boot.
   Stores are bare globals; the tests below install in-memory fakes. */

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

// In-memory stand-in for AnnHintDismissedFlagStore (app-flag-stores.js):
// the same is()/set()/clear() surface, but the value lives in a closure so
// a component remount (a simulated cold boot) still sees the recorded flag.
function makeFlagStore(initiallySet = false) {
  let v = initiallySet;
  return {
    is: () => v,
    set: () => { v = true; },
    clear: () => { v = false; },
  };
}

function setupStores({ anns = {}, notes = 0, bkms = 0, hintDismissed = false } = {}) {
  window.AnnotationStore = makeStore({ all: () => anns });
  window.NoteStore = makeStore({ count: () => notes });
  window.BookmarkStore = makeStore({ count: () => bkms });
  window.AnnHintDismissedFlagStore = makeFlagStore(hintDismissed);
}

beforeEach(() => { vi.useFakeTimers(); delete window.__annHintDismissed; });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.AnnotationStore;
  delete window.NoteStore;
  delete window.BookmarkStore;
  delete window.AnnHintDismissedFlagStore;
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

  it('✕ dismisses PERSISTENTLY — the flag survives a cold-boot remount', () => {
    setupStores();
    const first = render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    fireEvent.click(screen.getByLabelText('Dismiss tip'));
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
    // The dismissal is recorded durably, not just in component state.
    expect(window.AnnHintDismissedFlagStore.is()).toBe(true);
    first.unmount();
    // Simulated cold boot: any session-only window state is gone; only the
    // persisted flag store remains. The hint must NOT re-pitch.
    delete window.__annHintDismissed;
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });

  it('never renders when the dismissal flag is already set at boot', () => {
    setupStores({ hintDismissed: true });                    // dismissed last session
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });

  it('falls back to the session window flag when the flag-store global is absent', () => {
    setupStores();
    delete window.AnnHintDismissedFlagStore;                 // bare-test host
    const first = render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    fireEvent.click(screen.getByLabelText('Dismiss tip'));
    expect(window.__annHintDismissed).toBe(true);
    first.unmount();
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(screen.queryByText(HINT_TEXT)).toBeNull();
  });

  it('the ✕ is a native <button> — the pill\'s only interactive element', () => {
    // W0 P1-1: the container gets pointer-events:none in CSS so the pill
    // stops swallowing the long-press it teaches; the ✕ alone re-enables
    // pointer events. For that to keep working the dismiss control must be
    // a real focusable button with its OWN click handler — nothing may be
    // delegated to the (now pointer-inert) container.
    setupStores();
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    const close = screen.getByLabelText('Dismiss tip');
    expect(close.tagName).toBe('BUTTON');
    const pill = document.querySelector('.ann-hint-pill');
    expect(pill.querySelectorAll('button, a, input, [tabindex]').length).toBe(1);
  });
});
