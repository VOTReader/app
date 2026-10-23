/* rs1 (Corbin 2026-10-22): "if I highlight something and scroll to highlight more, instead of scrolling the page up or
   down gently to continue highlighting, sometimes it'll highlight for instance the media player, or it'll suddenly
   highlight the entire page including other UI elements, or my select will drop entirely".
   ────────────────────────────────────────────────────────────────────────────
   selection-drag.js keeps a dragged selection end in the reading column and scrolls the column gently while the end is
   held at its top or bottom edge. jsdom does no layout, so the page is drawn by hand: a column of 28 px lines (a hero,
   then verses 1-99) under a top bar, a mini player over its bottom, and a hidden toast after the app (the S22 put an
   end that escaped over the player there). document.caretRangeFromPoint and Range#getClientRects read that drawing;
   the browser's handle drag is played as it arrives on a phone: the selection's end moves, then a selectionchange,
   and no touch or pointer event at all until the contextmenu after the lift. On the S22 a selection the page set
   while a handle was held ended the drag, so no test lets the controller set one before the lift. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startSelectionDrag, edgeScrollSpeed, readingEdges, liveColumnOf, selectionDragging,
  DRAG_BAND, SPEED_MIN, SPEED_MAX, SCROLL_LEASE_MS, LEASE_MS,
} from './selection-drag.js';

const LINE = 28;
const COL_TOP = 56;          // under the top bar
const COL_BOTTOM = 768;      // jsdom's innerHeight
const BAR_TOP = 700;         // the mini player over the column's bottom
const WIDTH = 400;
const LINES = 100;           // line 0 is the hero, lines 1-99 are verses
const MAX_SCROLL = LINES * LINE - (COL_BOTTOM - COL_TOP);
/** The speed for an end the browser lost past an edge: the finger is taken to be at the edge itself. */
const LOST_SPEED = SPEED_MIN + (SPEED_MAX - SPEED_MIN) / 4;

/** @type {HTMLElement} */ let col;
/** @type {Text} */ let toastText;
/** @type {Text[]} */ let lineText;
/** @type {any} */ let sel;
let clock = 0;
/** @type {Map<number, FrameRequestCallback>} */ let frames;
let frameId = 0;
/** @type {() => void} */ let stop;
let origGetSelection, origCaret, origRects;

/** The text node on a line, and the line a node is on (-1 off the column). */
const textOn = (/** @type {number} */ line) => lineText[line];
const lineOf = (/** @type {Node | null} */ node) => {
  const el = node && (node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement);
  const holder = el && col.contains(el) ? el.closest('[data-line]') : null;
  return holder ? Number(holder.getAttribute('data-line')) : -1;
};
/** The screen y of the middle of a line, and the line at a screen y. */
const yOf = (/** @type {number} */ line) => COL_TOP + line * LINE + LINE / 2 - col.scrollTop;
const lineAt = (/** @type {number} */ y) => Math.floor((y - COL_TOP + col.scrollTop) / LINE);

