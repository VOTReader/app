// @ts-nocheck
/* GearMenu — the gear opens Quick settings (GEAR1, Corbin 2026-11-12).
   ─────────────────────────────────────────────────────────────────────
   Pins: every kind of bar gear (a tab root's RootGear, the bar gear NavButtons draws, a utility bar's) opens the
   same bottom sheet; Theme and Text size change the setting in place and keep it open; each door goes where it
   says and closes it first; Escape / Android Back close it through the modal registry; a door back to the screen
   on show is left out; and the reader's ⋯ sheet ends with the very same block, row for row. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { GearMenuBtn } from './GearMenu.jsx';
import { RootGear } from './RootNav.jsx';
import { NavButtons } from './NavButtons.jsx';
import { MoreMenuBtn, NavMenuContext } from './MoreMenu.jsx';

beforeEach(() => { globalThis.ReactDOM = ReactDOM; });
afterEach(() => { cleanup(); });

function ctxValue(over = {}) {
  return {
    enabled: true, historyEnabled: true, theme: 'dark', fontScale: '1', screen: 'home',
    onThemeChange: vi.fn(), onSettings: vi.fn(), onHistory: vi.fn(), onPlans: vi.fn(), onFontScale: vi.fn(),
    ...over,
  };
}

/** @param {any} gear the bar's gear element @param {any} over */
function setup(gear, over = {}) {
  const value = ctxValue(over);
  const utils = render(
    <NavMenuContext.Provider value={value}>
      <nav className="top-nav">{gear}</nav>
      <p id="outside">page</p>
    </NavMenuContext.Provider>,
  );
  const btn = () => document.querySelector('[aria-label="Quick settings"]');
  const sheet = () => document.querySelector('.quick-settings-sheet');
  const open = () => { act(() => { fireEvent.click(btn()); }); };
  const item = (name) => [...document.querySelectorAll('.quick-settings-sheet [role^="menuitem"]')]
    .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === name);
  const names = () => [...document.querySelectorAll('.quick-settings-sheet [role^="menuitem"]')]
    .map((b) => b.getAttribute('aria-label') || b.textContent.trim());
  return { value, utils, btn, sheet, open, item, names };
}

const BLOCK = ['Smaller text', 'Larger text', 'Dark', 'Light', 'History', 'Reading plans', 'Settings'];

