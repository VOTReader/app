/* ═══════════════════════════════════════════════════════════════════════
   OfflineEditionsRow — Settings › Reading, under Bible Translation (mw-oe1)
   ═══════════════════════════════════════════════════════════════════════
   Which Bible editions open offline on this device, and one "Download all"
   for the rest with its size. Web only: the APK carries every edition, and a
   page no service worker controls cannot keep what it downloads (the store
   says 'unsupported' and the row is not drawn). State: utils/offline-editions.js.
   ═══════════════════════════════════════════════════════════════════════ */

import { useSettingsFind } from './settings-find.jsx';
import { SetRowText } from './SettingsRow.jsx';
import { OfflineEditions, editionCodes, editionBytes, formatEditionBytes, useOfflineEditions } from '../../utils/offline-editions.js';

/** @param {{ translation?: string }} props the picked edition: a new pick re-reads the caches */
export function OfflineEditionsRow({ translation }) {
  // Reads the caches on a new pick and when an edition's file lands (utils/offline-editions.js).
  useOfflineEditions(translation);

  const { phase, have, missing, done, total } = OfflineEditions.getState();
  const f = useSettingsFind('editions on this phone offline download all only nkjv');
  if (phase === 'unknown' || phase === 'unsupported') return null;
  const count = editionCodes().length;
  const size = formatEditionBytes(editionBytes(missing));

  // WS2 settings (st-read): "Editions on this phone", the mock's short line, and the download as a small pill.
  /** @type {string} */
  let line;
  /** @type {string | null} */
  let action = null;
  /** @type {string | null} */
  let actionName = null;
  if (phase === 'complete') line = 'All ' + count + ' open offline. NKJV is built in.';
  else if (phase === 'downloading') line = 'Downloading ' + Math.min(done + 1, total) + ' of ' + total + '…';
  else if (phase === 'stopped') {
    line = have.length + ' of ' + count + '. The download stopped: check the connection.';
    action = 'Try again · ' + size;
    actionName = 'Try the download again, ' + size;
  } else {
    line = (have.length ? have.length + ' of ' + count + '.' : 'Only NKJV.') + ' Another downloads when you pick it.';
    action = 'All · ' + size;
    actionName = 'Download all editions, ' + size;
  }
  if (!f.show) return null;

  return (
    <div className="settings-row offline-editions-row" data-found={f.place ? '' : undefined}>
      <div className="settings-row-head">
        <SetRowText place={f.place} label="Editions on this phone">
          <span className="settings-row-desc" role="status">{line}</span>
        </SetRowText>
        {action ? (
          <button type="button" className="ui-btn is-small ws2-pill-btn" aria-label={actionName || undefined} onClick={(e) => { e.stopPropagation(); void OfflineEditions.downloadAll(); }}>
            {action}
          </button>
        ) : null}
      </div>
      {phase === 'downloading' ? (
        <span className="settings-downloads-bar offline-editions-bar" aria-hidden="true">
          <span style={{ width: (total ? Math.max(4, (done / total) * 100) : 0) + '%' }} />
        </span>
      ) : null}
    </div>
  );
}
