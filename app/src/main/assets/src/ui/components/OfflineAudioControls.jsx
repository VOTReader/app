/* ═══════════════════════════════════════════════════════════════════════
   OfflineAudioControls — Cluster H (bundle-d since lz1): downloads to the phone
   ═══════════════════════════════════════════════════════════════════════
   Listening item 8 (Corbin 2026-09-22 "yes after reset"), built to Codex's
   mockup round 1, option 1 (lanes/readalong/out/mockups/offline/r1-1.png):
   a plain line under each recording row says what the phone holds and
   offers the next step, and "Download all" beside Play all asks first with
   the size and the phone's free space. Words: "Download" and "On this
   phone" - never "Save", which already means the listener's favourites.

   In the Android app and, since cf1 (2026-09-26), in a browser that keeps
   recordings (the PWA; an iPhone only from its Home Screen): OfflineAudio
   (utils/offline-audio.js) and AudioPlayer live in bundle-d and are read here
   as FREE GLOBALS: one store and one player for the whole app (see
   _entry-d.js). Where no store exists, nothing here renders.
   ═══════════════════════════════════════════════════════════════════════ */

import { hideToast, showToast } from '../../utils/toast.js';

const _noSubscribe = () => () => {};
const _noShape = () => '';

/**
 * One of these recordings is the one playing (or starting): offline it plays on from what it buffered (RC.5).
 * @param {string[]} urls @returns {boolean}
 */
function usePlayingOneOf(urls) {
  const has = typeof AudioPlayer !== 'undefined' && typeof AudioPlayer.getShape === 'function';
  React.useSyncExternalStore(has ? AudioPlayer.subscribe : _noSubscribe, has ? AudioPlayer.getShape : _noShape);
  if (!has) return false;
  const s = AudioPlayer.getState();
  const cur = s && Array.isArray(s.queue) ? s.queue[s.qi] : null;
  return !!cur && urls.includes(cur.url) && (s.status === 'playing' || s.status === 'loading');
}

/** The phone keeps this much free beyond a download (OfflineAudioStore's SPACE_MARGIN). */
export const SPACE_MARGIN = 200 * 1024 * 1024;

/** @returns {any} the bundle-d store, or null on a host without it */
function _store() {
  return typeof OfflineAudio !== 'undefined' ? OfflineAudio : null;
}

/**
 * Re-render on every download change. The store when downloads are possible here (the Android app, or a browser
 * that keeps recordings: cf1), else null.
 * @returns {any}
 */
export function useOfflineAudio() {
  const s = _store();
  React.useSyncExternalStore(
    React.useCallback((cb) => (s ? s.subscribe(cb) : () => {}), [s]),
    () => (s ? s.getVersion() : 0),
  );
  // A Remove waiting out its Undo, or a download held for a signal, changes what every count says.
  React.useSyncExternalStore(_subPage, _pageVersion);
  const off = s && s.available() ? s : null;
  React.useEffect(() => { _announce(off); });
  return off;
}

/** The app's one polite live region for downloads (n2-06), made at the first control's mount so it is there before
 *  the first news. The seq last read out: news from before it is not read. */
let _liveEl = /** @type {HTMLElement | null} */ (null);
let _heardSeq = -1;

/** Read the store's latest news out once (a batch started, the queue finished, a download failed). @param {any} off */
function _announce(off) {
  if (!off || typeof off.news !== 'function' || typeof document === 'undefined') return;
  const n = off.news();
  if (!n) return;
  if (!_liveEl || !_liveEl.isConnected) {
    _liveEl = document.createElement('p');
    _liveEl.className = 'sr-only';
    _liveEl.setAttribute('role', 'status');
    _liveEl.setAttribute('aria-live', 'polite');
    _liveEl.id = 'offline-audio-status';
    document.body.appendChild(_liveEl);
    if (_heardSeq < 0) _heardSeq = n.seq;
  }
  if (n.seq === _heardSeq) return;
  _heardSeq = n.seq;
  _liveEl.textContent = n.text;
}

/**
 * Keep keyboard and screen-reader focus on a control that swaps its element as its state moves on (Download ->
 * Cancel -> On this phone): when the focused element went with the old state, focus lands on the new one's button
 * (or the new line itself) instead of the page's top (n2-06). Never takes focus from anywhere else.
 * @param {string} state what decides which element renders
 */
