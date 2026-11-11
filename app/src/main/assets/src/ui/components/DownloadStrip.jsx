/* ═══════════════════════════════════════════════════════════════════════
   DownloadStrip — the Downloads screen's progress strip (downloads brief 2026-10-23, 3f; pictures 08-09)
   ═══════════════════════════════════════════════════════════════════════
   One line for the queue, by count and by bytes: "Downloading · 312 of 1,189 recordings" over "1.2 of 4.4 GB · about
   3 h left" (dl-rework E: the bar moves by bytes, and a time left shows once a rate is known). Its waits keep their
   own words: "Paused", "Waiting for Wi-Fi", "Waiting for storage space · Needs 340 MB more room" (the real shortfall),
   "Trying again", "No connection" only when nothing else explains the wait, and "Didn't download yet · 5 will try
   again" when only the store's will-try-again list is left. Pause all / Resume all; Cancel asks first.

   It reads the store's queue calls (dl-d2's BRIDGE.md plus dl-rework's overall, need, retryAll) where the store has
   them, and the older pending() / waiting() where it does not, so it says what it can on every build.
   ═══════════════════════════════════════════════════════════════════════ */

import { formatBytes, useOnline } from './OfflineAudioControls.jsx';
import { UiButton } from './UiParts.jsx';
import { countOf, formatLength } from '../../utils/download-tree.js';

/** @param {any} off @param {string} name @returns {any} the store's answer, or undefined where it has no such call */
function _ask(off, name) {
  return typeof off[name] === 'function' ? off[name]() : undefined;
}

/** "1.2 of 4.4 GB", or '' unknown. @param {number} done @param {number} total */
function _ofBytes(done, total) {
  if (!(total > 0)) return '';
  const a = formatBytes(done) || '0 MB';
  const b = formatBytes(total);
  const unit = (s) => s.replace(/^[\d.,]+\s*/, '');
  return unit(a) === unit(b) ? a.replace(/\s*[A-Za-z]+$/, '') + ' of ' + b : a + ' of ' + b;
}

/**
 * What the strip says (the Library's Downloads row says line1 too), or null with nothing on its way or to try again.
 * @param {any} off @param {boolean} online
 * @returns {{ reason: string | null, line1: string, line2: string, cls: string, count: number, later: number,
 *   leftBytes: string, done: number, total: number, pct: number | null } | null}
 */
export function stripModel(off, online) {
  const pending = typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const paused = _ask(off, 'paused') === true;
  const left = _ask(off, 'left');
  const batch = _ask(off, 'batch');
  const count = left && left.count >= 0 ? left.count : pending.busy;
  const later = pending && Array.isArray(pending.failed) ? pending.failed.length : 0;
  if (!count && !(later && typeof off.later === 'function')) return null;
  let reason = _ask(off, 'reason');
  if (reason === undefined) reason = typeof off.waiting === 'function' && off.waiting() ? 'wifi' : null;
  if (!count) reason = 'later';
  // No connection only where nothing else explains the wait: space and a retry keep their own words (defect 25).
  if (!online && !paused && reason == null) reason = 'offline';
  if (paused && count) reason = 'paused';
  const leftBytes = left && left.bytes > 0 ? formatBytes(left.bytes) : '';
  const total = batch && batch.total > 0 ? batch.total : 0;
  const done = total ? Math.min(batch.done, total) : 0;
  const o = _ask(off, 'overall');
  const bytes = o ? _ofBytes(o.doneBytes, o.totalBytes) : '';
  const counts = total ? done.toLocaleString('en-US') + ' of ' + countOf(total, 'recording') : '';
  const soon = o && o.secondsLeft ? 'about ' + formatLength(o.secondsLeft) + ' left' : '';
  const laterWords = later ? countOf(later, 'recording') + ' didn’t download yet' : '';
  const need = _ask(off, 'need');
  let line1 = '';
  let line2 = '';
  let cls = '';
  if (reason === 'later') {
    line1 = 'Didn’t download yet · ' + countOf(later, 'recording');
    line2 = 'It tries again by itself, and when the signal comes back';
    cls = 'is-waiting';
  } else if (reason === 'paused') {
    line1 = 'Paused' + (counts ? ' · ' + counts : ' · ' + countOf(count, 'recording') + ' left');
    line2 = [bytes || (leftBytes ? leftBytes + ' left' : ''), laterWords].filter(Boolean).join(' · ');
    cls = 'is-paused';
  } else if (reason === 'wifi') {
    line1 = 'Waiting for Wi-Fi · ' + count + ' left';
    line2 = (leftBytes ? leftBytes + ' · ' : '') + 'starts on Wi-Fi';
    cls = 'is-waiting';
  } else if (reason === 'space') {
    line1 = 'Waiting for storage space · ' + count + ' left';
    // The real shortfall (defect 24: it said the bytes left, not the room missing).
    line2 = need > 0 ? 'Needs ' + formatBytes(need) + ' more room' : 'Remove some downloads to go on';
    cls = 'is-waiting';
  } else if (reason === 'offline') {
    line1 = 'No connection · ' + count + ' left';
    line2 = 'Starts again when you’re online';
    cls = 'is-waiting';
  } else if (reason === 'retrying') {
    line1 = 'Trying again · ' + count + ' left';
    line2 = 'The server didn’t answer; it tries again by itself';
    cls = 'is-waiting';
  } else {
    line1 = 'Downloading ' + (counts ? '· ' + counts : '· ' + countOf(count, 'recording') + ' to go');
    line2 = [bytes || (leftBytes ? leftBytes + ' left' : ''), soon, laterWords].filter(Boolean).join(' · ');
  }
  let pct = null;
  if (o && o.totalBytes > 0) pct = Math.round((o.doneBytes / o.totalBytes) * 100);
  else if (total) pct = Math.round((done / total) * 100);
  return { reason, line1, line2, cls, count, later, leftBytes, done, total, pct };
}

