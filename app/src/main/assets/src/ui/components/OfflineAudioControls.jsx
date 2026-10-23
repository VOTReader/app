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
const SPACE_MARGIN = 200 * 1024 * 1024;

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
    const status = off.statusOf(u);
    const size = off.sizeOf(u);
    if (size) total += size; else known = false;
    if (status === 'saved') { saved++; savedBytes += size || 0; doneBytes += size || 0; }
    else if (status === 'downloading') { busy++; moving++; const p = off.progressOf(u); if (p) doneBytes += p.bytes; }
    else if (status === 'queued') busy++;
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
 * @param {{ tracks: any[], name: string }} props
 */
export function OfflineRowStatus({ tracks, name }) {
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
        <button type="button" className="offline-row-link" onClick={() => off.cancel(urls)} aria-label={'Cancel the download of ' + name}>Cancel</button>
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

/**
 * "Download all" beside Play all: asks first with the count, the size and the phone's free space.
 * @param {{ units: any[][], label: string, action?: string, savedText?: string }} props units = each row's reading
 *   (AudioPlayer.playbackTracks); action and savedText reword the button and the done line (a reading plan's week, S6)
 */
export function OfflineCollectionAction({ units, label, action = 'Download all', savedText = 'All on this phone' }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const [asking, setAsking] = React.useState(false);
  const tracks = off ? (Array.isArray(units) ? units : []).flat().filter((t) => t && typeof t.url === 'string') : [];
  const urls = tracks.map((t) => t.url);
  const u = urls.length ? unitState(off, urls) : null;
  const focus = useKeepFocus(!u ? '' : u.status === 'saved' || u.status === 'downloading' ? u.status : 'ask');
  if (!off || !u) return null;
  if (u.status === 'saved') {
    return <p className="offline-collection is-saved" {...focus}><CheckIcon /><span>{savedText}</span></p>;
  }
  // Counted in recordings as the rows count them, not in files: Christmas in two parts is one (brief section 7
  // item 12, "30 recordings" beside "1 of 31").
  const rows = (Array.isArray(units) ? units : []).map((r) => (Array.isArray(r) ? r.filter((t) => t && typeof t.url === 'string') : [])).filter((r) => r.length);
  const rowsSaved = rows.filter((r) => r.every((t) => off.statusOf(t.url) === 'saved')).length;
  const onPhone = rowsSaved + ' of ' + rows.length + ' on this phone';
  if (u.status === 'downloading') {
    return (
      <p className="offline-collection is-busy" {...focus}>
        <DownloadIcon /><span>{(waitsForWifi(off, urls) ? WAITING_WORDS : 'Downloading') + ' · ' + onPhone}</span>
        <button type="button" className="offline-row-link" onClick={() => off.cancel(urls)}>Cancel</button>
      </p>
    );
  }
  const todo = tracks.filter((t) => off.statusOf(t.url) !== 'saved');
  return (
    <div className="offline-collection" {...focus}>
      <button type="button" className="audio-library-secondary-action" disabled={!online}
        onClick={() => { off.refresh(); setAsking(true); }} aria-expanded={asking}>
        <DownloadIcon /><span>{rowsSaved ? 'Download the rest' : action}</span>
      </button>
      {/* After a Cancel (or a Remove) the part already on the phone stays said (brief section 7 item 8). */}
      {rowsSaved ? <p className="offline-collection-note">{onPhone}</p> : null}
      {!online ? <p className="offline-collection-note">Needs a connection</p> : null}
      {asking && online ? (
        <DownloadConfirm off={off} label={label} todo={todo} count={rows.length - rowsSaved} onCancel={() => setAsking(false)}
          onGo={() => { off.download(todo.map((t) => _item(t, t.title))); setAsking(false); }} />
      ) : null}
    </div>
  );
}
