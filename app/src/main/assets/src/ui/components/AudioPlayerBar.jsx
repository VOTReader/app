/* ═══════════════════════════════════════════════════════════════════════
   AudioPlayerBar — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE app-wide mini-player: one fixed bar docked at the bottom, mounted
   once (AppShellOverlays) and self-subscribing — no props, no owner, no
   state threaded through App(). It reads the AudioPlayer store through
   useSyncExternalStore (same contract as StorageHealthBanner), so a time
   tick re-renders this bar and nothing else.

   Renders NOTHING when the store is idle, which is the normal state: the
   bar exists only while a letter is actually streaming. While it IS on
   screen the body carries `audio-bar-open`, which is how the reading
   surface (.screen-scroll) and the auto-scroll transport reserve room for
   it — see the AUDIO PLAYER section of app.css.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioManagerSheet } from './AudioManagerSheet.jsx';
import { AudioSeekSlider, formatClock as fmt } from './AudioSeekSlider.jsx';

export function AudioPlayerBar() {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const st = AudioPlayer.getState();
  const open = st.status !== 'idle';
  const [managerOpen, setManagerOpen] = React.useState(false);

  // The one side effect this component owns. Kept above the early return so
  // the hook order is stable, and it removes the class on unmount as well as
  // on idle — a stale `audio-bar-open` would leave every screen padded for a
  // bar that isn't there.
  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    document.body.classList.toggle('audio-bar-open', open);
    return () => document.body.classList.remove('audio-bar-open');
  }, [open]);

  // Closing playback also closes its controller. It avoids leaving a modal
  // mounted around an intentionally discarded queue when stop() is invoked
  // from a headset, a native callback, or the mini-player's close control.
  React.useEffect(() => {
    if (!open) setManagerOpen(false);
  }, [open]);

  if (!open) return null;

  const queue = st.queue || [];
  /** @type {Partial<import('../../utils/audio-player.js').Track>} */
  const track = queue[st.qi] || {};
  const reader = AudioPlayer.readerLabel(track.readerCode);
  // Buffering is an ACTIVE session: toggle() on a loading element pauses it,
  // so the button must promise Pause — the same rule AudioManagerSheet
  // applies. Splitting them told a screen reader the opposite of the truth
  // for the whole cold start.
  const active = st.status === 'playing' || st.status === 'loading';

  // Only the CLOCK is read here now; the range input's floor/clamp/paint rules
  // live in AudioSeekSlider, shared with the listening desk.
  const dur = Math.max(0, Math.floor(st.duration || 0));

  return (
    <>
    <div className="audio-bar" role="region" aria-label="Audio player">
      {/* Pull-tab joined to the bar's top edge — the visible "there's more
          here" handle. Redundant with the labeled summary button below, so
          it stays out of the tab order and the accessibility tree. */}
      <button
        type="button"
        className="audio-bar-pull"
        onClick={() => setManagerOpen(true)}
        tabIndex={-1}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 14.5l6-5.5 6 5.5" />
        </svg>
      </button>
      <button
        type="button"
        className={'audio-bar-play' + (st.status === 'loading' ? ' is-loading' : '')}
        onClick={() => AudioPlayer.toggle()}
        aria-label={active ? 'Pause' : 'Play'}
        aria-busy={st.status === 'loading'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {active
            ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            : <path d="M6 3v18l16-9z" />}
        </svg>
      </button>

      <div className="audio-bar-main">
        <button
          type="button"
          className="audio-bar-summary"
          onClick={() => setManagerOpen(true)}
          aria-label="Open listening controls"
          aria-expanded={managerOpen}
        >
          <span className="audio-bar-summary-text">
            <span className="audio-bar-title">
              {track.title || ''}
              {track.partLabel ? <span className="audio-bar-part">{' · ' + track.partLabel}</span> : null}
            </span>
            <span className="audio-bar-sub">
              <span className="audio-bar-src">{(track.sub || '') + (reader ? ' · ' + reader : '')}</span>
              {/* Until metadata lands the total is unknown, not 0:00. */}
              <span className="audio-bar-time">{dur ? fmt(st.time) + ' / ' + fmt(dur) : fmt(st.time)}</span>
            </span>
          </span>
        </button>
        <AudioSeekSlider className="audio-bar-seek" ariaLabel="Seek" time={st.time} duration={st.duration} />
      </div>

      {queue.length > 1 && (
        <>
          <button type="button" className="audio-bar-nav" onClick={() => AudioPlayer.prev()} aria-label="Previous track">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="audio-bar-nav" onClick={() => AudioPlayer.next()} aria-label="Next track">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <button type="button" className="audio-bar-close" onClick={() => AudioPlayer.stop()} aria-label="Close player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
    <AudioManagerSheet open={managerOpen} state={st} onClose={() => setManagerOpen(false)} />
    </>
  );
}