function page() {
  document.body.innerHTML = '';
  const app = document.createElement('div');
  app.id = 'root';
  app.innerHTML = '<div class="top-nav">John 3</div>'
    + '<div class="screen-scroll" id="col"><h1 class="hero" data-line="0">John 3</h1>'
    + Array.from({ length: LINES - 1 }, (_, i) =>
      `<p data-line="${i + 1}" data-hl-key="bible:john:3:${i + 1}" style="line-height: ${LINE}px">Verse ${i + 1} and the words that follow it</p>`).join('')
    + '</div>'
    + '<div class="audio-bar">Now playing</div>';
  document.body.appendChild(app);
  const toast = document.createElement('div');
  toast.className = 'vot-toast';
  toast.textContent = 'Saved to your notes';
  document.body.appendChild(toast);
  col = /** @type {HTMLElement} */ (document.getElementById('col'));
  toastText = /** @type {Text} */ (toast.firstChild);
  lineText = [/** @type {Text} */ (col.querySelector('.hero')?.firstChild)];
  col.querySelectorAll('p').forEach((p) => lineText.push(/** @type {Text} */ (p.firstChild)));
  // The column scrolls (clamped like a browser's) and has a box; the player has one over its bottom.
  let top = 0;
  Object.defineProperty(col, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = Math.max(0, Math.min(MAX_SCROLL, Math.round(v))); } });
  Object.defineProperty(col, 'clientHeight', { configurable: true, value: COL_BOTTOM - COL_TOP });
  col.getBoundingClientRect = () => /** @type {any} */ ({ top: COL_TOP, bottom: COL_BOTTOM, left: 0, right: WIDTH, width: WIDTH, height: COL_BOTTOM - COL_TOP });
  const bar = /** @type {HTMLElement} */ (document.querySelector('.audio-bar'));
  bar.getBoundingClientRect = () => /** @type {any} */ ({ top: BAR_TOP, bottom: COL_BOTTOM, left: 0, right: WIDTH, width: WIDTH, height: COL_BOTTOM - BAR_TOP });
}

/** The live selection, as far as the controller can see it: two ends, and setBaseAndExtent. Our own set ends echo a
    selectionchange at the next flush, as a browser's queued task would. */
function fakeSelection() {
  return {
    anchorNode: /** @type {Node | null} */ (null), anchorOffset: 0, focusNode: /** @type {Node | null} */ (null), focusOffset: 0,
    sets: 0, echo: false,
    get isCollapsed() { return !this.anchorNode || (this.anchorNode === this.focusNode && this.anchorOffset === this.focusOffset); },
    get rangeCount() { return this.anchorNode ? 1 : 0; },
    setBaseAndExtent(a, ao, f, fo) { Object.assign(this, { anchorNode: a, anchorOffset: ao, focusNode: f, focusOffset: fo }); this.sets++; this.echo = true; },
    removeAllRanges() { Object.assign(this, { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0 }); },
  };
}

const selectionchange = () => document.dispatchEvent(new Event('selectionchange'));
const flush = () => { if (sel.echo) { sel.echo = false; selectionchange(); } };
/** The browser selects (a long-press's word, or a select-all): both ends new. */
function browserSelects(/** @type {Node} */ a, /** @type {number} */ ao, /** @type {Node} */ f, /** @type {number} */ fo) {
  Object.assign(sel, { anchorNode: a, anchorOffset: ao, focusNode: f, focusOffset: fo });
  selectionchange();
}
/** The browser moves the selection's end under a dragged handle (the anchor stays). */
function browserMovesEnd(/** @type {Node} */ f, /** @type {number} */ fo) {
  Object.assign(sel, { focusNode: f, focusOffset: fo });
  selectionchange();
}
const menu = () => document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
/** The lift after a handle drag: the browser's contextmenu, then the echo of whatever the page set at it. */
const lift = () => { menu(); flush(); };
/** A long-press on a line as Chromium plays it: the finger goes down, the word is selected and the contextmenu is
    sent at once, and the selectionchange follows (it is queued); then a beat. */
