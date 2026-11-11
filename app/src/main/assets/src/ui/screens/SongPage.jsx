/*
   SongPage -- one song and its versions (README §3.4, L3; picture final-03).

   A frame of the Songs screen ({ k: 'song', v: <family id> }), drawn by
   AudioSongsScreen. A centred cover; SONG · N VERSIONS; the title; "From the
   letter: … ›" only for a medium or high link whose lead version sings the
   letter's own words (the verbatim gate), "Inspired by the letter: … ›" for
   an interpretation; the collection; "Made with
   Suno · by …"; PLAY (filled) and SAVE (outlined); the KEEP card (K1); the
   version rows (first four, then "Show all N versions ›"); a lyrics preview;
   more songs from the same letter.

   Bundle-h, reading the catalog, the player and the song pieces as FREE
   GLOBALS from bundle-d, like the rest of the Listening Library.
*/

import { useOnline } from '../components/OfflineAudioControls.jsx';
import { SongVotePair, SongVoteAsk } from '../components/SongVoteParts.jsx';
import { ListGroup, ListRow, UiButton } from '../components/UiParts.jsx';

/** Version rows before "Show all N versions". */
const VERSIONS_SHOWN = 4;
/** Other songs of the same letter shown under MORE SONGS FROM THIS LETTER. */
const MORE_SHOWN = 3;

/** What a song without a letter is, in the words of its shelf. @param {string} col */
function shelfWords(col) {
  if (col === 'bible') return 'A Bible song';
  if (col === 'originals') return 'A flock original';
  if (col === 'prayers') return 'A flock prayer';
  return 'Inspired by the letters';
}

/** "by hmarie777", "by hmarie777 and others", or "by members of the flock". @param {any[]} versions */
function makersLine(versions) {
  const makers = [];
  for (const s of versions) if (s.cr && makers.indexOf(s.cr) < 0) makers.push(s.cr);
  if (!makers.length) return 'made with Suno by members of the flock';
  const others = versions.some((s) => !s.cr) || makers.length > 2;
  const named = makers.slice(0, 2).join(' and ');
  return 'made with Suno by ' + named + (others ? (makers.length > 1 ? ', and others' : ' and others') : '');
}

/**
 * @param {{ familyId: string, library: any, playingId: string, active: boolean, onPush: (f: any) => void, FamilyRow: any }} props
 */
