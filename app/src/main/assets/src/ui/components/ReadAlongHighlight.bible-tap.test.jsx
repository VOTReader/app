// @ts-nocheck — evaluates the generated manifest and the WOP timing table via node fs, as
// utils/audio-track.hide.test.js does; drives the REAL AudioPlayer through a fake media element.
/* TAP-TO-SEEK ON THE DRAMATIZED NKJV — the three-chapter pin (the Orchestrator's item 8, 2026-09-13).
   ═══════════════════════════════════════════════════════════════════════
   The Data Builder's pre-registration said "a trusted tap on a TIMED WOP verse already seeks to
   its onset in the app as built", written against "the Web Builder's tap-to-seek note
   (audio-player.js ~:778-822)". Read the code: audio-player.js has NO such gate — that region is
   _start(), and seek() clamps to the duration and nothing else. The tap has exactly one gate,
   in ReadAlongHighlight's click handler: `fragmentAtPoint` answers -1 for text that shipped no
   timing, and the handler stays silent. No edition is excluded anywhere. So the sentence is
   true, and this file pins it against the REAL shipped table rather than a fixture:

     genesis 1   WOP carries it (31 timed slots, c52) — a tap on a verse seeks to that verse's
                 own centiseconds from the table
     joshua 1    WOP carried no Joshua until c58 (32 of 66 books at c52; every book since) —
                 the untimed-BOOK leg removes it from its per-case copy, the way numbers 9
                 removes a slot: the tap does nothing; the clock does not move
     numbers 9   WOP carries it whole today (23 slots, no zero) — the file's own census says so
                 below — so the untimed leg zeroes verse 5 DELIBERATELY: the tap on 5 is silent
                 while the tap on 4 still seeks. A fixture no release could produce would be a
                 world that does not exist; this one is c52's world with one slot removed.

   Same harness as ReadAlongHighlight.test.jsx's Bible describe: jsdom has neither layout nor
   caretRangeFromPoint, so the caret API is stubbed to answer with a chosen (node, offset) —
   everything AFTER the caret (offset mapping, fragment lookup, the guard, the seek) is real. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AudioPlayer } from '../../utils/audio-player.js';
import { ReadAlongHighlight } from './ReadAlongHighlight.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', '..', 'data');
/* The manifest is a classic script (var + an expanding loop): evaluate the REAL file. */
const manifestCtx = {};
new Function('ctx', `with (ctx) { ${readFileSync(join(DATA, 'bible-audio-manifest.js'), 'utf8')}; ctx.M = BIBLE_AUDIO_MANIFEST; ctx.B = BIBLE_AUDIO_BOOKS; }`)(manifestCtx);
/* The WOP table too — `var BIBLE_SYNC_WOP_NKJV = {...}`, loaded lazily in the app. */
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
const BOX = { top: 0, bottom: 800, height: 800, left: 0, right: 400, width: 400, x: 0, y: 0 };

/** A chapter page: verses 1..n as the Bible screens key them. */
function BibleHost({ bookId, chapter, verses }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <div className="chapter-body" ref={mainRef}>
        {verses.map((n) => <span key={n} data-hl-key={`bible:${bookId}:${chapter}:${n}`}>{`Verse ${n} of ${bookId} ${chapter}, some words to tap on.`}</span>)}
      </div>
      <ReadAlongHighlight volKey="bible-wop-nkjv" letterId={bookId} chapter={chapter} mainRef={mainRef}
        hlKeyFn={(b, n) => `bible:${b}:${chapter}:${n}`} readAlongOn readAlongFollow={false} />
    </div>
  );
}
const mount = (bookId, chapter, verses) => {
  const out = render(<BibleHost bookId={bookId} chapter={chapter} verses={verses} />);
  const scroller = out.container.querySelector('.screen-scroll');
  scroller.getBoundingClientRect = () => BOX;
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  return out;
};
const playChapter = (bookId, chapterNum) => act(() => {
  AudioPlayer.playBibleBook({ volKey: 'bible-wop-nkjv', bookId, label: 'NKJV · Dramatized', chapterNum });
});
const clockTo = (t) => act(() => { const el = FakeAudio.last; el.duration = 600; el.currentTime = t; el.dispatchEvent(new Event('timeupdate')); });
/** Point the caret API inside the block for verse `n` (blocks are in verse order). */
const caretInVerse = (n, verses) => {
  const block = document.querySelectorAll('[data-hl-key]')[verses.indexOf(n)];
  document.caretRangeFromPoint = () => ({ startContainer: block.firstChild, startOffset: 3 });
};
/* A silent tap and a tap whose handler THREW read the same to the clock (bite 2026-09-13: with the
   untimed guard gone, `frags[-1][0]` threw inside the listener and every leg stayed green). jsdom
   reports a listener's exception as a window error event; the legs count them. */
