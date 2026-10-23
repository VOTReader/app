// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element.
/* AudioPlayerBar — the always-mounted mini player (bundle-d).
   ─────────────────────────────────────────────────────────────────────────
   Driven against the REAL utils/audio-player.js singleton instead of a stubbed
   module surface: the bar's entire job is to mirror that store, so stubbing it
   would only assert that the component calls the functions it visibly calls.
   jsdom has no media pipeline, so globalThis.Audio is the same EventTarget-
   backed FakeAudio the player's own suite uses, and the lazy corpus manifest is
   installed on globalThis (the classic-script `var AUDIO_MANIFEST` reality of
   src/data/audio-manifest.js).

   The player is a module singleton, so state is reset between tests through its
   own public stop() rather than vi.resetModules() — re-importing would hand the
   component a second copy of the store. Every store mutation is act()-wrapped
   because the bar subscribes through useSyncExternalStore. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetToasts } from '../../utils/toast.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioPlayerBar } from './AudioPlayerBar.jsx';

/** Mimics the bits of HTMLAudioElement the player touches (see audio-player.test.js). */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = '';
    this.srcHistory = [];
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.played = false;
    this.preload = '';
    this.error = null;
    this.loadCalls = 0;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.srcHistory.push(v); this.currentTime = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.played = true; this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() { this.loadCalls++; }
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const MANIFEST = {
  'vol1:preface': [['idPreface', 'B']],
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
};

const ITEMS = [
  { id: 'preface', title: 'A Word of Warning' },
  { id: 'letter-a', title: 'The Wide Path' },
  { id: 'letter-c', title: 'The Seventh Day' },
];


/* A per-chapter Bible edition (the shipped shape): parts ARE chapters, so the
   player titles each track by its chapter AND labels the part "Chapter N".
   Jude's single-part row is the counter-case — one part is not a chapter list,
   so its title stays plain and the label is the only chapter it has. */
const bibleParts = (book, t, n) => Array.from({ length: n }, (_v, i) => (
  ['brm' + t + '_' + book + '_' + String(i + 1).padStart(3, '0'), '', 'Chapter ' + (i + 1)]
));
const BIBLE_MANIFEST = {
  'bible-brm-kjv:jonah': bibleParts('jonah', 1, 4),
  'bible-brm-kjv:jude': bibleParts('jude', 2, 1),
};
const BIBLE_BOOKS = [['jonah', 'Jonah'], ['jude', 'Jude']];

/** The element the player lazily created on first play. */
const el = () => FakeAudio.last;
/** Media events arrive from outside React — they must re-render inside act(). */
const emit = (type) => act(() => { el().dispatchEvent(new Event(type)); });
/** Any direct store drive (the app's own hero buttons do this from other screens). */
const drive = (fn) => act(() => { fn(); });

/** One letter, one part — the queue-of-one case (no prev/next chrome). */
function playSingleLetter() {
  drive(() => AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'The Seventh Day' }, collectionLabel: 'Volume One' }));
}
/** Preface + a two-part letter + a third letter = a 4-track queue. */
function playWholeCollection() {
  drive(() => AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' }));
}

const bar = () => screen.queryByRole('region', { name: 'Audio player' });
const barOpenClass = () => document.body.classList.contains('audio-bar-open');
const title = () => document.querySelector('.audio-bar-title').textContent;
/** Line 2 under the title: source · place · time left, or the state the bar is in (player brief 3a, 3g). */
const line2 = () => document.querySelector('.audio-bar-line2').textContent;
/** Media length and clock, as metadata and timeupdate land. */
const clockAt = (time, duration) => act(() => {
  if (duration != null) { el().duration = duration; el().dispatchEvent(new Event('durationchange')); }
  el().currentTime = time; el().dispatchEvent(new Event('timeupdate'));
});

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.ReactDOM = ReactDOM;               // AudioManagerSheet portals through the runtime global
  globalThis.AUDIO_MANIFEST = MANIFEST;
  localStorage.removeItem('vot-audio-pos');
  modalRegistry._reset();
  AudioPlayer.stop();
  AudioPlayer.setPlaybackRate(1);
  if (FakeAudio.last) { FakeAudio.last.duration = 0; FakeAudio.last.currentTime = 0; FakeAudio.last.error = null; }
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  _resetToasts();   // a Close's Undo toast lives in document.body, outside cleanup's reach (shuffle seed 20261023)
  modalRegistry._reset();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.__votAudioArbiter;
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.BIBLE_AUDIO_MANIFEST;
  delete globalThis.BIBLE_AUDIO_BOOKS;
  delete globalThis.ReactDOM;
  delete globalThis.Audio;
  localStorage.removeItem('vot-audio-pos');
});

