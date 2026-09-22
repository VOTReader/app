/* ═══════════════════════════════════════════════════════════════════════
   AudioSpeedControl — playback speed in 1 % steps (Cluster D, bundle-d)
   ═══════════════════════════════════════════════════════════════════════
   Corbin 2026-09-21: "Audio player speed should be variable ... shouldn't be
   fixed at quarter speed jumps, should be by 1% increments." One tool on the
   listening desk, four ways in, ONE way out (AudioPlayer.setPlaybackRate,
   which retimes the element and persists to AudioLibraryStore.rate):

     readout  "1.37×"  a button; tap = a number box (Enter/blur commit, Esc cancel)
     −  /  +           1 % per press; held past 400 ms it repeats 12×/s
     slider            native <input type="range" min=50 max=300 step=1>: the
                       slider role, arrows = 1 %, Home/End, valuetext, and 250
                       steps on a 300 px track = 1 px per step, snap-free by
                       construction. Shift+arrow = 5 % is the one keydown we add.
     chips             the AUDIO_PLAYBACK_RATES presets, kept as shortcuts

   The slider works in integer PERCENT so the browser never rounds a float
   step; the rate is percent / 100, and normalizeAudioRate clamps the domain.
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
 * @param {{ rate: number }} props  the player's current rate (state.rate)
 */
export function AudioSpeedControl({ rate }) {
  const pct = Math.round(rate * 100);
  /** Text in the number box while it is open; null = showing the readout. */
  const [typed, setTyped] = React.useState(/** @type {string | null} */ (null));
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

  // The number box opens EMPTY with the current rate as placeholder: Chrome
  // refuses selection APIs on type=number, so a pre-filled "1.5" made a typed
  // "3.5" read "1.535" (headless look, 2026-09-21). Empty = cancel.
  const commitTyped = () => {
    const n = Number(typed);
    if (typed !== '' && Number.isFinite(n) && n > 0) applyPct(Math.round(n * 100));
    setTyped(null);
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
    <div className="audio-manager-tool audio-speed">
      <div className="audio-manager-tool-head">
        <span>Speed</span>
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
                else if (event.key === 'Escape') { event.preventDefault(); setTyped(null); }
              }}
            />
          )}
        </strong>
      </div>
      <div className="audio-speed-row">
        {stepButton(-1)}
        <input
          type="range"
          className="audio-manager-seek audio-speed-slider"
          aria-label="Playback speed"
          min={PCT_MIN}
          max={PCT_MAX}
          step={1}
          value={pct}
          aria-valuetext={formatAudioRate(rate)}
          style={/** @type {any} */ ({ '--seek-pct': (((pct - PCT_MIN) / (PCT_MAX - PCT_MIN)) * 100).toFixed(2) + '%' })}
          onChange={(event) => applyPct(Number(event.target.value))}
          onKeyDown={(event) => {
            if (!event.shiftKey) return;
            const dir = (event.key === 'ArrowUp' || event.key === 'ArrowRight') ? 1
              : (event.key === 'ArrowDown' || event.key === 'ArrowLeft') ? -1 : 0;
            if (!dir) return;
            event.preventDefault();
            applyPct(pct + dir * 5);
          }}
        />
        {stepButton(1)}
      </div>
      <div className="audio-manager-segment" role="radiogroup" aria-label="Playback speed presets">
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
    </div>
  );
}
