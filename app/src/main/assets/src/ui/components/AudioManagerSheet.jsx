/*
   AudioManagerSheet — the expanded surface for the one AudioPlayer singleton.

   This is deliberately a controller, never a second player: all transport,
   queue edits, persistence, Media Session integration, and audio arbitration
   remain in utils/audio-player.js. The sheet only renders that public state.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_PLAYBACK_RATES } from '../../utils/audio-track.js';
import { SheetHandle } from './SheetHandle.jsx';

/** @param {number} seconds @returns {string} */
function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

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
  const trapRef = useFocusTrap(open);
  useModalRegistry({ id: 'audio-manager-sheet', dismiss: onClose, active: open });

  // AudioLibraryStore belongs to bundle-b. Resolve it at render time instead
  // of importing that bundle's source here, which would duplicate its singleton
  // when esbuild builds bundle-d.
  const library = libraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const previous = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = previous || null; };
  }, [open, onClose]);

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
  const maximum = Math.max(1, duration);
  const position = Math.min(maximum, Math.max(0, Math.floor(state.time || 0)));
  const playing = state.status === 'playing';
  const loading = state.status === 'loading';
  const active = playing || loading;
  const reader = AudioPlayer.readerLabel(current.readerCode);
  const saved = !!(library && typeof library.isSaved === 'function' && library.isSaved(current));
  const sleepSeconds = AudioPlayer.getSleepRemainingSeconds();
  const upcoming = queue.slice(state.qi + 1);

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
          <div className="audio-manager-track-copy">
            <h2 id="audio-manager-title">{trackLabel(current.title)}</h2>
            <p>
              {[current.sub, current.partLabel, reader].filter(Boolean).join(' · ') || 'The Volumes of Truth'}
            </p>
          </div>
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
          <input
            type="range"
            min={0}
            max={maximum}
            step={1}
            value={position}
            disabled={duration === 0}
            aria-label="Playback position"
            aria-valuetext={formatTime(state.time) + ' of ' + (duration ? formatTime(duration) : 'unknown length')}
            onChange={(event) => AudioPlayer.seek(Number(event.target.value))}
          />
          <div className="audio-manager-time"><span>{formatTime(state.time)}</span><span>{duration ? formatTime(duration) : '—'}</span></div>
        </div>

        <div className="audio-manager-transport" aria-label="Playback controls">
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.skip(-15)} aria-label="Back 15 seconds">−15</button>
          <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.prev()} disabled={queue.length < 2} aria-label="Previous track">
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
            <div className="audio-manager-tool-head"><span>Sleep timer</span><strong>{sleepLabel(sleepSeconds)}</strong></div>
            <div className="audio-manager-segment" role="group" aria-label="Sleep timer">
              {[15, 30, 60].map((minutes) => <button key={minutes} type="button" onClick={() => AudioPlayer.setSleepTimer(minutes)}>{minutes}m</button>)}
              <button type="button" disabled={!sleepSeconds} onClick={() => AudioPlayer.clearSleepTimer()}>Clear</button>
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
