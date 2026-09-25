// @ts-nocheck
/* MoreMenu — the top bar's ⋯ menu (the redesign, 2026-09-25).
   ─────────────────────────────────────────────────────────────────────
   Pins what the compact bar promises the reader: the three icons that leave
   the bar (Settings, History, the theme switch) are reachable, by name, from
   one menu; the theme and text size change in place; leaving actions close
   it; Escape / Android Back close it through the modal registry (never a
   listener of its own); and with the compact bar off nothing renders. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { MoreMenuBtn, NavMenuContext, stepFontScale } from './MoreMenu.jsx';

beforeEach(() => { globalThis.ReactDOM = ReactDOM; });
afterEach(() => { cleanup(); });

function setup(over = {}) {
  const value = {
    enabled: true, historyEnabled: true, theme: 'dark', fontScale: '1',
    onThemeChange: vi.fn(), onSettings: vi.fn(), onHistory: vi.fn(), onFontScale: vi.fn(),
    ...over,
  };
  const utils = render(
    <NavMenuContext.Provider value={value}>
      <nav className="top-nav"><MoreMenuBtn /></nav>
      <p id="outside">page</p>
    </NavMenuContext.Provider>,
  );
  const btn = () => document.querySelector('.nav-more-btn');
  const menu = () => document.querySelector('.more-menu');
  const open = () => { act(() => { fireEvent.click(btn()); }); };
  const item = (name) => [...document.querySelectorAll('.more-menu [role^="menuitem"]')]
    .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === name);
  return { value, utils, btn, menu, open, item };
}

describe('MoreMenuBtn — the compact bar', () => {
  it('renders nothing with the compact bar off (the old icon row is back, untouched)', () => {
    const { btn } = setup({ enabled: false });
    expect(btn()).toBeNull();
  });

  it('is a named button that says it opens a menu, and opens it', () => {
    const { btn, menu, open } = setup();
    expect(btn().getAttribute('aria-label')).toBe('More');
    expect(btn().getAttribute('aria-haspopup')).toBe('menu');
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    open();
    expect(menu()).not.toBeNull();
    expect(menu().getAttribute('role')).toBe('menu');
    expect(btn().getAttribute('aria-expanded')).toBe('true');
    expect(menu().parentElement).toBe(document.body);   // portaled over the page, not inside the bar
  });

  it('names every action that left the bar: History, the theme, Text size, Settings', () => {
    const { open, item } = setup();
    open();
    for (const name of ['History', 'Dark', 'Light', 'Smaller text', 'Larger text', 'Settings']) {
      expect(item(name), name).toBeTruthy();
    }
    expect(document.activeElement, 'focus lands on the first item').toBe(item('History'));
  });

  it('leaves out History when History itself is off', () => {
    const { open, item } = setup({ historyEnabled: false });
    open();
    expect(item('History')).toBeUndefined();
    expect(item('Settings')).toBeTruthy();
  });

  it('History and Settings leave the screen: they close the menu, then act', () => {
    const s = setup();
    s.open();
    act(() => { fireEvent.click(s.item('Settings')); });
    expect(s.value.onSettings).toHaveBeenCalledTimes(1);
    expect(s.menu()).toBeNull();
    s.open();
    act(() => { fireEvent.click(s.item('History')); });
    expect(s.value.onHistory).toHaveBeenCalledTimes(1);
    expect(s.menu()).toBeNull();
  });

  it('the theme switches in place and the menu stays open; the current theme is checked and a no-op', () => {
    const s = setup({ theme: 'dark' });
    s.open();
    expect(s.item('Dark').getAttribute('aria-checked')).toBe('true');
    expect(s.item('Light').getAttribute('aria-checked')).toBe('false');
    act(() => { fireEvent.click(s.item('Dark')); });
    expect(s.value.onThemeChange).not.toHaveBeenCalled();
    act(() => { fireEvent.click(s.item('Light')); });
    expect(s.value.onThemeChange).toHaveBeenCalledWith('light');
    expect(s.menu(), 'stays open so the change is seen').not.toBeNull();
  });

  it('text size steps by 10 % in place, shows Standard at 100 %, and stops at the slider limits', () => {
    const s = setup({ fontScale: '1' });
    s.open();
    expect(document.querySelector('.more-menu-step-value').textContent).toBe('Standard');
    act(() => { fireEvent.click(s.item('Larger text')); });
    expect(s.value.onFontScale).toHaveBeenLastCalledWith('1.1');
    act(() => { fireEvent.click(s.item('Smaller text')); });
    expect(s.value.onFontScale).toHaveBeenLastCalledWith('0.9');
    expect(s.menu()).not.toBeNull();
    cleanup();
    const top = setup({ fontScale: '3' });
    top.open();
    expect(top.item('Larger text').disabled).toBe(true);
    expect(document.querySelector('.more-menu-step-value').textContent).toBe('300%');
  });

  it('an outside press closes it; a press inside does not', () => {
    const s = setup();
    s.open();
    act(() => { fireEvent.pointerDown(s.menu()); });
    expect(s.menu()).not.toBeNull();
    act(() => { fireEvent.pointerDown(document.getElementById('outside')); });
    expect(s.menu()).toBeNull();
  });

  it('Escape and Android Back reach it through the modal registry, and focus returns to ⋯', () => {
    const s = setup();
    expect(globalThis.modalRegistry.isAnyOpen()).toBe(false);
    s.open();
    expect(globalThis.modalRegistry.openIds()).toContain('more-menu');
    act(() => { globalThis.modalRegistry.peek().dismiss(); });
    expect(s.menu()).toBeNull();
    expect(globalThis.modalRegistry.isAnyOpen()).toBe(false);
    expect(document.activeElement).toBe(s.btn());
  });

  it('arrow keys move between the items and wrap', () => {
    const s = setup();
    s.open();
    const order = ['History', 'Dark', 'Light', 'Smaller text', 'Larger text', 'Settings'];
    act(() => { fireEvent.keyDown(s.menu(), { key: 'ArrowUp' }); });
    expect(document.activeElement).toBe(s.item('Settings'));
    act(() => { fireEvent.keyDown(s.menu(), { key: 'ArrowDown' }); });
    expect(document.activeElement).toBe(s.item(order[0]));
    act(() => { fireEvent.keyDown(s.menu(), { key: 'End' }); });
    expect(document.activeElement).toBe(s.item('Settings'));
  });
});

describe('stepFontScale', () => {
  it('steps by 0.1 without drift and clamps to the Settings slider (0.8-3)', () => {
    expect(stepFontScale('1', 1)).toBe('1.1');
    expect(stepFontScale('1.1', 1)).toBe('1.2');
    expect(stepFontScale('0.8', -1)).toBe('0.8');
    expect(stepFontScale('3', 1)).toBe('3');
    expect(stepFontScale('2.95', 1)).toBe('3');
    expect(stepFontScale(undefined, 1)).toBe('1.1');
    expect(stepFontScale('junk', -1)).toBe('0.9');
  });
});
