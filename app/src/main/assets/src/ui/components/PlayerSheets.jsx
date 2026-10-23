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
                   the upcoming rows to drag or swipe away (with Undo), Clear
                   upcoming (with Undo), lengths and the time left

   Each is a bottom sheet over the player in the app's select-sheet grammar:
   the modal registry (Escape, Android Back), a focus trap, the handle. Like
   the player, a sheet is only a controller over the one AudioPlayer.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { secondsOf, lengthsReady, lengthsStore } from '../../utils/audio-lengths.js';
import { displayPartLabel, queuePlace } from '../../utils/audio-track.js';
import { AudioSpeedControl, AudioSpeedReadout } from './AudioSpeedControl.jsx';
import { ConfirmStrip } from './ConfirmStrip.jsx';
import { SheetHandle } from './SheetHandle.jsx';
import { TrackOnPhone } from './OfflineAudioControls.jsx';
import { PlayIcon, PauseIcon, chapterTitleOf } from './AudioShelf.jsx';

export { chapterTitleOf };
import { formatClock } from './AudioSeekSlider.jsx';
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
   expanders; the played rows fold under "Earlier (N)".
   Editing (pl-l2 L3): a row's grip drags it up or down (arrow keys on the grip
   move it one place, Delete removes it); a sideways swipe removes it, a red
   strip under it saying so; every removal and Clear upcoming says what went
   with an Undo for 5 s. Screen readers keep a Move earlier / Move later /
   Remove button per row. Rows carry their length ("Volume One · 6:12"), a
   Bible chapter its title, the head the time left in the queue. */

/** Above this many rows the window applies; below it the queue renders whole. */
const QUEUE_WINDOW_MIN = 80;
/** Rows past the current one, and the step each expander adds. */
const QUEUE_PAGE = 40;
/** How far a row slides sideways before letting go removes it. */
const SWIPE_REMOVE_PX = 96;
/** How long a removal's Undo stays. */
const UNDO_MS = 5000;

/** "3 h 10 min", "42 min", "under a minute". @param {number} seconds */
export function queueTime(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}

/**
 * A row's two lines: "Christmas, part 2" over "Volume One · 7:08"; a chapter "Genesis 3" over "The Fall · 4:40".
 * @param {any} track @returns {{ title: string, sub: string }}
 */
export function queueRowWords(track) {
  const part = typeof track.partLabel === 'string' ? track.partLabel : '';
  const n = part.match(/^Part (\d+)$/);
  const title = trackLabel(track.title) + (n && Number(n[1]) > 1 ? ', part ' + n[1] : '');
  const label = n ? '' : displayPartLabel(track.title, track.partLabel);
  const secs = secondsOf(track.url);
  const sub = [label, chapterTitleOf(track) || track.sub, secs ? formatClock(secs) : ''].filter(Boolean).join(' · ');
  return { title, sub };
}

/**
 * One upcoming (or played) row.
 * @param {{ track: any, index: number, qi: number, count: number, played: boolean, onRemove: (index: number) => void }} props
 */
