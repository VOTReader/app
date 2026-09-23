// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element.
/* A WTLB COMPILATION NAMES THE LETTER IT IS READING, AND CREDITS EACH ONE HEARD (listening items 2+3, 2026-09-22).
   ═══════════════════════════════════════════════════════════════════════
   The 14 compilation files run 10-24 minutes and read 19-31 letters each (347 letters). A section track
   carries key null (one file, one resume position), so everything that names a recording by its track —
   the mini-player, the listening desk, the web Media Session and the Android media card — said only
   "Part 1 · Intro–19" for the whole file, and _notifyListened (which credits a letter heard to its end,
   owner rule 2026-08-09) returned on the null key, so not one of those 347 letters was ever credited.

   The player already answers "which letter is under the clock" (sectionLetterKeyAt). These pin:
     - liveLetter(): { key, title } of that letter for the loaded compilation, null otherwise;
     - the media card title follows it, re-sent on the LETTER boundary only (not per tick);
     - a letter played through (>= 80 % of its span, seeks excluded) is credited when the clock walks into
       the next one, and the last one at 'ended', where the file itself also counts as one completion. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlayer } from './audio-player.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

/* The align lane's two-asset fixture (as in audio-player.test.js / ReadAlongHighlight.sections.test.jsx). */
const PART1_ID = '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g';
const SECTIONS_FIXTURE = {
  [PART1_ID]: {
    'wtlb1:introduction': [[4.2, 0, -1, -1, 0], [5.31, 0, 30, 50, 0], [6.97, 0, 58, 91, 0], [12.66, 0, 99, 131, 0]],
    'wtlb1:come-love-awaits-you': [[61.0, 0, 0, 54, 0], [66.16, 1, 0, 40, 0], [69.32, 1, 42, 82, 0], [72.5, 2, 0, 33, 0]],
    'wtlb1:crowning-glory': [[118.5, 0, 0, 40, 0], [121.7, 1, 0, 50, 0], [125.34, 1, 52, 90, 0]],
  },
};
const SECTIONS_MANIFEST = {
  wtlb1: [['Part 1 · Intro–19', PART1_ID, 'V'], ['Part 2 · 20–39', '1LTCwtvaNo8aqhyYBltky8cwfmVFe46su', 'V']],
};
const WTLB1 = { volKey: 'wtlb1', label: 'Words To Live By: Part One', readKey: 'wtlb1' };
const ITEMS = {
  wtlb1: [
    { id: 'introduction', title: 'Introduction' },
    { id: 'come-love-awaits-you', title: 'Come, Love Awaits You' },
    { id: 'crowning-glory', title: 'Crowning Glory' },
  ],
};
const FILE_END = 130;

class FakeMetadata { constructor(init) { Object.assign(this, init); } }

let listened;
let completions;
let nowPlaying;
let session;

/** The element reports a clock, the way a real one does ~4 times a second. */
const tick = (t) => { const el = FakeAudio.last; el.duration = FILE_END; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); };
/** Play continuously from `a` to `b` in quarter-second steps. */
const playThrough = (a, b) => { for (let t = a; t <= b + 1e-9; t += 0.25) tick(+t.toFixed(2)); };
const startPart1 = () => AudioPlayer.playSection('wtlb1', 0, WTLB1.label);

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = {};
  globalThis.AUDIO_SECTIONS = SECTIONS_MANIFEST;
  globalThis.AUDIO_SYNC_SECTIONS = SECTIONS_FIXTURE;
  globalThis.COL_BY_KEY = new Map([['wtlb1', WTLB1]]);
  globalThis.colLetterArr = (col) => ITEMS[col.volKey] || [];
  listened = vi.fn();
  globalThis.__votAudioListened = listened;
  completions = 0;
  globalThis.AudioLibraryStore = { countCompletion: () => { completions += 1; return completions; } };
  nowPlaying = vi.fn();
  window.AndroidBridge = { setAudioActive: vi.fn(), setAudioNowPlaying: nowPlaying };
  session = { metadata: null, playbackState: 'none', setActionHandler: vi.fn(), setPositionState: vi.fn() };
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
  globalThis.MediaMetadata = FakeMetadata;
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  AudioPlayer.stop();
  for (const k of ['Audio', 'AUDIO_MANIFEST', 'AUDIO_SECTIONS', 'AUDIO_SYNC_SECTIONS', 'COL_BY_KEY', 'colLetterArr',
    '__votAudioListened', 'AudioLibraryStore', 'MediaMetadata', '__votAudioArbiter']) delete globalThis[k];
  delete window.AndroidBridge;
  delete navigator.mediaSession;
  localStorage.removeItem('vot-audio-pos');
});

