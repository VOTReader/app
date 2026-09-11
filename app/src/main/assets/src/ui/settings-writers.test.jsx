/* Every settings writer outside the hook records `touched` — and there are exactly two.
   ──────────────────────────────────────────────────────────────────────────────
   The default-flip round (use-settings.js, DEFAULT_FLIPS) flips a key only when the reader
   never set it, and "never set" is `touched[key]`, written by the hook's two mutators. The
   Verifier's class hunt (2026-09-11) found two writers that bypass them by composing the object
   by hand through the raw setter: the Garden image-quality choice in AppShellOverlays and the
   Search corpus choice routed through screen-routes. Neither key is in round 1, so nothing
   flips today; a future round on either key would overwrite the reader's choice because nothing
   recorded it.

   Each case here drives the REAL hook through the real site (a click on the real tier button;
   the real search route's callback) and reads `touched` back — the value assertion beside it is
   the control that the write landed at all. The third case is the by-construction form: the
   hook no longer hands out the raw setter, so a third writer of this shape cannot be written.
   That is the derived guard for the title's "exactly two": there is no third way to write. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, act, cleanup, fireEvent, screen } from '@testing-library/react';
vi.mock('../utils/platform-bridge.js', () => ({
  PlatformBridge: { setLightStatusBar: vi.fn(), setKeepScreenOn: vi.fn() },
}));
import { useSettings } from '../hooks/use-settings.js';
import { AppShellOverlays } from './components/AppShellOverlays.jsx';
import { buildScreenRoutes } from './screen-routes.jsx';
import { GARDEN_TIERS, GARDEN_DEFAULT_TIER, getGardenTier } from '../utils/garden.js';

const G = /** @type {any} */ (globalThis);
const noop = () => {};

beforeEach(() => {
  // The hook and the overlay read these by bare name (bundle-d globals); the real ones, not stubs.
  G.GARDEN_DEFAULT_TIER = GARDEN_DEFAULT_TIER;
  G.GARDEN_TIERS = GARDEN_TIERS;
  G.getGardenTier = getGardenTier;
  G.GardenWarningFlagStore = { set: noop };
  G.ErrorBoundary = ({ children }) => children;
  G.StorageHealthBanner = () => null;
  G.Safari7DayModal = () => null;
  G.IosPwaWelcomeCard = () => null;
  G.AudioPlayerBar = () => null;
  G.LibraryNav = () => null;
  G.ScreenLayout = ({ children }) => <div>{children}</div>;
  G.SearchScreen = () => null;
});
afterEach(() => {
  cleanup();
  for (const k of ['GARDEN_DEFAULT_TIER', 'GARDEN_TIERS', 'getGardenTier', 'GardenWarningFlagStore',
    'ErrorBoundary', 'StorageHealthBanner', 'Safari7DayModal', 'IosPwaWelcomeCard', 'AudioPlayerBar',
    'LibraryNav', 'ScreenLayout', 'SearchScreen']) delete G[k];
  document.body.className = '';
  document.documentElement.style.cssText = '';
});

describe('settings writers outside the hook record touched', () => {
  it('the Garden image-quality choice records touched.gardenTier', () => {
    let seen = null;
    function Host() {
      const hook = useSettings({ savedSettings: null, theme: 'dark' });
      seen = hook.settings;
      return (
        <AppShellOverlays
          {...hook}
          screen="home"
          tabsOverviewOpen={false} setTabsOverviewOpen={noop}
          tabs={[]} activeTabIdx={0} tabThumbnails={{}} MAX_TABS={9}
          switchToTab={noop} closeTab={noop} openNewTab={noop}
          closeOtherTabs={noop} closeTabsToTheRight={noop} closeAllTabs={noop}
          deduplicateTabs={noop} reorderTabs={noop} renameTab={noop} togglePinTab={noop}
          tabActionIdx={null} setTabActionIdx={noop}
          lastTabCloseStrikesRef={{ current: 0 }}
          disableTabsPromptOpen={false} setDisableTabsPromptOpen={noop}
          gardenWarningOpen={true} setGardenWarningOpen={noop}
          setScreen={noop}
        />
      );
    }
    render(<Host />);
    expect(seen.gardenTier).toBe('standard');
    expect(seen.touched).toEqual({});

    fireEvent.click(screen.getByRole('button', { name: /^Native/ }));
    expect(seen.gardenTier).toBe('native');            // the control: the click landed
    expect(seen.touched.gardenTier).toBe(true);         // the claim
  });

  it('the Search corpus choice records touched.searchCorpus', () => {
    const { result } = renderHook(() => useSettings({ savedSettings: null, theme: 'dark' }));
    expect(result.current.settings.touched).toEqual({});
    // buildScreenRoutes takes the hook's own mutators as deps; the search route hands the
    // screen an onSettingsChange built from them. Everything else in the bag is untouched by
    // that route (the history-back suite builds with the same partial bag).
    const routes = buildScreenRoutes(/** @type {any} */ ({
      ...result.current,
      searchQuery: '', setSearchQuery: noop, handleSearchSelect: noop, handleSearchCommand: noop,
      goSearchOrigin: noop, searchScope: null, searchContext: null, setSearchScope: noop,
    }));
    act(() => { routes.search().props.onSettingsChange('searchCorpus', 'vot'); });
    expect(result.current.settings.searchCorpus).toBe('vot');      // the control
    expect(result.current.settings.touched.searchCorpus).toBe(true); // the claim
  });

  it('the hook keeps its raw setter to itself, so a writer that skips touched cannot be written', () => {
    const { result } = renderHook(() => useSettings({ savedSettings: null, theme: 'dark' }));
    expect(result.current.setSettings).toBeUndefined();
    // The control on the same instance: the sanctioned way still writes, and records.
    act(() => { result.current.updateSetting('gardenTier', 'mobile'); });
    expect(result.current.settings.gardenTier).toBe('mobile');
    expect(result.current.settings.touched).toEqual({ gardenTier: true });
  });
});
