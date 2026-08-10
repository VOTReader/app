// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element.
/* AudioManagerSheet — the listening desk over the ONE AudioPlayer singleton.
   ─────────────────────────────────────────────────────────────────────────
   The sheet is a controller, never a second player, so it is tested against
   the REAL utils/audio-player.js store (FakeAudio element + the classic-script
   manifest global, same harness as audio-player.test.js) rather than a stubbed
   module surface. A tiny harness subscribes to the store and feeds getState()
   in as the `state` prop — exactly what AudioPlayerBar does in production —
   which is what makes "click the control, then assert the player AND the
   re-rendered DOM" possible in one pass.

   The player is a module singleton; state is reset between tests through its
   own public stop(), not vi.resetModules() (a re-import would hand the
   component a second copy of the store). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as ReactDOM from 'react-dom';

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_PLAYBACK_RATES } from '../../utils/audio-track.js';
import { AudioManagerSheet } from './AudioManagerSheet.jsx';

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

/* Four single-part recordings with distinct titles: the queue editor addresses
   its rows by title, so a repeated one would make the move/remove labels
   ambiguous. letter-a carries a partLabel so the header's sub · part · reader
   line is exercised. */
const MANIFEST = {
  'vol1:preface': [['idPreface', 'B']],
  'vol1:letter-a': [['idA', 'B', 'Part 1']],
  'vol1:letter-b': [['idB', 'T']],
  'vol1:letter-c': [['idC', 'V']],
};

const ITEMS = [
  { id: 'preface', title: 'A Word of Warning' },
  { id: 'letter-a', title: 'The Wide Path' },
  { id: 'letter-b', title: 'The Seventh Day' },
  { id: 'letter-c', title: 'Grafted In' },
];

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';

/** A minimal but honest AudioLibraryStore (bundle-b in production). */
function makeLibrary() {
  const saved = new Set();
  const listeners = new Set();
  let version = 0;
  let rate = 1;
  const notify = () => { version++; for (const cb of listeners) cb(); };
  return {
    subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getVersion: () => version,
    isSaved: (track) => !!track && saved.has(track.url),
    toggleSaved: vi.fn((track) => {
      if (saved.has(track.url)) saved.delete(track.url); else saved.add(track.url);
      notify();
    }),
    recordPlayed: vi.fn(),
    countPlay: vi.fn(),
    getPlaybackRate: () => rate,
    setPlaybackRate: vi.fn((next) => { rate = next; }),
  };
}

let library;

/** What AudioPlayerBar mounts in production: a live subscription + getState(). */
function ManagerHarness({ onClose }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  return <AudioManagerSheet open state={AudioPlayer.getState()} onClose={onClose} />;
}

const el = () => FakeAudio.last;
const emit = (type) => act(() => { el().dispatchEvent(new Event(type)); });
const drive = (fn) => act(() => { fn(); });

/** A 4-track collection queue, positioned at the preface. */
const startCollection = () =>
  AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
/** A queue of exactly one recording. */
const startSingle = () =>
  AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Grafted In' }, collectionLabel: 'Volume One' });

function openSheet(onClose = () => {}) {
  return render(<ManagerHarness onClose={onClose} />);
}

const sheetEl = () => document.querySelector('.audio-manager-sheet');
const headSub = () => document.querySelector('.audio-manager-track-copy p').textContent;
const timeSpans = () => Array.from(document.querySelectorAll('.audio-manager-time span')).map((s) => s.textContent);
/* Addressed by NAME, not by position: the Voice tool appears between Speed and
   Sleep only for a recording that has more than one, so an index would drift. */
const toolValue = (name) => {
  const head = Array.from(document.querySelectorAll('.audio-manager-tool-head'))
    .find((node) => node.querySelector('span').textContent === name);
  return head ? head.querySelector('strong').textContent : null;
};
const speedValue = () => toolValue('Speed');
const sleepValue = () => toolValue('Sleep timer');
const voiceValue = () => toolValue('Voice') ?? toolValue('Audio Bible');
const queueSummary = () => document.querySelector('.audio-manager-section-head strong').textContent;
const queueList = () => document.querySelector('.audio-manager-queue ol');
const queueRows = () => Array.from(document.querySelectorAll('.audio-manager-queue li'));
/** Every row the queue renders — played, current, and upcoming alike. */
const queueTitles = () =>
  Array.from(document.querySelectorAll('.audio-manager-queue-main strong')).map((n) => n.textContent);
