/* ═══════════════════════════════════════════════════════════════════════
   PlayerSheets — the full player's small sheets (player brief 3b/3c, pl-l2;
   pictures 10-13 in D:/Swarm/calls/player-mockups/). Cluster D, beside
   AudioManagerSheet, which opens one at a time from its bottom row:

     SpeedSheet    the presets and the 1 % stepper (AudioSpeedControl)
     SleepSheet    15/30/45/60 min, end of this recording, end of the queue,
                   Custom, Off; the head counts down
     VoiceSheet    the readers (or Bible editions) of this recording as radio
                   rows; "Use this voice" switches, keeping Up next
     UpNextSheet   the whole queue: the playing row pinned with its own
                   Play/Pause and Next, played rows folded under "Earlier (N)",
                   the upcoming rows to reorder or remove, Clear upcoming

   Each is a bottom sheet over the player in the app's select-sheet grammar:
   the modal registry (Escape, Android Back), a focus trap, the handle. Like
   the player, a sheet is only a controller over the one AudioPlayer.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { displayPartLabel, queuePlace } from '../../utils/audio-track.js';
import { AudioSpeedControl, AudioSpeedReadout } from './AudioSpeedControl.jsx';
import { ConfirmStrip } from './ConfirmStrip.jsx';
import { SheetHandle } from './SheetHandle.jsx';
import { TrackOnPhone } from './OfflineAudioControls.jsx';
import { PlayIcon, PauseIcon } from './AudioShelf.jsx';
import { NextIcon } from './SongParts.jsx';

/** @param {string | null | undefined} value @returns {string} */
function trackLabel(value) { return value || 'Untitled recording'; }

