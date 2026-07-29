/* useFocusTrap — Tab containment for modal dialogs (W10 / FABLE5 [13]).
   ─────────────────────────────────────────────────────────────────────
   Pins the trap contract: initial focus lands inside on open, Tab wraps
   last→first and Shift+Tab wraps first→last, focus that escaped is pulled
   back, a STACKED trap wins over the one beneath it, and closing restores
   focus to the pre-open element. All jsdom — the hook deliberately skips
   layout-based visibility probes so these tests are faithful. */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusTrap } from './use-focus-trap.js';

/** @type {HTMLElement[]} */
let cleanupEls = [];
afterEach(() => {
  cleanupEls.forEach((el) => el.remove());
  cleanupEls = [];
});

/** Build a dialog with three buttons; returns { root, buttons } */
function buildDialog(idPrefix = 'd') {
  const root = document.createElement('div');
  const mk = (name) => {
    const b = document.createElement('button');
    b.id = idPrefix + '-' + name;
    b.textContent = name;
    root.appendChild(b);
    return b;
  };
  const buttons = [mk('one'), mk('two'), mk('three')];
  document.body.appendChild(root);
  cleanupEls.push(root);
  return { root, buttons };
}

const pressTab = (shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

function mountTrap(root, active = true) {
  const hook = renderHook((p) => useFocusTrap(p.active), { initialProps: { active } });
  hook.result.current.current = root;
  hook.rerender({ active: false });
  hook.rerender({ active });
  return hook;
}

describe('useFocusTrap', () => {
  it('focuses the first focusable on open ([data-autofocus] wins when present)', () => {
    const { root, buttons } = buildDialog('a');
    const hook = mountTrap(root);
    expect(document.activeElement).toBe(buttons[0]);
    hook.unmount();

    const { root: r2, buttons: b2 } = buildDialog('b');
    b2[1].setAttribute('data-autofocus', '');
    const hook2 = mountTrap(r2);
    expect(document.activeElement).toBe(b2[1]);
    hook2.unmount();
  });

  it('Tab on the last focusable wraps to the first (and is preventDefaulted)', () => {
    const { root, buttons } = buildDialog('c');
    const hook = mountTrap(root);
    buttons[2].focus();
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    hook.unmount();
  });

  it('Shift+Tab on the first wraps to the last', () => {
    const { root, buttons } = buildDialog('d');
    const hook = mountTrap(root);
    buttons[0].focus();
    const e = pressTab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
    hook.unmount();
  });

  it('Tab in the middle is left to the browser (no preventDefault)', () => {
    const { root, buttons } = buildDialog('e');
    const hook = mountTrap(root);
    buttons[1].focus();
    const e = pressTab();
    expect(e.defaultPrevented).toBe(false);
    hook.unmount();
  });

  it('focus that escaped the container is pulled back on the next Tab', () => {
    const { root, buttons } = buildDialog('f');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    cleanupEls.push(outside);
    const hook = mountTrap(root);
    outside.focus();
    pressTab();
    expect(document.activeElement).toBe(buttons[0]);
    hook.unmount();
  });

  it('a stacked trap wins; the lower trap resumes when it closes', () => {
    const { root: lower, buttons: lowBtns } = buildDialog('low');
    const { root: upper, buttons: upBtns } = buildDialog('up');
    const hookLow = mountTrap(lower);
    const hookUp = mountTrap(upper);
    upBtns[2].focus();
    pressTab();
    expect(document.activeElement).toBe(upBtns[0]);   // upper trap steered
    hookUp.unmount();
    lowBtns[2].focus();
    pressTab();
    expect(document.activeElement).toBe(lowBtns[0]);  // lower trap active again
    hookLow.unmount();
  });

  it('restores focus to the pre-open element on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    cleanupEls.push(opener);
    opener.focus();
    const { root } = buildDialog('g');
    const hook = mountTrap(root);
    expect(document.activeElement).not.toBe(opener);
    hook.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('an empty dialog focuses its container (tabindex -1 applied) and eats Tab', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanupEls.push(root);
    const hook = mountTrap(root);
    expect(document.activeElement).toBe(root);
    expect(root.getAttribute('tabindex')).toBe('-1');
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    hook.unmount();
  });

  it('respects focus the dialog already placed inside itself (React autoFocus)', () => {
    const { root, buttons } = buildDialog('i');
    buttons[1].focus();                       // dialog's own autoFocus ran first
    const hook = mountTrap(root);
    expect(document.activeElement).toBe(buttons[1]);
    hook.unmount();
  });

  it('inactive = no trap: Tab is untouched and nothing is focused', () => {
    const { root } = buildDialog('h');
    const hook = renderHook((p) => useFocusTrap(p.active), { initialProps: { active: false } });
    hook.result.current.current = root;
    const e = pressTab();
    expect(e.defaultPrevented).toBe(false);
    hook.unmount();
  });
});
