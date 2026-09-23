/* ═══════════════════════════════════════════════════════════════════════
   OfflineLibraryBanner — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   "Offline library incomplete" with a Retry that downloads only the
   missing files (B5, 2026-09-22). Subscribes to OfflineLibrary
   (utils/offline-library.js) through useSyncExternalStore and starts its
   once-per-load check on mount.

   It shares the top strip with StorageHealthBanner, which renders it only
   when it has no storage scenario of its own: data danger comes first.
   Same .sh-banner look (Codex mockup variant B, lanes/docs/out/b5-mockups.html),
   but role="status": a missing offline file is news, not an alarm.
   ═══════════════════════════════════════════════════════════════════════ */

import { OfflineLibrary } from '../../utils/offline-library.js';

/** @param {number} n @param {string} one @param {string} many */
function count(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + many; }

export function OfflineLibraryBanner() {
  React.useSyncExternalStore(OfflineLibrary.subscribe, OfflineLibrary.getVersion);
  React.useEffect(() => { OfflineLibrary.start(); }, []);
  const { phase, missing } = OfflineLibrary.getState();

  /** @type {{ lead: string, detail: string, retry: boolean, close: boolean } | null} */
  let view = null;
  if (phase === 'incomplete') {
    view = { lead: 'Offline library incomplete.', detail: count(missing, 'file did not download.', 'files did not download.'), retry: true, close: true };
  } else if (phase === 'retrying') {
    view = { lead: 'Downloading ' + count(missing, 'missing file', 'missing files') + '…', detail: '', retry: false, close: true };
  } else if (phase === 'fixed') {
    view = { lead: 'Offline library complete.', detail: '', retry: false, close: false };
  } else if (phase === 'still') {
    view = {
      lead: 'Offline library incomplete.',
      detail: count(missing, 'file is still missing.', 'files are still missing.') + ' Connect to the internet, then retry.',
      retry: true,
      close: true,
    };
  }
  if (!view) return null;

  return (
    <div className="sh-banner sh-banner-gold offline-library-banner" role="status">
      <div className="sh-banner-text">
        <strong>{view.lead}</strong>{view.detail ? ' ' + view.detail : ''}
      </div>
      {(view.retry || view.close) && (
        <div className="sh-banner-actions">
          {view.retry && (
            <button type="button" className="sh-banner-btn sh-banner-btn-primary" onClick={() => { OfflineLibrary.retry(); }}>
              Retry
            </button>
          )}
          {view.close && (
            <button type="button" className="sh-banner-dismiss" onClick={() => OfflineLibrary.dismiss()} aria-label="Dismiss">
              {'✕'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