const upcomingTitles = () =>
  Array.from(document.querySelectorAll('.audio-manager-queue li:not(.is-played):not(.is-current) .audio-manager-queue-main strong'))
    .map((n) => n.textContent);
const voiceChips = () =>
  Array.from(document.querySelectorAll('.audio-manager-voice .audio-manager-segment button'));

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.ReactDOM = ReactDOM;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  localStorage.removeItem('vot-audio-pos');
  modalRegistry._reset();
  AudioPlayer.stop();
  AudioPlayer.setPlaybackRate(1);
  if (FakeAudio.last) { FakeAudio.last.duration = 0; FakeAudio.last.currentTime = 0; FakeAudio.last.error = null; }
  library = makeLibrary();
  globalThis.AudioLibraryStore = library;
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  modalRegistry._reset();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.__votAudioArbiter;
  delete globalThis.AudioLibraryStore;
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.ReactDOM;
  delete globalThis.Audio;
  localStorage.removeItem('vot-audio-pos');
});

describe('AudioManagerSheet — modal contract', () => {
  it('renders nothing when it is open but the player holds no current recording', () => {
    openSheet();                                   // player idle: queue is empty
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sheetEl()).toBeNull();
    expect(document.querySelector('.audio-manager-backdrop')).toBeNull();
  });

  it('portals to <body> as a focus-trapped dialog keyboard focus cannot leave', () => {
    startCollection();
    const { container } = openSheet();

    const sheet = screen.getByRole('dialog', { name: 'A Word of Warning' });
    expect(sheet).toBe(sheetEl());
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('.audio-manager-sheet')).toBeNull();   // portalled out of the bar
    expect(document.body.contains(sheet)).toBe(true);

    const focusables = sheet.querySelectorAll('button:not([disabled]), input:not([disabled])');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);                            // wraps, never escapes

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes through the Escape dispatcher, the sheet handle, and the backdrop — never by stopping audio', () => {
    startCollection();
    const onClose = vi.fn();
    openSheet(onClose);

    expect(modalRegistry.peek().id).toBe('audio-manager-sheet');
    expect(window.__closeSheet).toBe(onClose);                             // SheetHandle's grabber bridge

    act(() => { modalRegistry.peek().dismiss(); });                        // the app's Escape/back path
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(document.querySelector('.audio-manager-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);

    // Dismissal is the host's business: the controller never tears down playback.
    expect(AudioPlayer.getState().status).not.toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(4);
  });
});

