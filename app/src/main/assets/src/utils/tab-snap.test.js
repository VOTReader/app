/* tab-snap (TABS1, 2026-11-11): a Tabs card is a trimmed copy of the page's own markup.
   jsdom has no layout, so each test gives the elements it builds their boxes. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { snapLiveTab, snapArea, liveReadingArea, paintSnap, readSnap, SNAP_VERSION } from './tab-snap.js';

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

  // FIXC (REVIEW-readers 8): a snapshot 1 s after a scroll could land in a slow sideways drag and keep its offset.
  it('a snapshot taken mid-swipe shows the page at rest, not slid part-way off its side', () => {
    page();
    const track = /** @type {HTMLElement} */ (document.querySelector('.pager-track'));
    track.style.transform = 'translate3d(-140px, 0, 0)';
    track.style.transition = 'none';
    track.style.willChange = 'transform';
    const s = /** @type {any} */ (snapLiveTab());
    expect(s.html).not.toMatch(/translate|will-change|transition/);
    expect(track.style.transform).toBe('translate3d(-140px, 0, 0)');   // the live page is left alone
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

describe('liveReadingArea — viewport and scroller edges (tests-6 item 11)', () => {
  function layoutWithoutViewport() {
    document.body.innerHTML = `
      <div class="screen-layout reader"><main class="screen-scroll"><div class="pager-track">
        <section class="seen"><p>God called the light Day</p></section>
      </div></main></div>`;
    const sc = document.querySelector('.screen-scroll');
    Object.defineProperty(sc, 'clientWidth', { value: 412, configurable: true });
    Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(sc, 'offsetWidth', { value: 412, configurable: true });
    boxes.set(sc, { top: 56, height: 800 });
    boxes.set(document.querySelector('.pager-track'), { top: -2000, height: 5000 });
    boxes.set(document.querySelector('.seen'), { top: 100, height: 400 });
  }

  it('snaps a layout whose scroller sits directly under the layout (no pager-viewport)', () => {
    layoutWithoutViewport();
    const area = /** @type {any} */ (liveReadingArea());
    expect(area).toBeTruthy();
    expect(area.viewport).toBeNull();
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    expect(s.w).toBe(412);
    const t = document.createElement('template');
    t.innerHTML = s.html;
    expect(t.content.querySelector('.screen-layout.reader > .screen-scroll > .pager-track')).toBeTruthy();
    expect(t.content.querySelector('.pager-viewport')).toBeNull();
  });

  it('returns null when the only layout has a scroller too small to read', () => {
    document.body.innerHTML = '<div class="screen-layout"><div class="screen-scroll">x</div></div>';
    expect(snapLiveTab()).toBeNull();
  });

  it('returns null when the only layout has no scroller at all', () => {
    document.body.innerHTML = '<div class="screen-layout"><p>no scroller here</p></div>';
    expect(snapLiveTab()).toBeNull();
  });
});

describe('snapLiveTab — copy() flow parents (tests-6 item 11)', () => {
  function flowPage(/** @type {string | undefined} */ display, /** @type {string | undefined} */ flexDirection) {
    document.body.innerHTML = `
      <div class="screen-layout reader">
        <div class="pager-viewport"><main class="screen-scroll"><div class="pager-track">
          <section class="flow" style="display:${display}${flexDirection ? `;flex-direction:${flexDirection}` : ''}"><p>flow text</p></section>
        </div></main></div></div>`;
    const sc = document.querySelector('.screen-scroll');
    Object.defineProperty(sc, 'clientWidth', { value: 412, configurable: true });
    Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(sc, 'offsetWidth', { value: 412, configurable: true });
    boxes.set(sc, { top: 56, height: 800 });
    boxes.set(document.querySelector('.pager-track'), { top: -2000, height: 5000 });
    boxes.set(document.querySelector('.flow'), { top: 100, height: 400 });
  }

  it.each([
    ['flow-root', undefined],
    ['list-item', undefined],
    ['flex', 'column'],
    ['flex', 'row'],
  ])('copies a %s parent with a %s flow without moving its children sideways', (display, dir) => {
    flowPage(display, dir);
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    expect(s.html).toContain('flow text');
  });

  it('copies an inline-flex column track (the track itself is the flow parent)', () => {
    flowPage('block', undefined);
    const track = /** @type {HTMLElement} */ (document.querySelector('.pager-track'));
    track.style.display = 'inline-flex';
    track.style.flexDirection = 'column';
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    expect(s.html).toContain('flow text');
  });
});

