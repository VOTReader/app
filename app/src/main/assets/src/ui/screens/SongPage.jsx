/*
   SongPage -- one song and its versions (README §3.4, L3; picture final-03).

   A frame of the Songs screen ({ k: 'song', v: <family id> }), drawn by
   AudioSongsScreen. A centred cover; SONG · N VERSIONS; the title; "From the
   letter: … ›" only for a medium or high link; the collection; "Made with
   Suno · by …"; PLAY (filled) and SAVE (outlined); the KEEP card (K1); the
   version rows (first four, then "Show all N versions ›"); a lyrics preview;
   more songs from the same letter.

   Bundle-h, reading the catalog, the player and the song pieces as FREE
   GLOBALS from bundle-d, like the rest of the Listening Library.
*/

/** Version rows before "Show all N versions". */
const VERSIONS_SHOWN = 4;
/** Lyric lines in the preview before "Show all lyrics". */
const LYRIC_PREVIEW = 4;
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
export function makersLine(versions) {
  const makers = [];
  for (const s of versions) if (s.cr && makers.indexOf(s.cr) < 0) makers.push(s.cr);
  if (!makers.length) return 'Made with Suno · by members of the flock';
  const others = versions.some((s) => !s.cr) || makers.length > 2;
  const named = makers.slice(0, 2).join(' and ');
  return 'Made with Suno · by ' + named + (others ? (makers.length > 1 ? ', and others' : ' and others') : '');
}

/**
 * @param {{ familyId: string, library: any, playingId: string, active: boolean, onPush: (f: any) => void, FamilyRow: any }} props
 */
export function SongPage({ familyId, library, playingId, active, onPush, FamilyRow }) {
  const cat = SongCatalog;
  const fam = cat.familyById(familyId);
  const versions = fam ? cat.versionsOf(fam) : [];
  const [allVersions, setAllVersions] = React.useState(false);
  const [allLyrics, setAllLyrics] = React.useState(false);
  const lead = versions[0] || null;
  // The lyrics preview reads the first version that has words.
  const worded = versions.find((s) => s.lyr > 0) || null;
  const lyrics = useSongLyrics(worded);
  if (!fam || !lead) return <p className="songs-empty">This song is no longer shared.</p>;

  const letter = songLetterOf(fam) || songLetterOf(lead);
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

  return (
    <div className="song-page">
      <div className="songs-eyebrow song-page-eyebrow">{versions.length > 1 ? 'Song · ' + versions.length + ' versions' : 'Song'}</div>
      <SongCover song={lead} large className="song-page-cover" />
      <h1>{fam.t}</h1>
      {letter ? (
        <button type="button" className="song-page-letter" onClick={openLetter}>
          <span>From the letter:</span> <em>{letter.title || 'Open the letter'}</em> <span aria-hidden="true">›</span>
        </button>
      ) : null}
      <p className="song-page-shelf">{letter ? letter.colLabel : shelfWords(fam.col)}</p>
      <p className="song-page-makers">{makersLine(versions)}</p>
      <div className="song-page-actions">
        <button type="button" className="songs-shuffle song-page-play" onClick={() => (isCurrent ? AudioPlayer.toggle() : play(lead))}>
          {isCurrent && active ? <PauseIcon /> : <PlayIcon />}<span>{isCurrent && active ? 'Pause' : 'Play'}</span>
        </button>
        <button type="button" className={'songs-outline-action song-page-save' + (saved ? ' is-saved' : '')} aria-pressed={saved} onClick={toggleSave}>
          <StarIcon filled={saved} /><span>{saved ? 'Saved' : 'Save'}</span>
        </button>
      </div>
      {/* K1 (picture r2-more-screens, third panel): the whole family, sized from the catalog. */}
      <SongKeepCard ids={versions.map((v) => v.id)} noteKey={'keep-fam-' + fam.id} versions={versions.length} title={fam.t} />

      {versions.length > 1 ? (
        <section className="songs-section" aria-labelledby="song-versions">
          <div className="songs-section-head"><h2 id="song-versions">Versions</h2></div>
          <div className="song-versions">
            {shownVersions.map((s) => {
              const now = playingId === s.id;
              return (
                <div key={s.id} className={'song-version' + (now ? ' is-current' : '')}>
                  <button type="button" className="song-version-main" onClick={() => play(s)}>
                    <span className="song-version-label">{s.v || 'Version'}</span>
                    <span className="songs-row-len">{songClock(s.d)}</span>
                  </button>
                  <SongPlayButton playing={now && active} label={fam.t + ', ' + (s.v || 'version')} onClick={() => play(s)} />
                </div>
              );
            })}
          </div>
          {versions.length > VERSIONS_SHOWN && !allVersions ? (
            <button type="button" className="songs-outline-action song-page-more" onClick={() => setAllVersions(true)}>
              <span>Show all {versions.length} versions</span><ChevronRightIcon />
            </button>
          ) : null}
        </section>
      ) : null}

      {lead.dl === 'instrumental' ? (
        <section className="songs-section" aria-labelledby="song-lyrics"><div className="songs-section-head"><h2 id="song-lyrics">Lyrics</h2></div><p className="song-page-lyrics">Instrumental</p></section>
      ) : lines.length ? (
        <section className="songs-section" aria-labelledby="song-lyrics">
          <div className="songs-section-head"><h2 id="song-lyrics">Lyrics</h2></div>
          <div className="song-page-lyrics">
            {(allLyrics ? lines : lines.slice(0, LYRIC_PREVIEW)).map((line, i) => <p key={i}>{line.t}</p>)}
          </div>
          {lines.length > LYRIC_PREVIEW ? (
            <button type="button" className="songs-see-all" onClick={() => setAllLyrics(!allLyrics)} aria-expanded={allLyrics}>
              {allLyrics ? 'Show less' : 'Show all lyrics'}<ChevronRightIcon />
            </button>
          ) : null}
          <p className="song-lyrics-foot">{letter && letter.title ? 'Words from the letter “' + letter.title + '” · lyrics transcribed' : 'Lyrics transcribed'}</p>
        </section>
      ) : null}

      {more.length ? (
        <section className="songs-section" aria-labelledby="song-more">
          <div className="songs-section-head"><h2 id="song-more">More songs from this letter</h2></div>
          <div className="songs-list">
            {more.slice(0, MORE_SHOWN).map((other) => (
              <FamilyRow key={other.id} fam={other} playingId={playingId} active={active}
                onPlay={(s) => AudioPlayer.playSongs({ filter: { family: other.id }, startId: s.id, label: other.t })}
                onOpen={() => onPush({ k: 'song', v: other.id })} />
            ))}
          </div>
          {more.length > MORE_SHOWN ? (
            <button type="button" className="songs-see-all" onClick={() => onPush({ k: 'list', v: 'letter:' + letter.key })}>
              All {more.length + 1} songs of this letter<ChevronRightIcon />
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