function longPress(/** @type {number} */ line) {
  pointer('pointerdown', textOn(line).parentElement, 'touch');
  Object.assign(sel, { anchorNode: textOn(line), anchorOffset: 6, focusNode: textOn(line), focusOffset: 11 });
  menu();
  selectionchange();
  pointer('pointercancel', textOn(line).parentElement, 'touch');
  clock += 300;
}
function pointer(/** @type {string} */ type, /** @type {Element | null} */ target, /** @type {string} */ pointerType) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType });
  if (e.pointerType !== pointerType) Object.defineProperty(e, 'pointerType', { value: pointerType });
  (target || document).dispatchEvent(e);
}
/** Run `n` animation frames, 60 a second; returns each frame's scroll step. */
function runFrames(/** @type {number} */ n, dtMs = 1000 / 60) {
  const steps = [];
  for (let i = 0; i < n; i++) {
    clock += dtMs;
    const due = [...frames.values()];
    frames.clear();
    const before = col.scrollTop;
    for (const cb of due) cb(clock);
    steps.push(col.scrollTop - before);
    flush();
  }
  return steps;
}
const dragging = () => document.body.classList.contains('sel-dragging');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  page();
  sel = fakeSelection();
  origGetSelection = window.getSelection;
  window.getSelection = () => sel;
  // The caret under a point: the column's text where the point is on it (the chrome takes no touches while a drag
  // is on, so the column's text under the player counts), else nothing.
  origCaret = /** @type {any} */ (document).caretRangeFromPoint;
  /** @type {any} */ (document).caretRangeFromPoint = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < 0 || x > WIDTH || y < COL_TOP || y > COL_BOTTOM) return null;
    const t = textOn(lineAt(y));
    if (!t) return null;
    const r = document.createRange();
    r.setStart(t, Math.min(t.length, Math.floor(x / 8)));
    return r;
  };
  // A caret's box: on its line, 8 px a character; nothing for one off the column (the hidden toast has no box).
  origRects = /** @type {any} */ (Range.prototype).getClientRects;
  /** @type {any} */ (Range.prototype).getClientRects = function () {
    const line = lineOf(this.startContainer);
    if (line < 0) return [];
    const top = COL_TOP + line * LINE - col.scrollTop;
    const x = this.startOffset * 8;
    return [{ left: x, right: x, top, bottom: top + LINE, width: 0, height: LINE }];
  };
  clock = 10000;
  frames = new Map();
  stop = startSelectionDrag({
    now: () => clock,
    frame: (cb) => { frameId += 1; frames.set(frameId, cb); return frameId; },
    cancelFrame: (id) => { frames.delete(id); },
  });
});

