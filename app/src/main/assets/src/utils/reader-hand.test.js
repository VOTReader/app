/* The reader's own hand on a reading page (search200 UX B1 review).
   ──────────────────────────────────────────────────────────────────
   Two places need to tell the reader moving the page from the app moving it:
   the install card's "reached the end" (a search jump that lands at the end is
   not the reader finishing the chapter), and the end of a search look (the
   place a hit opened records no progress until the reader reads it, and their
   own scroll is the first sign they are). A drag, a wheel, a scroll key and the
   scrollbar are the reader's hand. A tap is not (the find pill's next and a link
   jump the page from a tap), and nor is a scroll with no hand near it (a search
   jump, a restore, autoscroll, read-along's follow). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { isReaderHand, isReadingScroller, watchReaderScroll, READER_SCROLL_MS } from './reader-hand.js';

let now;
let page;
const scroller = () => {
  const el = document.createElement('div');
  el.className = 'screen-scroll';
  document.body.appendChild(el);
  return el;
};
beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  page = scroller();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('isReadingScroller: the live reading page, not a peek clone', () => {
  it('a .screen-scroll is the page', () => {
    expect(isReadingScroller(page)).toBe(true);
  });
  it('a peek clone (inside [inert]) and anything else are not', () => {
    const peek = document.createElement('div'); peek.setAttribute('inert', '');
    const clone = document.createElement('div'); clone.className = 'screen-scroll';
    peek.appendChild(clone); document.body.appendChild(peek);
    expect(isReadingScroller(clone)).toBe(false);
    expect(isReadingScroller(document.createElement('div'))).toBe(false);
    expect(isReadingScroller(document)).toBe(false);
    expect(isReadingScroller(null)).toBe(false);
  });
});

describe('isReaderHand', () => {
  const ev = (type, target, init = {}) => {
    const e = new Event(type, { bubbles: true });
    Object.assign(e, init);
    Object.defineProperty(e, 'target', { value: target });
    return e;
  };
  it('a drag and a wheel are the hand', () => {
    expect(isReaderHand(ev('touchmove', page), page)).toBe(true);
    expect(isReaderHand(ev('wheel', page), null)).toBe(true);
  });
  it('the scrollbar is the scroller\'s own pointerdown: the given one, or any live reading page', () => {
    const btn = document.createElement('button'); page.appendChild(btn);
    expect(isReaderHand(ev('pointerdown', page), page)).toBe(true);
    expect(isReaderHand(ev('pointerdown', btn), page)).toBe(false);
    expect(isReaderHand(ev('pointerdown', page), null)).toBe(true);
    expect(isReaderHand(ev('pointerdown', btn), null), 'a tap on a control').toBe(false);
  });
  it('a scroll key is the hand, but not one typed into a field', () => {
    const field = document.createElement('input'); page.appendChild(field);
    expect(isReaderHand(ev('keydown', page, { key: 'PageDown' }), null)).toBe(true);
    expect(isReaderHand(ev('keydown', field, { key: ' ' }), null)).toBe(false);
    expect(isReaderHand(ev('keydown', page, { key: 'Enter' }), null), 'Enter is a tap').toBe(false);
  });
});

describe('watchReaderScroll', () => {
  it('a scroll the reader\'s hand moved is reported; a scroll with no hand near it is not', () => {
    const seen = vi.fn();
    const stop = watchReaderScroll(null, seen);
    fireEvent.scroll(page);                                  // the search jump, a restore
    expect(seen).not.toHaveBeenCalled();
    fireEvent.touchMove(page); now += 200; fireEvent.scroll(page);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a scroll long after the last touch is not the hand\'s', () => {
    const seen = vi.fn();
    const stop = watchReaderScroll(null, seen);
    fireEvent.touchMove(page); now += READER_SCROLL_MS + 1; fireEvent.scroll(page);
    expect(seen).not.toHaveBeenCalled();
    stop();
  });

  it('a tap that jumps the page (the find pill\'s next, a link) is not the hand', () => {
    const seen = vi.fn();
    const stop = watchReaderScroll(null, seen);
    const next = document.createElement('button'); page.appendChild(next);
    fireEvent.touchStart(next); fireEvent.pointerDown(next); fireEvent.keyDown(next, { key: 'Enter' });
    fireEvent.scroll(page);
    expect(seen).not.toHaveBeenCalled();
    stop();
  });

  it('with no scroller named, any live reading page counts, a peek clone does not', () => {
    const seen = vi.fn();
    const stop = watchReaderScroll(null, seen);
    const peek = document.createElement('div'); peek.setAttribute('inert', '');
    const clone = document.createElement('div'); clone.className = 'screen-scroll';
    peek.appendChild(clone); document.body.appendChild(peek);
    fireEvent.touchMove(clone); fireEvent.scroll(clone);
    expect(seen, 'a peek clone').not.toHaveBeenCalled();
    fireEvent.wheel(page); fireEvent.scroll(page);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a named scroller is the only one watched', () => {
    const seen = vi.fn();
    const other = scroller();
    const stop = watchReaderScroll(page, seen);
    fireEvent.touchMove(other); fireEvent.scroll(other);
    expect(seen).not.toHaveBeenCalled();
    fireEvent.touchMove(page); fireEvent.scroll(page);
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops watching when told to', () => {
    const seen = vi.fn();
    watchReaderScroll(null, seen)();
    fireEvent.touchMove(page); fireEvent.scroll(page);
    expect(seen).not.toHaveBeenCalled();
  });
});