describe('AudioPlayerBar — visibility + the reading-surface body class', () => {
  it('renders nothing while the player is idle and reserves no room for itself', () => {
    const { container } = render(<AudioPlayerBar />);
    expect(container.innerHTML).toBe('');
    expect(bar()).toBeNull();
    expect(barOpenClass()).toBe(false);
  });

  it('appears the moment a track loads and marks the body so every screen pads for it', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();

    expect(bar()).toBeTruthy();
    expect(barOpenClass()).toBe(true);
    expect(title()).toBe('The Seventh Day');
    expect(line2()).toBe('Loading…');   // not started yet: never a Pause over a 0:00 that is not moving (U10.2)
    emit('playing');
    expect(line2()).toBe('Volume One');   // the reader and edition move to the full player (brief 3a)
  });

  /* U10.2 (UX sweep 2026-10-22): on a slow network the bar read 0:00 beside a Pause for 20 to 30 s. Until the
     recording starts line 2 says Loading…, and Still loading once that runs past 8 s, with Cancel in Back 15's
     slot (brief 3g; a link inside line 2 would be a button inside the summary button). */
  it('says Loading… until the recording starts, Still loading with Cancel past 8 s, then the time left', () => {
    vi.useFakeTimers();
    try {
      render(<AudioPlayerBar />);
      playSingleLetter();
      expect(line2()).toBe('Loading…');
      expect(screen.getByRole('button', { name: 'Back 15 seconds' }).disabled).toBe(true);   // nothing to step back in
      act(() => { vi.advanceTimersByTime(7900); });
      expect(line2()).toBe('Loading…');
      expect(screen.queryByRole('button', { name: 'Cancel loading' })).toBeNull();
      act(() => { vi.advanceTimersByTime(200); });
      expect(line2()).toBe('Still loading');
      expect(screen.getByRole('button', { name: 'Cancel loading' }).textContent).toBe('Cancel');
      expect(screen.queryByRole('button', { name: 'Back 15 seconds' })).toBeNull();
      act(() => { el().duration = 240; el().dispatchEvent(new Event('durationchange')); });
      emit('playing');
      expect(line2()).toBe('Volume One · 4 min left');
      expect(screen.getByRole('button', { name: 'Back 15 seconds' }).disabled).toBe(false);
      // A stall mid-recording keeps the place: the time left is what the reader needs then.
      clockAt(65);
      emit('waiting');
      expect(AudioPlayer.getState().status).toBe('loading');
      expect(line2()).toBe('Volume One · 3 min left');
      clockAt(200);
      expect(line2()).toBe('Volume One · 0:40 left');   // m:ss under a minute
    } finally {
      vi.useRealTimers();
    }
  });

  it('Cancel takes back a load that is taking too long, and leaves the bar paused on it', () => {
    vi.useFakeTimers();
    try {
      render(<AudioPlayerBar />);
      playSingleLetter();
      act(() => { vi.advanceTimersByTime(8100); });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel loading' }));
      expect(AudioPlayer.getState().status).toBe('paused');
      expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a recording that fails says Couldn’t load, with Retry in Back 15’s slot (brief 3g)', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    act(() => { el().error = { code: 3 }; el().dispatchEvent(new Event('error')); });
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(line2()).toBe('Couldn’t load');
    expect(document.querySelector('.audio-bar-line2').classList.contains('is-failed')).toBe(true);
    expect(document.querySelector('.audio-bar-summary').getAttribute('aria-label')).toContain('Couldn’t load');
    expect(screen.queryByRole('button', { name: 'Back 15 seconds' })).toBeNull();
    el().played = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(el().played).toBe(true);
    el().error = null;
    emit('playing');
    expect(line2()).toBe('Volume One');
    expect(screen.getByRole('button', { name: 'Back 15 seconds' })).toBeTruthy();
  });

  it('shows the sleep and speed chips beside line 2 only while they are set (brief 3a)', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    emit('playing');
    expect(document.querySelectorAll('.audio-bar-chip')).toHaveLength(0);
    drive(() => { AudioPlayer.setSleepTimer(15); AudioPlayer.setPlaybackRate(1.5); });
    const chips = [...document.querySelectorAll('.audio-bar-chip')].map((c) => c.textContent);
    expect(chips).toEqual(['15m', '1.5×']);
    expect(document.querySelector('.audio-bar-summary').getAttribute('aria-label')).toContain('sleep in 15 min, speed 1.5×');
    drive(() => { AudioPlayer.clearSleepTimer(); AudioPlayer.setPlaybackRate(1); });
    expect(document.querySelectorAll('.audio-bar-chip')).toHaveLength(0);
  });

  it('shows the part label of a multi-part letter alongside the title', () => {
    render(<AudioPlayerBar />);
    playWholeCollection();
    drive(() => AudioPlayer.next());   // preface → Wide Path, Part 1

    expect(title()).toBe('The Wide Path · Part 1');
    expect(document.querySelector('.audio-bar-part').textContent).toBe(' · Part 1');
  });

  /* A per-chapter Bible track carries BOTH a chapter title (C2-A/A4) and its
     "Chapter N" part label, so the bar printed the number twice in one glance:
     "Genesis 2 · Chapter 2". The label is still the data every consumer parses
     — only the echo is suppressed, and only when the title already ends with
     that number (2026-08-10). */
  /* w-audio-continue (2026-09-11): the player continues into the next collection by itself, so the reader
     is told rather than surprised — for the FIRST track after a crossing the title reads
     "<collection> · <reading>", computed from the previous queue item's sub; every other track keeps its
     plain title (the sub line names the collection on all of them). Independent of the page follower. */
  it('names the collection in the title for the first track after a crossing, and nowhere else', () => {
    globalThis.COLLECTIONS = [
      { volKey: 'vol1', cardId: 'v1', label: 'Volume One' },
      { volKey: 'vol2', cardId: 'v2', label: 'Volume Two' },
    ];
    globalThis.COL_BY_KEY = new Map(globalThis.COLLECTIONS.map((c) => [c.volKey, c]));
    globalThis.colPreface = () => null;
    globalThis.colLetterArr = (col) => (col.volKey === 'vol1' ? ITEMS : [{ id: 'solo', title: 'Solo Letter' }]);
    globalThis.AUDIO_MANIFEST = { ...MANIFEST, 'vol2:solo': [['idSolo', 'M']] };
    try {
      render(<AudioPlayerBar />);
      // From letter A: two part boundaries inside Volume One before the seam, so "nowhere else"
      // is asserted at qi 1 and qi 2 INSIDE the collection, not only at qi 0 (verifier-2, 2026-09-12:
      // `crossed = st.qi > 0` satisfied the qi-0-only form).
      drive(() => AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One', startId: 'letter-a' }));
      expect(title()).toBe('The Wide Path · Part 1');                 // qi 0: the plain title
      emit('ended');                                                   // a part boundary, not a unit boundary
      expect(AudioPlayer.getState().qi).toBe(1);
      expect(title()).toBe('The Wide Path · Part 2');                 // qi 1, inside the collection: plain
      emit('ended');
      expect(AudioPlayer.getState().qi).toBe(2);
      expect(title()).toBe('The Seventh Day');                       // qi 2, vol1's last recording: plain
      // Letter C is vol1's last recording: the queue already carries Volume Two behind it.
      emit('ended');                                                   // the seam
      expect(title()).toBe('Volume Two · Solo Letter');                // the first track after the crossing
      emit('playing');
      expect(line2()).toMatch(/^Volume Two\b/);   // the sub names it too
    } finally {
      delete globalThis.COLLECTIONS; delete globalThis.COL_BY_KEY; delete globalThis.colPreface; delete globalThis.colLetterArr;
    }
  });
  it('prints a Bible chapter ONCE — the title already carries the number', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = BIBLE_MANIFEST;
    globalThis.BIBLE_AUDIO_BOOKS = BIBLE_BOOKS;
    render(<AudioPlayerBar />);
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: 'KJV · BRM', chapterNum: 2 }));

    expect(title()).toBe('Jonah 2');
    expect(document.querySelector('.audio-bar-part')).toBeNull();
    // The queue data is untouched — the jump-to-text and read credit read it.
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].partLabel).toBe('Chapter 2');
  });

  it('keeps a part label the title does not already spell out', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = BIBLE_MANIFEST;
    globalThis.BIBLE_AUDIO_BOOKS = BIBLE_BOOKS;
    render(<AudioPlayerBar />);
    // Jude is a one-part row, so its title stays plain "Jude" — the label is
    // then the only place the chapter appears and must survive.
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jude', label: 'KJV · BRM' }));

    expect(title()).toBe('Jude · Chapter 1');
    expect(document.querySelector('.audio-bar-part').textContent).toBe(' · Chapter 1');
  });

  it('drops the body class when playback goes idle and again on unmount', () => {
    const { unmount } = render(<AudioPlayerBar />);
    playSingleLetter();
    expect(barOpenClass()).toBe(true);

    drive(() => AudioPlayer.stop());
    expect(barOpenClass()).toBe(false);          // idle again — no stale padding
    expect(bar()).toBeNull();

    playSingleLetter();
    expect(barOpenClass()).toBe(true);
    unmount();
    expect(barOpenClass()).toBe(false);          // …and the bar cleans up after itself
  });
});

