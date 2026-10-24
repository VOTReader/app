// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element.
/* AudioManagerSheet — the full Now Playing screen over the ONE AudioPlayer singleton.
   ─────────────────────────────────────────────────────────────────────────
   The screen is a controller, never a second player, so it is tested against
   the REAL utils/audio-player.js store (FakeAudio element + the classic-script
   manifest global, same harness as audio-player.test.js) rather than a stubbed
   module surface. A tiny harness subscribes to the store and feeds getState()
   in as the `state` prop — exactly what AudioPlayerBar does in production —
   which is what makes "click the control, then assert the player AND the
   re-rendered DOM" possible in one pass.

   The screen's head (kicker, ⋯), body (title, byline, Voice chip, "Open the
   reading") and pinned dock (scrubber, transport, bottom row) are tested here;
   each bottom-row button opens one of PlayerSheets.jsx's small sheets (Speed,
   Sleep timer, Voice, Up next), which are driven through the screen.

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

/* Four single-part recordings with distinct titles: the Up next rows are
   addressed by title, so a repeated one would make the move/remove labels
   ambiguous. letter-a carries a partLabel so the byline's part · reader line
   is exercised. */
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
      return saved.has(track.url);
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
const setDuration = (seconds) => act(() => { el().duration = seconds; el().dispatchEvent(new Event('durationchange')); });

/** A 4-track collection queue, positioned at the preface. */
const startCollection = () =>
  AudioPlayer.playCollection({ volKey: 'vol1', items: ITEMS, collectionLabel: 'Volume One' });
/** A queue of exactly one recording. */
const startSingle = () =>
  AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Grafted In' }, collectionLabel: 'Volume One' });

function openSheet(onClose = () => {}) {
  return render(<ManagerHarness onClose={onClose} />);
}

/* ── the screen ── */
const sheetEl = () => document.querySelector('.audio-manager-sheet');
/** The player's own controls, never a sub-sheet's (Up next repeats Play/Pause and Next track). */
const inPlayer = () => within(sheetEl());
const kicker = () => document.querySelector('.np-kicker').textContent;
const byline = () => { const node = document.querySelector('.np-body .np-byline'); return node ? node.textContent : null; };
const timeSpans = () => Array.from(document.querySelectorAll('.audio-manager-time span')).map((s) => s.textContent);
const tool = (prefix) => document.querySelector('.np-tools button[aria-label^="' + prefix + '"]');
const speedLabel = () => tool('Speed, ').getAttribute('aria-label');
const nextTrack = () => inPlayer().getByRole('button', { name: 'Next track' });

/* ── the small sheets ── */
const subSheet = (cls) => document.querySelector('.' + cls);
const openSpeed = () => fireEvent.click(tool('Speed, '));
const openSleep = () => fireEvent.click(tool('Sleep timer'));
const openUpNext = () => fireEvent.click(tool('Up next'));
const openVoice = () => fireEvent.click(document.querySelector('.audio-manager-voice-top'));
const sleepStatus = () => subSheet('np-sleep-sheet').querySelector('.np-sheet-status').textContent;
const sleepChip = (label) => within(subSheet('np-sleep-sheet')).getByRole('button', { name: label });

const upNext = () => subSheet('np-upnext-sheet');
const upNextSub = () => upNext().querySelector('.np-sheet-sub').textContent;
const nowRow = () => upNext().querySelector('.np-upnext-now');
const upcomingTitles = () => Array.from(upNext().querySelectorAll('.np-upnext-list .audio-manager-queue-main strong')).map((n) => n.textContent);
const playedTitles = () => Array.from(upNext().querySelectorAll('.np-upnext-played .audio-manager-queue-main strong')).map((n) => n.textContent);

