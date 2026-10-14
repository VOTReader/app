// @ts-nocheck -- drives the REAL AudioPlayer and the REAL fullscreen gesture through a fake media element.
/* DOUBLE-TAP WINS OVER TAP-TO-JUMP (ra3, Corbin 2026-10-14: "Double-tap on reading text goes
   fullscreen and wins; a single tap jumps the audio with no added wait (jump at once, and undo it
   if a second tap follows)").
   ═══════════════════════════════════════════════════════════════════════
   The two gestures share their first tap. ReadAlongHighlight seeks on that tap's click at once;
   useFullscreenGesture only knows it was the first half of a double-tap when the second tap's
   pointerup lands. So the undo is the read-along's: it keeps its last jump for one double-tap
   window, and the gesture announces itself (FULLSCREEN_GESTURE_EVENT) the moment it fires.

   Both orders are pinned. In a browser the second pointerup (the gesture) comes before the second
   click, so that click must not jump again. The other order (the second click first) must still
   land the undo where the reader was before the FIRST tap, not on the first tap's own target. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

vi.mock('../../utils/toast.js', () => ({ showToast: vi.fn() }));

import { AudioPlayer } from '../../utils/audio-player.js';
import { PlatformBridge } from '../../utils/platform-bridge.js';
import { letterHlKey } from '../../utils/hl-keys.js';
import { useFullscreenGesture } from '../../hooks/use-fullscreen-gesture.js';
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
  play() { this.paused = false; this.readyState = 4; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}
class FakeHighlight { constructor(...ranges) { this.ranges = ranges; } }

const MANIFEST = { 'vol1:letter-a': [['idA', 'B']] };
const BLOCK0 = 'Sentence one. Sentence number two.';
const BLOCK1 = 'Second block sentence.';
const SYNC = { 'vol1:letter-a': [[2, 0, 0, 14, 0], [5, 0, 14, 34, 0], [10, 1, 0, 22, 0]] };
const BOX = { top: 0, bottom: 800, height: 800, left: 0, right: 400, width: 400, x: 0, y: 0 };
const REAL_CSS = globalThis.CSS;
const REAL_RAF = globalThis.requestAnimationFrame;
const REAL_CAF = globalThis.cancelAnimationFrame;

function Gesture({ enabled }) {
  useFullscreenGesture({ enabled, hintCount: 3, onHintShown: () => {} });
  return null;
}
function Host({ gesture = true }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <Gesture enabled={gesture} />
      <main className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey('letter-a', 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey('letter-a', 1)}>{BLOCK1}</p>
      </main>
      <ReadAlongHighlight volKey="vol1" letterId="letter-a" mainRef={mainRef} hlKeyFn={letterHlKey}
        readAlongOn readAlongFollow={false} />
    </div>
  );
}
const mount = (props) => {
  const out = render(<Host {...props} />);
  const scroller = out.container.querySelector('.screen-scroll');
  scroller.getBoundingClientRect = () => BOX;
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  return out;
};
const play = () => act(() => {
  AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'A Letter' }, collectionLabel: 'Volume One' });
});
const clockTo = (t) => act(() => {
  const el = FakeAudio.last;
  el.duration = 600; el.currentTime = t;
  el.dispatchEvent(new Event('playing'));
  el.dispatchEvent(new Event('timeupdate'));
});
/** Point the caret API at a character inside block 0. */
const caretAtChar = (charOffset) => {
  const node = document.querySelectorAll('[data-hl-key]')[0].firstChild;
  document.caretRangeFromPoint = () => ({ startContainer: node, startOffset: charOffset });
};

let now;
const body = () => document.querySelector('.letter-body');
/* The gesture times taps by event.timeStamp. In the vmThreads pool jsdom stamps events from its own
   realm's clock, which the Date.now spy does not reach, so each event carries the test's clock. */
const ev = (type) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 });
  Object.defineProperty(e, 'timeStamp', { value: now });
  return e;
};
const down = () => act(() => { body().dispatchEvent(ev('pointerdown')); });
const up = () => act(() => { body().dispatchEvent(ev('pointerup')); });
const click = () => act(() => { body().dispatchEvent(ev('click')); });
/** One finger tap as a browser delivers it: pointerdown, pointerup, click. */
const tap = () => { down(); up(); click(); };
const later = (ms) => { now += ms; };

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(PlatformBridge, 'setImmersiveMode').mockImplementation(() => {});
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
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
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  globalThis.requestAnimationFrame = REAL_RAF;
  globalThis.cancelAnimationFrame = REAL_CAF;
  delete globalThis.Highlight; delete globalThis.Audio;
  delete globalThis.AUDIO_MANIFEST; delete globalThis.AUDIO_SYNC;
  delete document.caretRangeFromPoint;
  localStorage.removeItem('vot-audio-pos');
});

describe('double-tap on reading text: fullscreen wins over the audio jump (ra3)', () => {
  it('a single tap jumps the audio at once and the jump stays', () => {
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());                       // paused: the clock moves only by taps
    caretAtChar(20);                                       // inside "Sentence number two." (5 s)
    tap();
    expect(AudioPlayer.getState().time).toBe(5);           // no wait for a possible second tap
    later(1000);
    tap();                                                 // a second tap a second later is its own tap
    expect(AudioPlayer.getState().time).toBe(5);
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
  });

  it('a double tap goes fullscreen and puts the audio back where it was (paused)', () => {
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    const status = AudioPlayer.getState().status;
    caretAtChar(20);
    tap();
    expect(AudioPlayer.getState().time).toBe(5);           // the first tap jumped at once
    later(250);
    tap();
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(true);
    expect(AudioPlayer.getState().time).toBe(2);           // undone, and the second click did not jump again
    expect(AudioPlayer.getState().status).toBe(status);
  });

  it('while playing, the undo lands where the voice would have been without the tap', () => {
    mount(); play(); clockTo(2);
    expect(AudioPlayer.getState().status).toBe('playing');
    caretAtChar(20);
    tap();
    expect(AudioPlayer.getState().time).toBe(5);
    later(300);
    tap();
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(true);
    expect(AudioPlayer.getState().time).toBeCloseTo(2.3, 5);
  });

  it('the other order: the second click before the gesture still undoes to before the FIRST tap', () => {
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    caretAtChar(20);
    tap();                                                 // 2 -> 5
    later(250);
    down(); click(); up();                                 // second click jumps (5 -> 5), then the gesture fires
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(true);
    expect(AudioPlayer.getState().time).toBe(2);
  });

  it('a double tap that leaves fullscreen undoes the jump the same way', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    caretAtChar(20);
    tap(); later(200); tap();
    expect(PlatformBridge.setImmersiveMode).toHaveBeenCalledWith(false);
    expect(AudioPlayer.getState().time).toBe(2);
  });

  it('the next tap after a double tap jumps normally', () => {
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    caretAtChar(20);
    tap(); later(200); tap();
    expect(AudioPlayer.getState().time).toBe(2);
    later(800);
    tap();
    expect(AudioPlayer.getState().time).toBe(5);
  });

  it('with double-tap fullscreen switched off, both taps simply jump', () => {
    mount({ gesture: false }); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    caretAtChar(20);
    tap(); later(200); tap();
    expect(PlatformBridge.setImmersiveMode).not.toHaveBeenCalled();
    expect(AudioPlayer.getState().time).toBe(5);
  });
});