function useKeepFocus(state) {
  const ref = React.useRef(/** @type {any} */ (null));
  const owned = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!owned.current || typeof document === 'undefined') return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) { owned.current = !!(ref.current && ref.current.contains(a)); return; }
    const root = ref.current;
    if (!root) return;
    const target = root.tagName === 'BUTTON' ? root : root.querySelector('button:not([disabled])') || root;
    if (target === root && root.tagName !== 'BUTTON' && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    try { target.focus({ preventScroll: true }); } catch (_e) { /* an old engine */ }
  }, [state]);
  return {
    ref,
    onFocus: () => { owned.current = true; },
    // A blur with nowhere to go is either the focused element leaving with its state (still ours to put back) or
    // the reader tapping page text that cannot take focus (theirs again: sweep v105). Tell them apart after the
    // commit: the layout effect above runs inside it, so an element that left is put back first, and one still in
    // the page lets go unless focus is still on this control (the window only lost focus: switching apps).
    onBlur: (/** @type {any} */ e) => {
      if (e.relatedTarget) { owned.current = false; return; }
      const el = e.target;
      queueMicrotask(() => {
        if (!el || !el.isConnected) return;
        const a = document.activeElement;
        if (!(a && ref.current && ref.current.contains(a))) owned.current = false;
      });
    },
  };
}

const _noSub = () => () => {};
const _zero = () => 0;

/**
 * false while the phone has no signal, or a request just failed at the network: bundle-d's NetStatus global (one
 * store for the app, 2026-10-05). A host without it (a test) reads navigator.onLine.
 * @returns {boolean}
 */