describe('AudioManagerSheet — now playing + the Listening Library star', () => {
  it('names the recording with its collection, part, reader, and place in the queue', () => {
    startCollection();
    openSheet();
    expect(screen.getByRole('heading', { name: 'A Word of Warning' })).toBeTruthy();
    expect(headSub()).toBe('Volume One · Read by Benjamin · 1 of 4');

    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(screen.getByRole('heading', { name: 'The Wide Path' })).toBeTruthy();
    expect(headSub()).toBe('Volume One · Part 1 · Read by Benjamin · 2 of 4');
  });

  it('leaves the place-in-queue readout off a lone recording', () => {
    startSingle();
    openSheet();
    expect(headSub()).toBe('Volume One · Text-to-speech');
  });

  it('saves and unsaves the current recording through AudioLibraryStore', () => {
    startCollection();
    openSheet();

    const save = screen.getByRole('button', { name: 'Save recording' });
    expect(save.getAttribute('aria-pressed')).toBe('false');
    expect(save.textContent).toContain('Save');

    fireEvent.click(save);
    expect(library.toggleSaved).toHaveBeenCalledWith(expect.objectContaining({ url: URL_OF('idPreface') }));

    const saved = screen.getByRole('button', { name: 'Remove from saved recordings' });
    expect(saved.getAttribute('aria-pressed')).toBe('true');
    expect(saved.textContent).toContain('Saved');
    expect(saved.classList.contains('is-saved')).toBe(true);

    fireEvent.click(saved);
    expect(library.toggleSaved).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Save recording' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('AudioManagerSheet — transport', () => {
  it('counts buffering as an active session and toggles the real element', () => {
    startCollection();
    openSheet();

    // status 'loading': the desk shows Pause (the mini-player shows Play for the
    // same status — see AudioPlayerBar.test.jsx).
    const busy = screen.getByRole('button', { name: 'Pause' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.classList.contains('is-loading')).toBe(true);

    emit('playing');
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-busy')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(el().paused).toBe(true);
    expect(AudioPlayer.getState().status).toBe('paused');

    el().played = false;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(el().played).toBe(true);
  });

  it('turns prev into a live Restart for a queue of one, and disables next at the end', () => {
    startSingle();
    openSheet();
    // The desk mirrors the bar: a lone recording still deserves a restart.
    const restart = screen.getByRole('button', { name: 'Restart' });
    expect(restart.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Previous track' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next track' }).disabled).toBe(true);

    act(() => { el().duration = 300; el().dispatchEvent(new Event('durationchange')); });
    drive(() => AudioPlayer.seek(120));
    fireEvent.click(restart);
    expect(el().currentTime).toBe(0);
    expect(AudioPlayer.getState().qi).toBe(0);

    drive(startCollection);
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous track' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Next track' }).disabled).toBe(false);

    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(AudioPlayer.getState().qi).toBe(3);
    expect(screen.getByRole('button', { name: 'Next track' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous track' }).disabled).toBe(false);
  });

  it('binds the progress slider to the player in both directions', () => {
    startCollection();
    openSheet();

    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider.disabled).toBe(true);                 // length unknown until metadata
    expect(slider.max).toBe('1');                       // never advertises max=0
    expect(slider.getAttribute('aria-valuetext')).toBe('0:00 of unknown length');
    expect(timeSpans()).toEqual(['0:00', '—']);

    act(() => { el().duration = 300; el().dispatchEvent(new Event('durationchange')); });
    expect(slider.disabled).toBe(false);
    expect(slider.max).toBe('300');

    act(() => { el().currentTime = 90; el().dispatchEvent(new Event('timeupdate')); });
    expect(slider.value).toBe('90');                    // player → slider
    expect(timeSpans()).toEqual(['1:30', '5:00']);

    fireEvent.change(slider, { target: { value: '200' } });
    expect(el().currentTime).toBe(200);                 // slider → player
    expect(AudioPlayer.getState().time).toBe(200);
    expect(slider.getAttribute('aria-valuetext')).toBe('3:20 of 5:00');
    expect(timeSpans()).toEqual(['3:20', '5:00']);
  });

  it('jumps ∓15 seconds through the store, clamped to the recording', () => {
    startCollection();
    openSheet();
    act(() => { el().duration = 300; el().dispatchEvent(new Event('durationchange')); });

    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(el().currentTime).toBe(15);
    expect(timeSpans()).toEqual(['0:15', '5:00']);

    fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(el().currentTime).toBe(0);                   // clamped at the head, not -15

    drive(() => AudioPlayer.seek(295));
    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(el().currentTime).toBe(300);                 // …and at the tail
  });
});

describe('AudioManagerSheet — speed', () => {
  it('offers every registry preset, marks the active one, and applies the choice', () => {
    startCollection();
    openSheet();

    expect(screen.getAllByRole('radio')).toHaveLength(AUDIO_PLAYBACK_RATES.length);
    // The registry IS the closed set the radiogroup renders — including the
    // 1.75× step between 1.5 and 2 that a long recording actually wants.
    expect(screen.getAllByRole('radio').map((b) => b.textContent)).toEqual(['0.75×', '1×', '1.25×', '1.5×', '1.75×', '2×']);
    expect(speedValue()).toBe('1×');
    expect(screen.getByRole('radio', { name: '1×' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '1×' }).classList.contains('is-active')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: '1.5×' }));

    expect(AudioPlayer.getState().rate).toBe(1.5);
    expect(el().playbackRate).toBe(1.5);
    expect(el().defaultPlaybackRate).toBe(1.5);         // survives the next load algorithm
    expect(library.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(speedValue()).toBe('1.5×');
    expect(screen.getByRole('radio', { name: '1.5×' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '1×' }).getAttribute('aria-checked')).toBe('false');

    // The chosen speed rides through a track change (the load algorithm resets it).
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(el().playbackRate).toBe(1.5);
    expect(speedValue()).toBe('1.5×');
  });
});

