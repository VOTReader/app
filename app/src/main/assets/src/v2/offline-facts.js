/* offline-facts.js - what v2 says about recordings kept on this device and about having no connection (zv1, group 9;
   pictures 4c-downloads, 9c-offline). Read only, from main's own stores:
     OfflineAudio  statusOf(url) 'saved' | 'downloading' | 'queued' | 'failed' | 'none', progressOf, sizeOf, failureOf,
                   waiting() (download only on Wi-Fi), as main's OfflineRowStatus reads them (unitState, waitsForWifi)
     NetStatus     isOffline(): no signal, or a request that just failed (bundle-d; navigator.onLine where it is absent)
     AudioPlayer   playableNow(volKey, id): would a Listen make sound now (main's HeroListen rule)
   Every function takes the global object, so tests hand it fakes; a gate boot uses states.json's facts instead. */

const g = /** @type {any} */ (globalThis);

/**
 * Where one row's recordings stand on this device.
 * @typedef {{ kind: 'saved' } | { kind: 'downloading', percent: number } | { kind: 'queued' } | { kind: 'waiting' }
 *   | { kind: 'failed', why: string }} RowDownload
 * @typedef {{ done: number, total: number, percent: number, waiting: boolean }} DownloadQueue
 */

/** The toast 9c shows when Listen cannot make sound (main's hero line, word for word). */
export const OFFLINE_LISTEN = 'You’re offline. This recording isn’t on this phone.';
/** The toast 4c shows while the page's downloads wait for a connection. */
export const OFFLINE_DOWNLOADS = 'No connection. Downloads go on when you’re back online.';

/** The recordings a row's own Play plays (main's AudioPlayer.playbackTracks), as download items. */
export function rowItems(col, e, gl = g) {
  const player = gl.AudioPlayer;
  if (!col || !player || typeof player.playbackTracks !== 'function') return [];
  let tracks = [];
  try { tracks = player.playbackTracks(col.volKey, e.item, col.label) || []; } catch (_e) { tracks = []; }
  return tracks.filter((t) => t && typeof t.url === 'string')
    .map((t) => ({ url: t.url, key: t.key || '', title: e.title + (t.partLabel ? ' · ' + t.partLabel : '') }));
}

/**
 * One row's state from main's store (null: nothing asked of it). A reading in parts is on the phone when every part
 * is; its percent counts bytes where the sizes are known, else parts.
 * @param {any} off OfflineAudio @param {string[]} urls @returns {RowDownload | null}
 */
export function rowDownload(off, urls) {
  if (!off || typeof off.statusOf !== 'function' || !urls.length) return null;
  let saved = 0;
  let queued = 0;
  /** @type {string | null} */
  let active = null;
  /** @type {string | null} */
  let failed = null;
  let total = 0;
  let done = 0;
  let known = true;
  for (const u of urls) {
    const s = off.statusOf(u);
    const size = typeof off.sizeOf === 'function' ? off.sizeOf(u) : 0;
    if (size) total += size; else known = false;
    if (s === 'saved') { saved++; done += size || 0; }
    else if (s === 'downloading') active = u;
    else if (s === 'queued') queued++;
    else if (s === 'failed' && !failed) failed = (typeof off.failureOf === 'function' && off.failureOf(u)) || 'network';
  }
  if (saved === urls.length) return { kind: 'saved' };
  if (active) {
    const p = typeof off.progressOf === 'function' ? off.progressOf(active) : null;
    let percent;
    if (known && total > 0) percent = ((done + (p ? p.bytes : 0)) / total) * 100;
    else percent = ((saved + (p && p.total > 0 ? p.bytes / p.total : 0)) / urls.length) * 100;
    return { kind: 'downloading', percent: Math.max(0, Math.min(99, Math.floor(percent))) };
  }
  if (queued) return typeof off.waiting === 'function' && off.waiting() ? { kind: 'waiting' } : { kind: 'queued' };
  if (failed) return { kind: 'failed', why: failed };
  return null;
}

/**
 * The page's queue bar: shown while any row is on its way; done = rows on the phone, of every row with a recording.
 * @param {Array<RowDownload | null>} rows one per row that has a recording @returns {DownloadQueue | null}
 */