export function useOnline() {
  const net = typeof NetStatus !== 'undefined' ? NetStatus : null;
  React.useSyncExternalStore(net ? net.subscribe : _noSub, net ? net.getVersion : _zero);
  return net ? !net.isOffline() : typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * One calm line at the top of a listening screen while network-only features are off (Corbin 2026-10-05: "Disable
 * certain features when offline"). Renders nothing online.
 * @param {{ text: string }} props
 */
export function OfflineNote({ text }) {
  if (useOnline()) return null;
  return <p className="offline-note" role="status">{text}</p>;
}

/**
 * "18 MB", "6.4 MB", "1.5 GB" (decimal units, as a phone's storage screen shows them); '' for nothing.
 * @param {number} n bytes
 * @returns {string}
 */
export function formatBytes(n) {
  if (!(n > 0)) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + ' GB';
  const mb = n / 1e6;
  return (mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : String(Math.round(mb))) + ' MB';
}

/**
 * Where a unit of recordings (one row's reading, or a whole collection) stands on the phone.
 * @param {any} off the store
 * @param {string[]} urls
 */
export function unitState(off, urls) {
  let saved = 0;
  let busy = 0;
  let moving = 0;
  /** @type {string | null} */
  let failed = null;
  let total = 0;
  let known = true;
  let savedBytes = 0;
  let doneBytes = 0;
  for (const u of urls) {
    const status = _leaving.has(u) ? 'none' : off.statusOf(u);
    const size = off.sizeOf(u);
    if (size) total += size; else known = false;
    if (status === 'saved') { saved++; savedBytes += size || 0; doneBytes += size || 0; }
    else if (status === 'downloading') { busy++; moving++; const p = off.progressOf(u); if (p) doneBytes += p.bytes; }
    else if (status === 'queued' || _held.some((it) => it.url === u)) busy++;
    else if (status === 'failed' && !failed) failed = off.failureOf(u) || 'network';
  }
  const n = urls.length;
  const status = n > 0 && saved === n ? 'saved' : busy ? 'downloading' : failed ? 'failed' : 'none';
  const percent = known && total > 0 ? Math.floor((doneBytes / total) * 100) : n ? Math.floor((saved / n) * 100) : 0;
  return {
    status, saved, count: n, failed, percent: Math.max(0, Math.min(99, percent)),
    // Queued behind other downloads, nothing of it on the phone or on its way yet: it says Waiting, not 0%.
    started: moving > 0 || saved > 0,
    bytes: known ? total : null,
    remaining: known ? total - savedBytes : null,
  };
}

/**
 * Where a set of recordings stands on the phone, counted one way for every badge, the picker and the player's
 * offline ticks (downloads brief 2026-10-23, 3h: player L4 paints with this, it does not count on its own):
 * unitState over the set plus its baked seconds (AUDIO_LENGTHS through the AudioLengths global; null while any
 * recording of the set has none). `target` is URLs or tracks. Null where downloads are not possible here.
 * @param {Array<string | { url?: string }>} target
 */
export function useOfflineState(target) {
  const off = useOfflineAudio();
  const lengths = typeof AudioLengths !== 'undefined' ? AudioLengths : null;
  React.useSyncExternalStore(lengths ? lengths.lengthsStore.subscribe : _noSub, lengths ? lengths.lengthsStore.getVersion : _zero);
  if (!off) return null;
  const urls = (Array.isArray(target) ? target : []).map((t) => (typeof t === 'string' ? t : t && t.url)).filter((u) => typeof u === 'string');
  let seconds = 0;
  let timed = urls.length > 0;
  for (const u of urls) {
    const sec = lengths ? lengths.secondsOf(u) : null;
    if (sec == null) timed = false; else seconds += sec;
  }
  return { ...unitState(off, urls), seconds: timed ? seconds : null };
}

/* What the page holds on top of the store: recordings whose Remove waits out its Undo (they count as gone at once),
   and downloads asked for with no signal on a store that cannot wait for one itself. */
const _leaving = new Set();
/** @type {Array<{ url: string, key: string, title: string }>} */
let _held = [];
let _pageVer = 0;
const _pageSubs = new Set();
/** @param {() => void} cb */
function _subPage(cb) { _pageSubs.add(cb); return () => { _pageSubs.delete(cb); }; }
function _pageVersion() { return _pageVer; }
function _bumpPage() { _pageVer++; for (const cb of [..._pageSubs]) cb(); }

/** A Remove is waiting out its Undo: the recording already reads as gone. @param {string} url */
export function isLeaving(url) { return _leaving.has(url); }

const REMOVE_UNDO_MS = 5000;
export const REMOVED_TOAST_ID = 'vot-toast-offline-removed';

/**
 * Remove with a 5 s Undo (brief section 7 item 14): every count drops it at once and the file goes when the toast
 * does, so Undo keeps the very file rather than downloading it again.
 * @param {any} off @param {string[]} urls @param {string} text the toast, "Removed Ruth · Chapter 2 · 3.3 MB"
 */
export function removeWithUndo(off, urls, text) {
  let undone = false;
  for (const u of urls) _leaving.add(u);
  _bumpPage();
  const back = () => { for (const u of urls) _leaving.delete(u); _bumpPage(); };
  // Toasts share one spot; this one carries an action, so the others step aside.
  document.querySelectorAll('.vot-toast.show').forEach((el) => { if (el.id && el.id !== REMOVED_TOAST_ID) hideToast(el.id); });
  showToast({
    id: REMOVED_TOAST_ID, className: 'vot-toast vot-toast-undo', durationMs: REMOVE_UNDO_MS, text,
    onHide: () => { if (!undone) off.remove(urls); back(); },
  });
  const el = document.getElementById(REMOVED_TOAST_ID);
  if (!el) return;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'vot-undo-btn';
  undo.textContent = 'Undo';
  undo.addEventListener('click', () => { undone = true; hideToast(REMOVED_TOAST_ID); }, { once: true });
  el.appendChild(undo);
}

/** @type {null | (() => void)} */
let _heldUnsub = null;

/**
 * "Download when online" (brief 3j): queue it now; it starts when the signal returns. A store that waits for a
 * signal itself (dl-d2's `reason`: the phone app holds the head with reason 'offline') takes it at once; any other
 * store gets it from here the moment NetStatus says online (held for this visit to the app only).
 * @param {any} off @param {Array<{ url: string, key: string, title: string }>} items
 */
export function downloadWhenOnline(off, items) {
  const net = typeof NetStatus !== 'undefined' ? NetStatus : null;
  if (typeof off.reason === 'function' || !net || !net.isOffline()) { off.download(items); return; }
  _held = _held.concat(items.filter((it) => !_held.some((h) => h.url === it.url)));
  _bumpPage();
  showToast({ id: 'vot-toast-offline-held', className: 'vot-toast', ariaLive: 'polite', text: 'It will download when you’re back online.' });
  if (_heldUnsub) return;
  _heldUnsub = net.subscribe(() => {
    if (net.isOffline() || !_heldUnsub) return;
    const go = _held;
    _held = [];
    _heldUnsub();
    _heldUnsub = null;
    _bumpPage();
    if (go.length) off.download(go);
  });
}

/** Cancel a download, held ones too. @param {any} off @param {string[]} urls */
function _cancel(off, urls) {
  if (_held.some((h) => urls.includes(h.url))) { _held = _held.filter((h) => !urls.includes(h.url)); _bumpPage(); }
  off.cancel(urls);
}

/** Download only on Wi-Fi (ra6): queued on mobile data, a download waits for Wi-Fi. */
const WAITING_WORDS = 'Waiting for Wi-Fi';

/**
 * The unit's downloads are held for Wi-Fi: the store says it waits, and none of them is on its way.
 * @param {any} off the store @param {string[]} urls @returns {boolean}
 */
function waitsForWifi(off, urls) {
  return typeof off.waiting === 'function' && off.waiting() && !urls.some((u) => off.statusOf(u) === 'downloading');
}

/** @param {any} t a player Track @param {string} name the row's title */
function _item(t, name) {
  const part = t && t.partLabel ? ' · ' + t.partLabel : '';
  return { url: t.url, key: t.key || '', title: (name || t.title || '') + part };
}

export function DownloadIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></svg>;
}
function CheckIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function AlertIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.01" /></svg>;
}
function NoSignalIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>;
}

