/* ═══════════════════════════════════════════════════════════════════════
   AudioSpeedControl — playback speed in 1 % steps (Cluster D, bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-09-21: "Audio player speed should be variable ... shouldn't be
   fixed at quarter speed jumps, should be by 1% increments." The full player's
   Speed sheet (pl-l2, picture 11) is ONE control with three ways in and ONE way
   out (AudioPlayer.setPlaybackRate, which retimes the element and persists to
   AudioLibraryStore.rate):

     AudioSpeedReadout  "1.37×" in the sheet's head; a button: tap = a number box
                        (Enter/blur commit, Esc cancel)
     chips              the AUDIO_PLAYBACK_RATES presets, one radio group
     −  /  +            1 % per press; held past 400 ms it repeats 12×/s

   The desk's slider went with the desk (brief 3b: three ways to set one thing
   was the problem, picture 06 of the 10-22 look); the 1 % stepper keeps
   Corbin's fine control, and a typed value reaches any speed in one go.
   Hold-repeat: pointerdown fires the first step and arms the timers; the
   button's click is honoured ONLY for keyboard activation (event.detail 0),
   otherwise a mouse press would step twice (pointerdown + click).
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_PLAYBACK_RATES, AUDIO_RATE_MAX, AUDIO_RATE_MIN, formatAudioRate } from '../../utils/audio-track.js';

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 80;
const PCT_MIN = Math.round(AUDIO_RATE_MIN * 100);
const PCT_MAX = Math.round(AUDIO_RATE_MAX * 100);

/** @param {number} pct */
const applyPct = (pct) => AudioPlayer.setPlaybackRate(Math.min(PCT_MAX, Math.max(PCT_MIN, pct)) / 100);

/**
 * The rate in the Speed sheet's head; tap it to type one.
 * @param {{ rate: number }} props  the player's current rate (state.rate)
 */
export function AudioSpeedReadout({ rate }) {
  /** Text in the number box while it is open; null = showing the readout. */
  const [typed, setTyped] = React.useState(/** @type {string | null} */ (null));
  // The number box opens EMPTY with the current rate as placeholder: Chrome
  // refuses selection APIs on type=number, so a pre-filled "1.5" made a typed
  // "3.5" read "1.535" (headless look, 2026-09-21). Empty = cancel.
  const commitTyped = () => {
    const n = Number(typed);
    if (typed !== '' && Number.isFinite(n) && n > 0) applyPct(Math.round(n * 100));
    setTyped(null);
  };
  return (
    <strong className="audio-speed-readout">
      {typed == null ? (
        <button type="button" aria-label="Speed, tap to type a value" onClick={() => setTyped('')}>
          {formatAudioRate(rate)}
        </button>
      ) : (
        <input
          type="number"
          inputMode="decimal"
          aria-label="Playback speed"
          min={AUDIO_RATE_MIN}
          max={AUDIO_RATE_MAX}
          step={0.01}
          value={typed}
          placeholder={String(Math.round(rate * 100) / 100)}
          autoFocus
          onChange={(event) => setTyped(event.target.value)}
          onBlur={commitTyped}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commitTyped(); }
            // W42: Escape cancels the typing only, never also closes the sheet around it.
            else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setTyped(null); }
          }}
        />
      )}
    </strong>
  );
}

/**
 * The presets and the 1 % stepper.
 * @param {{ rate: number }} props  the player's current rate (state.rate)
 */
export function AudioSpeedControl({ rate }) {
  const pct = Math.round(rate * 100);
  const hold = React.useRef(/** @type {{ t: any, i: any } | null} */ (null));

  const stopHold = () => {
    if (!hold.current) return;
    clearTimeout(hold.current.t);
    clearInterval(hold.current.i);
    hold.current = null;
  };
  React.useEffect(() => stopHold, []);

  /** @param {number} dir */
  const startHold = (dir) => {
    stopHold();
    // Read the LIVE rate each tick: the closure's `pct` is stale after the first step.
    const step = () => applyPct(Math.round(AudioPlayer.getState().rate * 100) + dir);
    step();
    const h = { t: 0, i: 0 };
    h.t = setTimeout(() => { h.i = setInterval(step, HOLD_REPEAT_MS); }, HOLD_DELAY_MS);
    hold.current = h;
  };

  /** @param {number} dir */
  const stepButton = (dir) => (
    <button
      type="button"
      className="audio-manager-round audio-speed-step"
      aria-label={(dir > 0 ? 'Faster' : 'Slower') + ' by 1 %'}
      disabled={dir > 0 ? pct >= PCT_MAX : pct <= PCT_MIN}
      onPointerDown={() => startHold(dir)}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
      onPointerLeave={stopHold}
      onClick={(event) => { if (event.detail === 0) applyPct(pct + dir); }}
    >{dir > 0 ? '+' : '−'}</button>
  );

  return (
    <div className="audio-speed">
      <div className="np-chips audio-speed-presets" role="radiogroup" aria-label="Playback speed presets">
        {AUDIO_PLAYBACK_RATES.map((preset) => {
          const on = Math.abs(rate - preset) < 0.005;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={on}
              className={on ? 'is-active' : ''}
              onClick={() => AudioPlayer.setPlaybackRate(preset)}
            >{formatAudioRate(preset)}</button>
          );
        })}
      </div>
      <div className="audio-speed-row">
        {stepButton(-1)}
        <span className="audio-speed-fine">Fine-tune by {'1\u00a0%'}</span>
        {stepButton(1)}
      </div>
    </div>
  );
}
