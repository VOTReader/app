/* ═══════════════════════════════════════════════════════════════════════
   AppShellOverlays — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The 4 modal/prompt overlays that sit ABOVE the ROUTES dispatch slot
   in App() — extracted from app.jsx (Phase 2 P9d):

     1. Welcome modal           — splash on first launch + "open in
                                  browser" hyperlink target
     2. Tabs overview          — full-screen tab switcher (TabsOverview
                                  + TabActionSheet long-press menu)
     3. Disable-tabs prompt    — shown after the user closes their last
                                  tab a few times in a row
     4. Garden warning         — pre-launch storage/bandwidth disclosure
                                  + image-quality tier picker

   These are unrelated to the per-screen render path — they sit above
   it as ephemeral overlays. Grouping them in one shell component keeps
   App() focused on screen composition. The component renders them in
   the same DOM order as before, so z-index stacking is preserved.

   Free-variable refs (HomeBtn, TabsOverview, TabActionSheet,
   GARDEN_TIERS, getGardenTier) resolve from window at call time —
   same convention as the rest of this cluster.
   ═══════════════════════════════════════════════════════════════════════ */

export function AppShellOverlays({
  // Welcome modal
  showWelcome, isOnline, dismissWelcome,
  // Tabs overview + TabActionSheet
  settings, updateSetting,
  tabsOverviewOpen, setTabsOverviewOpen,
  tabs, activeTabIdx, tabThumbnails, MAX_TABS,
  switchToTab, closeTab, openNewTab,
  closeOtherTabs, closeTabsToTheRight, closeAllTabs, deduplicateTabs,
  tabActionIdx, setTabActionIdx,
  lastTabCloseStrikesRef,
  // Disable-tabs prompt
  disableTabsPromptOpen, setDisableTabsPromptOpen,
  // Garden warning
  gardenWarningOpen, setGardenWarningOpen,
  setSettings, setScreen,
}) {
  // W1.5(a.2) — Escape-key dispatch registrations. Each modal registers
  // a stable string ID + a dismiss callback. The app-level Escape
  // dispatcher in useAndroidBack calls peek().dismiss when isAnyOpen().
  // `active` gates whether the entry exists in the registry — these
  // overlays are always mounted (AppShellOverlays is always rendered)
  // so we can't conditionally call the hook; instead we toggle active
  // off when the modal is closed.
  useModalRegistry({ id: 'welcome-modal', dismiss: dismissWelcome, active: !!showWelcome });
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
  useModalRegistry({
    id: 'garden-warning',
    dismiss: () => setGardenWarningOpen(false),
    active: !!gardenWarningOpen,
  });

  return (
    <>
      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundImage: 'url("splash.jpg")',
          backgroundColor: '#0a0e1a',
          backgroundSize: 'contain', backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={dismissWelcome}
              style={{
                margin: 'calc(var(--inset-top, 0px) + 1rem) 1rem 0 0',
                background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.35)',
                borderRadius: '50%', width: '2.4rem', height: '2.4rem',
                color: '#fff', fontSize: '1.2rem', lineHeight: 1,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
              {"✕"}
            </button>
          </div>

          {isOnline && (
            <a
              href="https://www.thevolumesoftruth.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: 'absolute', left: '50%', top: '37%', transform: 'translateX(-50%)',
                width: '60%', maxWidth: '400px', height: '8%',
                zIndex: 1, borderBottom: '1.5px solid #6cacf0'
              }}
            />
          )}
        </div>
      )}

      {settings.tabsEnabled && tabsOverviewOpen && (
        <div className="tabs-overview-layer">
          <ScreenLayout navChildren={
            <>
              <button className="nav-home" onClick={() => setTabsOverviewOpen(false)}>{"← Back"}</button>
              <HomeBtn />
            </>
          }>
            <TabsOverview
              tabs={tabs}
              activeTabIdx={activeTabIdx}
              onSelect={(i) => {lastTabCloseStrikesRef.current = 0;switchToTab(i);setTabsOverviewOpen(false);}}
              onClose={(i) => closeTab(i)}
              onNewTab={() => {lastTabCloseStrikesRef.current = 0;openNewTab();setTabsOverviewOpen(false);}}
              onLongPress={(i) => setTabActionIdx(i)}
              onClearAll={() => { closeAllTabs(); lastTabCloseStrikesRef.current = 0; }}
              onDedupe={() => deduplicateTabs()}
              MAX_TABS={MAX_TABS}
              thumbnails={tabThumbnails}
            />
          </ScreenLayout>
        </div>
      )}
      {tabActionIdx != null && (
        <TabActionSheet
          idx={tabActionIdx}
          total={tabs.length}
          onCloseOthers={() => {closeOtherTabs(tabActionIdx);lastTabCloseStrikesRef.current = 0;}}
          onCloseToRight={() => {closeTabsToTheRight(tabActionIdx);lastTabCloseStrikesRef.current = 0;}}
          onDismiss={() => setTabActionIdx(null)}
        />
      )}

      {disableTabsPromptOpen && (
        <div className="disable-tabs-overlay" onClick={() => setDisableTabsPromptOpen(false)}>
          <div className="disable-tabs-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="disable-tabs-eyebrow">You keep closing your last tab</div>
            <h2 className="disable-tabs-title">Disable tabs?</h2>
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

      {gardenWarningOpen && (() => {
        const selectedTier = getGardenTier(settings.gardenTier);
        return (
          <div className="garden-warning-overlay" onClick={() => setGardenWarningOpen(false)}>
            <div className="garden-warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="garden-warning-title">Before You Begin</div>
              <div className="garden-warning-body">
                <em>A Return to The Garden</em> contains <strong>209 high-resolution photographs</strong> totaling approximately <strong>{selectedTier.size}</strong> at the selected quality. Pages stream from the internet as you read and are cached on your device.
                <br /><br />For the best experience, connect to <strong>Wi-Fi</strong> before proceeding. Mobile data charges may apply otherwise.
                <br /><br />Please also ensure your device has sufficient <strong>free storage</strong> available to cache the full collection.
              </div>
              <div className="garden-tier-selector">
                <div className="garden-tier-label">Image Quality</div>
                <div className="garden-tier-hint">You can change this anytime from the Settings menu.</div>
                {GARDEN_TIERS.map((t) => (
                  <button
                    key={t.id}
                    className={`garden-tier-option${settings.gardenTier === t.id ? " selected" : ""}`}
                    onClick={() => setSettings((s) => ({ ...s, gardenTier: t.id }))}>
                    <div className="garden-tier-option-main">
                      <span className="garden-tier-option-name">{t.label}</span>
                      <span className="garden-tier-option-size">{t.size}</span>
                    </div>
                    <div className="garden-tier-option-desc">{t.res}{" \xB7 "}{t.desc}</div>
                  </button>
                ))}
              </div>
              <div className="garden-warning-actions">
                <button className="garden-warning-btn garden-warning-btn-cancel"
                  onClick={() => setGardenWarningOpen(false)}>Go Back</button>
                <button className="garden-warning-btn garden-warning-btn-proceed"
                  onClick={() => {
                    GardenWarningFlagStore.set();
                    setGardenWarningOpen(false);
                    setScreen("garden-view");
                  }}>Proceed</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
