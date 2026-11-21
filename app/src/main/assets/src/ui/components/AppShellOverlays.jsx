/* ═══════════════════════════════════════════════════════════════════════
   AppShellOverlays — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The 3 modal/prompt overlays that sit ABOVE the ROUTES dispatch slot
   in App() — extracted from app.jsx (Phase 2 P9d):

     1. Tabs overview          — full-screen tab switcher (TabsOverview
                                  + TabActionSheet long-press menu)
     2. Disable-tabs prompt    — shown after the user closes their last
                                  tab a few times in a row
     3. Garden warning         — pre-launch storage/bandwidth disclosure
                                  + image-quality tier picker

   These are unrelated to the per-screen render path — they sit above
   it as ephemeral overlays. Grouping them in one shell component keeps
   App() focused on screen composition. The component renders them in
   the same DOM order as before, so z-index stacking is preserved.

   Free-variable refs (HomeBtn, TabsOverview, TabActionSheet,
   GARDEN_TIERS, getGardenTier) resolve from window at call time —
   same convention as the rest of this cluster.
   ═══════════════════════════════════════════════════════════════════════ */

import { GARDEN_TIERS } from '../../utils/garden.js';
import { formatBytes } from '../../utils/format-bytes.js';
import { ActionSheet } from './SelectField.jsx';
import { UiButton } from './UiParts.jsx';
import { UiIcon } from './UiIcon.jsx';
import { navOriginLabel } from '../../utils/tabs.js';
import { BarTextAction } from './RootNav.jsx';
import { OPEN_YOUR_DATA_EVENT } from '../../utils/your-data-link.js';
import { InstallPopup } from './InstallCard.jsx';

