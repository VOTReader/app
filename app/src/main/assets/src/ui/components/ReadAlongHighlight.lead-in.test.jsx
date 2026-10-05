// @ts-nocheck — the ReadAlongHighlight harness (real AudioPlayer, fake media element), with a heading on the page.
/* THE HEADER NEVER LIGHTS (Corbin 2026-10-05: "No longer highlight top portion, e.g. 'Volume 3, Letter 24, & title.'
   During listening"). Supersedes listening item 1 (2026-09-22), which washed the title (a letter) or the
   "Book · Chapter N" line (a Bible chapter) while the recording's intro announced it.
   ═══════════════════════════════════════════════════════════════════════
   Every recording opens before its first timed row: the reader saying the collection and the title (median 17.4 s
   over 750 letters), a narrator saying "Psalm 23". Through all of it the page stays unwashed; the wash starts on the
   first body clause, and seeking back into the intro clears it. The hosts render the real hero markup around the
   body, and no host hands the component a heading any more (the source guard at the end). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { readFileSync, readdirSync } from 'fs';
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
function LetterHost({ readAlongOn = true }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <header className="hero"><div className="hero-eyebrow">{'Volume Three  ·  Letter 24'}</div><h1 className="hero-title">{TITLE}</h1></header>
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey('a-word-of-warning', 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey('a-word-of-warning', 1)}>{BLOCK1}</p>
      </div>
      <ReadAlongHighlight volKey="one" letterId="a-word-of-warning" mainRef={mainRef}
        hlKeyFn={letterHlKey} readAlongOn={readAlongOn} readAlongFollow={false} />
    </div>
  );
}

/** A chapter page the way BibleChapterView builds it: the "Book · Chapter N" line is what the narrator says first. */
function BibleHost({ bookId, chapter, verses }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <header className="hero"><div className="hero-eyebrow">{`Psalms \u00a0·\u00a0 Chapter ${chapter}`}</div></header>
      <div className="chapter-body" ref={mainRef}>
        {verses.map((n) => <span key={n} data-hl-key={`bible:${bookId}:${chapter}:${n}`}>{`Verse ${n} of ${bookId} ${chapter}.`}</span>)}
      </div>
      <ReadAlongHighlight volKey="bible-wop-nkjv" letterId={bookId} chapter={chapter} mainRef={mainRef}
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

describe('the header never lights: the wash starts at the body', () => {
  it('a letter stays unwashed through the intro, then lights the first clause at its row', () => {
    render(<LetterHost />);
    playLetter();
    expect(painted(), 'at 0 s the voice is on the title: nothing painted').toBeNull();
    clockTo(9);
    expect(painted(), 'still the intro at 9 s: nothing painted').toBeNull();
    clockTo(14);
    expect(painted(), 'the first clause lights at its row').toBe('Thus says The Lord');
  });

  it('seeking back into the intro clears the wash, never moves it to the title', () => {
    render(<LetterHost />);
    playLetter();
    clockTo(16);
    expect(painted()).toBe(' to everyone who hears.');
    clockTo(3);
    expect(painted()).toBeNull();
  });

  it('the second part of a two-part letter stays dark until its own first row', () => {
    render(<LetterHost />);
    playLetter();
    act(() => { AudioPlayer.next(); });
    clockTo(1);
    expect(painted()).toBeNull();
    clockTo(5);
    expect(painted()).toBe(BLOCK1);
  });

  it('nothing lights with the wash switched off', () => {
    render(<LetterHost readAlongOn={false} />);
    playLetter();
    clockTo(14);
    expect(painted()).toBeNull();
  });

  it('a Bible chapter keeps its "Book · Chapter N" line dark while the narrator announces it', () => {
    const first = WOP.psalms[23].find((cs) => cs > 0) / 100;       // the real WOP Psalm 23, verse 1 onset
    expect(first, 'the fixture needs a real intro').toBeGreaterThan(1);
    render(<BibleHost bookId="psalms" chapter={23} verses={[1, 2, 3]} />);
    act(() => { AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId: 'psalms', label: 'NKJV · Dramatized', chapterNum: 23 }); });
    clockTo(first - 1);
    expect(painted()).toBeNull();
    clockTo(first + 0.5);
    expect(painted()).toBe('Verse 1 of psalms 23.');
  });

  it('source guard: no reading screen hands the read-along its heading (leadRef is gone)', () => {
    const screens = join(HERE, '..', 'screens');
    const hosts = readdirSync(screens).filter((f) => f.endsWith('.jsx') && !f.includes('.test.'))
      .filter((f) => readFileSync(join(screens, f), 'utf8').includes('<ReadAlongHighlight'));
    expect(hosts.length, 'the read-along hosts were found').toBeGreaterThanOrEqual(4);
    for (const f of hosts) expect(readFileSync(join(screens, f), 'utf8'), f).not.toMatch(/leadRef/);
    expect(readFileSync(join(HERE, 'ReadAlongHighlight.jsx'), 'utf8')).not.toMatch(/leadRef|_paintLead/);
  });
});