/** A row's Download asks first past this many recordings or bytes: a Bible book (Genesis is 206 MB) started on one tap
 *  with no size or room check (downloads brief 2026-10-23, section 7 item 6). A letter, even in parts, does not ask. */
const ROW_ASK_TRACKS = 3;
const ROW_ASK_BYTES = 50e6;

/**
 * "Download <label>?" with the count, the size and the phone's free space; Download is off when it would not fit.
 * @param {{ off: any, label: string, todo: any[], count?: number, onCancel: () => void, onGo: () => void }} props
 *   count = recordings as the listener counts them (a letter in two parts is one); the parts when absent
 */
function DownloadConfirm({ off, label, todo, count, onCancel, onGo }) {
  const need = todo.reduce((n, t) => (n === null || !off.sizeOf(t.url) ? null : n + off.sizeOf(t.url)), /** @type {number | null} */ (0));
  const free = off.freeBytes();
  const noRoom = need !== null && free > 0 && need + SPACE_MARGIN > free;
  const n = count == null ? todo.length : count;
  const recordings = n === 1 ? '1 recording' : n + ' recordings';
  // A size still on its way (asked again on its own, item 9) leaves the total open, not hidden: "at least".
  const known = todo.reduce((sum, t) => sum + (off.sizeOf(t.url) || 0), 0);
  const size = need ? formatBytes(need) : known ? 'at least ' + formatBytes(known) : '';
  return (
    <div className="offline-confirm" role="group" aria-label={'Download ' + label}>
      <p className="offline-confirm-title">{'Download ' + label + '?'}</p>
      <p className="offline-confirm-line">{recordings + (size ? ' · ' + size : '')}</p>
      {free > 0 ? <p className="offline-confirm-line">{'Free space on this phone: ' + formatBytes(free)}</p> : null}
      {noRoom ? <p className="offline-confirm-warn">Not enough room: free some space on the phone first.</p> : null}
      {/* Downloads run while the app is open: no background service yet (the refutation of 2026-09-24, SHOULD 9). */}
      <p className="offline-confirm-line">Keep VOTReader open until it finishes.</p>
      <div className="offline-confirm-actions">
        <button type="button" className="offline-confirm-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="offline-confirm-go" disabled={noRoom} onClick={onGo}>
          {'Download' + (need ? ' ' + formatBytes(need) : '')}
        </button>
      </div>
    </div>
  );
}

/**
 * The line under a recording row. `tracks` is the reading the row's own Play plays (AudioPlayer.playbackTracks).
 * `quiet` (a row with a tick and a ... menu, picture 14): only a download on its way or one that failed says a line;
 * on the phone is the tick, offline is the row's own "Not on this phone", and Download is in the menu.
 * @param {{ tracks: any[], name: string, quiet?: boolean }} props
 */
