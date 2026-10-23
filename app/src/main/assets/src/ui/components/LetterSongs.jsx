/* ═══════════════════════════════════════════════════════════════════════
   LetterSongs — Songs of the Letters on a letter page (README §3.7, L4;
   picture final-05). Cluster D, beside LetterView and WtlbEntryView.

     LetterListenRow   the hero row: the FILLED ▶ LISTEN (when the letter is
                       recorded) and, beside it at the same height, the
                       outlined ♪ HEAR IT SUNG (when the catalog links a song
                       that SINGS THE LETTER'S OWN WORDS, verbatim, to this
                       letter with medium or high confidence). One tap to
                       sound: the first verbatim family's `vfeat`, then the
                       rest of this letter's verbatim songs. BOTH pills show a
                       playing state (W3-08) and pause on a second tap.
     LetterSongsCard   SONGS FROM THIS LETTER, a related card below the text
                       and above the external ↗ links: up to 3 verbatim families
                       as in-app rows (a tap plays its `vfeat`; "N versions ›"
                       opens the song), then "All N songs of this letter ›"
                       (verbatim families) and the keep line (K1).

   The verbatim gate (Corbin 2026-09-25, catalog-schema.md): a musical
   interpretation with new lyrics is never offered here, only songs whose
   words are the letter's. A catalog without `vs` offers nothing.

   Each subscribes to the player and the catalog ITSELF, so a clock tick
   re-renders a pill, never the letter. "Show songs on letter pages" (Settings
   → Listening, default on) turns both song parts off; LISTEN is untouched.
   A song is never the letter's reading: nothing here gives read credit.

   OFFLINE (Corbin 2026-10-05: "Disable certain features when offline"): a
   pill that cannot make sound with no network (the reading not downloaded,
   no song of this letter kept) is disabled, and one calm line under the row
   says why. What is on the phone stays live; a pill already playing can
   always pause. NetStatus decides offline (useSongsOnline).
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { isSongKey, songIdOfKey } from '../../utils/audio-track.js';
import { listenFace, pausedHere, useStillLoading } from './AudioPlayButton.jsx';
import { useAudioPositions } from './AudioShelf.jsx';
import { SongCatalog } from '../../utils/song-catalog.js';
import { SongListRow, songCountLabel, currentSongId, playerIsActive, ChevronRightIcon } from './SongParts.jsx';
import { SongKeepAction, useSongsOnline } from './SongKeepParts.jsx';
import { SongKeep } from '../../utils/song-keep.js';
import { DownloadWhenOnline, HeroDownload, NotOnPhonePill, useListenMinutes } from './OfflineAudioControls.jsx';

/** Songs of this letter shown in the card before "All N songs". */
const CARD_SONGS = 3;

/** Subscribe to the catalog and ask for it once (the pill self-hides until it lands). @param {boolean} want */
function useSongCatalog(want) {
  React.useSyncExternalStore(SongCatalog.subscribe, SongCatalog.getVersion);
  React.useEffect(() => {
    if (want && !SongCatalog.loaded && !SongCatalog.error) void SongCatalog.load();
  }, [want]);
}

/** The songs of `volKey:id` that sing its own words, each family's `vfeat` first, or [] (setting off, catalog not in). */
function lettersSongs(want, letterKey) {
  return want && SongCatalog.loaded ? SongCatalog.songsForLetter(letterKey, { verbatim: true }) : [];
}

const MUSIC_NOTE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3.5v11.1a3.6 3.6 0 1 0 2 3.2V8.2l6.5-1.6V3z" /></svg>;
const PLAY = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
const PAUSE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" /></svg>;

/**
 * @param {{ volKey: string, letter: { id: string, title?: string }, collectionLabel: string | null, showSongs?: boolean }} props
 */
