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
   screen the body carries `audio-bar-open`, and :root carries the bar's
   measured height (--audio-bar-h), which is how the reading surface
   (.screen-scroll) and every control docked above it reserve room for it —
   see the AUDIO PLAYER section of app.css.

   The shape is the player brief's (2026-10-22, 3a and 3g; pictures
   D:/Swarm/calls/player-mockups/01-04): 64 px at 100% text, a 3 px progress
   line for a top edge, a type mark (the cover for a song, a book for the
   rest), the title and one line under it, then Back 15 / Play / Close for
   spoken word and Play / Next / Close for a song. No seek, previous or pull
   tab on the bar: seeking lives in the listening controls the bar opens.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioPlayer } from '../../utils/audio-player.js';
import { displayPartLabel, queuePlace, queuePlaceOnPhone, songIdOfKey } from '../../utils/audio-track.js';
import { songById } from '../../utils/song-catalog.js';
import { showUndoToast } from '../../utils/toast.js';
import { SongCover, NextIcon } from './SongParts.jsx';
import { useSongsOnline } from './SongKeepParts.jsx';
import { SongKeep } from '../../utils/song-keep.js';
import { OfflineAudio } from '../../utils/offline-audio.js';
import { PlayIcon, PauseIcon } from './AudioShelf.jsx';
import { AudioManagerSheet } from './AudioManagerSheet.jsx';
import { useStillLoading } from './AudioPlayButton.jsx';
import { formatClock as fmt } from './AudioSeekSlider.jsx';

/**
 * Offline, the player plays a unit of the queue when some reading of it is on the phone (playableNow, the rule its
 * offline skip and _downloadedReading follow); a unit with no key plays when its own file is.
 * @param {any[]} unit @returns {boolean}
 */
function unitOnPhone(unit) {
  const t = unit[0];
  const key = t && typeof t.key === 'string' ? t.key : '';
  const cut = key.indexOf(':');
  if (cut < 1) return unit.every((x) => OfflineAudio.isSaved(x.url));
  return AudioPlayer.playableNow(key.slice(0, cut), key.slice(cut + 1), AudioPlayer.bibleChapterOfTrack(t) || undefined);
}

export const STOPPED_TOAST_ID = 'vot-toast-audio-stopped';
/** How long Close's "Stopped · Undo" stays up (brief 3a). */
const UNDO_MS = 5000;

/**
 * A screen where audio does not play (Corbin 2026-10-22 23:5x: "Audio should not play in those two screens", the
 * Garden and the Scripture Web): entering it pauses the player where it is. The bar hides over it (app.css cz5) and
 * is back on leaving, paused at the same spot, one tap from resuming; nothing resumes by itself.
 */
export function useNoAudioHere() {
  React.useEffect(() => { AudioPlayer.pauseIfPlaying(); }, []);
}

/**
 * Close (brief 3a): stop now, and say so with an Undo for 5 s that brings the session back where it was. Toasts
 * share one spot, and this one carries an action, so any other toast up steps aside.
 */
function closeWithUndo() {
  const token = AudioPlayer.stopWithUndo();
  if (!token) return;
  undoToast(STOPPED_TOAST_ID, 'Stopped', 'Undo', () => AudioPlayer.undoStop(token));
}

export const SKIPPED_TOAST_ID = 'vot-toast-audio-skipped';

/**
 * A 5 s toast whose one button puts things back. Toasts share one spot, and this one carries an action, so any
 * other toast up steps aside.
 * @param {string} id @param {string} text @param {string} label @param {() => void} onUndo
 */
function undoToast(id, text, label, onUndo) {
  showUndoToast(id, text, onUndo, { label, durationMs: UNDO_MS });
}

/**
 * The bar's swipe left / right (brief 3a): the next or previous item, as the full player's buttons do, with a 5 s
 * "Back to Christmas 3:25" that returns to the item and the place it left. Nothing after the last item: the swipe
 * does nothing rather than end the session (Close is the way to end it, and has its own Undo).
 * @param {1 | -1} dir @returns {boolean} whether it moved
 */