/** "14:52" for a countdown. @param {number} seconds */
function countdown(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/**
 * One sheet over the player.
 * @param {{ id: string, title: string, sub?: string, aside?: any, onClose: () => void, className?: string, children: any }} props
 */
export function PlayerSheet({ id, title, sub, aside, onClose, className = '', children }) {
  useModalRegistry({ id, dismiss: onClose, active: true });
  const trapRef = useFocusTrap(true);
  // The tour and Android Back close the sheet on top through this bridge; the player hands it back on close.
  React.useEffect(() => {
    const prev = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = prev || null; };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <>
      <div className="np-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        className={'np-sheet ' + className}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id + '-title'}
        onClick={(event) => event.stopPropagation()}
      >
        <SheetHandle onClose={onClose} />
        <div className="np-sheet-head">
          <div className="np-sheet-titles">
            <h2 className="np-sheet-title" id={id + '-title'}>{title}</h2>
            {sub ? <p className="np-sheet-sub">{sub}</p> : null}
          </div>
          {aside}
        </div>
        {children}
      </section>
    </>,
    document.body
  );
}

/** @param {{ rate: number, onClose: () => void }} props */
export function SpeedSheet({ rate, onClose }) {
  return (
    <PlayerSheet id="np-speed" title="Speed" aside={<AudioSpeedReadout rate={rate} />} onClose={onClose} className="np-speed-sheet">
      <AudioSpeedControl rate={rate} />
      <p className="np-sheet-note">Applies to letters and chapters. Songs always play at 1×.</p>
      <button type="button" className="np-sheet-done" onClick={onClose}>Done</button>
    </PlayerSheet>
  );
}

/** Custom sleep: the stepper's bounds and step, in minutes (setSleepTimer takes 1-120). */
const CUSTOM_MIN = 5;
const CUSTOM_MAX = 120;
const CUSTOM_STEP = 5;

/**
 * @param {{ state: any, noun: string, onClose: () => void }} props noun names what "End of this …" ends: letter,
 *   chapter, recording or song
 */
export function SleepSheet({ state, noun, onClose }) {
  // Paused, no playback tick re-renders the sheet: one coarse tick keeps the countdown honest.
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    if (!state.sleepEndsAt) return undefined;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.sleepEndsAt]);
  const [custom, setCustom] = React.useState(/** @type {number | null} */ (null));
  const left = AudioPlayer.getSleepRemainingSeconds();
  const preset = [15, 30, 45, 60];
  // A countdown armed at a length no chip names is the Custom one.
  const customArmed = !!state.sleepEndsAt && preset.indexOf(state.sleepMinutes) < 0;
  const status = state.sleepAtTrackEnd ? 'Stops after this ' + noun
    : state.sleepAtQueueEnd ? 'Stops at the end of the queue'
      : left > 0 ? 'Stops in ' + countdown(left) : '';
  const off = !state.sleepEndsAt && !state.sleepAtTrackEnd && !state.sleepAtQueueEnd;
  /** @param {string} label @param {boolean} on @param {() => void} act @param {string} [cls] */
  const chip = (label, on, act, cls = '') => (
    <button type="button" className={(on ? 'is-active ' : '') + cls} aria-pressed={on} onClick={act}>{label}</button>
  );
  return (
    <PlayerSheet
      id="np-sleep" title="Sleep timer" onClose={onClose} className="np-sleep-sheet"
      aside={status ? <span className="np-sheet-status" role="status">{status}</span> : <span className="np-sheet-status" role="status" />}
    >
      <div className="np-grid" role="group" aria-label="Sleep timer">
        {preset.map((m) => chip(m + ' min', !customArmed && state.sleepMinutes === m, () => { setCustom(null); AudioPlayer.setSleepTimer(m); }))}
        {chip('End of this ' + noun, !!state.sleepAtTrackEnd, () => { setCustom(null); AudioPlayer.setSleepAtTrackEnd(); })}
        {chip('End of the queue', !!state.sleepAtQueueEnd, () => { setCustom(null); AudioPlayer.setSleepAtQueueEnd(); })}
        {chip(customArmed ? 'Custom · ' + state.sleepMinutes + ' min' : 'Custom…', customArmed || custom != null,
          () => setCustom(customArmed ? state.sleepMinutes : 20))}
        {chip('Off', off, () => { setCustom(null); AudioPlayer.clearSleepTimer(); })}
      </div>
      {custom != null ? (
        <div className="np-custom">
          <button type="button" className="audio-manager-round" aria-label="5 minutes less" disabled={custom <= CUSTOM_MIN}
            onClick={() => setCustom(Math.max(CUSTOM_MIN, custom - CUSTOM_STEP))}>−</button>
          <span className="np-custom-value" aria-live="polite">{custom} min</span>
          <button type="button" className="audio-manager-round" aria-label="5 minutes more" disabled={custom >= CUSTOM_MAX}
            onClick={() => setCustom(Math.min(CUSTOM_MAX, custom + CUSTOM_STEP))}>+</button>
          <button type="button" className="np-custom-go" onClick={() => { AudioPlayer.setSleepTimer(custom); setCustom(null); }}>Start</button>
        </div>
      ) : null}
      <p className="np-sheet-note">The voice fades out over the last 20 seconds. When it stops, you can keep listening for 15 minutes more.</p>
    </PlayerSheet>
  );
}

/**
 * @param {{ voices: { kind: 'reader'|'edition', chips: Array<{ id: string, label: string, active: boolean, select: () => void, swap: () => boolean }> },
 *   title: string, needsConfirm: boolean, single: boolean, onClose: () => void }} props
 */
