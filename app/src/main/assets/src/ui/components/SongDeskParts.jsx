/* ═══════════════════════════════════════════════════════════════════════
   SongDeskParts — a song's lyrics in the full player (README §3.6, L3 + L5;
   picture 09 of the player mockups). Cluster D, beside AudioManagerSheet,
   whose Lyrics button shows this card in the cover's place:
     SongLyricsCard     synced lyrics follow the clock with the read-along wash
                        on the current line (Follow along toggle); plain lyrics
                        scroll; none hides the card; instrumentals say so
   The rest of the song player (cover, version chip, transport, keep) is the
   full player's own since pl-l2.
   ═══════════════════════════════════════════════════════════════════════ */
import { AudioPlayer } from '../../utils/audio-player.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { isVerbatimSong } from '../../utils/song-catalog.js';
import { useSongLyrics, lyricLineAt, songLyricsFoot, songLetterOf } from './SongParts.jsx';

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
  // null = no frame reading yet; -1 is a real answer (a gap between lines) and must not fall back to the page's
  // older time, which still names the last line for up to a second (sweep 2026-10-13).
  const [liveLine, setLiveLine] = React.useState(/** @type {number | null} */ (null));
  React.useEffect(() => {
    if (!synced || !playing || typeof requestAnimationFrame !== 'function' || typeof AudioPlayer.getPreciseTime !== 'function') return undefined;
    let raf = 0;
    const tick = () => {
      const i = lyricLineAt(lyrics.lines, AudioPlayer.getPreciseTime());
      setLiveLine((prev) => (prev === i ? prev : i));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setLiveLine(null); };
  }, [synced, playing, lyrics]);
  const now = synced ? (playing && liveLine !== null ? liveLine : lyricLineAt(lyrics.lines, time)) : -1;
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
      <p className="song-lyrics-foot">{songLyricsFoot(isVerbatimSong(song), letter)}</p>
    </div>
  );
}
