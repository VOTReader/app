// @ts-nocheck
/* axe-core regression checks for the app shell (2026-09-27).
   ─────────────────────────────────────────────────────────────────────
   A headless axe walk (Playwright, 360x800, both themes) over Home, a letter,
   the Bible, the journal, Settings, Answers and Songs found two shell defects
   that change nothing on screen to fix, and these pin them with axe itself:

   - aria-required-children: the More menu (role=menu) owned the text size's
     aria-live readout, which a menu may not own.
   - landmark-no-duplicate-main / landmark-unique: the Tabs overview (a dialog
     over the live screen) brought its own <main> and unnamed <nav>.

   jsdom has no layout, so colour contrast and target size are off here; they
   are measured in the browser, not in this file. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import axe from 'axe-core';
import { MoreMenuBtn, NavMenuContext } from './MoreMenu.jsx';
import { ScreenLayout } from './ScreenLayout.jsx';

const LAYOUT_BLIND = { 'color-contrast': { enabled: false }, 'target-size': { enabled: false } };

/** axe's violations over the whole document, as "rule: target" strings. */
async function violations(rules = {}) {
  const r = await axe.run(document, { resultTypes: ['violations'], rules: { ...LAYOUT_BLIND, ...rules } });
  return r.violations.flatMap((v) => v.nodes.map((n) => v.id + ': ' + n.target.join(' ')));
}

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.__scrollEl = null;
  document.documentElement.lang = 'en';
  document.title = 'VOTReader';
});
afterEach(() => cleanup());

describe('axe — the More menu', () => {
  it('open, it owns only menu items and their groups (aria-required-children)', async () => {
    const value = {
      enabled: true, historyEnabled: true, theme: 'dark', fontScale: '1.1',
      onThemeChange: vi.fn(), onSettings: vi.fn(), onHistory: vi.fn(), onFontScale: vi.fn(),
    };
    render(
      <NavMenuContext.Provider value={value}>
        <nav className="top-nav"><MoreMenuBtn /></nav>
        <main><h1>Home</h1></main>
      </NavMenuContext.Provider>,
    );
    act(() => { fireEvent.click(document.querySelector('.nav-more-btn')); });
    expect(document.querySelector('.more-menu')).not.toBeNull();
    // `region`: a popup menu portaled to <body> sits outside the landmarks by design
    expect(await violations({ region: { enabled: false } })).toEqual([]);
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
  });
});

describe('axe — a layout drawn in a dialog over the live screen (the Tabs overview)', () => {
  const page = (landmarks) => render(
    <>
      <ScreenLayout hideTabsBtn navChildren={null}><h1>Genesis 1</h1></ScreenLayout>
      <div role="dialog" aria-modal="true" aria-label="Open tabs">
        <ScreenLayout hideTabsBtn trackScroll={false} landmarks={landmarks} navChildren={null}><h2>Tabs</h2></ScreenLayout>
      </div>
    </>,
  );

  it('CONTROL: with landmarks the overlay is the duplicate main axe reports', async () => {
    page(true);
    const v = await violations();
    expect(v.some((s) => s.startsWith('landmark-no-duplicate-main'))).toBe(true);
  });

  it('with landmarks={false} the document has one main and no landmark findings', async () => {
    page(false);
    expect(document.querySelectorAll('main').length).toBe(1);
    expect(await violations()).toEqual([]);
  });
});
