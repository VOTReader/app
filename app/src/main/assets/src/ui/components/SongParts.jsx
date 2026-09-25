/* ═══════════════════════════════════════════════════════════════════════
   SongParts — the small shared pieces of Songs of the Letters (bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   The cover, the round play button, the length clock, the icons and the
   select sheet every songs surface draws with. They live HERE, beside the
   player, because the mini-player bar and the listening desk (both in the
   always-mounted shell) draw a song with them too; the lazy Songs screens
   (bundle-h) read them as free globals, one copy of each.

   The build rules come from the approved pictures (calls/ai-music/mockups,
   "Build rules taken from the pictures"): covers with a radius and a gold
   hairline, a 44 px OUTLINED round ▶ that turns FILLED gold while its song
   plays, tokens only.
   ═══════════════════════════════════════════════════════════════════════ */

import { songThumbUrl, songById, familyById, SONGS_HOST } from '../../utils/song-catalog.js';
import { songIdOfKey } from '../../utils/audio-track.js';
import { PlayIcon, PauseIcon } from './AudioShelf.jsx';
import { SheetHandle } from './SheetHandle.jsx';

/**
 * A length in seconds as the pictures print it: 4:12 (1:02:05 past an hour).
 * @param {unknown} value @returns {string}
 */
export function songClock(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = (s < 10 ? '0' : '') + s;
  return h ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
}

/**
 * "1 song", "1,082 songs" — the count words every songs label uses.
 * @param {number} n @param {string} [one] @param {string} [many] @returns {string}
 */
export function songCountLabel(n, one = 'song', many = 'songs') {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count.toLocaleString('en-US') + ' ' + (count === 1 ? one : many);
}

/**
 * The id of the song the player holds now, or '' when it holds none.
 * @param {any} state the AudioPlayer state @returns {string}
 */
export function currentSongId(state) {
  const queue = state && Array.isArray(state.queue) ? state.queue : [];
  const cur = queue[state ? state.qi : 0];
  return cur && typeof cur.key === 'string' ? songIdOfKey(cur.key) || '' : '';
}

/** @param {any} state @returns {boolean} the player is sounding or about to */
export function playerIsActive(state) {
  return !!state && (state.status === 'playing' || state.status === 'loading');
}

/**
 * The letter a song or family was made from, when the catalog links it with
 * medium or high confidence (README §1.4; low is never shown): its key, its
 * title once the letters have loaded, and its collection's label.
 * @param {{ src?: { k?: string, id?: string, c?: string } } | null | undefined} item
 * @returns {{ key: string, title: string, colLabel: string } | null}
 */
export function songLetterOf(item) {
  const src = item && item.src;
  if (!src || src.k !== 'letter' || !src.id || (src.c !== 'h' && src.c !== 'm')) return null;
  const at = src.id.indexOf(':');
  if (at < 1) return null;
  const volKey = src.id.slice(0, at);
  const id = src.id.slice(at + 1);
  const reg = /** @type {any} */ (globalThis).COL_BY_KEY;
  const col = reg && typeof reg.get === 'function' ? reg.get(volKey) : null;
  const arrFn = /** @type {any} */ (globalThis).colLetterArr;
  const letters = col && typeof arrFn === 'function' ? arrFn(col) : [];
  const letter = Array.isArray(letters) ? letters.find((l) => l && l.id === id) : null;
  return { key: src.id, title: (letter && letter.title) || '', colLabel: (col && col.label) || '' };
}

/**
 * The song a family row speaks for: the version the player holds when it is
 * one of this family's, else the family's featured one.
 * @param {string} familyId @param {string} playingId @returns {boolean}
 */
export function familyIsPlaying(familyId, playingId) {
  const song = playingId ? songById(playingId) : null;
  return !!(song && song.f === familyId);
}

/** @param {any} song @returns {string} */
export function songFamilyTitle(song) {
  const fam = song ? familyById(song.f) : null;
  return (fam && fam.t) || (song && song.t) || '';
}

/**
 * A song's cover: the publisher's square thumb, over a ♪ tile that shows while
 * it loads, when it fails, and offline. Decorative (the row names the song).
 * @param {{ song: any, large?: boolean, className?: string }} props
 */
export function SongCover({ song, large = false, className = '' }) {
  const url = song ? songThumbUrl(song, large ? 512 : 256) : '';
  const [failed, setFailed] = React.useState('');
  return (
    <span className={'song-cover' + (className ? ' ' + className : '')} aria-hidden="true">
      <span className="song-cover-note">♪</span>
      {url && failed !== url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(url)} /> : null}
    </span>
  );
}

/**
 * The round ▶ at the right of a song row: 44 px, outlined, FILLED gold while
 * its song plays (then it pauses).
 * @param {{ playing: boolean, label: string, onClick: () => void, className?: string }} props
 */
