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
import { listenFromTarget, startListenFrom, repeatTarget } from '../../utils/listen-from.js';
import { ReadAlongHighlight, repeatSpanOf } from './ReadAlongHighlight.jsx';

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

function Host({ withListen = true, onListenSpy, readAlongOn = true, refuse = false, partTwoOnly = false, id = ID }) {
  const mainRef = React.useRef(null);
  const onListen = React.useCallback(() => {
    if (onListenSpy) onListenSpy();
    if (refuse) return;   // offline with nothing saved: a toast, nothing loads
    if (partTwoOnly) {    // a host whose Listen queues from part 2 (W62's unreachable case)
      AudioPlayer.playCollection({ volKey: 'one', items: [{ id, title: 'A Long Letter' }], collectionLabel: 'Volume One', startId: id, startPartIndex: 1 });
      return;
    }
    AudioPlayer.playLetter({ volKey: 'one', letter: { id, title: 'A Long Letter' }, collectionLabel: 'Volume One' });
  }, [onListenSpy, refuse, partTwoOnly, id]);
  return (
    <div className="screen-scroll">
      <div className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey(id, 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey(id, 1)}>{BLOCK1}</p>
      </div>
      <ReadAlongHighlight volKey="one" letterId={id} mainRef={mainRef} hlKeyFn={letterHlKey}
        readAlongOn={readAlongOn} readAlongFollow={false} onListen={withListen ? onListen : undefined} />
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

  it('a start the host refused does not hijack a later plain Listen of this unit (n1-11)', () => {
    const spy = vi.fn();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    render(<Host onListenSpy={spy} refuse />);
    act(() => { LF().start(letterHlKey(ID, 1), 40); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(AudioPlayer.getState().status).toBe('idle');
    now.mockReturnValue(1_000_000 + 60_000);   // a minute on, back online: the hero's plain Listen
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    expect(AudioPlayer.getState().time, 'from the start, not the old landing').toBe(0);
    now.mockRestore();
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

  /* Sweep v23: the place is found in the timings, and with the read-along off they are never fetched. The toolbar
     still offered Listen from here; start() could only fall back to the host's plain Listen, so the voice began at
     the top (or the resume point), and on a unit already playing it restarted it. The waiting landing then lapsed
     with no word. Turning the read-along back on offers it again. */
  it('read-along off: the toolbar gets no Listen from here to offer (sweep v23)', () => {
    const spy = vi.fn();
    const view = render(<Host onListenSpy={spy} readAlongOn={false} />);
    const block = document.querySelector('[data-hl-key="' + letterHlKey(ID, 1) + '"]');
    const sel = document.getSelection();
    const r = document.createRange();
    r.setStart(block.firstChild, 40); r.setEnd(block.firstChild, 50);
    sel.removeAllRanges(); sel.addRange(r);
    try {
      expect(listenFromTarget(sel), 'nothing to offer with the timings unfetched').toBeNull();
      act(() => { expect(startListenFrom({ hlKey: letterHlKey(ID, 1), offset: 40 })).toBe(false); });
      expect(spy).not.toHaveBeenCalled();
      expect(AudioPlayer.getState().status).toBe('idle');
      view.rerender(<Host onListenSpy={spy} />);
      expect(listenFromTarget(sel), 'offered again with the read-along on').toEqual({ hlKey: letterHlKey(ID, 1), offset: 40 });
    } finally {
      sel.removeAllRanges();
    }
  });
});

/* REPEAT THIS PASSAGE (rp1 part 3, 2026-09-25): repeat(keys, label, times) loops the selected blocks. The span is
   the first timed clause of the first block to the start of the first clause after the last block (the timing
   rows hold starts only); a passage that runs to the recording's end has no clause after it and loops at 'ended'. */
describe('repeatSpanOf: the seconds a run of blocks covers', () => {
  const rows = [[12.0, 0, 0, 28, 0], [30.0, 1, 0, 31, 0], [36.5, 1, 32, 64, 0], [50.0, 2, 0, 10, 0]];
  it('from the first clause of the first block to the first clause after the last', () => {
    expect(repeatSpanOf(rows, [letterHlKey(ID, 0), letterHlKey(ID, 1)], ID, letterHlKey)).toEqual({ start: 12, end: 50 });
    expect(repeatSpanOf(rows, [letterHlKey(ID, 1)], ID, letterHlKey)).toEqual({ start: 30, end: 50 });
  });
  it('the last block of the recording runs to its end', () => {
    expect(repeatSpanOf(rows, [letterHlKey(ID, 2)], ID, letterHlKey)).toEqual({ start: 50, end: Infinity });
  });
  it('untimed blocks inside the run are carried; a run with nothing timed is null', () => {
    expect(repeatSpanOf(rows, [letterHlKey(ID, 1), letterHlKey(ID, 7)], ID, letterHlKey)).toEqual({ start: 30, end: 50 });
    expect(repeatSpanOf(rows, [letterHlKey(ID, 7)], ID, letterHlKey)).toBeNull();
    expect(repeatSpanOf(null, [letterHlKey(ID, 1)], ID, letterHlKey)).toBeNull();
  });
});

describe('window.__votListenFrom.repeat: loop the selected blocks three times', () => {
  it('the unit playing: loops paragraph 1 alone, labelled, and resumes a paused bar', () => {
    render(<Host />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    tick(40);
    act(() => { AudioPlayer.toggle(); });
    let ok;
    act(() => { ok = LF().repeat([letterHlKey(ID, 0)], 'A Long Letter', 3); });
    expect(ok).toBe(true);
    expect(AudioPlayer.getState().time).toBe(12);
    expect(AudioPlayer.getState().loop).toMatchObject({ start: 12, end: 30, times: 3, pass: 1, label: 'A Long Letter' });
    expect(AudioPlayer.getState().status).toBe('playing');
  });

  it('nothing playing: starts through the host\'s Listen, then loops once the timings are in', () => {
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    act(() => { LF().repeat([letterHlKey(ID, 1)], 'Paragraph 2', 3); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(AudioPlayer.getState().loop).toMatchObject({ start: 30, end: Infinity, label: 'Paragraph 2' });
    expect(AudioPlayer.getState().time).toBe(30);
  });

  it('in the APK, Repeat is offered where its native player loops (ra2), and not on an older one', () => {
    window.AndroidBridge = { audioLoad() {}, audioJournal() { return ''; } };   // native audio, no loop yet
    try {
      render(<Host />);
      expect(LF().has(letterHlKey(ID, 1))).toBe(true);
      expect(LF().repeat).toBeUndefined();
      cleanup();
      window.AndroidBridge.audioLoop = () => {};
      render(<Host />);
      expect(typeof LF().repeat).toBe('function');
    } finally { delete window.AndroidBridge; }
  });

  it('no Repeat with the read-along off (the span comes from the timings it does not fetch)', () => {
    render(<Host readAlongOn={false} />);
    expect(repeatTarget([letterHlKey(ID, 1)])).toBeNull();
  });

  it('Listen from here ends a repeating passage', () => {
    render(<Host />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    tick(13);
    act(() => { LF().repeat([letterHlKey(ID, 1)], 'x', 3); });
    expect(AudioPlayer.getState().loop).not.toBeNull();
    act(() => { LF().start(letterHlKey(ID, 1), 40); });
    expect(AudioPlayer.getState().loop).toBeNull();
  });

  it('a multi-part letter: a passage in (or reaching into) a part that is not playing is refused, not half-looped', () => {
    globalThis.AUDIO_MANIFEST = { ['one:' + ID]: [['idLong1', 'B'], ['idLong2', 'B']] };
    globalThis.AUDIO_SYNC = { ['one:' + ID]: [[12.0, 0, 0, 28, 0], [3.0, 1, 0, 31, 1], [9.5, 1, 32, 64, 1]] };
    render(<Host />);
    act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
    tick(13);
    let ok;
    act(() => { ok = LF().repeat([letterHlKey(ID, 1)], 'x', 3); });
    expect(ok).toBe(false);
    act(() => { ok = LF().repeat([letterHlKey(ID, 0), letterHlKey(ID, 1)], 'x', 3); });
    expect(ok).toBe(false);
    expect(AudioPlayer.getState().loop).toBeNull();
    act(() => { ok = LF().repeat([letterHlKey(ID, 0)], 'x', 3); });
    expect(ok, 'inside the playing part it loops').toBe(true);
  });

  it('blocks that are not this unit\'s: nothing happens', () => {
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    let ok;
    act(() => { ok = LF().repeat(['letter:elsewhere:0'], 'x', 3); });
    expect(ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

/* Sweep W62 (2026-10-13): the timings in hand while a part plays are that part's alone, so a Listen from here on a
   block in the OTHER part found no clause (the bar just resumed) or fell forward to the playing part's next block (the
   wrong part). Four letters ship in parts (four:obey-god, one:christmas among them). */
describe('Listen from here in a multi-part letter lands in the part that holds the place (sweep W62)', () => {
  const twoParts = () => {
    globalThis.AUDIO_MANIFEST = { ['one:' + ID]: [['idLong1', 'B'], ['idLong2', 'B']] };
    globalThis.AUDIO_SYNC = { ['one:' + ID]: [[12.0, 0, 0, 28, 0], [3.0, 1, 0, 31, 1], [9.5, 1, 32, 64, 1]] };
  };
  const playLetter = () => act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: ID, title: 'A Long Letter' }, collectionLabel: 'Volume One' }); });
  const playing = () => { const s = AudioPlayer.getState(); return String((s.queue[s.qi] || {}).url || ''); };
  beforeEach(() => { document.getElementById('vot-repeat-toast')?.remove(); });

  it('part 1 playing, the place in part 2: moves to part 2 and lands on the clause', () => {
    twoParts();
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    playLetter();
    tick(13);
    let ok;
    act(() => { ok = LF().start(letterHlKey(ID, 1), 40); });
    expect(ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(playing()).toMatch(/idLong2/);
    expect(AudioPlayer.getState().time, 'the second clause, in part 2').toBe(9.5);
  });

  it('part 2 playing, the place in part 1: moves back to part 1, not to part 2\'s next block', () => {
    twoParts();
    render(<Host />);
    playLetter();
    tick(13);
    act(() => { AudioPlayer.playAt(1); });
    tick(4);
    expect(playing()).toMatch(/idLong2/);
    act(() => { LF().start(letterHlKey(ID, 0), 5); });
    expect(playing()).toMatch(/idLong1/);
    expect(AudioPlayer.getState().time).toBe(12);
  });

  it('nothing playing, the place in part 2: the host\'s Listen starts the letter, then it lands in part 2', () => {
    twoParts();
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    act(() => { LF().start(letterHlKey(ID, 1), 0); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(playing()).toMatch(/idLong2/);
    expect(AudioPlayer.getState().time).toBe(3);
  });

  it('a queue that starts past the part (a part-2 start): the host\'s Listen rebuilds it, then it lands in part 1', () => {
    twoParts();
    const spy = vi.fn();
    render(<Host onListenSpy={spy} />);
    act(() => { AudioPlayer.playCollection({ volKey: 'one', items: [{ id: ID, title: 'A Long Letter' }], collectionLabel: 'Volume One', startId: ID, startPartIndex: 1 }); });
    tick(4);
    expect(AudioPlayer.getState().queue.some((t) => /idLong1/.test(t.url)), 'part 1 is not queued').toBe(false);
    act(() => { LF().start(letterHlKey(ID, 0), 0); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(playing()).toMatch(/idLong1/);
    expect(AudioPlayer.getState().time).toBe(12);
  });

  it('a part even the host\'s Listen does not queue: one toast, no landing in the wrong part', () => {
    twoParts();
    const spy = vi.fn();
    render(<Host onListenSpy={spy} partTwoOnly />);
    act(() => { AudioPlayer.playCollection({ volKey: 'one', items: [{ id: ID, title: 'A Long Letter' }], collectionLabel: 'Volume One', startId: ID, startPartIndex: 1 }); });
    tick(4);
    act(() => { LF().start(letterHlKey(ID, 0), 0); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(playing()).toMatch(/idLong2/);
    expect(AudioPlayer.getState().time, 'not part 2\'s next block (3.0)').not.toBe(3);
    expect(document.getElementById('vot-repeat-toast')?.textContent).toBe('Could not start the recording at this place.');
  });

  it('a Repeat whose timings never arrive says so once its wait runs out (W62, low)', () => {
    globalThis.AUDIO_SYNC = {};   // this unit has a recording but no timings
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(<Host />);
      let ok;
      act(() => { ok = LF().repeat([letterHlKey(ID, 1)], 'x', 3); });
      expect(ok).toBe(true);
      expect(document.getElementById('vot-repeat-toast')?.textContent || '').toBe('');
      act(() => { vi.advanceTimersByTime(20_001); });
      expect(document.getElementById('vot-repeat-toast')?.textContent).toBe('This passage has no timings to repeat by.');
    } finally {
      vi.useRealTimers();
    }
  });

  // W62 refuter round 1: a Repeat armed on letter A (its start refused offline) stayed armed when the pane moved to
  // letter B, so B's play spoke A's failure: at once when B's timings landed, or when A's wait ran out.
  it.each([['with timings', true], ['without timings', false]])('a Repeat armed on one letter says nothing on the next letter the pane moves to (%s)', (_label, timed) => {
    const OTHER = 'another-letter';
    globalThis.AUDIO_MANIFEST = { ...MANIFEST, ['one:' + OTHER]: [['idOther', 'B']] };
    globalThis.AUDIO_SYNC = timed ? { ...SYNC, ['one:' + OTHER]: [[5.0, 0, 0, 28, 0]] } : { ...SYNC };
    delete globalThis.AUDIO_SYNC['one:' + ID];   // A has no timings in memory: the Repeat waits for them
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const view = render(<Host refuse />);
      act(() => { LF().repeat([letterHlKey(ID, 1)], 'x', 3); });
      view.rerender(<Host refuse id={OTHER} />);
      act(() => { AudioPlayer.playLetter({ volKey: 'one', letter: { id: OTHER, title: 'Another Letter' }, collectionLabel: 'Volume One' }); });
      act(() => { vi.advanceTimersByTime(20_001); });
      expect(document.getElementById('vot-repeat-toast')?.textContent || '').toBe('');
      expect(AudioPlayer.getState().loop || null).toBe(null);
    } finally {
      vi.useRealTimers();
    }
  });
});