export function SongPage({ familyId, library, playingId, active, onPush, FamilyRow }) {
  const online = useOnline();
  const cat = SongCatalog;
  const fam = cat.familyById(familyId);
  const versions = fam ? cat.versionsOf(fam) : [];
  const [allVersions, setAllVersions] = React.useState(false);
  const [lyricsOpen, setLyricsOpen] = React.useState(false);
  const lead = versions[0] || null;
  // The lyrics preview reads the first version that has words.
  const worded = versions.find((s) => s.lyr > 0) || null;
  const lyrics = useSongLyrics(worded);
  if (!fam || !lead) return <p className="songs-empty">This song is no longer shared.</p>;

  const letter = songLetterOf(fam) || songLetterOf(lead);
  // The verbatim gate (Corbin 2026-09-25): only a song that sings the letter's own words may say it is "from the
  // letter" or that its words are the letter's. The link names the version the page leads with (and PLAY plays);
  // the lyrics footer names the version whose words it shows. A catalog without `vs` claims nothing.
  const leadVerbatim = cat.isVerbatimSong(lead);
  const wordsVerbatim = cat.isVerbatimSong(worded);
  const isCurrent = familyIsPlaying(fam.id, playingId);
  // n3-08: the desk saves the version playing, so the page counts ANY version
  // saved (it looked at the first only, and its Save then made a second copy)
  const savedIds = library && typeof library.isSongSaved === 'function'
    ? versions.filter((v) => library.isSongSaved(v.id)).map((v) => v.id) : [];
  const saved = savedIds.length > 0;
  const toggleSave = () => {
    if (!library || typeof library.toggleSongSaved !== 'function') return;
    if (saved) { savedIds.forEach((id) => library.toggleSongSaved(id)); return; }
    const playingHere = isCurrent && versions.some((v) => v.id === playingId);
    library.toggleSongSaved(playingHere ? playingId : lead.id);
  };
  const play = (song) => {
    if (playingId === song.id) { AudioPlayer.toggle(); return; }
    AudioPlayer.playSongs({ filter: { family: fam.id }, startId: song.id, label: fam.t });
  };
  const shownVersions = allVersions ? versions : versions.slice(0, VERSIONS_SHOWN);
  const openLetter = () => {
    if (letter && typeof window.__openAudioText === 'function') window.__openAudioText({ key: letter.key, title: letter.title });
  };
  // More songs from the same letter (medium or high links only), this one left out.
  /** @type {any[]} */
  const more = [];
  if (letter) {
    for (const s of cat.songsForLetter(letter.key)) {
      const other = cat.familyById(s.f);
      if (other && other.id !== fam.id && more.indexOf(other) < 0) more.push(other);
    }
  }
  const lines = lyrics ? lyrics.lines : [];

  const instrumental = lead.dl === 'instrumental';
  // listen.html au-song: the cover, the title, one line, Play | Save, the vote, From the letter and Lyrics, more songs.
  const line = [letter ? letter.colLabel : shelfWords(fam.col), versions.length > 1 ? versions.length + ' versions' : songClock(lead.d), makersLine(versions)]
    .filter(Boolean).join(' · ');

  return (
    <div className="song-page">
      <SongCover song={lead} large className="song-page-cover" />
      <h1>{fam.t}</h1>
      <p className="song-page-line">{line}</p>
      <div className="ui-btn-row song-page-actions">
        <UiButton kind="primary" icon={isCurrent && active ? 'pause' : 'play'} onClick={() => (isCurrent ? AudioPlayer.toggle() : play(lead))}>
          {isCurrent && active ? 'Pause' : 'Play'}
        </UiButton>
        <UiButton icon="star" className={'song-page-save' + (saved ? ' is-saved' : '')} onClick={toggleSave}>{saved ? 'Saved' : 'Save'}</UiButton>
      </div>
      {versions.length === 1 ? <SongVoteAsk song={lead} title={fam.t} /> : null}
      {letter || instrumental || lines.length ? (
        <ListGroup ariaLabel="About this song" className="song-page-about">
          {letter ? (
            <ListRow icon="book" title={letter.title || 'Open the letter'} meta={leadVerbatim ? 'From the letter' : 'Inspired by the letter'} onClick={openLetter} />
          ) : null}
          {instrumental ? <ListRow icon="quote" title="Lyrics" meta="Instrumental" /> : lines.length ? (
            <ListRow icon="quote" title="Lyrics" meta={songLyricsFoot(wordsVerbatim, letter)}
              ariaLabel={(lyricsOpen ? 'Hide the lyrics of ' : 'Show the lyrics of ') + fam.t} onClick={() => setLyricsOpen(!lyricsOpen)} />
          ) : null}
        </ListGroup>
      ) : null}
      {lyricsOpen && lines.length ? (
        <div className="song-page-lyrics" role="region" aria-label={'Lyrics of ' + fam.t}>
          {/* a stanza break is an empty line: it keeps its space (U 8.6 bug list) */}
          {lines.map((l, i) => (String(l.t || '').trim() ? <p key={i} dir="auto">{l.t}</p> : <p key={i} className="is-break" aria-hidden="true" />))}
        </div>
      ) : null}

      {versions.length > 1 ? (
        <section className="songs-section" aria-labelledby="song-versions">
          <h2 className="ui-label" id="song-versions">Versions</h2>
          <div className="ui-group song-versions">
            {shownVersions.map((s) => {
              const now = playingId === s.id;
              // Offline, a version not kept on this phone cannot play (2026-10-05); the one playing can always pause.
              const off = !online && !now && !(typeof SongKeep !== 'undefined' && SongKeep.isKept(s.id));
              return (
                <div key={s.id} className={'song-version' + (now ? ' is-current' : '') + (off ? ' is-unavailable' : '')}>
                  <button type="button" className="song-version-main" onClick={() => play(s)} disabled={off}>
                    <span className="song-version-label">{s.v || 'Version'}</span>
                    <span className="songs-row-len">{songClock(s.d)}</span>
                  </button>
                  <SongVotePair song={s} title={fam.t + ', ' + (s.v || 'version')} />
                  <SongPlayButton playing={now && active} label={fam.t + ', ' + (s.v || 'version')} onClick={() => play(s)} disabled={off} />
                </div>
              );
            })}
          </div>
          {versions.length > VERSIONS_SHOWN && !allVersions ? (
            <UiButton kind="text" className="song-page-more" onClick={() => setAllVersions(true)}>Show all {versions.length} versions</UiButton>
          ) : null}
        </section>
      ) : null}

      {more.length ? (
        <section className="songs-section" aria-labelledby="song-more">
          <h2 className="ui-label" id="song-more">More songs from this letter</h2>
          <div className="ui-group songs-list">
            {more.slice(0, MORE_SHOWN).map((other) => (
              <FamilyRow key={other.id} fam={other} playingId={playingId} active={active}
                onPlay={(s) => AudioPlayer.playSongs({ filter: { family: other.id }, startId: s.id, label: other.t })}
                onOpen={() => onPush({ k: 'song', v: other.id })} />
            ))}
          </div>
          {more.length > MORE_SHOWN ? (
            <UiButton kind="text" className="song-page-more" onClick={() => onPush({ k: 'list', v: 'letter:' + letter.key })}>
              All {more.length + 1} songs of this letter
            </UiButton>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
