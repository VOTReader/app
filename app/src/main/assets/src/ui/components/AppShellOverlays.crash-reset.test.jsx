/* The overlay boundary comes back too (v15-01). AppShellOverlays wraps the
   storage-health banner and the tabs overview in one ErrorBoundary with
   fallback={null} that never reset: a crash in the tabs overview also took the
   storage warning away until a restart. It now resets whenever an overlay
   opens or closes, or the screen changes - a reader's action, so a broken
   overlay can never loop. Real ErrorBoundary; the rest stubbed as in
   AppShellOverlays.test.jsx. */
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShellOverlays } from './AppShellOverlays.jsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.jsx';

const G = /** @type {any} */ (globalThis);
G.ErrorBoundary = ErrorBoundary;
G.StorageHealthBanner = () => <div data-testid="storage-banner" />;
G.Safari7DayModal = () => null;
G.IosPwaWelcomeCard = () => null;
G.AudioPlayerBar = () => null;
G.LibraryNav = () => null;
G.ScreenLayout = ({ children }) => <div>{children}</div>;
G.TabsOverview = () => { throw new Error('tabs overview broke'); };

afterEach(() => cleanup());

const noop = () => {};
function overlays(tabsOverviewOpen) {
  return (
    <AppShellOverlays
      settings={{ tabsEnabled: true }} updateSetting={noop}
      screen="home"
      tabsOverviewOpen={tabsOverviewOpen} setTabsOverviewOpen={noop}
      tabs={[]} activeTabIdx={0} tabThumbnails={{}} MAX_TABS={9}
      switchToTab={noop} closeTab={noop} openNewTab={noop}
      closeOtherTabs={noop} closeTabsToTheRight={noop} closeAllTabs={noop}
      deduplicateTabs={noop} reorderTabs={noop}
      renameTab={noop} togglePinTab={noop}
      tabActionIdx={null} setTabActionIdx={noop}
      lastTabCloseStrikesRef={{ current: 0 }}
      disableTabsPromptOpen={false} setDisableTabsPromptOpen={noop}
      gardenWarningOpen={false} setGardenWarningOpen={noop}
      setScreen={noop}
    />
  );
}

it('after the tabs overview crashes, closing it brings the storage banner back (v15-01)', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { rerender } = render(overlays(false));
    expect(screen.getByTestId('storage-banner')).toBeTruthy();
    rerender(overlays(true));                                  // the overview throws: the boundary catches
    expect(screen.queryByTestId('storage-banner')).toBe(null);
    rerender(overlays(false));                                 // the reader closes it
    expect(screen.getByTestId('storage-banner')).toBeTruthy(); // RED before: gone until restart
  } finally { quiet.mockRestore(); }
});
