// @ts-nocheck — same harness as ReadAlongHighlight.bible-tap.test.jsx: the REAL AudioPlayer on a fake media element, the real WOP table.
/* ARRIVE AT A PLACE IN THE UNIT YOU ARE LISTENING TO, AND THE READING GOES THERE (2026-09-20).
   ═══════════════════════════════════════════════════════════════════════════════════════
   Search ("find"), a link-sidebar reference, a Scripture Web card: each lands the reader on a verse or
   a block and flashes it. When that chapter/letter IS the loaded recording, the wash used to stay wherever
   the clock was — the eye at verse 16, the voice at verse 3. `seekTo` is the hl-key of the landing place;
   ReadAlongHighlight seeks the audio to that block's first shipped fragment ONCE per landing, only while
   the unit on screen is the loaded track (frags are null otherwise, by the same gate tap-to-seek uses).
   Nothing else changes: a landing on a chapter that is not playing moves no clock. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AudioPlayer } from '../../utils/audio-player.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', '..', 'data');
const manifestCtx = {};
new Function('ctx', `with (ctx) { ${readFileSync(join(DATA, 'bible-audio-manifest.js'), 'utf8')}; ctx.M = BIBLE_AUDIO_MANIFEST; ctx.B = BIBLE_AUDIO_BOOKS; }`)(manifestCtx);
const WOP = new Function(`${readFileSync(join(DATA, 'bible-sync-wop-nkjv.js'), 'utf8')}; return BIBLE_SYNC_WOP_NKJV;`)();

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

function BibleHost({ bookId, chapter, verses, seekTo }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="chapter-body" ref={mainRef}>
        {verses.map((n) => <span key={n} data-hl-key={`bible:${bookId}:${chapter}:${n}`}>{`Verse ${n}.`}</span>)}
      </div>
      <ReadAlongHighlight volKey="bible-wop-nkjv" letterId={bookId} chapter={chapter} mainRef={mainRef}
        hlKeyFn={(b, n) => `bible:${b}:${chapter}:${n}`} readAlongOn readAlongFollow={false} seekTo={seekTo} />
    </div>
  );
}
const playChapter = (bookId, chapterNum) => act(() => {
  AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId, label: 'NKJV · Dramatized', chapterNum });
});
const clockTo = (t) => act(() => { const el = FakeAudio.last; el.duration = 600; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
const VERSES = [1, 2, 3, 4];

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.BIBLE_AUDIO_MANIFEST = manifestCtx.M;
  globalThis.BIBLE_AUDIO_BOOKS = manifestCtx.B;
  globalThis.BIBLE_SYNC_WOP_NKJV = WOP;
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
  delete globalThis.BIBLE_AUDIO_MANIFEST; delete globalThis.BIBLE_AUDIO_BOOKS; delete globalThis.BIBLE_SYNC_WOP_NKJV;
  localStorage.removeItem('vot-audio-pos');
});

describe('seekTo — a landing seeks the loaded recording to the landing place', () => {
  it('genesis 1 playing at 1 s, land on verse 3: the clock jumps to verse 3 own onset', () => {
    const out = render(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo={null} />);
    playChapter('genesis', 1); clockTo(1);
    act(() => { out.rerender(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo="bible:genesis:1:3" />); });
    expect(AudioPlayer.getState().time).toBe(WOP.genesis[1][2] / 100);
  });

  it('fires ONCE per landing: the clock runs on, the same seekTo does not drag it back', () => {
    const out = render(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo={null} />);
    playChapter('genesis', 1); clockTo(1);
    act(() => { out.rerender(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo="bible:genesis:1:3" />); });
    const landed = WOP.genesis[1][2] / 100;
    expect(AudioPlayer.getState().time).toBe(landed);
    clockTo(landed + 20);                                        // the reading runs on past the block
    act(() => { out.rerender(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo="bible:genesis:1:3" />); });
    expect(AudioPlayer.getState().time).toBe(landed + 20);       // the same landing does not pull it back
  });

  it('a landing set BEFORE the recording loads seeks when the table lands (Listen pressed inside the flash)', () => {
    render(<BibleHost bookId="genesis" chapter={1} verses={VERSES} seekTo="bible:genesis:1:3" />);
    playChapter('genesis', 1);
    expect(AudioPlayer.getState().time).toBe(WOP.genesis[1][2] / 100);
  });

  it('a landing on a chapter that is NOT the loaded track moves no clock', () => {
    const out = render(<BibleHost bookId="genesis" chapter={2} verses={VERSES} seekTo={null} />);
    playChapter('genesis', 1); clockTo(5);
    act(() => { out.rerender(<BibleHost bookId="genesis" chapter={2} verses={VERSES} seekTo="bible:genesis:2:3" />); });
    expect(AudioPlayer.getState().time).toBe(5);
  });

  it('a landing on an untimed verse (cs = 0) is silent, like the tap', () => {
    const table = JSON.parse(JSON.stringify(WOP)); table.numbers[9][2] = 0;   // verse 3 unproven
    globalThis.BIBLE_SYNC_WOP_NKJV = table;
    const out = render(<BibleHost bookId="numbers" chapter={9} verses={VERSES} seekTo={null} />);
    playChapter('numbers', 9); clockTo(2);
    act(() => { out.rerender(<BibleHost bookId="numbers" chapter={9} verses={VERSES} seekTo="bible:numbers:9:3" />); });
    expect(AudioPlayer.getState().time).toBe(2);
  });
});
