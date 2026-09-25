// @ts-nocheck — drives the REAL AudioPlayer singleton through a fake media element.
/* REPEAT THIS PASSAGE on the bar (rp1 part 3, 2026-09-25; mockup lanes/myweb/out/mockups/rp1/r1-repeat.png).
   While a passage repeats, the bar's source line says which and how far: "Repeating Psalm 23:1–3 · 2 of 3"
   (in place of the recording's source, which comes back when the loop ends). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioPlayerBar } from './AudioPlayerBar.jsx';

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
const tick = (t) => act(() => { const el = FakeAudio.last; el.duration = 600; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'one:a': [['idA', 'B']] };
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  for (const k of ['Audio', 'AUDIO_MANIFEST', '__votAudioArbiter']) delete globalThis[k];
  localStorage.removeItem('vot-audio-pos');
});

describe('the bar while a passage repeats', () => {
  it('names the passage and the pass in place of the source, and gives the source back after', () => {
    const view = render(<AudioPlayerBar />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'a', title: 'A' }, collectionLabel: 'Volume One' }); });
    tick(5);
    const bar = view.container;
    expect(bar.querySelector('.audio-bar-loop')).toBeNull();
    act(() => { AudioPlayer.setLoop({ start: 40, end: 60, times: 3, label: 'Psalm 23:1–3' }); });
    expect(bar.querySelector('.audio-bar-loop').textContent).toBe('Repeating Psalm 23:1–3 · 1 of 3');
    expect(bar.querySelector('.audio-bar-src')).toBeNull();
    tick(60);
    expect(bar.querySelector('.audio-bar-loop').textContent).toBe('Repeating Psalm 23:1–3 · 2 of 3');
    act(() => { AudioPlayer.clearLoop(); });
    expect(bar.querySelector('.audio-bar-loop')).toBeNull();
    expect(bar.querySelector('.audio-bar-src').textContent).toContain('Volume One');
  });
});