export function VoiceSheet({ voices, title, needsConfirm, single, onClose }) {
  const active = voices.chips.find((c) => c.active);
  const [picked, setPicked] = React.useState(active ? active.id : '');
  const [confirming, setConfirming] = React.useState(false);
  const chip = voices.chips.find((c) => c.id === picked) || null;
  const edition = voices.kind === 'edition';
  const use = () => {
    // The voice already playing switches nothing: a rebuild would start the letter again from its top (sweep v003).
    if (!chip || chip.active) { onClose(); return; }
    // A queue the listener made switches IN PLACE and keeps its shape; only when that cannot be done does the
    // rebuild, which would drop the edits, ask first. Plain queues rebuild to themselves.
    if (!needsConfirm) { chip.select(); onClose(); return; }
    if (chip.swap()) { onClose(); return; }
    setConfirming(true);
  };
  return (
    <PlayerSheet id="np-voice" title={edition ? 'Edition' : 'Voice'} sub={title} onClose={onClose} className="np-voice-sheet">
      <div className="np-radios" role="radiogroup" aria-label={edition ? 'Recorded edition for this chapter' : 'Reader for this recording'}>
        {voices.chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === picked}
            className={'np-radio' + (c.id === picked ? ' is-active' : '')}
            onClick={() => { setPicked(c.id); setConfirming(false); }}
          >
            <span className="np-radio-dot" aria-hidden="true" />
            <span className="np-radio-copy">
              <strong>{c.label}</strong>
              <small>{c.active ? 'Playing now' : edition ? 'Recorded edition' : /text-to-speech/i.test(c.label) ? 'A computer voice' : 'A recorded reading'}</small>
            </span>
          </button>
        ))}
      </div>
      {confirming && chip && !chip.active ? (
        <ConfirmStrip
          className="audio-manager-voice-confirm"
          question={single
            ? 'Switching voice rebuilds this into a full queue. Continue?'
            : 'Switching voice rebuilds this queue and drops your changes to it. Continue?'}
          yesLabel="Yes, switch"
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); chip.select(); onClose(); }}
        />
      ) : (
        <p className="np-sheet-note">{edition
          ? 'Starts this chapter again in the edition you pick. Your Up next stays.'
          : 'Starts this recording again in the voice you pick. Your Up next stays.'}</p>
      )}
      <button type="button" className="np-sheet-go" onClick={use}>{edition ? 'Use this edition' : 'Use this voice'}</button>
    </PlayerSheet>
  );
}

/* ── Up next (brief 3c, picture 10) ──────────────────────────────────────
   The queue as a picker (owner directive 2026-08-09): the WHOLE queue, so a
   played chapter can be picked again. A whole Bible edition queues 1,189
   chapters, and 1,189 rows of DOM is a real cost for a sheet that opens on a
   phone, so a long queue renders a WINDOW of upcoming rows with "Show more"
   expanders; the played rows fold under "Earlier (N)". */

/** Above this many rows the window applies; below it the queue renders whole. */
const QUEUE_WINDOW_MIN = 80;
/** Rows past the current one, and the step each expander adds. */
const QUEUE_PAGE = 40;

