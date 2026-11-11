/* ═══════════════════════════════════════════════════════════════════════
   DownloadQueue — the Downloads screen's "In line" list (downloads brief 2026-10-23, 3f; picture 08; dl-rework D, E)
   ═══════════════════════════════════════════════════════════════════════
   Under the strip: the ones downloading (up to the store's 3 at once) with their rings and "4.1 of 7 MB"; then each
   waiting one with its place and a × to take it off the queue, a page at a time (a whole edition is 1,189: never
   cut at 30); then "Didn't download yet": each one the store keeps to try again, why in plain words and when it tries
   next, with Retry and Retry all. A hand-over that stopped midway says what was not queued, with Try again.

   `only="failed"` shows just "Didn't download yet" (the Choose tab: dl-rework E, visible on both tabs).
   Titles are what each was asked as (the stores keep them across a restart); one with none is named from its file.
   ═══════════════════════════════════════════════════════════════════════ */

import { ofBytes, OnPhoneRing, AlertIcon } from './OfflineAudioControls.jsx';
import { countOf } from '../../utils/download-tree.js';

/** Waiting rows shown at a time; "Show 50 more" adds a page. */
export const QUEUE_PAGE = 50;

/** Why a download did not finish yet, in the listener's words (the stores' failure reasons). */
const FAILED_WORDS = /** @type {Record<string, string>} */ ({
  network: 'No connection when it tried',
  stalled: 'The connection stalled',
  server: 'The server didn’t answer',
  space: 'Not enough room on this phone',
  short: 'The download was cut short',
  size: 'Too big to keep on this phone',
  nosize: 'The server gave no size',
  disk: 'Couldn’t save it on this phone',
});

/**
 * "The server answered 404 (not found)", "No connection when it tried". @param {string | null} reason @param {number} status
 * @returns {string}
 */
export function failedWords(reason, status) {
  if (reason === 'server' && status) {
    if (status === 404) return 'The server answered 404 (not found)';
    if (status >= 500) return 'The server had a problem (' + status + ')';
    return 'The server answered ' + status;
  }
  return FAILED_WORDS[reason || 'network'] || FAILED_WORDS.network;
}

/** "in 12 min", "in under a minute", "soon". @param {number} at @param {number} now */
export function nextTryWords(at, now) {
  if (!(at > now)) return 'soon';
  const min = Math.round((at - now) / 60000);
  return min < 1 ? 'in under a minute' : min < 60 ? 'in ' + min + ' min' : 'in ' + Math.round(min / 60) + ' h';
}

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
function CloseGlyph() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11" /><path d="M17.5 6.5l-11 11" /></svg>;
}