function QueueRow({ track, index, qi, count, played, onRemove }) {
  const words = queueRowWords(track);
  const ref = React.useRef(/** @type {HTMLLIElement | null} */ (null));
  const drag = React.useRef(/** @type {null | { x: number, y: number, mode: 'grip' | 'swipe', id: number }} */ (null));
  const [shift, setShift] = React.useState({ x: 0, y: 0 });
  const canMoveUp = index > qi + 1;
  const canMoveDown = index < count - 1;
  const rowHeight = () => (ref.current && ref.current.getBoundingClientRect().height) || 64;
  const start = (/** @type {'grip'|'swipe'} */ mode) => (/** @type {any} */ e) => {
    if (played) return;
    if (mode === 'grip') e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_e) { /* a synthetic pointer */ }
    drag.current = { x: e.clientX, y: e.clientY, mode, id: e.pointerId };
  };
  const move = (/** @type {any} */ e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (d.mode === 'grip') setShift({ x: 0, y: e.clientY - d.y });
    else if (Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y) && Math.abs(e.clientX - d.x) > 8) setShift({ x: e.clientX - d.x, y: 0 });
  };
  const end = (/** @type {any} */ e) => {
    const d = drag.current;
    drag.current = null;
    setShift({ x: 0, y: 0 });
    if (!d || e.pointerId !== d.id) return;
    if (d.mode === 'grip') {
      const to = Math.max(qi + 1, Math.min(count - 1, index + Math.round((e.clientY - d.y) / rowHeight())));
      if (to !== index) AudioPlayer.moveUpcoming(index, to);
    } else if (Math.abs(e.clientX - d.x) >= SWIPE_REMOVE_PX) {
      onRemove(index);
    }
  };
  const cancel = () => { drag.current = null; setShift({ x: 0, y: 0 }); };
  const moving = shift.x || shift.y;
  return (
    <li ref={ref} className={(played ? 'is-played' : '') + (moving ? ' is-moving' : '') + (shift.y ? ' is-dragging' : '')}>
      {shift.x ? <span className={'np-row-remove' + (shift.x > 0 ? ' is-right' : '')} aria-hidden="true">Remove</span> : null}
      <div className="np-row" style={moving ? { transform: 'translate(' + shift.x + 'px,' + shift.y + 'px)' } : undefined}
        onPointerDown={played ? undefined : start('swipe')} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
        <button
          type="button"
          className="audio-manager-queue-main"
          onClick={() => { if (!moving) AudioPlayer.playAt(index); }}
          aria-label={(played ? 'Play again: ' : 'Play now: ') + words.title}
        >
          <span className="audio-manager-queue-number">{index + 1}</span>
          <span>
            <strong>{words.title}</strong>
            <small>{words.sub}<TrackOnPhone url={track.url} /></small>
          </span>
        </button>
        {played ? null : (
          <>
            <button type="button" className="np-grip" aria-label={'Reorder ' + words.title} aria-keyshortcuts="ArrowUp ArrowDown Delete"
              onPointerDown={start('grip')} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onRemove(index); return; }
                const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                if (by && index + by > qi && index + by < count) { e.preventDefault(); AudioPlayer.moveUpcoming(index, index + by); }
              }}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 8h14M5 12h14M5 16h14" /></svg>
            </button>
            {/* What a finger does by drag or swipe, as buttons a screen reader can reach. */}
            <span className="np-row-sr">
              <button type="button" className="sr-only" disabled={!canMoveUp} onClick={() => AudioPlayer.moveUpcoming(index, index - 1)} aria-label={'Move ' + words.title + ' earlier'} />
              <button type="button" className="sr-only" disabled={!canMoveDown} onClick={() => AudioPlayer.moveUpcoming(index, index + 1)} aria-label={'Move ' + words.title + ' later'} />
              <button type="button" className="sr-only" onClick={() => onRemove(index)} aria-label={'Remove ' + words.title + ' from queue'} />
            </span>
          </>
        )}
      </div>
    </li>
  );
}

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
  /** The last removal or Clear, with its way back, for UNDO_MS. */
  const [undo, setUndo] = React.useState(/** @type {{ text: string, act: () => void } | null} */ (null));
  React.useEffect(() => {
    if (!undo) return undefined;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);
  // The lengths are their own lazy table: asked for when the sheet opens, the rows re-render when it lands.
  React.useSyncExternalStore(lengthsStore.subscribe, lengthsStore.getVersion);
  React.useEffect(() => { void lengthsReady(); }, []);
  if (!current) return null;
  const restoring = !!state.restoring;
  const upcoming = queue.length - (state.qi + 1);
  const counted = queuePlace(queue, state.qi);
  const playing = state.status === 'playing' || state.status === 'loading';
  // Time left in the queue: the playing one's rest and every upcoming row's length, when all of them are known.
  let left = Math.max(0, (Number(state.duration) || secondsOf(current.url) || 0) - (Number(state.time) || 0));
  for (let i = state.qi + 1; i < queue.length && left >= 0; i++) { const s = secondsOf(queue[i].url); left = s ? left + s : -1; }
  const sub = restoring ? 'Resuming…'
    : [upcoming > 0 ? upcoming + ' left' : 'Nothing after this one', upcoming > 0 && left > 0 ? queueTime(left) : ''].filter(Boolean).join(' · ');
  const curLeft = Math.max(0, (Number(state.duration) || 0) - (Number(state.time) || 0));
  const windowed = queue.length > QUEUE_WINDOW_MIN;
  const to = windowed ? Math.min(queue.length, state.qi + 1 + QUEUE_PAGE + laterPages * QUEUE_PAGE) : queue.length;
  const playedFrom = windowed ? Math.max(0, state.qi - QUEUE_PAGE - earlierPages * QUEUE_PAGE) : 0;
  const remove = (/** @type {number} */ index) => {
    const track = queue[index];
    if (!track || !AudioPlayer.removeUpcoming(index)) return;
    setUndo({ text: 'Removed ' + queueRowWords(track).title, act: () => { AudioPlayer.insertUpcoming(index, track); } });
  };
  const clear = () => {
    const token = AudioPlayer.clearUpcomingWithUndo();
    if (token) setUndo({ text: 'Cleared ' + token.after.length + ' from Up next', act: () => { AudioPlayer.undoClearUpcoming(token); } });
  };
  /** @param {any} track @param {number} index */
  const row = (track, index) => (
    <QueueRow key={track.url + ':' + index} track={track} index={index} qi={state.qi} count={queue.length} played={index < state.qi} onRemove={remove} />
  );
  return (
    <PlayerSheet
      id="np-upnext" title="Up next" sub={sub} onClose={onClose} className="np-upnext-sheet audio-manager-queue"
      aside={upcoming > 0 && !restoring ? <button type="button" className="np-sheet-link" onClick={clear}>Clear upcoming</button> : null}
    >
      <div className="np-upnext-now" aria-current="true">
        <span className="np-upnext-now-copy">
          <strong>{queueRowWords(current).title}</strong>
          <small>{[restoring || counted.of < 2 ? null : counted.at + ' of ' + counted.of, current.sub, curLeft > 0 ? formatClock(curLeft) + ' left' : ''].filter(Boolean).join(' · ')}<TrackOnPhone url={current.url} /></small>
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
      {upcoming > 0 ? null : <p className="audio-manager-empty">Play a collection to line up more recordings, or choose Play next or Add to queue on any recording.</p>}
      {undo ? (
        <div className="np-undo" role="status">
          <span>{undo.text}</span>
          <button type="button" className="np-sheet-link" onClick={() => { undo.act(); setUndo(null); }}>Undo</button>
        </div>
      ) : null}
    </PlayerSheet>
  );
}
