/* TabsOverview - what a card's picture area draws (TABS6, 2026-11-12).
   ─────────────────────────────────────────────────────────────────
   A card draws the tab's page snapshot (SnapBox), in the current theme by the app's own stylesheet. An older build's
   stored JPEG ({ dark, light }, one theme, `unknown`, the interim { url, theme }, a bare data URL) is NEVER drawn,
   in either theme: it was a narrow strip letterboxed between bars, and a dark one was pushed through an invert
   filter in the light theme (Corbin's phone, 11-12). A tab with no snapshot yet shows a quiet page-coloured
   placeholder; the Scripture Web (a WebGL canvas, never copied) keeps its sigil. */

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

afterEach(() => {
  cleanup();
  document.body.classList.remove('light');
});

const JPEG = 'data:image/jpeg;base64,/9j/' + 'A'.repeat(1500);
const OLD_ROWS = {
  both: { dark: JPEG, light: JPEG },
  darkOnly: { dark: JPEG },
  lightOnly: { light: JPEG },
  unknown: { unknown: JPEG },
  interim: { url: JPEG, theme: 'dark' },
  bare: JPEG,
};

for (const theme of ['dark', 'light']) {
  for (const [kind, row] of Object.entries(OLD_ROWS)) {
    it(`an old ${kind} JPEG row draws no picture in the ${theme} theme: no img, no filter, the page placeholder`, () => {
      if (theme === 'light') document.body.classList.add('light');
      const { container } = renderWith([mkTab(), mkTab({ __i: 1, screen: 'vot-letter' })], { k0: row, k1: row });
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.thumb-theme-flip, .thumb-ar-mismatch, .tab-card-thumb')).toBeNull();
      expect(container.querySelectorAll('.tab-snap-wait')).toHaveLength(2);
      expect(container.querySelector('.tab-card.has-thumb')).toBeNull();
    });
  }
}

it('a snapshot draws in its box (SnapBox), the same in both themes', () => {
  const snap = { v: 1, html: '<div class="screen-layout"><div class="screen-scroll"><p>page</p></div></div>', w: 412, h: 800, top: 0, st: 0 };
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') document.body.classList.add('light');
    const { container } = renderWith([mkTab()], { k0: { snap } });
    expect(container.querySelector('.tab-snap:not(.tab-snap-wait)')).not.toBeNull();
    expect(container.querySelector('.tab-card.has-thumb')).not.toBeNull();
    expect(container.querySelector('.tab-snap-wait, img')).toBeNull();
    cleanup();
  }
});

it('the Scripture Web keeps its sigil (a canvas no copy carries)', () => {
  const { container } = renderWith([mkTab({ screen: 'scripture-web' })], {});
  expect(container.querySelector('.tab-card-thumb-sigil')).not.toBeNull();
  expect(container.querySelector('.tab-snap-wait')).toBeNull();
});