/** @param {{ off: any, only?: 'all' | 'failed' }} props */
export function DownloadQueue({ off, only = 'all' }) {
  const [shown, setShown] = React.useState(QUEUE_PAGE);
  const queue = only === 'all' && typeof off.queue === 'function' ? off.queue() : [];
  const pending = typeof off.pending === 'function' ? off.pending() : { busy: 0, failed: [] };
  const failed = Array.isArray(pending.failed) ? pending.failed : [];
  const later = typeof off.later === 'function' ? off.later() : [];
  const laterOf = new Map(later.map((/** @type {any} */ t) => [t.url, t]));
  const unsent = typeof off.unsent === 'function' ? off.unsent() : [];
  if (!queue.length && !failed.length && !unsent.length) return null;
  const actives = new Set(typeof off.actives === 'function' ? off.actives() : queue.filter((t) => off.statusOf(t.url) === 'downloading').map((t) => t.url));
  const heads = queue.filter((t) => actives.has(t.url));
  const waiting = queue.filter((t) => !actives.has(t.url));
  const page = waiting.slice(0, shown);
  const nameOf = (/** @type {{ url: string, title: string }} */ t) => t.title || titleFromUrl(t.url);
  const now = Date.now();
  const retry = (/** @type {any[]} */ list) => off.download(list.map((t) => ({ url: t.url, key: t.key || '', title: t.title || '' })), { priority: list.length === 1 ? 'tap' : 'bulk' });
  return (
    <section className={'dl-queue' + (only === 'failed' ? ' is-failed-only' : '')} aria-labelledby={'dl-queue-title-' + only}>
      {unsent.length ? (
        <div className="dl-unsent" role="alert">
          <p>{countOf(unsent.length, 'recording') + ' were not added to the downloads.'}</p>
          <button type="button" className="dl-link" onClick={() => off.download(unsent)}>Try again</button>
          <button type="button" className="dl-link" onClick={() => off.clearUnsent()}>Dismiss</button>
        </div>
      ) : null}
      {queue.length ? (
        <>
          <div className="dl-queue-head">
            <div>
              <p className="dl-shelf-kicker">In line</p>
              <h2 id={'dl-queue-title-' + only}>Downloading</h2>
            </div>
            <span className="dl-queue-count">{queue.length.toLocaleString('en-US')}</span>
          </div>
          <ul className="dl-queue-rows">
            {heads.map((head) => {
              const p = off.progressOf(head.url);
              const size = p && p.total > 0 ? p.total : off.sizeOf(head.url);
              const done = p ? p.bytes : 0;
              return (
                <li key={head.url} className="dl-queue-row is-active">
                  <span className="dl-queue-mark"><OnPhoneRing share={size ? Math.min(1, done / size) * 0.999 : 0} /></span>
                  <span className="dl-queue-copy">
                    <strong>{nameOf(head)}</strong>
                    <small>{size ? ofBytes(done, size) : 'Starting'}</small>
                  </span>
                  <button type="button" className="dl-icon-btn" onClick={() => off.cancel([head.url])} aria-label={'Cancel ' + nameOf(head)}><CloseGlyph /></button>
                </li>
              );
            })}
            {page.map((t, i) => (
              <li key={t.url} className="dl-queue-row">
                <span className="dl-queue-mark"><ClockIcon /></span>
                <span className="dl-queue-copy">
                  <strong>{nameOf(t)}</strong>
                  <small>{'Waiting · ' + ordinal(i + 1) + ' in line'}</small>
                </span>
                <button type="button" className="dl-icon-btn" onClick={() => off.cancel([t.url])} aria-label={'Take ' + nameOf(t) + ' off the queue'}><CloseGlyph /></button>
              </li>
            ))}
            {waiting.length > page.length ? (
              <li className="dl-queue-row is-more">
                <button type="button" className="dl-link" onClick={() => setShown(shown + QUEUE_PAGE)}>
                  {'Show ' + Math.min(QUEUE_PAGE, waiting.length - page.length) + ' more · ' + (waiting.length - page.length).toLocaleString('en-US') + ' still waiting'}
                </button>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
      {failed.length ? (
        <>
          <div className="dl-queue-head is-failed">
            <div>
              <p className="dl-shelf-kicker">Will try again</p>
              <h2 id={queue.length ? undefined : 'dl-queue-title-' + only}>Didn’t download yet</h2>
            </div>
            <span className="dl-queue-count">{failed.length.toLocaleString('en-US')}</span>
          </div>
          <ul className="dl-queue-rows">
            {failed.slice(0, shown).map((t) => {
              const l = laterOf.get(t.url);
              const reason = (l && l.reason) || (typeof off.failureOf === 'function' && off.failureOf(t.url)) || 'network';
              const why = failedWords(reason, l ? l.status : 0);
              return (
                <li key={t.url} className="dl-queue-row is-failed">
                  <span className="dl-queue-mark"><AlertIcon /></span>
                  <span className="dl-queue-copy">
                    <strong>{nameOf(t)}</strong>
                    <small>{why + (l ? ' · tries again ' + nextTryWords(l.at, now) : '')}</small>
                  </span>
                  <button type="button" className="dl-link" onClick={() => retry([t])} aria-label={'Retry ' + nameOf(t)}>Retry</button>
                </li>
              );
            })}
            {failed.length > shown ? (
              <li className="dl-queue-row is-more">
                <button type="button" className="dl-link" onClick={() => setShown(shown + QUEUE_PAGE)}>{'Show ' + Math.min(QUEUE_PAGE, failed.length - shown) + ' more'}</button>
              </li>
            ) : null}
          </ul>
          <button type="button" className="dl-link dl-queue-retry-all"
            onClick={() => (typeof off.retryAll === 'function' ? off.retryAll() : retry(failed))}>
            {failed.length > 1 ? 'Retry all ' + failed.length.toLocaleString('en-US') + ' now' : 'Retry now'}
          </button>
        </>
      ) : null}
    </section>
  );
}
