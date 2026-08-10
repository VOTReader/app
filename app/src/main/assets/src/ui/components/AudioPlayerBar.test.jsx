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
const seekInput = () => screen.getByRole('slider', { name: 'Seek' });
const clock = () => document.querySelector('.audio-bar-time').textContent;
const title = () => document.querySelector('.audio-bar-title').textContent;
const position = () => {
  const node = document.querySelector('.audio-bar-pos');
  return node ? node.textContent : null;
};

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

  /* A per-chapter Bible track carries BOTH a chapter title (C2-A/A4) and its
     "Chapter N" part label, so the bar printed the number twice in one glance:
     "Genesis 2 · Chapter 2". The label is still the data every consumer parses
     — only the echo is suppressed, and only when the title already ends with
     that number (2026-08-10). */
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

  it('offers next only for a real queue, and walks it through the store', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    expect(screen.queryByRole('button', { name: 'Next track' })).toBeNull();

    playWholeCollection();
    expect(title()).toBe('A Word of Warning');
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA1'));

    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(title()).toBe('A Word of Warning');
  });

  /* A saved recording played on its own used to have NO restart control at all:
     next was meaningless so the whole prev/next pair was hidden, and the desk
     disabled prev. The glyph stays; only what it promises changes. */
  it('keeps prev as a Restart control on a queue of one, with next still hidden', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();

    const restart = screen.getByRole('button', { name: 'Restart' });
    expect(restart.classList.contains('audio-bar-nav')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Previous track' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next track' })).toBeNull();

    act(() => { el().duration = 240; el().dispatchEvent(new Event('durationchange')); });
    act(() => { el().currentTime = 45; el().dispatchEvent(new Event('timeupdate')); });
    const srcAssignments = el().srcHistory.length;

    fireEvent.click(restart);
    expect(el().currentTime).toBe(0);
    expect(AudioPlayer.getState().time).toBe(0);
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(el().srcHistory).toHaveLength(srcAssignments);   // a seek, not a re-fetch

    // A real queue relabels the same control.
    playWholeCollection();
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous track' })).toBeTruthy();
  });

  it('reads out the position within the QUEUE, and stays quiet for a lone recording', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    expect(position()).toBe(null);              // "1 of 1" is noise, not information

    playWholeCollection();
    expect(position()).toBe('· 1 of 4');
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(position()).toBe('· 2 of 4');
    // …counted within the queue, beside the source line, never inside it.
    expect(document.querySelector('.audio-bar-src').textContent).toBe('Volume One · Read by Benjamin');
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

describe('AudioPlayerBar — the scrub commits on release', () => {
  /** A known-length track, 30s in. */
  function playWithLength() {
    playSingleLetter();
    act(() => { el().duration = 240; el().dispatchEvent(new Event('durationchange')); });
    act(() => { el().currentTime = 30; el().dispatchEvent(new Event('timeupdate')); });
  }
  const bubble = () => document.querySelector('.audio-seek-bubble');

  it('previews under the finger and seeks ONCE when it lifts', () => {
    render(<AudioPlayerBar />);
    playWithLength();

    const input = seekInput();
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '90' } });
    fireEvent.change(input, { target: { value: '150' } });

    // Nothing committed yet: with a durable position store behind seek(), a
    // commit per drag pixel would be a seek + a write per pixel.
    expect(el().currentTime).toBe(30);
    expect(AudioPlayer.getState().time).toBe(30);
    expect(clock()).toBe('0:30 / 4:00');
    // …while the thumb and its readout follow the drag.
    expect(seekInput().value).toBe('150');
    expect(bubble().textContent).toBe('2:30');

    fireEvent.pointerUp(input);
    expect(el().currentTime).toBe(150);
    expect(AudioPlayer.getState().time).toBe(150);
    expect(bubble()).toBeNull();
  });

  it('commits immediately when no pointer is down — the keyboard path', () => {
    render(<AudioPlayerBar />);
    playWithLength();

    // An arrow key fires the same value change with no pointer involved; a
    // keyboard listener must not have to lift a finger to be heard.
    fireEvent.change(seekInput(), { target: { value: '60' } });
    expect(el().currentTime).toBe(60);
    expect(bubble()).toBeNull();
  });

  it('a cancelled gesture drops the preview and leaves the clock alone', () => {
    render(<AudioPlayerBar />);
    playWithLength();

    const input = seekInput();
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: '200' } });
    expect(bubble()).toBeTruthy();

    fireEvent.pointerCancel(input);
    expect(bubble()).toBeNull();
    expect(el().currentTime).toBe(30);          // the store's position re-asserts
    expect(seekInput().value).toBe('30');
  });

  it('paints the played portion from the position percent', () => {
    render(<AudioPlayerBar />);
    playWithLength();
    // ONE inline custom property drives both engines' track pseudo-elements.
    expect(seekInput().getAttribute('style')).toContain('--seek-pct: 12.50%');

    act(() => { el().currentTime = 120; el().dispatchEvent(new Event('timeupdate')); });
    expect(seekInput().getAttribute('style')).toContain('--seek-pct: 50.00%');
  });

  it('paints an unknown length EMPTY rather than full', () => {
    render(<AudioPlayerBar />);
    playSingleLetter();
    act(() => { el().currentTime = 123; el().dispatchEvent(new Event('timeupdate')); });
    expect(seekInput().disabled).toBe(true);
    expect(seekInput().value).toBe('0');
    expect(seekInput().getAttribute('style')).toContain('--seek-pct: 0.00%');
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
