/* ═══════════════════════════════════════════════════════════════════════
   SongVoteParts — the 👍 / 👎 pair (sy4-3; Corbin 2026-10-22, DECISIONS
   "Song voting"; pictures D:/Swarm/calls/song-voting-mockups/ 05-08, spec
   D:/Swarm/lanes/design/out/sv-mock/README.md "Components").

     SongVotePair   two bare line thumbs, 22 px in 48 px targets, 4 px apart.
                    None = both taupe outlines; Liked = thumb-up solid gold;
                    Not for me = thumb-down solid taupe (never red). Two
                    toggle buttons (aria-pressed), "Like <title>" / "Not for
                    me <title>". Tapping the lit one clears it.
     SongVoteAsk    the song page's centred line: italic "Do you like this
                    song?" then the pair, larger. Not a transport control.
     DownVoteNote   the first 👎 on this install: "Only you see this. We'll
                    play it less for you." anchored to the thumb-down; OK or a
                    tap elsewhere dismisses it; no timer. Once per install.

   No numbers anywhere: no like counts, no play counts. A vote made offline
   looks like any other (the outbox sends it later). The state lives in
   utils/song-votes.js (the SongVotes store); each pair subscribes itself, so a
   memoized row redraws only its own pair.
   ═══════════════════════════════════════════════════════════════════════ */

import { SongVotes } from '../../utils/song-votes.js';

/** @param {{ filled?: boolean }} props */
export function ThumbUpIcon({ filled = false }) {
  return (
    <svg className="song-vote-svg" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 10.5v9.5H4.6a1.1 1.1 0 0 1-1.1-1.1v-7.3a1.1 1.1 0 0 1 1.1-1.1h2.9z" />
      <path d="M7.5 10.5l3.6-6.6c.3-.5.9-.8 1.5-.6 1.2.4 1.9 1.6 1.6 2.8l-.8 3.4h5.1c1.3 0 2.3 1.2 2 2.5l-1.5 6.5a2.3 2.3 0 0 1-2.2 1.8H7.5" />
    </svg>
  );
}

/** @param {{ filled?: boolean }} props */
export function ThumbDownIcon({ filled = false }) {
  return (
    <svg className="song-vote-svg" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 13.5V4h2.9a1.1 1.1 0 0 1 1.1 1.1v7.3a1.1 1.1 0 0 1-1.1 1.1h-2.9z" />
      <path d="M16.5 13.5l-3.6 6.6c-.3.5-.9.8-1.5.6-1.2-.4-1.9-1.6-1.6-2.8l.8-3.4H5.5c-1.3 0-2.3-1.2-2-2.5L5 5.5A2.3 2.3 0 0 1 7.2 3.7h9.3" />
    </svg>
  );
}

/** The vote on a song, redrawn when it changes. @param {string} id @returns {number} */
export function useSongVote(id) {
  React.useEffect(() => { void SongVotes.load(); }, []);
  React.useSyncExternalStore(SongVotes.subscribe, SongVotes.getVersion);
  return SongVotes.voteOf(id);
}

/**
 * The one-time note under (or over) the thumb-down. Drawn on the body (a row clips what it paints), placed from the
 * button's box and kept there while the page scrolls; OK or a tap anywhere else closes it.
 * @param {{ anchor: HTMLElement | null, onClose: () => void }} props
 */
export function DownVoteNote({ anchor, onClose }) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [pos, setPos] = React.useState(/** @type {{ top: number, left: number, below: boolean, caret: number } | null} */ (null));
  React.useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!anchor || !el || !anchor.isConnected) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const left = Math.max(8, Math.min(vw - w - 8, a.left + a.width / 2 - w / 2));
      const below = a.top - h - 10 < 8;
      const top = below ? a.bottom + 8 : a.top - h - 8;
      setPos({ top, left, below, caret: Math.max(14, Math.min(w - 14, a.left + a.width / 2 - left)) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [anchor]);
  React.useEffect(() => {
    /** @param {Event} e */
    const away = (e) => { if (ref.current && !ref.current.contains(/** @type {Node} */ (e.target))) onClose(); };
    /** @param {KeyboardEvent} e */
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    // The tap that opened the note is still being dispatched: listen from the next tick.
    const t = setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc); }, 0);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return ReactDOM.createPortal(
    <div ref={ref} className={'song-vote-note' + (pos && pos.below ? ' is-below' : '')} role="status"
      style={/** @type {any} */ (pos ? { top: pos.top + 'px', left: pos.left + 'px', '--caret-x': pos.caret + 'px' } : { visibility: 'hidden', top: 0, left: 0 })}>
      <p>Only you see this. We’ll play it less for you.</p>
      <button type="button" className="song-vote-note-ok" onClick={onClose}>OK</button>
    </div>,
    document.body
  );
}

/**
 * The pair. `size` 'large' is the song page's (32 px glyphs).
 * @param {{ song: any, title?: string, size?: 'row' | 'large', className?: string }} props
 */
export function SongVotePair({ song, title = '', size = 'row', className = '' }) {
  const id = song && song.id ? String(song.id) : '';
  const vote = useSongVote(id);
  const downRef = React.useRef(/** @type {HTMLButtonElement | null} */ (null));
  const [note, setNote] = React.useState(false);
  const closeNote = React.useCallback(() => setNote(false), []);
  if (!id) return null;
  const name = title || (song && song.t) || '';
  /** @param {Event} e */
  const stop = (e) => { e.stopPropagation(); };
  const up = (/** @type {any} */ e) => { stop(e); SongVotes.tap(id, 1); };
  const down = (/** @type {any} */ e) => {
    stop(e);
    const now = SongVotes.tap(id, -1);
    if (now === -1 && !SongVotes.downNoteSeen()) { SongVotes.markDownNoteSeen(); setNote(true); }
  };
  return (
    <span className={'song-vote-pair' + (size === 'large' ? ' is-large' : '') + (className ? ' ' + className : '')} role="group" aria-label={'Your vote on ' + name}>
      <button type="button" className={'song-vote song-vote-up' + (vote === 1 ? ' is-on' : '')} aria-pressed={vote === 1} aria-label={'Like ' + name} onClick={up}>
        <ThumbUpIcon filled={vote === 1} />
      </button>
      <button type="button" ref={downRef} className={'song-vote song-vote-down' + (vote === -1 ? ' is-on' : '')} aria-pressed={vote === -1} aria-label={'Not for me: ' + name} onClick={down}>
        <ThumbDownIcon filled={vote === -1} />
      </button>
      {note ? <DownVoteNote anchor={downRef.current} onClose={closeNote} /> : null}
    </span>
  );
}

/**
 * The song page's question and pair, centred above the seek bar.
 * @param {{ song: any, title?: string }} props
 */
export function SongVoteAsk({ song, title = '' }) {
  if (!song || !song.id) return null;
  return (
    <div className="song-vote-ask">
      <span className="song-vote-ask-q">Do you like this song?</span>
      <SongVotePair song={song} title={title} size="large" />
    </div>
  );
}