export function LetterListenRow({ volKey, letter, collectionLabel, showSongs = true }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  React.useSyncExternalStore(SongKeep.subscribe, SongKeep.getVersion);
  useAudioPositions();
  const online = useSongsOnline();
  useSongCatalog(showSongs);
  const letterKey = volKey + ':' + letter.id;
  const st = AudioPlayer.getState();
  const cur = Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const readingHere = !!(cur && cur.key === letterKey);
  // U10.2: a load that runs long says so (a hook, so above the early return).
  const lateLoad = useStillLoading(readingHere && st.status === 'loading', (cur && cur.url) || '');
  const recorded = AudioPlayer.hasAudio(volKey, letter.id);
  // What Listen plays (the Letter Voice where that reader recorded it): its length on the pill, its download beside it.
  const tracks = recorded && typeof AudioPlayer.playbackTracks === 'function' ? AudioPlayer.playbackTracks(volKey, letter, collectionLabel) : [];
  const minutes = useListenMinutes(tracks);
  const songs = lettersSongs(showSongs, letterKey);
  if (!recorded && !songs.length) return null;

  const active = playerIsActive(st);
  const songHere = !!(cur && isSongKey(cur.key) && songs.some((s) => s.id === songIdOfKey(cur.key)));
  const listen = () => {
    if (readingHere) { AudioPlayer.toggle(); return; }
    AudioPlayer.playLetter({ volKey, letter, collectionLabel });
  };
  const sing = () => {
    if (songHere) { AudioPlayer.toggle(); return; }
    AudioPlayer.playSongs({ ids: songs.map((s) => s.id), startId: songs[0].id, label: letter.title || 'Songs of this letter' });
  };
  const listening = readingHere && active;
  const singing = songHere && active;
  // Offline: only what is on the phone can sound (online, playableNow is always true).
  const listenOff = recorded && !readingHere && !AudioPlayer.playableNow(volKey, letter.id);
  const singOff = songs.length > 0 && !online && !songHere && !songs.some((s) => SongKeep.isKept(s.id));
  const offLine = listenOff && !singOff ? 'You’re offline. This isn’t on this phone.' : offlineLine(listenOff, singOff);
  // ra4: "Resume · N min left" when the tap picks the reading up part-way. Loaded and paused here, the tap
  // un-pauses at the bar's own clock (the player's resume thresholds still apply); otherwise the player says
  // what a Listen would resume.
  const resume = !recorded || listening || listenOff ? null
    : readingHere ? pausedHere(st)
      : AudioPlayer.listenResume({ volKey, letter, collectionLabel });
  // U10.2: while this reading loads the pill says Loading…, never Pause at 0:00.
  const face = listenFace({ playing: readingHere && st.status === 'playing', loading: readingHere && st.status === 'loading', late: lateLoad, resume, minutes });

  return (
    <>
      <div className={'hero-play-row letter-listen-row' + (songs.length ? ' has-songs' : '')}>
        {/* D4b (pictures 15, 16, 21): offline and not on the phone, the pill says so; else the download control sits beside it. */}
        {recorded && listenOff ? <NotOnPhonePill /> : null}
        {recorded && !listenOff ? (
          <button type="button" className={'hero-play-pill letter-listen-pill' + (face.pause ? ' is-playing' : '') + (face.busy ? ' is-loading' : '')} onClick={listen} aria-pressed={face.pause} aria-busy={face.busy || undefined} aria-label={face.label}>
            {face.pause ? PAUSE : PLAY}<span>{face.text}</span>
          </button>
        ) : null}
        {recorded && !listenOff ? <HeroDownload tracks={tracks} name={letter.title || 'this letter'} /> : null}
        {songs.length ? (
          <button type="button" className={'hero-play-pill letter-sung-pill' + (singing ? ' is-playing' : '')} onClick={sing} disabled={singOff} aria-pressed={singing} aria-label={singing ? 'Pause the song' : 'Hear it sung'}>
            {singing ? PAUSE : MUSIC_NOTE}<span>{singing ? 'Pause song' : 'Hear it sung'}</span>
          </button>
        ) : null}
      </div>
      {offLine ? <p className="hero-offline-line" role="status">{offLine}</p> : null}
      {recorded && listenOff ? <DownloadWhenOnline tracks={tracks} name={letter.title || 'this letter'} /> : null}
    </>
  );
}

