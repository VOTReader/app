/* ═══════════════════════════════════════════════════════════════════════
   AudioPlayButton — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The entry points into streaming playback. Purely presentational — the
   caller owns the click (it builds the queue and hands it to AudioPlayer);
   these render the gold Cinzel affordance and nothing else.

   Three variants, one component because they differ only in text, glyph
   and box:
     'listen'  — letter / WTLB hero pill: "▶ Listen", or "▶ Resume · N min
                 left" when a Listen tap would pick the recording up part-way
                 (Corbin 2026-10-14, ra4, replacing the 2026-08-06 "always
                 exactly Listen"; the player bar carries the reader attribution)
     'playall' — collection index header pill ("Play All")
     'chip'    — the small per-section chips under a WTLB index

   HeroListen wraps the 'listen' pill in its hero row for the Bible screens:
   offline (Corbin 2026-10-05) a chapter whose recording is not on the phone
   gets a disabled pill and one calm line why (NetStatus via useSongsOnline).
   While its own chapter is the recording in the player it says what the audio
   is doing, Pause or Loading…, and its tap toggles that (U04.5, U10.2).
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_RESUME_END_FRACTION, AUDIO_RESUME_MIN_SEC } from '../../utils/audio-track.js';
import { useAudioPositions } from './AudioShelf.jsx';
import { useSongsOnline } from './SongKeepParts.jsx';
import { HeroDownload, NotOnPhone, useListenMinutes } from './OfflineAudioControls.jsx';

/**
 * The Listen pill's words when a tap would resume (ra4): "Resume · N min left", N the nearest whole minute
 * and never 0 (the approved mock: 3:11 left reads "3 min left"), or "Resume" alone when the recording's
 * length was never learned, because a guessed number would be worse than none.
 * @param {{ at: number, left: number }} resume
 * @returns {string}
 */
export function resumePillText(resume) {
  const left = Number(resume && resume.left) || 0;
  return left > 0 ? 'Resume · ' + Math.max(1, Math.round(left / 60)) + ' min left' : 'Resume';
}

/** About this long into a load a Listen pill owns up to it: "Still loading · Cancel" (U10.2, UX sweep 2026-10-22). */
export const STILL_LOADING_MS = 8000;

/**
 * True once `key` (the recording's url) has been loading for STILL_LOADING_MS. Another recording, or the end of
 * the load, starts the count again.
 * @param {boolean} loading @param {string} key @returns {boolean}
 */
export function useStillLoading(loading, key) {
  const [lateFor, setLateFor] = React.useState(/** @type {string | null} */ (null));
  React.useEffect(() => {
    if (!loading) { setLateFor(null); return undefined; }
    const t = setTimeout(() => setLateFor(key), STILL_LOADING_MS);
    return () => clearTimeout(t);
  }, [loading, key]);
  return loading && lateFor === key;
}

/**
 * The recording loaded and paused here as a resume, or null: the same thresholds as the player's own resume
 * (from AUDIO_RESUME_MIN_SEC in until AUDIO_RESUME_END_FRACTION of the way through).
 * @param {any} st the player's state @returns {{ at: number, left: number } | null}
 */
export function pausedHere(st) {
  const t = Number(st && st.time) || 0;
  const d = Number(st && st.duration) || 0;
  if (!st || st.status !== 'paused' || t < AUDIO_RESUME_MIN_SEC || (d > 0 && t >= d * AUDIO_RESUME_END_FRACTION)) return null;
  return { at: t, left: d > t ? d - t : 0 };
}

/**
 * What a Listen pill says for the recording it starts (U04.5, U10.2, UX sweep 2026-10-22: a pill read PAUSE at 0:00
 * for 20 to 30 s on a slow network). While that recording plays, Pause; while it loads, Loading… and, past
 * STILL_LOADING_MS, Still loading · Cancel (the tap pauses, which takes the start back); otherwise Resume · N min
 * left or Listen (Listen · 12 min once its length is known, player brief 3f). `pause` is the glyph and the pressed
 * state, `busy` the loading look.
 * @param {{ playing: boolean, loading: boolean, late: boolean, resume: { at: number, left: number } | null, minutes?: number | null }} s
 * @returns {{ text: string, label: string, pause: boolean, busy: boolean }}
 */
