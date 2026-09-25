// @ts-nocheck - the popover reads its store and hooks as free globals (bundle-d)
/* n6-13 (sweep 2, 09-25): the popover for a bookmark near the bottom of the screen
   opened at the tap's y and ran off the bottom: its left edge was kept on screen,
   its bottom was not. It now opens above the tap when it would not fit below. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BookmarkPopover } from './BookmarkPopover.jsx';

const ORIG_H = window.innerHeight;
let origRect;

beforeEach(() => {
  globalThis.BookmarkStore = { get: (id) => ({ id, label: 'Genesis 1:1', created: 1 }), remove: () => {} };
  globalThis.useFocusTrap = () => ({ current: null });
  globalThis.relativeDate = () => '';
  globalThis.ConfirmStrip = () => null;
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  origRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const h = this.classList && this.classList.contains('bkm-popover') ? 200 : 0;
    return { top: 0, left: 0, right: 0, bottom: h, width: 300, height: h, x: 0, y: 0, toJSON() {} };
  };
});
afterEach(() => {
  cleanup();
  Element.prototype.getBoundingClientRect = origRect;
  Object.defineProperty(window, 'innerHeight', { value: ORIG_H, configurable: true });
});

const top = (c) => parseFloat(c.querySelector('.bkm-popover').style.top);

describe('BookmarkPopover stays on screen (n6-13)', () => {
  it('opens below a tap near the top', () => {
    const { container } = render(<BookmarkPopover bkmIds={['b1']} x={100} y={120} onClose={() => {}} onNavigate={() => {}} />);
    expect(top(container)).toBe(120);
  });

  it('opens above a tap near the bottom, so all of it shows', () => {
    const { container } = render(<BookmarkPopover bkmIds={['b1']} x={100} y={740} onClose={() => {}} onNavigate={() => {}} />);
    expect(top(container) + 200).toBeLessThanOrEqual(800 - 8);
    expect(top(container)).toBeGreaterThanOrEqual(8);
  });
});