const voiceChip = () => document.querySelector('.audio-manager-voice-top');
const voiceRadios = () => Array.from(subSheet('np-voice-sheet').querySelectorAll('[role="radio"]'));
const voiceNames = () => voiceRadios().map((r) => r.querySelector('strong').textContent);
const voiceChecked = () => voiceRadios().map((r) => r.getAttribute('aria-checked'));
/** Pick the radio whose name matches, then apply it with the sheet's one button. */
const pickVoice = (match) => {
  const radio = voiceRadios().find((r) => match.test(r.querySelector('strong').textContent));
  if (!radio) throw new Error('no voice radio matches ' + match);
  fireEvent.click(radio);
  fireEvent.click(within(subSheet('np-voice-sheet')).getByRole('button', { name: /^Use this (voice|edition)$/ }));
};

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
    expect(modalRegistry.peek()).toBeFalsy();      // no invisible modal swallowing Escape
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

  it('closes through the Escape dispatcher, the ⌄ button, and the backdrop — never by stopping audio', () => {
    startCollection();
    const onClose = vi.fn();
    openSheet(onClose);

    expect(modalRegistry.peek().id).toBe('audio-manager-sheet');
    expect(window.__closeSheet).toBe(onClose);                             // the Android Back / tour bridge

    act(() => { modalRegistry.peek().dismiss(); });                        // the app's Escape/back path
    expect(onClose).toHaveBeenCalledTimes(1);

    const down = screen.getByRole('button', { name: 'Close player' });
    expect(down.classList.contains('sheet-handle-back')).toBe(true);
    fireEvent.click(down);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(document.querySelector('.audio-manager-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);

    // Dismissal is the host's business: the controller never tears down playback.
    expect(AudioPlayer.getState().status).not.toBe('idle');
    expect(AudioPlayer.getState().queue).toHaveLength(4);
  });

  it('a small sheet open on top takes Escape first, then hands it back to the player', () => {
    startCollection();
    const onClose = vi.fn();
    openSheet(onClose);

    openSpeed();
    expect(subSheet('np-speed-sheet')).toBeTruthy();
    expect(modalRegistry.peek().id).toBe('np-speed');
    expect(window.__closeSheet).not.toBe(onClose);                         // the sheet holds the bridge

    act(() => { modalRegistry.peek().dismiss(); });                        // Escape #1: the sheet only
    expect(subSheet('np-speed-sheet')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(sheetEl()).toBeTruthy();
    expect(modalRegistry.peek().id).toBe('audio-manager-sheet');
    expect(window.__closeSheet).toBe(onClose);                             // handed back

    act(() => { modalRegistry.peek().dismiss(); });                        // Escape #2: the player
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AudioManagerSheet — the head: kicker, byline, ⋯', () => {
  it('counts the recording in the kicker and names its part and reader in the byline', () => {
    startCollection();
    openSheet();
    expect(screen.getByRole('heading', { name: 'A Word of Warning' })).toBeTruthy();
    expect(kicker()).toBe('Volume One · Letter 1 of 4');
    // The collection is the part that gives way on a narrow screen; the count is its own unshrinking span.
    expect(document.querySelector('.np-kicker-from').textContent).toBe('Volume One');
    expect(document.querySelector('.np-kicker-at').textContent).toBe('Letter 1 of 4');
    expect(byline()).toBe('Read by Benjamin');

    fireEvent.click(nextTrack());
    expect(screen.getByRole('heading', { name: 'The Wide Path' })).toBeTruthy();
    expect(kicker()).toBe('Volume One · Letter 2 of 4');
    expect(byline()).toBe('Part 1 · Read by Benjamin');
  });

  it('leaves the place readout off a lone recording', () => {
    startSingle();
    openSheet();
    expect(kicker()).toBe('Volume One');
    expect(byline()).toBe('Text-to-speech');
  });

  it('counts a keyless compilation track as a Recording', () => {
    const track = (n) => ({ key: null, title: 'Compilation ' + n, sub: 'Compilations', url: URL_OF('comp' + n), readerCode: 'B', partLabel: null });
    render(<AudioManagerSheet open onClose={() => {}} state={{
      status: 'paused', queue: [track(1), track(2)], qi: 1, time: 0, duration: 0, rate: 1,
      sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, sleepAtQueueEnd: false, restoring: false, sourceMode: 'custom',
    }} />);
    expect(kicker()).toBe('Compilations · Recording 2 of 2');
  });

  it('saves and unsaves the current recording through AudioLibraryStore from the ⋯ menu', () => {
    startCollection();
    openSheet();
    const more = () => screen.getByRole('button', { name: 'More for A Word of Warning' });

    fireEvent.click(more());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
    expect(library.toggleSaved).toHaveBeenCalledWith(expect.objectContaining({ url: URL_OF('idPreface') }));
    expect(screen.queryByRole('menu')).toBeNull();                         // the pick closes the menu

    fireEvent.click(more());
    expect(screen.queryByRole('menuitem', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Saved · Remove' }));
    expect(library.toggleSaved).toHaveBeenCalledTimes(2);

    fireEvent.click(more());
    expect(screen.getByRole('menuitem', { name: 'Save' })).toBeTruthy();
  });
});

describe('AudioManagerSheet — transport', () => {
  it('counts buffering as an active session and toggles the real element', () => {
    startCollection();
    openSheet();

    // status 'loading': the screen shows Pause (the mini-player shows Play for the
    // same status — see AudioPlayerBar.test.jsx).
    const busy = inPlayer().getByRole('button', { name: 'Pause' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.classList.contains('is-loading')).toBe(true);

    emit('playing');
    expect(inPlayer().getByRole('button', { name: 'Pause' }).getAttribute('aria-busy')).toBe('false');

    fireEvent.click(inPlayer().getByRole('button', { name: 'Pause' }));
    expect(el().paused).toBe(true);
    expect(AudioPlayer.getState().status).toBe('paused');

    el().played = false;
    fireEvent.click(inPlayer().getByRole('button', { name: 'Play' }));
    expect(el().played).toBe(true);
  });

  it('turns prev into a live Restart for a queue of one, and disables next at the end', () => {
    startSingle();
    openSheet();
    const restart = screen.getByRole('button', { name: 'Restart' });
    expect(restart.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Previous track' })).toBeNull();
    expect(nextTrack().disabled).toBe(true);

    setDuration(300);
    drive(() => AudioPlayer.seek(120));
    fireEvent.click(restart);
    expect(el().currentTime).toBe(0);
    expect(AudioPlayer.getState().qi).toBe(0);

    drive(startCollection);
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous track' }).disabled).toBe(false);
    expect(nextTrack().disabled).toBe(false);

    for (let i = 0; i < 3; i++) fireEvent.click(nextTrack());
    expect(AudioPlayer.getState().qi).toBe(3);
    expect(nextTrack().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Previous track' }).disabled).toBe(false);
  });

  it('binds the scrubber to the player in both directions, and hides the clock until the length is known', () => {
    startCollection();
    openSheet();

    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider.disabled).toBe(true);                 // length unknown until metadata
    expect(slider.max).toBe('1');                       // never advertises max=0
    expect(slider.getAttribute('aria-valuetext')).toBe('0:00 of unknown length');
    expect(timeSpans()).toEqual(['', '']);              // no "0:00 / 0:00" while it loads

    setDuration(300);
    expect(slider.disabled).toBe(false);
    expect(slider.max).toBe('300');
    expect(timeSpans()).toEqual(['0:00', '−5:00']);

    act(() => { el().currentTime = 90; el().dispatchEvent(new Event('timeupdate')); });
    expect(slider.value).toBe('90');                    // player → slider
    expect(timeSpans()).toEqual(['1:30', '−3:30']);     // elapsed, and what is left

    fireEvent.change(slider, { target: { value: '200' } });
    expect(el().currentTime).toBe(200);                 // slider → player
    expect(AudioPlayer.getState().time).toBe(200);
    expect(slider.getAttribute('aria-valuetext')).toBe('3:20 of 5:00');
    expect(timeSpans()).toEqual(['3:20', '−1:40']);
  });

  it('jumps ∓15 seconds through the store, clamped to the recording', () => {
    startCollection();
    openSheet();
    setDuration(300);

    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(el().currentTime).toBe(15);
    expect(timeSpans()).toEqual(['0:15', '−4:45']);

    fireEvent.click(screen.getByRole('button', { name: 'Back 15 seconds' }));
    expect(el().currentTime).toBe(0);                   // clamped at the head, not -15

    drive(() => AudioPlayer.seek(295));
    fireEvent.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(el().currentTime).toBe(300);                 // …and at the tail
  });
});

describe('AudioManagerSheet — Speed sheet', () => {
  it('offers every registry preset as a radio, marks the active one, and applies the choice', () => {
    startCollection();
    openSheet();
    expect(speedLabel()).toBe('Speed, 1×');
    openSpeed();

    const radios = () => within(subSheet('np-speed-sheet')).getAllByRole('radio');
    expect(radios()).toHaveLength(AUDIO_PLAYBACK_RATES.length);
    // The registry IS the closed set the radiogroup renders — including the
    // 1.75× step between 1.5 and 2 that a long recording actually wants.
    expect(radios().map((b) => b.textContent)).toEqual(['0.75×', '1×', '1.25×', '1.5×', '1.75×', '2×']);
    expect(screen.getByRole('radio', { name: '1×' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '1×' }).classList.contains('is-active')).toBe(true);
    // The slider went with the desk on purpose (brief 3b): presets + stepper + typed value.
    expect(screen.queryByRole('slider', { name: 'Playback speed' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '1.5×' }));

    expect(AudioPlayer.getState().rate).toBe(1.5);
    expect(el().playbackRate).toBe(1.5);
    expect(el().defaultPlaybackRate).toBe(1.5);         // survives the next load algorithm
    expect(library.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(speedLabel()).toBe('Speed, 1.5×');
    expect(screen.getByRole('radio', { name: '1.5×' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '1×' }).getAttribute('aria-checked')).toBe('false');

    // The chosen speed rides through a track change (the load algorithm resets it).
    fireEvent.click(nextTrack());
    expect(el().playbackRate).toBe(1.5);
    expect(speedLabel()).toBe('Speed, 1.5×');
  });
});

describe('AudioManagerSheet — fine speed (Corbin 2026-09-21: 1 % steps, not quarter jumps)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const readout = () => screen.getByRole('button', { name: 'Speed, tap to type a value' });

  it('steps 1 % per press and repeats while held, up to the ceiling', () => {
    startCollection();
    openSheet();
    openSpeed();
    const plus = screen.getByRole('button', { name: 'Faster by 1 %' });
    const minus = screen.getByRole('button', { name: 'Slower by 1 %' });

    fireEvent.pointerDown(plus);
    expect(AudioPlayer.getState().rate).toBe(1.01);       // the press itself is one step
    act(() => { vi.advanceTimersByTime(400 + 80 * 3 + 1); });
    fireEvent.pointerUp(plus);
    expect(AudioPlayer.getState().rate).toBe(1.04);       // held: three more, then released
    act(() => { vi.advanceTimersByTime(1000); });
    expect(AudioPlayer.getState().rate).toBe(1.04);       // …and nothing after the release
    expect(speedLabel()).toBe('Speed, 1.04×');
    // No chip claims a rate that is not its own.
    expect(screen.getAllByRole('radio').every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);

    fireEvent.click(minus, { detail: 0 });                // keyboard activation = one step
    expect(AudioPlayer.getState().rate).toBe(1.03);

    drive(() => AudioPlayer.setPlaybackRate(2.99));
    fireEvent.pointerDown(plus); fireEvent.pointerUp(plus);
    fireEvent.pointerDown(plus); fireEvent.pointerUp(plus);
    expect(AudioPlayer.getState().rate).toBe(3);          // the ceiling holds
    expect(screen.getByRole('button', { name: 'Faster by 1 %' }).disabled).toBe(true);
  });

  it('tapping the readout takes a typed value; Enter commits, Escape cancels, garbage is ignored', () => {
    startCollection();
    openSheet();
    openSpeed();
    fireEvent.click(readout());
    const box = screen.getByRole('spinbutton', { name: 'Playback speed' });
    fireEvent.change(box, { target: { value: '1.37' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(AudioPlayer.getState().rate).toBe(1.37);
    expect(speedLabel()).toBe('Speed, 1.37×');
    expect(screen.queryByRole('spinbutton')).toBeNull();  // back to the readout

    fireEvent.click(readout());
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2.5' } });
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Escape' });
    expect(AudioPlayer.getState().rate).toBe(1.37);       // cancelled
    expect(subSheet('np-speed-sheet')).toBeTruthy();      // …the typing only, never the sheet (W42)

    fireEvent.click(readout());
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: 'abc' } });
    fireEvent.blur(screen.getByRole('spinbutton'));
    expect(AudioPlayer.getState().rate).toBe(1.37);       // nothing honest to apply

    // The chips are still shortcuts out of a fine value.
    fireEvent.click(screen.getByRole('radio', { name: '1×' }));
    expect(AudioPlayer.getState().rate).toBe(1);
    expect(speedLabel()).toBe('Speed, 1×');
  });
});

describe('AudioManagerSheet — Sleep timer sheet', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('offers every option, is inert until armed, counts down while paused, and Off disarms it', () => {
    startCollection();
    openSheet();
    emit('playing');
    fireEvent.click(inPlayer().getByRole('button', { name: 'Pause' }));   // no playback tick to lean on
    openSleep();

    const labels = within(subSheet('np-sleep-sheet')).getByRole('group', { name: 'Sleep timer' }).querySelectorAll('button');
    expect(Array.from(labels).map((b) => b.textContent))
      .toEqual(['15 min', '30 min', '45 min', '60 min', 'End of this letter', 'End of the queue', 'Custom…', 'Off']);
    expect(sleepStatus()).toBe('');
    expect(sleepChip('Off').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(sleepChip('30 min'));
    expect(AudioPlayer.getState().sleepEndsAt).toBeGreaterThan(0);
    expect(sleepStatus()).toBe('Stops in 30:00');
    expect(sleepChip('30 min').getAttribute('aria-pressed')).toBe('true');
    expect(sleepChip('Off').getAttribute('aria-pressed')).toBe('false');
    expect(tool('Sleep timer').getAttribute('aria-label')).toBe('Sleep timer: 30 min');

    act(() => { vi.advanceTimersByTime(61000); });                      // the sheet's own 1 Hz tick
    expect(sleepStatus()).toBe('Stops in 28:59');

    fireEvent.click(sleepChip('Off'));
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
    expect(sleepStatus()).toBe('');
    expect(sleepChip('Off').getAttribute('aria-pressed')).toBe('true');
    expect(tool('Sleep timer').getAttribute('aria-label')).toBe('Sleep timer');
    expect(AudioPlayer.getState().queue).toHaveLength(4);               // disarming touches nothing else
  });

  it('marks the armed preset and moves the mark when another is chosen', () => {
    startCollection();
    openSheet();
    emit('playing');
    openSleep();
    const minutes = ['15 min', '30 min', '45 min', '60 min'];

    fireEvent.click(sleepChip('15 min'));
    expect(AudioPlayer.getSleepRemainingSeconds()).toBe(900);
    expect(minutes.map((m) => sleepChip(m).getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(sleepChip('15 min').classList.contains('is-active')).toBe(true);

    fireEvent.click(sleepChip('45 min'));
    expect(minutes.map((m) => sleepChip(m).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);

    // The sleep modes replace each other, so arming End of the queue disarms the countdown — and the chips say so.
    fireEvent.click(sleepChip('End of the queue'));
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(true);
    expect(sleepStatus()).toBe('Stops at the end of the queue');
    expect(sleepChip('End of the queue').getAttribute('aria-pressed')).toBe('true');
    expect(minutes.map((m) => sleepChip(m).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false']);
  });

  /* A minute countdown can't say "finish this chapter": a computed end time is
     wrong the moment the speed changes or the stream stalls, so the flag rides
     the 'ended' event instead. */
  it('arms End of this letter, shows it in the head, and pauses at the boundary', () => {
    startCollection();
    openSheet();
    emit('playing');
    openSleep();

    expect(sleepChip('End of this letter').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sleepChip('End of this letter'));
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(true);
    expect(sleepStatus()).toBe('Stops after this letter');
    expect(sleepChip('End of this letter').getAttribute('aria-pressed')).toBe('true');
    expect(sleepChip('End of this letter').classList.contains('is-active')).toBe(true);

    emit('ended');
    expect(AudioPlayer.getState().qi).toBe(0);            // the next recording never started
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(sleepStatus()).toBe('');                       // one-shot, cleared itself
    expect(sleepChip('Off').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets Off disarm End of this letter, and each sleep mode replaces the other', () => {
    startCollection();
    openSheet();
    emit('playing');
    openSleep();

    fireEvent.click(sleepChip('End of this letter'));
    fireEvent.click(sleepChip('30 min'));
    expect(sleepStatus()).toBe('Stops in 30:00');
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(false);

    fireEvent.click(sleepChip('End of this letter'));
    expect(sleepStatus()).toBe('Stops after this letter');
    expect(AudioPlayer.getSleepRemainingSeconds()).toBe(0);

    fireEvent.click(sleepChip('Off'));
    expect(sleepStatus()).toBe('');
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(false);

    emit('ended');
    expect(AudioPlayer.getState().qi).toBe(1);            // disarmed — advanced normally
  });

  it('Custom shows a 5-minute stepper from 20, and Start arms it', () => {
    startCollection();
    openSheet();
    emit('playing');
    openSleep();

    fireEvent.click(sleepChip('Custom…'));
    const value = () => subSheet('np-sleep-sheet').querySelector('.np-custom-value').textContent;
    expect(value()).toBe('20 min');
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);   // nothing armed until Start
    fireEvent.click(screen.getByRole('button', { name: '5 minutes more' }));
    expect(value()).toBe('25 min');
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: '5 minutes less' }));
    expect(value()).toBe('5 min');
    expect(screen.getByRole('button', { name: '5 minutes less' }).disabled).toBe(true);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '5 minutes more' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(AudioPlayer.getState().sleepMinutes).toBe(20);
    expect(AudioPlayer.getSleepRemainingSeconds()).toBe(1200);
    expect(subSheet('np-sleep-sheet').querySelector('.np-custom')).toBeNull();
    expect(sleepChip('Custom · 20 min').getAttribute('aria-pressed')).toBe('true');
    expect(sleepChip('15 min').getAttribute('aria-pressed')).toBe('false');
    expect(sleepStatus()).toBe('Stops in 20:00');
  });
});

describe('AudioManagerSheet — Up next sheet', () => {
  it('pins the playing recording, folds the played ones under Earlier, and re-picks a played recording', () => {
    startCollection();
    openSheet();
    expect(tool('Up next').getAttribute('aria-label')).toBe('Up next, 3 left');
    openUpNext();

    expect(upNextSub()).toBe('3 left');
    expect(nowRow().getAttribute('aria-current')).toBe('true');
    expect(nowRow().querySelector('strong').textContent).toBe('A Word of Warning');
    expect(upcomingTitles()).toEqual(['The Wide Path', 'The Seventh Day', 'Grafted In']);
    expect(within(upNext()).queryByRole('button', { name: /^Earlier/ })).toBeNull();   // nothing played yet
    // Short queues render whole — no expanders to discover.
    expect(screen.queryByRole('button', { name: /Show \d+ (earlier|later)/ })).toBeNull();

    fireEvent.click(nextTrack());
    expect(nowRow().querySelector('strong').textContent).toBe('The Wide Path');
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'Grafted In']);
    // Nothing leaves the queue as playback advances: the preface folds under Earlier, still tappable.
    const earlier = within(upNext()).getByRole('button', { name: /^Earlier \(1\)/ });
    expect(earlier.getAttribute('aria-expanded')).toBe('false');
    expect(playedTitles()).toEqual([]);
    fireEvent.click(earlier);
    expect(earlier.getAttribute('aria-expanded')).toBe('true');
    expect(playedTitles()).toEqual(['A Word of Warning']);

    // THE point of the picker: a recording already heard can be picked again.
    fireEvent.click(screen.getByRole('button', { name: 'Play again: A Word of Warning' }));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(el().src).toBe(URL_OF('idPreface'));
    expect(nowRow().querySelector('strong').textContent).toBe('A Word of Warning');

    fireEvent.click(screen.getByRole('button', { name: 'Play now: The Seventh Day' }));
    expect(AudioPlayer.getState().qi).toBe(2);
    expect(el().src).toBe(URL_OF('idB'));
  });

  it('gives the pinned row its own Play/Pause and Next, and no edit controls', () => {
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // playing: The Wide Path
    openUpNext();

    const now = nowRow();
    expect(now.querySelector('.audio-manager-queue-actions')).toBeNull();
    expect(now.querySelector('small').textContent).toBe('2 of 4 · Volume One');
    expect(within(now).queryByRole('button', { name: /^(Move|Remove)/ })).toBeNull();

    emit('playing');
    fireEvent.click(within(now).getByRole('button', { name: 'Pause' }));
    expect(AudioPlayer.getState().status).toBe('paused');
    fireEvent.click(within(now).getByRole('button', { name: 'Play' }));
    expect(el().played).toBe(true);

    fireEvent.click(within(now).getByRole('button', { name: 'Next track' }));
    expect(AudioPlayer.getState().qi).toBe(2);
    // removeUpcoming's protection is still the store-level guarantee.
    expect(AudioPlayer.removeUpcoming(AudioPlayer.getState().qi)).toBe(false);
    expect(AudioPlayer.getState().queue).toHaveLength(4);
  });

  it('reorders upcoming rows without disturbing the streaming track', () => {
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // playing: The Wide Path
    openUpNext();

    expect(screen.getByRole('button', { name: 'Move The Seventh Day earlier' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Grafted In later' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move The Seventh Day later' }));
    expect(upcomingTitles()).toEqual(['Grafted In', 'The Seventh Day']);
    expect(AudioPlayer.getState().queue.map((t) => t.url))
      .toEqual([URL_OF('idPreface'), URL_OF('idA'), URL_OF('idC'), URL_OF('idB')]);
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe(URL_OF('idA'));                 // never re-started

    fireEvent.click(screen.getByRole('button', { name: 'Move The Seventh Day earlier' }));
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'Grafted In']);
  });

  it('removes and clears upcoming rows while keeping the heard ones listed', () => {
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // playing: The Wide Path
    openUpNext();

    fireEvent.click(screen.getByRole('button', { name: 'Remove The Seventh Day from queue' }));
    expect(upcomingTitles()).toEqual(['Grafted In']);
    expect(upNextSub()).toBe('1 left');
    expect(tool('Up next').getAttribute('aria-label')).toBe('Up next, 1 left');

    fireEvent.click(screen.getByRole('button', { name: 'Clear upcoming' }));
    expect(upcomingTitles()).toEqual([]);
    expect(upNextSub()).toBe('Nothing after this one');
    expect(tool('Up next').getAttribute('aria-label')).toBe('Up next');
    expect(screen.queryByRole('button', { name: 'Clear upcoming' })).toBeNull();
    expect(upNext().querySelector('.audio-manager-empty')).toBeTruthy();
    // Played + current still stand: clearing the queue clears what is AHEAD.
    fireEvent.click(within(upNext()).getByRole('button', { name: /^Earlier \(1\)/ }));
    expect(playedTitles()).toEqual(['A Word of Warning']);

    const state = AudioPlayer.getState();
    expect(state.queue.map((t) => t.url)).toEqual([URL_OF('idPreface'), URL_OF('idA')]);
    expect(state.qi).toBe(1);
    expect(state.status).not.toBe('idle');
    expect(el().src).toBe(URL_OF('idA'));
    expect(screen.getByRole('heading', { name: 'The Wide Path' })).toBeTruthy();
    expect(nextTrack().disabled).toBe(true);
  });
});

/* A whole Bible edition queues 1,189 chapters. Up next renders a WINDOW of 40
   rows each side with paged expanders — deliberately dumb, no virtual
   scroller — and everything up to 80 rows still renders whole. */
/* pl-l2 L3 (brief 3c, picture 10): a row's grip drags it, a sideways swipe removes it with Undo, Clear upcoming has
   Undo, rows carry their length and the head the time left, a Bible chapter its title. */
describe('AudioManagerSheet — Up next editing (L3)', () => {
  const row = (title) => within(upNext()).getByRole('button', { name: 'Play now: ' + title }).closest('.np-row');
  const grip = (title) => within(upNext()).getByRole('button', { name: 'Reorder ' + title });
  const undoBar = () => upNext().querySelector('.np-undo');
  afterEach(() => { delete globalThis.AUDIO_LENGTHS; delete globalThis.BOOKS; vi.useRealTimers(); });

  it('a swipe past the line removes the row and offers Undo, which puts it back', () => {
    startCollection();
    openSheet();
    openUpNext();
    const r = row('The Seventh Day');
    fireEvent.pointerDown(r, { clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(r, { clientX: 150, clientY: 12, pointerId: 1 });
    expect(upNext().querySelector('.np-row-remove').textContent).toBe('Remove');
    fireEvent.pointerUp(r, { clientX: 150, clientY: 12, pointerId: 1 });
    expect(upcomingTitles()).toEqual(['The Wide Path', 'Grafted In']);
    expect(undoBar().textContent).toContain('Removed The Seventh Day');
    fireEvent.click(within(undoBar()).getByRole('button', { name: 'Undo' }));
    expect(upcomingTitles()).toEqual(['The Wide Path', 'The Seventh Day', 'Grafted In']);
    expect(undoBar()).toBeNull();
  });

  it('a short swipe settles back and removes nothing', () => {
    startCollection();
    openSheet();
    openUpNext();
    const r = row('The Seventh Day');
    fireEvent.pointerDown(r, { clientX: 300, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(r, { clientX: 250, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(r, { clientX: 250, clientY: 10, pointerId: 1 });
    expect(upcomingTitles()).toEqual(['The Wide Path', 'The Seventh Day', 'Grafted In']);
  });

  it('the grip drags a row down by whole rows, and arrow keys move it one place', () => {
    startCollection();
    openSheet();
    openUpNext();
    const g = grip('The Wide Path');
    fireEvent.pointerDown(g, { clientX: 380, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(g, { clientX: 380, clientY: 230, pointerId: 2 });
    fireEvent.pointerUp(g, { clientX: 380, clientY: 230, pointerId: 2 });   // two 64 px rows
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'Grafted In', 'The Wide Path']);
    fireEvent.keyDown(grip('The Wide Path'), { key: 'ArrowUp' });
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'The Wide Path', 'Grafted In']);
    fireEvent.keyDown(grip('The Wide Path'), { key: 'Delete' });
    expect(upcomingTitles()).toEqual(['The Seventh Day', 'Grafted In']);
    expect(undoBar().textContent).toContain('Removed The Wide Path');
  });

  it('Clear upcoming says how many went, and Undo brings them back', () => {
    startCollection();
    openSheet();
    openUpNext();
    fireEvent.click(within(upNext()).getByRole('button', { name: 'Clear upcoming' }));
    expect(upcomingTitles()).toEqual([]);
    expect(undoBar().textContent).toContain('Cleared 3 from Up next');
    fireEvent.click(within(undoBar()).getByRole('button', { name: 'Undo' }));
    expect(upcomingTitles()).toEqual(['The Wide Path', 'The Seventh Day', 'Grafted In']);
  });

  it('the Undo goes after 5 seconds', () => {
    vi.useFakeTimers();
    startCollection();
    openSheet();
    openUpNext();
    fireEvent.keyDown(grip('Grafted In'), { key: 'Delete' });
    expect(undoBar()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(undoBar()).toBeNull();
  });

  it('rows carry their length, the head the time left in the queue', () => {
    globalThis.AUDIO_LENGTHS = { idPreface: [1e6, 300], idA: [1e6, 372], idB: [1e6, 545], idC: [1e6, 3600] };
    startCollection();
    openSheet();
    openUpNext();
    const subs = Array.from(upNext().querySelectorAll('.np-upnext-list .audio-manager-queue-main small')).map((n) => n.textContent);
    expect(subs[0]).toContain('6:12');
    expect(subs[1]).toContain('9:05');
    // 5:00 playing (nothing heard yet) + 6:12 + 9:05 + 60:00 = 80 min 17 s
    expect(upNextSub()).toBe('3 left · 1 h 20 min');
  });

  it('a Bible chapter row names its chapter', () => {
    globalThis.BOOKS = { genesis: { chapters: [{ num: 1, title: 'The Creation' }, { num: 2, title: 'The Garden' }] } };
    globalThis.BIBLE_AUDIO_MANIFEST = { ...(globalThis.BIBLE_AUDIO_MANIFEST || {}) };
    drive(() => AudioPlayer.playTrack({ key: 'bible-kjv:genesis', title: 'Genesis 1', sub: 'KJV', url: URL_OF('g1'), readerCode: '', partLabel: 'Chapter 1' }));
    drive(() => AudioPlayer.addToQueue({ key: 'bible-kjv:genesis', title: 'Genesis 2', sub: 'KJV', url: URL_OF('g2'), readerCode: '', partLabel: 'Chapter 2' }));
    openSheet();
    openUpNext();
    const sub = upNext().querySelector('.np-upnext-list .audio-manager-queue-main small').textContent;
    expect(sub).toContain('The Garden');
  });
});

describe('AudioManagerSheet — a very long queue', () => {
  const BIG_MANIFEST = {};
  const BIG_ITEMS = [];
  for (let i = 1; i <= 200; i++) {
    BIG_MANIFEST['big:item-' + i] = [['id' + i, 'B']];
    BIG_ITEMS.push({ id: 'item-' + i, title: 'Track ' + i });
  }

  const startBig = () => drive(() => AudioPlayer.playCollection({ volKey: 'big', items: BIG_ITEMS, collectionLabel: 'Big' }));
  const live = () => upNext().querySelector('.sr-only[aria-live="polite"]');

  beforeEach(() => { globalThis.AUDIO_MANIFEST = BIG_MANIFEST; });

  it('windows the upcoming rows at the head of a long queue and announces what an expander revealed', () => {
    startBig();
    openSheet();
    expect(AudioPlayer.getState().queue).toHaveLength(200);
    openUpNext();
    expect(upNextSub()).toBe('199 left');

    // 40 ahead; nothing earlier exists, so no fold or expander for it.
    expect(upcomingTitles()).toHaveLength(40);
    expect(within(upNext()).queryByRole('button', { name: /^Earlier/ })).toBeNull();
    // Present and EMPTY at first: a live region created together with its content announces nothing at all.
    expect(live()).toBeTruthy();
    expect(live().textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Show 40 later' }));
    expect(upcomingTitles()).toHaveLength(80);
    expect(live().textContent).toBe('Showing 80 of 199 upcoming recordings.');
  });

  it('windows a deep position in both directions and pages outward', () => {
    startBig();
    drive(() => AudioPlayer.playAt(120));
    openSheet();
    openUpNext();

    expect(nowRow().querySelector('strong').textContent).toBe('Track 121');
    expect(upcomingTitles()).toHaveLength(40);
    expect(upcomingTitles()[0]).toBe('Track 122');

    fireEvent.click(within(upNext()).getByRole('button', { name: /^Earlier \(120\)/ }));
    expect(playedTitles()).toHaveLength(40);
    expect(playedTitles()[0]).toBe('Track 81');           // queue index 80, 1-based title

    fireEvent.click(screen.getByRole('button', { name: 'Show 40 earlier' }));
    expect(playedTitles()).toHaveLength(80);
    expect(playedTitles()[0]).toBe('Track 41');
    expect(live().textContent).toBe('Showing 80 earlier recordings.');

    // The tail is 39 rows away, and the expander says so rather than lying at 40.
    fireEvent.click(screen.getByRole('button', { name: 'Show 39 later' }));
    expect(upcomingTitles()).toHaveLength(79);
    expect(screen.queryByRole('button', { name: /Show \d+ later/ })).toBeNull();
    expect(live().textContent).toBe('Showing 79 of 79 upcoming recordings.');
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

  it('offers no Voice chip for a recording with a single reading', () => {
    startCollection();                                    // the preface: one voice
    openSheet();
    expect(voiceChip()).toBeNull();
  });

  it('lists every reader, marks the current one, and restarts the letter in the chosen voice', () => {
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // The Wide Path — two readings

    expect(voiceChip().getAttribute('aria-label')).toBe('Voice: Read by Benjamin. Choose another');
    openVoice();
    expect(subSheet('np-voice-sheet')).toBeTruthy();
    // The registry label is the whole name ("Read by Benjamin", "Text-to-speech"), never prefixed twice.
    expect(voiceNames()).toEqual(['Read by Benjamin', 'Text-to-speech']);
    expect(voiceChecked()).toEqual(['true', 'false']);
    expect(subSheet('np-voice-sheet').querySelector('.np-sheet-note').textContent)
      .toBe('Starts this recording again in the voice you pick. Your Up next stays.');

    setDuration(300);
    drive(() => AudioPlayer.seek(120));
    pickVoice(/Text-to-speech/);

    const state = AudioPlayer.getState();
    // The s4 album machinery: the chosen letter in the chosen voice, the rest
    // of the collection still behind it, and the queue still forward-only.
    expect(state.queue.map((t) => t.url)).toEqual([URL_OF('idAv'), URL_OF('idB'), URL_OF('idC')]);
    expect(state.qi).toBe(0);
    expect(state.queue[0].readerCode).toBe('V');
    expect(el().src).toBe(URL_OF('idAv'));
    expect(el().currentTime).toBe(0);                     // restarted, never spliced
    expect(subSheet('np-voice-sheet')).toBeNull();        // the sheet closed on the switch
    expect(voiceChip().getAttribute('aria-label')).toBe('Voice: Text-to-speech. Choose another');
    // Row ORDER is the manifest's (primary first) so the list never reshuffles
    // under the finger; only which one is checked moves.
    openVoice();
    expect(voiceRadios()).toHaveLength(2);
    expect(voiceChecked()).toEqual(['false', 'true']);
  });

  /* sweep v003: the checked radio is the voice already playing. Applying it (a
     reader confirming what they hear) ran the switch anyway, and the switch
     starts the letter again from its first part: two minutes into Part 2, the
     tap put the listener back at Part 1, 0:00. */
  it('using the voice already playing keeps the place: Part 2 stays at Part 2, mid-way (sweep v003)', () => {
    globalThis.AUDIO_MANIFEST = { ...MANIFEST, 'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']] };
    globalThis.AUDIO_ALTERNATES = { 'vol1:letter-a': [['V', [['idAv1', 'Part 1'], ['idAv2', 'Part 2']]]] };
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // The Wide Path, Part 1
    fireEvent.click(nextTrack());                         // The Wide Path, Part 2
    emit('playing');
    setDuration(300);
    drive(() => AudioPlayer.seek(120));
    expect(el().src).toBe(URL_OF('idA2'));
    openVoice();
    expect(voiceChecked()).toEqual(['true', 'false']);
    const before = AudioPlayer.getState();
    const queueBefore = before.queue.map((t) => t.url);

    pickVoice(/Benjamin/);

    const after = AudioPlayer.getState();
    expect(el().src).toBe(URL_OF('idA2'));                    // not sent back to Part 1
    expect(el().currentTime).toBe(120);                       // still two minutes in
    expect(after.queue.map((t) => t.url)).toEqual(queueBefore);   // the heard rows stay listed
    expect(after.qi).toBe(before.qi);
    expect(after.status).toBe('playing');
    expect(subSheet('np-voice-sheet')).toBeNull();
  });

  it('falls back to the lone letter when the collection registry has not landed', () => {
    delete globalThis.COL_BY_KEY;
    delete globalThis.colLetterArr;
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());
    openVoice();
    pickVoice(/Text-to-speech/);
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

    // Counted in the book, not the queue that starts at the chapter picked (pl-l2b).
    expect(document.querySelector('.np-kicker-at').textContent).toBe('Chapter 2 of 3');
    expect(voiceChip().getAttribute('aria-label')).toBe('Edition: KJV · Biblical Restoration. Choose another');
    expect(voiceChip().textContent).toContain('KJV · Biblical Restoration');
    openVoice();
    // WEB ships no rows for this book in the fixture, so it is not offered —
    // a row that taps through to silence is worse than no row.
    expect(voiceNames()).toEqual(['KJV · Biblical Restoration', 'NKJV · Dramatized']);
    expect(voiceChecked()).toEqual(['true', 'false']);
    expect(subSheet('np-voice-sheet').querySelector('.np-sheet-note').textContent)
      .toBe('Starts this chapter again in the edition you pick. Your Up next stays.');

    pickVoice(/^NKJV · Dramatized$/);
    const state = AudioPlayer.getState();
    expect(state.queue[state.qi].url).toBe(BURL('wop1_genesis_002', 'audio-wop-v1'));
    expect(state.queue[state.qi].partLabel).toBe('Chapter 2');       // same chapter, other voice
    expect(el().currentTime).toBe(0);
    // Every Listen pill elsewhere reads settings.bibleAudio, so the choice moves it.
    expect(setEdition).toHaveBeenCalledWith('wop-nkjv');
    expect(voiceChip().getAttribute('aria-label')).toBe('Edition: NKJV · Dramatized. Choose another');
  });

  it("a plan's portion switches edition in place: it stays the portion, a book the edition lacks keeps its own (player brief s7)", () => {
    const setEdition = vi.fn();
    window.__setBibleAudioEdition = setEdition;
    const KJV = (id, title, n) => ({ volKey: 'bible-brm-kjv', item: { id, title }, collectionLabel: 'KJV', chapterNum: n });
    drive(() => AudioPlayer.playPortion({ items: [KJV('genesis', 'Genesis', 2), KJV('genesis', 'Genesis', 3), KJV('exodus', 'Exodus', null)], label: 'Today' }));
    openSheet();
    const before = AudioPlayer.getState().queue.map((t) => t.url);
    expect(before).toHaveLength(3);
    expect(AudioPlayer.getState().sourceMode).toBe('custom');

    openVoice();
    pickVoice(/^NKJV · Dramatized$/);
    expect(document.querySelector('.audio-manager-voice-confirm')).toBeNull();
    const st = AudioPlayer.getState();
    expect(st.queue.map((t) => t.url)).toEqual([BURL('wop1_genesis_002', 'audio-wop-v1'), BURL('wop1_genesis_003', 'audio-wop-v1'), before[2]]);
    expect(st.qi).toBe(0);
    expect(st.queue[0].title).toBe('Genesis 2');
    expect(st.queue[0].partLabel).toBe('Chapter 2');
    expect(setEdition).toHaveBeenCalledWith('wop-nkjv');
  });

  /* sweep v003, the edition half. The same chapter rebuilds to the same url, so
     the element keeps sounding; everything around it was reset: the chapters
     already heard vanished from the queue, the clock read 0:00, the transport
     sat in 'loading' (play() on a playing element fires no 'playing' to clear
     it), and the tap was filed as a fresh play. */
  it('using the edition already playing changes nothing (sweep v003)', () => {
    const setEdition = vi.fn();
    window.__setBibleAudioEdition = setEdition;
    drive(() => AudioPlayer.playBibleBook({
      volKey: 'bible-brm-kjv', bookId: 'genesis', chapterNum: 1, label: 'KJV · Biblical Restoration Ministries',
    }));
    openSheet();
    fireEvent.click(nextTrack());                         // Genesis 2, Genesis 1 heard
    emit('playing');
    setDuration(900);
    drive(() => AudioPlayer.seek(720));
    act(() => { el().dispatchEvent(new Event('timeupdate')); });
    const before = AudioPlayer.getState();
    expect(before.queue[before.qi].url).toBe(BURL('brm1_genesis_002', 'audio-brm-v1'));
    expect(before.time).toBe(720);
    const queueBefore = before.queue.map((t) => t.url);
    const plays = library.recordPlayed.mock.calls.length;

    openVoice();
    pickVoice(/^KJV · Biblical Restoration$/);

    const after = AudioPlayer.getState();
    expect(after.queue.map((t) => t.url)).toEqual(queueBefore);   // Genesis 1 still listed as heard
    expect(after.qi).toBe(before.qi);
    expect(after.time).toBe(720);                             // the clock still reads minute 12
    expect(after.status).toBe('playing');                     // no spinner over a playing chapter
    expect(el().currentTime).toBe(720);
    expect(library.recordPlayed.mock.calls.length).toBe(plays);   // not a new play
    expect(setEdition).not.toHaveBeenCalled();                // nothing changed, so nothing is written
    expect(inPlayer().getByRole('button', { name: 'Pause' }).getAttribute('aria-busy')).toBe('false');
  });

  it('shows no Edition chip for a book only one edition has recorded', () => {
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'exodus', label: 'KJV · Biblical Restoration Ministries' }));
    openSheet();
    expect(voiceChip()).toBeNull();
  });

  it('survives an app with no settings bridge wired', () => {
    startGenesis2();
    openSheet();
    openVoice();
    pickVoice(/^NKJV · Dramatized$/);
    expect(AudioPlayer.getState().queue[0].url).toBe(BURL('wop1_genesis_002', 'audio-wop-v1'));
  });

  /* 2026-09-12: an edition whose assets are not on the release (tsot-matthew,
     every chapter 404ed live) was offered nowhere — ONE registry flag, ONE
     predicate (utils/audio-track.hide.test.js owns the registry half). The
     Voice sheet's rows are the door that would tap straight into the 404.
     2026-09-13: the mirror landed and the flag line is deleted; same fixture,
     inverted: all three recorded voices get a row, so the flag's return
     reddens this case. */
  it('offers a row for every recorded voice of the book — tsot-matthew back among them (mirrored 2026-09-13)', () => {
    globalThis.BIBLE_AUDIO_BOOKS = [['matthew', 'Matthew']];
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:matthew': [['brm2_matthew_001', '', 'Chapter 1']],
      'bible-wop-nkjv:matthew': [['wop2_matthew_001', '', 'Chapter 1']],
      'bible-tsot-matthew:matthew': [['1AbCdEfGhIjKlMnOpQrStUvWxYz01234', '', 'Chapter 1']],
    };
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'matthew', label: 'KJV · Biblical Restoration Ministries' }));
    openSheet();
    openVoice();
    expect(voiceNames()).toContain('Matthew · TSOT');
    expect(voiceNames()).toEqual(['KJV · Biblical Restoration', 'NKJV · Dramatized', 'Matthew · TSOT']);
  });
});

describe('AudioManagerSheet — Open the reading (owner request 2026-08-09)', () => {
  afterEach(() => {
    delete globalThis.COL_BY_KEY;
    delete window.__openAudioText;
  });

  it('opens the text and closes the screen — playback untouched', () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { letterScreen: 'vol1-letter' }]]);
    const opener = vi.fn();
    window.__openAudioText = opener;
    startCollection();
    emit('playing');
    const onClose = vi.fn();
    openSheet(onClose);

    const jump = document.querySelector('.audio-manager-jump');
    expect(jump).toBeTruthy();
    expect(jump.classList.contains('np-live')).toBe(true);
    expect(jump.getAttribute('aria-label')).toBe('Open the reading — A Word of Warning; playback continues');

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

  it('the words "Open the reading" are DRAWN on the screen — in the button\'s text, not only its aria-label (2026-09-12)', () => {
    // The Settings row "Turn the Page with the Audio" tells a reader who turns it
    // off to "use Open the reading on the player". A phone shows no title
    // tooltip and reads no aria-label, so the words have to be drawn.
    globalThis.COL_BY_KEY = new Map([['vol1', { letterScreen: 'vol1-letter' }]]);
    window.__openAudioText = vi.fn();
    startCollection();
    emit('playing');
    openSheet();
    const jump = document.querySelector('.audio-manager-jump');
    // The visible text, never the attribute: textContent does not read aria-label.
    expect(jump.textContent).toMatch(/Open the reading/);
    expect(jump.querySelector('.audio-manager-jump-cue').textContent).toMatch(/^Open the reading/);
  });

  it('the button holds no heading or paragraph; the h2 title names the dialog', () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { letterScreen: 'vol1-letter' }]]);
    window.__openAudioText = vi.fn();
    startCollection();
    emit('playing');
    openSheet();
    const jump = document.querySelector('.audio-manager-jump');
    expect(jump.querySelector('h1, h2, h3, h4, h5, h6, p, div')).toBeNull();
    const title = document.getElementById('audio-manager-title');
    expect(title.tagName).toBe('H2');
    expect(title.textContent).toBe('A Word of Warning');
    expect(sheetEl().getAttribute('aria-labelledby')).toBe('audio-manager-title');
  });

  it('the ⋯ menu offers Open the reading too, and Read along does the same', () => {
    globalThis.COL_BY_KEY = new Map([['vol1', { letterScreen: 'vol1-letter' }]]);
    const opener = vi.fn();
    window.__openAudioText = opener;
    startCollection();
    const onClose = vi.fn();
    openSheet(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'More for A Word of Warning' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open the reading' }));
    expect(opener).toHaveBeenCalledTimes(1);
    fireEvent.click(tool('Read along'));
    expect(opener).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a track with no destination draws no Open the reading at all', () => {
    // No COL_BY_KEY installed → vol1 resolves no letterScreen.
    window.__openAudioText = vi.fn();
    startCollection();
    openSheet();
    expect(document.querySelector('.audio-manager-jump')).toBeNull();
    expect(tool('Read along').disabled).toBe(true);
    expect(screen.getByRole('heading', { name: 'A Word of Warning' })).toBeTruthy();
  });

  it('hasTextDestination: Bible tracks are jumpable, keyless compilations are not', async () => {
    const { hasTextDestination } = await import('./AudioShelf.jsx');
    expect(hasTextDestination({ key: 'bible-brm-kjv:jeremiah', partLabel: 'Chapter 46' })).toBe(true);
    expect(hasTextDestination({ key: null })).toBe(false);
    expect(hasTextDestination({ key: 'vol1:letter-a' })).toBe(false);   // no COL_BY_KEY here
    // A study recording (ruling (4), 2026-09-11): its text is the study chapter LetterView
    // renders in studyMode, reached through _openAudioText's study arm — not a collection.
    expect(hasTextDestination({ key: 'study:purity-ch1' })).toBe(true);
    expect(hasTextDestination({ key: 'study:' })).toBe(false);
  });
});

