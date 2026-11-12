/* tab-snap (TABS1, 2026-11-11): a Tabs card is a trimmed copy of the page's own markup.
   jsdom has no layout, so each test gives the elements it builds their boxes. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { snapLiveTab, readSnap, SNAP_VERSION } from './tab-snap.js';

/** Give an element a box (viewport coords) and the scroller its client size. */
const boxes = new Map();
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  boxes.clear();
  Element.prototype.getBoundingClientRect = function () {
    const b = boxes.get(this) || { top: 0, height: 0 };
    return /** @type {any} */ ({ top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 412, width: 412, x: 0, y: b.top });
  };
  document.body.innerHTML = '';
});
afterEach(() => { Element.prototype.getBoundingClientRect = realRect; document.body.innerHTML = ''; });

function page() {
  document.body.innerHTML = `
    <div class="screen-layout reader"><nav class="top-nav">bar</nav>
      <div class="pager-viewport"><main class="screen-scroll"><div class="pager-track">
        <section id="s1" class="far-above"><p>long gone</p></section>
        <section class="seen"><p id="p1" data-hl-key="gen-1-5" onclick="alert(1)">God called the light Day</p><script>bad()</script>
          <audio src="x.mp3"></audio></section>
        <section class="far-below"><p>later</p></section>
      </div></main></div></div>`;
  const sc = document.querySelector('.screen-scroll');
  Object.defineProperty(sc, 'clientWidth', { value: 412, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(sc, 'offsetWidth', { value: 412, configurable: true });
  boxes.set(sc, { top: 56, height: 800 });
  boxes.set(document.querySelector('.pager-track'), { top: -2000, height: 5000 });
  boxes.set(document.querySelector('.far-above'), { top: -2000, height: 1500 });
  boxes.set(document.querySelector('.seen'), { top: 100, height: 400 });
  boxes.set(document.querySelector('#p1'), { top: 120, height: 60 });
  boxes.set(document.querySelector('.far-below'), { top: 2000, height: 900 });
}

describe('snapLiveTab', () => {
  it('copies the visible blocks, spaces out the rest, anchors the first block on screen and scrubs the copy', () => {
    page();
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    expect(s.v).toBe(SNAP_VERSION);
    expect(s.w).toBe(412);
    expect(s.h).toBe(800);
    expect(s.top).toBe(44);                              // .seen starts 44 px below the scroller's top
    const t = document.createElement('template');
    t.innerHTML = s.html;
    const root = t.content;
    expect(root.querySelector('.screen-layout.reader > .pager-viewport > .screen-scroll > .pager-track')).toBeTruthy();
    expect(root.querySelector('.top-nav')).toBeNull();   // the reading area only
    expect(root.querySelector('.far-above')).toBeNull(); // replaced by a spacer of its height
    expect(s.html).toContain('height:1500px');
    expect(root.querySelector('.far-below')).toBeNull();
    expect(root.querySelector('.seen[data-snap-anchor]')).toBeTruthy();
    expect(root.textContent).toContain('God called the light Day');
    expect(root.querySelector('script, audio')).toBeNull();
    const p = /** @type {Element} */ (root.querySelector('p'));
    expect(p.hasAttribute('id')).toBe(false);
    expect(p.hasAttribute('onclick')).toBe(false);
    expect(p.hasAttribute('data-hl-key')).toBe(false);   // no annotation pass or anchor lookup finds a card
    expect(p.getAttribute('data-snap-key')).toBe('gen-1-5');
  });

  it('copies nothing from the Tabs screen, a peek or an inert copy', () => {
    document.body.innerHTML = '<div class="tabs-overview-layer"><div class="screen-layout"><div class="screen-scroll">x</div></div></div>';
    expect(snapLiveTab()).toBeNull();
  });
});

describe('readSnap', () => {
  it('takes a well-formed row and scrubs its markup again', () => {
    const r = /** @type {any} */ (readSnap({ v: SNAP_VERSION, html: '<div class="screen-layout"><img src="a.png" onerror="x()"><script>y()</script></div>', w: 412, h: 800, top: 0, st: 0 }));
    expect(r.html).not.toContain('onerror');
    expect(r.html).not.toContain('<script');
    expect(r.html).toContain('a.png');
  });
  it('refuses rows of another shape', () => {
    expect(readSnap(null)).toBeNull();
    expect(readSnap({ v: 99, html: '<div></div>', w: 1, h: 1 })).toBeNull();
    expect(readSnap({ v: SNAP_VERSION, html: '', w: 412, h: 800 })).toBeNull();
    expect(readSnap({ v: SNAP_VERSION, html: '<div></div>', w: 0, h: 800 })).toBeNull();
  });
});
