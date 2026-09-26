/* tap-guard (cp1 sweep) — the reading screens' tap-to-hide headings, title
   and summary are words AND controls. A double-click on a heading hid every
   heading with its first click and selected a word of the verse that slid up
   with its second; a drag over a heading's words hid them. */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { clickEndedSelection, swallowFollowUpClicks, tapToggle } from './tap-guard.js';

const origGetSelection = window.getSelection;
afterEach(() => {
  window.getSelection = origGetSelection;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/** @param {Range | null} range */
function stubSelection(range) {
  window.getSelection = () => /** @type {any} */ ({
    isCollapsed: !range, rangeCount: range ? 1 : 0,
    getRangeAt: () => range, toString: () => (range ? range.toString() : ''),
  });
}
/** @param {EventTarget} target @param {string} type @param {number} detail */
function press(target, type, detail) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, detail });
  target.dispatchEvent(ev);
  return ev;
}
function heading() {
  const h = document.createElement('div');
  h.className = 'section-heading section-heading-tappable';
  h.textContent = 'Rivers of Living Water';
  document.body.appendChild(h);
  return h;
}

describe('clickEndedSelection', () => {
  it('a drag or double-click over the control\'s own words is selecting, not a tap', () => {
    const h = heading();
    const r = document.createRange();
    r.setStart(/** @type {any} */ (h.firstChild), 0);
    r.setEnd(/** @type {any} */ (h.firstChild), 6);
    stubSelection(r);
    expect(clickEndedSelection(h)).toBe(true);
  });

  it('a tap (nothing selected) or a selection somewhere else is a tap', () => {
    const h = heading();
    stubSelection(null);
    expect(clickEndedSelection(h)).toBe(false);
    const other = document.createElement('p');
    other.textContent = 'On the last day';
    document.body.appendChild(other);
    const r = document.createRange();
    r.selectNodeContents(other);
    stubSelection(r);
    expect(clickEndedSelection(h)).toBe(false);
  });
});

describe('swallowFollowUpClicks', () => {
  it('eats the rest of a double-click wherever it lands, and lets single presses through', () => {
    const verse = document.createElement('span');
    verse.textContent = 'He who believes';
    document.body.appendChild(verse);
    const seen = vi.fn();
    document.addEventListener('click', seen);
    try {
      swallowFollowUpClicks();
      const down2 = press(verse, 'mousedown', 2);
      press(verse, 'click', 2);
      press(verse, 'dblclick', 2);
      expect(down2.defaultPrevented, 'no word selected by the second press').toBe(true);
      expect(seen).not.toHaveBeenCalled();
      press(verse, 'click', 1);
      expect(seen).toHaveBeenCalledTimes(1);
    } finally { document.removeEventListener('click', seen); }
  });

  it('stands down after a moment: a later double-click selects as usual', () => {
    vi.useFakeTimers();
    const verse = document.createElement('span');
    document.body.appendChild(verse);
    swallowFollowUpClicks(500);
    vi.advanceTimersByTime(600);
    expect(press(verse, 'mousedown', 2).defaultPrevented).toBe(false);
  });
});

describe('tapToggle', () => {
  it('a tap acts; the end of a selection over the control does not', () => {
    const h = heading();
    const act = vi.fn();
    stubSelection(null);
    tapToggle(act)({ currentTarget: h });
    expect(act).toHaveBeenCalledTimes(1);
    const r = document.createRange();
    r.selectNodeContents(h);
    stubSelection(r);
    tapToggle(act)({ currentTarget: h });
    expect(act).toHaveBeenCalledTimes(1);
  });
});
