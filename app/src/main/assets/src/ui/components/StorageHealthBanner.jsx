/* ═══════════════════════════════════════════════════════════════════════
   StorageHealthBanner — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   App-wide storage health banner. Subscribes to StorageHealth via
   useSyncExternalStore so only this component re-renders on tier
   changes — no full-app re-render.

   Renders the appropriate banner for scenarios 6, 7, 8 from the
   W2.7 design. Scenario 5 (caution-level, Settings-only) is handled
   inline in SettingsScreen. Scenarios 3 + 4 (Safari modal + iOS PWA
   welcome card) are separate components in W2.7e. Scenario 2 (the
   "not protected from browser cleanup" nag) was REMOVED 2026-07-12
   (owner call) — only banners about ACTUAL data danger remain.

   Priority (highest first):
     versionTooNew                        → newer-version (v04-03)
     dataMissing                          → data-missing (datasafe 10-05)
     READONLY with writeFailedThisSession → scenario 7 (write-failed)
     CRITICAL with privateModeLikely      → scenario 8 (private mode)
     CRITICAL                             → scenario 7 (critical quota)
     WARNING                              → scenario 6 (running low)
     storesDegraded                       → storage-slow (E5)
     HEALTHY                              → null (nothing)
   ═══════════════════════════════════════════════════════════════════════ */

import { OfflineLibraryBanner, useTopStrip } from './OfflineLibraryBanner.jsx';

/**
 * @returns {import('../../utils/storage-health.js').StorageHealthReport}
 */
export function useStorageHealth() {
  React.useSyncExternalStore(StorageHealth.subscribe, StorageHealth.getVersion);
  return StorageHealth.getReport();
}

export function StorageHealthBanner({ onNavigateSettings }) {
  const report = useStorageHealth();

  const scenario = _pickScenario(report);
  // cz3: under the nav and taking room there, like the offline strip (it hid Back, Home and Search when fixed over the nav).
  const ref = useTopStrip(!!scenario);
  // B5: with no storage scenario, the strip is free for the offline library's
  // notice (it renders nothing unless files are missing). Data danger wins.
  if (!scenario) return <OfflineLibraryBanner />;

  return (
    <div ref={ref} className={`sh-banner sh-banner-${scenario.style}`} role="alert">
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
   */
  function _pickScenario(r) {
    const { tier, remaining, privateModeLikely, writeFailedThisSession, storesDegraded, versionTooNew, dataMissing } = r;

    // v04-03: a NEWER VOTReader saved this device's data, so this build cannot open
    // it (IDB VersionError). First: it explains every other symptom - the stores are
    // degraded (never "slow", they cannot catch up) and a write that fails here is
    // not full storage. The data on disk is untouched; the fix is the latest build.
    if (versionTooNew) {
      // n6-14: the phone app is installed; on the web a reload fetches the latest.
      const android = typeof PlatformBridge !== 'undefined' && !!PlatformBridge.isAndroid;
      return {
        id: 'newer-version',
        style: 'danger',
        text: android
          ? "Your library was saved by a newer version of VOTReader, so this version can't open it. Nothing on this device has been lost: install the latest version. Changes you make here won't be saved."
          : "Your library was saved by a newer version of VOTReader, so this version can't open it. Nothing on this device has been lost: reload VOTReader to get the latest version. Changes you make here won't be saved.",
        dismissable: false,
        buttons: android ? [] : [{ label: 'Reload', primary: true, onClick: () => { try { window.location.reload(); } catch (_e) { /* nothing more to do */ } } }],
      };
    }

    // datasafe 10-05: the library is much smaller than its newest automatic
    // snapshot (utils/data-safety.js). Restore MERGES the snapshot back - nothing
    // made since is dropped - and reloads.
    if (dataMissing && !StorageHealth.isDismissed('data-missing')) {
      return {
        id: 'data-missing',
        style: 'danger',
        text: `Some of your data looks missing. On ${_snapDate(dataMissing.at)} you had ${_what(dataMissing.then)}; now ${_what(dataMissing.now)}. Restore adds back what is missing and keeps everything you have made since.`,
        dismissable: true,
        buttons: [
          { label: 'Restore', primary: true, onClick: () => { if (typeof DataSafety !== 'undefined') Promise.resolve(DataSafety.restoreMissing()).catch(() => {}); } },
          // The drop was the reader's own (a big delete): stop offering, snapshot what is here now.
          { label: 'Keep as is', onClick: () => { if (typeof DataSafety !== 'undefined') Promise.resolve(DataSafety.acceptCurrent()).catch(() => {}); } },
        ],
      };
    }

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

    // (The former scenario-2 "not protected from browser cleanup" nag was
    // REMOVED 2026-07-12, owner call: it warned about hypothetical eviction,
    // not a real emergency. Persistence is still requested silently where
    // that's free (see _ensurePersistence in storage-health.js), and the
    // Settings → Storage row keeps the manual "Protect now" lever for the
    // one engine that prompts (Firefox). The banners that remain above all
    // signal ACTUAL data danger — write failure, full storage, private
    // mode — and stay.)

    // E5: lowest priority — a store is stuck in the degraded hydration tier
    // (serving empty defaults). Placed last so it never masks a real quota /
    // write-fail / private-mode banner; auto-clears when the store recovers.
    if (storesDegraded) {
      return {
        id: 'storage-slow',
        style: 'amber',
        text: 'Storage is slow to load. Your saved library will appear once it catches up; your place and settings changed before then may not be kept.',
        dismissable: false,
        buttons: [],
      };
    }

    return null;
  }

  /** @param {number} at */
  function _snapDate(at) {
    try { return new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); } catch (_e) { return 'an earlier day'; }
  }

  /** The counts that matter, in words: "55 highlights, 6 notes, 627 read marks". @param {any} m */
  function _what(m) {
    const parts = [];
    const add = (n, one, many) => { if (n) parts.push(n + ' ' + (n === 1 ? one : many)); };
    add(m.highlights, 'highlight', 'highlights');
    add(m.notes, 'note', 'notes');
    add(m.links, 'link', 'links');
    add(m.bookmarks, 'bookmark', 'bookmarks');
    add(m.journal, 'journal entry', 'journal entries');
    add(m.readMarks, 'read mark', 'read marks');
    return parts.length ? parts.join(', ') : 'nothing saved';
  }

  function _goExport() {
    if (onNavigateSettings) onNavigateSettings();
  }
}