export function listenFace({ playing, loading, late, resume, minutes = null }) {
  if (playing) return { text: 'Pause', label: 'Pause the reading', pause: true, busy: false };
  if (loading && late) return { text: 'Still loading · Cancel', label: 'Still loading. Cancel', pause: true, busy: true };
  if (loading) return { text: 'Loading…', label: 'Loading the reading', pause: true, busy: true };
  const text = resume ? resumePillText(resume) : minutes ? 'Listen · ' + minutes + ' min' : 'Listen';
  return { text, label: text, pause: false, busy: false };
}

/**
 * @param {object} props
 * @param {'listen'|'playall'|'chip'} [props.variant]
 * @param {string} [props.label] chip text; on the pills, an aria-label override
 * @param {() => void} [props.onClick]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled] offline and nothing to play (HeroListen)
 * @param {{ at: number, left: number } | null} [props.resume] the 'listen' pill reads Resume · N min left
 * @param {{ text: string, label: string, pause: boolean, busy: boolean } | null} [props.face] the 'listen' pill's
 *   words and state while its recording is the one in the player (listenFace); it outranks `resume`
 * @param {number | null} [props.minutes] the 'listen' pill reads Listen · 12 min
 * @param {string|number} [props.key] list key — declared because this repo's
 *   `React` is a global `any`, so JSX adds no React.Attributes of its own and
 *   an undeclared `key=` fails `npm run typecheck`.
 */