describe('AudioPlayerBar — transport', () => {
  it('labels play/pause off the live status and toggles the real element', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();

    // Buffering is an ACTIVE session: toggle() pauses a loading element, so
    // the bar promises Pause — the same contract AudioManagerSheet keeps.
    const loadingBtn = screen.getByRole('button', { name: 'Pause' });
    expect(loadingBtn.getAttribute('aria-busy')).toBe('true');
    expect(loadingBtn.classList.contains('is-loading')).toBe(true);

    emit('playing');
    const pauseBtn = screen.getByRole('button', { name: 'Pause' });
    expect(pauseBtn.getAttribute('aria-busy')).toBe('false');

    fireEvent.click(pauseBtn);
    expect(el().paused).toBe(true);
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();

    el().played = false;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(el().played).toBe(true);
    emit('playing');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  /* Brief 3a: spoken word is Back 15 / Play / Close. Seek and previous/next live in the listening controls the bar
     opens (the 166x24 slider was too small a target). */
  it('offers Back 15, Play and Close: no previous, next or seek on the bar', () => {
    render(<AudioPlayerBar />);
    playWholeCollection();
    emit('playing');
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names.slice(1)).toEqual(['Back 15 seconds', 'Pause', 'Close player']);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(document.querySelector('.audio-bar-pull')).toBeNull();
  });

  it('Back 15 steps back fifteen seconds in the same recording', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    emit('playing');
    clockAt(45, 240);
    const srcAssignments = el().srcHistory.length;
    fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(el().currentTime).toBe(30);
    expect(AudioPlayer.getState().time).toBe(30);
    expect(el().srcHistory).toHaveLength(srcAssignments);   // a seek, not a re-fetch
  });

  it('reads out the position within the QUEUE in recordings, and stays quiet for a lone recording', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    emit('playing');
    expect(line2()).toBe('Volume One');          // "1 of 1" is noise, not information

    playWholeCollection();                      // the preface, Letter A in two parts, Letter C: three recordings
    emit('playing');
    expect(line2()).toBe('Volume One · 1 of 3');
    drive(() => AudioPlayer.next());
    emit('playing');
    expect(line2()).toBe('Volume One · 2 of 3');
    drive(() => AudioPlayer.next());
    emit('playing');
    expect(line2(), "Letter A's second part is still the second recording (31 vs 30, player brief s7)").toBe('Volume One · 2 of 3');
    drive(() => AudioPlayer.next());
    emit('playing');
    expect(line2()).toBe('Volume One · 3 of 3');
  });

  it('closes itself past the end of the queue', () => {
    render(<AudioPlayerBar />);
    playWholeCollection();
    for (let i = 0; i < 3; i++) drive(() => AudioPlayer.next());
    expect(title()).toBe('The Seventh Day');                 // last track in the queue
    drive(() => AudioPlayer.next());
    expect(AudioPlayer.getState().status).toBe('idle');       // past the end = done
    expect(bar()).toBeNull();
    expect(barOpenClass()).toBe(false);
  });

  it('✕ stops playback, hides the bar, and discards the resume snapshot', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    emit('playing');
    act(() => { el().currentTime = 6; el().dispatchEvent(new Event('timeupdate')); });
    expect(localStorage.getItem('vot-audio-pos')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(0);
    expect(el().src).toBe('');                                // connection dropped
    expect(bar()).toBeNull();
    expect(barOpenClass()).toBe(false);
    expect(localStorage.getItem('vot-audio-pos')).toBe(null);
  });

  it('✕ says Stopped with an Undo for 5 s that brings the session back where it was (brief 3a)', async () => {
    render(<AudioPlayerBar />);
    playWholeCollection();
    drive(() => AudioPlayer.next());
    emit('playing');
    clockAt(42, 300);
    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(bar()).toBeNull();
    const toast = document.getElementById('vot-toast-audio-stopped');
    expect(toast.textContent).toBe('StoppedUndo');
    expect(toast.classList.contains('show')).toBe(true);
    await act(async () => {
      fireEvent.click(toast.querySelector('.vot-undo-btn'));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(bar()).toBeTruthy();
    expect(title()).toBe('The Wide Path · Part 1');
    expect(AudioPlayer.getState().time).toBe(42);
    expect(toast.classList.contains('show')).toBe(false);
  });
});