/** @param {{ state: any, onClose: () => void }} props */
export function UpNextSheet({ state, onClose }) {
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const [earlier, setEarlier] = React.useState(false);
  const [laterPages, setLaterPages] = React.useState(0);
  const [earlierPages, setEarlierPages] = React.useState(0);
  // What an expander did, announced politely. Rendered EMPTY and always present: a live region created together
  // with its content announces nothing.
  const [note, setNote] = React.useState('');
  if (!current) return null;
  const restoring = !!state.restoring;
  const upcoming = queue.length - (state.qi + 1);
  const counted = queuePlace(queue, state.qi);
  const playing = state.status === 'playing' || state.status === 'loading';
  const sub = restoring ? 'Resuming…' : upcoming > 0 ? upcoming + ' left' : 'Nothing after this one';
  const windowed = queue.length > QUEUE_WINDOW_MIN;
  const to = windowed ? Math.min(queue.length, state.qi + 1 + QUEUE_PAGE + laterPages * QUEUE_PAGE) : queue.length;
  const playedFrom = windowed ? Math.max(0, state.qi - QUEUE_PAGE - earlierPages * QUEUE_PAGE) : 0;
  /** @param {any} track @param {number} index */
  const row = (track, index) => {
    const played = index < state.qi;
    const canMoveUp = index > state.qi + 1;
    const canMoveDown = index < queue.length - 1;
    return (
      <li key={track.url + ':' + index} className={played ? 'is-played' : ''}>
        <button
          type="button"
          className="audio-manager-queue-main"
          onClick={() => AudioPlayer.playAt(index)}
          aria-label={(played ? 'Play again: ' : 'Play now: ') + trackLabel(track.title)}
        >
          <span className="audio-manager-queue-number">{index + 1}</span>
          <span>
            <strong>{trackLabel(track.title)}</strong>
            <small>{[displayPartLabel(track.title, track.partLabel), track.sub].filter(Boolean).join(' · ')}<TrackOnPhone url={track.url} /></small>
          </span>
        </button>
        {played ? null : (
          <div className="audio-manager-queue-actions">
            <button type="button" disabled={!canMoveUp} onClick={() => AudioPlayer.moveUpcoming(index, index - 1)} aria-label={'Move ' + trackLabel(track.title) + ' earlier'}>↑</button>
            <button type="button" disabled={!canMoveDown} onClick={() => AudioPlayer.moveUpcoming(index, index + 1)} aria-label={'Move ' + trackLabel(track.title) + ' later'}>↓</button>
            <button type="button" onClick={() => AudioPlayer.removeUpcoming(index)} aria-label={'Remove ' + trackLabel(track.title) + ' from queue'}>×</button>
          </div>
        )}
      </li>
    );
  };
  return (
    <PlayerSheet
      id="np-upnext" title="Up next" sub={sub} onClose={onClose} className="np-upnext-sheet audio-manager-queue"
      aside={upcoming > 0 && !restoring ? <button type="button" className="np-sheet-link" onClick={() => AudioPlayer.clearUpcoming()}>Clear upcoming</button> : null}
    >
      <div className="np-upnext-now" aria-current="true">
        <span className="np-upnext-now-copy">
          <strong>{trackLabel(current.title)}</strong>
          <small>{[restoring || counted.of < 2 ? null : counted.at + ' of ' + counted.of, current.sub].filter(Boolean).join(' · ')}<TrackOnPhone url={current.url} /></small>
        </span>
        <button type="button" className="audio-manager-round np-upnext-play" onClick={() => AudioPlayer.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.next()} disabled={!restoring && upcoming < 1} aria-label="Next track">
          <NextIcon />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{note}</p>
      {state.qi > 0 ? (
        <button type="button" className="np-upnext-earlier" aria-expanded={earlier} onClick={() => setEarlier(!earlier)}>
          Earlier ({state.qi}) <span aria-hidden="true">{earlier ? '⌄' : '›'}</span>
        </button>
      ) : null}
      {earlier && state.qi > 0 ? (
        <>
          {playedFrom > 0 ? (
            <button type="button" className="audio-manager-queue-page" onClick={() => {
              setEarlierPages((n) => n + 1);
              setNote('Showing ' + (state.qi - Math.max(0, playedFrom - QUEUE_PAGE)) + ' earlier recordings.');
            }}>{'Show ' + Math.min(QUEUE_PAGE, playedFrom) + ' earlier'}</button>
          ) : null}
          <ol className="np-upnext-played">{queue.slice(playedFrom, state.qi).map((t, i) => row(t, playedFrom + i))}</ol>
        </>
      ) : null}
      <ol className="np-upnext-list">{queue.slice(state.qi + 1, to).map((t, i) => row(t, state.qi + 1 + i))}</ol>
      {to < queue.length ? (
        <button type="button" className="audio-manager-queue-page" onClick={() => {
          setLaterPages((n) => n + 1);
          setNote('Showing ' + (Math.min(queue.length, to + QUEUE_PAGE) - state.qi - 1) + ' of ' + upcoming + ' upcoming recordings.');
        }}>{'Show ' + Math.min(QUEUE_PAGE, queue.length - to) + ' later'}</button>
      ) : null}
      {upcoming > 0 ? null : <p className="audio-manager-empty">Play a collection to line up more recordings. Your current recording will resume where you leave it.</p>}
    </PlayerSheet>
  );
}