/* The screen is a controller over the state it is HANDED, so the boot-restore
   placeholder is rendered from a state snapshot rather than by re-importing the
   player (a second module instance would hand the screen a different singleton
   than the one every other test here drives). The player's own suite proves the
   `restoring` flag rises at boot and falls on the rebuild. */
describe('AudioManagerSheet — a restored bar describes nothing it does not know', () => {
  const PLACEHOLDER = {
    key: 'vol1:preface', title: 'A Word of Warning', sub: 'Volume One',
    url: URL_OF('idPreface'), readerCode: 'B', partLabel: null,
  };
  const restoredState = (over) => ({
    status: 'paused', queue: [PLACEHOLDER], qi: 0, time: 120, duration: 0, rate: 1,
    sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false, sleepAtQueueEnd: false,
    restoring: true, sourceMode: 'collection', ...over,
  });

  it('says "Resuming…" rather than "1 of 1", and never relabels prev as Restart', () => {
    render(<AudioManagerSheet open state={restoredState()} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous track' })).toBeTruthy();
    // …and no "1 of 1", which would be a claim about a queue nobody has built.
    expect(kicker()).toBe('Volume One');
    openUpNext();
    expect(upNextSub()).toBe('Resuming…');
    expect(nowRow().querySelector('small').textContent).toBe('Volume One');
  });

  /* sweep v021: Next keyed on the placeholder's length, so it was greyed out over a
     queue that may run on for a whole book. The tap has to reach the player, which
     rebuilds the queue and then steps past the saved recording. */
  it('leaves Next live, since the queue it would step through is not built yet (sweep v021)', () => {
    const { unmount } = render(<AudioManagerSheet open state={restoredState()} onClose={() => {}} />);
    expect(nextTrack().disabled).toBe(false);
    openUpNext();
    expect(within(nowRow()).getByRole('button', { name: 'Next track' }).disabled).toBe(false);
    unmount();
    // CONTROL: a genuine queue of one still has nowhere to go.
    render(<AudioManagerSheet open state={restoredState({ restoring: false, sourceMode: 'custom' })} onClose={() => {}} />);
    expect(nextTrack().disabled).toBe(true);
  });

  it('the song player leaves Next song live over a restored songs session too (sweep v021)', () => {
    const song = { key: 'song:aaaaaaaaaaa1', title: 'Come, Love Awaits You', sub: 'Songs of the Letters', url: URL_OF('idSong'), readerCode: '', partLabel: null };
    const { unmount } = render(<AudioManagerSheet open state={restoredState({ queue: [song], sourceMode: 'songs', repeat: 'off' })} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next song' }).disabled).toBe(false);
    unmount();
    render(<AudioManagerSheet open state={restoredState({ queue: [song], sourceMode: 'songs', repeat: 'off', restoring: false })} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Next song' }).disabled).toBe(true);
  });

  it('calls a genuine queue of one what it is', () => {
    render(<AudioManagerSheet open state={restoredState({ restoring: false, sourceMode: 'custom' })} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Restart' })).toBeTruthy();
    expect(kicker()).toBe('Volume One');
    openUpNext();
    expect(upNextSub()).toBe('Nothing after this one');
  });

  it('describes the real queue once the rebuild has replaced the placeholder', () => {
    const queue = [PLACEHOLDER, { ...PLACEHOLDER, key: 'vol1:letter-a', title: 'The Wide Path', url: URL_OF('idA') }];
    render(<AudioManagerSheet open state={restoredState({ restoring: false, queue })} onClose={() => {}} />);
    expect(kicker()).toBe('Volume One · Letter 1 of 2');
    expect(tool('Up next').getAttribute('aria-label')).toBe('Up next, 1 left');
    openUpNext();
    expect(upNextSub()).toBe('1 left');
    expect(nowRow().querySelector('small').textContent).toBe('1 of 2 · Volume One');
  });
});

/* Owner directive 2026-08-10: a voice switch REBUILDS the queue from the
   corpus, so a queue the listener made by hand would be discarded. Since the
   player brief (2026-10-22, section 7) such a queue switches IN PLACE and keeps
   its shape; only when that cannot be done does the rebuild ask first. Every
   plain queue still switches on the first tap. */
describe('AudioManagerSheet — switching voice keeps a queue the listener made', () => {
  beforeEach(() => {
    globalThis.AUDIO_ALTERNATES = { 'vol1:letter-a': [['V', [['idAv', 'Part 1']]]] };
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', letterScreen: 'vol1-letter' }]]);
    globalThis.colPreface = () => ITEMS[0];
    globalThis.colLetterArr = () => ITEMS.slice(1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ['AUDIO_ALTERNATES', 'COL_BY_KEY', 'colPreface', 'colLetterArr']) delete globalThis[key];
  });

  const confirmStrip = () => document.querySelector('.audio-manager-voice-confirm');
  const urls = () => AudioPlayer.getState().queue.map((track) => track.url);
  const openOnLetterA = () => {
    startCollection();
    openSheet();
    fireEvent.click(nextTrack());                         // The Wide Path — two readings
  };

  it('switches immediately on a plain, unedited queue', () => {
    openOnLetterA();
    expect(AudioPlayer.getState().sourceMode).toBe('collection');
    openVoice();
    pickVoice(/Text-to-speech/);
    expect(confirmStrip()).toBeNull();
    expect(AudioPlayer.getState().queue[0].url).toBe(URL_OF('idAv'));
  });

  it('an edited queue switches in place: the chosen voice starts, the edit stays, nothing asks', () => {
    openOnLetterA();
    drive(() => AudioPlayer.removeUpcoming(3));
    expect(AudioPlayer.getState().sourceMode).toBe('custom');
    expect(urls()).toEqual([URL_OF('idPreface'), URL_OF('idA'), URL_OF('idB')]);

    openVoice();
    pickVoice(/Text-to-speech/);
    expect(confirmStrip()).toBeNull();
    const st = AudioPlayer.getState();
    expect(urls()).toEqual([URL_OF('idPreface'), URL_OF('idAv'), URL_OF('idB')]);   // Grafted In stays removed
    expect(st.qi).toBe(1);
    expect(st.queue[st.qi].readerCode).toBe('V');
    expect(st.sourceMode).toBe('custom');
    expect(voiceChip().getAttribute('aria-label')).toBe('Voice: Text-to-speech. Choose another');
  });

  it('does not ask about the voice already playing on an edited queue — there is nothing to switch (sweep v003)', () => {
    openOnLetterA();
    drive(() => AudioPlayer.removeUpcoming(3));
    expect(AudioPlayer.getState().sourceMode).toBe('custom');
    const before = urls();

    openVoice();
    pickVoice(/Benjamin/);

    expect(confirmStrip()).toBeNull();
    expect(subSheet('np-voice-sheet')).toBeNull();
    expect(AudioPlayer.getState().sourceMode).toBe('custom');  // the edited queue survives
    expect(urls()).toEqual(before);
  });

  it('a lone recording switches in place and stays one recording', () => {
    // A saved row whose asset no manifest carries rebuilds nothing, so it stays a queue of one.
    drive(() => AudioPlayer.playTrack({
      key: 'vol1:letter-a', title: 'The Wide Path', sub: 'Volume One',
      url: URL_OF('idGhost'), readerCode: 'V', partLabel: null,
    }));
    openSheet();
    expect(AudioPlayer.getState().queue).toHaveLength(1);
    expect(AudioPlayer.getState().sourceMode).toBe('custom');

    openVoice();
    pickVoice(/Benjamin/);
    expect(confirmStrip()).toBeNull();
    expect(urls()).toEqual([URL_OF('idA')]);
  });

  describe('when the switch cannot be made in place, the rebuild asks first', () => {
    beforeEach(() => { vi.spyOn(AudioPlayer, 'switchVoiceInPlace').mockReturnValue(false); });

    it('asks, and Cancel changes nothing', () => {
      openOnLetterA();
      drive(() => AudioPlayer.removeUpcoming(3));
      const before = urls();
      openVoice();
      pickVoice(/Text-to-speech/);
      const strip = confirmStrip();
      expect(strip).toBeTruthy();
      expect(strip.textContent).toContain('drops your changes');
      expect(urls()).toEqual(before);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(confirmStrip()).toBeNull();
      expect(urls()).toEqual(before);
      expect(voiceChip().getAttribute('aria-label')).toBe('Voice: Read by Benjamin. Choose another');
    });

    it('drops an open confirm once its voice is the one playing (sweep v003)', () => {
      openOnLetterA();
      drive(() => AudioPlayer.removeUpcoming(3));
      openVoice();
      pickVoice(/Text-to-speech/);
      expect(confirmStrip()).toBeTruthy();
      // The listener starts that reading some other way while the confirm is up.
      drive(() => AudioPlayer.playTrack({
        key: 'vol1:letter-a', title: 'The Wide Path', sub: 'Volume One',
        url: URL_OF('idAv'), readerCode: 'V', partLabel: 'Part 1',
      }));
      const q = AudioPlayer.getState().queue;
      drive(() => AudioPlayer.removeUpcoming(q.length - 1));    // and edits that queue too
      expect(AudioPlayer.getState().sourceMode).toBe('custom');
      expect(voiceChecked()).toEqual(['false', 'true']);
      // "Yes, switch" now would rebuild the queue — dropping the edit — for the voice already playing.
      expect(confirmStrip()).toBeNull();
    });

    it('switches on confirm', () => {
      openOnLetterA();
      drive(() => AudioPlayer.removeUpcoming(3));
      openVoice();
      pickVoice(/Text-to-speech/);
      fireEvent.click(screen.getByRole('button', { name: 'Yes, switch' }));
      expect(confirmStrip()).toBeNull();
      expect(subSheet('np-voice-sheet')).toBeNull();
      expect(AudioPlayer.getState().queue[0].url).toBe(URL_OF('idAv'));
      expect(AudioPlayer.getState().queue[0].readerCode).toBe('V');
    });
  });
});

describe('AudioManagerSheet — Bible rows name their chapter (A4)', () => {
  beforeEach(() => {
    globalThis.BIBLE_AUDIO_BOOKS = [['psalms', 'Psalms'], ['jude', 'Jude']];
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:psalms': Array.from({ length: 150 }, (_v, i) =>
        ['brm1_psalms_' + String(i + 1).padStart(3, '0'), '', 'Chapter ' + (i + 1)]),
      'bible-brm-kjv:jude': [['brm2_jude_001', '', 'Chapter 1']],
    };
  });
  afterEach(() => {
    for (const key of ['BIBLE_AUDIO_BOOKS', 'BIBLE_AUDIO_MANIFEST']) delete globalThis[key];
  });

  it('every row, the head and the row labels read uniquely', () => {
    drive(() => AudioPlayer.playBibleBook({
      volKey: 'bible-brm-kjv', bookId: 'psalms', chapterNum: 117, label: 'KJV · Biblical Restoration Ministries',
    }));
    openSheet();

    expect(screen.getByRole('heading', { name: 'Psalms 117' })).toBeTruthy();
    // Counted in the book's chapters (pl-l2b; the queue's count read 'Chapter 1 of 34' over Psalms 117), and the byline does not repeat "Chapter 117" under a
    // title that already says 117 (2026-08-10, the title-unique rule).
    expect(kicker()).toBe('KJV · Biblical Restoration Ministries · Chapter 117 of 150');
    expect(byline()).toBeNull();
    // 150 rows that all read "Psalms" told the listener nothing about which one they were hearing.
    openUpNext();
    expect(nowRow().querySelector('strong').textContent).toBe('Psalms 117');
    expect(upcomingTitles().slice(0, 3)).toEqual(['Psalms 118', 'Psalms 119', 'Psalms 120']);
    expect(screen.getByRole('button', { name: 'Play now: Psalms 119' })).toBeTruthy();
    expect(new Set(upcomingTitles()).size).toBe(upcomingTitles().length);
  });

  it('a title that does NOT spell out the chapter keeps its label in the byline', () => {
    // One part is not a chapter list, so Jude keeps its plain title — and the
    // part label is then the only place the chapter appears.
    drive(() => AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jude', label: 'KJV · Biblical Restoration' }));
    openSheet();

    expect(screen.getByRole('heading', { name: 'Jude' })).toBeTruthy();
    expect(kicker()).toBe('KJV · Biblical Restoration');
    expect(byline()).toBe('Chapter 1');
  });
});