describe('liveLetter(): the letter a compilation is reading', () => {
  it('names the letter under the clock, and nothing during the file intro', () => {
    startPart1();
    tick(2);
    expect(AudioPlayer.liveLetter()).toBe(null);
    tick(5);
    expect(AudioPlayer.liveLetter()).toEqual({ key: 'wtlb1:introduction', title: 'Introduction' });
    tick(63);
    expect(AudioPlayer.liveLetter()).toEqual({ key: 'wtlb1:come-love-awaits-you', title: 'Come, Love Awaits You' });
  });

  it('is null for a keyed recording', () => {
    globalThis.AUDIO_MANIFEST = { 'one:a': [['idA', 'B']] };
    AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'a', title: 'A' }, collectionLabel: 'Volume One' });
    tick(40);
    expect(AudioPlayer.liveLetter()).toBe(null);
  });
});

describe('the media card follows the letter', () => {
  it('the web Media Session title is the letter being read, with the section kept in the album line', () => {
    startPart1();
    expect(session.metadata.title, 'before the first letter the section names itself').toBe('Part 1 · Intro–19');
    tick(5);
    expect(session.metadata.title).toBe('Introduction');
    expect(session.metadata.album).toContain('Part 1 · Intro–19');
    tick(63);
    expect(session.metadata.title).toBe('Come, Love Awaits You');
  });

  it('the Android card is re-sent on a letter boundary, not on every tick inside a letter', () => {
    startPart1();
    tick(5);
    const atIntro = nowPlaying.mock.calls.length;
    expect(nowPlaying.mock.calls[atIntro - 1][0]).toBe('Introduction');
    playThrough(5.25, 20);
    // whole-second ticks re-sync nothing natively (the card interpolates on its own); only a new letter does
    expect(nowPlaying.mock.calls.length, 'no re-send inside one letter').toBe(atIntro);
    tick(61.1);
    expect(nowPlaying.mock.calls.length).toBe(atIntro + 1);
    expect(nowPlaying.mock.calls[atIntro][0]).toBe('Come, Love Awaits You');
  });
});

describe('each letter heard through a compilation is credited', () => {
  it('a letter played through is credited when the clock walks into the next one', () => {
    startPart1();
    playThrough(0, 61.25);
    expect(listened).toHaveBeenCalledTimes(1);
    expect(listened).toHaveBeenCalledWith('wtlb1', 'introduction', 0);
  });

  it('a letter skipped by a seek is not credited', () => {
    startPart1();
    playThrough(0, 62);                                // introduction credited, come-love-awaits-you begun
    listened.mockClear();
    AudioPlayer.seek(117);                             // jump over most of come-love-awaits-you
    playThrough(117, 119);                             // walk into crowning-glory
    expect(listened).not.toHaveBeenCalled();
  });

  it('the last letter is credited at the end of the file, and the file counts as one completion', () => {
    startPart1();
    playThrough(0, 62);
    listened.mockClear();
    AudioPlayer.seek(118.4);
    playThrough(118.5, FILE_END);
    const done = completions;
    FakeAudio.last.dispatchEvent(new Event('ended'));
    expect(listened).toHaveBeenCalledWith('wtlb1', 'crowning-glory', 0);
    expect(completions - done, 'the compilation file itself was heard to the end').toBe(1);
  });

  it('a letter paused part-way and resumed still counts; a letter barely begun does not', () => {
    startPart1();
    playThrough(0, 30);
    AudioPlayer.toggle();                              // pause
    AudioPlayer.toggle();                              // resume
    playThrough(30.25, 61.25);
    expect(listened).toHaveBeenCalledWith('wtlb1', 'introduction', 0);
    listened.mockClear();
    playThrough(61.5, 64);                             // 3 s of come-love-awaits-you ...
    AudioPlayer.seek(118.5);                           // ... then a jump
    playThrough(118.75, 120);
    expect(listened).not.toHaveBeenCalled();
  });
});
