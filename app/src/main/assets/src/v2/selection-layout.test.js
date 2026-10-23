// @ts-check
/* v2's pieces for main's selection drag guard (selection-layout.js; myweb mw-rs1). main's own drag rules are proven in
   ui/sheets/selection-drag.test.js against main's page; here the guard reads v2's page: its scroller is the reading
   column, its mini player the dock, its top bar the band. jsdom does no layout, so the boxes are drawn by hand. */
import { describe, it, expect, afterEach } from 'vitest';
import { readingEdges, liveColumnOf, dockTop } from '../ui/sheets/selection-drag.js';
import { V2_DRAG_LAYOUT } from './selection-layout.js';

const box = (el, top, bottom) => {
  el.getBoundingClientRect = () => /** @type {any} */ ({ top, bottom, left: 0, right: 400, width: 400, height: bottom - top });
};

function page() {
  document.body.innerHTML = '<div class="v2 v2-phone">'
    + '<div class="tb">John 3</div>'
    + '<div class="content reader" data-scroller=""><div class="body g bible"><span class="v" data-hl-key="bible:john:3:1">'
    + '<span class="vn">1</span> <span class="vw">There was a man</span></span></div></div>'
    + '<div class="mini">Now playing</div><nav class="tabbar">Places</nav></div>';
  const col = /** @type {HTMLElement} */ (document.querySelector('[data-scroller]'));
  box(col, 56, 768);
  box(/** @type {HTMLElement} */ (document.querySelector('.mini')), 640, 700);
  box(/** @type {HTMLElement} */ (document.querySelector('.tabbar')), 700, 768);
  return col;
}

afterEach(() => { document.body.innerHTML = ''; });

describe("v2's page read by the selection drag guard", () => {
  it('the scroller is the reading column (main\'s layout finds none on v2\'s page)', () => {
    const col = page();
    const words = /** @type {Node} */ (document.querySelector('.vw')?.firstChild);
    expect(liveColumnOf(words, V2_DRAG_LAYOUT)).toBe(col);
    expect(liveColumnOf(words)).toBe(null);
    const peek = document.createElement('div');
    peek.setAttribute('inert', '');
    peek.innerHTML = '<div data-scroller=""><p>John 4</p></div>';
    /** @type {Element} */ (document.querySelector('.v2')).appendChild(peek);
    expect(liveColumnOf(/** @type {Node} */ (peek.querySelector('p')?.firstChild), V2_DRAG_LAYOUT)).toBe(null);
  });

  it('the reading text ends at the mini player, or at the tab bar with none playing', () => {
    const col = page();
    expect(dockTop(document, 768, V2_DRAG_LAYOUT)).toBe(640);
    expect(readingEdges(col, V2_DRAG_LAYOUT)).toEqual({ top: 56, bottom: 640, left: 0, right: 400 });
    document.querySelector('.mini')?.remove();
    expect(readingEdges(col, V2_DRAG_LAYOUT).bottom).toBe(700);
  });

  it('the top bar pinned inside the desktop column is the band the text shows under', () => {
    const col = page();
    const tb = /** @type {HTMLElement} */ (document.querySelector('.tb'));
    col.prepend(tb);
    box(tb, 56, 120);
    expect(readingEdges(col, V2_DRAG_LAYOUT).top).toBe(120);
  });
});
