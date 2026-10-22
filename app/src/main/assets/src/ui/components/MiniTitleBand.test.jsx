// @ts-nocheck — IntersectionObserver stubbed per test (jsdom has none)
/* MiniTitleBand — the band itself (search200 UX B10, item 1): what it watches, when it
   shows, and what it covers (a jump to a paragraph clears it as it clears the "Back to" row). */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MiniTitleBand, stickyCover } from './MiniTitleBand.jsx';

class FakeIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.els = []; FakeIO.all.push(this); }
  observe(el) { this.els.push(el); }
  disconnect() { this.disconnected = true; }
  fire(entry) { this.cb([{ target: this.els[0], rootBounds: { top: 100 }, ...entry }]); }
}
FakeIO.all = [];

function Page({ hint = false, title = 'Abide', pageKey = 'a' }) {
  const heroRef = React.useRef(null);
  const band = <MiniTitleBand heroRef={heroRef} eyebrow="Volume Three · Letter 17" title={title} pageKey={pageKey} />;
  return (
    <div className="screen-scroll">
      {hint ? <div className="back-hint-row">{band}</div> : <div className="mini-title-anchor">{band}</div>}
      <header className="hero" ref={heroRef}><h1>{title}</h1></header>
      <p className="para">text</p>
    </div>
  );
}
const band = () => document.querySelector('.mini-title');

beforeEach(() => { FakeIO.all = []; globalThis.IntersectionObserver = FakeIO; });
afterEach(() => { cleanup(); delete globalThis.IntersectionObserver; });

describe('MiniTitleBand', () => {
  it('shows only when the hero has gone ABOVE the column top, not below it', () => {
    render(<Page />);
    const io = FakeIO.all[0];
    expect(io.opts.rootMargin).toBe('-1px 0px 0px 0px');
    act(() => io.fire({ isIntersecting: false, boundingClientRect: { top: 900, bottom: 1100 } }));
    expect(band().classList.contains('shown')).toBe(false);
    act(() => io.fire({ isIntersecting: false, boundingClientRect: { top: -150, bottom: 60 } }));
    expect(band().classList.contains('shown')).toBe(true);
    act(() => io.fire({ isIntersecting: true, boundingClientRect: { top: 0, bottom: 200 } }));
    expect(band().classList.contains('shown')).toBe(false);
  });

  it('shows once the rest of the hero would sit behind it: its line is the band bottom edge, under the "Back to" row', () => {
    // A search landing left the hero's last 10px showing under the "Back to" row, and so no
    // name on screen: the band shows once what is left of the hero fits behind it.
    const real = HTMLElement.prototype.getBoundingClientRect;
    const H = { 'mini-title': 48, 'back-hint-row': 45 };
    HTMLElement.prototype.getBoundingClientRect = function () {
      const h = H[String(this.className).split(' ')[0]] || 0;
      return { top: 0, bottom: h, height: h, left: 0, right: 0, width: 0, x: 0, y: 0 };
    };
    try {
      render(<Page />);
      expect(FakeIO.all[0].opts.rootMargin).toBe('-49px 0px 0px 0px');
      cleanup();
      render(<Page hint />);
      expect(FakeIO.all[1].opts.rootMargin).toBe('-94px 0px 0px 0px');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = real;
    }
  });

  it('lets go of its observer when the page goes, and starts again for the next page', () => {
    const { rerender, unmount } = render(<Page />);
    const first = FakeIO.all[0];
    act(() => first.fire({ isIntersecting: false, boundingClientRect: { top: -150, bottom: 60 } }));
    rerender(<Page title="Next" pageKey="b" />);
    expect(first.disconnected).toBe(true);
    expect(band().classList.contains('shown')).toBe(false);
    unmount();
    expect(FakeIO.all[1].disconnected).toBe(true);
  });

  it('draws the band, hidden, where there is no IntersectionObserver', () => {
    delete globalThis.IntersectionObserver;
    expect(() => render(<Page />)).not.toThrow();
    expect(band().classList.contains('shown')).toBe(false);
  });

  it('stickyCover: what sits over the column top, the "Back to" row and the band together', () => {
    const rect = (h) => () => ({ top: 0, bottom: h, height: h, left: 0, right: 0, width: 0 });
    render(<Page hint />);
    document.querySelector('.back-hint-row').getBoundingClientRect = rect(45);
    band().getBoundingClientRect = rect(44);
    expect(stickyCover(document.querySelector('.para'))).toBe(89);
    cleanup();
    render(<Page />);
    band().getBoundingClientRect = rect(44);
    expect(stickyCover(document.querySelector('.para'))).toBe(44);
  });
});
