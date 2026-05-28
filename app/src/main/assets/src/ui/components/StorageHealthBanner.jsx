/* ═══════════════════════════════════════════════════════════════════════
   StorageHealthBanner — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   App-wide storage health banner. Subscribes to StorageHealth via
   useSyncExternalStore so only this component re-renders on tier
   changes — no full-app re-render.

   Renders the appropriate banner for scenarios 2, 6, 7, 8 from the
   W2.7 design. Scenario 5 (caution-level, Settings-only) is handled
   inline in SettingsScreen. Scenarios 3 + 4 (Safari modal + iOS PWA
   welcome card) are separate components in W2.7e.

   Priority (highest first):
     READONLY with writeFailedThisSession → scenario 7 (write-failed)
     CRITICAL with privateModeLikely      → scenario 8 (private mode)
     CRITICAL                             → scenario 7 (critical quota)
     WARNING                              → scenario 6 (running low)
     CAUTION with not-persisted risk      → scenario 2 (not persisted)
     HEALTHY / dismissed                  → null (nothing)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @returns {import('../../utils/storage-health.js').StorageHealthReport}
 */
export function useStorageHealth() {
  React.useSyncExternalStore(StorageHealth.subscribe, StorageHealth.getVersion);
  return StorageHealth.getReport();
}

export function StorageHealthBanner({ onNavigateSettings }) {
  const report = useStorageHealth();
  const [persistResult, setPersistResult] = React.useState(
    /** @type {'idle' | 'granted' | 'denied'} */ ('idle')
  );

  const scenario = _pickScenario(report, persistResult);
  if (!scenario) return null;

  return (
    <div className={`sh-banner sh-banner-${scenario.style}`} role="alert">
      <div className="sh-banner-text">{scenario.text}</div>
      <div className="sh-banner-actions">
        {scenario.buttons.map((btn, i) => (
          <button
            key={i}
            className={`sh-banner-btn${btn.primary ? ' sh-banner-btn-primary' : ''}`}
            onClick={btn.onClick}
          >
            {btn.label}
          </button>
        ))}
        {scenario.dismissable && (
          <button
            className="sh-banner-dismiss"
            onClick={() => StorageHealth.dismissScenario(scenario.id)}
            aria-label="Dismiss"
          >
            {"✕"}
          </button>
        )}
      </div>
    </div>
  );

  /**
   * @param {import('../../utils/storage-health.js').StorageHealthReport} r
   * @param {'idle' | 'granted' | 'denied'} persist
   */
  function _pickScenario(r, persist) {
    const { tier, risks, remaining, privateModeLikely, writeFailedThisSession } = r;

    if (tier === StorageHealth.TIER.READONLY && writeFailedThisSession) {
      return {
        id: 'write-failed',
        style: 'danger',
        text: "Your last change couldn't be saved — storage is full. Your work is still on screen but won't be kept if you close the app. Export your data now.",
        dismissable: false,
        buttons: [{ label: 'Export now', primary: true, onClick: _goExport }],
      };
    }

    if (privateModeLikely) {
      return {
        id: 'private-mode',
        style: 'danger',
        text: "You're in a private window. Nothing you save here will be kept when you close it.",
        dismissable: false,
        buttons: [],
      };
    }

    if (tier === StorageHealth.TIER.CRITICAL) {
      var remainText = remaining != null ? formatBytes(remaining) : 'very little';
      return {
        id: 'critical',
        style: 'danger',
        text: `Storage is almost full — ${remainText} remaining. Your data may not save. Export now to avoid losing it.`,
        dismissable: false,
        buttons: [{ label: 'Export now', primary: true, onClick: _goExport }],
      };
    }

    if (tier === StorageHealth.TIER.WARNING) {
      var warnRemain = remaining != null ? formatBytes(remaining) : 'limited space';
      return {
        id: 'warning',
        style: 'amber',
        text: `Storage is running low — ${warnRemain} remaining. New notes and recordings may not save.`,
        dismissable: false,
        buttons: [
          { label: 'Export data', primary: true, onClick: _goExport },
        ],
      };
    }

    if (risks.includes(StorageHealth.RISK.NOT_PERSISTED) && !StorageHealth.isDismissed('not-persisted')) {
      if (persist === 'granted') {
        return {
          id: 'not-persisted',
          style: 'gold',
          text: "Data protected ✓",
          dismissable: true,
          buttons: [],
        };
      }
      if (persist === 'denied') {
        return {
          id: 'not-persisted',
          style: 'gold',
          text: "Browser denied protection. Export regularly to keep your data safe.",
          dismissable: true,
          buttons: [{ label: 'Export now', primary: false, onClick: _goExport }],
        };
      }
      return {
        id: 'not-persisted',
        style: 'gold',
        text: "Your data isn't protected from browser cleanup yet.",
        dismissable: true,
        buttons: [{ label: 'Protect my data', primary: true, onClick: _handlePersist }],
      };
    }

    return null;
  }

  async function _handlePersist() {
    var granted = await StorageHealth.requestPersistence();
    setPersistResult(granted ? 'granted' : 'denied');
  }

  function _goExport() {
    if (onNavigateSettings) onNavigateSettings();
  }
}
