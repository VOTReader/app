/* ═══════════════════════════════════════════════════════════════════════
   SongDeskParts — the listening desk in song mode (README §3.6, L3 + L5;
   picture final-04). Cluster D, beside AudioManagerSheet, which draws these
   in place of its reading pieces while the current track is a song:

     SongDeskHead       a 72 px cover, LISTENING NOW, the title, the version,
                        "Open the letter ›" (only for a medium/high link), "Song
                        page ›", the quiet keep row (K3) and Save
     SongVersionsCard   the Voice card's grammar for a song's versions: up to 4
                        chips and "All N ›" (a choice sheet); switching starts
                        the chosen version from 0:00 and keeps the rest of the queue
     SongTransport      Shuffle · Previous · Pause · Next · Repeat, each labelled
     SongLyricsCard     synced lyrics follow the clock with the read-along wash
                        on the current line (Follow along toggle); plain lyrics
                        scroll; none hides the card; instrumentals say so

   No speed card for songs (they always play at 1x, W3-05). The sleep timer
   and the queue stay the desk's own.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { songIdOfKey } from '../../utils/audio-track.js';
import { familyById, versionsOf } from '../../utils/song-catalog.js';
import {
  SongCover, ChoiceSheet, ShuffleIcon, RepeatIcon, NextIcon, PrevIcon, songLetterOf, songClock,
  useSongLyrics, lyricLineAt,
} from './SongParts.jsx';
import { PlayIcon, PauseIcon, StarIcon, hasTextDestination } from './AudioShelf.jsx';
import { SongKeepQuiet } from './SongKeepParts.jsx';

/** How many version chips show before "All N ›". */
const VERSION_CHIPS = 4;

/**
 * A version chip's words: the first part of its label ("Country · hmarie777" → "Country"), or the whole
 * label when that first part would name two versions alike ("Pop · No. 4" and "Pop · No. 5").
 * @param {any} s @param {any[]} [all]
 */
function chipLabel(s, all) {
  const first = (x) => { const v = x && x.v ? String(x.v) : ''; return (v.split(' · ')[0] || v || 'Version').trim(); };
  const mine = first(s);
  const twins = all ? all.filter((x) => first(x) === mine).length : 1;
  return twins > 1 && s.v ? String(s.v) : mine;
}

/**
 * @param {{ current: any, song: any, saved: boolean, onToggleSave: () => void, onClose: () => void }} props
 */
