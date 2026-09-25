/* ═══════════════════════════════════════════════════════════════════════
   SongKeepParts — "Keep on this phone" for Songs of the Letters (K1;
   README 3.9, picture mockups/images/r2-more-screens.png, third panel)
   ═══════════════════════════════════════════════════════════════════════
   The keep controls every songs surface draws, over utils/song-keep.js:

     SongKeepCard     the song page's card, in the picture's three states:
                      KEEP FOR OFFLINE LISTENING with a filled KEEP · 64 MB,
                      KEEPING… with "Keeping 3 of 19…", a thin bar and
                      Cancel, AVAILABLE OFFLINE with a check and "On this
                      phone"
     SongKeepAction   the same states on one line, for a list or shelf
                      ("Keep all 110 · 380 MB") and a letter's songs card

   Sizes are the catalog's bytes. A refusal ("Not enough room: needs 380 MB,
   212 MB free.") shows under the control that asked. An iPhone in a Safari
   tab is told to add the app to its Home Screen instead of being offered a
   keep that Safari would clear within a week. Words: "Keep" and "On this
   phone", never "Save" (the listener's favourites) nor "Download" (the
   recordings' own words).

   Cluster D beside the bar and the letter card; the lazy Songs screens
   (bundle-h) read these as globals.
   ═══════════════════════════════════════════════════════════════════════ */

import { SongKeep, formatSongBytes, IOS_TAB_TEXT } from '../../utils/song-keep.js';
import { SongCatalog } from '../../utils/song-catalog.js';

/** Re-render on every keep change and every catalog change. @returns {typeof SongKeep} */
export function useSongKeep() {
  React.useSyncExternalStore(SongKeep.subscribe, SongKeep.getVersion);
  React.useSyncExternalStore(SongCatalog.subscribe, SongCatalog.getVersion);
  return SongKeep;
}

/** @returns {boolean} false while the phone has no signal; re-renders when it changes */
export function useSongsOnline() {
  const [online, setOnline] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  React.useEffect(() => {
    const read = () => setOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    read();
    return () => { window.removeEventListener('online', read); window.removeEventListener('offline', read); };
  }, []);
  return online;
}

export function KeepIcon() {
  return <svg className="song-keep-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></svg>;
}

