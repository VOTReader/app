/* ═══════════════════════════════════════════════════════════════════════
   LetterSongs — Songs of the Letters on a letter page (README §3.7, L4;
   picture final-05). Cluster D, beside LetterView and WtlbEntryView.

     LetterListenRow   the hero row: the FILLED ▶ LISTEN (when the letter is
                       recorded) and, beside it at the same height, the
                       outlined ♪ HEAR IT SUNG (when the catalog links a song
                       to this letter with medium or high confidence). One tap
                       to sound: the featured song, then the rest of this
                       letter's songs. BOTH pills show a playing state (W3-08)
                       and pause on a second tap.
     LetterSongsCard   SONGS FROM THIS LETTER, a related card below the text
                       and above the external ↗ links: up to 3 songs as in-app
                       rows (a tap plays; "N versions ›" opens the song), then
                       "All N songs of this letter ›" and the keep line (K1).

   Each subscribes to the player and the catalog ITSELF, so a clock tick
   re-renders a pill, never the letter. "Show songs on letter pages" (Settings
   → Listening, default on) turns both song parts off; LISTEN is untouched.
   A song is never the letter's reading: nothing here gives read credit.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { isSongKey, songIdOfKey } from '../../utils/audio-track.js';
import { SongCatalog } from '../../utils/song-catalog.js';
import { SongListRow, songCountLabel, currentSongId, playerIsActive, ChevronRightIcon } from './SongParts.jsx';
import { SongKeepAction } from './SongKeepParts.jsx';

/** Songs of this letter shown in the card before "All N songs". */
const CARD_SONGS = 3;

/** Subscribe to the catalog and ask for it once (the pill self-hides until it lands). @param {boolean} want */
function useSongCatalog(want) {
  React.useSyncExternalStore(SongCatalog.subscribe, SongCatalog.getVersion);
  React.useEffect(() => {
    if (want && !SongCatalog.loaded && !SongCatalog.error) void SongCatalog.load();
  }, [want]);
}

/** The songs made from `volKey:id`, featured first, or [] (setting off, catalog not in). */
function lettersSongs(want, letterKey) {
  return want && SongCatalog.loaded ? SongCatalog.songsForLetter(letterKey) : [];
}

const MUSIC_NOTE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3.5v11.1a3.6 3.6 0 1 0 2 3.2V8.2l6.5-1.6V3z" /></svg>;
const PLAY = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
const PAUSE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" /></svg>;

/**
 * @param {{ volKey: string, letter: { id: string, title?: string }, collectionLabel: string | null, showSongs?: boolean }} props
 */
export function LetterListenRow({ volKey, letter, collectionLabel, showSongs = true }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  useSongCatalog(showSongs);
  const letterKey = volKey + ':' + letter.id;
  const recorded = AudioPlayer.hasAudio(volKey, letter.id);
  const songs = lettersSongs(showSongs, letterKey);
  if (!recorded && !songs.length) return null;

  const st = AudioPlayer.getState();
  const cur = Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const active = playerIsActive(st);
  const readingHere = !!(cur && cur.key === letterKey);
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

  return (
    <div className={'hero-play-row letter-listen-row' + (songs.length ? ' has-songs' : '')}>
      {recorded ? (
        <button type="button" className={'hero-play-pill letter-listen-pill' + (listening ? ' is-playing' : '')} onClick={listen} aria-pressed={listening} aria-label={listening ? 'Pause the reading' : 'Listen'}>
          {listening ? PAUSE : PLAY}<span>{listening ? 'Pause' : 'Listen'}</span>
        </button>
      ) : null}
      {songs.length ? (
        <button type="button" className={'hero-play-pill letter-sung-pill' + (singing ? ' is-playing' : '')} onClick={sing} aria-pressed={singing} aria-label={singing ? 'Pause the song' : 'Hear it sung'}>
          {singing ? PAUSE : MUSIC_NOTE}<span>{singing ? 'Pause song' : 'Hear it sung'}</span>
        </button>
      ) : null}
    </div>
  );
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

  /** One row per family, led by that family's version of THIS letter. */
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
        <button type="button" className="letter-songs-all" onClick={() => open([{ k: 'list', v: 'letter:' + letterKey }])}>
          All {songCountLabel(leads.length)} of this letter<ChevronRightIcon />
        </button>
      ) : null}
      {/* K1: this letter's songs, every version, kept for listening with no signal. */}
      <SongKeepAction ids={songs.map((s) => s.id)} noteKey={'keep-letter-' + letterKey} label={songs.length > 1 ? 'Keep these ' + songs.length + ' songs' : 'Keep this song'} />
    </div>
  );
}
