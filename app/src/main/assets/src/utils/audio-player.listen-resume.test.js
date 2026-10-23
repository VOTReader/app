// @ts-nocheck — drives a fake media element in jsdom
/* listenResume (ra4, Corbin 2026-10-14: the Listen button becomes "Resume · N min left" when there is a saved
   position). The pill asks the player what a Listen tap would pick up, so the question must read the SAME
   first track playLetter / playBibleBook queue and the same _resumeAt they start with: a pill that promised a
   resume the tap does not make would be worse than no promise. Each leg below plays the tap afterwards and
   checks that the element really lands where the answer said. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AUDIO_RESUME_REWIND_SEC } from './audio-track.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.readyState = 0; this.duration = 0; this.paused = true;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const MANIFEST = {
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
};
const ALTERNATES = { 'vol1:letter-c': [['V', [['idCv']]]] };
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
const LETTER_C = { id: 'letter-c', title: 'Letter C' };

let AudioPlayer;
let saved;
const el = () => FakeAudio.last;
/** Let the element report its length, as loadedmetadata does in a browser. */
const metadata = (d) => { el().duration = d; el().readyState = 1; el().dispatchEvent(new Event('loadedmetadata')); };

beforeEach(async () => {
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_ALTERNATES = ALTERNATES;
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:jonah': [['brm1_jonah_001', '', 'Chapter 1'], ['brm1_jonah_002', '', 'Chapter 2'], ['brm1_jonah_003', '', 'Chapter 3']],
  };
  globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
  saved = {};
  globalThis.AudioPositionsStore = { getPosition: (url) => saved[url] || null, setPosition: vi.fn(), clearPosition: vi.fn() };
  localStorage.removeItem('vot-audio-pos');
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
});
afterEach(() => {
  AudioPlayer.stop();
  AudioPlayer.setPreferredReader('auto');
  for (const k of ['AUDIO_MANIFEST', 'AUDIO_ALTERNATES', 'BIBLE_AUDIO_MANIFEST', 'BIBLE_AUDIO_BOOKS', 'AudioPositionsStore', 'Audio']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('listenResume — what a Listen tap would pick up (ra4)', () => {
  it('a letter with no saved place starts at the top: null', () => {
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C, collectionLabel: 'Volume One' })).toBeNull();
  });

  it('a saved place: where Listen resumes and the seconds left from there, and the tap lands there', () => {
    saved[URL_OF('idC')] = { t: 600, d: 1800 };
    const r = AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C, collectionLabel: 'Volume One' });
    expect(r).toEqual({ at: 600 - AUDIO_RESUME_REWIND_SEC, left: 1800 - (600 - AUDIO_RESUME_REWIND_SEC) });
    AudioPlayer.playLetter({ volKey: 'vol1', letter: LETTER_C, collectionLabel: 'Volume One' });
    expect(el().src).toBe(URL_OF('idC'));
    metadata(1800);
    expect(el().currentTime).toBe(r.at);
  });

  it('a length never learned still resumes, with left 0 (no guessed minutes)', () => {
    saved[URL_OF('idC')] = { t: 600, d: 0 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toEqual({ at: 600 - AUDIO_RESUME_REWIND_SEC, left: 0 });
  });

  it('too little heard, or heard to the end, is no resume (the same thresholds the player keeps)', () => {
    saved[URL_OF('idC')] = { t: 20, d: 1800 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toBeNull();
    saved[URL_OF('idC')] = { t: 1790, d: 1800 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toBeNull();
  });

  it('reads the default reader\'s recording, the one Listen plays', () => {
    saved[URL_OF('idC')] = { t: 600, d: 1800 };           // the primary reading has a place...
    AudioPlayer.setPreferredReader('V');                     // ...but Listen now plays V's reading, which has none
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toBeNull();
    saved[URL_OF('idCv')] = { t: 300, d: 900 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toEqual({ at: 300 - AUDIO_RESUME_REWIND_SEC, left: 900 - 295 });
  });

  it('a multi-part letter asks about its first part, where Listen starts', () => {
    saved[URL_OF('idA2')] = { t: 600, d: 1800 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: { id: 'letter-a' } })).toBeNull();
    saved[URL_OF('idA1')] = { t: 120, d: 400 };
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: { id: 'letter-a' } })).toEqual({ at: 115, left: 285 });
  });

  it('a Bible chapter asks about that chapter\'s recording, and the tap lands there', () => {
    saved[OT('brm1_jonah_002')] = { t: 90, d: 240 };
    expect(AudioPlayer.listenResume({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 1 })).toBeNull();
    const r = AudioPlayer.listenResume({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 2 });
    expect(r).toEqual({ at: 85, left: 155 });
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: 'KJV', chapterNum: 2 });
    expect(el().src).toBe(OT('brm1_jonah_002'));
    metadata(240);
    expect(el().currentTime).toBe(85);
  });

  it('a book Listen (no chapter) asks about chapter 1', () => {
    saved[OT('brm1_jonah_001')] = { t: 90, d: 240 };
    expect(AudioPlayer.listenResume({ volKey: 'bible-brm-kjv', bookId: 'jonah' })).toEqual({ at: 85, left: 155 });
  });

  it('the recording already playing is no resume: the tap is not a pick-up there', () => {
    saved[URL_OF('idC')] = { t: 600, d: 1800 };
    AudioPlayer.playLetter({ volKey: 'vol1', letter: LETTER_C });
    el().dispatchEvent(new Event('playing'));
    expect(AudioPlayer.getState().status).toBe('playing');
    expect(AudioPlayer.listenResume({ volKey: 'vol1', letter: LETTER_C })).toBeNull();
  });
});