afterEach(() => {
  stop();
  window.getSelection = origGetSelection;
  /** @type {any} */ (document).caretRangeFromPoint = origCaret;
  /** @type {any} */ (Range.prototype).getClientRects = origRects;
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('edgeScrollSpeed', () => {
  const e = { top: 100, bottom: 700 };
  it('is still in the middle and at the band\'s inner edge only starts', () => {
    expect(edgeScrollSpeed({ ...e, y: 400 })).toBe(0);
    expect(edgeScrollSpeed({ ...e, y: e.bottom - DRAG_BAND - 1 })).toBe(0);
    expect(edgeScrollSpeed({ ...e, y: e.top + DRAG_BAND + 1 })).toBe(0);
    expect(edgeScrollSpeed({ ...e, y: e.bottom - DRAG_BAND + 0.001 })).toBeCloseTo(SPEED_MIN, 1);
    expect(edgeScrollSpeed({ ...e, y: e.top + DRAG_BAND - 0.001 })).toBeCloseTo(-SPEED_MIN, 1);
  });
  it('goes down at the bottom and up at the top, faster the deeper, softly at first', () => {
    const at = (/** @type {number} */ into) => edgeScrollSpeed({ ...e, y: e.bottom - DRAG_BAND + into });
    expect(at(10)).toBeGreaterThan(0);
    expect(at(20)).toBeGreaterThan(at(10));
    expect(at(DRAG_BAND)).toBeCloseTo(LOST_SPEED, 5);                                 // at the edge itself: a quarter
    expect(at(20) - at(10)).toBeLessThan(at(DRAG_BAND + 20) - at(DRAG_BAND + 10));    // squared: soft at first
    expect(edgeScrollSpeed({ ...e, y: e.top + DRAG_BAND - 30 })).toBeCloseTo(-at(30), 5);
  });
  it('tops out a band past the edge and never runs faster', () => {
    expect(edgeScrollSpeed({ ...e, y: e.bottom + DRAG_BAND })).toBeCloseTo(SPEED_MAX, 5);
    expect(edgeScrollSpeed({ ...e, y: e.bottom + 5000 })).toBe(SPEED_MAX);
    expect(edgeScrollSpeed({ ...e, y: e.top - 5000 })).toBe(-SPEED_MAX);
  });
  it('keeps a still middle in a short column, and nothing for no column or no place', () => {
    const short = { top: 100, bottom: 160 };
    expect(edgeScrollSpeed({ ...short, y: 130 })).toBe(0);
    expect(edgeScrollSpeed({ ...short, y: 159 })).toBeGreaterThan(0);
    expect(edgeScrollSpeed({ top: 300, bottom: 300, y: 300 })).toBe(0);
    expect(edgeScrollSpeed({ ...e, y: NaN })).toBe(0);
  });
});

describe('readingEdges and liveColumnOf', () => {
  it('the reading text shows under the top bands and above the mini player', () => {
    expect(readingEdges(col)).toEqual({ top: COL_TOP, bottom: BAR_TOP, left: 0, right: WIDTH });
  });
  it('a swipe preview is no live column; the toast after the app is in none', () => {
    expect(liveColumnOf(textOn(10))).toBe(col);
    expect(liveColumnOf(toastText)).toBe(null);
    const peek = document.createElement('div');
    peek.className = 'pager-peek';
    peek.innerHTML = '<div class="screen-scroll"><p>John 4</p></div>';
    document.body.appendChild(peek);
    expect(liveColumnOf(/** @type {Node} */ (peek.querySelector('p')?.firstChild))).toBe(null);
  });
});

describe('a handle drag on a phone', () => {
  it('a long-press makes a selection and arms nothing, even at the bottom edge', () => {
    pointer('pointerdown', textOn(22).parentElement, 'touch');
    Object.assign(sel, { anchorNode: textOn(22), anchorOffset: 6, focusNode: textOn(22), focusOffset: 11 });
    menu();
    selectionchange();                   // its line sits in the bottom band
    expect(yOf(22)).toBeGreaterThan(BAR_TOP - DRAG_BAND);
    expect(dragging()).toBe(false);
    expect(frames.size).toBe(0);
    clock += 100;
    browserMovesEnd(textOn(22), 14);     // the press grows its word just after the menu: still the press
    expect(frames.size).toBe(0);
    expect(dragging()).toBe(false);
    clock += 300;
    runFrames(30);
    expect(col.scrollTop).toBe(0);
    expect(sel.sets).toBe(0);
    // A long-press elsewhere is a new selection, not a drag of the first.
    longPress(21);
    expect(frames.size).toBe(0);
    expect(dragging()).toBe(false);
  });

  it('an end held in the bottom band scrolls the column gently and never touches the selection while held', () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);      // the finger drags the end handle down to just above the player
    expect(dragging()).toBe(true);
    expect(selectionDragging()).toBe(true);
    expect(frames.size).toBe(1);
    const fingerY = yOf(21);
    const speed = edgeScrollSpeed({ y: fingerY, top: COL_TOP, bottom: BAR_TOP });
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThan(SPEED_MIN * 1.5);
    const steps = runFrames(60);         // held there one second
    expect(col.scrollTop).toBeGreaterThan(speed * 0.85);
    expect(col.scrollTop).toBeLessThan(speed * 1.15);
    expect(Math.max(...steps)).toBeLessThanOrEqual(Math.ceil(SPEED_MAX / 60));
    // A selection set while the handle is held ends the browser's drag: none is.
    expect(sel.sets).toBe(0);
    expect(sel.focusNode).toBe(textOn(21));
    // The finger moves a hair: the browser puts the end on the text under it now, and the scroll goes on.
    browserMovesEnd(textOn(lineAt(fingerY)), 4);
    expect(frames.size).toBe(1);
    runFrames(30);
    expect(sel.sets).toBe(0);
  });

  it('the lift stops it at once and puts the end at the finger\'s line when the column moved under a still finger', () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    const fingerY = yOf(21);
    runFrames(40);
    const at = col.scrollTop;
    expect(at).toBeGreaterThan(LINE);
    lift();
    expect(dragging()).toBe(false);
    expect(selectionDragging()).toBe(false);
    expect(frames.size).toBe(0);
    expect(sel.sets).toBe(1);
    expect(lineOf(sel.focusNode)).toBe(lineAt(fingerY));
    expect(lineOf(sel.focusNode)).toBeGreaterThan(21);
    expect(sel.anchorNode).toBe(textOn(10));
    expect(sel.anchorOffset).toBe(6);
    runFrames(30);
    expect(col.scrollTop).toBe(at);
    // Its echo is ours: nothing arms again.
    expect(dragging()).toBe(false);
  });

  it('past the chapter\'s last words a still finger has no line to take: the browser\'s end stands at the lift', () => {
    // The chapter ends in the Previous / Next cards (not reading text).
    const nav = document.createElement('div');
    nav.className = 'bottom-nav';
    for (let l = 95; l < LINES; l++) nav.appendChild(/** @type {Element} */ (textOn(l).parentElement));
    col.appendChild(nav);
    col.scrollTop = MAX_SCROLL - 100;
    longPress(80);
    browserMovesEnd(textOn(92), 4);      // the last verse lines, in the bottom band
    const fingerY = yOf(92);
    runFrames(Math.ceil(SCROLL_LEASE_MS / (1000 / 60)) + 6);
    expect(col.scrollTop - (MAX_SCROLL - 100)).toBeGreaterThan(LINE);
    expect(lineAt(fingerY)).toBeGreaterThanOrEqual(95);   // under the finger now: the cards
    lift();
    expect(sel.sets).toBe(0);
    expect(sel.focusNode).toBe(textOn(92));
  });

  it('the lift leaves an end the reader can see alone when nothing scrolled under it', () => {
    longPress(10);
    browserMovesEnd(textOn(14), 1);      // the middle of the screen, by the line's start: no scroll
    expect(dragging()).toBe(true);
    expect(frames.size).toBe(0);
    clock += 2000;                       // held still a while: the drag stays on until the lift
    expect(dragging()).toBe(true);
    lift();
    expect(dragging()).toBe(false);
    expect(sel.sets).toBe(0);
    expect(sel.focusNode).toBe(textOn(14));
    expect(sel.focusOffset).toBe(1);
  });

  it('dragging the start handle turns the selection round and arms at once', () => {
    col.scrollTop = 300;
    longPress(30);
    // The start handle goes up: the browser makes the old end the anchor and moves the start.
    browserSelects(textOn(30), 11, textOn(27), 2);
    expect(dragging()).toBe(true);
    expect(frames.size).toBe(0);
    browserSelects(textOn(30), 11, textOn(11), 2);  // up into the top band
    expect(yOf(11)).toBeLessThan(COL_TOP + DRAG_BAND);
    expect(frames.size).toBe(1);
    runFrames(30);
    expect(col.scrollTop).toBeLessThan(300);
    expect(col.scrollTop).toBeGreaterThan(300 - SPEED_MAX / 2);
    expect(sel.sets).toBe(0);
    lift();
    expect(sel.anchorNode).toBe(textOn(30));
    expect(sel.anchorOffset).toBe(11);
    expect(lineOf(sel.focusNode)).toBeLessThan(11);
  });

  it('a new touch ends it, and so does the selection going away; neither sets an end', () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    runFrames(5);
    pointer('pointerdown', textOn(40).parentElement, 'touch');
    expect(frames.size).toBe(0);
    expect(dragging()).toBe(false);

    longPress(12);
    browserMovesEnd(textOn(22), 2);
    runFrames(5);
    expect(frames.size).toBe(1);
    sel.removeAllRanges();
    selectionchange();
    expect(frames.size).toBe(0);
    expect(dragging()).toBe(false);
    expect(sel.sets).toBe(0);
  });

  it(`stops scrolling when the browser has not moved the end for ${SCROLL_LEASE_MS} ms, and goes on when it does`, () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    const fingerY = yOf(21);
    runFrames(Math.ceil(SCROLL_LEASE_MS / (1000 / 60)) + 6);
    expect(frames.size).toBe(0);
    const at = col.scrollTop;
    expect(at).toBeGreaterThan(0);
    runFrames(30);
    expect(col.scrollTop).toBe(at);
    expect(dragging()).toBe(true);       // still a drag: the lift has not come
    browserMovesEnd(textOn(lineAt(fingerY)), 2);   // the finger moved a hair over the moved text
    expect(frames.size).toBe(1);
    runFrames(30);
    expect(col.scrollTop).toBeGreaterThan(at);
  });

  it(`ends as if lifted when no lift is heard and the browser has not moved the end for ${LEASE_MS} ms`, () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    runFrames(60);
    vi.advanceTimersByTime(LEASE_MS - 100);
    expect(dragging()).toBe(true);
    browserMovesEnd(textOn(lineAt(yOf(21) + LINE)), 1);   // the finger moved: a new lease
    vi.advanceTimersByTime(LEASE_MS - 100);
    expect(dragging()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(dragging()).toBe(false);
    expect(frames.size).toBe(0);
    const at = col.scrollTop;
    runFrames(30);
    expect(col.scrollTop).toBe(at);
  });

  it('an end lost off the screen with no lift heard (no menu comes for it) lands in the column at the lease', () => {
    longPress(10);
    browserMovesEnd(toastText, 3);
    runFrames(10);
    vi.advanceTimersByTime(LEASE_MS + 10);
    flush();
    expect(dragging()).toBe(false);
    expect(col.contains(sel.focusNode)).toBe(true);
    expect(yOf(lineOf(sel.focusNode))).toBeLessThan(BAR_TOP);
  });

  it('an end brought back out of the band stops the scroll; the drag stays on until the lift', () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    runFrames(10);
    browserMovesEnd(textOn(15), 4);      // back up to the middle of the screen
    expect(frames.size).toBe(0);
    const at = col.scrollTop;
    runFrames(10);
    expect(col.scrollTop).toBe(at);
    expect(dragging()).toBe(true);
    lift();
    expect(dragging()).toBe(false);
  });

  it('stops at the end of the column', () => {
    col.scrollTop = MAX_SCROLL - 3;
    const last = lineAt(BAR_TOP - 20);
    longPress(last - 12);
    browserMovesEnd(textOn(last), 1);
    runFrames(30);
    expect(col.scrollTop).toBe(MAX_SCROLL);
    expect(frames.size).toBe(0);
  });

  it('an end over the text under the player scrolls faster, and the lift brings it up to the last line that shows', () => {
    longPress(10);
    const under = lineAt(BAR_TOP + 30);  // the chrome takes no touches: the browser found the text under the player
    browserMovesEnd(textOn(under), 3);
    expect(yOf(under)).toBeGreaterThan(BAR_TOP);
    const speed = edgeScrollSpeed({ y: yOf(under), top: COL_TOP, bottom: BAR_TOP });
    expect(speed).toBeGreaterThan(LOST_SPEED);
    expect(frames.size).toBe(1);
    lift();                              // let go at once, before a frame: nothing scrolled under it
    const line = lineOf(sel.focusNode);
    expect(yOf(line)).toBeLessThan(BAR_TOP);
    expect(yOf(line)).toBeGreaterThan(BAR_TOP - LINE);
  });

  it('an end the browser puts on the toast after the app scrolls on at the edge speed, and lands on the bottom line at the lift', () => {
    longPress(10);
    browserMovesEnd(toastText, 3);
    expect(sel.sets).toBe(0);            // left where the browser put it while the handle is held
    expect(frames.size).toBe(1);
    runFrames(60);
    expect(col.scrollTop).toBeGreaterThan(LOST_SPEED * 0.85);
    expect(col.scrollTop).toBeLessThan(LOST_SPEED * 1.15);
    lift();
    expect(col.contains(sel.focusNode)).toBe(true);
    const line = lineOf(sel.focusNode);
    expect(yOf(line)).toBeLessThan(BAR_TOP);
    expect(yOf(line)).toBeGreaterThan(BAR_TOP - 2 * LINE);
    expect(sel.anchorNode).toBe(textOn(10));
  });

  it('a far scroll the browser makes to show an escaped end is undone; a small one is kept', () => {
    col.scrollTop = 1000;
    longPress(46);
    browserMovesEnd(textOn(47), 4);      // a little drag: on, in the middle, no scroll
    expect(dragging()).toBe(true);
    expect(frames.size).toBe(0);
    col.scrollTop = 0;                   // the browser scrolls the column to the top to show the hero
    col.dispatchEvent(new Event('scroll'));
    expect(col.scrollTop).toBe(1000);
    col.scrollTop = 1100;                // a reader's own small scroll
    col.dispatchEvent(new Event('scroll'));
    expect(col.scrollTop).toBe(1100);
  });

  it('an end dragged over the top bar (the browser takes the hero) scrolls up gently and lands on the top line at the lift', () => {
    col.scrollTop = 1000;
    longPress(46);
    browserMovesEnd(textOn(45), 2);
    col.scrollTop = 0;                   // the browser scrolled first, and its scroll event is not in yet
    browserMovesEnd(lineText[0], 2);     // the hero, far above the screen
    expect(col.scrollTop).toBe(1000);
    expect(sel.sets).toBe(0);
    expect(frames.size).toBe(1);
    runFrames(30);
    expect(col.scrollTop).toBeLessThan(1000);
    expect(col.scrollTop).toBeGreaterThan(1000 - LOST_SPEED * 0.6);
    // Over the bar no move can reach the browser (no text there): the scroll goes on past the still-finger stop.
    runFrames(Math.ceil(SCROLL_LEASE_MS / (1000 / 60)) + 10);
    expect(frames.size).toBe(1);
    expect(col.scrollTop).toBeLessThan(1000 - LOST_SPEED * (SCROLL_LEASE_MS / 1000));
    lift();
    expect(frames.size).toBe(0);
    const line = lineOf(sel.focusNode);
    expect(yOf(line)).toBeGreaterThanOrEqual(COL_TOP);
    expect(yOf(line)).toBeLessThan(COL_TOP + 2 * LINE);
    expect(sel.anchorNode).toBe(textOn(46));
  });

  it('a selectionchange that moves no end does nothing (a reader scrolled away from a selection)', () => {
    longPress(10);
    col.scrollTop = 900;                 // the selection is far above the screen now
    selectionchange();
    selectionchange();
    expect(sel.sets).toBe(0);
    expect(frames.size).toBe(0);
    expect(dragging()).toBe(false);
    expect(col.scrollTop).toBe(900);
  });

  it('a new selection that no press made (the browser menu\'s Select all) is not a drag', () => {
    longPress(10);
    browserSelects(lineText[0], 0, toastText, 5);
    expect(sel.sets).toBe(0);
    expect(sel.focusNode).toBe(toastText);
    expect(dragging()).toBe(false);
    expect(frames.size).toBe(0);
    menu();
    expect(sel.sets).toBe(0);
  });

  it('a selection outside a live column (a swipe preview) is left alone', () => {
    const peek = document.createElement('div');
    peek.className = 'pager-peek';
    peek.innerHTML = '<div class="screen-scroll"><p>John 4 one</p><p>John 4 two</p></div>';
    document.body.appendChild(peek);
    const [a, b] = [...peek.querySelectorAll('p')].map((p) => /** @type {Text} */ (p.firstChild));
    browserSelects(a, 0, a, 4);
    clock += 300;
    browserMovesEnd(b, 3);
    expect(dragging()).toBe(false);
    expect(sel.sets).toBe(0);
  });
});

