/* reading-bars.test.jsx - the phone's bars step aside while a recording plays on a reading page scrolled into its text
   (1b-letter-playing), and no line moves on the screen when they go or come. jsdom has no layout, so a small fake one:
   the top bar is 59 px, the scroller starts under it (or at 0 once it has gone), the page head ends 200 px into the page.
   `inset` stands in for the phone's system bar (MainActivity sets --inset-top when the page has loaded, which can be after a
   reader or a gate has scrolled): it pushes the top bar and the scroller down with no toggle; a fake ResizeObserver tells. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useReadingBars, headGone } from './reading-bars.js';

const BAR = 59;
const HEAD = 200;
const scrolls = new WeakMap();
let saved = /** @type {Record<string, PropertyDescriptor | undefined>} */ ({});
let inset = 0;
let long = Infinity; // the page's height: a browser keeps scrollTop <= long - the scroller's height
let resized = /** @type {(() => void)[]} */ ([]);
const realRO = globalThis.ResizeObserver;

/** the phone's inset changes: the scroller's edge moves (and its size), nothing toggles */
const setInset = (px) => act(() => { inset = px; for (const cb of resized) cb(); });

beforeEach(() => {
  inset = 0;
  long = Infinity;
  resized = [];
  globalThis.ResizeObserver = /** @type {any} */ (class {
    constructor(cb) { this.cb = () => cb([], this); }
    observe() { resized.push(this.cb); }
    disconnect() { resized = resized.filter((f) => f !== this.cb); }
  });
  saved = {
    rect: Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect'),
    top: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
  };
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get() {
      const at = scrolls.get(this) || 0;
      if (!this.classList.contains('sc')) return at;
      const scTop = inset + (this.ownerDocument.querySelector('.tb') ? BAR : 0);
      return Math.max(0, Math.min(at, long - (780 - scTop)));
    },
    set(v) { scrolls.set(this, Math.max(0, v)); },
  });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      const doc = this.ownerDocument;
      const sc = doc.querySelector('.sc');
      const scTop = inset + (doc.querySelector('.tb') ? BAR : 0);
      if (this.classList.contains('sc')) return { top: scTop, bottom: 780, height: 780 - scTop };
      if (this.classList.contains('page-head')) {
        const top = scTop - (sc ? sc.scrollTop : 0);
        return { top, bottom: top + HEAD, height: HEAD };
      }
      return { top: 0, bottom: 0, height: 0 };
    },
  });
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = realRO;
  for (const [k, name] of [['rect', 'getBoundingClientRect'], ['top', 'scrollTop']]) {
    if (saved[k]) Object.defineProperty(Element.prototype, name, saved[k]);
    else delete (/** @type {any} */ (Element.prototype))[name];
  }
});

let bars = /** @type {any} */ (null);
function Page({ on, page }) {
  const ref = React.useRef(null);
  bars = useReadingBars({ scrollRef: ref, on, page });
  return (
    <div>
      {!bars.hidden && <div className="tb" />}
      <div className="sc" ref={ref}><div className="page-head" /><p>text</p></div>
      {!bars.hidden && <nav className="tabbar" />}
    </div>
  );
}

const LETTER = { place: 'letter', collection: 'one', n: 1 };
const sc = () => /** @type {HTMLElement} */ (document.querySelector('.sc'));
/** where the head's bottom is on the screen */
const headAt = () => document.querySelector('.page-head').getBoundingClientRect().bottom;
const scrollTo = (y) => act(() => { sc().scrollTop = y; bars.check(); });

