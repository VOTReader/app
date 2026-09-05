/* AppShellOverlays — Tabs overview overlay focus containment (a11y-ux-3).
   ─────────────────────────────────────────────────────────────────────
   The tabs-overview-layer paints a full-screen overlay OVER the still-
   mounted, still-focusable ROUTES slot (app.jsx renders AppShellOverlays
   BEFORE ROUTES in the DOM). Every other modal in this file
   (disable-tabs-dialog, garden-warning-modal) traps Tab with the shared
   useFocusTrap hook and carries role="dialog"/aria-modal/aria-labelledby;
   the tabs overview carried none of the three, so Tab walked straight out
   of the overlay into the screen underneath.

   Stubs every free-variable global AppShellOverlays reaches for
   (production reality: _entry-d.js Object.assigns them onto window) with
   the minimum needed to prove the WIRING — the REAL useFocusTrap
   (globalThis, vitest.setup.js) does the actual trapping, same as
   production. tabActionIdx=null, disableTabsPromptOpen=false and
   gardenWarningOpen=false short-circuit the other overlay branches, so
   TabActionSheet/GARDEN_TIERS/getGardenTier/GardenWarningFlagStore never
   need stubs (their JSX is never evaluated). */

import { it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AppShellOverlays } from './AppShellOverlays.jsx';

/** @type {any} */ (globalThis).ErrorBoundary = ({ children }) => children;
/** @type {any} */ (globalThis).StorageHealthBanner = () => null;
/** @type {any} */ (globalThis).Safari7DayModal = () => null;
/** @type {any} */ (globalThis).IosPwaWelcomeCard = () => null;
/** @type {any} */ (globalThis).AudioPlayerBar = () => null;
/** @type {any} */ (globalThis).LibraryNav = () => null;
/** @type {any} */ (globalThis).ScreenLayout = ({ children }) => <div>{children}</div>;
// Two focusable stub cards + the real title id the fix's aria-labelledby
// must reference — enough surface to prove Tab containment without
// pulling in TabsOverview's own free-variable web (drag engine, etc.).
/** @type {any} */ (globalThis).TabsOverview = () => (
  <div>
    <h1 id="tabs-overview-title">Tabs</h1>
    <button id="stub-tab-1">one</button>
    <button id="stub-tab-2">two</button>
  </div>
);

const noop = () => {};
function renderOverlay() {
  return render(
    <AppShellOverlays
      settings={{ tabsEnabled: true }} updateSetting={noop}
      screen="home"
      tabsOverviewOpen={true} setTabsOverviewOpen={noop}
      tabs={[]} activeTabIdx={0} tabThumbnails={{}} MAX_TABS={9}
      switchToTab={noop} closeTab={noop} openNewTab={noop}
      closeOtherTabs={noop} closeTabsToTheRight={noop} closeAllTabs={noop}
      deduplicateTabs={noop} reorderTabs={noop}
      renameTab={noop} togglePinTab={noop}
      tabActionIdx={null} setTabActionIdx={noop}
      lastTabCloseStrikesRef={{ current: 0 }}
      disableTabsPromptOpen={false} setDisableTabsPromptOpen={noop}
      gardenWarningOpen={false} setGardenWarningOpen={noop}
      setSettings={noop} setScreen={noop}
    />,
  );
}

const pressTab = (shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

afterEach(() => cleanup());

it('traps Tab inside the tabs overview instead of letting it reach the screen behind', () => {
  renderOverlay();
  const first = /** @type {HTMLElement} */ (document.getElementById('stub-tab-1'));
  const last = /** @type {HTMLElement} */ (document.getElementById('stub-tab-2'));
  last.focus();
  const e = pressTab();
  expect(e.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it('marks the overlay a labelled dialog', () => {
  renderOverlay();
  const layer = document.querySelector('.tabs-overview-layer');
  expect(layer.getAttribute('role')).toBe('dialog');
  expect(layer.getAttribute('aria-modal')).toBe('true');
  expect(layer.getAttribute('aria-labelledby')).toBe('tabs-overview-title');
});
