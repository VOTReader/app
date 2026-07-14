/* TabsOverview — dual-theme thumbnail variant pick.
   ─────────────────────────────────────────────────────────────────
   Entries are variant maps { dark?, light?, unknown? } (useThumbnails).
   The card prefers the variant matching the CURRENT theme (true pixels,
   no filter); when only the other theme exists it renders through
   .thumb-theme-flip as a transitional approximation; `unknown` legacy rows
   (awaiting the luminance probe) and bare strings render as-is; Garden
   tabs never flip (photographs invert badly). */

import { it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TabsOverview } from './TabsOverview.jsx';
import { createPressDrag } from '../../utils/press-drag.js';

/** @type {any} */ (globalThis).createPressDrag = createPressDrag;

/** @type {any} */ (globalThis).describeTab = () => ({ title: 'Home', subtitle: '', resolved: true });
/** @type {any} */ (globalThis).tabContentKey = (t) => `k${t.__i}`;
/** @type {any} */ (globalThis).tabHasProgressBar = () => false;
/** @type {any} */ (globalThis).scrollKeyForTab = () => 'home';

const mkTab = (over = {}) => ({ screen: 'home', scrollPositions: {}, __i: 0, ...over });

function renderWith(tabs, thumbnails) {
  return render(
    <TabsOverview
      tabs={tabs} activeTabIdx={0}
      onSelect={vi.fn()} onClose={vi.fn()} onNewTab={vi.fn()} onMenu={vi.fn()}
      onReorder={vi.fn()} onClearAll={vi.fn()} onDedupe={vi.fn()}
      MAX_TABS={999} thumbnails={thumbnails}
    />,
  );
}

const thumbImg = () => /** @type {HTMLImageElement} */ (document.querySelector('.tab-card-thumb'));

afterEach(() => {
  cleanup();
  document.body.classList.remove('light');
});

it('prefers the CURRENT theme variant — true pixels, no filter', () => {
  renderWith([mkTab()], { k0: { dark: 'data:dark-shot', light: 'data:light-shot' } }); // current = dark
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:dark-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('in LIGHT theme the same entry serves the light variant unfiltered', () => {
  document.body.classList.add('light');
  renderWith([mkTab()], { k0: { dark: 'data:dark-shot', light: 'data:light-shot' } });
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:light-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('falls back to the OTHER variant through the flip filter when the match is missing', () => {
  renderWith([mkTab()], { k0: { light: 'data:light-shot' } }); // current = dark, no dark variant yet
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:light-shot');
  expect(img.className).toContain('thumb-theme-flip');
});

it('unknown legacy rows (probe pending) render as-is, never filtered', () => {
  renderWith([mkTab()], { k0: { unknown: 'data:legacy-shot' } });
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:legacy-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('bare-string entries (pre-migration transient) render as-is', () => {
  renderWith([mkTab()], { k0: 'data:string-shot' });
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:string-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('garden tabs never flip even on a mismatched-only entry', () => {
  renderWith([mkTab({ screen: 'garden-view' })], { k0: { light: 'data:garden-shot' } }); // current = dark
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:garden-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('interim {url, theme} rows still render (compat branch) with the mismatch filter', () => {
  renderWith([mkTab()], { k0: { url: 'data:interim-shot', theme: 'light' } }); // current = dark
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:interim-shot');
  expect(img.className).toContain('thumb-theme-flip');
});
