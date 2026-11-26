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
     libraryElsewhere                     → library-elsewhere (W8, web only)
     dataMissing                          → data-missing (datasafe 10-05)
     READONLY with writeFailedThisSession → scenario 7 (write-failed)
     privateModeLikely (any tier)         → scenario 8 (private mode)
     CRITICAL                             → scenario 7 (critical quota)
     WARNING                              → scenario 6 (running low)
     storesDegraded                       → storage-slow (E5)
     HEALTHY                              → null (nothing)
   ═══════════════════════════════════════════════════════════════════════ */

import { OfflineLibraryBanner, useTopStrip } from './OfflineLibraryBanner.jsx';
import { showToast } from '../../utils/toast.js';
import { openYourData } from '../../utils/your-data-link.js';
import { Notice } from './UiParts.jsx';
import { storeLabel } from '../../utils/store-labels.js';

/** ds5 s16.1: a banner action that failed says so; the banner itself stays. Runs fn now (a throw is a rejection). */
function _attempt(/** @type {() => any} */ fn) {
  try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
}

/** @param {string} text */
function _say(text) {
  try { showToast({ id: 'vot-toast-restore', className: 'vot-toast', text, durationMs: 6000 }); } catch (_e) { /* no document */ }
}

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

  // WS6 (mock sy-notices): the one notice style. The strip keeps its place under the bar (and its classes, which
  // name the severity); red only when a change is being lost, the private window is plain information.
  const tone = /** @type {'info' | 'warn' | 'danger'} */ (scenario.tone || (scenario.style === 'danger' ? 'danger' : scenario.style === 'amber' ? 'warn' : 'info'));
  const split = scenario.title ? [scenario.title, scenario.text] : _split(scenario.text);
  return (
    <div ref={ref} className={`sh-banner sh-banner-${scenario.style}`}>
      <Notice tone={tone} icon={scenario.icon} title={split[0]} text={split[1]}
        actions={scenario.buttons.map((btn) => ({ label: btn.label, onClick: btn.onClick, kind: btn.kind || (btn.primary ? 'primary' : 'secondary') }))}
        onDismiss={scenario.dismissable ? () => StorageHealth.dismissScenario(scenario.id) : undefined} />
    </div>
  );

  /** "Title. The rest." -> [title, rest]: a notice's one-line title is its first sentence. @param {string} t */
  function _split(t) {
    const m = /^(.+?[.!?])\s+([\s\S]*)$/.exec(t);
    return m ? [m[1].replace(/\.$/, ''), m[2]] : [t.replace(/\.$/, ''), ''];
  }

  /**
   * @param {import('../../utils/storage-health.js').StorageHealthReport} r
   */
  function _pickScenario(r) {
    const { tier, remaining, privateModeLikely, writeFailedThisSession, storesDegraded, versionTooNew, dataMissing, libraryElsewhere } = r;

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

    // W8 (sweep 2026-10-13): another tab cleared the library, imported a backup or restored a
    // snapshot. This tab's copy is the old one, so its saves are held (utils/other-tabs.js) -
    // they would write it back over the new library - and a save held here is not full storage.
    // Only the web has other tabs; a reload shows the library as it is now.
    if (libraryElsewhere) {
      return {
        id: 'library-elsewhere',
        style: 'danger',
        text: libraryElsewhere === 'changing'
          ? "Your library is being changed in another tab (a backup restore or Clear All). Changes you make here won't be saved. Reload this tab when it's done."
          : "Your library was changed in another tab. Reload to see it. Changes you make here won't be saved.",
        dismissable: false,
        buttons: [{ label: 'Reload', primary: true, onClick: () => { try { window.location.reload(); } catch (_e) { /* nothing more to do */ } } }],
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
          // restoreMissing answers its own false paths (ds5 s16.1); a throw is answered here.
          { label: 'Restore', primary: true, onClick: () => { if (typeof DataSafety !== 'undefined') _attempt(() => DataSafety.restoreMissing()).catch(() => _say('Restore could not run. Your library is unchanged.')); } },
          // The drop was the reader's own (a big delete): stop offering, snapshot what is here now.
          { label: 'Keep as is', onClick: () => {
            if (typeof DataSafety === 'undefined') return;
            const failed = () => _say('Kept as is, but a fresh copy could not be saved just now. It will be tried again.');
            _attempt(() => DataSafety.acceptCurrent()).then((r) => {
              if (r === 'failed') failed();
              else if (r === 'not-loaded') _say('Your library is still loading. Tap Keep as is again in a moment.');
            }, failed);
          } },
        ],
      };
    }

    if (tier === StorageHealth.TIER.READONLY && writeFailedThisSession) {
      return {
        id: 'write-failed',
        style: 'danger',
        title: 'Your last change could not be saved',
        text: 'Storage is full. Your work is still on screen but will not be kept if you close the app.',
        dismissable: false,
        buttons: [{ label: 'Back up now', primary: true, onClick: _goExport }],
      };
    }

    if (privateModeLikely) {
      return {
        id: 'private-mode',
        style: 'danger',
        tone: 'info', icon: 'info',
        title: 'You are in a private window',
        text: 'Nothing you save here will be kept when you close it.',
        dismissable: false,
        buttons: [],
      };
    }

    if (tier === StorageHealth.TIER.CRITICAL) {
      var remainText = remaining != null ? formatBytes(remaining) : 'very little';
      return {
        id: 'critical',
        style: 'danger',
        tone: 'warn',
        title: 'Storage is almost full',
        text: `${remainText} remaining. Your data may not save: back up now so nothing is lost.`,
        dismissable: false,
        buttons: [{ label: 'Back up now', primary: true, onClick: _goExport }],
      };
    }

    if (tier === StorageHealth.TIER.WARNING && !StorageHealth.isDismissed('warning')) {
      var warnRemain = remaining != null ? formatBytes(remaining) : 'limited space';
      return {
        id: 'warning',
        style: 'amber',
        title: 'Storage is running low',
        text: `${warnRemain} remaining. New notes and recordings may not save.`,
        dismissable: false,
        buttons: [
          { label: 'Back up', onClick: _goExport },
          { label: 'Not now', kind: 'text', onClick: () => StorageHealth.dismissScenario('warning') },
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
    // data-3: a store whose record is broken will not catch up by waiting: name it, say what
    // happens to new changes in it, and offer the backup of everything else.
    const unreadable = storesDegraded && typeof StorageHealth.getStoresUnreadable === 'function' ? StorageHealth.getStoresUnreadable() : [];
    if (unreadable.length) {
      return {
        id: 'storage-unreadable',
        style: 'amber',
        text: 'This device could not read your ' + unreadable.map(storeLabel).join(', ') + '. New changes there will not be kept. The automatic copies still hold the last good version; back up everything else now.',
        dismissable: false,
        buttons: [{ label: 'Back up', onClick: _goExport }],
      };
    }
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

  // "Back up now" lands on Your data, where the backup button is the first thing (PL-SETTINGS 2).
  function _goExport() {
    openYourData();
    if (onNavigateSettings) onNavigateSettings();
  }
}