export function OfflineRowStatus({ tracks, name, quiet = false }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const list = Array.isArray(tracks) ? tracks.filter((t) => t && typeof t.url === 'string') : [];
  const urls = list.map((t) => t.url);
  const urlKey = urls.join('\n');
  React.useEffect(() => {
    if (off && urls.length) off.requestSizes(urls);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined urls: a new array each render must not re-ask
  }, [off, urlKey]);
  const u = off && urls.length ? unitState(off, urls) : null;
  const shown = !u ? '' : u.status === 'saved' ? 'saved' : !online && u.status !== 'downloading' ? 'offline' : u.status;
  const focus = useKeepFocus(shown);
  const playing = usePlayingOneOf(urls);
  const [asking, setAsking] = React.useState(false);
  if (!off || !u) return null;
  if (quiet && (shown === 'saved' || shown === 'offline' || shown === 'none')) return null;
  const download = () => off.download(list.map((t) => _item(t, name)));
  if (shown === 'saved') {
    return <p className="offline-row is-saved" {...focus}><CheckIcon /><span>On this phone{u.bytes ? ' · ' + formatBytes(u.bytes) : ''}</span></p>;
  }
  if (shown === 'offline') {
    // The one playing goes on from what it buffered (RC.5): it did say it needed a connection while it played.
    return <p className="offline-row is-offline" {...focus}><NoSignalIcon /><span>{playing ? 'Playing from the buffer' : 'Needs a connection'}</span></p>;
  }
  if (u.status === 'downloading') {
    return (
      <div className="offline-row is-busy" {...focus}>
        <span className="offline-row-label"><DownloadIcon /><span>{waitsForWifi(off, urls) ? WAITING_WORDS : u.started ? 'Downloading ' + u.percent + '%' : 'Waiting'}</span></span>
        <button type="button" className="offline-row-link" onClick={() => _cancel(off, urls)} aria-label={'Cancel the download of ' + name}>Cancel</button>
        {/* Queued rows said "Downloading 0%" over an empty bar (brief section 7 item 7): the bar starts with the bytes. */}
        {u.started ? (
          <span className="offline-row-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.percent}
            aria-label={'Downloading ' + name}><span style={{ width: u.percent + '%' }} /></span>
        ) : null}
      </div>
    );
  }
  if (u.status === 'failed') {
    return (
      <p className="offline-row is-failed" {...focus}>
        <AlertIcon />
        <span>{u.failed === 'space' ? 'Not enough room on this phone' : 'Download failed'}</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="offline-row-link" onClick={download} aria-label={'Retry the download of ' + name}>Retry</button>
      </p>
    );
  }
  const size = formatBytes(u.remaining || 0);
  const big = list.length > ROW_ASK_TRACKS || (u.remaining || 0) > ROW_ASK_BYTES;
  const todo = list.filter((t) => off.statusOf(t.url) !== 'saved');
  return (
    <>
      <button type="button" className="offline-row offline-row-download" {...focus}
        onClick={big ? () => { off.refresh(); setAsking(true); } : download} aria-expanded={big ? asking : undefined}
        aria-label={'Download ' + name + ' to this phone' + (size ? ', ' + size : '')}>
        <DownloadIcon /><span>{'Download' + (size ? ' · ' + size : '')}</span>
      </button>
      {big && asking ? (
        <DownloadConfirm off={off} label={name} todo={todo} onCancel={() => setAsking(false)}
          onGo={() => { off.download(todo.map((t) => _item(t, name))); setAsking(false); }} />
      ) : null}
    </>
  );
}

/** @param {any[][]} units each row's reading @returns {any[][]} the rows that have a recording */
function _rows(units) {
  return (Array.isArray(units) ? units : []).map((r) => (Array.isArray(r) ? r.filter((t) => t && typeof t.url === 'string') : [])).filter((r) => r.length);
}

/** @param {any} off @param {any[]} row */
function _rowSaved(off, row) {
  return row.every((t) => !_leaving.has(t.url) && off.statusOf(t.url) === 'saved');
}

/** The bytes still to download for `tracks`, or null while any size is unknown. @param {any} off @param {any[]} tracks */
function _need(off, tracks) {
  return tracks.reduce((n, t) => (n === null || !off.sizeOf(t.url) ? null : n + off.sizeOf(t.url)), /** @type {number | null} */ (0));
}

/**
 * "Download all" beside Play all: asks first with the count, the size and the phone's free space. Part on the phone, it
 * offers "Download the other 18 · 191 MB" (pictures 10, 14); with no signal, "Download when online" (picture 17).
 * @param {{ units: any[][], label: string, action?: string, savedText?: string, note?: boolean }} props units = each
 *   row's reading (AudioPlayer.playbackTracks); action and savedText reword the button and the done line (a reading
 *   plan's week, S6); note = false where OfflineCollectionMark already says what is on the phone (a collection header)
 */