describe('the gear opens Quick settings', () => {
  it.each([
    ['a tab root (Home, Listen, Library)', () => <RootGear onSettings={vi.fn()} />, 'root-gear-btn'],
    ['a bar gear (Answers, Search, Volumes, plans)', () => NavButtons({ onSettings: vi.fn(), hide: ['history', 'search', 'theme'] }), 'settings-gear-btn'],
    ['a utility bar (My Progress)', () => <GearMenuBtn className="bar-action" onSettings={vi.fn()} />, 'bar-action'],
  ])('%s: a named gear that opens the bottom sheet of the block', (_k, make, cls) => {
    const s = setup(make());
    expect(s.btn().classList.contains(cls)).toBe(true);
    expect(s.btn().getAttribute('title')).toBe('Quick settings');
    expect(s.btn().getAttribute('aria-haspopup')).toBe('menu');
    expect(s.btn().getAttribute('aria-expanded')).toBe('false');
    s.open();
    expect(s.sheet()).not.toBeNull();
    expect(s.sheet().getAttribute('role')).toBe('menu');
    expect(s.sheet().getAttribute('aria-label')).toBe('Quick settings');
    expect(s.sheet().classList.contains('rd-menu-sheet')).toBe(true);   // the reader sheet's frame: bottom-anchored
    expect(s.sheet().parentElement).toBe(document.body);
    expect(document.querySelector('.rd-menu-scrim')).not.toBeNull();
    expect(s.btn().getAttribute('aria-expanded')).toBe('true');
    expect(s.names()).toEqual(BLOCK);
    expect(document.activeElement).toBe(s.item('Smaller text'));
  });

  it('Theme and Text size change the setting at once and keep the sheet open', () => {
    const s = setup(<RootGear onSettings={vi.fn()} />, { fontScale: '1.2' });
    s.open();
    act(() => { fireEvent.click(s.item('Light')); });
    expect(s.value.onThemeChange).toHaveBeenCalledWith('light');
    act(() => { fireEvent.click(s.item('Dark')); });
    expect(s.value.onThemeChange).toHaveBeenCalledTimes(1);   // already dark: no second write
    act(() => { fireEvent.click(s.item('Larger text')); });
    expect(s.value.onFontScale).toHaveBeenLastCalledWith('1.3');
    act(() => { fireEvent.click(s.item('Smaller text')); });
    expect(s.value.onFontScale).toHaveBeenLastCalledWith('1.1');
    expect(s.sheet()).not.toBeNull();
    expect(document.querySelector('.more-menu-step-value').textContent).toBe('120%');
    const live = document.querySelector('.more-menu-live');
    expect(s.sheet().contains(live)).toBe(false);
    expect(live.textContent).toBe('Text size 120%');
  });

  it('each door closes the sheet, then goes where it says; Settings takes the screen\'s own way there', () => {
    const onSettings = vi.fn();
    const s = setup(<RootGear onSettings={onSettings} />);
    for (const [name, fn] of [['History', () => s.value.onHistory], ['Reading plans', () => s.value.onPlans], ['Settings', () => onSettings]]) {
      s.open();
      act(() => { fireEvent.click(s.item(name)); });
      expect(fn(), name).toHaveBeenCalledTimes(1);
      expect(s.sheet(), name).toBeNull();
    }
    expect(s.value.onSettings).not.toHaveBeenCalled();
  });

  it('a gear with no screen route of its own reaches Settings through the app\'s', () => {
    const s = setup(<GearMenuBtn className="settings-gear-btn" />);
    s.open();
    act(() => { fireEvent.click(s.item('Settings')); });
    expect(s.value.onSettings).toHaveBeenCalledTimes(1);
  });

  it('Escape and Android Back close it through the modal registry, never leaving the screen', () => {
    const s = setup(<RootGear onSettings={vi.fn()} />);
    expect(globalThis.modalRegistry.isAnyOpen()).toBe(false);
    s.open();
    expect(globalThis.modalRegistry.openIds()).toContain('quick-settings');
    act(() => { globalThis.modalRegistry.peek().dismiss(); });
    expect(s.sheet()).toBeNull();
    expect(globalThis.modalRegistry.isAnyOpen()).toBe(false);
    expect(document.activeElement).toBe(s.btn());
    expect(s.value.onSettings).not.toHaveBeenCalled();
  });

  it('a press outside (the scrim) closes it; a press inside does not', () => {
    const s = setup(<RootGear onSettings={vi.fn()} />);
    s.open();
    act(() => { fireEvent.pointerDown(s.sheet()); });
    expect(s.sheet()).not.toBeNull();
    act(() => { fireEvent.pointerDown(document.getElementById('outside')); });
    expect(s.sheet()).toBeNull();
  });

  it('arrow keys move between the items and wrap', () => {
    const s = setup(<RootGear onSettings={vi.fn()} />);
    s.open();
    act(() => { fireEvent.keyDown(s.sheet(), { key: 'ArrowUp' }); });
    expect(document.activeElement).toBe(s.item('Settings'));
    act(() => { fireEvent.keyDown(s.sheet(), { key: 'ArrowDown' }); });
    expect(document.activeElement).toBe(s.item('Smaller text'));
  });

  it.each([
    ['history', 'History'],
    ['reading-plans', 'Reading plans'],
  ])('on %s the door back to it is left out, not shown dead', (screen, gone) => {
    const s = setup(<GearMenuBtn className="settings-gear-btn" onSettings={vi.fn()} />, { screen });
    s.open();
    expect(s.item(gone)).toBeUndefined();
    expect(s.names()).toEqual(BLOCK.filter((n) => n !== gone));
  });

  it('History switched off leaves it out here too', () => {
    const s = setup(<RootGear onSettings={vi.fn()} />, { historyEnabled: false });
    s.open();
    expect(s.item('History')).toBeUndefined();
  });

  it('with no app context (a screen test, a harness) the gear goes straight to Settings, as before', () => {
    const onSettings = vi.fn();
    const { container } = render(<RootGear onSettings={onSettings} />);
    const g = container.querySelector('.root-gear-btn');
    expect(g.getAttribute('aria-label')).toBe('Settings');
    act(() => { fireEvent.click(g); });
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});

describe('one block in both hosts', () => {
  it('the reader\'s ⋯ sheet ends with the same rows, in the same order, as the gear\'s sheet', () => {
    const value = ctxValue({ screen: 'vot-one-letter' });
    render(
      <NavMenuContext.Provider value={value}>
        <nav className="top-nav"><MoreMenuBtn /><RootGear onSettings={value.onSettings} /></nav>
      </NavMenuContext.Provider>,
    );
    const rowsOf = (sel) => [...document.querySelectorAll(sel + ' .rd-menu-group[aria-label="Look"], ' + sel + ' .rd-menu-group[aria-label="More places"]')]
      .map((g) => g.getAttribute('aria-label') + ': ' + [...g.querySelectorAll('[role^="menuitem"], .more-menu-row-label')]
        .map((b) => b.getAttribute('aria-label') || b.textContent.trim()).join(' | '));
    act(() => { fireEvent.click(document.querySelector('.nav-more-btn')); });
    const reader = rowsOf('.more-menu[aria-label="More"]');
    const readerSheet = document.querySelector('.more-menu[aria-label="More"]');
    expect(readerSheet.lastElementChild.getAttribute('aria-label')).toBe('More places');   // the block is the sheet's end
    act(() => { globalThis.modalRegistry.peek().dismiss(); });
    act(() => { fireEvent.click(document.querySelector('[aria-label="Quick settings"]')); });
    const gear = rowsOf('.quick-settings-sheet');
    expect(reader).toEqual([
      'Look: Text size | Smaller text | Larger text | Theme | Dark | Light',
      'More places: History | Reading plans | Settings',
    ]);
    expect(gear).toEqual(reader);
    act(() => { globalThis.modalRegistry.peek().dismiss(); });
  });
});
