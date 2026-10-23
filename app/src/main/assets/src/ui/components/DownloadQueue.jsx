/* ═══════════════════════════════════════════════════════════════════════
   DownloadQueue — the On this phone tab's "In line" list (downloads brief 2026-10-23, 3f; picture 08)
   ═══════════════════════════════════════════════════════════════════════
   Under the strip: the one downloading with its ring and "4.1 of 7 MB", then "Waiting · 1st in line" for each after
   it, then the ones that did not download with why and Retry. Long queues (a whole edition is 1,189) show the first
   QUEUE_SHOWN and "and N more". Titles are what each was asked as (store.queue(); the web store keeps them across a
   reload); one with none left after a restart is named from its file.
   ═══════════════════════════════════════════════════════════════════════ */

import { ofBytes, OnPhoneRing, AlertIcon } from './OfflineAudioControls.jsx';

const QUEUE_SHOWN = 30;

/** Why a download stopped for good, in the listener's words (BRIDGE.md failure reasons). */
const FAILED_WORDS = /** @type {Record<string, string>} */ ({
  network: 'Server didn’t answer',
  space: 'Not enough room on this phone',
  short: 'The download was cut short',
  size: 'The server gave no size',
  disk: 'Couldn’t save it on this phone',
});

/** "1st", "2nd", "3rd", "11th", "22nd". @param {number} n */
export function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

/** A title for a recording queued before a restart, from its file: "05-Duty.mp3" -> "05 Duty". @param {string} url */
export function titleFromUrl(url) {
  let name = String(url || '').split('/').pop() || '';
  try { name = decodeURIComponent(name); } catch (_e) { /* as it is */ }
  return name.replace(/\.mp3$/i, '').replace(/[-_.]+/g, ' ').trim() || 'Recording';
}

function ClockIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>;
}

/** @param {{ off: any }} props */
export function DownloadQueue({ off }) {
  const queue = typeof off.queue === 'function' ? off.queue() : [];
  const pending = typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const failed = pending.failed;
  if (!queue.length && !failed.length) return null;
  const head = queue.length && off.statusOf(queue[0].url) === 'downloading' ? queue[0] : null;
  const waiting = head ? queue.slice(1) : queue;
  const shown = waiting.slice(0, QUEUE_SHOWN);
  const p = head ? off.progressOf(head.url) : null;
  const size = head ? (p && p.total > 0 ? p.total : off.sizeOf(head.url)) : null;
  const done = p ? p.bytes : 0;
  const nameOf = (/** @type {{ url: string, title: string }} */ t) => t.title || titleFromUrl(t.url);
  return (
    <section className="dl-queue" aria-labelledby="dl-queue-title">
      <div className="dl-queue-head">
        <div>
          <p className="dl-shelf-kicker">In line</p>
          <h2 id="dl-queue-title">{queue.length ? 'Downloading' : 'Did not download'}</h2>
        </div>
        <span className="dl-queue-count">{queue.length || failed.length}</span>
      </div>
      <ul className="dl-queue-rows">
        {head ? (
          <li className="dl-queue-row is-active">
            <span className="dl-queue-mark"><OnPhoneRing share={size ? Math.min(1, done / size) * 0.999 : 0} /></span>
            <span className="dl-queue-copy">
              <strong>{nameOf(head)}</strong>
              <small>{size ? ofBytes(done, size) : 'Starting'}</small>
            </span>
          </li>
        ) : null}
        {shown.map((t, i) => (
          <li key={t.url} className="dl-queue-row">
            <span className="dl-queue-mark"><ClockIcon /></span>
            <span className="dl-queue-copy">
              <strong>{nameOf(t)}</strong>
              <small>{'Waiting · ' + ordinal(i + 1) + ' in line'}</small>
            </span>
          </li>
        ))}
        {waiting.length > shown.length ? (
          <li className="dl-queue-row is-more"><span className="dl-queue-copy"><small>{'and ' + (waiting.length - shown.length) + ' more'}</small></span></li>
        ) : null}
        {failed.map((t) => (
          <li key={t.url} className="dl-queue-row is-failed">
            <span className="dl-queue-mark"><AlertIcon /></span>
            <span className="dl-queue-copy">
              <strong>{nameOf(t)}</strong>
              <small>{FAILED_WORDS[(typeof off.failureOf === 'function' && off.failureOf(t.url)) || 'network'] || FAILED_WORDS.network}</small>
            </span>
            <button type="button" className="dl-link" onClick={() => off.download([t])} aria-label={'Retry ' + nameOf(t)}>Retry</button>
          </li>
        ))}
      </ul>
      {failed.length > 1 ? (
        <button type="button" className="dl-link dl-queue-retry-all" onClick={() => off.download(failed)}>{'Retry all ' + failed.length}</button>
      ) : null}
    </section>
  );
}
