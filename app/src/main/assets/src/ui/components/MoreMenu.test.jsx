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

  /* a11y (axe aria-required-children, 2026-09-27): a role=menu may own only
     menu items and groups of them, and the text size's live readout sat inside
     it. The readout the eye sees stays where it is; the announcement comes from
     a visually hidden live region portaled beside the menu instead. */
  it('the text size is announced from outside the menu, and the menu owns no live region', () => {
    const s = setup({ fontScale: '1.1' });
    s.open();
    expect(s.menu().querySelector('[aria-live]')).toBeNull();
    const live = document.querySelector('.more-menu-live');
    expect(live).not.toBeNull();
    expect(s.menu().contains(live)).toBe(false);
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.classList.contains('sr-only')).toBe(true);
    expect(live.textContent).toBe('Text size 110%');
    expect(document.querySelector('.more-menu-step-value').textContent).toBe('110%');
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
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

/* cp2 (Corbin 2026-09-27): "Copy link to this letter" — for a reader who wants
   to send the letter, not a quote. On a reading page the site has, the ⋯ menu's
   first item copies that page's link on thevolumesoftruth.com. */
describe('MoreMenuBtn — Copy website link (cp2)', () => {
  const g = globalThis;
  let written;
  let origClipboard;
  beforeEach(() => {
    written = [];
    origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { written.push(t); return Promise.resolve(); } }, configurable: true, writable: true,
    });
    g.findEntryContext = (id) => ({
      'the-wide-path': { kind: 'letter', screen: 'vot-letter', collection: 'Volume Two', title: 'The Wide Path' },
      'come-love-awaits-you': { kind: 'wtlb', screen: 'wtlb-one-entry', collection: 'Words To Live By: Part One', title: 'Come, Love Awaits You' },
    })[id] || null;
    g.showToast = vi.fn();
  });
  afterEach(() => {
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
    else delete navigator.clipboard;
    delete g.findEntryContext; delete g.showToast; delete g.useFocusTrap;
    cleanup();
    pages.splice(0).forEach((d) => d.remove());
  });
  const pages = [];
  const pageOf = (key, html = '') => {
    const d = document.createElement('div');
    d.innerHTML = html || `<div class="page-wrapper" data-copy-key="${key}"></div>`;
    document.body.appendChild(d);
    pages.push(d);
  };
  const next = () => { cleanup(); pages.splice(0).forEach((d) => d.remove()); };
  const linkItem = () => [...document.querySelectorAll('.more-menu [role="menuitem"]')].find((b) => /Copy website link/.test(b.textContent));

  it('on a letter: first, naming the site; it copies the letter\'s link and says what was copied', async () => {
    pageOf('letter:the-wide-path');
    const { open } = setup();
    open();
    const item = linkItem();
    expect(item).toBeTruthy();
    expect(document.querySelector('.more-menu [role="menuitem"]')).toBe(item);
    expect(item.querySelector('.more-menu-item-sub').textContent).toBe('thevolumesoftruth.com');
    await act(async () => { fireEvent.click(item); });
    expect(written).toEqual(['https://www.thevolumesoftruth.com/The_Wide_Path']);
    expect(g.showToast).toHaveBeenCalledWith(expect.objectContaining({ text: 'Link copied: The Wide Path (Volume Two)' }));
    expect(document.querySelector('.more-menu')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.nav-more-btn'));
  });

  it('a Words To Live By entry copies its own section of the Part page', async () => {
    pageOf('wtlb:come-love-awaits-you');
    const { open } = setup();
    open();
    await act(async () => { fireEvent.click(linkItem()); });
    expect(written).toEqual(['https://www.thevolumesoftruth.com/Words_To_Live_By:_Part_One#Come.2C_Love_Awaits_You']);
  });

  it('the Bible (no page on the site), a screen that is no reading page, and a swipe preview offer none', () => {
    pageOf('bible:john:7');
    let s = setup();
    s.open();
    expect(linkItem()).toBeUndefined();
    next();
    s = setup();
    s.open();
    expect(linkItem()).toBeUndefined();
    next();
    pageOf('', '<div class="pager-peek" inert><div data-copy-key="letter:the-wide-path"></div></div>');
    s = setup();
    s.open();
    expect(linkItem()).toBeUndefined();
  });

  it('a refused clipboard keeps the link on screen, to copy by hand', async () => {
    g.useFocusTrap = () => ({ current: null });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true, writable: true });
    pageOf('letter:the-wide-path');
    const { open } = setup();
    open();
    await act(async () => { fireEvent.click(linkItem()); });
    const box = document.querySelector('.copy-fallback-text');
    expect(box.value).toBe('https://www.thevolumesoftruth.com/The_Wide_Path');
    expect(document.querySelector('.copy-fallback-help').textContent).toBe('Copy the selected link below, or try again.');
  });
});
