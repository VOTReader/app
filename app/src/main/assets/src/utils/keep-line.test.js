/* keep-line (U10.1): a text size change keeps the reader's line on screen. */
import { describe, it, expect } from 'vitest';
import { keepReadersLine } from './keep-line.js';

/** A scroller whose blocks move down by `grow` px each after the change (the text got bigger above them). */
function page() {
  document.body.innerHTML = '<div class="screen-scroll"><p data-hl-key="a"></p><p data-hl-key="b"></p><p data-hl-key="c"></p></div>';
  const scroller = /** @type {HTMLElement} */ (document.querySelector('.screen-scroll'));
  let scale = 1;
  const tops = { a: 0, b: 400, c: 800 };
  scroller.getBoundingClientRect = () => /** @type {any} */ ({ top: 100, bottom: 900, height: 800 });
  for (const el of scroller.querySelectorAll('p')) {
    const k = /** @type {'a'|'b'|'c'} */ (el.getAttribute('data-hl-key'));
    el.getBoundingClientRect = () => {
      const top = 100 + tops[k] * scale - scroller.scrollTop;
      return /** @type {any} */ ({ top, bottom: top + 400 * scale, height: 400 * scale });
    };
  }
  return { scroller, grow: (s) => { scale = s; } };
}

describe('keepReadersLine', () => {
  it('the block the reader is in keeps its place on screen after the text grows', () => {
    const { scroller, grow } = page();
    scroller.scrollTop = 450;                       // block b's top is 50 px above the scroller's top
    const before = scroller.querySelector('[data-hl-key="b"]').getBoundingClientRect().top;
    keepReadersLine(() => grow(1.5));
    expect(scroller.querySelector('[data-hl-key="b"]').getBoundingClientRect().top).toBe(before);
  });

  it('at the top of the page it only makes the change', () => {
    const { scroller, grow } = page();
    let ran = false;
    keepReadersLine(() => { ran = true; grow(2); });
    expect(ran).toBe(true);
    expect(scroller.scrollTop).toBe(0);
  });

  it('with no scroller on the page it only makes the change', () => {
    document.body.innerHTML = '';
    let ran = false;
    keepReadersLine(() => { ran = true; });
    expect(ran).toBe(true);
  });
});
