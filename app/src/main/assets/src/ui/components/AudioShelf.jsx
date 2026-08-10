/* ═══════════════════════════════════════════════════════════════════════
   AudioShelf — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   Shared primitives for the three Listening Library surfaces (the hub, the
   saved shelf, and one source's recordings): the shelf iconography, the
   track-display helpers, and the ONE saved/recent row renderer both list
   surfaces render.

   The row owns no state and no subscription. AudioPlayer stays the single
   source of truth for transport, AudioLibraryStore for saved-ness, and the
   SCREEN owns both subscriptions — a row re-renders because its list did.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_RESUME_END_FRACTION } from '../../utils/audio-track.js';
import { formatClock } from './AudioSeekSlider.jsx';

/** AudioLibraryStore lives in bundle-b; resolved at call time, never imported. */
export function audioLibraryStore() { return /** @type {any} */ (globalThis).AudioLibraryStore || null; }

/** AudioPositionsStore — same bundle, same call-time bridge. */
export function audioPositionsStore() { return /** @type {any} */ (globalThis).AudioPositionsStore || null; }

/**
 * Re-render a listening surface when the per-recording positions change, so a
 * row's "left" figure is never a stale number from the last time it mounted.
 * A harness without bundle-b subscribes to nothing and renders no figures.
 *
 * @returns {void}
 */
export function useAudioPositions() {
  const store = audioPositionsStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => (store && typeof store.subscribe === 'function' ? store.subscribe(callback) : () => {}), [store]),
    React.useCallback(() => (store && typeof store.getVersion === 'function' ? store.getVersion() : 0), [store])
  );
}

/**
 * What the positions store has to say about one recording: "2:10 left", a
 * finished mark, or '' when it has nothing worth showing.
 *
 * A LENGTH IS REQUIRED. Without it "left" would be a guess, so a record whose
 * duration never arrived stays silent rather than inventing a number — the row
 * keeps whatever it showed before.
 *
 * @param {any} track - a Track-shaped object or its release URL
 * @returns {string}
 */
export function remainingLabel(track) {
  const store = audioPositionsStore();
  if (!store || typeof store.getPosition !== 'function') return '';
  const saved = store.getPosition(track);
  if (!saved || !(saved.d > 0) || !(saved.t > 0)) return '';
  // Same threshold the player refuses to resume past — a row must not promise
  // "0:04 left" for a tap that will restart the recording from the top.
  if (saved.t >= saved.d * AUDIO_RESUME_END_FRACTION) return 'Finished';
  return formatClock(saved.d - saved.t) + ' left';
}

/**
 * The same figure for a whole rendition — one row, but a multi-part letter is
 * several recordings. The FIRST remembered part is where the reader is: parts
 * played through to their end have their records deleted as they finish.
 *
 * @param {any[] | null | undefined} tracks
 * @returns {string}
 */
export function renditionRemainingLabel(tracks) {
  if (!Array.isArray(tracks)) return '';
  for (const track of tracks) {
    const label = remainingLabel(track);
    if (label) return label;
  }
  return '';
}

/** @param {any} track @returns {string} */
export function trackName(track) { return (track && track.title) || 'Untitled recording'; }

/** @param {any} track @returns {string} */
export function trackMeta(track) {
  return [track && track.sub, track && track.partLabel].filter(Boolean).join(' · ') || 'The Volumes of Truth';
}

/** @param {any} track @returns {string} */
export function trackSearchText(track) {
  return [trackName(track), track && track.sub, track && track.partLabel, track && track.readerCode]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

/** @param {number} stamp @returns {string} */
export function relativePlayedAt(stamp) {
  const delta = Math.max(0, Date.now() - (Number(stamp) || 0));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/**
 * A text destination exists for a VOT collection track whose collection
 * declares a letter screen, and (since the 2026-08-09 desk-title jump) for
 * any Bible-edition track — those open the playing book's chapter in the
 * reader. Hidden Manna's absent index and range compilations (key null)
 * still have none — without this test the Text icon / desk title renders a
 * tap that silently does nothing.
 *
 * @param {any} track
 * @returns {boolean}
 */
export function hasTextDestination(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider < 1 || divider >= key.length - 1) return false;
  if (key.indexOf('bible-') === 0) return true;
  if (typeof COL_BY_KEY === 'undefined') return false;
  const collection = COL_BY_KEY.get(key.slice(0, divider));
  return !!(collection && collection.letterScreen);
}

export function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7.2 4.4v15.2L19.4 12 7.2 4.4z" /></svg>;
}

