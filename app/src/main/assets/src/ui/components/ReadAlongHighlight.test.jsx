// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element.
/* ReadAlongHighlight — the karaoke wash + its scrollTop-lease obligations.
   ─────────────────────────────────────────────────────────────────────────
   Driven against the REAL utils/audio-player.js singleton (same reasoning as
   AudioPlayerBar.test.jsx: the component's whole job is to mirror that store),
   with the two lazy-corpus globals it reads — AUDIO_MANIFEST and AUDIO_SYNC —
   installed on globalThis, which is the classic-script reality of
   src/data/audio-manifest.js and src/data/audio-sync.js.

   jsdom has neither the CSS Custom Highlight API nor layout, so:
     - CSS.highlights is a real Map and Highlight a recording stub, which is
       enough to assert WHETHER we painted and OVER WHAT;
     - the container and the Range are given explicit geometry, because the
       reading-band arithmetic is one of the things under test;
     - requestAnimationFrame is a hand-drained queue whose callbacks receive
       whatever timestamps the test chooses — the glide reads the frame
       timestamp exactly the way use-autoscroll's tick(ts) does, so no wall
       clock is involved and the assertions are exact.

   WHAT IT PINS. This component is the FIFTH writer of `.screen-scroll`'s
   scrollTop, so most of this file is the lease documented in
   hooks/use-autoscroll.js: no write while another writer is flagged, no
   write after the reader scrolls by hand, never browser-owned smooth
   scrolling, and no write at all when the follow half is switched off — while
   the PAINT, which owns nothing, keeps working through all of it. Plus the
   two pure helpers (fragment binary search, TreeWalker offset mapper) at
   their boundaries, including the one that silently returns null. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { AudioPlayer } from '../../utils/audio-player.js';
import { letterHlKey } from '../../utils/hl-keys.js';
import { ReadAlongHighlight, fragmentAt, rangeIn, offsetIn, fragmentAtPoint } from './ReadAlongHighlight.jsx';
import { formatBOffsetMap, formatBDomText } from '../../utils/format-b-dom-text.js';

/** Mimics the bits of HTMLAudioElement the player touches (see audio-player.test.js). */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = '';
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.preload = '';
    this.error = null;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const MANIFEST = { 'vol1:letter-a': [['idA', 'B']] };

/* Block 0's text is exactly 34 chars:
     "Sentence one. Sentence number two."
   so [0,14) is the first sentence and [14,34) the second. */
const BLOCK0 = 'Sentence one. Sentence number two.';
const BLOCK1 = 'Second block sentence.';
const SYNC = {
  'vol1:letter-a': [
    [2, 0, 0, 14, 0],
    [5, 0, 14, 34, 0],
    [10, 1, 0, 22, 0],
  ],
};

/* ── Fake CSS Custom Highlight API ──────────────────────────────────────── */
class FakeHighlight {
  constructor(...ranges) { this.ranges = ranges; }
}
let highlights;
const REAL_CSS = globalThis.CSS;

/* ── Hand-drained frame source ──────────────────────────────────────────── */
let rafSeq = 0;
let rafCbs;
const REAL_RAF = globalThis.requestAnimationFrame;
const REAL_CAF = globalThis.cancelAnimationFrame;
/** Run every frame callback queued right now, handing each `ts`. */
const frame = (ts) => {
  const due = [...rafCbs.values()];
  rafCbs.clear();
  act(() => { for (const cb of due) cb(ts); });
};
/** Past GLIDE_MS — the frame on which an uninterrupted glide lands. */
const GLIDE_END = 400;
/** Run a whole glide to completion. */
const runGlide = () => { frame(0); frame(GLIDE_END); };

/* ── Geometry jsdom cannot supply ───────────────────────────────────────── */
const BOX = { top: 0, bottom: 800, height: 800, left: 0, right: 400, width: 400, x: 0, y: 0 };
/** Well below the 25%–60% reading band (200–480px) → follow-scroll should fire. */
const RANGE_RECT = { top: 700, bottom: 724, height: 24, left: 0, right: 400, width: 400, x: 0, y: 700 };
/** Aim point is 35% down an 800px box = 280px, so a sentence at 700 is +420. */
const EXPECTED_SCROLL = 420;
const REAL_RANGE_RECT_FN = Range.prototype.getBoundingClientRect;