export function AppShellOverlays({
  // Tabs overview + TabActionSheet
  settings, updateSetting,
  tabsOverviewOpen, setTabsOverviewOpen,
  tabs, activeTabIdx, tabThumbnails, MAX_TABS,
  switchToTab, closeTab, openNewTab,
  closeOtherTabs, closeTabsToTheRight, closeAllTabs, deduplicateTabs, reorderTabs,
  renameTab, togglePinTab,
  tabActionIdx, setTabActionIdx,
  lastTabCloseStrikesRef,
  // Disable-tabs prompt
  disableTabsPromptOpen, setDisableTabsPromptOpen,
  // Garden warning
  gardenWarningOpen, setGardenWarningOpen,
  setScreen, goSettings = null,
  // "Show me around" (review-tutorial): the Home strip needs the screen; the overlay needs nothing.
  screen,
}) {
  // W1.5(a.2) — Escape-key dispatch registrations. Each modal registers
  // a stable string ID + a dismiss callback. The app-level Escape
  // dispatcher in useAndroidBack calls peek().dismiss when isAnyOpen().
  // `active` gates whether the entry exists in the registry — these
  // overlays are always mounted (AppShellOverlays is always rendered)
  // so we can't conditionally call the hook; instead we toggle active
  // off when the modal is closed.
  // r-tabs (W2h): "Close all" sits in the bar; it asks first, in the overview (TabsOverview's ConfirmStrip).
  const [tabsClearAsk, setTabsClearAsk] = React.useState(false);
  React.useEffect(() => { if (!tabsOverviewOpen) setTabsClearAsk(false); }, [tabsOverviewOpen]);
  const tabsUnpinned = (tabs || []).filter((t) => !(t && t.pinned)).length;
  const tabsCanClear = tabsUnpinned > 0 && (tabs || []).length > 1;
  useModalRegistry({
    id: 'tabs-overview',
    dismiss: () => setTabsOverviewOpen(false),
    active: !!(settings.tabsEnabled && tabsOverviewOpen),
  });
  useModalRegistry({
    id: 'tab-action-sheet',
    dismiss: () => setTabActionIdx(null),
    active: tabActionIdx != null,
  });
  useModalRegistry({
    id: 'disable-tabs-prompt',
    dismiss: () => setDisableTabsPromptOpen(false),
    active: !!disableTabsPromptOpen,
  });
  // [13] focus traps — Tab stays inside the open dialog (Escape already
  // routes through the registry above). Refs land on each dialog's root.
  const disableTabsTrapRef = useFocusTrap(!!disableTabsPromptOpen);
  // Going to Settings from a banner or a toast keeps the way back (goSettings saves where he was).
  const toSettingsRef = React.useRef(() => {});
  toSettingsRef.current = () => { if (screen === 'settings') return; if (goSettings) goSettings(); else setScreen('settings'); };
  // id-datasafe2 171: a toast's "Open Your Data" goes to Settings; Settings opens the group.
  React.useEffect(() => {
    const go = () => toSettingsRef.current();
    window.addEventListener(OPEN_YOUR_DATA_EVENT, go);
    return () => window.removeEventListener(OPEN_YOUR_DATA_EVENT, go);
  }, [setScreen]);
  const tabsTrapRef = useFocusTrap(!!(settings.tabsEnabled && tabsOverviewOpen));
  // (TabActionSheet traps itself — it mounts only while open.)

  return (
    // ERR3: a crash in any overlay is caught HERE (fallback={null} → it vanishes
    // + logs) instead of escaping to the root boundary and taking down the app.
    // v15-01: it also comes back whenever an overlay opens or closes or the
    // screen changes (a reader's action, so a broken overlay cannot loop). It
    // never reset before: a crashed tabs overview also took the storage
    // warning away until a restart.
    <ErrorBoundary fallback={null} resetKey={[screen, !!tabsOverviewOpen, tabActionIdx, !!disableTabsPromptOpen, !!gardenWarningOpen].join('|')}>
    <>
      <StorageHealthBanner onNavigateSettings={() => toSettingsRef.current()} />
      <Safari7DayModal />
      <IosPwaWelcomeCard onNavigateSettings={() => setScreen('settings')} />
      {/* The install popup comes up by itself on Home when the browser can install the app (Corbin 2026-11-20). */}
      <InstallPopup screen={screen} />
      {/* The audio mini-player is app.jsx's, after the screen: here, before it, Tab and a screen reader met its
          controls ahead of the page's own (sweep W66). */}

      {settings.tabsEnabled && tabsOverviewOpen && (
        <div className="tabs-overview-layer" ref={tabsTrapRef} role="dialog" aria-modal="true" aria-labelledby="tabs-overview-title">
          {/* trackScroll={false}: this overlay renders OVER a live reading
              screen, so it must not become the global scroll-memory target —
              otherwise opening it hijacks __scrollEl and closing it nulls it,
              killing scroll recording on the screen underneath until the next
              nav. The overview's own scrolling is unaffected (it scrolls
              natively; scroll-memory just doesn't track it). */}
          {/* The overlay nav carries back + Home only — hide the whole right
              cluster. onHomeBefore: __goHome changes the screen UNDER this
              overlay, so close it too or the tap looks like a dead button. */}
          {/* landmarks={false}: the live screen underneath owns the document's
              one main landmark and its nav; this dialog must not add a second pair. */}
          <ScreenLayout trackScroll={false} landmarks={false} hideTabsBtn utility={{
            title: 'Tabs', titleId: 'tabs-overview-title',
            onBack: () => setTabsOverviewOpen(false),
            // n177: Back closes the overview onto the tab underneath; it says which.
            backLabel: tabs[activeTabIdx] ? 'Back to ' + (tabs[activeTabIdx].customTitle || navOriginLabel(tabs[activeTabIdx])) : 'Back',
            actions: [<BarTextAction key="clear" label="Close all" disabled={!tabsCanClear} onClick={() => setTabsClearAsk(true)} />],
          }}>
            <TabsOverview
              tabs={tabs}
              activeTabIdx={activeTabIdx}
              onSelect={(i) => {lastTabCloseStrikesRef.current = 0;switchToTab(i);setTabsOverviewOpen(false);}}
              onClose={(i) => closeTab(i)}
              onNewTab={() => {lastTabCloseStrikesRef.current = 0;openNewTab();setTabsOverviewOpen(false);}}
              onMenu={(i) => setTabActionIdx(i)}
              onReorder={(from, to) => reorderTabs(from, to)}
              onClearAll={() => { closeAllTabs(); lastTabCloseStrikesRef.current = 0; }}
              onDedupe={() => deduplicateTabs()}
              clearAsk={tabsClearAsk}
              onClearAsk={setTabsClearAsk}
              MAX_TABS={MAX_TABS}
              thumbnails={tabThumbnails}
            />
          </ScreenLayout>
          {tabActionIdx != null && (
            <TabActionSheet
              idx={tabActionIdx}
              total={tabs.length}
              tabs={tabs}
              tab={tabs[tabActionIdx] || null}
              onCloseOthers={() => {closeOtherTabs(tabActionIdx);lastTabCloseStrikesRef.current = 0;}}
              onCloseToRight={() => {closeTabsToTheRight(tabActionIdx);lastTabCloseStrikesRef.current = 0;}}
              onRename={(title) => renameTab(tabActionIdx, title)}
              onTogglePin={() => togglePinTab(tabActionIdx)}
              onMove={(d) => { const to = tabActionIdx + d; if (to < 0 || to >= tabs.length) return; reorderTabs(tabActionIdx, to); setTabActionIdx(to); }}
              onDismiss={() => setTabActionIdx(null)}
            />
          )}
        </div>
      )}

      {disableTabsPromptOpen && (
        <div className="disable-tabs-overlay" onClick={() => setDisableTabsPromptOpen(false)}>
          <div className="disable-tabs-dialog" ref={disableTabsTrapRef} role="dialog" aria-modal="true" aria-labelledby="disable-tabs-title" onClick={(e) => e.stopPropagation()}>
            <div className="disable-tabs-eyebrow">You keep closing your last tab</div>
            <h2 className="disable-tabs-title" id="disable-tabs-title">Disable tabs?</h2>
            <div className="disable-tabs-body">{"Tabs let you juggle multiple reading places — a chapter, a letter, a study in parallel. If you only read one at a time, disabling tabs hides the switcher and this close button. You can re-enable tabs anytime in Settings — your open tabs will be waiting."}</div>
            <div className="disable-tabs-actions">
              <button
                className="disable-tabs-btn secondary"
                onClick={() => setDisableTabsPromptOpen(false)}>
                Keep Tabs On
              </button>
              <button
                className="disable-tabs-btn primary"
                onClick={() => {
                  updateSetting("tabsEnabled", false);
                  setDisableTabsPromptOpen(false);
                  setTabsOverviewOpen(false);
                }}>
                Disable Tabs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WS6 (mock g-gate): the Garden's gate is a sheet. Quality as a column of sizes, the free space when the
          browser can say, Go back | Open the Garden. U09.6: offline, nothing of the Garden is on the phone before
          the first visit, so the same sheet says it needs a connection and offers only Go back. */}
      <GardenGate open={!!gardenWarningOpen} settings={settings} updateSetting={updateSetting}
        onClose={() => setGardenWarningOpen(false)}
        onOpen={() => { GardenWarningFlagStore.set(); setGardenWarningOpen(false); setScreen("garden-view"); }} />
      {/* The tour itself, a bundle-d free global (guarded like every shell free global: unit tests render the shell
          without it). Its offer, "Show me around", is an inline card at the end of the Read tab (HomeScreen). */}
      {typeof TourOverlay !== 'undefined' ? <TourOverlay /> : null}
    </>
    </ErrorBoundary>
  );
}

/** The Garden's gate (WS6, mock g-gate). @param {{ open: boolean, settings: any, updateSetting: (k: string, v: any) => void,
    onClose: () => void, onOpen: () => void }} props */
export function GardenGate({ open, settings, updateSetting, onClose, onOpen }) {
  const [free, setFree] = React.useState(/** @type {number|null} */ (null));
  React.useEffect(() => {
    if (!open) return undefined;
    let live = true;
    try {
      const est = typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null;
      if (est) est.then((e) => { if (live && e && e.quota) setFree(Math.max(0, e.quota - (e.usage || 0))); }, () => {});
    } catch (_e) { /* no estimate: the line leaves the number out */ }
    return () => { live = false; };
  }, [open]);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const total = /** @type {any} */ (globalThis).GARDEN_TOTAL || 209;
  if (offline) {
    return (
      <ActionSheet open={open} onClose={onClose} label="A Return to The Garden" title="No connection" className="garden-gate">
        <p className="garden-gate-note">The pictures come from the internet, and stay on your phone once you have seen them. Connect, then open it again.</p>
        <div className="garden-gate-foot"><UiButton wide onClick={onClose}>Go back</UiButton></div>
      </ActionSheet>
    );
  }
  const pick = settings.gardenTier || 'standard';
  return (
    <ActionSheet open={open} onClose={onClose} label="A Return to The Garden" title="Before you begin" className="garden-gate"
      confirm={{ label: 'Open the Garden', onConfirm: () => { onOpen(); return false; } }} cancelLabel="Go back">
      <p className="garden-gate-note">{total} high-resolution photographs. Pages stream from the internet as you read and are kept on your device.</p>
      <div className="ui-sheet-label garden-gate-label" id="garden-tier-label">Image quality</div>
      <div className="ui-group is-inset garden-tier-selector" role="radiogroup" aria-labelledby="garden-tier-label">
        {GARDEN_TIERS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={pick === t.id}
            className={'ui-row is-one no-lead garden-tier-option' + (pick === t.id ? ' selected' : '')}
            onClick={() => updateSetting('gardenTier', t.id)}>
            <span className="ui-row-text"><span className="ui-row-title">{t.label}</span><span className="ui-row-meta">{t.short || t.desc}</span></span>
            <span className="ui-row-value">{String(t.size).replace(/^~\s*/, '')}</span>
            <span className="garden-tier-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="garden-gate-wifi">
        <UiIcon name="wifi" size="sm" />
        <p className="garden-gate-note">Best on Wi-Fi; mobile data charges may apply otherwise.{free != null ? ' ' + formatBytes(free) + ' free on this phone.' : ''} You can change the quality any time in Settings.</p>
      </div>
    </ActionSheet>
  );
}