describe('the bars on a reading page', () => {
  it('stay while nothing plays, however far the page has scrolled', () => {
    render(<Page on={false} page={LETTER} />);
    scrollTo(900);
    expect(bars.hidden).toBe(false);
    expect(document.querySelector('.tb')).not.toBe(null);
  });

  it('stay while playing with the head still showing (Back reachable), go once it is under the bar', () => {
    render(<Page on page={LETTER} />);
    scrollTo(120);
    expect(bars.hidden).toBe(false);
    scrollTo(HEAD);
    expect(bars.hidden).toBe(true);
    expect(document.querySelector('.tb')).toBe(null);
    expect(document.querySelector('.tabbar')).toBe(null);
  });

  it('no line moves on the screen when they go or come, and the move never flips them back', () => {
    render(<Page on page={LETTER} />);
    scrollTo(400);
    const before = headAt();
    expect(bars.hidden).toBe(true);
    expect(headAt()).toBe(before);
    expect(sc().scrollTop).toBe(400 - BAR);
    act(() => { bars.check(); });
    expect(bars.hidden).toBe(true);
    // back up until the head shows under where the bar was: they come back, again with no move
    scrollTo(HEAD - BAR - 30);
    expect(bars.hidden).toBe(false);
    expect(headAt()).toBe(BAR + 30);
  });

  it('come back when the playing stops, with no move', () => {
    const { rerender } = render(<Page on page={LETTER} />);
    scrollTo(500);
    const at = headAt();
    rerender(<Page on={false} page={LETTER} />);
    expect(bars.hidden).toBe(false);
    expect(document.querySelector('.tb')).not.toBe(null);
    expect(headAt()).toBe(at);
  });

  it('near the end of a page they go with no move, though the grown scroller clamps the page first', () => {
    long = 1220; // with the bar shown the page can scroll to 499; without it only to 440
    render(<Page on page={LETTER} />);
    act(() => { sc().scrollTop = 476; });
    const before = headAt();
    act(() => { bars.check(); });
    expect(bars.hidden).toBe(true);
    expect(sc().scrollTop).toBe(476 - BAR);
    expect(headAt()).toBe(before);
  });

  it('an inset that came after the page opened: they go with no move (the edge is read when they toggle)', () => {
    render(<Page on page={LETTER} />);
    act(() => { inset = 27; }); // no resize told: only the scroll's own check can see the new edge
    act(() => { sc().scrollTop = 400; });
    const before = headAt();
    act(() => { bars.check(); });
    expect(bars.hidden).toBe(true);
    expect(headAt()).toBe(before);
    expect(sc().scrollTop).toBe(400 - BAR);
  });

  it('an inset that comes while they are hidden: they come back with no move and no flicker', () => {
    const { rerender } = render(<Page on page={LETTER} />);
    scrollTo(400);
    expect(bars.hidden).toBe(true);
    setInset(27); // the page itself moves down with the edge here (the phone did it, not us)
    // back up until the head ends just under the top bar's NEW bottom edge: still under it, so they stay hidden
    scrollTo(HEAD + 27 - (27 + BAR - 10));
    expect(headAt()).toBe(27 + BAR - 10);
    expect(bars.hidden).toBe(true);
    const at = headAt();
    rerender(<Page on={false} page={LETTER} />);
    expect(bars.hidden).toBe(false);
    expect(headAt()).toBe(at);
  });

  it('a new page starts with them shown and is never moved', () => {
    const { rerender } = render(<Page on page={LETTER} />);
    scrollTo(500);
    act(() => { sc().scrollTop = 0; });
    rerender(<Page on page={{ ...LETTER, n: 2 }} />);
    expect(bars.hidden).toBe(false);
    expect(sc().scrollTop).toBe(0);
  });
});

describe('headGone', () => {
  it('a page with no head counts as gone once it has scrolled', () => {
    const el = document.createElement('div');
    expect(headGone(el, 59)).toBe(false);
    el.scrollTop = 10;
    expect(headGone(el, 59)).toBe(true);
  });

  it('a head with no box (not laid out yet) is never gone, so the bars stay', () => {
    const el = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'page-head';
    el.appendChild(head);
    head.getBoundingClientRect = () => /** @type {any} */ ({ top: 0, bottom: 0, height: 0 });
    expect(headGone(el, 59)).toBe(false);
    expect(headGone(el, 0)).toBe(false);
  });
});