export function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.6 4.5h4.2v15H6.6zM13.2 4.5h4.2v15h-4.2z" /></svg>;
}

export function StarIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.7l2.55 5.17 5.71.83-4.13 4.03.98 5.69L12 16.74l-5.11 2.68.98-5.69-4.13-4.03 5.71-.83L12 3.7z" /></svg>;
}

export function TextIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5h14v13H5z" /><path d="M8.5 9h7M8.5 12h7M8.5 15h4.5" /></svg>;
}

export function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="5.8" /><path d="M15.2 15.2L20 20" /></svg>;
}

export function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

export function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>;
}

/** Points down at rest; `.is-open` rotates it in CSS, so no second glyph. */
export function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5l6 6 6-6" /></svg>;
}

/**
 * One saved-or-recent recording. `source` picks the trailing metadata only:
 * a recent row shows when it was played, a saved row shows its kept-ness.
 * `onRemove` adds a per-row dismissal (the recent shelf's ×) — omitted where a
 * list has no per-row removal, so no dead control is rendered.
 * (`key` is React's list identity — declared so mapped call sites typecheck.)
 *
 * @param {{ key?: any, track: any, source: 'saved' | 'recent', onOpenTrack?: (track: any) => void, onRemove?: (track: any) => void }} props
 */
export function AudioShelfRow({ track, source, onOpenTrack, onRemove }) {
  const library = audioLibraryStore();
  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const isCurrent = !!(current && current.url === track.url);
  const rowPlaying = isCurrent && (state.status === 'playing' || state.status === 'loading');
  const isSaved = source === 'saved' || !!(library && typeof library.isSaved === 'function' && library.isSaved(track));
  const canOpenText = typeof onOpenTrack === 'function' && hasTextDestination(track);
  // Where the reader actually stands in this recording outranks when they last
  // touched it — but only when the store knows; otherwise the row is unchanged.
  const remaining = remainingLabel(track);

  return (
    <article className={'audio-library-row' + (isCurrent ? ' is-current' : '')}>
      <button
        type="button"
        className={'audio-library-row-play' + (rowPlaying ? ' is-playing' : '')}
        onClick={() => { if (isCurrent) AudioPlayer.toggle(); else AudioPlayer.playTrack(track); }}
        aria-label={(rowPlaying ? 'Pause ' : 'Play ') + trackName(track)}
        aria-pressed={rowPlaying}
      >
        {rowPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-library-row-copy">
        <strong>{trackName(track)}</strong>
        <small>{trackMeta(track)}</small>
      </div>
      <div className="audio-library-row-actions">
        {remaining
          ? <span className="audio-library-remaining" title={source === 'recent' ? relativePlayedAt(track.playedAt) : undefined}>{remaining}</span>
          : source === 'recent'
            ? <span title={new Date(track.playedAt).toLocaleString()}>{relativePlayedAt(track.playedAt)}</span>
            : <span>{isSaved ? 'Saved' : ''}</span>}
        {canOpenText ? <button type="button" className="audio-library-icon-button" onClick={() => onOpenTrack(track)} aria-label={'Open text for ' + trackName(track)} title="Open text"><TextIcon /></button> : null}
        <button
          type="button"
          className={'audio-library-icon-button audio-library-save-button' + (isSaved ? ' is-saved' : '')}
          onClick={() => library && library.toggleSaved(track)}
          aria-label={isSaved ? 'Remove ' + trackName(track) + ' from saved recordings' : 'Save ' + trackName(track)}
          aria-pressed={isSaved}
          title={isSaved ? 'Remove from saved recordings' : 'Save recording'}
        >
          <StarIcon filled={isSaved} />
        </button>
        {typeof onRemove === 'function' ? (
          <button
            type="button"
            className="audio-library-icon-button audio-library-remove-button"
            onClick={() => onRemove(track)}
            aria-label={'Remove ' + trackName(track) + ' from recently played'}
            title="Remove from recently played"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
    </article>
  );
}
