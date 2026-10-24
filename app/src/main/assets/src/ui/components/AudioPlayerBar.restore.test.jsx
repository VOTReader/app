// @ts-nocheck -- drives the REAL AudioPlayer through a fake media element.
/* AudioPlayerBar — the bar a cold boot paints (sweep v021).
   ─────────────────────────────────────────────────────────────────────────
   A boot restore puts the bar up PAUSED over ONE placeholder track that stands
   in for a queue nobody has rebuilt yet (`restoring`). The bar read that
   placeholder as a lone recording: Next hidden, prev called Restart. So a
   listener coming back to chapter 5 of a book could not skip to chapter 6. The
   desk has refused that reading since 2026-08-10; this is the bar's half.

   The restore runs at module evaluation, so this file re-imports the player AND
   the bar after writing the snapshot (one fresh module graph, so the bar reads
   the player that restored). AudioPlayerBar.test.jsx keeps the shared singleton
   and its static imports; that is why these cases live in their own file. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = '';
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.error = null;
    this.preload = '';
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
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

/** The snapshot a session paused on The Wide Path, Part 2, leaves behind. */
const SNAPSHOT = {
  v: 1, mode: 'collection', volKey: 'vol1', label: 'Volume One', qi: 2, key: 'vol1:letter-a', time: 123,
  track: { title: 'The Wide Path', sub: 'Volume One', readerCode: 'B', partLabel: 'Part 2', url: URL_OF('idA2'), key: 'vol1:letter-a' },
};

let AudioPlayer;
let AudioPlayerBar;

/** Boot with SNAPSHOT saved: a fresh player restores it at evaluation, and a fresh bar reads that player. */
async function boot() {
  localStorage.setItem('vot-audio-pos', JSON.stringify(SNAPSHOT));
  vi.resetModules();
  ({ AudioPlayer } = await import('../../utils/audio-player.js'));
  ({ AudioPlayerBar } = await import('./AudioPlayerBar.jsx'));
}

const line2 = () => document.querySelector('.audio-bar-line2').textContent;

beforeEach(() => {
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.ReactDOM = ReactDOM;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1', label: 'Volume One' }]]);
  globalThis.colPreface = () => ITEMS[0];
  globalThis.colLetterArr = () => ITEMS.slice(1);
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  modalRegistry._reset();
});

afterEach(() => {
  cleanup();
  if (AudioPlayer) AudioPlayer.stop();
  modalRegistry._reset();
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  for (const k of ['__votAudioArbiter', 'Audio', 'ReactDOM', 'AUDIO_MANIFEST', 'COL_BY_KEY', 'colPreface', 'colLetterArr']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('AudioPlayerBar — a boot-restored bar is not a queue of one (sweep v021)', () => {
  it('reads Resume at its place, and claims no "1 of 1" (brief 3g)', async () => {
    await boot();
    render(<AudioPlayerBar />);
    expect(AudioPlayer.getState().restoring).toBe(true);
    expect(AudioPlayer.getState().queue).toHaveLength(1);    // the placeholder
    // The real queue's length is unknown until the rebuild, so the bar names no place in it.
    expect(line2()).toBe('Resume · 2:03');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('Play rebuilds the real queue at the saved recording, and the bar counts its place in it', async () => {
    await boot();
    render(<AudioPlayerBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    const st = AudioPlayer.getState();
    expect(st.restoring).toBe(false);
    expect(st.queue).toHaveLength(4);
    expect(st.qi).toBe(2);
    expect(FakeAudio.last.src).toBe(URL_OF('idA2'));
    expect(document.querySelector('.audio-bar-title').textContent).toBe('The Wide Path · Part 2');
    expect(line2()).toBe('2 of 3 · Volume One');   // counted in recordings: Letter A's two parts are one
  });
});
