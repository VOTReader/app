// @ts-nocheck — the ReadAlongHighlight harness (real AudioPlayer, fake media element).
/* LISTEN FROM HERE — the mechanism (listening item 7, 2026-09-22).
   ═══════════════════════════════════════════════════════════════════════
   A reader halfway down a long letter who wants to listen from the paragraph in front of them had to scroll
   to the hero, press Listen (the follow-scroll then takes the page to the start or the saved place), scroll
   back and tap. The live reading screen's ReadAlongHighlight now registers window.__votListenFrom while its
   host hands it `onListen` (the hero pill's own action, so only a unit with a recording offers it):
     has(hlKey)          - is this block part of the unit on screen?
     start(hlKey, off)   - play this unit from the clause holding `off` in that block: start it through the
                           host's own Listen if it is not the loaded track, seek once its timings land, resume
                           if it was paused; the follow-scroll stands down while the voice gets there (the
                           reader is already looking at the place).
   The selection toolbar's button (after the mockup round) is a caller of this; this file pins the mechanism. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { letterHlKey } from '../../utils/hl-keys.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

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
class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }
const REAL_CSS = globalThis.CSS;
const REAL_RAF = globalThis.requestAnimationFrame;
const REAL_CAF = globalThis.cancelAnimationFrame;

const ID = 'a-long-letter';
const BLOCK0 = 'The first paragraph is here.';
const BLOCK1 = 'Second paragraph, first clause. Second paragraph, second clause.';   // clause 2 starts at offset 32
const MANIFEST = { ['one:' + ID]: [['idLong', 'B']] };
const SYNC = { ['one:' + ID]: [[12.0, 0, 0, 28, 0], [30.0, 1, 0, 31, 0], [36.5, 1, 32, 64, 0]] };

function Host({ withListen = true, onListenSpy }) {
  const mainRef = React.useRef(null);
  const onListen = React.useCallback(() => {
    if (onListenSpy) onListenSpy();
    AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' });
  }, [onListenSpy]);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey(ID, 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey(ID, 1)}>{BLOCK1}</p>
      </div>
      <ReadAlongHighlight volKey="one" letterId={ID} mainRef={mainRef} hlKeyFn={letterHlKey}
        readAlongOn readAlongFollow={false} onListen={withListen ? onListen : undefined} />
    </div>
  );
}
const tick = (t) => act(() => { const el = FakeAudio.last; el.duration = 600; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
const LF = () => globalThis.__votListenFrom;

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_SYNC = SYNC;
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  globalThis.Highlight = FakeHighlight;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  globalThis.requestAnimationFrame = REAL_RAF;
  globalThis.cancelAnimationFrame = REAL_CAF;
  delete globalThis.Highlight; delete globalThis.Audio;
  delete globalThis.AUDIO_MANIFEST; delete globalThis.AUDIO_SYNC;
  localStorage.removeItem('vot-audio-pos');
});

describe('window.__votListenFrom: play the unit on screen from a chosen clause', () => {
  it('knows its own blocks, and only while the host offers a recording', () => {
    const view = render(<Host />);
    expect(LF().has(letterHlKey(ID, 1))).toBe(true);
    expect(LF().has('letter:some-other-letter:1')).toBe(false);
    view.unmount();
    expect(globalThis.__votListenFrom == null || !globalThis.__votListenFrom.has(letterHlKey(ID, 1))).toBe(true);
    render(<Host withListen={false} />);
    expect(globalThis.__votListenFrom == null || !globalThis.__votListenFrom.has(letterHlKey(ID, 1))).toBe(true);
  });

  it('nothing playing: starts the unit through the host\'s own Listen, then lands on the clause holding the offset', () => {
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    act(() => { expect(LF().start(letterHlKey(ID, 1), 40)).toBe(true); });
    expect(spy).toHaveBeenCalledTimes(1);
    // the track loaded inside start(); its timings were in memory, so the landing applied at once
    expect(AudioPlayer.getState().time, 'the second clause of paragraph 2').toBe(36.5);
  });

  it('the unit already playing: seeks straight there, the host\'s Listen is not called again', () => {
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    tick(13);
    act(() => { LF().start(letterHlKey(ID, 1), 3); });
    expect(spy).not.toHaveBeenCalled();
    expect(AudioPlayer.getState().time).toBe(30);
  });

  it('paused on this unit: seeks and resumes', () => {
    render(<Host />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    tick(13);
    act(() => { AudioPlayer.toggle(); });
    expect(AudioPlayer.getState().status).toBe('paused');
    act(() => { LF().start(letterHlKey(ID, 0), 0); });
    expect(AudioPlayer.getState().time).toBe(12);
    expect(AudioPlayer.getState().status).toBe('playing');
  });

  it('a block with no timed clause falls forward to the next timed one', () => {
    globalThis.AUDIO_SYNC = { ['one:' + ID]: [[30.0, 1, 0, 31, 0], [36.5, 1, 32, 64, 0]] };   // paragraph 1 untimed
    render(<Host />);
    act(() => { LF().start(letterHlKey(ID, 0), 5); });
    expect(AudioPlayer.getState().time).toBe(30);
  });
});
