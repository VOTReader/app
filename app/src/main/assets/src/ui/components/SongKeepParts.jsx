/* ═══════════════════════════════════════════════════════════════════════
   SongKeepParts — "Keep on this phone" for Songs of the Letters (K1;
   README 3.9, picture mockups/images/r2-more-screens.png, third panel)
   ═══════════════════════════════════════════════════════════════════════
   The keep controls every songs surface draws, over utils/song-keep.js:

     SongKeepAction   keep, keeping and kept on one line, for a letter's
                      songs card (the song page's own card went with the
                      redesign: Downloads is the one place to download)

   Sizes are the catalog's bytes. A refusal ("Not enough room: needs 380 MB,
   212 MB free.") shows under the control that asked. An iPhone in a Safari
   tab is told to add the app to its Home Screen instead of being offered a
   keep that Safari would clear within a week. Words: "Keep" and "On this
   phone", never "Save" (the listener's favourites) nor "Download" (the
   recordings' own words).

   Cluster D beside the bar and the letter card; the Songs screens
   (lazy bundle-h until lz1) read these as globals.
   ═══════════════════════════════════════════════════════════════════════ */

import { SongKeep, formatSongBytes, IOS_TAB_TEXT } from '../../utils/song-keep.js';
import { SongCatalog } from '../../utils/song-catalog.js';
import { NetStatus } from '../../utils/net-status.js';
import { useStoreVersion } from '../../hooks/use-store-version.js';

/** Re-render on every keep change and every catalog change. @returns {typeof SongKeep} */
export function useSongKeep() {
  useStoreVersion(SongKeep);
  useStoreVersion(SongCatalog);
  return SongKeep;
}

/**
 * false while network-only features are off: the phone has no signal, or a request just failed at the network
 * (NetStatus, Corbin 2026-10-05). Re-renders when it changes. The app's one online hook: bundle-d's parts import it,
 * the lazy screens read it as the useSongsOnline global.
 * @returns {boolean}
 */
export function useSongsOnline() {
  useStoreVersion(NetStatus);
  return !NetStatus.isOffline();
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
function keepingWords(p, keep) {
  if (waitsForWifi(keep)) return WAITING_WORDS;
  return p.total > 1 ? 'Keeping ' + Math.min(p.total, p.kept + 1) + ' of ' + p.total + '…' : 'Keeping…';
}

/** Download only on Wi-Fi (ra6): what is on its way waits while the phone is on mobile data. */
const WAITING_WORDS = 'Waiting for Wi-Fi';
/** @param {any} keep @returns {boolean} */
function waitsForWifi(keep) {
  return !!keep && typeof keep.waiting === 'function' && keep.waiting();
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
        <span className="song-keep-line-label" role="status"><KeepIcon /><span>{keepingWords(p, keep)}</span></span>
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

