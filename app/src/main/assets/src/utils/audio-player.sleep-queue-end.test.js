// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element, on fake timers.
/* SLEEP: END OF THE QUEUE, AND "KEEP LISTENING +15 MIN" (player brief 3b, pl-l2).
   ═══════════════════════════════════════════════════════════════════════
   The sleep sheet's "End of the queue" stops when what is in Up next has played: the run does not go on into
   the next collection of the site order while it is armed, and the last recording's end pauses at the bottom
   of the fade like the other sleep modes. Any sleep that ends says so with "Keep listening +15 min", which
   plays on and arms a 15-minute countdown. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioPlayer } from './audio-player.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.readyState = 0;
    this.preload = ''; this.error = null; this.defaultPlaybackRate = 1; this.playbackRate = 1; this.volume = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const el = () => FakeAudio.last;
const end = () => { el().duration = 300; el().currentTime = 300; el().dispatchEvent(new Event('ended')); };
const ITEMS = { one: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], two: [{ id: 'c', title: 'C' }] };
const playRun = () => AudioPlayer.playCollection({ volKey: 'one', items: ITEMS.one, collectionLabel: 'Volume One' });
const toastText = () => (document.getElementById('vot-toast-audio') || {}).textContent || '';

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'one:a': [['idA', 'B']], 'one:b': [['idB', 'B']], 'two:c': [['idC', 'B']] };
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'c1', label: 'Volume One' }, { volKey: 'two', cardId: 'c2', label: 'Volume Two' }];
  globalThis.COL_BY_KEY = new Map([['one', { volKey: 'one' }], ['two', { volKey: 'two' }]]);
  globalThis.colLetterArr = (col) => ITEMS[col.volKey] || [];
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  AudioPlayer.stop();
  document.body.innerHTML = '';
  delete globalThis.COLLECTIONS; delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr;
  vi.useRealTimers();
});

describe('sleep at the end of the queue', () => {
  it('plays out what is queued, does not run on into the next collection, and pauses at the last end', () => {
    playRun();
    expect(AudioPlayer.setSleepAtQueueEnd()).toBe(true);
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(true);
    end();   // A ends: B starts, the run is NOT extended into Volume Two
    const s = AudioPlayer.getState();
    expect(s.qi).toBe(1);
    expect(s.queue.map((t) => t.key)).toEqual(['one:a', 'one:b']);
    expect(s.status).not.toBe('paused');
    end();   // B ends: the queue is spent, the sleep fires
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(false);
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(toastText()).toContain('Sleep timer ended');
  });

  it('a run left unarmed goes on into the next collection as before', () => {
    playRun();
    end();
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(['one:a', 'one:b', 'two:c']);
  });

  it('cleared on the last recording, the run joins the site order again', () => {
    playRun();
    AudioPlayer.setSleepAtQueueEnd();
    end();
    expect(AudioPlayer.getState().queue).toHaveLength(2);
    AudioPlayer.clearSleepTimer();
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(false);
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(['one:a', 'one:b', 'two:c']);
  });

  it('each sleep mode replaces the others', () => {
    playRun();
    AudioPlayer.setSleepAtQueueEnd();
    AudioPlayer.setSleepTimer(15);
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(false);
    AudioPlayer.setSleepAtQueueEnd();
    expect(AudioPlayer.getState().sleepMinutes).toBe(0);
    expect(AudioPlayer.getState().sleepEndsAt).toBe(0);
    AudioPlayer.setSleepAtTrackEnd();
    expect(AudioPlayer.getState().sleepAtQueueEnd).toBe(false);
    AudioPlayer.setSleepAtQueueEnd();
    expect(AudioPlayer.getState().sleepAtTrackEnd).toBe(false);
  });

  it('refuses with nothing playing', () => {
    expect(AudioPlayer.setSleepAtQueueEnd()).toBe(false);
  });
});

describe('Keep listening +15 min', () => {
  it('the countdown ending offers it; the tap plays on with a 15-minute timer', () => {
    playRun();
    AudioPlayer.setSleepTimer(30);
    vi.advanceTimersByTime(30 * 60000);
    expect(AudioPlayer.getState().status).toBe('paused');
    const btn = document.querySelector('#vot-toast-audio button');
    expect(btn && btn.textContent).toBe('Keep listening +15 min');
    btn.click();
    const s = AudioPlayer.getState();
    expect(s.status).not.toBe('paused');
    expect(s.sleepMinutes).toBe(15);
    expect(AudioPlayer.getSleepRemainingSeconds()).toBeGreaterThan(14 * 60);
  });

});