export function SongPlayButton({ playing, label, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={'song-play' + (playing ? ' is-playing' : '') + (className ? ' ' + className : '')}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      aria-label={(playing ? 'Pause ' : 'Play ') + label}
      aria-pressed={playing}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

const ICON = { viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function ShuffleIcon() {
  return <svg {...ICON}><path d="M3.5 7h3.2c2.2 0 3.6 1 4.9 3l1.8 3c1.2 2 2.7 3 4.9 3h2.2M3.5 17h3.2c1.6 0 2.8-.5 3.8-1.6M14 8.6c1-1.1 2.2-1.6 3.8-1.6h2.7" /><path d="M18 4.5l2.5 2.5L18 9.5M18 14.5l2.5 2.5-2.5 2.5" /></svg>;
}

/** @param {{ one?: boolean }} props */
export function RepeatIcon({ one = false }) {
  return <svg {...ICON}><path d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H19M16.5 4.5L19 7l-2.5 2.5M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5M7.5 19.5L5 17l2.5-2.5" />{one ? <path d="M11.3 10.8l1.2-.8v4" strokeWidth="1.6" /> : null}</svg>;
}

export function NextIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6 5.2v13.6L15.6 12 6 5.2z" /><path d="M16.4 5.2h2.2v13.6h-2.2z" /></svg>;
}

export function PrevIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M18 5.2v13.6L8.4 12 18 5.2z" /><path d="M5.4 5.2h2.2v13.6H5.4z" /></svg>;
}

export function RecentIcon() {
  return <svg {...ICON}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7" /><path d="M12 8.2V12l2.6 1.8" /></svg>;
}

export function ChevronRightIcon() {
  return <svg {...ICON} strokeWidth={1.9}><path d="M9.5 6l6 6-6 6" /></svg>;
}

/**
 * A choice sheet in the app's select-sheet grammar (the Settings pickers):
 * the More styles under the hub's chips, and every version of a song in the
 * desk. `onChange` gets the chosen id; the sheet closes itself.
 * @param {{ title: string, eyebrow?: string, options: { id: string, label: string, meta?: string }[], value?: string, onChange: (id: string) => void, onClose: () => void }} props
 */
export function ChoiceSheet({ title, eyebrow, options, value, onChange, onClose }) {
  const sheetId = 'song-choice-' + React.useId();
  useModalRegistry({ id: sheetId, dismiss: onClose, active: true });
  const trapRef = useFocusTrap(true);
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);
  return (
    <>
      <div className="select-sheet-backdrop open" aria-hidden="true" onClick={onClose} />
      <div id={sheetId} className="select-sheet song-choice-sheet" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={sheetId + '-t'} onClick={(event) => event.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        {eyebrow ? <div className="select-sheet-eyebrow">{eyebrow}</div> : null}
        <div className="select-sheet-title" id={sheetId + '-t'}>{title}</div>
        <div className="select-sheet-options">
          {options.map((opt) => (
            <button key={opt.id} type="button" className={'select-sheet-option' + (opt.id === value ? ' selected' : '')} aria-pressed={opt.id === value} onClick={() => { onChange(opt.id); onClose(); }}>
              <div className="select-sheet-option-main">
                <span className="select-sheet-option-label">{opt.label}</span>
                {opt.meta ? <span className="select-sheet-option-meta">{opt.meta}</span> : null}
                {opt.id === value ? <span className="select-sheet-option-check">✓</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── lyrics (catalog-schema.md: lyrics/<id>.json, only when lyr > 0) ─────── */

const LYRICS_TIMEOUT_MS = 15000;
/** @type {Map<string, Promise<{ synced: boolean, lines: { t: string, s: number, e: number }[] } | null>>} */
const _lyrics = new Map();

/**
 * A song's lyrics, fetched once per launch and kept in memory (the service
 * worker keeps the file stale-while-revalidate in the PWA). Null when the song
 * has none, or the file cannot be read; a failure is forgotten so the next ask
 * tries again. Lines are validated; times are the publisher's own (no offset).
 * @param {any} song @returns {Promise<{ synced: boolean, lines: { t: string, s: number, e: number }[] } | null>}
 */
export function loadSongLyrics(song) {
  const id = song && typeof song.id === 'string' ? song.id : '';
  if (!id || !/^[0-9a-f]{12}$/.test(id) || !(song.lyr > 0)) return Promise.resolve(null);
  const known = _lyrics.get(id);
  if (known) return known;
  const run = (async () => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), LYRICS_TIMEOUT_MS) : null;
    try {
      const res = await fetch(SONGS_HOST.origin + '/songs/lyrics/' + id + '.json', { credentials: 'omit', signal: ctl ? ctl.signal : undefined });
      if (!res.ok) throw new Error('lyrics ' + res.status);
      const raw = await res.json();
      const lines = (Array.isArray(raw && raw.lines) ? raw.lines : [])
        .filter((l) => l && typeof l.t === 'string' && l.t.trim())
        .map((l) => ({ t: l.t.trim().slice(0, 400), s: Number(l.s) || 0, e: Number(l.e) || 0 }));
      if (!lines.length) return null;
      // A line is highlighted by its time ONLY when the dual-leg gate passed (lyr 2 = synced true).
      return { synced: raw.synced === true && song.lyr === 2, lines };
    } catch (_e) {
      _lyrics.delete(id);
      return null;
    } finally { if (timer) clearTimeout(timer); }
  })();
  _lyrics.set(id, run);
  return run;
}

/** Test seam. */
export function _resetSongLyricsForTests() { _lyrics.clear(); }

/**
 * The lyrics of a song as React state: undefined while loading, null when there are none.
 * @param {any} song
 */
export function useSongLyrics(song) {
  const id = song && song.id;
  const [state, setState] = React.useState(/** @type {any} */ ({ id: '', value: undefined }));
  React.useEffect(() => {
    let live = true;
    if (!song || !(song.lyr > 0)) { setState({ id, value: null }); return undefined; }
    setState({ id, value: undefined });
    loadSongLyrics(song).then((value) => { if (live) setState({ id, value }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return state.id === id ? state.value : undefined;
}

/**
 * The index of the line sung at `time` in synced lyrics, or -1 (before the
 * first line, or between lines longer than a breath).
 * @param {{ s: number, e: number }[]} lines @param {number} time @returns {number}
 */
export function lyricLineAt(lines, time) {
  let at = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].s <= time) at = i; else break; }
  if (at < 0) return -1;
  const next = lines[at + 1];
  const end = Math.max(lines[at].e, next ? Math.min(next.s, lines[at].e + 2) : lines[at].e + 2);
  return time < end ? at : -1;
}
