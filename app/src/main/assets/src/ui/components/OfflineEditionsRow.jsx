/* ═══════════════════════════════════════════════════════════════════════
   OfflineEditionsRow — Settings › Reading, under Bible Translation (mw-oe1)
   ═══════════════════════════════════════════════════════════════════════
   Which Bible editions open offline on this device, and one "Download all"
   for the rest with its size. Web only: the APK carries every edition, and a
   page no service worker controls cannot keep what it downloads (the store
   says 'unsupported' and the row is not drawn). State: utils/offline-editions.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { OfflineEditions, editionCodes, editionBytes, formatEditionBytes, useOfflineEditions } from '../../utils/offline-editions.js';

/** @param {{ translation?: string }} props the picked edition: a new pick re-reads the caches */
export function OfflineEditionsRow({ translation }) {
  // Reads the caches on a new pick and when an edition's file lands (utils/offline-editions.js).
  useOfflineEditions(translation);

  const { phase, have, missing, done, total } = OfflineEditions.getState();
  if (phase === 'unknown' || phase === 'unsupported') return null;
  const count = editionCodes().length;
  const size = formatEditionBytes(editionBytes(missing));

  /** @type {string} */
  let line;
  /** @type {string | null} */
  let action = null;
  if (phase === 'complete') line = 'All ' + count + ' are on this device and open offline. NKJV is built in.';
  else if (phase === 'downloading') line = 'Downloading ' + Math.min(done + 1, total) + ' of ' + total + '…';
  else if (phase === 'stopped') {
    line = have.length + ' of ' + count + ' on this device. The download stopped: check the connection.';
    action = 'Try again · ' + size;
  } else {
    line = (have.length ? have.length + ' of ' + count + ' on this device.' : 'Only NKJV is on this device.')
      + ' The edition you pick downloads when you pick it.';
    action = 'Download all · ' + size;
  }

  return (
    <div className="settings-row offline-editions-row">
      <div className="settings-row-head">
        <span className="settings-row-label">Editions for offline</span>
        <span className="settings-row-grow" />
        {action ? (
          <button type="button" className="settings-clear-btn" onClick={(e) => { e.stopPropagation(); void OfflineEditions.downloadAll(); }}>
            {action}
          </button>
        ) : null}
      </div>
      {phase === 'downloading' ? (
        <span className="settings-downloads-bar offline-editions-bar" aria-hidden="true">
          <span style={{ width: (total ? Math.max(4, (done / total) * 100) : 0) + '%' }} />
        </span>
      ) : null}
      <div className="settings-data-value" role="status">{line}</div>
    </div>
  );
}
