// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element.
/* UP NEXT EDITS (player brief 3c, pl-l2 L3).
   insertUpcoming puts a removed row back (the swipe's Undo); Clear upcoming has an Undo that brings back the rows AND
   the run's way on into the site order; Play next lands right after the playing recording (after all its parts), Add
   to queue at the end; with nothing playing either one starts the tracks as a queue of their own. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

const ITEMS = { one: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }], two: [{ id: 'd', title: 'D' }] };
const keys = () => AudioPlayer.getState().queue.map((t) => t.key + (t.partLabel ? '#' + t.partLabel : ''));
const playRun = () => AudioPlayer.playCollection({ volKey: 'one', items: ITEMS.one, collectionLabel: 'Volume One' });
const end = () => { const el = FakeAudio.last; el.duration = 300; el.currentTime = 300; el.dispatchEvent(new Event('ended')); };
const trackOf = (volKey, id) => AudioPlayer.playbackTracks(volKey, { id, title: id.toUpperCase() }, volKey === 'two' ? 'Volume Two' : 'Volume One');

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = {
    'one:a': [['idA1', 'B', 'Part 1'], ['idA2', 'B', 'Part 2']], 'one:b': [['idB', 'B']], 'one:c': [['idC', 'B']], 'two:d': [['idD', 'B']],
  };
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'c1', label: 'Volume One' }, { volKey: 'two', cardId: 'c2', label: 'Volume Two' }];
  globalThis.COL_BY_KEY = new Map([['one', { volKey: 'one' }], ['two', { volKey: 'two' }]]);
  globalThis.colLetterArr = (col) => ITEMS[col.volKey] || [];
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  AudioPlayer.stop();
  delete globalThis.COLLECTIONS; delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr;
});

describe('insertUpcoming (the swipe-remove Undo)', () => {
  it('puts a removed row back where it was', () => {
    playRun();
    const before = keys();
    const removed = AudioPlayer.getState().queue[3];
    AudioPlayer.removeUpcoming(3);
    expect(AudioPlayer.insertUpcoming(3, removed)).toBe(true);
    expect(keys()).toEqual(before);
  });

  it('never at or before the playing row, never past the end', () => {
    playRun();
    const t = AudioPlayer.getState().queue[2];
    expect(AudioPlayer.insertUpcoming(0, t)).toBe(false);
    expect(AudioPlayer.insertUpcoming(99, t)).toBe(false);
    expect(AudioPlayer.insertUpcoming(1, { title: 'no url' })).toBe(false);
  });
});

describe('Clear upcoming, with Undo', () => {
  it('brings back the rows and the run on into the site order', () => {
    playRun();
    const before = keys();
    const token = AudioPlayer.clearUpcomingWithUndo();
    expect(keys()).toEqual(['one:a#Part 1']);
    expect(AudioPlayer.undoClearUpcoming(token)).toBe(true);
    expect(keys()).toEqual(before);
    // the run still continues into Volume Two when it is spent
    AudioPlayer.playAt(3);
    expect(keys()).toContain('two:d');
  });

  it('is spent once the queue has moved on', () => {
    playRun();
    const token = AudioPlayer.clearUpcomingWithUndo();
    AudioPlayer.playNext(trackOf('two', 'd'));
    expect(AudioPlayer.undoClearUpcoming(token)).toBe(false);
    expect(keys()).toEqual(['one:a#Part 1', 'two:d']);
  });

  it('gives nothing to undo when nothing is upcoming', () => {
    AudioPlayer.playLetter({ volKey: 'two', letter: { id: 'd', title: 'D' }, collectionLabel: 'Volume Two' });
    expect(AudioPlayer.clearUpcomingWithUndo()).toBe(null);
  });
});

describe('Play next / Add to queue', () => {
  it('Play next lands after the playing letter, after all its parts', () => {
    playRun();
    expect(AudioPlayer.playNext(trackOf('two', 'd'))).toBe(true);
    expect(keys()).toEqual(['one:a#Part 1', 'one:a#Part 2', 'two:d', 'one:b', 'one:c']);
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().sourceMode).toBe('custom');
  });

  it('Add to queue lands at the end', () => {
    playRun();
    expect(AudioPlayer.addToQueue(trackOf('two', 'd'))).toBe(true);
    expect(keys()).toEqual(['one:a#Part 1', 'one:a#Part 2', 'one:b', 'one:c', 'two:d']);
  });

  it('takes a letter of several parts whole', () => {
    AudioPlayer.playLetter({ volKey: 'two', letter: { id: 'd', title: 'D' }, collectionLabel: 'Volume Two' });
    AudioPlayer.addToQueue(trackOf('one', 'a'));
    expect(keys()).toEqual(['two:d', 'one:a#Part 1', 'one:a#Part 2']);
  });

  it('with nothing playing, starts the tracks as a queue of their own', () => {
    expect(AudioPlayer.playNext(trackOf('one', 'b'))).toBe(true);
    const s = AudioPlayer.getState();
    expect(keys()).toEqual(['one:b']);
    expect(s.status).not.toBe('idle');
    expect(s.sourceMode).toBe('custom');
  });

  it('what was added plays in its turn', () => {
    playRun();
    AudioPlayer.playNext(trackOf('two', 'd'));
    end(); end();
    const s = AudioPlayer.getState();
    expect(s.queue[s.qi].key).toBe('two:d');
  });
});
