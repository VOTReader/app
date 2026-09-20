// @ts-nocheck — the bible-tap harness (real AudioPlayer, fake media element), pointed at a WTLB compilation.
/* THE WASH CROSSES LETTER BOUNDARIES INSIDE ONE FILE (2026-09-20). A WTLB Part is one recording of many
   entries (AUDIO_SECTIONS); its timeline AUDIO_SYNC_SECTIONS[assetId][letterKey] carries each entry's rows on
   the FILE's clock. The entry on screen is "loaded" while the clock sits inside its span (the player's
   sectionLetterKeyAt), its rows come from the section table, and everything downstream — paint, tap-to-seek,
   seekTo — is the code the per-entry recordings already run. Another entry's page paints nothing. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

/* The two-asset fixture the align lane ships for this shape (tools/fixtures/audio-sync-sections.fixture.js,
   d-wtlb-sections 49d12d65) — inlined so this suite is green on this branch alone. Asset 1 = Part 1: three
   letters, first row 4.2 s (intro silence), the intro's first row the Format-B sentinel. Asset 2 = Section 1:
   wtlb2:i-am-the-lord-s is ABSENT between two present letters; the last letter has ONE row to the file's end. */
const SECTIONS_FIXTURE = {
  '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g': {
    'wtlb1:introduction': [[4.2, 0, -1, -1, 0], [5.31, 0, 30, 50, 0], [6.97, 0, 58, 91, 0], [12.66, 0, 99, 131, 0]],
    'wtlb1:come-love-awaits-you': [[61.0, 0, 0, 54, 0], [66.16, 1, 0, 40, 0], [69.32, 1, 42, 82, 0], [72.5, 2, 0, 33, 0]],
    'wtlb1:crowning-glory': [[118.5, 0, 0, 40, 0], [121.7, 1, 0, 50, 0], [125.34, 1, 52, 90, 0]],
  },
  '1xFRVnuKEBAjhk3ccHkl6nWkJFv7zo7rL': {
    'wtlb2:introduction': [[3.0, 0, 2, 18, 0], [4.51, 0, 24, 32, 0], [5.66, 1, 1, 21, 0]],
    'wtlb2:the-bridegroom-approaches': [[90.0, 0, -1, -1, 0], [94.34, 0, 35, 197, 0], [106.0, 0, 198, 222, 0]],
    'wtlb2:the-only-way': [[150.25, 0, 0, 40, 0]],
  },
};
const SECTIONS_MANIFEST = {
  wtlb1: [['Part 1 · Intro–19', '1U0xmOIDAo6Q99aZMeKh-3CYVDninq62g', 'V'], ['Part 2 · 20–39', '1LTCwtvaNo8aqhyYBltky8cwfmVFe46su', 'V']],
  wtlb2: [['Section 1 · Intro–28', '1xFRVnuKEBAjhk3ccHkl6nWkJFv7zo7rL', 'V']],
};

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
const REAL_CSS = globalThis.CSS;
const REAL_RAF = globalThis.requestAnimationFrame;
const REAL_CAF = globalThis.cancelAnimationFrame;
const wtlbHlKey = (id, pi) => 'wtlb:' + id + ':' + pi;

/** A WTLB entry page: paragraphs 0..n keyed the way WtlbEntryView keys them (no Format-B offset map: offsets used as-is). */
function EntryHost({ entryId, paras }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>
        {paras.map((n) => <p key={n} data-hl-key={wtlbHlKey(entryId, n)}>{`Paragraph ${n} of ${entryId}, words enough to carry a clause or two here.`}</p>)}
      </div>
      <ReadAlongHighlight volKey="wtlb1" letterId={entryId} mainRef={mainRef} hlKeyFn={wtlbHlKey} readAlongOn readAlongFollow={false} />
    </div>
  );
}
const clockTo = (t) => act(() => { const el = FakeAudio.last; el.duration = 7200; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
const caretInPara = (n) => {
  const block = document.querySelectorAll('[data-hl-key]')[n];
  document.caretRangeFromPoint = () => ({ startContainer: block.firstChild, startOffset: 3 });
};
const tap = () => {
  const el = document.querySelector('.letter-body');
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
  fireEvent.click(el, { clientX: 10, clientY: 10 });
};

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = {};
  globalThis.AUDIO_SECTIONS = SECTIONS_MANIFEST;
  globalThis.AUDIO_SYNC_SECTIONS = SECTIONS_FIXTURE;
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
  delete globalThis.AUDIO_MANIFEST; delete globalThis.AUDIO_SECTIONS; delete globalThis.AUDIO_SYNC_SECTIONS;
  delete document.caretRangeFromPoint;
  localStorage.removeItem('vot-audio-pos');
});

describe('a WTLB compilation on an entry page', () => {
  it('tap-to-seek works on the entry the clock is inside: a tap on paragraph 1 seeks to its own onset on the FILE clock', () => {
    render(<EntryHost entryId="come-love-awaits-you" paras={[0, 1, 2]} />);
    act(() => { AudioPlayer.playSection('wtlb1', 0, 'Words To Live By: Part One'); });
    clockTo(63);                                            // inside come-love-awaits-you (61.0 .. 118.5)
    caretInPara(1); tap();
    expect(AudioPlayer.getState().time).toBe(66.16);
  });

  it('another entry of the same Part paints and seeks nothing while the clock is elsewhere', () => {
    render(<EntryHost entryId="crowning-glory" paras={[0, 1]} />);
    act(() => { AudioPlayer.playSection('wtlb1', 0, 'Words To Live By: Part One'); });
    clockTo(63);
    caretInPara(1); tap();
    expect(AudioPlayer.getState().time).toBe(63);
  });

  it('the wash paints the clause under the clock with the entry\'s own hl-key', () => {
    render(<EntryHost entryId="come-love-awaits-you" paras={[0, 1, 2]} />);
    act(() => { AudioPlayer.playSection('wtlb1', 0, 'Words To Live By: Part One'); });
    clockTo(67);                                            // row [66.16, 1, 0, 40]: paragraph 1
    const hl = globalThis.CSS.highlights.get('vot-reading');
    expect(hl, 'a wash is registered').toBeTruthy();
    const host = hl.ranges[0].startContainer;
    const block = (host.nodeType === 3 ? host.parentElement : host).closest('[data-hl-key]');
    expect(block.getAttribute('data-hl-key')).toBe('wtlb:come-love-awaits-you:1');
  });
});