const errors = [];
const onWindowError = (e) => { errors.push(String(e && (e.message || e.error || e))); e.preventDefault(); };
const tap = () => {
  const el = document.querySelector('.chapter-body');
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
  fireEvent.click(el, { clientX: 10, clientY: 10 });
};

beforeEach(() => {
  errors.length = 0;
  window.addEventListener('error', onWindowError);
  globalThis.Audio = FakeAudio;
  globalThis.BIBLE_AUDIO_MANIFEST = manifestCtx.M;
  globalThis.BIBLE_AUDIO_BOOKS = manifestCtx.B;
  // A copy per case: the untimed leg edits one slot and must not leak it.
  globalThis.BIBLE_SYNC_WOP_NKJV = JSON.parse(JSON.stringify(WOP));
  Object.defineProperty(globalThis, 'CSS', { value: { highlights: new Map() }, writable: true, configurable: true });
  globalThis.Highlight = FakeHighlight;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});
afterEach(() => {
  window.removeEventListener('error', onWindowError);
  cleanup();
  AudioPlayer.stop();
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  globalThis.requestAnimationFrame = REAL_RAF;
  globalThis.cancelAnimationFrame = REAL_CAF;
  delete globalThis.Highlight; delete globalThis.Audio;
  delete globalThis.BIBLE_AUDIO_MANIFEST; delete globalThis.BIBLE_AUDIO_BOOKS; delete globalThis.BIBLE_SYNC_WOP_NKJV;
  delete document.caretRangeFromPoint;
  localStorage.removeItem('vot-audio-pos');
});

describe('tap-to-seek on the dramatized NKJV — the c52 table, three chapters', () => {
  it('the table today: genesis 1 and numbers 9 timed whole, all 66 books (the census the legs below rest on)', () => {
    expect(WOP.genesis[1]).toHaveLength(31);
    expect(WOP.genesis[1].filter((cs) => !cs)).toEqual([]);
    expect(WOP.numbers[9]).toHaveLength(23);
    expect(WOP.numbers[9].filter((cs) => !cs)).toEqual([]);        // no untimed slot to tap today
    expect(Object.keys(WOP)).toHaveLength(66);                      // c58: no untimed BOOK to tap today either
    expect(WOP.joshua[1]).toHaveLength(18);
    expect(manifestCtx.M['bible-wop-nkjv:joshua'], 'the RECORDING exists').toBeTruthy();
  });

  it('genesis 1: a tap on verse 2 seeks to verse 2\'s own onset from the table', () => {
    const verses = [1, 2, 3];
    mount('genesis', 1, verses); playChapter('genesis', 1); clockTo(1);
    caretInVerse(2, verses); tap();
    expect(AudioPlayer.getState().time).toBe(WOP.genesis[1][1] / 100);
    expect(AudioPlayer.getState().time).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });

  it('joshua 1: the recording plays, no timings ship, a tap moves nothing', () => {
    const verses = [1, 2, 3];
    delete globalThis.BIBLE_SYNC_WOP_NKJV.joshua;                   // the book untimed, deliberately (c52's world)
    mount('joshua', 1, verses); playChapter('joshua', 1); clockTo(7);
    expect(AudioPlayer.getState().status).not.toBe('idle');
    caretInVerse(2, verses); tap();
    expect(AudioPlayer.getState().time).toBe(7);
    expect(errors).toEqual([]);
  });

  it('numbers 9: a slot the belt could not prove is silent under the tap while its neighbour seeks', () => {
    const verses = [3, 4, 5, 6];
    globalThis.BIBLE_SYNC_WOP_NKJV.numbers[9][4] = 0;              // verse 5 unproven, deliberately
    mount('numbers', 9, verses); playChapter('numbers', 9); clockTo(2);
    caretInVerse(5, verses); tap();
    expect(AudioPlayer.getState().time).toBe(2);                    // silent: no fragment under the point
    expect(errors, 'silent, not crashed').toEqual([]);
    caretInVerse(4, verses); tap();
    expect(AudioPlayer.getState().time).toBe(WOP.numbers[9][3] / 100);
  });
});
