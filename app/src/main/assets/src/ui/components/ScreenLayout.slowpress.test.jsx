/* A slow press is a tap (v08-01, improvement sweep 2026-09-22 REPORT #6).

   ScreenLayout's scroll-lift guard also treated ANY press held over 300 ms as
   an accident: it stopped the touchend on the control under the finger and ate
   the click that followed. Nothing moved and nothing was selected, and the
   press still did nothing - on every button, link and footnote marker inside
   the screens that use ScreenLayout. Older hands press slowly; on Android the
   long-press only begins at ~400 ms (up to 1.5 s with a longer Touch & hold
   delay), so 300-400 ms was a dead window for everyone and a wide one for some.

   A hold is an accident only when it began a text selection: the reader
   pressed to select words, and lifting must not also open the footnote under
   the finger. The scroll-lift cases stay in ScreenLayout.test.jsx. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { ScreenLayout } from './ScreenLayout.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).__scrollEl = null;
  globalThis.ResizeObserver = globalThis.ResizeObserver
    || class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  const s = window.getSelection();
  if (s) s.removeAllRanges();
});

function fireTouch(target, type, x, y) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }], configurable: true });
  target.dispatchEvent(ev);
}

function fireClick(target) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

const SL = /** @type {any} */ (ScreenLayout);

function mount() {
  return render(
    <SL hideTabsBtn navChildren={null}>
      <p data-testid="words">Grace to you and peace from God our Father.</p>
      <button data-testid="content-btn">content</button>
    </SL>,
  );
}

/** Drive performance.now() so the hold length is exact. */
function withClock(fn) {
  const real = performance.now;
  let t = 1000;
  /** @type {any} */ (performance).now = () => t;
  try { return fn((next) => { t = next; }); }
  finally { /** @type {any} */ (performance).now = real; }
}

/** Touch down on `target`, hold `ms` without moving, optionally select words meanwhile, lift. */
function press(target, ms, selectDuringHold) {
  let touchendReached = false;
  target.addEventListener('touchend', () => { touchendReached = true; });
  withClock((setT) => {
    act(() => {
      fireTouch(target, 'touchstart', 100, 300);
      if (selectDuringHold) selectDuringHold();
      setT(1000 + ms);
      fireTouch(target, 'touchend', 100, 300);
    });
  });
  return { touchendReached };
}

function selectWords(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

describe('ScreenLayout: a slow, still press is a tap (v08-01)', () => {
  it('a 450 ms press on a button that selects nothing reaches the button and is not eaten', () => {
    const { getByTestId } = mount();
    const btn = getByTestId('content-btn');
    const { touchendReached } = press(btn, 450);
    expect(touchendReached).toBe(true);
    expect(fireClick(btn).defaultPrevented).toBe(false);
  });

  it('a 1.5 s press (a long Touch & hold delay) is still a tap when nothing was selected', () => {
    const { getByTestId } = mount();
    const btn = getByTestId('content-btn');
    press(btn, 1500);
    expect(fireClick(btn).defaultPrevented).toBe(false);
  });

  it('a long press that selected words still eats the lift: selecting must not also press what is under the finger', () => {
    const { getByTestId } = mount();
    const btn = getByTestId('content-btn');
    const words = getByTestId('words');
    const { touchendReached } = press(btn, 600, () => selectWords(words));
    expect(touchendReached).toBe(false);
    expect(fireClick(btn).defaultPrevented).toBe(true);
  });

  it('a selection that was already there before the press does not make a slow press an accident', () => {
    const { getByTestId } = mount();
    const btn = getByTestId('content-btn');
    selectWords(getByTestId('words'));
    press(btn, 450);
    expect(fireClick(btn).defaultPrevented).toBe(false);
  });
});
