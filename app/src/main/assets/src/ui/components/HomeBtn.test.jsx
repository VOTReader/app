/* HomeBtn — the nav Home glyph.
   ─────────────────────────────────────────────────────────────────
   Owner-reported: tapping Home on the TABS OVERVIEW did nothing (PC +
   Android). __goHome only changes the screen UNDERNEATH the overlay, so
   the overlay kept covering it. The optional beforeGo prop lets an overlay
   host dismiss itself before the navigation — order is load-bearing. */

import { it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HomeBtn } from './HomeBtn.jsx';

const w = /** @type {any} */ (window);
afterEach(() => { cleanup(); delete w.__goHome; });

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

it('navigates home via the window bridge', () => {
  w.__goHome = vi.fn();
  const { container } = render(<HomeBtn />);
  click(container.querySelector('button'));
  expect(w.__goHome).toHaveBeenCalledTimes(1);
});

it('runs beforeGo FIRST so an overlay host can dismiss itself (tabs-overview Home fix)', () => {
  const calls = [];
  w.__goHome = vi.fn(() => calls.push('home'));
  const beforeGo = vi.fn(() => calls.push('before'));
  const { container } = render(<HomeBtn beforeGo={beforeGo} />);
  click(container.querySelector('button'));
  expect(calls).toEqual(['before', 'home']);
});

it('survives a missing __goHome bridge (no throw, beforeGo still runs)', () => {
  const beforeGo = vi.fn();
  const { container } = render(<HomeBtn beforeGo={beforeGo} />);
  click(container.querySelector('button'));
  expect(beforeGo).toHaveBeenCalledTimes(1);
});