let scroller;

function Host({ readAlongOn = true, readAlongFollow = true }) {
  const mainRef = React.useRef(null);
  return (
    <div className="screen-scroll">
      <main className="letter-body" ref={mainRef}>
        <p data-hl-key={letterHlKey('letter-a', 0)}>{BLOCK0}</p>
        <p data-hl-key={letterHlKey('letter-a', 1)}>{BLOCK1}</p>
      </main>
      <ReadAlongHighlight
        volKey="vol1"
        letterId="letter-a"
        mainRef={mainRef}
        hlKeyFn={letterHlKey}
        readAlongOn={readAlongOn}
        readAlongFollow={readAlongFollow}
      />
    </div>
  );
}

/** Mount the host and give the container the geometry + a writable scrollTop. */
function mount(props) {
  const out = render(<Host {...props} />);
  scroller = out.container.querySelector('.screen-scroll');
  scroller.getBoundingClientRect = () => BOX;
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  scroller.scrollBy = vi.fn();
  scroller.scrollTo = vi.fn();
  return out;
}

/** Start this letter's track (status 'loading' already counts as active). */
const play = () => act(() => {
  AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'A Letter' }, collectionLabel: 'Volume One' });
});

/** Move the player's clock — the same whole-second tick the bar re-renders on. */
const clockTo = (t) => act(() => {
  const el = FakeAudio.last;
  el.duration = 600;
  el.currentTime = t;
  el.dispatchEvent(new Event('timeupdate'));
});

/** The text currently washed, or null when nothing is painted. */
const painted = () => {
  const h = highlights.get('vot-reading');
  return h ? String(h.ranges[0]) : null;
};

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = MANIFEST;
  globalThis.AUDIO_SYNC = SYNC;
  highlights = new Map();
  Object.defineProperty(globalThis, 'CSS', { value: { highlights }, writable: true, configurable: true });
  globalThis.Highlight = FakeHighlight;
  rafSeq = 0;
  rafCbs = new Map();
  globalThis.requestAnimationFrame = (cb) => { rafSeq += 1; rafCbs.set(rafSeq, cb); return rafSeq; };
  globalThis.cancelAnimationFrame = (id) => { rafCbs.delete(id); };
  Range.prototype.getBoundingClientRect = () => RANGE_RECT;
  document.body.className = '';
  localStorage.removeItem('vot-audio-pos');
  AudioPlayer.stop();
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  vi.restoreAllMocks();
  document.body.className = '';
  Object.defineProperty(globalThis, 'CSS', { value: REAL_CSS, writable: true, configurable: true });
  globalThis.requestAnimationFrame = REAL_RAF;
  globalThis.cancelAnimationFrame = REAL_CAF;
  if (REAL_RANGE_RECT_FN) Range.prototype.getBoundingClientRect = REAL_RANGE_RECT_FN;
  else delete Range.prototype.getBoundingClientRect;
  delete globalThis.Highlight;
  delete globalThis.AUDIO_MANIFEST;
  delete globalThis.AUDIO_SYNC;
  delete globalThis.AUDIO_ALTERNATES;
  delete globalThis.AUDIO_SYNC_ALT;
  delete globalThis.Audio;
  localStorage.removeItem('vot-audio-pos');
});

/* ═══════════════════════════════════════════════════════════════════════
   The paint
   ═══════════════════════════════════════════════════════════════════════ */