export function AudioPlayButton({ variant = 'listen', label, onClick, className, disabled = false, resume = null, face = null, minutes = null }) {
  const chip = variant === 'chip';
  const playAll = variant === 'playall';
  const listen = chip || playAll ? null : face || listenFace({ playing: false, loading: false, late: false, resume, minutes });
  const text = chip ? (label || 'Play') : playAll ? 'Play All' : listen.text;

  return (
    <button
      type="button"
      className={(chip ? 'audio-sec-chip' : 'hero-play-pill') + (listen && listen.pause ? ' is-playing' : '')
        + (listen && listen.busy ? ' is-loading' : '') + (className ? ' ' + className : '')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={face ? face.pause : undefined}
      aria-busy={listen && listen.busy ? true : undefined}
      // A chip's visible text is the section name, so the accessible name says
      // what the tap DOES ("Play Part 3 · 40–59") while still containing the
      // visible label (WCAG 2.5.3). The pills already read as verbs.
      aria-label={chip ? 'Play ' + text : (label || (listen ? listen.label : text))}
    >
      {listen && listen.pause ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" />
        </svg>
      ) : playAll ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h11M4 12h11M4 18h7" />
          <path d="M16 13.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
      {/* RC.8: at large text "· N min left" drops (app.css .vot-large-text .pill-left), so Resume fits the phone. */}
      {text.startsWith('Resume · ')
        ? <span>Resume<span className="pill-left">{text.slice('Resume'.length)}</span></span>
        : <span>{text}</span>}
    </button>
  );
}

/**
 * The hero row's ▶ Listen for a Bible chapter or book. `canPlay` is asked on every render (and every NetStatus
 * change): false disables the pill and says why in one line. `resume` (ra4) is asked the same way, and on every
 * player or saved-place change: a place to pick up turns the pill into Resume · N min left. `here` (U04.5) asks
 * whether this chapter or book is the recording in the player: then the pill says Pause, Loading… or Resume from
 * the bar's own clock, and its tap toggles the player instead of starting the chapter again.
 * D4b (downloads brief 3a, 3j; pictures 15, 21): `tracks` (what the Listen plays) puts Listen · 4 min on the pill and
 * the download control beside it; offline and not on the phone, the pill reads "Not on this phone" with "Download
 * when online"; `alt` offers another edition's copy that IS on the phone ("Playing KJV · BRM, the copy on this phone").
 * @param {object} props
 * @param {() => void} props.onClick
 * @param {() => boolean} props.canPlay
 * @param {() => ({ at: number, left: number } | null)} [props.resume]
 * @param {() => boolean} [props.here]
 * @param {() => any[]} [props.tracks]
 * @param {string} [props.name] names a download ("Ruth · Chapter 1")
 * @param {() => ({ short: string, onClick: () => void } | null)} [props.alt]
 */
export function HeroListen({ onClick, canPlay, resume, here, tracks, name = '', alt }) {
  useSongsOnline();
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  useAudioPositions();
  const st = AudioPlayer.getState();
  const isHere = !!(st && st.status !== 'idle' && here && here());
  const cur = isHere && Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const playing = isHere && st.status === 'playing';
  const loading = isHere && st.status === 'loading';
  const late = useStillLoading(loading, (cur && cur.url) || '');
  const list = tracks ? tracks() : [];
  const minutes = useListenMinutes(list);
  // The recording already sounding here can always pause, offline or not.
  const off = !isHere && !canPlay();
  const other = off && alt ? alt() : null;
  if (off && !other) return <NotOnPhone tracks={list} name={name} />;
  const pickUp = off || playing || loading ? null : isHere ? pausedHere(st) : resume ? resume() : null;
  const face = isHere ? listenFace({ playing, loading, late, resume: pickUp, minutes }) : null;
  return (
    <>
      <div className="hero-play-row">
        <AudioPlayButton onClick={isHere ? () => AudioPlayer.toggle() : other ? other.onClick : onClick} resume={pickUp} face={face} minutes={minutes} />
        {list.length && !other ? <HeroDownload tracks={list} name={name} /> : null}
      </div>
      {other ? <p className="hero-alt-line">{'Playing ' + other.short + ', the copy on this phone'}</p> : null}
    </>
  );
}

/**
 * Everything a Bible chapter's (or, without `chapterNum`, a book's) HeroListen asks, from its edition: the edition's
 * own chapter recording, and offline another offered edition's copy of the chapter on the phone (brief 3j).
 * @param {{ volKey: string, label: string }} bibleAudio
 * @param {{ id: string, title?: string }} book
 * @param {number} [chapterNum]
 */
export function bibleHero(bibleAudio, book, chapterNum) {
  const at = { volKey: bibleAudio.volKey, bookId: book.id, chapterNum };
  const chapterOf = (/** @type {string} */ volKey) => (AudioPlayer.renditionsFor(volKey, { id: book.id }, null)[0] || { tracks: [] }).tracks
    .filter((/** @type {any} */ t) => AudioPlayer.bibleChapterOfTrack(t) === chapterNum);
  return {
    onClick: () => AudioPlayer.playBibleBook({ ...at, label: bibleAudio.label }),
    canPlay: () => AudioPlayer.playableNow(bibleAudio.volKey, book.id, chapterNum),
    resume: () => AudioPlayer.listenResume(at),
    here: () => AudioPlayer.listenHere(at),
    // A book's Listen is the whole book: no Download beside it (a book downloads from its row or the Downloads tree).
    tracks: () => (chapterNum ? chapterOf(bibleAudio.volKey) : []),
    name: (book.title || book.id) + (chapterNum ? ' · Chapter ' + chapterNum : ''),
    alt: () => {
      if (!chapterNum) return null;
      const eds = typeof BIBLE_AUDIO_EDITIONS !== 'undefined' ? Object.values(BIBLE_AUDIO_EDITIONS) : [];
      const ed = eds.find((e) => e && e.volKey !== bibleAudio.volKey && !e.unreleased && AudioPlayer.hasAudio(e.volKey, book.id)
        && AudioPlayer.playableNow(e.volKey, book.id, chapterNum) && chapterOf(e.volKey).length > 0);
      return ed ? { short: ed.short || ed.label, onClick: () => AudioPlayer.playBibleBook({ volKey: ed.volKey, bookId: book.id, label: ed.label, chapterNum }) } : null;
    },
  };
}

/**
 * The compilation chips under a WTLB index header.
 * @param {object} props
 * @param {Array<Array<string>>} [props.sections] [label, id, reader] triples
 * @param {(index: number) => void} props.onPlay
 */
export function AudioSectionChips({ sections, onPlay }) {
  if (!sections || !sections.length) return null;
  return (
    <div className="audio-sec-chips">
      {sections.map((s, i) => (
        <AudioPlayButton key={s[1] || i} variant="chip" label={s[0]} onClick={() => onPlay(i)} />
      ))}
    </div>
  );
}
