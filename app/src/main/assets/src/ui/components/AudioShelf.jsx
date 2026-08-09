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

/** AudioLibraryStore lives in bundle-b; resolved at call time, never imported. */
export function audioLibraryStore() { return /** @type {any} */ (globalThis).AudioLibraryStore || null; }

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
 * A text destination exists ONLY for a VOT collection track whose collection
 * actually declares a letter screen. Bible audiobooks have no letter screen,
 * and neither does Hidden Manna's absent index — without the letterScreen
 * half of this test the Text icon renders a tap that silently does nothing.
 *
 * @param {any} track
 * @returns {boolean}
 */
export function hasTextDestination(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider < 1 || divider >= key.length - 1) return false;
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

/** Points down at rest; `.is-open` rotates it in CSS, so no second glyph. */
export function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5l6 6 6-6" /></svg>;
}

/**
 * One saved-or-recent recording. `source` picks the trailing metadata only:
 * a recent row shows when it was played, a saved row shows its kept-ness.
 * (`key` is React's list identity — declared so mapped call sites typecheck.)
 *
 * @param {{ key?: any, track: any, source: 'saved' | 'recent', onOpenTrack?: (track: any) => void }} props
 */
export function AudioShelfRow({ track, source, onOpenTrack }) {
  const library = audioLibraryStore();
  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const isCurrent = !!(current && current.url === track.url);
  const rowPlaying = isCurrent && (state.status === 'playing' || state.status === 'loading');
  const isSaved = source === 'saved' || !!(library && typeof library.isSaved === 'function' && library.isSaved(track));
  const canOpenText = typeof onOpenTrack === 'function' && hasTextDestination(track);

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
        {source === 'recent'
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
      </div>
    </article>
  );
}