describe('ReadAlongHighlight — the sentence wash', () => {
  it('washes the sentence the voice is on, in the block that sentence lives in', () => {
    mount();
    play();
    clockTo(6);
    expect(painted()).toBe('Sentence number two.');

    clockTo(11);
    expect(painted()).toBe(BLOCK1);
  });

  it('paints nothing at all when Read-Along Highlight is off', () => {
    mount({ readAlongOn: false });
    play();
    clockTo(6);
    expect(painted()).toBeNull();
    expect(highlights.size).toBe(0);
  });

  it('paints nothing while the clock is still ahead of the first sentence', () => {
    mount();
    play();                       // clock at 0s; the first fragment starts at 2s
    expect(painted()).toBeNull();
    clockTo(3);
    expect(painted()).toBe('Sentence one. ');
  });

  it('clears the wash when playback stops, and again on unmount', () => {
    const view = mount();
    play();
    clockTo(6);
    expect(painted()).not.toBeNull();

    act(() => { AudioPlayer.stop(); });
    expect(painted()).toBeNull();

    play();
    clockTo(6);
    expect(painted()).not.toBeNull();
    view.unmount();
    expect(painted()).toBeNull();
  });

  it('paints nothing for a letter that has no alignment rows', () => {
    globalThis.AUDIO_SYNC = {};
    mount();
    play();
    clockTo(6);
    expect(painted()).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   The precise clock — the requestAnimationFrame driver
   ─────────────────────────────────────────────────────────────────────────
   The store's clock only moves on whole SECONDS, so the wash is driven from
   AudioPlayer.getPreciseTime() (the element's live currentTime) on a frame
   loop. These tests move the ELEMENT without dispatching `timeupdate`, which
   is exactly the sub-second region the store cannot see — so a paint here can
   only have come from the frame loop.
   ═══════════════════════════════════════════════════════════════════════ */
describe('ReadAlongHighlight — the frame-driven clock', () => {
  /** Advance the element alone: no timeupdate, so the store never hears it. */
  const elementTo = (t) => { FakeAudio.last.currentTime = t; };

  it('paints once per fragment CHANGE, not once per frame', () => {
    mount({ readAlongFollow: false });
    play();
    const sets = vi.spyOn(highlights, 'set');

    elementTo(6);
    frame(0);
    expect(painted()).toBe('Sentence number two.');
    expect(sets).toHaveBeenCalledTimes(1);

    frame(16); frame(32); frame(48);            // same sentence, three more frames
    expect(sets).toHaveBeenCalledTimes(1);

    elementTo(9.9);                             // the lead carries it over the 10s row
    frame(64);
    expect(painted()).toBe(BLOCK1);
    expect(sets).toHaveBeenCalledTimes(2);
  });

  it('carries the one perceptual lead, so the wash arrives a beat early', () => {
    mount({ readAlongFollow: false });
    play();
    elementTo(4.9);                             // 0.1s BEFORE the 5s onset
    frame(0);
    expect(painted()).toBe('Sentence number two.');
  });

  it('follows the voice on a sub-second boundary the store tick cannot see', () => {
    mount({ readAlongFollow: false });
    play();
    clockTo(6);                                 // store + element agree at 6s
    expect(painted()).toBe('Sentence number two.');
    elementTo(9.87);                            // mid-second: floor(9.87) === 9, no tick
    frame(0);
    expect(painted()).toBe(BLOCK1);
  });

  it('stops asking for frames when playback pauses', () => {
    mount({ readAlongFollow: false });
    play();
    elementTo(6);
    frame(0);
    expect(rafCbs.size).toBe(1);                // the loop re-armed itself

    act(() => { AudioPlayer.toggle(); });        // pause
    expect(rafCbs.size).toBe(0);                // the pending frame was cancelled

    const sets = vi.spyOn(highlights, 'set');
    elementTo(11);
    frame(100);
    expect(sets).not.toHaveBeenCalled();
  });

  it('stops asking for frames on unmount', () => {
    const view = mount({ readAlongFollow: false });
    play();
    elementTo(6);
    frame(0);
    expect(rafCbs.size).toBe(1);
    view.unmount();
    expect(rafCbs.size).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   One timeline per RECORDING (the alternates guard)
   ═══════════════════════════════════════════════════════════════════════ */
describe('ReadAlongHighlight — alignment belongs to the asset, not the letter', () => {
  const ALT_ASSET = 'idAlt';

  /** Start reader T's separate reading of the same letter. */
  const playAlt = () => act(() => {
    AudioPlayer.playLetter({
      volKey: 'vol1', letter: { id: 'letter-a', title: 'A Letter' },
      collectionLabel: 'Volume One', reader: 'T',
    });
  });

  beforeEach(() => { globalThis.AUDIO_ALTERNATES = { 'vol1:letter-a': [['T', [[ALT_ASSET]]]] }; });

  it('paints NOTHING over an alternate rendition that has no timeline of its own', () => {
    mount();
    playAlt();
    expect(AudioPlayer.getState().queue[0].url).toContain(ALT_ASSET);
    clockTo(6);
    expect(painted()).toBeNull();               // the primary's timing is not this reading's
  });

  it('paints an aligned alternate from its own per-asset rows', () => {
    globalThis.AUDIO_SYNC_ALT = { [ALT_ASSET]: [[1, 0, 0, 14, 0], [4, 0, 14, 34, 0]] };
    mount();
    playAlt();
    clockTo(2);
    expect(painted()).toBe('Sentence one. ');
    clockTo(6);
    expect(painted()).toBe('Sentence number two.');
  });

  it('still paints the primary reading, which the manifest vouches for', () => {
    mount();
    play();
    clockTo(6);
    expect(painted()).toBe('Sentence number two.');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   The scrollTop lease (hooks/use-autoscroll.js's writer contract)
   ═══════════════════════════════════════════════════════════════════════ */
describe('ReadAlongHighlight — follow-scroll obeys the scrollTop lease', () => {
  /** Advance to a new sentence, then run the glide it schedules. */
  const followOnce = () => { play(); clockTo(6); runGlide(); };

  it('glides the spoken sentence back into the reading band', () => {
    mount();
    followOnce();
    expect(scroller.scrollTop).toBeCloseTo(EXPECTED_SCROLL, 5);
  });

  it('leaves the page alone while the sentence is already inside the band', () => {
    mount();
    Range.prototype.getBoundingClientRect = () => ({ ...RANGE_RECT, top: 300, bottom: 324, y: 300 });
    followOnce();
    expect(scroller.scrollTop).toBe(0);
  });

  it('NEVER uses browser-owned smooth scrolling (it cannot be interrupted)', () => {
    mount();
    followOnce();
    expect(scroller.scrollBy).not.toHaveBeenCalled();
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when Follow the Voice is off — but still paints', () => {
    mount({ readAlongFollow: false });
    play();
    clockTo(6);
    runGlide();
    expect(painted()).toBe('Sentence number two.');
    expect(scroller.scrollTop).toBe(0);
  });

  it('does not scroll while the auto-scroll transport holds the lease', () => {
    mount();
    document.body.classList.add('autoscroll-running');
    followOnce();
    expect(painted()).toBe('Sentence number two.');   // the wash writes nothing, so it stays
    expect(scroller.scrollTop).toBe(0);
  });

  it('does not scroll while scroll-memory is restoring a saved position', () => {
    mount();
    document.body.classList.add('scroll-restoring');
    followOnce();
    expect(scroller.scrollTop).toBe(0);
  });

  it('aborts a glide already in flight the moment auto-scroll takes the lease', () => {
    mount();
    play();
    clockTo(6);
    frame(0);
    frame(130);                                      // mid-glide
    const partway = scroller.scrollTop;
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(EXPECTED_SCROLL);

    document.body.classList.add('autoscroll-running');
    frame(GLIDE_END);
    expect(scroller.scrollTop).toBe(partway);        // yielded, never landed
  });

  it('yields the lease when the container moves under it (an external write)', () => {
    mount();
    play();
    clockTo(6);
    frame(0);
    frame(130);
    scroller.scrollTop = 4000;                       // somebody else scrolled it
    frame(GLIDE_END);
    expect(scroller.scrollTop).toBe(4000);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   User intent revokes the lease
   ═══════════════════════════════════════════════════════════════════════ */
describe('ReadAlongHighlight — a hand on the page suspends follow-scroll', () => {
  for (const evt of ['wheel', 'touchmove', 'pointerdown']) {
    it(`stands down for the suppression window after a ${evt}`, () => {
      const t0 = 1_700_000_000_000;
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
      mount();
      play();
      fireEvent(scroller, new Event(evt, { bubbles: true }));

      clockTo(6);
      runGlide();
      expect(scroller.scrollTop).toBe(0);            // suppressed

      nowSpy.mockReturnValue(t0 + 4100);             // window elapsed
      clockTo(11);
      runGlide();
      expect(scroller.scrollTop).toBeCloseTo(EXPECTED_SCROLL, 5);
    });
  }

  it('cancels a glide already in flight when the reader grabs the page', () => {
    mount();
    play();
    clockTo(6);
    frame(0);
    frame(130);
    const partway = scroller.scrollTop;

    fireEvent(scroller, new Event('touchmove', { bubbles: true }));
    frame(GLIDE_END);                                // the cancelled frame never ran
    expect(scroller.scrollTop).toBe(partway);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   The pure helpers
   ═══════════════════════════════════════════════════════════════════════ */
describe('fragmentAt — binary search at the boundaries', () => {
  const frags = SYNC['vol1:letter-a'];

  it('returns -1 while the clock is still before the first fragment', () => {
    expect(fragmentAt(frags, 1.999)).toBe(-1);
    expect(fragmentAt(frags, -1000)).toBe(-1);
  });

  it('lands on the FIRST fragment exactly at its start and through its span', () => {
    expect(fragmentAt(frags, 2)).toBe(0);
    expect(fragmentAt(frags, 4.999)).toBe(0);
  });

  it('switches on the boundary itself, not one tick late', () => {
    expect(fragmentAt(frags, 5)).toBe(1);
    expect(fragmentAt(frags, 10)).toBe(2);
  });

  it('holds the LAST fragment for the whole tail of the track', () => {
    expect(fragmentAt(frags, 10.5)).toBe(2);
    expect(fragmentAt(frags, 99999)).toBe(2);
  });

  it('handles the degenerate sizes', () => {
    expect(fragmentAt([], 5)).toBe(-1);
    expect(fragmentAt([[3, 0, 0, 4, 0]], 2.999)).toBe(-1);
    expect(fragmentAt([[3, 0, 0, 4, 0]], 3)).toBe(0);
    expect(fragmentAt([[3, 0, 0, 4, 0]], 900)).toBe(0);
  });
});

describe('rangeIn — the TreeWalker offset mapper', () => {
  let host;
  beforeEach(() => {
    host = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = 'Sentence number two.';
    host.append(document.createTextNode('Sentence one. '), em);
    document.body.append(host);
  });
  afterEach(() => { host.remove(); });

  it('maps offsets across element boundaries in the textContent domain', () => {
    expect(String(rangeIn(host, 0, 13))).toBe('Sentence one.');
    expect(String(rangeIn(host, 14, 34))).toBe('Sentence number two.');
  });

  it('returns null — never throws — when the range starts past the end of the text', () => {
    expect(() => rangeIn(host, 100, 120)).not.toThrow();
    expect(rangeIn(host, 100, 120)).toBeNull();
  });

  it('returns null when only the END runs past the text', () => {
    expect(rangeIn(host, 30, 900)).toBeNull();
  });

  it('returns null for an element with no text at all', () => {
    const empty = document.createElement('p');
    document.body.append(empty);
    expect(rangeIn(empty, 0, 5)).toBeNull();
    empty.remove();
  });

  it('a null mapping paints nothing rather than crashing the reading screen', () => {
    globalThis.AUDIO_SYNC = { 'vol1:letter-a': [[2, 0, 900, 999, 0]] };
    mount();
    expect(() => { play(); clockTo(6); }).not.toThrow();
    expect(painted()).toBeNull();
  });
});

/* ── Tap a clause, hear it ─────────────────────────────────────────────────
   The wash is a CSS Custom Highlight: no box, no events, so the tap is
   resolved from the POINT. jsdom has neither layout nor caretRangeFromPoint,
   so the caret API is stubbed to answer with a chosen (node, offset) — which
   is precisely the seam under test: everything AFTER the caret (offset
   mapping, fragment lookup, the guards, the seek) is real. */
describe('tap-to-seek', () => {
  /** Point the caret API at a character index inside a rendered block. */
  const caretAtChar = (blockIndex, charOffset) => {
    const block = document.querySelectorAll('[data-hl-key]')[blockIndex];
    const node = block.firstChild;
    document.caretRangeFromPoint = () => ({ startContainer: node, startOffset: charOffset });
  };
  const tapBody = (target) => {
    const el = target || document.querySelector('.letter-body');
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.click(el, { clientX: 10, clientY: 10 });
  };

  it('offsetIn is the inverse of rangeIn', () => {
    mount();
    const block = document.querySelectorAll('[data-hl-key]')[0];
    const r = rangeIn(block, 14, 34);
    expect(offsetIn(block, r.startContainer, r.startOffset)).toBe(14);
  });

  it('a tap on the second clause seeks to its start', () => {
    mount(); play(); clockTo(2);
    caretAtChar(0, 20);                       // inside "Sentence number two."
    tapBody();
    expect(AudioPlayer.getState().time).toBe(5);
  });

  it('a tap on the first clause seeks back to it', () => {
    mount(); play(); clockTo(6);
    caretAtChar(0, 3);
    tapBody();
    expect(AudioPlayer.getState().time).toBe(2);
  });

  it('works while PAUSED and does not start playback', () => {
    mount(); play(); clockTo(2);
    act(() => AudioPlayer.toggle());
    const before = AudioPlayer.getState().status;
    caretAtChar(0, 20);
    tapBody();
    expect(AudioPlayer.getState().time).toBe(5);
    expect(AudioPlayer.getState().status).toBe(before);
  });

  it('never steals a real text selection', () => {
    mount(); play(); clockTo(2);
    caretAtChar(0, 20);
    const block = document.querySelectorAll('[data-hl-key]')[0];
    const sel = document.getSelection();
    const r = document.createRange();
    r.setStart(block.firstChild, 0); r.setEnd(block.firstChild, 8);
    sel.removeAllRanges(); sel.addRange(r);
    tapBody();
    expect(AudioPlayer.getState().time).toBe(2);
    sel.removeAllRanges();
  });

  it('ignores a drag or scroll gesture', () => {
    mount(); play(); clockTo(2);
    caretAtChar(0, 20);
    const el = document.querySelector('.letter-body');
    fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
    fireEvent.click(el, { clientX: 10, clientY: 240 });     // moved far
    expect(AudioPlayer.getState().time).toBe(2);
  });

  it('leaves footnote bubbles and links to their own handlers', () => {
    mount(); play(); clockTo(2);
    caretAtChar(0, 20);
    const block = document.querySelectorAll('[data-hl-key]')[0];
    const fn = document.createElement('span');
    fn.className = 'fn-ref';
    block.appendChild(fn);
    tapBody(fn);
    expect(AudioPlayer.getState().time).toBe(2);
  });

  /* The inline icons are bare <span onClick> with no role, and they stop
     propagation on the REACT synthetic event — which React dispatches from its
     root container, long after the native click has already bubbled past this
     component's native listener. So their stopPropagation cannot save them:
     the seek fires first. Only the selector can. */
  it.each(['verse-link-icon', 'inline-bookmark-icon', 'hl-note-icon'])(
    'a tap on .%s does not seek the audio', (cls) => {
      mount(); play(); clockTo(2);
      caretAtChar(0, 20);
      const block = document.querySelectorAll('[data-hl-key]')[0];
      const icon = document.createElement('span');
      icon.className = cls;
      block.appendChild(icon);
      tapBody(icon);
      expect(AudioPlayer.getState().time).toBe(2);
    },
  );

  it('a tap in another block seeks to that block clause', () => {
    mount(); play(); clockTo(2);
    caretAtChar(1, 3);
    tapBody();
    expect(AudioPlayer.getState().time).toBe(10);
  });

  it('stays silent on text that shipped no timing', () => {
    mount();
    const main = document.querySelector('.letter-body');
    const block1Only = SYNC['vol1:letter-a'].filter((r) => r[1] === 1);
    caretAtChar(0, 3);                        // block 0 is absent from these rows
    expect(fragmentAtPoint(block1Only, main, 'letter-a', letterHlKey, 5, 5)).toBe(-1);
  });

  it('fragmentAtPoint reports -1 when the caret API is absent', () => {
    mount();
    delete document.caretRangeFromPoint;
    delete document.caretPositionFromPoint;
    const main = document.querySelector('.letter-body');
    expect(fragmentAtPoint(SYNC['vol1:letter-a'], main, 'letter-a', letterHlKey, 5, 5)).toBe(-1);
  });
});

/* A row can fail to resolve for reasons the data gate cannot see from disk: a
   block that this particular render did not emit, offsets past the rendered
   text, the Highlight constructor missing. Whatever the cause, the reader must
   be left with NO wash. Leaving the previous clause lit while the voice moves
   on is the worst of both worlds — it looks like a confident answer and it is
   wrong, and it persists until the next resolvable row. */
describe('an unresolvable row clears the wash instead of freezing it', () => {
  it('clears when the row names a block this letter does not render', () => {
    globalThis.AUDIO_SYNC = {
      'vol1:letter-a': [
        [2, 0, 0, 14, 0],
        [5, 9, 0, 10, 0],          // block 9 does not exist
      ],
    };
    mount(); play();
    clockTo(3);
    expect(painted()).toBe('Sentence one. ');
    clockTo(6);
    expect(painted()).toBeNull();
  });

  it('clears when the offsets run past the rendered text', () => {
    globalThis.AUDIO_SYNC = {
      'vol1:letter-a': [
        [2, 0, 0, 14, 0],
        [5, 0, 14, 999, 0],        // ce beyond BLOCK0's 34 characters
      ],
    };
    mount(); play();
    clockTo(3);
    expect(painted()).toBe('Sentence one. ');
    clockTo(6);
    expect(painted()).toBeNull();
  });
});

/* Bible read-along. Same component, three differences that matter: the rows
   come from a per-edition lazy table rather than AUDIO_SYNC, the "block index"
   column is a verse NUMBER (stable across translations where a positional
   index is not), and the unit is the whole verse — which is what lets KJV
   audio paint over NKJV text, the app's own default pairing. */
describe('ReadAlongHighlight — Bible chapters', () => {
  const VERSE1 = 'In the beginning was the Word, and the Word was with God.';
  const VERSE2 = 'The same was in the beginning with God.';
  const bibleKey = (bookId, n) => 'bible:' + bookId + ':1:' + n;

  function BibleHost({ chapter = 1, readAlongOn = true }) {
    const mainRef = React.useRef(null);
    return (
      <div className="screen-scroll">
        <div className="chapter-body" ref={mainRef}>
          <span data-hl-key={bibleKey('john', 1)}>{VERSE1}</span>
          <span data-hl-key={bibleKey('john', 2)}>{VERSE2}</span>
        </div>
        <ReadAlongHighlight
          volKey="bible-brm-kjv"
          letterId="john"
          chapter={chapter}
          mainRef={mainRef}
          hlKeyFn={(bookId, n) => 'bible:' + bookId + ':' + chapter + ':' + n}
          readAlongOn={readAlongOn}
          readAlongFollow={false}
        />
      </div>
    );
  }

  const mountBible = (props) => {
    const out = render(<BibleHost {...props} />);
    scroller = out.container.querySelector('.screen-scroll');
    scroller.getBoundingClientRect = () => BOX;
    Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
    return out;
  };

  const playChapter = (n) => act(() => {
    AudioPlayer.playBibleBook({ volKey: 'bible-brm-kjv', bookId: 'john', label: 'KJV', chapterNum: n });
  });

  beforeEach(() => {
    globalThis.BIBLE_AUDIO_MANIFEST = {
      'bible-brm-kjv:john': [
        ['brm2_john_001', '', 'Chapter 1'],
        ['brm2_john_002', '', 'Chapter 2'],
        ['brm2_john_003', '', 'Chapter 3'],
      ],
    };
    globalThis.BIBLE_AUDIO_BOOKS = [['john', 'John']];
    // Integer centiseconds, positional by verse; 0 means "not proven".
    globalThis.BIBLE_SYNC_BRM_KJV = { john: { 1: [500, 1200] } };
  });
  afterEach(() => {
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    delete globalThis.BIBLE_AUDIO_BOOKS;
    delete globalThis.BIBLE_SYNC_BRM_KJV;
  });

  it('paints the WHOLE verse the voice is reading', () => {
    mountBible(); playChapter(1);
    clockTo(6);
    expect(painted()).toBe(VERSE1);
    clockTo(13);
    expect(painted()).toBe(VERSE2);
  });

  it('paints nothing when the chapter playing is not the chapter on screen', () => {
    // A book queues its whole remaining run, so this is the ordinary case
    // after four minutes of listening — not an edge case.
    mountBible({ chapter: 1 }); playChapter(3);
    clockTo(6);
    expect(painted()).toBeNull();
  });

  it('paints nothing for a verse this translation does not render', () => {
    globalThis.BIBLE_SYNC_BRM_KJV = { john: { 1: [500, 1200, 1900] } };   // a verse 3 the page lacks
    mountBible(); playChapter(1);
    clockTo(20);
    expect(painted()).toBeNull();
  });

  it('skips a verse the belt could not prove rather than guessing', () => {
    globalThis.BIBLE_SYNC_BRM_KJV = { john: { 1: [0, 1200] } };           // verse 1 unproven
    mountBible(); playChapter(1);
    clockTo(6);
    expect(painted()).toBeNull();
    clockTo(13);
    expect(painted()).toBe(VERSE2);
  });

  it('honours the read-along setting', () => {
    mountBible({ readAlongOn: false }); playChapter(1);
    clockTo(6);
    expect(painted()).toBeNull();
  });

  it('never paints a letter timeline over a Bible chapter', () => {
    delete globalThis.BIBLE_SYNC_BRM_KJV;
    mountBible(); playChapter(1);
    clockTo(6);
    expect(painted()).toBeNull();
  });
});

/* Format B (WTLB / The Blessed). Its timings are stored in the CORPUS offset
   domain because the rendered one is not stable -- markers are stripped, soft
   line breaks vanish, and a reference becomes either a footnote number or a
   parenthesised cite. offsetMapFn crosses that gap at paint time, once. Without
   it these entries could only wash a whole paragraph, which on the longest one
   is about four minutes of motionless gold. */
describe('ReadAlongHighlight — Format B paints through the offset projection', () => {
  const RAW = 'Blessed are those who **hear**,\nAnd keep My Commandments {{ref:Matthew 4:4}} always.\nSays The Lord.';
  const REFS = [{ ref: 'Matthew 4:4', trailing: false, num: 2 }];

  // Exactly the fragments tools/audio-fragments-lib.mjs emits for this text.
  const B_SYNC = {
    'wtlb1:entry-a': [
      [2, 0, 0, 31, 0],
      [5, 0, 32, 84, 0],
      [9, 0, 85, 99, 0],
    ],
  };

  function BHost({ footnotesMode = true }) {
    const mainRef = React.useRef(null);
    const dom = formatBDomText(RAW, { refs: REFS, footnotesMode });
    const map = React.useMemo(
      () => formatBOffsetMap(RAW, { refs: REFS, footnotesMode }).toDom,
      [footnotesMode],
    );
    return (
      <div className="screen-scroll">
        <main className="letter-body" ref={mainRef}>
          <p data-hl-key="wtlb:entry-a:0">{dom}</p>
        </main>
        <ReadAlongHighlight
          volKey="wtlb1"
          letterId="entry-a"
          mainRef={mainRef}
          hlKeyFn={(id, pi) => 'wtlb:' + id + ':' + pi}
          readAlongOn
          readAlongFollow={false}
          offsetMapFn={() => map}
        />
      </div>
    );
  }

  const mountB = (props) => {
    const out = render(<BHost {...props} />);
    scroller = out.container.querySelector('.screen-scroll');
    scroller.getBoundingClientRect = () => BOX;
    Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
    return out;
  };

  const playB = () => act(() => {
    AudioPlayer.playLetter({ volKey: 'wtlb1', letter: { id: 'entry-a', title: 'An Entry' }, collectionLabel: 'WTLB' });
  });

  beforeEach(() => {
    globalThis.AUDIO_MANIFEST = { 'wtlb1:entry-a': [['idB', 'B']] };
    globalThis.AUDIO_SYNC = B_SYNC;
  });

  it('paints a line whose corpus span contains stripped markers', () => {
    mountB(); playB();
    clockTo(3);
    expect(painted()).toBe('Blessed are those who hear,');
  });

  it('paints across a reference the renderer replaced with a number', () => {
    mountB({ footnotesMode: true }); playB();
    clockTo(6);
    expect(painted()).toBe('And keep My Commandments 2 always.');
  });

  it('paints the same line when the reference renders as a cite instead', () => {
    // Same shipped offsets, a different render: the projection absorbs it.
    mountB({ footnotesMode: false }); playB();
    clockTo(6);
    expect(painted()).toBe('And keep My Commandments (Matthew 4:4) always.');
  });

  it('paints the last line, which sits past two vanished line breaks', () => {
    mountB(); playB();
    clockTo(10);
    expect(painted()).toBe('Says The Lord.');
  });

  it('still honours the legacy whole-paragraph sentinel', () => {
    globalThis.AUDIO_SYNC = { 'wtlb1:entry-a': [[2, 0, -1, -1, 0]] };
    mountB(); playB();
    clockTo(3);
    expect(painted()).toBe(formatBDomText(RAW, { refs: REFS, footnotesMode: true }));
  });
});
