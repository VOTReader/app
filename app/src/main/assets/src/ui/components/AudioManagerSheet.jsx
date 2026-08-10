/*
   AudioManagerSheet — the expanded surface for the one AudioPlayer singleton.

   This is deliberately a controller, never a second player: all transport,
   queue edits, persistence, Media Session integration, and audio arbitration
   remain in utils/audio-player.js. The sheet only renders that public state.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { AUDIO_PLAYBACK_RATES, BIBLE_AUDIO_EDITIONS } from '../../utils/audio-track.js';
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

/* ── the queue as a picker (owner directive 2026-08-09) ───────────────────
   The list used to start at qi + 1, so the recording playing and everything
   already heard were simply absent — a played chapter could not be picked
   again without rebuilding the queue. It now renders the WHOLE queue.

   Which makes length the new problem: a whole Bible edition queues 1,189
   chapters, and 1,189 rows of DOM is a real cost for a sheet that opens on a
   phone. The answer is deliberately dumb — a WINDOW around the current row
   plus two "show more" expanders. No virtualization, no scroll math, nothing
   to go wrong when the queue is edited underneath it. */

/** Above this many rows the window applies; below it the queue renders whole. */
const QUEUE_WINDOW_MIN = 80;
/** Rows either side of the current one, and the step each expander adds. */
const QUEUE_PAGE = 40;

/**
 * Split a track key ("volKey:letterId") into its two halves, or null when the
 * track carries none (range compilations).
 *
 * @param {any} track
 * @returns {{ volKey: string, id: string } | null}
 */
function splitTrackKey(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  if (divider < 1 || divider >= key.length - 1) return null;
  return { volKey: key.slice(0, divider), id: key.slice(divider + 1) };
}

/**
 * A collection's caller-ordered items (preface first where one exists), read
 * from the lazy VOT registry globals. Null when that registry hasn't landed —
 * the caller then falls back to playLetter, which handles the lone letter.
 *
 * @param {string} volKey
 * @returns {Array<any> | null}
 */
function collectionItems(volKey) {
  const g = /** @type {any} */ (globalThis);
  const col = typeof g.COL_BY_KEY !== 'undefined' && g.COL_BY_KEY ? g.COL_BY_KEY.get(volKey) : null;
  if (!col || typeof g.colLetterArr !== 'function') return null;
  const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  const letters = g.colLetterArr(col) || [];
  return preface ? [preface, ...letters] : letters;
}

/**
 * The chapter a Bible track is playing. Every per-chapter edition labels its
 * parts "Chapter N", which is the authoritative answer; a whole-book recording
 * carries no part label at all, and chapter 1 IS its start.
 *
 * @param {any} track
 * @returns {number}
 */
function chapterOfTrack(track) {
  const match = track && typeof track.partLabel === 'string' ? track.partLabel.match(/^Chapter (\d+)$/) : null;
  return match ? Number(match[1]) : 1;
}

/**
 * The voices this recording can be heard in, or null when there is only one
 * (no row is kinder than a row with a single, un-pressable chip).
 *
 * Two shapes, one rule — CHOOSING A VOICE RESTARTS THE RECORDING. Position is
 * deliberately not carried across: two readers do not reach the same words at
 * the same second, so a "seamless" switch would drop the listener into the
 * middle of a sentence they never heard.
 *
 * @param {any} current - the playing track
 * @returns {{ kind: 'reader'|'edition', activeLabel: string, chips: Array<{ id: string, label: string, active: boolean, select: () => void }> } | null}
 */