export function KeptIcon() {
  return <svg className="song-keep-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

/** @param {{ kept: number, total: number }} props */
function KeepBar({ kept, total }) {
  const pct = total ? Math.max(4, Math.min(100, Math.round((kept / total) * 100))) : 0;
  return <span className="song-keep-bar" aria-hidden="true"><span style={{ width: pct + '%' }} /></span>;
}

/** "Keeping 3 of 19…" — or "Keeping…" for one song. @param {{ kept: number, total: number }} p */
function keepingWords(p) {
  return p.total > 1 ? 'Keeping ' + Math.min(p.total, p.kept + 1) + ' of ' + p.total + '…' : 'Keeping…';
}

/**
 * The song page's keep card (the picture's third panel). On the phone, a quiet Remove takes the song off it
 * (W2-06: the Kept list and Settings were the only ways).
 * @param {{ ids: string[], noteKey: string, versions?: number, title?: string }} props
 */
export function SongKeepCard({ ids, noteKey, versions = 1, title = '' }) {
  const keep = useSongKeep();
  const online = useSongsOnline();
  const avail = keep.availability();
  const list = Array.isArray(ids) ? ids : [];
  if (avail === 'none' || !list.length) return null;
  const p = keep.progressOf(list);
  const note = keep.noteFor(noteKey);
  const noteLine = note ? <p className="song-keep-note" role="status">{note}</p> : null;

  if (avail === 'ios-tab') {
    return (
      <section className="song-keep-card" aria-labelledby={noteKey + '-h'}>
        <h2 id={noteKey + '-h'} className="song-keep-head">Keep for offline listening</h2>
        <div className="song-keep-body">
          <span className="song-keep-icon"><KeepIcon /></span>
          <div className="song-keep-copy">
            <p className="song-keep-text">{IOS_TAB_TEXT}.</p>
            <p className="song-keep-sub">An iPhone clears songs kept in Safari after about a week.</p>
          </div>
        </div>
      </section>
    );
  }
  if (p.kept === p.total) {
    return (
      <section className="song-keep-card is-kept" aria-labelledby={noteKey + '-h'}>
        <h2 id={noteKey + '-h'} className="song-keep-head">Available offline</h2>
        <div className="song-keep-body">
          <span className="song-keep-icon is-round"><KeptIcon /></span>
          <div className="song-keep-copy">
            <p className="song-keep-text">On this phone</p>
            <div className="song-keep-kept-line">
              <p className="song-keep-sub">{(p.total > 1 ? p.total + ' versions · ' : '') + formatSongBytes(p.bytes)}</p>
              <button type="button" className="song-keep-quiet" onClick={() => { void keep.remove(list); }}
                aria-label={'Remove ' + (title || (p.total > 1 ? 'these songs' : 'this song')) + ' from this phone'}>Remove</button>
            </div>
          </div>
        </div>
      </section>
    );
  }
  if (p.busy) {
    return (
      <section className="song-keep-card is-busy" aria-labelledby={noteKey + '-h'}>
        <h2 id={noteKey + '-h'} className="song-keep-head">Keeping…</h2>
        <div className="song-keep-body">
          <span className="song-keep-icon"><KeepIcon /></span>
          <div className="song-keep-copy">
            <p className="song-keep-text" role="status">{keepingWords(p)}</p>
            <div className="song-keep-progress">
              <KeepBar kept={p.kept} total={p.total} />
              <button type="button" className="song-keep-cancel" onClick={() => keep.cancel(list)}>Cancel</button>
            </div>
          </div>
        </div>
      </section>
    );
  }
  const what = versions > 1 ? (p.kept ? 'Keep the other ' + (p.total - p.kept) + ' versions' : 'Keep all ' + versions + ' versions')
    : 'Keep this song';
  return (
    <section className="song-keep-card" aria-labelledby={noteKey + '-h'}>
      <h2 id={noteKey + '-h'} className="song-keep-head">Keep for offline listening</h2>
      <div className="song-keep-body">
        <span className="song-keep-icon"><KeepIcon /></span>
        <div className="song-keep-copy">
          <p className="song-keep-text">{what} on your phone to listen without internet.</p>
          {p.kept ? <p className="song-keep-sub">{p.kept + ' of ' + p.total + ' on this phone'}</p> : null}
          {p.failed ? <p className="song-keep-sub">{p.failed === 1 ? 'One did not keep. Try again.' : p.failed + ' did not keep. Try again.'}</p> : null}
          <button type="button" className="songs-shuffle song-keep-go" disabled={!online} onClick={() => { void keep.keep(list, noteKey); }}>
            <KeepIcon /><span>{'Keep · ' + formatSongBytes(p.needBytes)}</span>
          </button>
          {!online ? <p className="song-keep-sub">Needs a connection</p> : null}
          {noteLine}
        </div>
      </div>
    </section>
  );
}

/**
 * One line of keep: a list's "Keep all 110 · 380 MB", a letter card's "Keep these songs · 10 MB".
 * `label` is the words before the size ("Keep all 110" → "Keep all 110 · 380 MB"), or holds `{size}` where it goes.
 * @param {{ ids: string[], noteKey: string, label: string }} props
 */
export function SongKeepAction({ ids, noteKey, label }) {
  const keep = useSongKeep();
  const online = useSongsOnline();
  const avail = keep.availability();
  const list = Array.isArray(ids) ? ids : [];
  if (avail === 'none' || !list.length) return null;
  const p = keep.progressOf(list);
  const note = keep.noteFor(noteKey);
  let body;
  if (avail === 'ios-tab') {
    body = <p className="song-keep-line is-note"><KeepIcon /><span>{IOS_TAB_TEXT}</span></p>;
  } else if (p.kept === p.total) {
    body = <p className="song-keep-line is-kept"><KeptIcon /><span>{(p.total > 1 ? 'All ' + p.total + ' on this phone' : 'On this phone') + ' · ' + formatSongBytes(p.bytes)}</span></p>;
  } else if (p.busy) {
    body = (
      <div className="song-keep-line is-busy">
        <span className="song-keep-line-label" role="status"><KeepIcon /><span>{keepingWords(p)}</span></span>
        <button type="button" className="song-keep-cancel" onClick={() => keep.cancel(list)}>Cancel</button>
        <KeepBar kept={p.kept} total={p.total} />
      </div>
    );
  } else {
    // "Keep all 110" once some are on the phone reads "Keep the other 108": the size is theirs.
    const words = p.kept && /^Keep all /.test(label) ? 'Keep the other ' + (p.total - p.kept).toLocaleString('en-US') : label;
    body = (
      <button type="button" className="songs-outline-action song-keep-btn" disabled={!online} onClick={() => { void keep.keep(list, noteKey); }}>
        <KeepIcon /><span>{words.indexOf('{size}') >= 0 ? words.replace('{size}', formatSongBytes(p.needBytes)) : words + ' · ' + formatSongBytes(p.needBytes)}</span>
      </button>
    );
  }
  return (
    <div className="song-keep-action">
      {body}
      {avail === 'ok' && !online && p.kept < p.total && !p.busy ? <p className="song-keep-note">Needs a connection</p> : null}
      {note ? <p className="song-keep-note" role="status">{note}</p> : null}
    </div>
  );
}

/**
 * The desk's quiet keep row for the song playing (K3: a single-version song had no visible way to its Keep):
 * "Keep on this phone · 3 MB", then "Keeping… Cancel", then "On this phone · Remove". Nothing on an iPhone tab or
 * where keeping is not possible (the song page says why).
 * @param {{ id: string, title?: string }} props
 */
export function SongKeepQuiet({ id, title = '' }) {
  const keep = useSongKeep();
  const online = useSongsOnline();
  if (!id || keep.availability() !== 'ok') return null;
  const list = [id];
  const noteKey = 'keep-desk-' + id;
  const p = keep.progressOf(list);
  const note = keep.noteFor(noteKey);
  const name = title || 'this song';
  let body;
  if (p.kept === p.total) {
    body = (
      <>
        <span className="song-desk-keep-state"><KeepIcon /><span>On this phone</span></span>
        <button type="button" className="song-keep-quiet" onClick={() => { void keep.remove(list); }} aria-label={'Remove ' + name + ' from this phone'}>Remove</button>
      </>
    );
  } else if (p.busy) {
    body = (
      <>
        <span className="song-desk-keep-state" role="status"><KeepIcon /><span>Keeping…</span></span>
        <button type="button" className="song-keep-quiet" onClick={() => keep.cancel(list)}>Cancel</button>
      </>
    );
  } else {
    body = (
      <button type="button" className="song-keep-quiet song-desk-keep-go" disabled={!online} onClick={() => { void keep.keep(list, noteKey); }}
        aria-label={'Keep ' + name + ' on this phone · ' + formatSongBytes(p.needBytes)}>
        <KeepIcon /><span>{online ? 'Keep on this phone · ' + formatSongBytes(p.needBytes) : 'Keeping needs a connection'}</span>
      </button>
    );
  }
  return (
    <div className="song-desk-keep">
      {body}
      {note ? <p className="song-keep-note" role="status">{note}</p> : null}
    </div>
  );
}
