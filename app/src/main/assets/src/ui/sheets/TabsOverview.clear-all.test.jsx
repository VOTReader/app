/* TabsOverview Clear All — sweep v081.
   ─────────────────────────────────────────────────────────────────
   Pinned tabs survive Clear All (closeAllTabs in hooks/use-tab-actions.js
   keeps them), yet the overview's confirm counted and announced every tab
   ("Close all 5 tabs?" with two pinned) and stayed enabled with only pinned
   tabs open. Its sibling TabActionSheet counts the unpinned tabs it will
   close and says pinned tabs stay; the overview now does the same. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TabsOverview } from './TabsOverview.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { createPressDrag } from '../../utils/press-drag.js';

/** @type {any} */ (globalThis).createPressDrag = createPressDrag;
/** @type {any} */ (globalThis).describeTab = () => ({ title: 'Home', subtitle: '', resolved: true });
/** @type {any} */ (globalThis).tabContentKey = (t) => `k${t.__i}`;
/** @type {any} */ (globalThis).tabHasProgressBar = () => false;
/** @type {any} */ (globalThis).scrollKeyForTab = () => 'home';
/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

/** r-tabs (W2h): Close all is the bar's (AppShellOverlays); the overview shows the confirm while clearAsk is set.
 * @param {boolean[]} pins one entry per tab: pinned or not */
function renderOverview(pins) {
  const tabs = pins.map((pinned, i) => ({ screen: 'home', scrollPositions: {}, __i: i, ...(pinned ? { pinned: true } : {}) }));
  const onClearAll = vi.fn();
  const onClearAsk = vi.fn();
  render(
    <TabsOverview
      tabs={tabs} activeTabIdx={0}
      onSelect={vi.fn()} onClose={vi.fn()} onNewTab={vi.fn()} onMenu={vi.fn()}
      onReorder={vi.fn()} onClearAll={onClearAll} onDedupe={vi.fn()}
      MAX_TABS={999} thumbnails={null} clearAsk onClearAsk={onClearAsk}
    />,
  );
  const question = () => document.querySelector('.ui-confirm-q')?.textContent;
  const yes = () => /** @type {HTMLButtonElement} */ (document.querySelector('.ui-confirm-yes'));
  return { onClearAll, onClearAsk, question, yes };
}

afterEach(cleanup);

describe('TabsOverview Close all counts what it will close (sweep v081)', () => {
  it('with two of five tabs pinned it asks to close the three unpinned ones and says pinned tabs stay', () => {
    const o = renderOverview([true, true, false, false, false]);
    expect(o.question()).toBe('Close 3 tabs? Pinned tabs stay open.');
    fireEvent.click(o.yes());
    expect(o.onClearAll).toHaveBeenCalledTimes(1);
    expect(o.onClearAsk).toHaveBeenCalledWith(false);
  });

  it('one unpinned tab beside a pinned one is still worth closing', () => {
    expect(renderOverview([true, false]).question()).toBe('Close 1 tab? Pinned tabs stay open.');
  });

  it('asks nothing when every open tab is pinned: Close all would close nothing', () => {
    expect(renderOverview([true, true, true]).question()).toBeUndefined();
  });

  it('with nothing pinned it still asks to close all of them', () => {
    expect(renderOverview([false, false, false]).question()).toBe('Close all 3 tabs?');
  });

  it('a lone unpinned tab asks nothing, as before (Close all would only swap it for a new one)', () => {
    expect(renderOverview([false]).question()).toBeUndefined();
  });
});

/* n133: "Merge duplicates" in plain words; r-tabs (W2h) shows it only when there are some. */
describe('TabsOverview Merge duplicates', () => {
  const show = (tabs) => render(
    <TabsOverview tabs={tabs} activeTabIdx={0} onSelect={vi.fn()} onClose={vi.fn()} onNewTab={vi.fn()} onMenu={vi.fn()}
      onReorder={vi.fn()} onClearAll={vi.fn()} onDedupe={vi.fn()} MAX_TABS={999} thumbnails={null} />,
  );
  const btn = () => /** @type {HTMLButtonElement | null} */ (document.querySelector('.tabs-overview-line .ui-link'));
  it('is absent with no duplicates, and counts them when there are some', () => {
    // tabContentKey is this file's stub: `k${__i}`, so the same __i is the same content.
    show([{ screen: 'home', scrollPositions: {}, __i: 0 }, { screen: 'home', scrollPositions: {}, __i: 1 }]);
    expect(btn()).toBeNull();
    expect(document.querySelector('.tabs-overview-meta').textContent).toBe('2 of 999 open. Each tab keeps its own place.');
    cleanup();
    show([{ screen: 'home', scrollPositions: {}, __i: 0 }, { screen: 'home', scrollPositions: {}, __i: 0 }]);
    expect(btn().textContent).toBe('Merge duplicates · 1');
  });
});
