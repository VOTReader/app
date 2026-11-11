/*
   AudioSavedScreen -- Saved (listen.html au-saved, au-saved0): one list for the recordings and the songs you starred.

   Split out of the Listen root so the root can stay a menu. The search lives HERE, where the list it filters is; the
   root carries only the one row that leads to it. A row: round play, title, one meta line, its star, and (for a
   recording) one menu: Play next, Add to the end of Up next, Open the letter, Remove from Saved.
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13). AudioPlayer, the AudioShelf helpers and the
   audio tables are read as free globals at call time - one player, one shelf, one copy of each table. */

import { ActionSheet } from '../components/SelectField.jsx';
import { EmptyState, ListGroup, ListRow, RowPlay } from '../components/UiParts.jsx';
import { UiIcon } from '../components/UiIcon.jsx';
import { toggleSavedRecording } from '../../utils/saved-shelf.js';
import { queueMenuItems } from '../components/queue-menu.js';
import { songClock, currentSongId } from '../components/SongParts.jsx';
import { remainingLabel } from '../components/AudioShelf.jsx';

/** The song catalog (bundle-d's SongCatalog), or null before it is wired. @returns {any} */
function songCatalog() {
  return typeof SongCatalog !== 'undefined' ? SongCatalog : null;
}

/** The saved song ids as songs, a hidden duplicate shown as the song it stands for, unknown ids dropped.
 *  @param {any} library @returns {any[]} */
function savedSongs(library) {
  const cat = songCatalog();
  if (!cat || !cat.loaded || !library || typeof library.songSaved !== 'function') return [];
  const out = [];
  const seen = new Set();
  for (const id of library.songSaved()) {
    let s = cat.songById(id);
    if (s && s.hid && s.dup) s = cat.songById(s.dup);
    if (!s || s.hid || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** "N saved", and "N of M saved" while a search narrows it. @param {number} shown @param {number} total */
function savedLabel(shown, total) {
  return shown === total ? total + ' saved' : shown + ' of ' + total + ' saved';
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenTrack: (track: any) => void,
 *   onOpenVolumes?: () => void,
 * }} props
 */
export function AudioSavedScreen({ onBack, backLabel = 'Back to Listen', onOpenTrack, onOpenVolumes }) {
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  // Not the 1 Hz clock: nothing here draws it (s18.3).
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getShape);
  useAudioPositions();
  // The VOT registry and manifest are lazy, and a row REBUILDS its collection around itself rather than playing alone
  // (2026-08-10), which it can only do once those have landed. This screen is reachable directly (a restored tab).
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );
  // The song catalog is fetched once per launch; the saved songs name themselves once it is in.
  const cat = songCatalog();
  React.useSyncExternalStore(
    React.useCallback((cb) => (cat ? cat.subscribe(cb) : () => {}), [cat]),
    React.useCallback(() => (cat ? cat.getVersion() : 0), [cat])
  );
  React.useEffect(() => { if (cat && !cat.loaded) void cat.load(); }, [cat]);

  const [query, setQuery] = React.useState('');
  const [menuFor, setMenuFor] = React.useState(/** @type {string | null} */ (null));
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  const songs = savedSongs(library);
  const q = query.trim().toLocaleLowerCase();
  const shownTracks = q ? saved.filter((track) => trackSearchText(track).includes(q)) : saved;
  const shownSongs = q ? songs.filter((s) => String(s.t || '').toLocaleLowerCase().includes(q)) : songs;
  const total = saved.length + songs.length;
  const shown = shownTracks.length + shownSongs.length;

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const active = state.status === 'playing' || state.status === 'loading';
  const songNow = currentSongId(state);
  const menuTrack = menuFor ? saved.find((t) => t.url === menuFor) : null;

  /** @param {any} track */
  const playTrack = (track) => { if (current && current.url === track.url) AudioPlayer.toggle(); else AudioPlayer.playTrack(track); };
  /** @param {any} song */
  const playSong = (song) => {
    if (songNow === song.id) AudioPlayer.toggle();
    else AudioPlayer.playSongs({ ids: songs.map((s) => s.id), startId: song.id, label: 'Saved' });
  };

  const utility = { title: 'Saved', onBack, backLabel };
  if (!total) {
    return (
      <ScreenLayout utility={utility}>
        <div className="root-screen listen-saved">
          <EmptyState icon="star" title="Nothing saved yet"
            text="Tap the star beside any recording or song to keep it here. What you save travels with your VOTReader backup."
            action={onOpenVolumes ? { label: 'Browse The Volumes of Truth', onClick: onOpenVolumes } : undefined} />
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout utility={utility}>
      <div className="root-screen listen-saved">
        <label className="ui-field listen-saved-find">
          <UiIcon name="search" size="sm" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what you saved"
            aria-label="Search what you saved" />
          {query ? <button type="button" className="ui-link" onClick={() => setQuery('')} aria-label="Clear the search">Clear</button> : null}
        </label>

        <ListGroup label={savedLabel(shown, total)} aside="Newest first">
          {shownTracks.map((track) => {
            const name = trackName(track);
            const playing = !!(current && current.url === track.url && active);
            const meta = [trackMeta(track), remainingLabel(track)].filter(Boolean).join(' · ');
            return (
              <ListRow key={track.url} current={!!(current && current.url === track.url)}
                lead={<RowPlay label={(playing ? 'Pause ' : 'Play ') + name} playing={playing} onClick={() => playTrack(track)} />}
                title={name} meta={meta}
                star={{ on: true, label: 'Remove ' + name + ' from Saved', onClick: () => toggleSavedRecording(library, track) }}
                menu={{ label: 'More for ' + name, onClick: () => setMenuFor(track.url) }} />
            );
          })}
          {shownSongs.map((song) => {
            const playing = songNow === song.id && active;
            const line = song.cr || (cat && typeof cat.songAlbumLabel === 'function' ? cat.songAlbumLabel(song) : '');
            return (
              <ListRow key={'song:' + song.id} current={songNow === song.id}
                lead={<RowPlay label={(playing ? 'Pause ' : 'Play ') + song.t} playing={playing} onClick={() => playSong(song)} />}
                title={song.t} meta={['Song', line, song.d ? songClock(song.d) : ''].filter(Boolean).join(' · ')}
                star={{ on: true, label: 'Remove ' + song.t + ' from Saved', onClick: () => library.toggleSongSaved(song.id) }} />
            );
          })}
        </ListGroup>
        {!shown ? <p className="listen-saved-note">Nothing you saved matches “{query.trim()}”.</p> : null}
        <p className="listen-saved-note">What you save travels with your VOTReader backup. Tap the star again to take one off the list.</p>
      </div>
      {menuTrack ? (
        <ActionSheet open onClose={() => setMenuFor(null)} title={trackName(menuTrack)} sub={trackMeta(menuTrack)}
          actions={[
            ...queueMenuItems({ tracks: [menuTrack], name: trackName(menuTrack) }).map((m) => ({
              id: m.id, icon: m.id === 'next' ? 'next' : 'plus', label: m.id === 'queue' ? 'Add to the end of Up next' : m.text, onSelect: m.onSelect,
            })),
            ...(hasTextDestination(menuTrack) ? [{ id: 'open', icon: 'book', label: 'Open the letter', onSelect: () => onOpenTrack(menuTrack) }] : []),
            { id: 'unsave', icon: 'star', label: 'Remove from Saved', onSelect: () => toggleSavedRecording(library, menuTrack) },
          ]} />
      ) : null}
    </ScreenLayout>
  );
}
