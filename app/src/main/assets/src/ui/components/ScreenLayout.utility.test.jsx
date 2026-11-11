// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* The utility bar (U rule 11, the UI pass W1 2026-11-11): Back, the title, at most two actions, Tabs, and the
   screen's own ⋯ only where it holds something. No resume dot, no gear slot, no app-wide ⋯ menu. The bar's hairline
   is off at rest and on once the page has scrolled. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import ReactDOM from 'react-dom';
import { ScreenLayout } from './ScreenLayout.jsx';
import { BarAction, BarMenu, BarTextAction, UTILITY_MAX_ACTIONS } from './RootNav.jsx';
import { TabsNavBtn } from './TabsNavBtn.jsx';

const SL = /** @type {any} */ (ScreenLayout);

beforeEach(() => {
  globalThis.__scrollEl = null;
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  globalThis.ReactDOM = ReactDOM;
  globalThis.TabsContext = React.createContext({ enabled: true, count: 1, onOpen() {}, isOnTabsScreen: false });
  globalThis.TabsNavBtn = TabsNavBtn;
});
afterEach(() => { cleanup(); ['ReactDOM', 'TabsContext', 'TabsNavBtn'].forEach((k) => { delete globalThis[k]; }); vi.restoreAllMocks(); });

const names = (c) => [...c.querySelectorAll('.top-nav button')].map((b) => b.getAttribute('aria-label') || b.textContent);

describe('the utility bar', () => {
  it('reads Back, the title, its actions, Tabs, its own menu', () => {
    const onBack = vi.fn();
    const { container } = render(
      <SL utility={{ title: 'Notes', onBack, backLabel: 'Back to Library',
        actions: [<BarAction key="s" icon="search" label="Search notes" onClick={() => {}} />],
        menu: <BarMenu label="Notes options" onClick={() => {}} /> }}><p>x</p></SL>);
    const nav = container.querySelector('.top-nav');
    expect(nav.classList.contains('top-nav-utility')).toBe(true);
    expect(nav.querySelector('h1.bar-title').textContent).toBe('Notes');
    expect(names(container)).toEqual(['Back to Library', 'Search notes', 'Open tabs (1 open)', 'Notes options']);
    fireEvent.click(container.querySelector('.bar-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws no resume dot, gear slot or app-wide ⋯ menu', () => {
    const { container } = render(<SL utility={{ title: 'History', onBack() {} }}><p>x</p></SL>);
    expect(container.querySelector('.nav-gear-slot')).toBeNull();
    expect(container.querySelector('.nav-more-btn')).toBeNull();
    expect(container.querySelector('.reading-dot-nav')).toBeNull();
    expect(names(container)).toEqual(['Back', 'Open tabs (1 open)']);
  });

  it('holds at most two actions and says so when given more', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const acts = ['a', 'b', 'c'].map((k) => <BarAction key={k} icon="info" label={'Act ' + k} onClick={() => {}} />);
    const { container } = render(<SL utility={{ title: 'Too many', onBack() {}, actions: acts }}><p>x</p></SL>);
    expect(container.querySelectorAll('.bar-action').length).toBe(UTILITY_MAX_ACTIONS);
    expect(warn).toHaveBeenCalled();
  });

  it('a worded action is a gold text button', () => {
    const { container } = render(<SL utility={{ title: 'Edit', onBack() {}, actions: [<BarTextAction key="d" label="Done" onClick={() => {}} />] }}><p>x</p></SL>);
    expect(container.querySelector('.bar-text-action').textContent).toBe('Done');
  });

  it('the Tabs counter is the number alone', () => {
    const { container } = render(<SL utility={{ title: 'X' }}><p>x</p></SL>);
    expect(container.querySelector('.tabs-nav-btn').textContent).toBe("1");
  });

  it('the hairline is off at rest and on once the page scrolls', () => {
    const { container } = render(<SL utility={{ title: 'X' }}><p>x</p></SL>);
    const nav = container.querySelector('.top-nav');
    const scroll = container.querySelector('.screen-scroll');
    expect(nav.classList.contains('is-scrolled')).toBe(false);
    scroll.scrollTop = 40; fireEvent.scroll(scroll);
    expect(nav.classList.contains('is-scrolled')).toBe(true);
    scroll.scrollTop = 0; fireEvent.scroll(scroll);
    expect(nav.classList.contains('is-scrolled')).toBe(false);
  });
});