describe('snapLiveTab — copy() child edges (tests-6 item 11)', () => {
  it('skips comment nodes (not elements, not text)', () => {
    page();
    /** @type {any} */ (document.querySelector('.seen')).appendChild(document.createComment('a note'));
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    expect(s.html).toContain('God called the light Day');
  });

  it('drops an absolutely-positioned block wholly outside the band (no spacer — it takes no room)', () => {
    page();
    const ghost = document.createElement('section');
    ghost.className = 'ghost';
    ghost.style.position = 'absolute';
    ghost.innerHTML = '<p>gone</p>';
    /** @type {any} */ (document.querySelector('.pager-track')).appendChild(ghost);
    boxes.set(ghost, { top: -2000, height: 100 });
    const s = /** @type {any} */ (snapLiveTab());
    expect(s.html).not.toContain('gone');
    expect(s.html).not.toContain('height:100px');
  });

  it('anchors a leaf block copied whole, and recurses a later block that is not the anchor', () => {
    document.body.innerHTML = `
      <div class="screen-layout reader">
        <div class="pager-viewport"><main class="screen-scroll"><div class="pager-track">
          <p class="lead">first on screen</p>
          <section class="later"><p>second block</p></section>
        </div></main></div></div>`;
    const sc = document.querySelector('.screen-scroll');
    Object.defineProperty(sc, 'clientWidth', { value: 412, configurable: true });
    Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(sc, 'offsetWidth', { value: 412, configurable: true });
    boxes.set(sc, { top: 56, height: 800 });
    boxes.set(document.querySelector('.pager-track'), { top: -2000, height: 5000 });
    boxes.set(document.querySelector('.lead'), { top: 100, height: 20 });
    boxes.set(document.querySelector('.later'), { top: 130, height: 300 });
    const s = /** @type {any} */ (snapLiveTab());
    expect(s).toBeTruthy();
    const t = document.createElement('template');
    t.innerHTML = s.html;
    expect(t.content.querySelector('.lead[data-snap-anchor]')).toBeTruthy();
    expect(t.content.querySelector('.later')).toBeTruthy();
    expect(t.content.querySelector('.later[data-snap-anchor]')).toBeNull();
  });
});

describe('snapArea — off-screen tab with no track and no viewport (tests-6 item 11)', () => {
  it('copies a scroller with no pager track and no viewport', () => {
    document.body.innerHTML = `
      <div class="screen-layout reader"><main class="screen-scroll">
        <section class="seen"><p>off-screen tab</p></section>
      </main></div>`;
    const layout = /** @type {any} */ (document.querySelector('.screen-layout'));
    const scroller = /** @type {any} */ (document.querySelector('.screen-scroll'));
    Object.defineProperty(scroller, 'clientWidth', { value: 412, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(scroller, 'offsetWidth', { value: 412, configurable: true });
    boxes.set(scroller, { top: 56, height: 800 });
    boxes.set(document.querySelector('.seen'), { top: 100, height: 400 });
    const s = snapArea({ layout, viewport: null, scroller, track: null });
    expect(s.w).toBe(412);
    expect(s.h).toBe(800);
    expect(s.html).toContain('off-screen tab');
    expect(s.html).not.toContain('pager-viewport');
    expect(s.html).not.toContain('pager-track');
  });
});

describe('readSnap — node shapes (tests-6 item 11)', () => {
  it('drops non-element nodes when re-reading stored markup', () => {
    const r = /** @type {any} */ (readSnap({ v: SNAP_VERSION, html: 'stray text<div class="screen-layout"><p>kept</p></div>', w: 412, h: 800, top: 0, st: 0 }));
    expect(r).toBeTruthy();
    expect(r.html).not.toContain('stray text');
    expect(r.html).toContain('kept');
  });

  it('returns null when everything in the stored markup scrubs away', () => {
    expect(readSnap({ v: SNAP_VERSION, html: '<script>bad()</script>', w: 412, h: 800, top: 0, st: 0 })).toBeNull();
  });
});

describe('paintSnap (tests-6 item 11)', () => {
  function box(/** @type {number} */ w, /** @type {number} */ h) {
    const b = document.createElement('div');
    Object.defineProperty(b, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(b, 'clientHeight', { value: h, configurable: true });
    document.body.appendChild(b);
    return b;
  }
  const snap = (/** @type {any} */ over = {}) => ({ v: SNAP_VERSION, html: '<div class="screen-layout"><div class="screen-scroll"><p>page text</p></div></div>', w: 412, h: 800, top: 0, st: 0, ...over });

  it('returns false when the box has no width yet', () => {
    expect(paintSnap(box(0, 800), snap())).toBe(false);
  });

  it('paints the copy at the live width and scrolls to the stored position', () => {
    const b = box(412, 800);
    expect(paintSnap(b, snap({ st: 123 }))).toBe(true);
    const pageEl = /** @type {HTMLElement} */ (b.querySelector('.tab-snap-page'));
    expect(pageEl).toBeTruthy();
    expect(pageEl.style.transform).toBe('scale(1)');
    const sc = /** @type {HTMLElement} */ (b.querySelector('.screen-scroll'));
    expect(sc.scrollTop).toBe(123);
    expect(b.querySelector('.tab-snap-room')).toBeNull();
  });

  it('returns true with no scroller in the copy (nothing to scroll)', () => {
    const b = box(412, 800);
    expect(paintSnap(b, snap({ html: '<div class="screen-layout"><p>no scroller</p></div>' }))).toBe(true);
  });

  it('adds room at the end when the box is taller than the snapshot', () => {
    const b = box(412, 1600);
    expect(paintSnap(b, snap())).toBe(true);
    const room = /** @type {HTMLElement} */ (b.querySelector('.tab-snap-room'));
    expect(room).toBeTruthy();
    expect(room.style.height).toBe('800px');
  });

  it('scrolls the anchor into place when the copy carries one', () => {
    const b = box(412, 800);
    const html = '<div class="screen-layout"><div class="screen-scroll"><p data-snap-anchor>anchored</p></div></div>';
    expect(paintSnap(b, snap({ html, top: 44 }))).toBe(true);
    const sc = /** @type {HTMLElement} */ (b.querySelector('.screen-scroll'));
    expect(sc.scrollTop).toBe(0);
  });

  it('falls back to scrollTop 0 when the stored position is 0', () => {
    const b = box(412, 800);
    expect(paintSnap(b, snap({ st: 0 }))).toBe(true);
    const sc = /** @type {HTMLElement} */ (b.querySelector('.screen-scroll'));
    expect(sc.scrollTop).toBe(0);
  });
});
