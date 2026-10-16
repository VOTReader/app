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

/** @param {boolean[]} pins one entry per tab: pinned or not */
function renderOverview(pins) {
  const tabs = pins.map((pinned, i) => ({ screen: 'home', scrollPositions: {}, __i: i, ...(pinned ? { pinned: true } : {}) }));
  const onClearAll = vi.fn();
  render(
    <TabsOverview
      tabs={tabs} activeTabIdx={0}
      onSelect={vi.fn()} onClose={vi.fn()} onNewTab={vi.fn()} onMenu={vi.fn()}
      onReorder={vi.fn()} onClearAll={onClearAll} onDedupe={vi.fn()}
      MAX_TABS={999} thumbnails={null}
    />,
  );
  const clearBtn = () => /** @type {HTMLButtonElement} */ ([...document.querySelectorAll('button')].find((b) => b.textContent === 'Clear All'));
  const question = () => document.querySelector('.ann-chip-confirm-q')?.textContent;
  const yes = () => /** @type {HTMLButtonElement} */ (document.querySelector('.ann-chip-confirm-yes'));
  return { onClearAll, clearBtn, question, yes };
}

afterEach(cleanup);

describe('TabsOverview Clear All counts what it will close (sweep v081)', () => {
  it('with two of five tabs pinned it asks to close the three unpinned ones and says pinned tabs stay', () => {
    const o = renderOverview([true, true, false, false, false]);
    expect(o.clearBtn().disabled).toBe(false);
    fireEvent.click(o.clearBtn());
    expect(o.question()).toBe('Close 3 tabs? Pinned tabs stay open.');
    fireEvent.click(o.yes());
    expect(o.onClearAll).toHaveBeenCalledTimes(1);
  });

  it('one unpinned tab beside a pinned one is still worth closing', () => {
    const o = renderOverview([true, false]);
    expect(o.clearBtn().disabled).toBe(false);
    fireEvent.click(o.clearBtn());
    expect(o.question()).toBe('Close 1 tab? Pinned tabs stay open.');
  });

  it('is off when every open tab is pinned: Clear All would close nothing', () => {
    const o = renderOverview([true, true, true]);
    expect(o.clearBtn().disabled).toBe(true);
  });

  it('with nothing pinned it still asks to close all of them', () => {
    const o = renderOverview([false, false, false]);
    fireEvent.click(o.clearBtn());
    expect(o.question()).toBe('Close all 3 tabs?');
  });

  it('a lone unpinned tab stays off, as before (Clear All would only swap it for a new one)', () => {
    const o = renderOverview([false]);
    expect(o.clearBtn().disabled).toBe(true);
  });
});
