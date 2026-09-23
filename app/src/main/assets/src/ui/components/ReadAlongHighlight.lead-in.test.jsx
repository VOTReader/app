// @ts-nocheck — the ReadAlongHighlight harness (real AudioPlayer, fake media element), with a heading on the page.
/* THE HEADING LIGHTS WHILE IT IS READ (listening item 1, 2026-09-22).
   ═══════════════════════════════════════════════════════════════════════
   Every recording opens before its first timed row: a letter's intro sting, then the reader saying the
   collection and the title (the shipped timings put the first row at a median 17.4 s over 750 letters,
   731 of them dark for more than 10 s); a Bible chapter's narrator saying "Psalm 23" (WEB median 6.5 s).
   The page used to stay dark through all of it, which reads as a broken read-along (the 2026-09-22 walk
   filed exactly that against a letter that was fine). A host now hands the component the element the
   voice is on before the body starts (`leadRef`: a letter's title, a chapter's "Book · Chapter N" line),
   and the wash sits there until the first row takes over.

   What must NOT light it: a later part of a multi-part letter (its own lead-in is not the title), the
   wash switched off, a host that names no heading, and a WTLB compilation's entry page (the file's own
   intro belongs to no entry; an entry is loaded only once the clock is inside its span). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AudioPlayer } from '../../utils/audio-player.js';
import { letterHlKey } from '../../utils/hl-keys.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', '..', 'data');
/* The real Bible manifest (a classic script with an expanding loop) and the real WOP table. */
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

const TITLE = 'A Word of Warning';
const BLOCK0 = 'Thus says The Lord to everyone who hears.';
const BLOCK1 = 'If anyone adds to these words.';
/* Two parts: part 0 starts reading at 13.5 s (the letter's real lead-in), part 1 at 4 s. */
const MANIFEST = { 'one:a-word-of-warning': [['partA', 'B'], ['partB', 'B']] };
const SYNC = {
  'one:a-word-of-warning': [
    [13.49, 0, 0, 18, 0],
    [15.14, 0, 18, 41, 0],
    [20.0, 1, 0, 30, 0],
    [4.0, 1, 0, 30, 1],
  ],
};

/** A letter page the way LetterView builds it: the hero title outside the body, the blocks inside. */
function LetterHost({ lead = true, readAlongOn = true }) {
  const mainRef = React.useRef(null);
  const leadRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <header className="hero"><h1 className="hero-title" ref={leadRef}>{TITLE}</h1></header>
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey('a-word-of-warning', 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey('a-word-of-warning', 1)}>{BLOCK1}</p>
      </div>
      <ReadAlongHighlight volKey="one" letterId="a-word-of-warning" mainRef={mainRef} leadRef={lead ? leadRef : undefined}
        hlKeyFn={letterHlKey} readAlongOn={readAlongOn} readAlongFollow={false} />
    </div>
  );
}

/** A chapter page the way BibleChapterView builds it: the "Book · Chapter N" line is what the narrator says first. */
function BibleHost({ bookId, chapter, verses }) {
  const mainRef = React.useRef(null);
  const leadRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <header className="hero"><div className="hero-eyebrow" ref={leadRef}>{`Psalms  ·  Chapter ${chapter}`}</div></header>
      <div className="chapter-body" ref={mainRef}>
        {verses.map((n) => <span key={n} data-hl-key={`bible:${bookId}:${chapter}:${n}`}>{`Verse ${n} of ${bookId} ${chapter}.`}</span>)}
      </div>
      <ReadAlongHighlight volKey="bible-wop-nkjv" letterId={bookId} chapter={chapter} mainRef={mainRef} leadRef={leadRef}
        hlKeyFn={(b, n) => `bible:${b}:${chapter}:${n}`} readAlongOn readAlongFollow={false} />
    </div>
  );
}

const playLetter = () => act(() => {
  AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'a-word-of-warning', title: TITLE }, collectionLabel: 'Volume One' });
});
const clockTo = (t) => act(() => { const el = FakeAudio.last; el.duration = 600; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
/** The text under the wash, or null when nothing is painted. */
const painted = () => {
  const h = globalThis.CSS.highlights.get('vot-reading');
  return h ? String(h.ranges[0]) : null;
};

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_SYNC = SYNC;
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
  delete globalThis.AUDIO_MANIFEST; delete globalThis.AUDIO_SYNC;
  delete globalThis.BIBLE_AUDIO_MANIFEST; delete globalThis.BIBLE_AUDIO_BOOKS; delete globalThis.BIBLE_SYNC_WOP_NKJV;
  localStorage.removeItem('vot-audio-pos');
});

describe('the lead-in: the heading is washed until the first timed row', () => {
  it('a letter lights its title from the first moment, then hands over to the first clause', () => {
    render(<LetterHost />);
    playLetter();
    expect(painted(), 'at 0 s the voice is on the title').toBe(TITLE);
    clockTo(9);
    expect(painted(), 'still reading the title at 9 s').toBe(TITLE);
    clockTo(14);
    expect(painted(), 'the first clause takes over at its row').toBe('Thus says The Lord');
  });

  it('seeking back into the lead-in lights the title again', () => {
    render(<LetterHost />);
    playLetter();
    clockTo(16);
    expect(painted()).toBe(' to everyone who hears.');
    clockTo(3);
    expect(painted()).toBe(TITLE);
  });

  it('the second part of a two-part letter keeps its own lead-in dark', () => {
    render(<LetterHost />);
    playLetter();
    act(() => { AudioPlayer.next(); });
    clockTo(1);
    expect(painted(), 'part 2 opens on no title').toBeNull();
    clockTo(5);
    expect(painted()).toBe(BLOCK1);
  });

  it('nothing lights with the wash switched off, lead-in or not', () => {
    render(<LetterHost readAlongOn={false} />);
    playLetter();
    clockTo(3);
    expect(painted()).toBeNull();
  });

  it('a host that names no heading keeps the old dark lead-in', () => {
    render(<LetterHost lead={false} />);
    playLetter();
    clockTo(3);
    expect(painted()).toBeNull();
    clockTo(14);
    expect(painted()).toBe('Thus says The Lord');
  });

  it('a Bible chapter lights its "Book · Chapter N" line while the narrator announces it', () => {
    const first = WOP.psalms[23].find((cs) => cs > 0) / 100;       // the real WOP Psalm 23, verse 1 onset
    expect(first, 'the fixture needs a real lead-in').toBeGreaterThan(1);
    render(<BibleHost bookId="psalms" chapter={23} verses={[1, 2, 3]} />);
    act(() => { AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId: 'psalms', label: 'NKJV · Dramatized', chapterNum: 23 }); });
    clockTo(first - 1);
    expect(painted()).toBe('Psalms  ·  Chapter 23');
    clockTo(first + 0.5);
    expect(painted()).toBe('Verse 1 of psalms 23.');
  });
});
