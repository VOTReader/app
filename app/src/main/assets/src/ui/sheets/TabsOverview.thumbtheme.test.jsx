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
import { TabsOverview, thumbAspectMismatch } from './TabsOverview.jsx';
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

/* ── Aspect guard (thumbAspectMismatch) — the PC stale-geometry glitch ──
   A thumb captured under a different window geometry, cover-cropped into
   the current card box, blows a corner up into giant text. The overview
   letterboxes any thumb whose aspect strays >12% from the card's. */
it('thumbAspectMismatch: same-geometry captures pass (cover stays)', () => {
  // exact
  expect(thumbAspectMismatch(760, 800, 228, 240)).toBe(false);
  // scrollbar-gutter wobble (~2%) never letterboxes
  expect(thumbAspectMismatch(744, 800, 228, 240)).toBe(false);
});

it('thumbAspectMismatch: a phone-era capture in a desktop card letterboxes', () => {
  // 376x812 (0.46) vs 228/240 (0.95) — the owner's giant-text card
  expect(thumbAspectMismatch(376, 812, 228, 240)).toBe(true);
  // and the reverse: a desktop capture in a phone-shaped card
  expect(thumbAspectMismatch(760, 800, 245, 395)).toBe(true);
});

it('thumbAspectMismatch: degenerate inputs never letterbox', () => {
  expect(thumbAspectMismatch(0, 0, 228, 240)).toBe(false);
  expect(thumbAspectMismatch(760, 800, 0, 0)).toBe(false);
});
