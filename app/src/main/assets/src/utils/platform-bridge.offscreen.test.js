/* hideOffscreenInClone (pf1, 2026-10-22): the tab-thumbnail clone render
   hides in-flow blocks wholly off the screen so html2canvas skips measuring
   their text. jsdom has no layout, so each element's rect is stubbed. */

import { describe, it, expect } from 'vitest';
import { hideOffscreenInClone } from './platform-bridge.js';

const VH = window.innerHeight;

/** @param {Element} el @param {number} top @param {number} height */
function at(el, top, height) {
  /** @type {any} */ (el).getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top });
  return el;
}

function page() {
  document.body.innerHTML = `
    <div id="root"><div id="col"><div id="scroll">
      <p id="above">a</p><p id="edge">b</p><p id="seen">c</p><p id="below">d</p>
      <div id="abs" style="position:absolute">e</div>
      <section id="tallSeen"><p id="inAbove">f</p><p id="inSeen">g</p></section>
    </div></div></div>`;
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  at($('root'), 0, VH); at($('col'), 0, VH); at($('scroll'), -3000, 6000);
  at($('above'), -900, 300);          // wholly above, past the margin
  at($('edge'), -350, 300);           // bottom at -50: inside the 200 px margin
  at($('seen'), 100, 300);
  at($('below'), VH + 400, 300);      // wholly below, past the margin
  at($('abs'), VH + 900, 50);         // positioned: left alone
  at($('tallSeen'), -1000, 1500);     // reaches the screen: walked into
  at($('inAbove'), -1000, 400);
  at($('inSeen'), 200, 300);
  return $;
}

describe('hideOffscreenInClone', () => {
  it('hides in-flow blocks wholly off the screen and keeps what the screen shows', () => {
    const $ = page();
    const n = hideOffscreenInClone(document);
    const hid = (id) => $(id).style.visibility === 'hidden';
    expect(hid('above')).toBe(true);
    expect(hid('below')).toBe(true);
    expect(hid('inAbove')).toBe(true);
    expect(hid('edge')).toBe(false);
    expect(hid('seen')).toBe(false);
    expect(hid('inSeen')).toBe(false);
    expect(hid('tallSeen')).toBe(false);
    expect(hid('scroll')).toBe(false);
    expect(hid('abs')).toBe(false);
    expect(n).toBe(3);
  });

  it('hides nothing when layout gives no sizes (zero rects)', () => {
    document.body.innerHTML = '<div><p>a</p><p>b</p></div>';
    expect(hideOffscreenInClone(document)).toBe(0);
  });
});