/**
 * W3b listen (listen.html au-dlrun): a card with the state as its eyebrow ("Downloading"), the set's name when one set is
 * on its way, the counts and bytes, its bar, and Pause | Cancel; Cancel asks first.
 * @param {{ off: any, name?: string, onMakeRoom?: () => void }} props onMakeRoom = show what is on the phone (the On
 *   this phone tab); name = the one set on its way ("Volume Two"), else ''
 */
export function DownloadStrip({ off, name = '', onMakeRoom }) {
  const online = useOnline();
  const [asking, setAsking] = React.useState(false);
  const m = stripModel(off, online);
  if (!m) return null;
  const { reason, line1, line2, cls, pct, count, later } = m;
  const canPause = typeof off.pause === 'function';
  const stop = () => { off.cancelAll(); setAsking(false); };
  const n = count + later;
  const cut = line1.indexOf(' · ');
  const head = cut > 0 ? line1.slice(0, cut) : line1;
  const rest = cut > 0 ? line1.slice(cut + 3) : '';
  const title = name || rest || head;
  const sub = [name ? rest : '', line2].filter(Boolean).join(' · ');
  return (
    <div className={'ui-card dl-strip ' + cls} role="status" aria-live="polite">
      <p className="dl-strip-head">{head}</p>
      <p className="dl-strip-line1">{title}</p>
      {sub ? <p className="dl-strip-line2">{sub}</p> : null}
      {pct != null && (reason == null || reason === 'paused') ? (
        <span className="ui-progress dl-strip-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={'Downloads ' + pct + '% done'}>
          <span style={{ width: Math.max(2, pct) + '%' }} />
        </span>
      ) : null}
      <div className="dl-strip-actions">
        {reason === 'space' && onMakeRoom ? <UiButton small onClick={onMakeRoom}>Make room</UiButton> : null}
        {reason === 'later' && typeof off.retryAll === 'function' ? <UiButton small onClick={() => off.retryAll()}>Retry now</UiButton> : null}
        {canPause && reason === 'paused' ? <UiButton small icon="play" onClick={() => off.resume()}>Resume</UiButton> : null}
        {canPause && count && reason !== 'paused' && reason !== 'space' ? <UiButton small icon="pause" onClick={() => off.pause()}>Pause</UiButton> : null}
        <button type="button" className="ui-btn is-small" onClick={() => setAsking(true)} aria-expanded={asking}>{canPause ? 'Cancel' : 'Cancel all'}</button>
      </div>
      {asking ? (
        <div className="offline-confirm dl-cancel-ask" role="group" aria-label="Cancel downloads">
          <p className="offline-confirm-title">{'Cancel ' + (n === 1 ? 'this download' : 'all ' + n.toLocaleString('en-US') + ' downloads') + '?'}</p>
          <p className="offline-confirm-line">What is already on this phone stays.</p>
          <div className="offline-confirm-actions">
            <button type="button" className="offline-confirm-cancel" onClick={() => setAsking(false)}>Keep downloading</button>
            <button type="button" className="offline-confirm-go" onClick={stop}>Cancel downloads</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