describe('a mouse and the keyboard', () => {
  /** The mouse moves to (x, y) with its button held. */
  const mouseTo = (/** @type {number} */ x, /** @type {number} */ y) => {
    const e = new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' });
    if (e.pointerType !== 'mouse') Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    document.dispatchEvent(e);
  };
  const mouseDown = (/** @type {number} */ line) => {
    const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: yOf(line), pointerType: 'mouse' });
    if (e.pointerType !== 'mouse') Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    /** @type {Element} */ (textOn(line).parentElement).dispatchEvent(e);
    browserSelects(textOn(line), 2, textOn(line), 3);
  };

  it('a mouse held over the player scrolls the column gently and the end follows it each frame', () => {
    mouseDown(10);
    expect(dragging()).toBe(true);
    browserMovesEnd(textOn(21), 4);
    mouseTo(60, BAR_TOP + 30);           // over the player: inside the column's box, so the browser never autoscrolls
    expect(frames.size).toBe(1);
    runFrames(60);
    expect(col.scrollTop).toBeGreaterThan(SPEED_MIN);
    expect(col.scrollTop).toBeLessThan(SPEED_MAX);
    const line = lineOf(sel.focusNode);
    expect(yOf(line)).toBeLessThan(BAR_TOP);
    expect(yOf(line)).toBeGreaterThan(BAR_TOP - 2 * LINE);
    expect(sel.anchorNode).toBe(textOn(10));
    mouseTo(60, 300);                    // back to the middle: still
    expect(frames.size).toBe(0);
    pointer('pointerup', textOn(14).parentElement, 'mouse');
    expect(dragging()).toBe(false);
  });

  it('the browser\'s own autoscroll is undone during a mouse drag; the wheel is not', () => {
    col.scrollTop = 1000;
    mouseDown(46);
    col.scrollTop = 965;                 // the browser's autoscroll, 35 px in a frame
    col.dispatchEvent(new Event('scroll'));
    expect(col.scrollTop).toBe(1000);
    document.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    col.scrollTop = 1100;
    col.dispatchEvent(new Event('scroll'));
    expect(col.scrollTop).toBe(1100);
  });

  it('an end a mouse drag loses (over the top bar the browser takes the hero) goes onto the top line at once', () => {
    col.scrollTop = 1000;
    mouseDown(46);
    browserMovesEnd(lineText[0], 2);
    flush();
    const line = lineOf(sel.focusNode);
    expect(yOf(line)).toBeGreaterThanOrEqual(COL_TOP);
    expect(yOf(line)).toBeLessThan(COL_TOP + 2 * LINE);
    expect(sel.anchorNode).toBe(textOn(46));
    mouseTo(60, COL_TOP - 30);           // over the top bar: up, gently
    runFrames(30);
    expect(col.scrollTop).toBeLessThan(1000);
    expect(col.scrollTop).toBeGreaterThan(1000 - SPEED_MAX / 2);
    expect(yOf(lineOf(sel.focusNode))).toBeLessThan(COL_TOP + 2 * LINE);
  });

  it('an end over the player at the release lands on the last line that shows', () => {
    mouseDown(10);
    browserMovesEnd(textOn(lineAt(BAR_TOP + 30)), 2);
    pointer('pointerup', document.querySelector('.audio-bar'), 'mouse');
    flush();
    expect(dragging()).toBe(false);
    expect(yOf(lineOf(sel.focusNode))).toBeLessThan(BAR_TOP);
    expect(sel.anchorNode).toBe(textOn(10));
  });

  it('a mouse press outside a reading column is not a drag', () => {
    pointer('pointerdown', document.querySelector('.audio-bar'), 'mouse');
    expect(dragging()).toBe(false);
  });

  it('Shift+arrow moves of the end are the reader\'s own and untouched', () => {
    longPress(10);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
    browserMovesEnd(toastText, 1);
    expect(sel.focusNode).toBe(toastText);
    expect(sel.sets).toBe(0);
    expect(dragging()).toBe(false);
  });
});

describe('stop()', () => {
  it('takes the class off and listens no more', () => {
    longPress(10);
    browserMovesEnd(textOn(21), 4);
    expect(dragging()).toBe(true);
    stop();
    expect(dragging()).toBe(false);
    expect(frames.size).toBe(0);
    browserMovesEnd(textOn(22), 4);
    expect(dragging()).toBe(false);
    stop = () => {};
  });
});
