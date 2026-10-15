// @ts-nocheck — drives fake media elements in jsdom
/* audio-player — the web app's chapter seam on Android (rv4, 2026-10-15).

   In Chrome the recording plays in Chrome's own media session, and Chrome's media notification service is what keeps
   it in the foreground with the screen off. With one <audio> the session is empty between a recording's end and the
   next one's first sound: on the S22 Chrome gave up audio focus and its service left the foreground at every seam, and
   at the third seam with the screen off the next chapter's fetch failed (net::ERR_NAME_NOT_RESOLVED: Android 15 cuts a
   sleeping app's network) and playback stopped. A silent
   recording that plays across the seam keeps the session; these tests pin when it runs. FakeAudio as in
   audio-player.test.js, keeping every element made (the player's own and the silent one). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeAudio extends EventTarget {
  constructor(src) {
    super();
    FakeAudio.all.push(this);
    this._src = src || '';
    this.currentTime = 0;
    this.readyState = 0;
    this.duration = 0;
    this.paused = true;
    this.ended = false;
    this.loop = false;
    this.preload = '';
    this.error = null;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
    this.plays = 0;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.ended = false; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}
FakeAudio.all = [];

const MANIFEST = {
  'vol1:letter-a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']],
  'vol1:letter-c': [['idC', 'T']],
};
const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

let AudioPlayer;
let blobs;
const realUA = navigator.userAgent;

function setUA(ua) { Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => ua }); }

async function load() {
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
}

/** The player's element: the first one made. */
const main = () => FakeAudio.all[0];
/** The silent one, once made. */
const keeper = () => FakeAudio.all.find((a) => a !== main()) || null;

/** The player's element playing `t` seconds into a `d`-second recording (timeupdate as the browser fires it). */
function at(t, d = 100) {
  main().duration = d;
  main().currentTime = t;
  main().dispatchEvent(new Event('timeupdate'));
}

/** A recording's end as the browser reports it: paused with ended true, 'pause', then 'ended'. */
function end() {
  main().ended = true;
  main().paused = true;
  main().dispatchEvent(new Event('pause'));
  main().dispatchEvent(new Event('ended'));
}

beforeEach(async () => {
  FakeAudio.all = [];
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  localStorage.removeItem('vot-audio-pos');
  blobs = [];
  URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:silence-' + blobs.length; });
  setUA(ANDROID_CHROME);
  delete window.AndroidBridge;   // the installed web app: no APK bridge
  await load();
});

afterEach(() => {
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  delete globalThis.__votAudioArbiter;
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.Audio;
  delete URL.createObjectURL;
  delete window.AndroidBridge;
  setUA(realUA);
});

describe('audio-player — the seam on Android Chrome (rv4)', () => {
  it('a silent recording plays across the seam: from the last seconds until the next recording plays', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(50);
    expect(keeper()).toBe(null);            // mid-recording: nothing
    at(98.5);
    const k = keeper();
    expect(k).not.toBe(null);
    expect(k.paused).toBe(false);           // started before the end, while the session still has the reading
    expect(k.loop).toBe(true);
    end();                                   // Part 1 ends: the player loads Part 2
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(main().src).toBe(URL_OF('idA2'));
    expect(k.paused).toBe(false);           // the session is not empty while Part 2 loads
    at(0, NaN);                              // the src swap's timeupdate, before a sound
    expect(k.paused).toBe(false);
    main().dispatchEvent(new Event('playing'));
    at(0.25, 120);
    expect(k.paused).toBe(false);           // not yet: Chrome may not have Part 2's player in the session
    at(0.5, 120);
    expect(k.paused).toBe(true);            // Part 2 holds the session now
  });

  it('the silent recording is at least 5 s long (Chrome drops a shorter sound from the session) and silent', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(99);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('audio/wav');
    expect(keeper().src).toBe('blob:silence-1');
    // 8-bit mono PCM: header 44 bytes, then one byte per sample at the stated rate.
    const rate = 8000;
    expect((blobs[0].size - 44) / rate).toBeGreaterThanOrEqual(6);
  });

  it('one silent element for the session, made once', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(98.5); at(98.8); at(99.2);
    end();
    main().dispatchEvent(new Event('playing'));
    at(0.6, 120);
    expect(keeper().paused).toBe(true);
    at(119, 120);                            // Part 2's own last seconds
    expect(FakeAudio.all).toHaveLength(2);
    expect(blobs).toHaveLength(1);
    expect(keeper().paused).toBe(false);
    expect(keeper().plays).toBe(2);
  });

  it('reading speed counts: 2 s of listening at 2x is 4 s of recording', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(96.5);                                // 3.5 s left at 1x: not yet
    expect(keeper()).toBe(null);
    main().playbackRate = 2;
    at(96.5);                                // 3.5 s of recording at 2x is 1.75 s of listening
    expect(keeper()).not.toBe(null);
  });

  it('a pause, a stop or a load error in the bridge stops the silent recording', async () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(99);
    end();                                   // Part 2 loading
    main().dispatchEvent(new Event('error')); // ... and it fails
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(keeper().paused).toBe(true);

    AudioPlayer.toggle();                    // retry
    main().dispatchEvent(new Event('playing'));
    at(99);
    expect(keeper().paused).toBe(false);
    AudioPlayer.toggle();                    // the listener's pause in the last seconds
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(keeper().paused).toBe(true);

    AudioPlayer.toggle();
    main().dispatchEvent(new Event('playing'));
    at(99.1);
    expect(keeper().paused).toBe(false);
    AudioPlayer.stop();
    expect(keeper().paused).toBe(true);
  });

  it('the end of the order: nothing follows, the silent recording stops with the player', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-c', title: 'Letter C' } });
    main().dispatchEvent(new Event('playing'));
    at(99);
    end();
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(!keeper() || keeper().paused).toBe(true);
  });

  it('a seek back out of the last seconds lets the silent recording go', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    at(99);
    expect(keeper().paused).toBe(false);
    at(40);
    expect(keeper().paused).toBe(true);
  });

  it('not when the recording stops at its end (sleep at the end of this recording)', () => {
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    main().dispatchEvent(new Event('playing'));
    AudioPlayer.setSleepAtTrackEnd(true);
    at(99);
    expect(keeper()).toBe(null);
  });

  it('not in the APK (native plays, m3), not on an iPhone (one sound at a time: it would pause the reading), not on a desktop', async () => {
    for (const [ua, bridge] of [[ANDROID_CHROME, {}], [IPHONE, null], [realUA, null]]) {
      FakeAudio.all = [];
      setUA(ua);
      if (bridge) window.AndroidBridge = bridge; else delete window.AndroidBridge;
      await load();
      AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
      main().dispatchEvent(new Event('playing'));
      at(99);
      expect(keeper()).toBe(null);
      AudioPlayer.stop();
    }
  });
});
