// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element (F2.1), as AudioPlayerBar.test does.
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
import { AudioPlayer } from '../../utils/audio-player.js';
import * as TS from '../../utils/tour-steps.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* The tour controller is a bundle-b bare global too (window.TourController); the pill reads the
   tour's state and the gesture's words through it (journey F2.1, 2026-09-12). The stub hands out
   the REAL words from tour-steps.js, so a case here can only pass when the pill asks for them. */
function makeTourController(active = false) {
  let state = { active, index: 0, ready: true };
  const store = makeStore({
    getState: () => ({ ...state }),
    highlightWords: () => TS.HIGHLIGHT_GESTURE_WORDS,
    _setActive(next) { state = { ...state, active: next }; store._bumpForTest(); },
  });
  return store;
}

function setupStores({ anns = {}, notes = 0, bkms = 0, hintDismissed = false, tourActive = false } = {}) {
  window.AnnotationStore = makeStore({ all: () => anns });
  window.NoteStore = makeStore({ count: () => notes });
  window.BookmarkStore = makeStore({ count: () => bkms });
  window.AnnHintDismissedFlagStore = makeFlagStore(hintDismissed);
  window.TourController = makeTourController(tourActive);
}

/* The audio bar is open whenever the player is not idle (AudioPlayerBar.jsx:25). The real player
   is driven here — a stubbed getState would prove the pill reads a stub. */
class FakeAudio extends EventTarget {
  constructor() { super(); this.src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.preload = ''; this.defaultPlaybackRate = 1; this.playbackRate = 1; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute() { this.src = ''; }
}

beforeEach(() => { vi.useFakeTimers(); delete window.__annHintDismissed; });
afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  delete globalThis.Audio;
  delete globalThis.AUDIO_MANIFEST;
  vi.useRealTimers();
  delete window.TourController;
  delete window.AnnotationStore;
  delete window.NoteStore;
  delete window.BookmarkStore;
  delete window.AnnHintDismissedFlagStore;
  delete window.__annHintDismissed;
});

/* Any text at all inside the pill: the words are the tour's now, and the pill's presence is
   what every case below is about. */
const HINT_TEXT = (_, el) => !!el && el.classList.contains('ann-hint-text') && el.textContent.trim().length > 0;

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

/* JOURNEY F2.1 (2026-09-12): on the tour's Listen stop three layers stacked at the bottom of the
   screen — the tour card, this pill under it, the audio bar under that — and outside the tour the
   pill was drawn over the audio bar (pill y 729–789, bar y 730–800 on a 360x800 phone). The pill
   yields: it holds while the tour is up or the bar is open, and comes when they leave. And its
   words are the tour's own for the same gesture — one sentence pair, owned by tour-steps.js. */
describe('AnnotationHint — yields to the tour and the audio bar (journey F2.1)', () => {
  it('holds while the tour is up, and appears when the tour ends', () => {
    setupStores({ tourActive: true });
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(document.querySelector('.ann-hint-pill'), 'the tour is up: no pill').toBeNull();
    act(() => { window.TourController._setActive(false); });
    expect(document.querySelector('.ann-hint-pill'), 'the tour ended: the pill comes').toBeTruthy();
  });

  it('holds while the audio bar is open (the player is not idle), and appears when it goes idle', () => {
    globalThis.Audio = FakeAudio;
    globalThis.AUDIO_MANIFEST = { 'vol1:letter-a': [['idA', 'B']] };
    setupStores();
    act(() => { AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'A' }, collectionLabel: 'Volume One' }); });
    expect(AudioPlayer.getState().status, 'PRECONDITION: the bar is open').not.toBe('idle');
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(document.querySelector('.ann-hint-pill'), 'the bar is open: no pill').toBeNull();
    act(() => { AudioPlayer.stop(); });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(document.querySelector('.ann-hint-pill'), 'the bar closed: the pill comes').toBeTruthy();
  });

  it('CONTROL: with neither up, the pill still comes after the delay', () => {
    setupStores();
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    expect(document.querySelector('.ann-hint-pill')).toBeTruthy();
  });

  it('says the tour\'s words for the gesture — the head of the highlight stop\'s own text', () => {
    setupStores();
    render(<AnnotationHint />);
    act(() => { vi.advanceTimersByTime(2600); });
    const said = document.querySelector('.ann-hint-text').textContent.trim();
    const stop = TS.TOUR_STEPS.find((s) => s.id === 'highlight');
    expect(said.length, 'the pill says something').toBeGreaterThan(20);
    expect(stop.text.startsWith(said), `the pill's words "${said}" must open the highlight stop's text`).toBe(true);
    expect(said).toContain('Highlight, or Note');
  });

  /* THE ONE THING THE CASE ABOVE CANNOT SEE: a pill holding an IDENTICAL copy of the words passes it
     perfectly, and an identical copy is exactly how the two drift apart later. So the source is read:
     the pill's own file names no part of the sentence and reaches the words through the controller.
     Comments are stripped first (a comment quoting the words would fail the negative for a reason
     that is not the program), and the stripper is proven on this very file: its header comment
     quotes the OLD copy, which must be in the raw text and gone from the stripped text. */
  it('holds no copy of the words in its own source — it reaches them through TourController', () => {
    const raw = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'AnnotationHint.jsx'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(raw, 'CONTROL: the header comment quotes the old copy').toMatch(/highlight, note, or bookmark/);
    expect(code, 'CONTROL: the stripper removed it').not.toMatch(/highlight, note, or bookmark/);
    expect(code, 'CONTROL: the stripped text is still the program').toMatch(/highlightWords\(\)/);
    expect(code).not.toMatch(/Hold your finger|A small bar appears|Highlight, or Note/);
  });
});
