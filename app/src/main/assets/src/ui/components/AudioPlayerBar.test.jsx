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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

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
const seekInput = () => screen.getByRole('slider', { name: 'Seek' });
const clock = () => document.querySelector('.audio-bar-time').textContent;
const title = () => document.querySelector('.audio-bar-title').textContent;

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
  modalRegistry._reset();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.__votAudioArbiter;
  delete globalThis.AUDIO_MANIFEST;
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
    expect(document.querySelector('.audio-bar-src').textContent).toBe('Volume One · Read by Timothy');
    expect(clock()).toBe('0:00');   // total unknown until metadata — never a fake 0:00 length
  });

  it('shows the part label of a multi-part letter alongside the title', () => {
    render(<AudioPlayerBar />);
    playWholeCollection();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));   // preface → Wide Path, Part 1

    expect(title()).toBe('The Wide Path · Part 1');
    expect(document.querySelector('.audio-bar-part').textContent).toBe(' · Part 1');
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

  it('offers prev/next only for a real queue, and walks it through the store', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    expect(screen.queryByRole('button', { name: 'Next track' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous track' })).toBeNull();

    playWholeCollection();
    expect(title()).toBe('A Word of Warning');
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA1'));

    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(title()).toBe('A Word of Warning');
  });

  it('clamps prev at the head of the queue and closes itself past the end', () => {
    render(<AudioPlayerBar />);
    playWholeCollection();

    // The bar has no disabled boundary states — the store owns the clamping.
    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(bar()).toBeTruthy();

    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(title()).toBe('The Seventh Day');                 // last track in the queue
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
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
});

describe('AudioPlayerBar — inline seek', () => {
  it('stays disabled while the length is unknown and never advertises max=0', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();

    const input = seekInput();
    expect(input.disabled).toBe(true);
    expect(input.max).toBe('1');                              // floored, never 0
    expect(input.getAttribute('aria-valuetext')).toBe('0:00 of unknown length');

    act(() => { el().currentTime = 123; el().dispatchEvent(new Event('timeupdate')); });
    expect(seekInput().disabled).toBe(true);
    expect(seekInput().getAttribute('aria-valuetext')).toBe('2:03 of unknown length');
    // Unknown length paints EMPTY, not full, and the clock never invents a
    // 0:00 total for a track that is plainly longer than that.
    expect(seekInput().value).toBe('0');
    expect(clock()).toBe('2:03');
  });

  it('follows the clock once metadata lands, and seeks the element when dragged', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    act(() => { el().duration = 240; el().dispatchEvent(new Event('durationchange')); });

    expect(seekInput().disabled).toBe(false);
    expect(seekInput().max).toBe('240');

    act(() => { el().currentTime = 65; el().dispatchEvent(new Event('timeupdate')); });
    expect(seekInput().value).toBe('65');                     // store → input
    expect(clock()).toBe('1:05 / 4:00');

    fireEvent.change(seekInput(), { target: { value: '150' } });
    expect(el().currentTime).toBe(150);                       // input → element
    expect(AudioPlayer.getState().time).toBe(150);
    expect(seekInput().value).toBe('150');
    expect(seekInput().getAttribute('aria-valuetext')).toBe('2:30 of 4:00');
    expect(clock()).toBe('2:30 / 4:00');
  });
});

describe('AudioPlayerBar — the listening desk disclosure', () => {
  it('opens AudioManagerSheet from the summary button, portalled out of the bar', () => {
    const { container } = render(<AudioPlayerBar />);
    playSingleLetter();

    const summary = screen.getByRole('button', { name: 'Open listening controls' });
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.audio-manager-sheet')).toBeNull();

    fireEvent.click(summary);
    expect(screen.getByRole('button', { name: 'Open listening controls' }).getAttribute('aria-expanded')).toBe('true');
    const sheet = screen.getByRole('dialog');
    expect(sheet.classList.contains('audio-manager-sheet')).toBe(true);
    expect(document.body.contains(sheet)).toBe(true);
    expect(container.querySelector('.audio-manager-sheet')).toBeNull();   // portal, not a child of the bar
    expect(screen.getByRole('heading', { name: 'The Seventh Day' })).toBeTruthy();
  });

  it('opens from the redundant pull tab, which stays out of the accessibility tree', () => {
    const { container } = render(<AudioPlayerBar />);
    playSingleLetter();

    const pull = container.querySelector('.audio-bar-pull');
    expect(pull.getAttribute('aria-hidden')).toBe('true');
    expect(pull.tabIndex).toBe(-1);

    fireEvent.click(pull);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes the desk with the queue it controls when playback stops', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    fireEvent.click(screen.getByRole('button', { name: 'Open listening controls' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(modalRegistry.openIds()).toContain('audio-manager-sheet');

    drive(() => AudioPlayer.stop());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(modalRegistry.openIds()).not.toContain('audio-manager-sheet');

    // …and it does not come back on its own with the next recording.
    playSingleLetter();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open listening controls' }).getAttribute('aria-expanded')).toBe('false');
  });
});
