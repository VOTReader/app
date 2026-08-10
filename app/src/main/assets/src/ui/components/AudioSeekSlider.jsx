/* ═══════════════════════════════════════════════════════════════════════
   AudioSeekSlider — the ONE scrubber (Cluster D, bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   Rendered by the mini-player bar and by the listening desk. Both used to
   carry their own `<input type="range">` wired straight to AudioPlayer.seek(),
   which meant every drag pixel committed a seek AND a durable-position write.
   With the per-recording positions store behind the player that is an IDB
   write storm, so the drag is now LOCAL and the seek lands ONCE, on release.

   How the release is detected without a native `change` listener: React's
   `onChange` for a range input IS the native `input` event — it fires per drag
   pixel and can't tell a drag from a keystroke. A pointer flag can:

     pointer is down  → the value is being dragged → preview only
     pointer is up    → keyboard, or a programmatic set → commit immediately

   so arrow keys / Home / End still seek the instant they are pressed (the a11y
   contract), and a pointer drag commits on pointerup. A cancelled gesture just
   drops the preview; the store's own position re-asserts itself.

   The played portion is painted by the track's own gradient, driven by the
   `--seek-pct` custom property this component sets inline. Custom properties
   inherit into ::-webkit-slider-runnable-track / ::-moz-range-track, which is
   what lets ONE inline number theme both engines' pseudo-elements.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';

/**
 * m:ss — floored, zero-padded seconds. Minutes are uncapped on purpose: a
 * 90-minute letter reads "90:00", not "1:30:00".
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const rest = total % 60;
  return Math.floor(total / 60) + ':' + (rest < 10 ? '0' : '') + rest;
}

/**
 * @param {{
 *   className: string,
 *   ariaLabel: string,
 *   time: number,
 *   duration: number,
 * }} props
 */
export function AudioSeekSlider({ className, ariaLabel, time, duration }) {
  /** Preview position while a finger is on the thumb; null = not scrubbing. */
  const [scrub, setScrub] = React.useState(/** @type {number | null} */ (null));
  const dragging = React.useRef(false);

  // A slider must never advertise max=0 while its value grows (the a11y defect
  // class already fixed once in JournalAudioBlock), so an unknown length is
  // floored at 1 and disabled — and painted EMPTY, because clamping a real
  // elapsed time into that floored max would show a full bar on a track that
  // has barely started.
  const dur = Math.max(0, Math.floor(Number(duration) || 0));
  const max = Math.max(1, dur);
  const pos = dur === 0 ? 0 : Math.min(max, Math.max(0, Math.floor(Number(time) || 0)));
  const shown = scrub == null ? pos : Math.max(0, Math.min(max, scrub));
  // The SPOKEN position stays the true clock when idle (an unknown length must
  // not make a screen reader announce 0:00 on a track two minutes in) and
  // follows the thumb while scrubbing.
  const spoken = scrub == null ? (Number(time) || 0) : shown;
  const pct = dur === 0 ? 0 : (shown / max) * 100;

  /** @param {number} value */
  const commit = (value) => {
    dragging.current = false;
    setScrub(null);
    AudioPlayer.seek(value);
  };

  return (
    <div className="audio-seek-wrap">
      <input
        type="range"
        className={className}
        min={0}
        max={max}
        step={1}
        value={shown}
        disabled={dur === 0}
        aria-label={ariaLabel}
        aria-valuetext={formatClock(spoken) + ' of ' + (dur ? formatClock(dur) : 'unknown length')}
        style={/** @type {any} */ ({ '--seek-pct': pct.toFixed(2) + '%' })}
        onPointerDown={() => { dragging.current = true; }}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (dragging.current) setScrub(value);
          else commit(value);
        }}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        /* Backstop for a release the element never sees: a range drag takes
           implicit pointer capture, so if the finger lifts off the control the
           capture is lost rather than a pointerup arriving here. Committing
           twice with the same value is harmless; a stuck preview is not. */
        onLostPointerCapture={(event) => { if (dragging.current) commit(Number(event.currentTarget.value)); }}
        onPointerCancel={() => { dragging.current = false; setScrub(null); }}
      />
      {scrub == null ? null : (
        <span
          className="audio-seek-bubble"
          /* Centre the bubble on the thumb: at 0% the thumb's centre sits half
             a thumb-width IN from the left edge, at 100% half a width in from
             the right — the linear correction below is the standard fix. */
          style={{ left: 'calc(' + pct.toFixed(2) + '% + ' + (7 - pct * 0.14).toFixed(2) + 'px)' }}
          aria-hidden="true"
        >
          {formatClock(shown)}
        </span>
      )}
    </div>
  );
}