describe('AudioPlayerBar — the listening desk disclosure', () => {
  it('opens AudioManagerSheet from the summary button, portalled out of the bar', () => {
    const { container } = render(<AudioPlayerBar />);
    playSingleLetter();

    const summary = screen.getByRole('button', { name: /Open listening controls\.$/ });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.audio-manager-sheet')).toBeNull();

    fireEvent.click(summary);
    expect(screen.getByRole('button', { name: /Open listening controls\.$/ }).getAttribute('aria-expanded')).toBe('true');
    const sheet = screen.getByRole('dialog');
    expect(sheet.classList.contains('audio-manager-sheet')).toBe(true);
    expect(document.body.contains(sheet)).toBe(true);
    expect(container.querySelector('.audio-manager-sheet')).toBeNull();   // portal, not a child of the bar
    expect(screen.getByRole('heading', { name: 'The Seventh Day' })).toBeTruthy();
  });

  it('the summary names what is playing, where, and how far, then what it opens (s13.1)', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    const label = () => document.querySelector('.audio-bar-summary').getAttribute('aria-label');
    expect(label()).toBe('Loading The Seventh Day, Volume One. Open listening controls.');
    act(() => {
      el().duration = 240; el().dispatchEvent(new Event('durationchange'));
      el().dispatchEvent(new Event('playing'));
      el().currentTime = 65; el().dispatchEvent(new Event('timeupdate'));
    });
    expect(label()).toBe('Now playing The Seventh Day, Volume One, 1:05 of 4:00. Open listening controls.');
    act(() => { el().dispatchEvent(new Event('pause')); });
    expect(label()).toBe('Paused on The Seventh Day, Volume One, 1:05 of 4:00. Open listening controls.');
  });

  it('closes the desk with the queue it controls when playback stops', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    fireEvent.click(screen.getByRole('button', { name: /Open listening controls\.$/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(modalRegistry.openIds()).toContain('audio-manager-sheet');

    drive(() => AudioPlayer.stop());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(modalRegistry.openIds()).not.toContain('audio-manager-sheet');

    // …and it does not come back on its own with the next recording.
    playSingleLetter();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Open listening controls\.$/ }).getAttribute('aria-expanded')).toBe('false');
  });
});