export function OfflineCollectionAction({ units, label, action = 'Download all', savedText = 'All on this phone', note = true }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const [asking, setAsking] = React.useState(false);
  const tracks = off ? (Array.isArray(units) ? units : []).flat().filter((t) => t && typeof t.url === 'string') : [];
  const urls = tracks.map((t) => t.url);
  const u = urls.length ? unitState(off, urls) : null;
  const focus = useKeepFocus(!u ? '' : u.status === 'saved' || u.status === 'downloading' ? u.status : 'ask');
  if (!off || !u) return null;
  if (u.status === 'saved') {
    return note ? <p className="offline-collection is-saved" {...focus}><CheckIcon /><span>{savedText}</span></p> : null;
  }
  // Counted in recordings as the rows count them, not in files: Christmas in two parts is one (brief section 7
  // item 12, "30 recordings" beside "1 of 31").
  const rows = _rows(units);
  const rowsSaved = rows.filter((r) => _rowSaved(off, r)).length;
  const onPhone = rowsSaved + ' of ' + rows.length + ' on this phone';
  if (u.status === 'downloading') {
    return (
      <p className="offline-collection is-busy" {...focus}>
        <DownloadIcon /><span>{(waitsForWifi(off, urls) ? WAITING_WORDS : !online ? 'Waiting for a connection' : 'Downloading') + ' · ' + onPhone}</span>
        <button type="button" className="offline-row-link" onClick={() => _cancel(off, urls)}>Cancel</button>
      </p>
    );
  }
  const todo = tracks.filter((t) => _leaving.has(t.url) || off.statusOf(t.url) !== 'saved');
  const need = _need(off, todo);
  const words = !online ? 'Download when online'
    : rowsSaved ? 'Download the other ' + (rows.length - rowsSaved) + (need ? ' · ' + formatBytes(need) : '') : action;
  return (
    <div className="offline-collection" {...focus}>
      <button type="button" className="audio-library-secondary-action"
        onClick={() => { off.refresh(); setAsking(true); }} aria-expanded={asking}>
        <DownloadIcon /><span>{words}</span>
      </button>
      {/* After a Cancel (or a Remove) the part already on the phone stays said (brief section 7 item 8). */}
      {rowsSaved && note ? <p className="offline-collection-note">{onPhone}</p> : null}
      {asking ? (
        <DownloadConfirm off={off} label={label} todo={todo} count={rows.length - rowsSaved} onCancel={() => setAsking(false)}
          onGo={() => { downloadWhenOnline(off, todo.map((t) => _item(t, t.title))); setAsking(false); }} />
      ) : null}
    </div>
  );
}

/** A thin ring with a gold arc for the share on the phone; a tick in it once all of it is. @param {{ share: number }} props */
function OnPhoneRing({ share }) {
  const all = share >= 1;
  const c = 2 * Math.PI * 9;
  return (
    <svg className="offline-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="offline-ring-track" cx="12" cy="12" r="9" />
      {all ? <path className="offline-ring-tick" d="M8 12.3l2.7 2.7L16 9.6" />
        : <circle className="offline-ring-arc" cx="12" cy="12" r="9" strokeDasharray={(c * Math.max(0.04, share)).toFixed(2) + ' ' + c.toFixed(2)} transform="rotate(-90 12 12)" />}
    </svg>
  );
}

/** The small tick that ends a row's line once its recording is on the phone (pictures 14, 17). */
export function OnPhoneTick() {
  return <span className="offline-tick" role="img" aria-label="On this phone"><OnPhoneRing share={1} /></span>;
}

/**
 * Under a collection's title: "12 of 30 on this phone" beside a ring, or "All 30 on this phone" (pictures 10, 14, 17).
 * Nothing while none of it is on the phone, or where downloads are not possible here.
 * @param {{ units: any[][] }} props units = each row's reading, counted as the rows count (Christmas once)
 */
export function OfflineCollectionMark({ units }) {
  const off = useOfflineAudio();
  if (!off) return null;
  const rows = _rows(units);
  const saved = rows.filter((r) => _rowSaved(off, r)).length;
  if (!saved) return null;
  const all = saved === rows.length;
  return (
    <p className={'offline-mark' + (all ? ' is-all' : '')}>
      <OnPhoneRing share={saved / rows.length} />
      <span>{all ? (rows.length === 1 ? 'On this phone' : 'All ' + rows.length + ' on this phone') : saved + ' of ' + rows.length + ' on this phone'}</span>
    </p>
  );
}

/**
 * Where a row's reading stands for its tick and its line: 'saved', 'part' (some chapters of a book on the phone),
 * 'busy' (on its way), or 'none'.
 * @param {any} off @param {any[]} tracks @returns {{ state: 'saved' | 'part' | 'none' | 'busy', saved: number, count: number }}
 */
export function rowOnPhone(off, tracks) {
  const urls = (Array.isArray(tracks) ? tracks : []).map((t) => t && t.url).filter((x) => typeof x === 'string');
  if (!off || !urls.length) return { state: 'none', saved: 0, count: urls.length };
  const u = unitState(off, urls);
  return { state: u.status === 'saved' ? 'saved' : u.status === 'downloading' ? 'busy' : u.saved ? 'part' : 'none', saved: u.saved, count: u.count };
}

/**
 * The download half of a row's ... menu (picture 14): Download · 11 MB (Download when online with no signal; the
 * rest of a part-saved book), Cancel download while it is on its way, Remove · 13 MB with a 5 s Undo.
 * @param {{ off: any, online: boolean, tracks: any[], name: string }} a
 * @returns {Array<{ id: string, text: string, icon: string, onSelect: () => void, disabled?: boolean }>}
 */