describe('AudioManagerSheet — sleep timer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is inert until armed, counts down while paused, and Clear disarms it', () => {
    startCollection();
    openSheet();
    emit('playing');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));   // no playback tick to lean on

    expect(sleepValue()).toBe('Off');
    expect(screen.getByRole('button', { name: 'Clear' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '30m' }));
    expect(AudioPlayer.getState().sleepEndsAt).toBeGreaterThan(0);
    expect(sleepValue()).toBe('30 min left');
    expect(screen.getByRole('button', { name: 'Clear' }).disabled).toBe(false);

    act(() => { vi.advanceTimersByTime(61000); });                    // the sheet's own 1 Hz tick
    expect(sleepValue()).toBe('29 min left');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
    expect(sleepValue()).toBe('Off');
    expect(screen.getByRole('button', { name: 'Clear' }).disabled).toBe(true);
    expect(AudioPlayer.getState().queue).toHaveLength(4);             // disarming touches nothing else
  });

  it('offers the three presets and arms the one that is tapped', () => {
    startCollection();
    openSheet();
    emit('playing');

    for (const label of ['15m', '30m', '60m']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '15m' }));
    expect(sleepValue()).toBe('15 min left');
    expect(AudioPlayer.getSleepRemainingSeconds()).toBe(900);
  });

  /* The fourth option. A minute countdown can't say "finish this chapter": a
     computed end time is wrong the moment the speed changes or the stream
     stalls, so the flag rides the 'ended' event instead. */
  it('arms End of track beside the countdowns, shows it in the head, and pauses at the boundary', () => {
    startCollection();
    openSheet();
    emit('playing');

    const endOfTrack = screen.getByRole('button', { name: 'End of track' });
    expect(endOfTrack.getAttribute('aria-pressed')).toBe('false');
    expect(sleepValue()).toBe('Off');

    fireEvent.click(endOfTrack);
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(true);
    expect(sleepValue()).toBe('Ends after this track');
    expect(screen.getByRole('button', { name: 'End of track' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'End of track' }).classList.contains('is-active')).toBe(true);
    expect(screen.getByRole('button', { name: 'Clear' }).disabled).toBe(false);

    emit('ended');
    expect(AudioPlayer.getState().qi).toBe(0);            // the next recording never started
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(sleepValue()).toBe('Off');                     // one-shot, cleared itself
  });

  it('lets Clear disarm End of track, and each sleep mode replaces the other', () => {
    startCollection();
    openSheet();
    emit('playing');

    fireEvent.click(screen.getByRole('button', { name: 'End of track' }));
    fireEvent.click(screen.getByRole('button', { name: '30m' }));
    expect(sleepValue()).toBe('30 min left');
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'End of track' }));
    expect(sleepValue()).toBe('Ends after this track');
    expect(AudioPlayer.getSleepRemainingSeconds()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(sleepValue()).toBe('Off');
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(false);
    expect(screen.getByRole('button', { name: 'Clear' }).disabled).toBe(true);

    emit('ended');
    expect(AudioPlayer.getState().qi).toBe(1);            // disarmed — advanced normally
  });
});