/* U04.5 (UX sweep 2026-10-22): the Bible hero said Listen while its own chapter played, and a tap started the
   chapter again. A Listen pill asks the player whether its passage is the recording loaded now; then it says
   Pause (or Loading…) and its tap toggles what is sounding, as the letter's Listen already did. */
describe('listenHere — is this passage the recording in the player (U04.5)', () => {
  it('nothing loaded: no', () => {
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 1 })).toBe(false);
    expect(AudioPlayer.listenHere({ volKey: 'vol1', letter: LETTER_C })).toBe(false);
  });

  it('a Bible chapter: that chapter, from any edition\'s page; not the next one; a book page counts any chapter', () => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'jonah', label: 'KJV', chapterNum: 2 });
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 2 })).toBe(true);
    expect(AudioPlayer.listenHere({ volKey: 'bible-web', bookId: 'jonah', chapterNum: 2 })).toBe(true);
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 3 })).toBe(false);
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah' })).toBe(true);
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'ruth', chapterNum: 2 })).toBe(false);
    // The book queues on: once chapter 3 plays, chapter 2's page is no longer the one sounding.
    AudioPlayer.next();
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 2 })).toBe(false);
    expect(AudioPlayer.listenHere({ volKey: 'bible-brm-kjv', bookId: 'jonah', chapterNum: 3 })).toBe(true);
  });

  it('a letter: any part of it, in any reader\'s voice; never another letter', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'A' }, collectionLabel: 'Volume One' });
    expect(AudioPlayer.listenHere({ volKey: 'vol1', letter: { id: 'letter-a' } })).toBe(true);
    AudioPlayer.next();
    expect(AudioPlayer.getState().queue[AudioPlayer.getState().qi].partLabel).toBe('Part 2');
    expect(AudioPlayer.listenHere({ volKey: 'vol1', letter: { id: 'letter-a' } })).toBe(true);
    expect(AudioPlayer.listenHere({ volKey: 'vol1', letter: LETTER_C })).toBe(false);
    AudioPlayer.setPreferredReader('V');
    AudioPlayer.playLetter({ volKey: 'vol1', letter: LETTER_C, collectionLabel: 'Volume One' });
    expect(el().src).toBe(URL_OF('idCv'));
    expect(AudioPlayer.listenHere({ volKey: 'vol1', letter: LETTER_C })).toBe(true);
  });
});
