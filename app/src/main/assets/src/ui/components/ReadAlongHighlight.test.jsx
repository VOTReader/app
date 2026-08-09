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
import { ReadAlongHighlight, fragmentAt, rangeIn } from './ReadAlongHighlight.jsx';

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