describe('AudioManagerSheet — the whole-queue picker', () => {
  it('renders played, current and upcoming rows, and re-picks a played recording', () => {
    startCollection();
    openSheet();

    expect(queueSummary()).toBe('1 of 4');
    expect(queueTitles()).toEqual(['A Word of Warning', 'The Wide Path', 'The Seventh Day', 'Grafted In']);
    // Short queues render whole — no expanders to discover.
    expect(queueRows()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Show \d+ (earlier|later)/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    expect(queueSummary()).toBe('2 of 4');
    // Nothing leaves the list as playback advances — the preface is now a
    // dimmed, still-tappable row rather than a recording that vanished.
    expect(queueTitles()).toEqual(['A Word of Warning', 'The Wide Path', 'The Seventh Day', 'Grafted In']);
    expect(queueRows().map((li) => li.className)).toEqual(['is-played', 'is-current', '', '']);
    expect(within(queueList()).getByText('The Wide Path')).toBeTruthy();

    // THE point of the change: a recording already heard can be picked again.
    fireEvent.click(screen.getByRole('button', { name: 'Play again: A Word of Warning' }));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(el().src).toBe(URL_OF('idPreface'));
    expect(queueSummary()).toBe('1 of 4');
  });

  it('marks the playing row and gives it no edit controls at all', () => {
    startCollection();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));   // playing: The Wide Path

    const current = document.querySelector('.audio-manager-queue li.is-current');
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(current.querySelector('.audio-manager-queue-actions')).toBeNull();
    expect(current.querySelector('button')).toBeNull();      // a marker, not a control
    expect(current.querySelector('small').textContent).toBe('Playing now · Part 1');
    // removeUpcoming's protection is still the store-level guarantee.
    expect(AudioPlayer.removeUpcoming(AudioPlayer.getState().qi)).toBe(false);
    expect(AudioPlayer.getState().queue).toHaveLength(4);
  });

  it('reorders upcoming rows without disturbing the streaming track', () => {
    startCollection();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));   // playing: The Wide Path

    expect(screen.getByRole('button', { name: 'Move The Seventh Day earlier' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Grafted In later' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move The Seventh Day later' }));
    expect(upcomingTitles()).toEqual(['Grafted In', 'The Seventh Day']);
    expect(AudioPlayer.getState().queue.map((t) => t.url))
      .toEqual([URL_OF('idPreface'), URL_OF('idA'), URL_OF('idC'), URL_OF('idB')]);
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA'));                                  // never re-started

    fireEvent.click(screen.getByRole('button', { name: 'Move The Seventh Day earlier' }));
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'Grafted In']);
  });

  it('removes and clears upcoming rows while keeping the heard ones listed', () => {
    startCollection();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));   // playing: The Wide Path

    fireEvent.click(screen.getByRole('button', { name: 'Remove The Seventh Day from queue' }));
    expect(upcomingTitles()).toEqual(['Grafted In']);
    expect(queueSummary()).toBe('2 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Clear upcoming' }));
    expect(upcomingTitles()).toEqual([]);
    expect(queueSummary()).toBe('2 of 2');
    expect(screen.queryByRole('button', { name: 'Clear upcoming' })).toBeNull();
    expect(document.querySelector('.audio-manager-empty')).toBeTruthy();
    // Played + current still stand: clearing the queue clears what is AHEAD.
    expect(queueTitles()).toEqual(['A Word of Warning', 'The Wide Path']);

    const state = AudioPlayer.getState();
    expect(state.queue.map((t) => t.url)).toEqual([URL_OF('idPreface'), URL_OF('idA')]);
    expect(state.qi).toBe(1);
    expect(state.status).not.toBe('idle');
    expect(el().src).toBe(URL_OF('idA'));
    expect(screen.getByRole('heading', { name: 'The Wide Path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next track' }).disabled).toBe(true);
  });

  it('centres the playing row when the desk opens', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      startCollection();
      drive(() => AudioPlayer.playAt(2));
      openSheet();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.calls[0][0]).toEqual({ block: 'center' });
      expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('.audio-manager-queue li.is-current'));
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });
});

/* A whole Bible edition queues 1,189 chapters. The desk renders a WINDOW of
   current ± 40 with two paged expanders — deliberately dumb, no virtual
   scroller — and everything short of ~80 rows still renders whole. */
