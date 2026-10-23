// @ts-nocheck — drives a fake media element in jsdom
/* playPortion (mw18 C5): a reading plan's Listen plays today's portion only, as one queue, and stops. The
   queue is the listed Bible chapters (their edition's chapter parts) and letters (all their parts), in order,
   and it never runs on into the rest of the book or collection when the portion ends. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
};
const ALTERNATES = {};
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
const LETTER_A = { id: 'letter-a', title: 'Letter A' };

let AudioPlayer;
let saved;
const el = () => FakeAudio.last;
/** Let the element report its length, as loadedmetadata does in a browser. */

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

describe('playPortion — today’s portion as one queue that stops (mw18 C5)', () => {
  it('queues the chapters and the letter in order, and nothing after them', () => {
    const ok = AudioPlayer.playPortion({ label: 'Bible in a Year', items: [
      { volKey: 'bible-brm-kjv', item: { id: 'jonah' }, collectionLabel: 'KJV', chapterNum: 2 },
      { volKey: 'bible-brm-kjv', item: { id: 'jonah' }, collectionLabel: 'KJV', chapterNum: 3 },
      { volKey: 'vol1', item: LETTER_A, collectionLabel: 'Volume One' },
    ] });
    expect(ok).toBe(true);
    expect(AudioPlayer.getState().queue.map((t) => t.url)).toEqual([OT('brm1_jonah_002'), OT('brm1_jonah_003'), URL_OF('idA1'), URL_OF('idA2')]);
    expect(el().src).toBe(OT('brm1_jonah_002'));
    // the last track ends: the queue is not extended into anything else
    AudioPlayer.next(); AudioPlayer.next(); AudioPlayer.next();
    expect(el().src).toBe(URL_OF('idA2'));
    el().dispatchEvent(new Event('ended'));
    expect(AudioPlayer.getState().status).not.toBe('playing');
    expect(AudioPlayer.getState().queue.some((t) => !/jonah_00[23]|idA[12]/.test(t.url))).toBe(false);
  });

  it("the portion's end says today's listening is done, and the saved place remembers it is a portion", () => {
    AudioPlayer.playPortion({ label: 'Bible in a Year', items: [
      { volKey: 'bible-brm-kjv', item: { id: 'jonah' }, collectionLabel: 'KJV', chapterNum: 2 },
    ] });
    el().dispatchEvent(new Event('playing'));
    el().currentTime = 40;
    el().dispatchEvent(new Event('timeupdate'));
    expect(JSON.parse(localStorage.getItem('vot-audio-pos')).portion).toBe(true);
    el().dispatchEvent(new Event('ended'));
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(document.getElementById('vot-toast-audio').textContent).toBe('Today’s listening is done.');
  });

  it('passes over items with no recording, and starts nothing when none has one', () => {
    expect(AudioPlayer.playPortion({ items: [{ volKey: 'vol1', item: { id: 'nope', title: 'Nope' } }] })).toBe(false);
    expect(AudioPlayer.getState().queue.length).toBe(0);
    expect(AudioPlayer.playPortion({ items: [{ volKey: 'vol1', item: { id: 'nope' } }, { volKey: 'bible-brm-kjv', item: { id: 'jonah' }, chapterNum: 1 }] })).toBe(true);
    expect(AudioPlayer.getState().queue.map((t) => t.url)).toEqual([OT('brm1_jonah_001')]);
  });
});