export function skipWithUndo(dir) {
  const st = AudioPlayer.getState();
  const queue = st.queue || [];
  const from = queue[st.qi];
  if (!from || st.restoring || st.status === 'idle') return false;
  const qi = st.qi;
  const at = Math.max(0, Number(st.time) || 0);
  if (dir > 0 && qi + 1 >= queue.length && !(songIdOfKey(from.key) && st.repeat === 'all')) return false;
  if (dir < 0 && qi === 0 && at < 1) return false;
  if (dir > 0) AudioPlayer.next(); else AudioPlayer.prev();
  const now = AudioPlayer.getState();
  const moved = now.qi !== qi || (now.queue || [])[qi] !== from;
  // Refused (offline, nothing on the phone that way): the player said why, and nothing moved.
  if (now.status === 'idle' || (dir > 0 && !moved)) return false;
  const name = (from.title || 'the last one');
  undoToast(SKIPPED_TOAST_ID, moved ? (dir > 0 ? 'Skipped' : 'Went back') : 'Started over', 'Back to ' + name + '\u00a0' + fmt(at), () => {
    const s = AudioPlayer.getState();
    const q = s.queue || [];
    const i = q[qi] === from ? qi : q.findIndex((t) => t && t.url === from.url && t.key === from.key);
    if (i < 0) return;
    if (i === s.qi) AudioPlayer.seek(at);
    else AudioPlayer.playAt(i, at > 0 ? at : undefined);
  });
  return true;
}

/** A light tick under the finger as a swipe lands: the phone's own haptic on the APK, a 10 ms buzz on the web. */
function tick() {
  try {
    if (typeof PlatformBridge !== 'undefined' && PlatformBridge.isAndroid) PlatformBridge.haptic(0);
    else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
  } catch (_e) { /* no haptics here */ }
}

/** Past this a touch is a swipe, not a tap; past SWIPE_PX (or a quick flick past FLICK_PX) the swipe acts. */
const SLOP_PX = 10;
const SWIPE_PX = 64;
const FLICK_PX = 24;
/** A click this soon after a swipe ends is the swipe's own, never a tap. */
const SWIPE_CLICK_MS = 400;

/** "12 min left", or "0:42 left" under a minute. */
function timeLeft(time, dur) {
  const left = Math.max(0, dur - (Number(time) || 0));
  return left < 60 ? fmt(left) + ' left' : Math.round(left / 60) + ' min left';
}

/** The rate as the speed sheet writes it: "1.5×", "0.85×". */
function rateLabel(rate) {
  return String(Math.round(rate * 100) / 100) + '×';
}

function BookMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5.8c3.2-1.1 6.2-.8 9 1.1 2.8-1.9 5.8-2.2 9-1.1v12.6c-3.2-1.1-6.2-.8-9 1.1-2.8-1.9-5.8-2.2-9-1.1z" />
      <path d="M12 6.9v12.6" />
    </svg>
  );
}

