/*
   AudioManagerSheet — the expanded surface for the one AudioPlayer singleton.

   This is deliberately a controller, never a second player: all transport,
   queue edits, persistence, Media Session integration, and audio arbitration
   remain in utils/audio-player.js. The sheet only renders that public state.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_PLAYBACK_RATES } from '../../utils/audio-track.js';
import { AudioSeekSlider, formatClock as formatTime } from './AudioSeekSlider.jsx';
import { SheetHandle } from './SheetHandle.jsx';
import { hasTextDestination } from './AudioShelf.jsx';

/** @returns {any | null} */
function libraryStore() {
  return /** @type {any} */ (globalThis).AudioLibraryStore || null;
}

/** @param {string | null | undefined} value @returns {string} */
function trackLabel(value) { return value || 'Untitled recording'; }

/** @param {number} seconds @returns {string} */
function sleepLabel(seconds) {
  if (!seconds) return 'Off';
  const minutes = Math.ceil(seconds / 60);
  return minutes + ' min left';
}

/**
 * @param {{ open: boolean, state: import('../../utils/audio-player.js').AudioPlayerState, onClose: () => void }} props
 */
export function AudioManagerSheet({ open, state, onClose }) {
  // A sheet that will render nothing (no current track) must not claim the
  // modal registry or the close-sheet bridge — an invisible topmost modal
  // would swallow Escape/back. Hooks stay unconditional; only `active` and
  // the bridge effect gate on actually having something to show.
  const hasCurrent = !!(Array.isArray(state.queue) && state.queue[state.qi]);
  const renders = open && hasCurrent;
  const trapRef = useFocusTrap(renders);
  useModalRegistry({ id: 'audio-manager-sheet', dismiss: onClose, active: renders });

  // AudioLibraryStore belongs to bundle-b. Resolve it at render time instead
  // of importing that bundle's source here, which would duplicate its singleton
  // when esbuild builds bundle-d.
  const library = libraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );

  React.useEffect(() => {
    if (!renders || typeof window === 'undefined') return undefined;
    const previous = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = previous || null; };
  }, [renders, onClose]);

  // While paused, no playback tick re-renders the sheet — an armed sleep
  // timer would show a frozen countdown. One coarse tick keeps it honest.
  const [, forceSleepTick] = React.useReducer((n) => n + 1, 0);
  const sleepArmed = open && !!state.sleepEndsAt;
  React.useEffect(() => {
    if (!sleepArmed) return undefined;
    const timer = setInterval(forceSleepTick, 1000);
    return () => clearInterval(timer);
  }, [sleepArmed]);

  if (!open || typeof document === 'undefined') return null;

  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  if (!current) return null;

  const duration = Math.max(0, Math.floor(state.duration || 0));
  const playing = state.status === 'playing';
  const loading = state.status === 'loading';
  const active = playing || loading;
  const reader = AudioPlayer.readerLabel(current.readerCode);
  const saved = !!(library && typeof library.isSaved === 'function' && library.isSaved(current));
  const sleepSeconds = AudioPlayer.getSleepRemainingSeconds();
  const sleepAtEnd = !!state.sleepAtTrackEnd;
  const upcoming = queue.slice(state.qi + 1);
  // Mirrors the bar: a queue of one turns prev into a Restart rather than a
  // dead control, and the place-in-queue readout stays silent at 1 of 1.
  const single = queue.length < 2;
  const headLine = [
    current.sub,
    current.partLabel,
    reader,
    single ? null : (state.qi + 1) + ' of ' + queue.length,
  ].filter(Boolean).join(' · ') || 'The Volumes of Truth';

  return ReactDOM.createPortal(
    <>
      <div className="audio-manager-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        className="audio-manager-sheet"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <SheetHandle onClose={onClose} />
        <div className="audio-manager-kicker">Listening now</div>
        <div className="audio-manager-head">
          {/* Owner request 2026-08-09: tapping the letter/chapter title jumps
              to its TEXT in the reader — pure navigation through the
              __openAudioText bridge (screen-routes), so playback is never
              interrupted or restarted. Tracks with no destination (range
              compilations, Hidden Manna) keep the plain, untappable copy. */}
          {hasTextDestination(current) && typeof window !== 'undefined' && typeof window.__openAudioText === 'function' ? (
            <button
              type="button"
              className="audio-manager-track-copy audio-manager-jump"
              aria-label={'Open the text of ' + trackLabel(current.title) + ' — playback continues'}
              onClick={() => { window.__openAudioText(current); onClose(); }}
            >
              {/* '›' — the same go-to cue the home cards carry; marks the
                  title as the tap that opens the text. */}
              <h2 id="audio-manager-title">{trackLabel(current.title)} <span className="audio-manager-jump-chevron" aria-hidden="true">›</span></h2>
              <p>{headLine}</p>
            </button>
          ) : (
          <div className="audio-manager-track-copy">
            <h2 id="audio-manager-title">{trackLabel(current.title)}</h2>
            <p>{headLine}</p>
          </div>
          )}
          <button
            type="button"
            className={'audio-manager-save' + (saved ? ' is-saved' : '')}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved recordings' : 'Save recording'}
            onClick={() => { if (library && typeof library.toggleSaved === 'function') library.toggleSaved(current); }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.7l2.55 5.17 5.71.83-4.13 4.03.98 5.69L12 16.74l-5.11 2.68.98-5.69-4.13-4.03 5.71-.83L12 3.7z" />
            </svg>
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        <div className="audio-manager-progress">
          <AudioSeekSlider className="audio-manager-seek" ariaLabel="Playback position" time={state.time} duration={state.duration} />
          <div className="audio-manager-time"><span>{formatTime(state.time)}</span><span>{duration ? formatTime(duration) : '—'}</span></div>
        </div>

        <div className="audio-manager-transport" aria-label="Playback controls">
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.skip(-15)} aria-label="Back 15 seconds">−15</button>
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.prev()} aria-label={single ? 'Restart' : 'Previous track'}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /><path d="M19 5v14" /></svg>
          </button>
          <button
            type="button"
            className={'audio-manager-play' + (loading ? ' is-loading' : '')}
            onClick={() => AudioPlayer.toggle()}
            aria-label={active ? 'Pause' : 'Play'}
            aria-busy={loading}
          >
            {active ? <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.5 4h4v16h-4zM13.5 4h4v16h-4z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>}
          </button>
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.next()} disabled={state.qi + 1 >= queue.length} aria-label="Next track">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /><path d="M5 5v14" /></svg>
          </button>
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.skip(15)} aria-label="Forward 15 seconds">+15</button>
        </div>

        <div className="audio-manager-tools">
          <div className="audio-manager-tool">
            <div className="audio-manager-tool-head"><span>Speed</span><strong>{state.rate}×</strong></div>
            <div className="audio-manager-segment" role="radiogroup" aria-label="Playback speed">
              {AUDIO_PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  role="radio"
                  aria-checked={state.rate === rate}
                  className={state.rate === rate ? 'is-active' : ''}
                  onClick={() => AudioPlayer.setPlaybackRate(rate)}
                >{rate}×</button>
              ))}
            </div>
          </div>
          <div className="audio-manager-tool">
            <div className="audio-manager-tool-head"><span>Sleep timer</span><strong>{sleepAtEnd ? 'Ends after this track' : sleepLabel(sleepSeconds)}</strong></div>
            <div className="audio-manager-segment" role="group" aria-label="Sleep timer">
              {[15, 30, 60].map((minutes) => <button key={minutes} type="button" onClick={() => AudioPlayer.setSleepTimer(minutes)}>{minutes}m</button>)}
              {/* The one sleep mode a countdown can't express — it holds no
                  deadline, so the player reads it off the 'ended' event. */}
              <button
                type="button"
                className={sleepAtEnd ? 'is-active' : ''}
                aria-pressed={sleepAtEnd}
                onClick={() => AudioPlayer.setSleepAtTrackEnd()}
              >End of track</button>
              <button type="button" disabled={!sleepSeconds && !sleepAtEnd} onClick={() => AudioPlayer.clearSleepTimer()}>Clear</button>
            </div>
          </div>
        </div>

        <div className="audio-manager-queue">
          <div className="audio-manager-section-head">
            <div><span>Up next</span><strong>{upcoming.length ? upcoming.length + (upcoming.length === 1 ? ' recording' : ' recordings') : 'Nothing queued'}</strong></div>
            {upcoming.length ? <button type="button" onClick={() => AudioPlayer.clearUpcoming()}>Clear queue</button> : null}
          </div>
          {upcoming.length ? (
            <ol>
              {upcoming.map((track, offset) => {
                const index = state.qi + 1 + offset;
                const canMoveUp = index > state.qi + 1;
                const canMoveDown = index < queue.length - 1;
                return (
                  <li key={track.url + ':' + index}>
                    <button type="button" className="audio-manager-queue-main" onClick={() => AudioPlayer.playAt(index)} aria-label={'Play now: ' + trackLabel(track.title)}>
                      <span className="audio-manager-queue-number">{offset + 1}</span>
                      <span><strong>{trackLabel(track.title)}</strong><small>{[track.partLabel, track.sub].filter(Boolean).join(' · ')}</small></span>
                    </button>
                    <div className="audio-manager-queue-actions">
                      <button type="button" disabled={!canMoveUp} onClick={() => AudioPlayer.moveUpcoming(index, index - 1)} aria-label={'Move ' + trackLabel(track.title) + ' earlier'}>↑</button>
                      <button type="button" disabled={!canMoveDown} onClick={() => AudioPlayer.moveUpcoming(index, index + 1)} aria-label={'Move ' + trackLabel(track.title) + ' later'}>↓</button>
                      <button type="button" onClick={() => AudioPlayer.removeUpcoming(index)} aria-label={'Remove ' + trackLabel(track.title) + ' from queue'}>×</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="audio-manager-empty">Play a collection to line up more recordings. Your current recording will resume where you leave it.</p>}
        </div>
      </section>
    </>,
    document.body
  );
}