function voiceChoices(current) {
  const split = splitTrackKey(current);
  if (!split) return null;

  if (split.volKey.lastIndexOf('bible-', 0) === 0) {
    // Only editions that actually ship this book — a chip for a recording that
    // does not exist would tap through to silence.
    const editions = Object.entries(BIBLE_AUDIO_EDITIONS)
      .filter(([, edition]) => AudioPlayer.hasAudio(edition.volKey, split.id));
    if (editions.length < 2) return null;
    const active = editions.find(([, edition]) => edition.volKey === split.volKey);
    const chapterNum = chapterOfTrack(current);
    return {
      kind: 'edition',
      activeLabel: active ? (active[1].short || active[1].label) : 'This edition',
      chips: editions.map(([id, edition]) => ({
        id,
        label: edition.short || edition.label,
        active: edition.volKey === split.volKey,
        select: () => {
          AudioPlayer.playBibleBook({ volKey: edition.volKey, bookId: split.id, chapterNum, label: edition.label });
          // Every other Listen pill in the app reads settings.bibleAudio, so a
          // voice chosen here has to become THE voice — otherwise the next
          // chapter tapped in the reader would snap back to the old edition.
          const setting = typeof window !== 'undefined' ? /** @type {any} */ (window).__setBibleAudioEdition : null;
          if (typeof setting === 'function') setting(id);
        },
      })),
    };
  }

  const renditions = AudioPlayer.renditionsFor(split.volKey, { id: split.id, title: current.title }, current.sub);
  if (renditions.length < 2) return null;
  const activeRendition = renditions.find((rendition) => rendition.reader === current.readerCode);
  return {
    kind: 'reader',
    activeLabel: (activeRendition && AudioPlayer.readerLabel(activeRendition.reader)) || 'This reading',
    chips: renditions.map((rendition) => ({
      id: rendition.reader || 'primary',
      label: AudioPlayer.readerLabel(rendition.reader) || 'This reading',
      active: rendition.reader === current.readerCode,
      select: () => {
        // The s4 album machinery: the chosen letter restarts in the chosen
        // voice and the rest of the collection follows behind it.
        const items = collectionItems(split.volKey);
        if (items && items.some((item) => item && item.id === split.id)) {
          AudioPlayer.playCollection({
            volKey: split.volKey, items, collectionLabel: current.sub,
            startId: split.id, startReader: rendition.reader,
          });
          return;
        }
        AudioPlayer.playLetter({
          volKey: split.volKey, letter: { id: split.id, title: current.title },
          collectionLabel: current.sub, reader: rendition.reader,
        });
      },
    })),
  };
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

  // Expander pages, in both directions. Reset every time the desk opens: the
  // window follows the CURRENT recording, and a page count kept from the last
  // visit would put the reader somewhere they didn't ask to be.
  const [earlierPages, setEarlierPages] = React.useState(0);
  const [laterPages, setLaterPages] = React.useState(0);
  React.useEffect(() => { setEarlierPages(0); setLaterPages(0); }, [open]);

  const currentRowRef = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => {
    if (!renders) return undefined;
    const node = currentRowRef.current;
    // jsdom has no scrollIntoView; a guarded no-op keeps the suite silent.
    if (!node || typeof node.scrollIntoView !== 'function') return undefined;
    const sheet = typeof node.closest === 'function' ? node.closest('.audio-manager-sheet') : null;
    if (sheet && typeof sheet.getBoundingClientRect === 'function') {
      const row = node.getBoundingClientRect();
      const box = sheet.getBoundingClientRect();
      // Already on screen: a short queue must not scroll the desk past its own
      // transport just to reveal a row that was visible all along.
      if (box.height > 0 && row.top >= box.top && row.bottom <= box.bottom) return undefined;
    }
    node.scrollIntoView({ block: 'center' });
    return undefined;
  }, [renders]);

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
  const upcoming = queue.length - (state.qi + 1);
  const voices = voiceChoices(current);
  // Mirrors the bar: a queue of one turns prev into a Restart rather than a
  // dead control, and the place-in-queue readout stays silent at 1 of 1.
  const single = queue.length < 2;
  const headLine = [
    current.sub,
    current.partLabel,
    reader,
    single ? null : (state.qi + 1) + ' of ' + queue.length,
  ].filter(Boolean).join(' · ') || 'The Volumes of Truth';

  // The window. Only a genuinely long queue is paged; everything else renders
  // whole, so the common case has no expanders and nothing to discover.
  const windowed = queue.length > QUEUE_WINDOW_MIN;
  const from = windowed ? Math.max(0, state.qi - QUEUE_PAGE - earlierPages * QUEUE_PAGE) : 0;
  const to = windowed ? Math.min(queue.length, state.qi + 1 + QUEUE_PAGE + laterPages * QUEUE_PAGE) : queue.length;
  const rows = queue.slice(from, to);

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
          {/* Voice (owner directive 2026-08-09). Absent entirely when this
              recording has only one — a chip row of one is furniture. */}
          {voices ? (
            <div className="audio-manager-tool audio-manager-voice">
              <div className="audio-manager-tool-head"><span>Voice</span><strong>{voices.activeLabel}</strong></div>
              <div className="audio-manager-segment" role="group" aria-label={voices.kind === 'edition' ? 'Recorded edition' : 'Reader'}>
                {voices.chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={chip.active ? 'is-active' : ''}
                    aria-pressed={chip.active}
                    onClick={chip.select}
                  >{chip.label}</button>
                ))}
              </div>
              <p className="audio-manager-voice-note">Choosing a voice starts this {voices.kind === 'edition' ? 'chapter' : 'recording'} again.</p>
            </div>
          ) : null}
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
            <div><span>Queue</span><strong>{single ? '1 recording' : (state.qi + 1) + ' of ' + queue.length}</strong></div>
            {upcoming > 0 ? <button type="button" onClick={() => AudioPlayer.clearUpcoming()}>Clear upcoming</button> : null}
          </div>
          {from > 0 ? (
            <button type="button" className="audio-manager-queue-page" onClick={() => setEarlierPages((n) => n + 1)}>
              {'Show ' + Math.min(QUEUE_PAGE, from) + ' earlier'}
            </button>
          ) : null}
          <ol>
            {rows.map((track, offset) => {
              const index = from + offset;
              const played = index < state.qi;
              const isCurrent = index === state.qi;
              const canMoveUp = index > state.qi + 1;
              const canMoveDown = index < queue.length - 1;
              return (
                <li
                  key={track.url + ':' + index}
                  className={played ? 'is-played' : isCurrent ? 'is-current' : ''}
                  aria-current={isCurrent ? 'true' : undefined}
                  ref={isCurrent ? currentRowRef : null}
                >
                  {isCurrent ? (
                    /* The playing row is a marker, not a control: the desk's
                       own transport already owns play/pause, and a second
                       button for the same thing invites a mis-tap that would
                       restart the recording. It is also what the queue editor
                       may never touch (removeUpcoming's protection). */
                    <div className="audio-manager-queue-main is-current">
                      <span className="audio-manager-queue-number">{index + 1}</span>
                      <span>
                        <strong>{trackLabel(track.title)}</strong>
                        <small>{['Playing now', track.partLabel].filter(Boolean).join(' · ')}</small>
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="audio-manager-queue-main"
                      onClick={() => AudioPlayer.playAt(index)}
                      aria-label={(played ? 'Play again: ' : 'Play now: ') + trackLabel(track.title)}
                    >
                      <span className="audio-manager-queue-number">{index + 1}</span>
                      <span>
                        <strong>{trackLabel(track.title)}</strong>
                        <small>{[track.partLabel, track.sub].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                  )}
                  {played || isCurrent ? null : (
                    <div className="audio-manager-queue-actions">
                      <button type="button" disabled={!canMoveUp} onClick={() => AudioPlayer.moveUpcoming(index, index - 1)} aria-label={'Move ' + trackLabel(track.title) + ' earlier'}>↑</button>
                      <button type="button" disabled={!canMoveDown} onClick={() => AudioPlayer.moveUpcoming(index, index + 1)} aria-label={'Move ' + trackLabel(track.title) + ' later'}>↓</button>
                      <button type="button" onClick={() => AudioPlayer.removeUpcoming(index)} aria-label={'Remove ' + trackLabel(track.title) + ' from queue'}>×</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {to < queue.length ? (
            <button type="button" className="audio-manager-queue-page" onClick={() => setLaterPages((n) => n + 1)}>
              {'Show ' + Math.min(QUEUE_PAGE, queue.length - to) + ' later'}
            </button>
          ) : null}
          {upcoming > 0 ? null : <p className="audio-manager-empty">Play a collection to line up more recordings. Your current recording will resume where you leave it.</p>}
        </div>
      </section>
    </>,
    document.body
  );
}
