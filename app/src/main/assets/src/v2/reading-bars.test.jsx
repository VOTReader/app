/* reading-bars.test.jsx - the phone's bars step aside while a recording plays on a reading page scrolled into its text
   (1b-letter-playing), and no line moves on the screen when they go or come. jsdom has no layout, so a small fake one:
   the top bar is 59 px, the scroller starts under it (or at 0 once it has gone), the page head ends 200 px into the page. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useReadingBars, headGone } from './reading-bars.js';

const BAR = 59;
const HEAD = 200;
const scrolls = new WeakMap();
let saved = /** @type {Record<string, PropertyDescriptor | undefined>} */ ({});

beforeEach(() => {
  saved = {
    rect: Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect'),
    top: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
  };
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get() { return scrolls.get(this) || 0; },
    set(v) { scrolls.set(this, Math.max(0, v)); },
  });
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      const doc = this.ownerDocument;
      const sc = doc.querySelector('.sc');
      const scTop = doc.querySelector('.tb') ? BAR : 0;
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