export function downloadQueue(rows) {
  const busy = rows.filter((r) => r && (r.kind === 'downloading' || r.kind === 'queued' || r.kind === 'waiting'));
  if (!busy.length) return null;
  const done = rows.filter((r) => r && r.kind === 'saved').length;
  const total = rows.length;
  return { done, total, percent: total ? Math.floor((done / total) * 100) : 0, waiting: !busy.some((r) => r && r.kind !== 'waiting') };
}

/** "Downloading 12 of 29", "Waiting for Wi-Fi · 12 of 29" @param {DownloadQueue} q */
export function queueWords(q) {
  return (q.waiting ? 'Waiting for Wi-Fi · ' : 'Downloading ') + q.done + ' of ' + q.total;
}

/**
 * The download part of a row's line: { text, alone, bad }. `alone` replaces the date (a row on its way or failed says
 * only that); a queued row adds nothing.
 * @param {RowDownload | null} d @returns {{ kind: string, text: string, alone: boolean, bad: boolean } | null}
 */
export function downloadWords(d) {
  if (!d) return null;
  if (d.kind === 'saved') return { kind: d.kind, text: 'On this phone', alone: false, bad: false };
  if (d.kind === 'waiting') return { kind: d.kind, text: 'Waiting for Wi-Fi', alone: false, bad: false };
  if (d.kind === 'downloading') return { kind: d.kind, text: 'Downloading · ' + d.percent + '%', alone: true, bad: false };
  if (d.kind === 'failed') {
    return { kind: d.kind, text: d.why === 'space' ? 'Not enough room on this phone' : 'Couldn’t download', alone: true, bad: true };
  }
  return null;
}

/** Online, as main's NetStatus says (navigator.onLine where it is absent). */
export function isOnline(gl = g) {
  const net = gl.NetStatus;
  if (net && typeof net.isOffline === 'function') return !net.isOffline();
  return !gl.navigator || gl.navigator.onLine !== false;
}

const NO_SUB = () => () => {};
const ZERO = () => 0;

/** isOnline(), re-read when NetStatus changes; a gate boot's answer is its picture's (states.json "network"). */
export function useOnline(gate, gl = g) {
  const net = gate ? null : gl.NetStatus;
  React.useSyncExternalStore(net && net.subscribe ? net.subscribe : NO_SUB, net && net.getVersion ? net.getVersion : ZERO);
  if (gate) return !(gate.facts && gate.facts.offline);
  return isOnline(gl);
}

/**
 * What a letter's Listen says instead of playing (9c): the toast's words when there is no connection and no recording
 * of it on this device (main's playableNow), else null (play it).
 * @param {string} volKey @param {string} id the letter's id
 */
export function offlineListenWords(volKey, id, gl = g) {
  const p = gl.AudioPlayer;
  if (!p || typeof p.playableNow !== 'function') return null;
  try { return p.playableNow(volKey, id) ? null : OFFLINE_LISTEN; } catch (_e) { return null; }
}

/**
 * The same for one Bible chapter (2c): main's playableNow asks after that chapter's own recording.
 * @param {string} volKey the edition @param {string} bookId @param {number} chapter
 */
export function offlineChapterWords(volKey, bookId, chapter, gl = g) {
  const p = gl.AudioPlayer;
  if (!p || typeof p.playableNow !== 'function') return null;
  try { return p.playableNow(volKey, bookId, chapter) ? null : OFFLINE_LISTEN; } catch (_e) { return null; }
}

/** The 4c picture's facts (states.json): Letter 4 on this phone, 5 at 64 %, 6 failed, 7 waiting for Wi-Fi; 12 of 29
 *  done; no connection. */
export function gateDownloads() {
  return {
    rows: {
      'one/4': { kind: 'saved' }, 'one/5': { kind: 'downloading', percent: 64 },
      'one/6': { kind: 'failed', why: 'network' }, 'one/7': { kind: 'waiting' },
    },
    queue: { done: 12, total: 29, percent: 41, waiting: false },
  };
}
