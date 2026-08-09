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

/**
 * m:ss — floored, zero-padded seconds. Minutes are uncapped on purpose:
 * a 90-minute letter reads "90:00", not "1:30:00".
 * @param {number} s
 * @returns {string}
 */
function fmt(s) {
  const t = Math.max(0, Math.floor(s || 0));
  const sec = t % 60;
  return Math.floor(t / 60) + ':' + (sec < 10 ? '0' : '') + sec;
}

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
  const playing = st.status === 'playing';

  // A slider must never advertise max=0 while its value grows — the same
  // a11y defect class already fixed once in JournalAudioBlock. Duration is 0
  // until metadata lands, so the range is floored at 1 and disabled instead.
  const dur = Math.max(0, Math.floor(st.duration || 0));
  const max = Math.max(1, dur);
  const pos = Math.min(max, Math.max(0, Math.floor(st.time || 0)));

  return (
    <>
    <div className="audio-bar" role="region" aria-label="Audio player">
      <button
        type="button"
        className={'audio-bar-play' + (st.status === 'loading' ? ' is-loading' : '')}
        onClick={() => AudioPlayer.toggle()}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-busy={st.status === 'loading'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {playing
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
              <span className="audio-bar-time">{fmt(st.time) + ' / ' + fmt(st.duration)}</span>
            </span>
          </span>
          {/* Disclosure cue: the title area opens the listening desk. */}
          <svg className="audio-bar-more" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 14.5l5-5 5 5" />
          </svg>
        </button>
        <input
          type="range"
          className="audio-bar-seek"
          min={0}
          max={max}
          step={1}
          value={pos}
          disabled={dur === 0}
          aria-label="Seek"
          aria-valuetext={fmt(st.time) + ' of ' + (dur ? fmt(dur) : 'unknown length')}
          onChange={(e) => AudioPlayer.seek(+e.target.value)}
        />
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