export function offlineMenuItems({ off, online, tracks, name }) {
  const list = (Array.isArray(tracks) ? tracks : []).filter((t) => t && typeof t.url === 'string');
  if (!off || !list.length) return [];
  const urls = list.map((t) => t.url);
  const u = unitState(off, urls);
  /** @type {Array<{ id: string, text: string, icon: string, onSelect: () => void, disabled?: boolean }>} */
  const out = [];
  if (u.status === 'downloading') {
    out.push({ id: 'cancel', text: 'Cancel download', icon: 'cancel', onSelect: () => _cancel(off, urls) });
  } else if (u.status !== 'saved') {
    const todo = list.filter((t) => _leaving.has(t.url) || off.statusOf(t.url) !== 'saved');
    const need = _need(off, todo);
    const free = off.freeBytes();
    // The size is on the item, so it starts on one tap; it is off when it would not fit (DownloadConfirm's room check).
    const noRoom = need !== null && free > 0 && need + SPACE_MARGIN > free;
    const size = need ? ' · ' + formatBytes(need) : '';
    const text = !online ? 'Download when online' : noRoom ? 'Not enough room' + size : (u.saved ? 'Download the rest' : 'Download') + size;
    out.push({ id: 'download', text, icon: 'download', disabled: online && noRoom, onSelect: () => downloadWhenOnline(off, todo.map((t) => _item(t, name))) });
  }
  if (u.saved > 0 && u.status !== 'downloading') {
    const held = list.filter((t) => !_leaving.has(t.url) && off.statusOf(t.url) === 'saved');
    const bytes = held.reduce((n, t) => n + (off.sizeOf(t.url) || 0), 0);
    out.push({
      id: 'remove', text: 'Remove' + (bytes ? ' · ' + formatBytes(bytes) : ''), icon: 'remove',
      onSelect: () => removeWithUndo(off, held.map((t) => t.url), 'Removed ' + name + (bytes ? ' · ' + formatBytes(bytes) : '')),
    });
  }
  return out;
}

/* ── The Listen hero (D4b; downloads brief 3a, 3j; pictures 15, 16, 21) ─────────────────────────────────────────── */

/**
 * The whole minutes a Listen plays, for "Listen · 12 min" (player brief 3f), from the lengths baked at build time
 * (D1, the lazy AudioLengths table, loaded here on first use); null while any recording of it has none.
 * @param {Array<{ url?: string }>} tracks @returns {number | null}
 */
export function useListenMinutes(tracks) {
  const lengths = typeof AudioLengths !== 'undefined' ? AudioLengths : null;
  React.useSyncExternalStore(lengths ? lengths.lengthsStore.subscribe : _noSub, lengths ? lengths.lengthsStore.getVersion : _zero);
  React.useEffect(() => { if (lengths && !lengths.lengthsLoaded()) void lengths.lengthsReady(); }, [lengths]);
  const list = Array.isArray(tracks) ? tracks : [];
  if (!lengths || !list.length) return null;
  let sec = 0;
  for (const t of list) {
    const s = t && typeof t.url === 'string' ? lengths.secondsOf(t.url) : null;
    if (s == null) return null;
    sec += s;
  }
  return Math.max(1, Math.round(sec / 60));
}

export function CloudOffIcon() {
  return <svg className="offline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5h9.8a3.7 3.7 0 0 0 .9-7.3 5.6 5.6 0 0 0-9.4-3" /><path d="M6.3 9.2A4.7 4.7 0 0 0 7.5 18.5" /><path d="M4 4l16 16" /></svg>;
}

/** "4 of 10 MB": the unit said once when both halves share it. @param {number} done @param {number} total */
function _ofBytes(done, total) {
  const a = formatBytes(done) || '0 MB';
  const b = formatBytes(total);
  const unit = / (MB|GB)$/.exec(b);
  return (unit && a.endsWith(unit[0]) ? a.slice(0, -unit[0].length) : a) + ' of ' + b;
}

/**
 * Beside a Listen pill (picture 15): a round Download with its size under it; while it downloads, a ring with a stop
 * square and "4 of 10 MB" (a tap cancels); once saved, a tick with "On this phone"; a failed one offers Retry.
 * Nothing where downloads are not possible here, and nothing offline for a recording not on the phone: the pill
 * itself says so then (NotOnPhone).
 * @param {{ tracks: any[], name: string }} props tracks = what the Listen beside it plays
 */
