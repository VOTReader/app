/* ═══════════════════════════════════════════════════════════════════════
   DownloadStrip — the Downloads screen's progress strip (downloads brief 2026-10-23, 3f; pictures 08-09)
   ═══════════════════════════════════════════════════════════════════════
   One line for the queue: "Downloading 3 of 30 · 191 MB left", "Paused · 3 of 30", "Waiting for Wi-Fi · 27 left",
   "Waiting for storage space · 27 left" with Make room, "No connection · 27 left", and in a browser "Downloads stopped
   when VOTReader closed. · 27 left · 191 MB" with Resume (the web store's 'closed': a page runs nothing once shut);
   a 3 px progress line; Pause all / Resume all and Cancel. It reads the store's queue calls from datasafe's dl-d2 contract
   (D:/Swarm/lanes/datasafe/out/dl-d2/BRIDGE.md: paused, reason, left, batch, pause, resume) where the store has them,
   and the older pending() / waiting() where it does not, so it says what it can on every build.
   ═══════════════════════════════════════════════════════════════════════ */

import { formatBytes, useOnline } from './OfflineAudioControls.jsx';
import { countOf } from '../../utils/download-tree.js';

/** @param {any} off @param {string} name @returns {any} the store's answer, or undefined where it has no such call */
function _ask(off, name) {
  return typeof off[name] === 'function' ? off[name]() : undefined;
}

/**
 * What the strip says (the Library's Downloads row says line1 too), or null with nothing on its way.
 * @param {any} off @param {boolean} online
 * @returns {{ reason: string | null, line1: string, line2: string, cls: string, count: number, leftBytes: string, done: number, total: number } | null}
 */
export function stripModel(off, online) {
  const pending = typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const paused = _ask(off, 'paused') === true;
  const left = _ask(off, 'left');
  const batch = _ask(off, 'batch');
  const count = left && left.count >= 0 ? left.count : pending.busy;
  if (!count) return null;
  let reason = _ask(off, 'reason');
  if (reason === undefined) reason = typeof off.waiting === 'function' && off.waiting() ? 'wifi' : null;
  if (!online && !paused && reason !== 'wifi') reason = 'offline';
  if (paused && reason !== 'closed') reason = 'paused';
  const leftBytes = left && left.bytes > 0 ? formatBytes(left.bytes) : '';
  const total = batch && batch.total > 0 ? batch.total : 0;
  const done = total ? Math.min(batch.done, total) : 0;
  const nth = total ? Math.min(done + 1, total) + ' of ' + total : '';
  let line1 = '';
  let line2 = '';
  let cls = '';
  if (reason === 'closed') { line1 = 'Downloads stopped when VOTReader closed.'; line2 = countOf(count, 'recording') + ' left' + (leftBytes ? ' · ' + leftBytes : ''); cls = 'is-paused'; }
  else if (reason === 'paused') { line1 = 'Paused' + (nth ? ' · ' + nth : ' · ' + countOf(count, 'recording') + ' left'); line2 = leftBytes ? leftBytes + ' left' : ''; cls = 'is-paused'; }
  else if (reason === 'wifi') { line1 = 'Waiting for Wi-Fi · ' + count + ' left'; line2 = (leftBytes ? leftBytes + ' · ' : '') + 'starts on Wi-Fi'; cls = 'is-waiting'; }
  else if (reason === 'space') { line1 = 'Waiting for storage space · ' + count + ' left'; line2 = leftBytes ? 'Needs ' + leftBytes + ' more room' : 'Remove some downloads to go on'; cls = 'is-waiting'; }
  else if (reason === 'offline') { line1 = 'No connection · ' + count + ' left'; line2 = 'Starts again when you’re online'; cls = 'is-waiting'; }
  else if (reason === 'retrying') { line1 = 'Trying again · ' + count + ' left'; line2 = 'The server didn’t answer; it tries 3 times'; cls = 'is-waiting'; }
  else { line1 = 'Downloading ' + (nth || '· ' + countOf(count, 'recording') + ' to go'); line2 = leftBytes ? leftBytes + ' left' : ''; }
  return { reason, line1, line2, cls, count, leftBytes, done, total };
}

/**
 * @param {{ off: any, onMakeRoom?: () => void }} props onMakeRoom = show what is on the phone (the On this phone tab)
 */
export function DownloadStrip({ off, onMakeRoom }) {
  const online = useOnline();
  const m = stripModel(off, online);
  if (!m) return null;
  const { reason, line1, line2, cls, done, total } = m;
  const canPause = typeof off.pause === 'function';
  const pct = total ? Math.round((done / total) * 100) : null;
  return (
    <div className={'dl-strip ' + cls} role="status" aria-live="polite">
      <div className="dl-strip-text">
        <p className="dl-strip-line1">{line1}</p>
        {line2 ? <p className="dl-strip-line2">{line2}</p> : null}
      </div>
      <div className="dl-strip-actions">
        {reason === 'space' && onMakeRoom ? <button type="button" className="dl-link" onClick={onMakeRoom}>Make room</button> : null}
        {reason === 'closed' ? <button type="button" className="dl-footer-go" onClick={() => off.resume()}>Resume</button> : null}
        {canPause && reason === 'paused' ? <button type="button" className="dl-link" onClick={() => off.resume()}>Resume all</button> : null}
        {canPause && reason !== 'paused' && reason !== 'space' && reason !== 'closed' ? <button type="button" className="dl-link" onClick={() => off.pause()}>Pause all</button> : null}
        {reason !== 'closed' ? <button type="button" className="dl-link" onClick={() => off.cancelAll()}>{canPause ? 'Cancel' : 'Cancel all'}</button> : null}
      </div>
      {pct != null && (reason == null || reason === 'paused') ? (
        <span className="dl-strip-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={'Downloads ' + pct + '% done'}>
          <span style={{ width: Math.max(2, pct) + '%' }} />
        </span>
      ) : null}
    </div>
  );
}