export function SongDeskHead({ current, song, saved, onToggleSave, onClose }) {
  const letter = song ? songLetterOf(song) : null;
  const canOpen = !!letter && hasTextDestination(current) && typeof window !== 'undefined' && typeof window.__openAudioText === 'function';
  // W-02: rows play on a tap, so the song page is reached from here too (a single-version song has no
  // "N versions ›" link on its row): the title and "Song page ›" open it; the song keeps playing.
  const canPage = !!(song && song.f) && typeof window !== 'undefined' && typeof window.__openSongs === 'function';
  const openPage = () => { window.__openSongs([{ k: 'song', v: song.f }], ''); onClose(); };
  const title = current.title || 'Untitled song';
  return (
    <div className="song-desk-head">
      <SongCover song={song || { id: songIdOfKey(current.key) }} large className="song-desk-cover" />
      <div className="song-desk-copy">
        <div className="audio-manager-kicker song-desk-kicker">Listening now</div>
        <h2 id="audio-manager-title">
          {canPage ? <button type="button" className="song-desk-title" onClick={openPage} aria-label={title + ' — open its song page; the song keeps playing'}>{title}</button> : title}
        </h2>
        {current.partLabel ? <p className="song-desk-version">{current.partLabel}</p> : null}
        {canOpen || canPage ? (
          <div className="song-desk-links">
            {canOpen ? (
              <button type="button" className="song-desk-letter" onClick={() => { window.__openAudioText(current); onClose(); }} aria-label={'Open the letter' + (letter && letter.title ? ' — ' + letter.title : '') + '; the song keeps playing'}>
                Open the letter <span aria-hidden="true">›</span>
              </button>
            ) : null}
            {canPage ? (
              <button type="button" className="song-desk-letter" onClick={openPage} aria-label="Song page; the song keeps playing">
                Song page <span aria-hidden="true">›</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {song && song.id ? <SongKeepQuiet id={song.id} title={title} /> : null}
      </div>
      <button type="button" className={'audio-manager-save' + (saved ? ' is-saved' : '')} aria-pressed={saved} aria-label={saved ? 'Remove from saved songs' : 'Save song'} onClick={onToggleSave}>
        <StarIcon filled={saved} />
        <span>{saved ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  );
}

/**
 * The versions of the song playing, as chips; "All N ›" opens every version in a sheet.
 * @param {{ song: any, state: any }} props
 */
export function SongVersionsCard({ song, state: _state }) {
  const [sheet, setSheet] = React.useState(false);
  const fam = song ? familyById(song.f) : null;
  const versions = fam ? versionsOf(fam) : [];
  if (versions.length < 2) return null;
  // The playing version always shows as a chip, first when it would fall past the four.
  const at = versions.findIndex((s) => s.id === song.id);
  const shown = at >= VERSION_CHIPS ? [versions[at]].concat(versions.filter((s) => s.id !== song.id).slice(0, VERSION_CHIPS - 1)) : versions.slice(0, VERSION_CHIPS);
  const choose = (id) => {
    if (id === song.id) return;
    // From the start, in its place: the queue, its label, shuffle and what was heard all stay (README §3.6).
    AudioPlayer.switchSongVersion(id);
  };
  return (
    <div className="audio-manager-tool audio-manager-voice audio-manager-voice-top song-desk-versions">
      <div className="audio-manager-tool-head"><span>Versions</span><strong>{chipLabel(song, versions)}</strong></div>
      <div className="audio-manager-segment" role="radiogroup" aria-label="Version of this song">
        {shown.map((s) => (
          <button key={s.id} type="button" role="radio" className={s.id === song.id ? 'is-active' : ''} aria-checked={s.id === song.id} aria-label={s.v || chipLabel(s, versions)} onClick={() => choose(s.id)}>{chipLabel(s, versions)}</button>
        ))}
        {versions.length > shown.length ? (
          <button type="button" className="song-desk-all" aria-haspopup="dialog" onClick={() => setSheet(true)}>All {versions.length} <span aria-hidden="true">›</span></button>
        ) : null}
      </div>
      <p className="audio-manager-voice-note">Switches to another version of this song, from the start.</p>
      {sheet ? (
        <ChoiceSheet
          eyebrow={fam.t} title="Versions" value={song.id}
          options={versions.map((s) => ({ id: s.id, label: s.v || chipLabel(s, versions), meta: songClock(s.d) }))}
          onChange={choose} onClose={() => setSheet(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Shuffle · Previous · Pause · Next · Repeat, with words under the icons.
 * @param {{ state: any }} props
 */
export function SongTransport({ state }) {
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const loading = state.status === 'loading';
  const active = state.status === 'playing' || loading;
  const repeat = state.repeat === 'one' || state.repeat === 'all' ? state.repeat : 'off';
  const nextRepeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
  const repeatWord = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat';
  const lastSong = state.qi + 1 >= queue.length && repeat !== 'all';
  return (
    <div className="audio-manager-transport song-desk-transport" aria-label="Playback controls">
      <button type="button" className={'song-desk-tool' + (state.shuffle ? ' is-on' : '')} aria-pressed={!!state.shuffle} onClick={() => AudioPlayer.setShuffle(!state.shuffle)}>
        <span className="audio-manager-round"><ShuffleIcon /></span><span className="song-desk-word">Shuffle</span>
      </button>
      <button type="button" className="song-desk-tool" onClick={() => AudioPlayer.prev()} aria-label="Previous song">
        <span className="audio-manager-round"><PrevIcon /></span><span className="song-desk-word" aria-hidden="true">Previous</span>
      </button>
      <button type="button" className={'song-desk-tool song-desk-main' + (loading ? ' is-loading' : '')} onClick={() => AudioPlayer.toggle()} aria-label={active ? 'Pause' : 'Play'} aria-busy={loading}>
        <span className="audio-manager-play">{active ? <PauseIcon /> : <PlayIcon />}</span><span className="song-desk-word" aria-hidden="true">{active ? 'Pause' : 'Play'}</span>
      </button>
      <button type="button" className="song-desk-tool" onClick={() => AudioPlayer.next()} disabled={lastSong} aria-label="Next song">
        <span className="audio-manager-round"><NextIcon /></span><span className="song-desk-word" aria-hidden="true">Next</span>
      </button>
      <button type="button" className={'song-desk-tool' + (repeat !== 'off' ? ' is-on' : '')} aria-pressed={repeat !== 'off'} aria-label={repeat === 'one' ? 'Repeat: this song' : repeat === 'all' ? 'Repeat: the queue' : 'Repeat: off'} onClick={() => AudioPlayer.setRepeat(nextRepeat)}>
        <span className="audio-manager-round"><RepeatIcon one={repeat === 'one'} /></span><span className="song-desk-word" aria-hidden="true">{repeatWord}</span>
      </button>
    </div>
  );
}

/**
 * The words of the song playing. Synced: the current line takes the
 * read-along wash and the card follows it (inside its own box — never the
 * page's scroller), unless Follow along is off. Plain: a scrolling card.
 * @param {{ song: any, time: number }} props
 */
export function SongLyricsCard({ song, time }) {
  const lyrics = useSongLyrics(song);
  const [follow, setFollow] = React.useState(true);
  const boxRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const synced = !!(lyrics && lyrics.synced);
  // n3-10: the player tells the page the time once a second, so the wash moved
  // up to a second late. While the song plays, read the element's own clock each
  // frame (getPreciseTime, as the read-along does) and re-render only when the
  // line changes; paused, the page's time is exact enough.
  const playing = AudioPlayer.getState().status === 'playing';
  const [liveLine, setLiveLine] = React.useState(-1);
  React.useEffect(() => {
    if (!synced || !playing || typeof requestAnimationFrame !== 'function' || typeof AudioPlayer.getPreciseTime !== 'function') return undefined;
    let raf = 0;
    const tick = () => {
      const i = lyricLineAt(lyrics.lines, AudioPlayer.getPreciseTime());
      setLiveLine((prev) => (prev === i ? prev : i));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setLiveLine(-1); };
  }, [synced, playing, lyrics]);
  const now = synced ? (playing && liveLine >= 0 ? liveLine : lyricLineAt(lyrics.lines, time)) : -1;
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box || !follow || now < 0) return;
    const line = /** @type {HTMLElement | null} */ (box.children[now] || null);
    if (!line) return;
    // The box is position:relative, so a line's offsetTop is measured from the box itself.
    const target = line.offsetTop - (box.clientHeight - line.offsetHeight) / 2;
    const top = Math.max(0, target);
    if (typeof box.scrollTo === 'function') box.scrollTo({ top, behavior: scrollBehavior() }); else box.scrollTop = top;
  }, [now, follow]);
  if (!song) return null;
  if (song.dl === 'instrumental') {
    return (
      <div className="song-lyrics-card">
        <div className="song-lyrics-head"><span>Lyrics</span></div>
        <p className="song-lyrics-note">Instrumental</p>
      </div>
    );
  }
  if (!lyrics) return null;   // loading, or none: the card is hidden
  const letter = songLetterOf(song);
  return (
    <div className="song-lyrics-card">
      <div className="song-lyrics-head">
        <span>Lyrics</span>
        {synced ? (
          <button type="button" className={'song-lyrics-follow' + (follow ? ' is-on' : '')} aria-pressed={follow} onClick={() => setFollow(!follow)}>Follow along</button>
        ) : null}
      </div>
      <div className="song-lyrics-lines" ref={boxRef} tabIndex={0} role="region" aria-label="Lyrics">
        {lyrics.lines.map((line, i) => (
          <p key={i} className={'song-lyrics-line' + (i === now ? ' is-now' : '')} aria-current={i === now ? 'true' : undefined}>{line.t}</p>
        ))}
      </div>
      <p className="song-lyrics-foot">{letter && letter.title ? 'Words from the letter “' + letter.title + '” · lyrics transcribed' : 'Lyrics transcribed'}</p>
    </div>
  );
}