export function HeroDownload({ tracks, name }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const list = (Array.isArray(tracks) ? tracks : []).filter((t) => t && typeof t.url === 'string');
  const urls = list.map((t) => t.url);
  const urlKey = urls.join('\n');
  React.useEffect(() => {
    if (off && urls.length) off.requestSizes(urls);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined urls: a new array each render must not re-ask
  }, [off, urlKey]);
  const u = off && urls.length ? unitState(off, urls) : null;
  const focus = useKeepFocus(u ? u.status : '');
  if (!off || !u) return null;
  if (u.status === 'saved') {
    return <p className="hero-dl is-saved" {...focus}><OnPhoneRing share={1} /><span>On this phone</span></p>;
  }
  if (u.status === 'downloading') {
    let done = 0;
    for (const x of urls) {
      if (off.statusOf(x) === 'saved') done += off.sizeOf(x) || 0;
      else { const p = off.progressOf(x); if (p) done += p.bytes; }
    }
    const cap = !u.started ? (waitsForWifi(off, urls) ? WAITING_WORDS : !online ? 'Waiting for a connection' : 'Waiting')
      : u.bytes ? _ofBytes(done, u.bytes) : u.percent + '%';
    return (
      <button type="button" className="hero-dl is-busy" {...focus} onClick={() => _cancel(off, urls)} aria-label={'Cancel the download of ' + name + '. ' + cap}>
        <svg className="hero-dl-ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="offline-ring-track" cx="12" cy="12" r="10" />
          <circle className="offline-ring-arc" cx="12" cy="12" r="10" transform="rotate(-90 12 12)"
            strokeDasharray={(2 * Math.PI * 10 * Math.max(0.04, u.started ? u.percent / 100 : 0)).toFixed(2) + ' ' + (2 * Math.PI * 10).toFixed(2)} />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
        <span className="hero-dl-cap">{cap}</span>
      </button>
    );
  }
  if (!online) return null;
  const todo = list.filter((t) => _leaving.has(t.url) || off.statusOf(t.url) !== 'saved');
  const need = _need(off, todo);
  const failed = u.status === 'failed';
  return (
    <button type="button" className={'hero-dl' + (failed ? ' is-failed' : '')} {...focus}
      onClick={() => off.download(todo.map((t) => _item(t, name)))}
      aria-label={(failed ? 'Download failed. Retry ' : 'Download ') + name + (need ? ', ' + formatBytes(need) : '')}>
      <span className="hero-dl-icon">{failed ? <AlertIcon /> : <DownloadIcon />}</span>
      <span className="hero-dl-cap">{failed ? (u.failed === 'space' ? 'No room · Retry' : 'Failed · Retry') : 'Download' + (need ? ' · ' + formatBytes(need) : '')}</span>
    </button>
  );
}

/** The disabled pill in a Listen's place, offline, for a recording not on the phone (pictures 15, 21). */
export function NotOnPhonePill() {
  return <button type="button" className="hero-play-pill is-off" disabled aria-label="Not on this phone"><CloudOffIcon /><span>Not on this phone</span></button>;
}

/**
 * "Download when online" under a Listen that cannot play offline: queues it for the signal (downloadWhenOnline), then
 * says it will. Nothing where downloads are not possible here.
 * @param {{ tracks: any[], name: string }} props
 */
export function DownloadWhenOnline({ tracks, name }) {
  const off = useOfflineAudio();
  const list = (Array.isArray(tracks) ? tracks : []).filter((t) => t && typeof t.url === 'string');
  if (!off || !list.length) return null;
  if (unitState(off, list.map((t) => t.url)).status === 'downloading') {
    return <p className="hero-offline-line hero-dl-held" role="status">It will download when you’re back online.</p>;
  }
  return (
    <div className="hero-play-row is-off">
      <button type="button" className="hero-dl-when" onClick={() => downloadWhenOnline(off, list.map((t) => _item(t, name)))}>
        <DownloadIcon /><span>Download when online</span>
      </button>
    </div>
  );
}

/**
 * Offline, and the Listen's recording is not on the phone (pictures 15, 21): the pill itself says "Not on this phone",
 * the line says why, and "Download when online" queues it for the signal.
 * @param {{ tracks: any[], name: string, line?: string }} props
 */
export function NotOnPhone({ tracks, name, line = 'You’re offline. This isn’t on this phone.' }) {
  return (
    <>
      <div className="hero-play-row is-off"><NotOnPhonePill /></div>
      <p className="hero-offline-line" role="status">{line}</p>
      <DownloadWhenOnline tracks={tracks} name={name} />
    </>
  );
}

/**
 * The tick after a history or Up next row's line when its recording is on the phone (downloads brief 3h). Nothing
 * where downloads are not possible here.
 * @param {{ url?: string }} props
 */
export function TrackOnPhone({ url }) {
  const off = useOfflineAudio();
  if (!off || typeof url !== 'string' || _leaving.has(url) || off.statusOf(url) !== 'saved') return null;
  return <>{' '}<OnPhoneTick /></>;
}
