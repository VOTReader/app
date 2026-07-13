/* TabsOverview — thumbnail theme-normalization at render.
   ─────────────────────────────────────────────────────────────────
   A tab card whose screenshot was captured under the OTHER theme renders
   its <img> with .thumb-theme-flip (an invert+hue-rotate filter that reads
   as the current theme), so a theme switch never shows a mixed wall of
   dark+light cards. Matching captures, legacy bare-string entries (theme
   unknown), and Garden tabs (photographs) render unfiltered. */

import { it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { TabsOverview } from './TabsOverview.jsx';

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

it('a thumbnail captured under the CURRENT theme renders unfiltered', () => {
  renderWith([mkTab()], { k0: { url: 'data:dark-shot', theme: 'dark' } });
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:dark-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('a thumbnail captured under the OTHER theme gets the theme-flip filter', () => {
  renderWith([mkTab()], { k0: { url: 'data:light-shot', theme: 'light' } }); // current = dark
  expect(thumbImg().className).toContain('thumb-theme-flip');
});

it('in LIGHT theme a dark capture flips (and a light one does not)', () => {
  document.body.classList.add('light');
  renderWith([mkTab(), mkTab({ __i: 1 })], {
    k0: { url: 'data:dark-shot', theme: 'dark' },
    k1: { url: 'data:light-shot', theme: 'light' },
  });
  const imgs = Array.from(document.querySelectorAll('.tab-card-thumb'));
  expect(imgs[0].className).toContain('thumb-theme-flip');
  expect(imgs[1].className).not.toContain('thumb-theme-flip');
});

it('legacy bare-string thumbnails render as-is (theme unknown → no flip)', () => {
  renderWith([mkTab()], { k0: 'data:legacy-shot' });
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:legacy-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});

it('garden tabs are exempt from the flip (photographs invert badly)', () => {
  renderWith([mkTab({ screen: 'garden-view' })], { k0: { url: 'data:garden-shot', theme: 'light' } }); // mismatch
  const img = thumbImg();
  expect(img.getAttribute('src')).toBe('data:garden-shot');
  expect(img.className).not.toContain('thumb-theme-flip');
});