describe('AudioManagerSheet — a very long queue', () => {
  const BIG_MANIFEST = {};
  const BIG_ITEMS = [];
  for (let i = 1; i <= 200; i++) {
    BIG_MANIFEST['big:item-' + i] = [['id' + i, 'B']];
    BIG_ITEMS.push({ id: 'item-' + i, title: 'Track ' + i });
  }

  const startBig = () => drive(() => AudioPlayer.playCollection({ volKey: 'big', items: BIG_ITEMS, collectionLabel: 'Big' }));

  beforeEach(() => { globalThis.AUDIO_MANIFEST = BIG_MANIFEST; });

  it('windows the rows at the head of a long queue', () => {
    startBig();
    openSheet();
    expect(AudioPlayer.getState().queue).toHaveLength(200);
    expect(queueSummary()).toBe('1 of 200');

    // Current + 40 ahead; nothing earlier exists, so no expander for it.
    expect(queueRows()).toHaveLength(41);
    expect(screen.queryByRole('button', { name: /Show \d+ earlier/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 40 later' }));
    expect(queueRows()).toHaveLength(81);
  });

  it('centres the window on a deep position and pages outward in both directions', () => {
    startBig();
    drive(() => AudioPlayer.playAt(120));
    openSheet();

    expect(queueRows()).toHaveLength(81);          // 120 ± 40
    expect(queueTitles()[0]).toBe('Track 81');     // queue index 80, 1-based title
    expect(queueTitles()[80]).toBe('Track 161');

    fireEvent.click(screen.getByRole('button', { name: 'Show 40 earlier' }));
    expect(queueRows()).toHaveLength(121);
    expect(queueTitles()[0]).toBe('Track 41');

    // The tail is 39 rows away, and the expander says so rather than lying at 40.
    fireEvent.click(screen.getByRole('button', { name: 'Show 39 later' }));
    expect(queueRows()).toHaveLength(160);
    expect(screen.queryByRole('button', { name: /Show \d+ later/ })).toBeNull();
  });
});

/* Voice switching (owner directive 2026-08-09). One explicit rule for both
   shapes: choosing a voice RESTARTS the recording — two readers never reach the
   same words at the same second, so a carried position would be a lie. */
describe('AudioManagerSheet — Voice: letter readers', () => {
  beforeEach(() => {
    globalThis.AUDIO_ALTERNATES = { 'vol1:letter-a': [['V', [['idAv', 'Part 1']]]] };
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', letterScreen: 'vol1-letter' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
  });
  afterEach(() => {
    for (const key of ['AUDIO_ALTERNATES', 'COL_BY_KEY', 'colPreface', 'colLetterArr']) delete globalThis[key];
  });

  it('offers no Voice row for a recording with a single reading', () => {
    startCollection();                                    // the preface: one voice
    openSheet();
    expect(document.querySelector('.audio-manager-voice')).toBeNull();
    expect(voiceValue()).toBe(null);
  });

  it('lists every reader, marks the current one, and restarts the letter in the chosen voice', () => {
    startCollection();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));   // The Wide Path — two readings

    expect(voiceValue()).toBe('Read by Benjamin');
    expect(voiceChips().map((chip) => chip.textContent)).toEqual(['Read by Benjamin', 'Text-to-speech']);
    expect(voiceChips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(document.querySelector('.audio-manager-voice-note').textContent).toContain('Switches this recording');

    act(() => { el().duration = 300; el().dispatchEvent(new Event('durationchange')); });
    drive(() => AudioPlayer.seek(120));
    fireEvent.click(screen.getByRole('button', { name: 'Text-to-speech' }));

    const state = AudioPlayer.getState();
    // The s4 album machinery: the chosen letter in the chosen voice, the rest
    // of the collection still behind it, and the queue still forward-only.
    expect(state.queue.map((t) => t.url)).toEqual([URL_OF('idAv'), URL_OF('idB'), URL_OF('idC')]);
    expect(state.qi).toBe(0);
    expect(state.queue[0].readerCode).toBe('V');
    expect(el().src).toBe(URL_OF('idAv'));
    expect(el().currentTime).toBe(0);                     // restarted, never spliced
    expect(voiceValue()).toBe('Text-to-speech');
    // Chip ORDER is the manifest's (primary first) so the row never reshuffles
    // under the finger; only which one is pressed moves.
    expect(voiceChips().map((chip) => chip.textContent)).toEqual(['Read by Benjamin', 'Text-to-speech']);
    expect(voiceChips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('falls back to the lone letter when the collection registry has not landed', () => {
    delete globalThis.COL_BY_KEY;
    delete globalThis.colLetterArr;
    startCollection();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text-to-speech' }));
    expect(AudioPlayer.getState().queue.map((t) => t.url)).toEqual([URL_OF('idAv')]);
  });
});

describe('AudioManagerSheet — Voice: Bible editions', () => {
  const BURL = (id, tag) => 'https://github.com/VOTReader/votreader-assets/releases/download/' + tag + '/' + id + '.mp3';

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_BOOKS = [['genesis', 'Genesis'], ['exodus', 'Exodus']];
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:genesis': [['brm1_genesis_001', '', 'Chapter 1'], ['brm1_genesis_002', '', 'Chapter 2'], ['brm1_genesis_003', '', 'Chapter 3']],
      'bible-brm-kjv:exodus': [['brm1_exodus_001', '', 'Chapter 1']],
      'bible-wop-nkjv:genesis': [['wop1_genesis_001', '', 'Chapter 1'], ['wop1_genesis_002', '', 'Chapter 2'], ['wop1_genesis_003', '', 'Chapter 3']],
    };
  });
  afterEach(() => {
    for (const key of ['BIBLE_AUDIO_BOOKS', 'BIBLE_AUDIO_MANIFEST']) delete globalThis[key];
    delete window.__setBibleAudioEdition;
  });

  const startGenesis2 = () => drive(() => AudioPlayer.playBibleBook({
    volKey: 'bible-brm-kjv', bookId: 'genesis', chapterNum: 2, label: 'KJV · Biblical Restoration Ministries',
  }));

  it('names the editions by their short codes and switches the SAME chapter', () => {
    const setEdition = vi.fn();
    window.__setBibleAudioEdition = setEdition;
    startGenesis2();
    openSheet();

    // WEB ships no rows for this book in the fixture, so it is not offered —
    // a chip that taps through to silence is worse than no chip.
    expect(voiceChips().map((chip) => chip.textContent)).toEqual(['KJV · BRM', 'NKJV · Dramatized']);
    expect(voiceValue()).toBe('KJV · BRM');
    expect(voiceChips()[0].getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.audio-manager-voice-note').textContent).toContain('Switches this chapter');

    fireEvent.click(screen.getByRole('button', { name: 'NKJV · Dramatized' }));
    const state = AudioPlayer.getState();
    expect(state.queue[state.qi].url).toBe(BURL('wop1_genesis_002', 'audio-wop-v1'));
    expect(state.queue[state.qi].partLabel).toBe('Chapter 2');       // same chapter, other voice
    expect(el().currentTime).toBe(0);
    // Every Listen pill elsewhere reads settings.bibleAudio, so the choice moves it.
    expect(setEdition).toHaveBeenCalledWith('wop-nkjv');
    expect(voiceValue()).toBe('NKJV · Dramatized');
  });

  it('shows no Voice row for a book only one edition has recorded', () => {
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'exodus', label: 'KJV · Biblical Restoration Ministries' }));
    openSheet();
    expect(document.querySelector('.audio-manager-voice')).toBeNull();
  });

  it('survives an app with no settings bridge wired', () => {
    startGenesis2();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'NKJV · Dramatized' }));
    expect(AudioPlayer.getState().queue[0].url).toBe(BURL('wop1_genesis_002', 'audio-wop-v1'));
  });
});

