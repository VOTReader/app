// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* ScreenLayout top bar: the keyboard order is the DOM order (the three tabs, 2026-11-10).
   On every screen but a tab root the bar reads Back, Search, Tabs, gear. The gear used to be first in the DOM
   (NavButtons) and moved with CSS `order`, so a keyboard walked Gear, Search, Tabs. NavButtons now draws the gear
   into ScreenLayout's slot after Tabs; a tab root keeps its own RootGear after Tabs. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ReactDOM from 'react-dom';
import { ScreenLayout } from './ScreenLayout.jsx';
import { NavButtons } from './NavButtons.jsx';
import { LibraryNav } from './LibraryNav.jsx';
import { RootGear, rootNavStart } from './RootNav.jsx';
import { HomeBtn } from './HomeBtn.jsx';
import { TabsNavBtn } from './TabsNavBtn.jsx';
import { ThemeBtn } from './ThemeBtn.jsx';

const SL = /** @type {any} */ (ScreenLayout);

beforeEach(() => {
  globalThis.__scrollEl = null;
  globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  globalThis.ReactDOM = ReactDOM;   // a window global in the app (NavButtons draws the gear through a portal)
  globalThis.HomeBtn = HomeBtn;
  globalThis.NavButtons = NavButtons;
  globalThis.ThemeBtn = ThemeBtn;
  globalThis.TabsContext = React.createContext({ enabled: true, count: 1, onOpen() {}, isOnTabsScreen: false });
  globalThis.TabsNavBtn = TabsNavBtn;
});
afterEach(() => { cleanup(); ['ReactDOM', 'HomeBtn', 'NavButtons', 'ThemeBtn', 'TabsContext', 'TabsNavBtn'].forEach((k) => { delete globalThis[k]; }); });

/** The names of the bar's controls, in DOM (keyboard) order. */
const order = (c) => [...c.querySelectorAll('.top-nav button')].map((b) => b.getAttribute('aria-label') || b.className);

describe('top bar keyboard order', () => {
  it('a screen with the bar: Back, Search, Tabs, gear (NavButtons draws the gear after Tabs)', () => {
    const { container } = render(<SL navChildren={LibraryNav({ backLabel: 'Volumes', showHome: false, onSettings() {}, onHistory() {}, onSearch() {}, hide: ['history', 'theme'] })}><p>x</p></SL>);
    const names = order(container).filter((n) => !/^More$/.test(n));
    expect(names).toEqual(['Back to Volumes', 'Search', 'Open tabs (1 open)', 'Settings']);
    // The gear sits after Tabs inside the bar's own slot; no CSS `order` is needed to put it there.
    expect(container.querySelector('.top-nav > .nav-gear-slot .settings-gear-btn')).not.toBeNull();
  });

  it('the gear stays out of the way of ⋯: it comes before the ⋯ menu button', () => {
    const { container } = render(<SL navChildren={LibraryNav({ backLabel: 'Volumes', showHome: false, onSettings() {}, onSearch() {}, hide: ['history', 'theme'] })}><p>x</p></SL>);
    const kids = [...container.querySelector('.top-nav').children];
    const gear = kids.findIndex((k) => k.classList.contains('nav-gear-slot'));
    const tabs = kids.findIndex((k) => k.querySelector && k.querySelector('.tabs-nav-btn'));
    expect(tabs).toBeGreaterThan(-1);
    expect(gear).toBeGreaterThan(tabs);
  });

  it('a tab root keeps Search, Tabs, then its own gear', () => {
    const { container } = render(<SL root navChildren={rootNavStart({ title: 'Library', onSearch() {} })} navEnd={<RootGear onSettings={() => {}} />}><p>x</p></SL>);
    expect(order(container)).toEqual(['Search', 'Open tabs (1 open)', 'Settings']);
  });

  it('NavButtons with no ScreenLayout around it renders the gear inline, first, as before', () => {
    const { container } = render(<div><NavButtons onSettings={() => {}} onHistory={() => {}} onSearch={() => {}} hide={['theme']} /></div>);
    expect([...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Settings', 'History', 'Search']);
  });
});
