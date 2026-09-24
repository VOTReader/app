/* ═══════════════════════════════════════════════════════════════════════
   OfflineAudioControls — Cluster H (esbuild bundle-h.js): downloads to the phone
   ═══════════════════════════════════════════════════════════════════════
   Listening item 8 (Corbin 2026-09-22 "yes after reset"), built to Codex's
   mockup round 1, option 1 (lanes/readalong/out/mockups/offline/r1-1.png):
   a plain line under each recording row says what the phone holds and
   offers the next step, and "Download all" beside Play all asks first with
   the size and the phone's free space. Words: "Download" and "On this
   phone" - never "Save", which already means the listener's favourites.

   Only in the Android app. OfflineAudio (utils/offline-audio.js) and
   AudioPlayer live in bundle-d and are read here as FREE GLOBALS: one store
   and one player for the whole app (see _entry-h.js). On the web the store
   is unavailable and nothing here renders.
   ═══════════════════════════════════════════════════════════════════════ */

/** The phone keeps this much free beyond a download (OfflineAudioStore's SPACE_MARGIN). */
const SPACE_MARGIN = 200 * 1024 * 1024;

/** @returns {any} the bundle-d store, or null on a host without it */
function _store() {
  return typeof OfflineAudio !== 'undefined' ? OfflineAudio : null;
}

/**
 * Re-render on every download change. The store when downloads are possible here (the Android app), else null.
 * @returns {any}
 */
export function useOfflineAudio() {
  const s = _store();
  React.useSyncExternalStore(
    React.useCallback((cb) => (s ? s.subscribe(cb) : () => {}), [s]),
    () => (s ? s.getVersion() : 0),
  );
  return s && s.available() ? s : null;
}

/** @returns {boolean} false while the phone has no signal */
export function useOnline() {
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  React.useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
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
    else if (status === 'downloading') { busy++; const p = off.progressOf(u); if (p) doneBytes += p.bytes; }
    else if (status === 'queued') busy++;
    else if (status === 'failed' && !failed) failed = off.failureOf(u) || 'network';
  }
  const n = urls.length;
  const status = n > 0 && saved === n ? 'saved' : busy ? 'downloading' : failed ? 'failed' : 'none';
  const percent = known && total > 0 ? Math.floor((doneBytes / total) * 100) : n ? Math.floor((saved / n) * 100) : 0;
  return {
    status, saved, count: n, failed, percent: Math.max(0, Math.min(99, percent)),
    bytes: known ? total : null,
    remaining: known ? total - savedBytes : null,
  };
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
  if (!off || !urls.length) return null;
  const u = unitState(off, urls);
  const download = () => off.download(list.map((t) => _item(t, name)));
  if (u.status === 'saved') {
    return <p className="offline-row is-saved"><CheckIcon /><span>On this phone{u.bytes ? ' · ' + formatBytes(u.bytes) : ''}</span></p>;
  }
  if (!online && u.status !== 'downloading') {
    return <p className="offline-row is-offline"><NoSignalIcon /><span>Needs a connection</span></p>;
  }
  if (u.status === 'downloading') {
    return (
      <div className="offline-row is-busy">
        <span className="offline-row-label"><DownloadIcon /><span>{'Downloading ' + u.percent + '%'}</span></span>
        <button type="button" className="offline-row-link" onClick={() => off.cancel(urls)} aria-label={'Cancel the download of ' + name}>Cancel</button>
        <span className="offline-row-bar" aria-hidden="true"><span style={{ width: u.percent + '%' }} /></span>
      </div>
    );
  }
  if (u.status === 'failed') {
    return (
      <p className="offline-row is-failed">
        <AlertIcon />
        <span>{u.failed === 'space' ? 'Not enough room on this phone' : 'Download failed'}</span>
        <span aria-hidden="true">·</span>
        <button type="button" className="offline-row-link" onClick={download} aria-label={'Retry the download of ' + name}>Retry</button>
      </p>
    );
  }
  const size = formatBytes(u.remaining || 0);
  return (
    <button type="button" className="offline-row offline-row-download" onClick={download}
      aria-label={'Download ' + name + ' to this phone' + (size ? ', ' + size : '')}>
      <DownloadIcon /><span>{'Download' + (size ? ' · ' + size : '')}</span>
    </button>
  );
}

/**
 * "Download all" beside Play all: asks first with the count, the size and the phone's free space.
 * @param {{ units: any[][], label: string }} props units = each row's reading (AudioPlayer.playbackTracks)
 */
export function OfflineCollectionAction({ units, label }) {
  const off = useOfflineAudio();
  const online = useOnline();
  const [asking, setAsking] = React.useState(false);
  if (!off) return null;
  const tracks = (Array.isArray(units) ? units : []).flat().filter((t) => t && typeof t.url === 'string');
  const urls = tracks.map((t) => t.url);
  if (!urls.length) return null;
  const u = unitState(off, urls);
  if (u.status === 'saved') {
    return <p className="offline-collection is-saved"><CheckIcon /><span>All on this phone</span></p>;
  }
  if (u.status === 'downloading') {
    return (
      <p className="offline-collection is-busy">
        <DownloadIcon /><span>{'Downloading · ' + u.saved + ' of ' + u.count + ' on this phone'}</span>
        <button type="button" className="offline-row-link" onClick={() => off.cancel(urls)}>Cancel</button>
      </p>
    );
  }
  const todo = tracks.filter((t) => off.statusOf(t.url) !== 'saved');
  const need = todo.reduce((n, t) => (n === null || !off.sizeOf(t.url) ? null : n + off.sizeOf(t.url)), /** @type {number | null} */ (0));
  const free = off.freeBytes();
  const noRoom = need !== null && free > 0 && need + SPACE_MARGIN > free;
  const recordings = todo.length === 1 ? '1 recording' : todo.length + ' recordings';
  return (
    <div className="offline-collection">
      <button type="button" className="audio-library-secondary-action" disabled={!online}
        onClick={() => { off.refresh(); setAsking(true); }} aria-expanded={asking}>
        <DownloadIcon /><span>Download all</span>
      </button>
      {!online ? <p className="offline-collection-note">Needs a connection</p> : null}
      {asking && online ? (
        <div className="offline-confirm" role="group" aria-label={'Download ' + label}>
          <p className="offline-confirm-title">{'Download ' + label + '?'}</p>
          <p className="offline-confirm-line">{recordings + (need ? ' · ' + formatBytes(need) : '')}</p>
          {free > 0 ? <p className="offline-confirm-line">{'Free space on this phone: ' + formatBytes(free)}</p> : null}
          {noRoom ? <p className="offline-confirm-warn">Not enough room: free some space on the phone first.</p> : null}
          {/* Downloads run while the app is open: no background service yet (the refutation of 2026-09-24, SHOULD 9). */}
          <p className="offline-confirm-line">Keep VOTReader open until it finishes.</p>
          <div className="offline-confirm-actions">
            <button type="button" className="offline-confirm-cancel" onClick={() => setAsking(false)}>Cancel</button>
            <button type="button" className="offline-confirm-go" disabled={noRoom}
              onClick={() => { off.download(todo.map((t) => _item(t, t.title))); setAsking(false); }}>
              {'Download' + (need ? ' ' + formatBytes(need) : '')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