describe('AudioManagerSheet — title jump to text (owner request 2026-08-09)', () => {
  afterEach(() => {
    delete globalThis.COL_BY_KEY;
    delete window.__openAudioText;
  });

  it('the title is a chevroned button that opens the text and closes the sheet — playback untouched', () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { letterScreen: 'vol1-letter' }]]);
    const opener = vi.fn();
    window.__openAudioText = opener;
    startCollection();
    emit('playing');
    const onClose = vi.fn();
    openSheet(onClose);

    const jump = document.querySelector('.audio-manager-jump');
    expect(jump).toBeTruthy();
    // The '›' go-to cue the owner asked for — marks the title as tappable.
    expect(jump.querySelector('.audio-manager-jump-chevron')).toBeTruthy();
    expect(jump.getAttribute('aria-label')).toContain('playback continues');

    const before = AudioPlayer.getState();
    const loadsBefore = el().loadCalls;
    const srcBefore = el().src;
    fireEvent.click(jump);
    expect(opener).toHaveBeenCalledTimes(1);
    expect(opener.mock.calls[0][0].key).toBe('vol1:preface');
    expect(onClose).toHaveBeenCalledTimes(1);
    // Pure navigation: the player never noticed the jump.
    const after = AudioPlayer.getState();
    expect(after.status).toBe('playing');
    expect(after.qi).toBe(before.qi);
    expect(el().paused).toBe(false);
    expect(el().loadCalls).toBe(loadsBefore);   // never reloaded…
    expect(el().src).toBe(srcBefore);           // …never restarted
  });

  it('a track with no destination keeps the plain, untappable title', () => {
    // No COL_BY_KEY installed → vol1 resolves no letterScreen → plain copy.
    window.__openAudioText = vi.fn();
    startCollection();
    openSheet();
    expect(document.querySelector('.audio-manager-jump')).toBeNull();
    expect(document.querySelector('.audio-manager-track-copy h2')).toBeTruthy();
  });

  it('hasTextDestination: Bible tracks are jumpable, keyless compilations are not', async () => {
    const { hasTextDestination } = await import('./AudioShelf.jsx');
    expect(hasTextDestination({ key: 'bible-brm-kjv:jeremiah', partLabel: 'Chapter 46' })).toBe(true);
    expect(hasTextDestination({ key: null })).toBe(false);
    expect(hasTextDestination({ key: 'vol1:letter-a' })).toBe(false);   // no COL_BY_KEY here
  });
});