/**
 * The letter's outside recordings (its own audio file, SoundCloud): web pages, so offline the card goes and the hero
 * row above says what can play (downloads brief 2026-10-23, section 7 item 5: tapped offline, the link opened a page
 * that could not load, beside a Listen that had said why it could not play).
 * @param {{ letter: { audioUrl?: string, soundcloudUrl?: string } }} props
 */
export function LetterAudioLinks({ letter }) {
  const online = useSongsOnline();
  if (!online || !(letter.audioUrl || letter.soundcloudUrl)) return null;
  return (
    <div className="related-card">
      <div className="related-card-title">Audio</div>
      {letter.audioUrl && (
        <a className="related-link" href={letter.audioUrl} target="_blank" rel="noopener noreferrer">♪ Audio Recording</a>
      )}
      {letter.soundcloudUrl && (
        <a className="related-link" href={letter.soundcloudUrl} target="_blank" rel="noopener noreferrer">♪ Listen on SoundCloud</a>
      )}
    </div>
  );
}

/**
 * The one calm line under a hero row whose pills went quiet offline, or '' when nothing is off.
 * @param {boolean} listenOff @param {boolean} singOff @returns {string}
 */
export function offlineLine(listenOff, singOff) {
  if (listenOff && singOff) return 'You’re offline. This reading and its songs aren’t on this phone.';
  if (listenOff) return 'You’re offline. This reading isn’t on this phone.';
  if (singOff) return 'You’re offline. Songs of this letter aren’t kept on this phone.';
  return '';
}

/**
 * @param {{ volKey: string, letterId: string, letterTitle?: string, showSongs?: boolean }} props
 */
export function LetterSongsCard({ volKey, letterId, letterTitle, showSongs = true }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  useSongCatalog(showSongs);
  const letterKey = volKey + ':' + letterId;
  const songs = lettersSongs(showSongs, letterKey);
  if (!songs.length) return null;

  /** One row per verbatim family, led by its `vfeat` (the version that sings the letter's words). */
  const leads = [];
  const seen = new Set();
  for (const s of songs) if (!seen.has(s.f)) { seen.add(s.f); leads.push(s); }
  const st = AudioPlayer.getState();
  const playingId = currentSongId(st);
  const active = playerIsActive(st);
  const open = (frames) => { if (typeof window.__openSongs === 'function') window.__openSongs(frames, letterTitle || ''); };

  return (
    <div className="related-card letter-songs-card">
      <div className="related-card-title">Songs from this letter</div>
      <div className="songs-list">
        {leads.slice(0, CARD_SONGS).map((lead) => {
          const fam = SongCatalog.familyById(lead.f);
          const count = fam ? SongCatalog.versionsOf(fam).length : 1;
          const playingSong = playingId ? SongCatalog.songById(playingId) : null;
          const playingFam = !!(playingSong && playingSong.f === lead.f);
          const title = (fam && fam.t) || lead.t;
          const play = () => {
            if (playingFam) { AudioPlayer.toggle(); return; }
            AudioPlayer.playSongs({ ids: songs.map((s) => s.id), startId: lead.id, label: letterTitle || 'Songs of this letter' });
          };
          // W-02: the row plays; "N versions ›" opens the song page.
          return (
            <SongListRow key={lead.f} song={lead} title={title} line={count > 1 ? '' : lead.v || 'Songs of the Letters'}
              versions={count} onVersions={() => open([{ k: 'song', v: lead.f }])}
              current={playingFam} playing={playingFam && active} onPlay={play} />
          );
        })}
      </div>
      {/* Past three songs, the rest are one tap away. A song's own versions live on its song page. */}
      {leads.length > CARD_SONGS ? (
        <button type="button" className="letter-songs-all" onClick={() => open([{ k: 'list', v: 'sung:' + letterKey }])}>
          All {songCountLabel(leads.length)} of this letter<ChevronRightIcon />
        </button>
      ) : null}
      {/* K1: this letter's songs, every version, kept for listening with no signal. */}
      <SongKeepAction ids={songs.map((s) => s.id)} noteKey={'keep-letter-' + letterKey} label={songs.length > 1 ? 'Keep these ' + songs.length + ' songs' : 'Keep this song'} />
    </div>
  );
}