function Back15Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 4.1A8.4 8.4 0 1 1 4.3 9" />
      <path d="M13.9 1.7L11.4 4.1l2.5 2.4" />
      <text x="12.4" y="16" textAnchor="middle" fontSize="7.6" fill="currentColor" stroke="none">15</text>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="audio-bar-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 4.5a7.5 7.5 0 1 1-7.1 5.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function AudioPlayerBar() {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  // The song skin says "Not on this phone" the moment the signal goes (and stops when it returns): the player only
  // re-renders the bar on its own events, so the bar listens for online/offline itself. It also re-reads the keep
  // store, so a song kept while it plays stops saying so.
  const online = useSongsOnline();
  React.useSyncExternalStore(SongKeep.subscribe, SongKeep.getVersion);
  const st = AudioPlayer.getState();
  const open = st.status !== 'idle';
  const [managerOpen, setManagerOpen] = React.useState(false);
  const barRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  // Swipes on the bar (brief 3a), each with a button that does the same: left / right = Next / Previous (the full
  // player's), down = Close, up = open the player (the bar's tap). A swipe's own click never counts as a tap.
  const drag = React.useRef(/** @type {{ id: number, x: number, y: number, t: number, axis: string | null } | null} */ (null));
  // When the last swipe ended: only the click that lands right after it is the swipe's own. A flag kept until the
  // next click ate the next keyboard Enter on the bar when a swipe ended with no click at all (S22, pl-l2b).
  const swipedAt = React.useRef(0);
  const settle = () => {
    const el = barRef.current;
    if (!el) return;
    el.classList.remove('is-dragging');
    el.style.transform = '';
    el.style.opacity = '';
  };
  const onPointerDown = (/** @type {any} */ e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), axis: null };
    swipedAt.current = 0;
  };
  const onPointerMove = (/** @type {any} */ e) => {
    const d = drag.current;
    const el = barRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      try { el.setPointerCapture(e.pointerId); } catch (_e) { /* a synthetic pointer has nothing to capture */ }
      el.classList.add('is-dragging');
    }
    if (d.axis === 'x') el.style.transform = 'translateX(' + Math.round(dx * 0.6) + 'px)';
    else {
      el.style.transform = 'translateY(' + Math.round(dy > 0 ? dy : dy * 0.25) + 'px)';
      el.style.opacity = dy > 0 ? String(Math.max(0.4, 1 - dy / 200)) : '';
    }
  };
  const onPointerUp = (/** @type {any} */ e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    settle();
    if (!d.axis) return;
    swipedAt.current = Date.now();
    const dist = d.axis === 'x' ? e.clientX - d.x : e.clientY - d.y;
    const far = Math.abs(dist) >= SWIPE_PX || (Math.abs(dist) >= FLICK_PX && Math.abs(dist) / Math.max(1, Date.now() - d.t) > 0.5);
    if (!far) return;
    if (d.axis === 'x') { if (skipWithUndo(dist < 0 ? 1 : -1)) tick(); }
    else if (dist > 0) closeWithUndo();
    else setManagerOpen(true);
  };
  const onPointerCancel = () => { drag.current = null; settle(); };
  const onClickCapture = (/** @type {any} */ e) => {
    if (!swipedAt.current || Date.now() - swipedAt.current > SWIPE_CLICK_MS) return;
    swipedAt.current = 0;
    e.stopPropagation();
    e.preventDefault();
  };

  // The one side effect this component owns. Kept above the early return so
  // the hook order is stable, and it removes the class on unmount as well as
  // on idle — a stale `audio-bar-open` would leave every screen padded for a
  // bar that isn't there.
  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    document.body.classList.toggle('audio-bar-open', open);
    return () => document.body.classList.remove('audio-bar-open');
  }, [open]);

  // The bar grows with Text size (brief 3a), so the dock reads its real height rather than a constant: the rows
  // above it (pills, toasts, the reading text's end) stand on it. The system inset under it is the dock floor's,
  // not the bar's, so the bottom padding's share of it comes off.
  React.useLayoutEffect(() => {
    const el = barRef.current;
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (!open || !el || !root) return undefined;
    const measure = () => {
      const cs = getComputedStyle(el);
      const sys = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.paddingTop) || 0));
      const h = Math.round(el.getBoundingClientRect().height - sys);
      if (h > 0) root.style.setProperty('--audio-bar-h', h + 'px');
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); root.style.removeProperty('--audio-bar-h'); };
  }, [open]);

  // Closing playback also closes its controller. It avoids leaving a modal
  // mounted around an intentionally discarded queue when stop() is invoked
  // from a headset, a native callback, or the mini-player's close control.
  React.useEffect(() => {
    if (!open) setManagerOpen(false);
  }, [open]);

  // U10.2 (UX sweep 2026-10-22): a recording that has not started yet (no length, the clock still at its start)
  // says Loading… on line 2, and Still loading past STILL_LOADING_MS (8 s, brief 3g) with Cancel beside it: on a
  // slow network the bar read 0:00 beside a Pause for 20 to 30 s. A stall mid-recording keeps the clock. A hook, so
  // above the early return.
  const head = (st.queue || [])[st.qi];
  const starting = st.status === 'loading' && !(st.duration > 0) && !((Number(st.time) || 0) >= 1);
  const lateStart = useStillLoading(starting, (head && head.url) || '');

  if (!open) return null;

  const queue = st.queue || [];
  /** @type {Partial<import('../../utils/audio-player.js').Track>} */
  const track = queue[st.qi] || {};
  const part = displayPartLabel(track.title, track.partLabel);
  // A WTLB compilation reads 19-31 letters from one file: the letter under the
  // clock takes the title line and the section label moves beside it
  // (2026-09-22). Null for a keyed track, during the file intro, and until the
  // registry lands — the section label then titles the bar as before.
  const live = AudioPlayer.liveLetter();
  const liveTitle = live && live.title ? live.title : null;
  // The player continues into the next collection by itself (w-audio-continue, 2026-09-11); for the
  // FIRST track after a crossing the title names the collection — "Volume Two · Solo Letter" — so the
  // reader is informed rather than surprised, no toast and no confirm. Every other track keeps its plain
  // title (the sub line names the collection on all of them). Read off the previous queue item, so it
  // holds with the page follower off; after a restart the rebuilt queue starts at this track (qi 0) and
  // the title is plain again — harmless, the crossing is behind the reader by then.
  const before = st.qi > 0 ? queue[st.qi - 1] : null;
  const crossed = !!(before && track.sub && before.sub !== track.sub);
  // Buffering is an ACTIVE session: toggle() on a loading element pauses it,
  // so the button must promise Pause — the same rule AudioManagerSheet
  // applies. Splitting them told a screen reader the opposite of the truth
  // for the whole cold start.
  const active = st.status === 'playing' || st.status === 'loading';
  const dur = Math.max(0, Math.floor(st.duration || 0));
  const pct = dur ? Math.min(100, Math.max(0, (st.time / dur) * 100)) : 0;
  // A boot-restored bar is NOT a queue of one: its single track is a placeholder
  // for a queue rebuilt on the first tap, maybe a whole book (sweep v021).
  const restoring = !!st.restoring;
  const single = !restoring && queue.length < 2;
  // Place in the QUEUE, not in the book: "3 of 30". Derived, never stored — and
  // silent at 1 of 1, which is noise, not news, and while restoring, when the
  // queue's length is not known yet.
  // With no signal the player passes over what is not on the phone (downloads brief 3j, picture 17): the place counts
  // what it will play, and line 2 says how many it skips.
  const onPhone = !online && !restoring && !single && !songIdOfKey(track.key) ? queuePlaceOnPhone(queue, st.qi, unitOnPhone) : null;
  const counted = onPhone && onPhone.skipped && onPhone.at ? onPhone : queuePlace(queue, st.qi);
  const place = single || restoring || counted.of < 2 ? null : counted.at + ' of ' + counted.of;
  const skippedLine = onPhone && onPhone.skipped && onPhone.at ? 'Skipped ' + onPhone.skipped + ' not on this phone' : null;
  // Why the last start failed (brief 3g), while the bar sits paused on it. Offline (player brief 3g): nothing ahead of
  // it is on the phone either, or it was the last one.
  const failed = st.status === 'paused' ? st.failed : null;
  const failLine = failed === 'offline' ? (st.qi < queue.length - 1 ? 'Nothing ahead is on this phone' : 'Not on this phone')
    : failed === 'signal' ? 'No signal. Your place is kept.' : failed ? 'Couldn’t load' : null;
  const left = dur && !starting ? timeLeft(st.time, dur) : null;
  // Sleep and speed chips (brief 3a: a small moon "15m" when sleep is set, "1.5×" when speed isn't 1×).
  const sleepSec = st.sleepEndsAt ? AudioPlayer.getSleepRemainingSeconds() : 0;
  const sleepChip = st.sleepAtTrackEnd || st.sleepAtQueueEnd ? 'End' : sleepSec > 0 ? Math.max(1, Math.ceil(sleepSec / 60)) + 'm' : null;
  const speedChip = st.rate && st.rate !== 1 ? rateLabel(st.rate) : null;

  const songId = songIdOfKey(track.key);
  const song = songId ? songById(songId) : null;
  // Offline and NOT kept on this phone (K1): a kept song plays with no signal and says nothing of it.
  const songOffline = !!songId && !online && !active && !SongKeep.isKept(songId);

  const title = songId
    ? (track.title || '')
    : (crossed ? track.sub + ' · ' : '') + (liveTitle || track.title || '');
  // Silent when it would only repeat the title: a per-chapter Bible track is
  // titled "Genesis 2" AND labelled "Chapter 2" (see displayPartLabel).
  const titlePart = songId ? null : liveTitle ? track.title || null : part;

  /** @type {string} */
  let line2;
  let lineClass = '';
  if (st.loop) {
    // REPEAT THIS PASSAGE (rp1 part 3): which and how far, in gold.
    line2 = 'Repeating ' + (st.loop.label || 'this passage') + ' · ' + st.loop.pass + ' of ' + st.loop.times;
    lineClass = ' is-loop';
  } else if (failLine) {
    line2 = failLine;
    lineClass = ' is-failed';
  } else if (starting) {
    line2 = restoring ? 'Resuming…' : lateStart ? 'Still loading' : 'Loading…';
  } else if (songOffline) {
    line2 = 'Not on this phone';
    lineClass = ' is-offline';
  } else if (restoring) {
    line2 = 'Resume · ' + fmt(st.time) + (dur ? ' of ' + fmt(dur) : '');
  } else if (songId) {
    line2 = [track.partLabel || 'Songs of the Letters', sleepChip || speedChip ? null : left].filter(Boolean).join(' · ');
  } else {
    // With a sleep or speed chip beside it, line 2 keeps the source and its place and gives up the time left
    // (picture 02, "Sleep and speed set"): the full player has the clock.
    line2 = [track.sub, place, skippedLine || (sleepChip || speedChip ? null : left)].filter(Boolean).join(' · ');
  }

  const segs = line2.split(' · ');

  // s13.1: the summary says what is playing, as the bar shows it, then what it opens.
  const summaryLabel = (st.status === 'playing' ? 'Now playing ' : st.status === 'loading' ? 'Loading ' : 'Paused on ') + [
    title + (titlePart ? ', ' + titlePart : ''),
    songId ? 'Songs of the Letters' : track.sub,
    !starting && dur ? fmt(st.time) + ' of ' + fmt(dur) : null,
    failLine ? failLine.replace(/\.$/, '') : null,
    sleepChip ? (sleepChip === 'End' ? 'sleep at the end of this recording' : 'sleep in ' + sleepChip.slice(0, -1) + ' min') : null,
    speedChip ? 'speed ' + speedChip : null,
  ].filter(Boolean).join(', ') + '. Open listening controls.';

  // Spoken word: Back 15 sits left of Play. While it cannot work (nothing loaded yet, or the load failed) its slot
  // holds what can: Cancel past 8 s of loading, Retry after a failure. A link inside line 2, as the picture draws
  // it, would be a button inside the summary button, which no screen reader reaches.
  let slot = null;
  if (!songId) {
    if (failed) {
      slot = <button type="button" className="audio-bar-act" onClick={() => AudioPlayer.toggle()}>Retry</button>;
    } else if (starting && lateStart) {
      slot = <button type="button" className="audio-bar-act" onClick={() => AudioPlayer.toggle()} aria-label="Cancel loading">Cancel</button>;
    } else {
      slot = (
        <button type="button" className="audio-bar-back" onClick={() => AudioPlayer.skip(-15)} disabled={starting} aria-label="Back 15 seconds">
          <Back15Icon />
        </button>
      );
    }
  }

  return (
    <>
    <div
      ref={barRef}
      className={'audio-bar' + (songId ? ' is-song' : '')}
      role="region"
      aria-label="Audio player"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={onClickCapture}
    >
      <span className="audio-bar-line" aria-hidden="true"><span style={{ width: pct + '%' }} /></span>
      <button
        type="button"
        className="audio-bar-summary"
        onClick={() => setManagerOpen(true)}
        aria-label={summaryLabel}
        aria-expanded={managerOpen}
      >
        <span className="audio-bar-mark" aria-hidden="true">
          {songId ? <SongCover song={song || { id: songId }} className="audio-bar-cover" /> : <BookMark />}
        </span>
        <span className="audio-bar-summary-text">
          <span className="audio-bar-title">
            {title}
            {titlePart ? <span className="audio-bar-part">{' · ' + titlePart}</span> : null}
          </span>
          <span className="audio-bar-sub">
            <span className={'audio-bar-line2' + lineClass}>
              {/* It breaks only between its parts, never inside "6 min left" (picture 04). */}
              {segs.map((p, i) => (
                <React.Fragment key={i}>{i ? ' ' : null}<span className="audio-bar-seg">{p + (i < segs.length - 1 ? ' ·' : '')}</span></React.Fragment>
              ))}
            </span>
            {sleepChip ? <span className="audio-bar-chip"><MoonIcon />{sleepChip}</span> : null}
            {speedChip ? <span className="audio-bar-chip">{speedChip}</span> : null}
          </span>
        </span>
      </button>
      <div className="audio-bar-controls">
      {slot}
      <button
        type="button"
        className={'audio-bar-play' + (st.status === 'loading' ? ' is-loading' : '') + (songOffline ? ' is-unavailable' : '')}
        onClick={() => AudioPlayer.toggle()}
        aria-label={active ? 'Pause' : 'Play'}
        aria-busy={st.status === 'loading'}
      >
        {st.status === 'loading' ? <SpinnerIcon /> : active ? <PauseIcon /> : <PlayIcon />}
      </button>
      {songId && !single ? (
        <button type="button" className="audio-bar-next" onClick={() => AudioPlayer.next()} aria-label="Next song"><NextIcon /></button>
      ) : null}
      <button type="button" className="audio-bar-close" onClick={closeWithUndo} aria-label="Close player">
        <CloseGlyph />
      </button>
      </div>
    </div>
    <AudioManagerSheet open={managerOpen} state={st} onClose={() => setManagerOpen(false)} />
    </>
  );
}
