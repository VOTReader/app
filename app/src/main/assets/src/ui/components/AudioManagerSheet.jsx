/*
   AudioManagerSheet — the full Now Playing screen (player brief 3b, pl-l2;
   pictures 05-09 in D:/Swarm/calls/player-mockups/). It replaced the desk
   sheet: the bar's tap opens it full screen (a right-side panel on a wide
   window), ⌄ or a drag down on its head closes it.

     head        ⌄ · "VOLUME ONE · LETTER 3 OF 30" · ⋯ (Save, Open the reading)
     body        a reading: the title in the reading serif, "Read by …" and the
                 Voice chip, "Open the reading ›"; a WTLB compilation names the
                 letter under the clock and "Entry 12 of 25 in this recording".
                 A song: its cover (or its lyrics), the version chip, the letter
                 it comes from, "Do you like this song?"
     dock        pinned to the thumb zone, never scrolled away (fixes 27a, U04.3):
                 the scrubber (a compilation's letters as ticks), the transport
                 (reading: prev · −15 · play · +15 · next; song: shuffle · prev ·
                 play · next · repeat) and the bottom row (Speed · Sleep · Up next
                 · Read along; a song: Lyrics · Sleep · Up next · On this phone),
                 each of which opens a small sheet (PlayerSheets.jsx).

   This is deliberately a controller, never a second player: all transport,
   queue edits, persistence, Media Session integration, and audio arbitration
   remain in utils/audio-player.js. The screen only renders that public state.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { BIBLE_AUDIO_EDITIONS, bibleAudioOffered, displayPartLabel, queuePlace, songIdOfKey } from '../../utils/audio-track.js';
import { songById, familyById, versionsOf, isVerbatimSong } from '../../utils/song-catalog.js';
import { SongCover, ChoiceSheet, ShuffleIcon, RepeatIcon, NextIcon, PrevIcon, songClock, songLetterOf } from './SongParts.jsx';
import { SongLyricsCard } from './SongDeskParts.jsx';
import { SongVoteAsk } from './SongVoteParts.jsx';
import { useSongKeep, useSongsOnline } from './SongKeepParts.jsx';
import { formatSongBytes } from '../../utils/song-keep.js';
import { AudioSeekSlider, formatClock as formatTime } from './AudioSeekSlider.jsx';
import { useDragToClose } from './SheetHandle.jsx';
import { hasTextDestination, PlayIcon, PauseIcon } from './AudioShelf.jsx';
import { RowMenu } from './RowMenu.jsx';
import { SpeedSheet, SleepSheet, VoiceSheet, UpNextSheet } from './PlayerSheets.jsx';
import { toggleSavedRecording } from '../../utils/saved-shelf.js';

/** @returns {any | null} */
function libraryStore() {
  return /** @type {any} */ (globalThis).AudioLibraryStore || null;
}

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
 * select() rebuilds the queue from the corpus (a plain queue rebuilds to itself); swap() makes the switch in place
 * on a queue the listener made, keeping its shape, and says false when it cannot.
 *
 * @returns {{ kind: 'reader'|'edition', activeLabel: string, chips: Array<{ id: string, label: string, active: boolean, select: () => void, swap: () => boolean }> } | null}
 */
function voiceChoices(current) {
  const split = splitTrackKey(current);
  if (!split) return null;

  if (split.volKey.lastIndexOf('bible-', 0) === 0) {
    // Only editions the registry OFFERS that actually ship this book — a chip
    // for a recording that does not exist would tap through to silence, and one
    // for an edition whose assets are not on the release taps into a 404.
    const editions = Object.entries(BIBLE_AUDIO_EDITIONS)
      .filter(([, edition]) => bibleAudioOffered(edition) && AudioPlayer.hasAudio(edition.volKey, split.id));
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
          AudioPlayer.playBibleBook({ volKey: edition.volKey, bookId: split.id, chapterNum, label: edition.label, noResume: true });
          // Every other Listen pill in the app reads settings.bibleAudio, so a
          // voice chosen here has to become THE voice — otherwise the next
          // chapter tapped in the reader would snap back to the old edition.
          const setting = typeof window !== 'undefined' ? /** @type {any} */ (window).__setBibleAudioEdition : null;
          if (typeof setting === 'function') setting(id);
        },
        swap: () => {
          if (!AudioPlayer.switchVoiceInPlace({ volKey: edition.volKey, label: edition.label })) return false;
          const setting = typeof window !== 'undefined' ? /** @type {any} */ (window).__setBibleAudioEdition : null;
          if (typeof setting === 'function') setting(id);
          return true;
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
            startId: split.id, startReader: rendition.reader, noResume: true,
          });
          return;
        }
        AudioPlayer.playLetter({
          volKey: split.volKey, letter: { id: split.id, title: current.title },
          collectionLabel: current.sub, reader: rendition.reader, noResume: true,
        });
      },
      swap: () => AudioPlayer.switchVoiceInPlace({ volKey: split.volKey, reader: rendition.reader }),
    })),
  };
}

/* ── icons (the pictures' line set) ─────────────────────────────────────── */
const ICON = { viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: /** @type {'round'} */ ('round'), strokeLinejoin: /** @type {'round'} */ ('round') };
function DownIcon() { return <svg {...ICON} strokeWidth={2}><path d="M5 9l7 7 7-7" /></svg>; }
function PrevItemIcon() { return <svg {...ICON}><path d="M17 5L9 12l8 7z" /><path d="M6.5 5v14" /></svg>; }
function NextItemIcon() { return <svg {...ICON}><path d="M7 5l8 7-8 7z" /><path d="M17.5 5v14" /></svg>; }
/** A curved arrow round "15": back (dir -1) or forward (dir 1). @param {{ dir: number }} props */
function SkipIcon({ dir }) {
  return (
    <svg {...ICON} strokeWidth={1.6}>
      {dir < 0
        ? <><path d="M9 4.5L6 7.5l3 3" /><path d="M6.5 7.5H13a6.5 6.5 0 1 1-6.4 7.6" /></>
        : <><path d="M15 4.5l3 3-3 3" /><path d="M17.5 7.5H11a6.5 6.5 0 1 0 6.4 7.6" /></>}
      <text x="12" y="17.4" textAnchor="middle" fontSize="7.6" fontWeight="600" fill="currentColor" stroke="none" fontFamily="inherit">15</text>
    </svg>
  );
}
function MoonIcon() { return <svg {...ICON}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" /></svg>; }
function ListIcon() { return <svg {...ICON}><path d="M5 7h14M5 12h14M5 17h9" /></svg>; }
function BookIcon() { return <svg {...ICON} strokeWidth={1.5}><path d="M12 6.5C9.8 5 7 4.6 3.5 5v13c3.5-.4 6.3 0 8.5 1.5 2.2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.3 0-8.5 1.5z" /><path d="M12 6.5v13" /></svg>; }
function QuoteIcon() { return <svg {...ICON} fill="currentColor" stroke="none"><path d="M10 7c-2.8.6-4.6 2.8-4.6 5.9V17H10v-4.6H7.7c.1-1.6 1-2.7 2.6-3.1zm8 0c-2.8.6-4.6 2.8-4.6 5.9V17H18v-4.6h-2.3c.1-1.6 1-2.7 2.6-3.1z" /></svg>; }
function KeepIcon() { return <svg {...ICON}><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 19.5h14" /></svg>; }
function KeptIcon() { return <svg {...ICON}><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.3l2.6 2.6 5-5.2" /></svg>; }

/**
 * What the kicker counts this recording as: "Letter 3 of 30", "Chapter 3 of 50", "Recording 2 of 6".
 * @param {any} track @returns {string}
 */
function placeNoun(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  if (!key) return 'Recording';
  if (key.lastIndexOf('bible-', 0) === 0 || key.lastIndexOf('study:', 0) === 0) return 'Chapter';
  return 'Letter';
}

/** What "End of this …" in the sleep sheet ends. @param {any} track @param {boolean} isSong @returns {string} */
function sleepNoun(track, isSong) {
  if (isSong) return 'song';
  const noun = placeNoun(track);
  return noun === 'Recording' ? 'recording' : noun.toLowerCase();
}

/**
 * The bottom row's one button: an icon (or the speed) in a box, its word under it.
 * @param {{ label: string, word: string, onClick: () => void, children: any, badge?: number, on?: boolean, disabled?: boolean, haspopup?: boolean, className?: string }} props
 */
function Tool({ label, word, onClick, children, badge = 0, on = false, disabled = false, haspopup = true, className = '' }) {
  return (
    <button
      type="button"
      className={'np-tool' + (on ? ' is-on' : '') + (className ? ' ' + className : '')}
      aria-label={label}
      aria-haspopup={haspopup ? 'dialog' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="np-tool-box">
        {children}
        {badge > 0 ? <span className="np-tool-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span> : null}
      </span>
      <span className="np-tool-word" aria-hidden="true">{word}</span>
    </button>
  );
}

/**
 * The scrubber with elapsed and remaining time; a compilation's letters are ticks along it.
 * @param {{ state: any, marks: Array<{ key: string, start: number, title: string | null }> | null }} props
 */
function Scrubber({ state, marks }) {
  const duration = Math.max(0, Number(state.duration) || 0);
  const time = Math.max(0, Number(state.time) || 0);
  // The clock stays hidden until the length is known (brief 3g): no "0:00 / 0:00" while it loads.
  const known = duration > 0;
  return (
    <div className="np-scrub audio-manager-progress">
      {known && marks && marks.length > 1 ? (
        <div className="np-ticks" aria-hidden="true">
          {marks.map((m) => <span key={m.key} style={{ left: Math.min(100, (m.start / duration) * 100).toFixed(2) + '%' }} />)}
        </div>
      ) : null}
      <AudioSeekSlider className="audio-manager-seek" ariaLabel="Playback position" time={state.time} duration={state.duration} />
      <div className="audio-manager-time np-times">
        <span>{known ? formatTime(time) : ''}</span>
        <span>{known ? '−' + formatTime(Math.max(0, duration - time)) : ''}</span>
      </div>
    </div>
  );
}

/**
 * @param {{ open: boolean, state: import('../../utils/audio-player.js').AudioPlayerState, onClose: () => void }} props
 */
export function AudioManagerSheet({ open, state, onClose }) {
  // A screen that will render nothing (no current track) must not claim the modal registry or the close-sheet
  // bridge: an invisible topmost modal would swallow Escape/back. Hooks stay unconditional; only `active` and the
  // bridge effect gate on actually having something to show.
  const hasCurrent = !!(Array.isArray(state.queue) && state.queue[state.qi]);
  const renders = open && hasCurrent;
  const trapRef = useFocusTrap(renders);
  useModalRegistry({ id: 'audio-manager-sheet', dismiss: onClose, active: renders });
  /** Which small sheet is up over the player, if any. */
  const [sheet, setSheet] = React.useState(/** @type {''|'speed'|'sleep'|'voice'|'upnext'|'versions'} */ (''));
  /** A song's Lyrics view in place of its cover. */
  const [lyrics, setLyrics] = React.useState(false);
  React.useEffect(() => { if (!open) { setSheet(''); setLyrics(false); } }, [open]);
  const closeSheet = React.useCallback(() => setSheet(''), []);

  // AudioLibraryStore belongs to bundle-b. Resolve it at render time instead of importing that bundle's source here,
  // which would duplicate its singleton when esbuild builds bundle-d.
  const library = libraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  const keep = useSongKeep();
  const online = useSongsOnline();

  // The close bridge is the player's while no sheet of its own is up (a sheet holds it then, and hands it back).
  React.useEffect(() => {
    if (!renders || sheet || typeof window === 'undefined') return undefined;
    const previous = window.__closeSheet;
    window.__closeSheet = onClose;
    return () => { window.__closeSheet = previous || null; };
  }, [renders, sheet, onClose]);

  // The whole screen follows a drag down on its head, and closes past the line (U06.8).
  const grab = useDragToClose(onClose, (target) => /** @type {HTMLElement | null} */ (target.closest('.audio-manager-sheet')));

  if (!open || typeof document === 'undefined') return null;
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  if (!current) return null;

  const playing = state.status === 'playing';
  const loading = state.status === 'loading';
  const active = playing || loading;
  const reader = AudioPlayer.readerLabel(current.readerCode);
  const saved = !!(library && typeof library.isSaved === 'function' && library.isSaved(current));
  const upcoming = Math.max(0, queue.length - (state.qi + 1));
  const songId = songIdOfKey(current.key);
  const song = songId ? songById(songId) : null;
  const voices = songId ? null : voiceChoices(current);
  // A boot-restored bar is ONE placeholder track standing in for a queue whose shape nobody knows yet: the real one
  // is rebuilt on the first transport tap. The screen stays neutral until the rebuild answers (2026-08-10).
  const restoring = !!state.restoring;
  // A queue of one turns prev into a Restart rather than a dead control.
  const single = !restoring && queue.length < 2;
  // A WTLB compilation: the letter under the clock is the title, its place among the file's letters under it.
  const live = AudioPlayer.liveLetter();
  const liveTitle = live && live.title ? live.title : null;
  const marks = songId ? null : AudioPlayer.sectionMarks();
  const entry = live && marks ? marks.findIndex((m) => m.key === live.key) : -1;
  const heading = liveTitle || current.title;
  // Counted in recordings, as the bar and the collection screens count them (queuePlace).
  const counted = queuePlace(queue, state.qi);
  const kicker = songId
    ? (current.sub || 'Songs of the Letters')
    : [current.sub, restoring || single || counted.of < 2 ? null : placeNoun(current) + ' ' + counted.at + ' of ' + counted.of].filter(Boolean).join(' · ') || 'The Volumes of Truth';
  // Suppressed when it would only echo the title: a per-chapter Bible track is titled "Genesis 2" and labelled
  // "Chapter 2" (2026-08-10). The label itself is untouched; see displayPartLabel.
  const part = liveTitle ? current.title : displayPartLabel(current.title, current.partLabel);
  const byline = [
    entry >= 0 && marks ? 'Entry ' + (entry + 1) + ' of ' + marks.length + ' in this recording' : null,
    part,
    reader || null,   // readerLabel says it whole: 'Read by Benjamin', 'Text-to-speech'
  ].filter(Boolean).join(' · ');
  const canRead = hasTextDestination(current) && typeof window !== 'undefined' && typeof window.__openAudioText === 'function';
  const openReading = () => { window.__openAudioText(current); onClose(); };
  // A queue the listener made (source mode 'custom': reordered, pruned, a lone saved recording, a plan's portion)
  // switches voice IN PLACE and keeps its shape (switchVoiceInPlace); only when that cannot be done does the rebuild,
  // which would drop it, ask first (owner directive 2026-08-10). Plain queues rebuild to themselves.
  const needsVoiceConfirm = state.sourceMode === 'custom';
  const sleepOn = !!(state.sleepEndsAt || state.sleepAtTrackEnd || state.sleepAtQueueEnd);
  const sleepLeft = AudioPlayer.getSleepRemainingSeconds();
  const sleepWord = state.sleepAtTrackEnd ? 'End of ' + sleepNoun(current, !!songId) : state.sleepAtQueueEnd ? 'End of queue'
    : sleepLeft > 0 ? Math.max(1, Math.ceil(sleepLeft / 60)) + ' min' : 'Sleep';

  // A song's versions and its keep.
  const fam = song ? familyById(song.f) : null;
  const versions = fam ? versionsOf(fam) : [];
  const versionAt = song ? versions.findIndex((v) => v.id === song.id) : -1;
  const versionWord = song && song.v ? String(song.v).split(' · ')[0] : 'Version';
  const letter = song ? songLetterOf(song) : null;
  // The verbatim gate (Corbin 2026-09-25): an interpretation keeps the way to its letter but never says it is the
  // letter's words.
  const fromWords = isVerbatimSong(song) ? 'From the letter' : 'Inspired by the letter';
  const songName = current.title || 'this song';
  const keepOk = !!songId && keep.availability() === 'ok';
  const keepState = keepOk ? keep.progressOf([songId]) : null;
  const kept = !!(keepState && keepState.total > 0 && keepState.kept === keepState.total);
  const keeping = !!(keepState && keepState.busy);
  const canPage = !!(song && song.f) && typeof window !== 'undefined' && typeof window.__openSongs === 'function';

  const menu = [
    { id: 'save', text: saved ? 'Saved · Remove' : 'Save', icon: 'save', onSelect: () => { toggleSavedRecording(library, current); } },
  ];
  if (canRead) menu.push({ id: 'read', text: songId ? (letter ? fromWords.replace('From', 'Open') : 'Open the reading') : 'Open the reading', icon: 'open', onSelect: openReading });
  if (kept) menu.push({ id: 'unkeep', text: 'Remove from this phone', icon: 'remove', onSelect: () => { void keep.remove([songId]); } });
  if (canPage) menu.push({ id: 'page', text: 'Song page', icon: 'open', onSelect: () => { window.__openSongs([{ k: 'song', v: song.f }], ''); onClose(); } });

  const play = (
    <button
      type="button"
      className={'audio-manager-play np-play' + (loading ? ' is-loading' : '')}
      onClick={() => AudioPlayer.toggle()}
      aria-label={active ? 'Pause' : 'Play'}
      aria-busy={loading}
    >
      {active ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
  const repeat = state.repeat || 'off';
  const nextRepeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';

  return ReactDOM.createPortal(
    <>
      <div className="audio-manager-backdrop np-backdrop" aria-hidden="true" onClick={onClose} />
      <section
        className={'audio-manager-sheet now-playing' + (songId ? ' is-song' : '')}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="np-head">
          <button type="button" className="sheet-handle-back np-close" onClick={onClose} aria-label="Close player"><DownIcon /></button>
          {/* The head is the drag zone (the kicker's words are not a control): a drag down closes the screen. */}
          <div className="np-kicker" {...grab} onClick={undefined}>{kicker}</div>
          <RowMenu label={'More for ' + (heading || 'this recording')} items={menu} />
        </header>

        <div className="np-body">
          {songId ? (
            <>
              {lyrics ? (
                <div className="np-lyrics-head">
                  <SongCover song={song || { id: songId }} className="np-cover-small" />
                  <div>
                    <h2 className="np-title np-title-song" id="audio-manager-title">{current.title || 'Untitled song'}</h2>
                    {versionAt >= 0 ? <p className="np-byline">{versionWord}</p> : null}
                  </div>
                </div>
              ) : (
                <>
                  <SongCover song={song || { id: songId }} large className="np-cover" />
                  <h2 className="np-title np-title-song" id="audio-manager-title">{current.title || 'Untitled song'}</h2>
                  {versions.length > 1 && versionAt >= 0 ? (
                    <button type="button" className="np-chip np-version" aria-haspopup="dialog" onClick={() => setSheet('versions')}
                      aria-label={'Version: ' + (song.v || versionWord) + ', ' + (versionAt + 1) + ' of ' + versions.length + '. Choose another'}>
                      {versionWord} · {versionAt + 1} of {versions.length} <span aria-hidden="true">›</span>
                    </button>
                  ) : current.partLabel ? <p className="np-byline">{current.partLabel}</p> : null}
                  {letter && canRead ? (
                    <button type="button" className="np-from" onClick={openReading} aria-label={fromWords + ' — ' + (letter.title || '') + '; the song keeps playing'}>
                      {fromWords} <em>{letter.title}</em> <span aria-hidden="true">›</span>
                    </button>
                  ) : null}
                </>
              )}
              {lyrics ? <SongLyricsCard song={song} time={state.time} /> : null}
              {song ? <SongVoteAsk song={song} title={current.title} /> : null}
            </>
          ) : (
            <>
              <h2 className="np-title" id="audio-manager-title">{heading || 'Untitled recording'}</h2>
              <div className="np-byrow">
                {byline ? <p className="np-byline">{byline}</p> : null}
                {voices ? (
                  <button type="button" className="np-chip np-voice audio-manager-voice-top" aria-haspopup="dialog" onClick={() => setSheet('voice')}
                    aria-label={(voices.kind === 'edition' ? 'Edition: ' : 'Voice: ') + voices.activeLabel + '. Choose another'}>
                    {voices.kind === 'edition' ? voices.activeLabel : 'Voice'} <span aria-hidden="true">▾</span>
                  </button>
                ) : null}
              </div>
              {canRead ? (
                <button type="button" className="np-live audio-manager-jump" onClick={openReading}
                  aria-label={'Open the reading — ' + (heading || 'this recording') + '; playback continues'}>
                  <span className="np-live-cue audio-manager-jump-cue">Open the reading <span aria-hidden="true">›</span></span>
                </button>
              ) : null}
              {state.failed ? (
                <p className="np-status" role="status">
                  {state.failed === 'load' ? 'Couldn’t load this recording.' : 'This recording isn’t on this phone.'}
                  {' '}<button type="button" className="np-sheet-link" onClick={() => AudioPlayer.toggle()}>Retry</button>
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="np-dock">
          <Scrubber state={state} marks={marks} />
          {songId ? (
            <div className="audio-manager-transport np-transport is-song" aria-label="Playback controls">
              <button type="button" className={'np-flat' + (state.shuffle ? ' is-on' : '')} aria-pressed={!!state.shuffle} aria-label="Shuffle" onClick={() => AudioPlayer.setShuffle(!state.shuffle)}><ShuffleIcon /></button>
              <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.prev()} aria-label="Previous song"><PrevIcon /></button>
              {play}
              <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.next()} disabled={!restoring && upcoming < 1 && repeat !== 'all'} aria-label="Next song"><NextIcon /></button>
              <button type="button" className={'np-flat' + (repeat !== 'off' ? ' is-on' : '')} aria-pressed={repeat !== 'off'}
                aria-label={repeat === 'one' ? 'Repeat: this song' : repeat === 'all' ? 'Repeat: the queue' : 'Repeat: off'}
                onClick={() => AudioPlayer.setRepeat(nextRepeat)}><RepeatIcon one={repeat === 'one'} /></button>
            </div>
          ) : (
            <div className="audio-manager-transport np-transport" aria-label="Playback controls">
              <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.prev()} aria-label={single ? 'Restart' : 'Previous track'}><PrevItemIcon /></button>
              <button type="button" className="audio-manager-round np-skip" onClick={() => AudioPlayer.skip(-15)} aria-label="Back 15 seconds"><SkipIcon dir={-1} /></button>
              {play}
              <button type="button" className="audio-manager-round np-skip" onClick={() => AudioPlayer.skip(15)} aria-label="Forward 15 seconds"><SkipIcon dir={1} /></button>
              {/* Live while restoring: the placeholder's length says nothing about the queue the tap rebuilds (sweep v021). */}
              <button type="button" className="audio-manager-round" onClick={() => AudioPlayer.next()} disabled={!restoring && upcoming < 1} aria-label="Next track"><NextItemIcon /></button>
            </div>
          )}
          <div className="np-tools">
            {songId ? (
              <Tool label={lyrics ? 'Hide lyrics' : 'Lyrics'} word="Lyrics" on={lyrics} haspopup={false} onClick={() => setLyrics(!lyrics)}><QuoteIcon /></Tool>
            ) : (
              <Tool label={'Speed, ' + String(Math.round(state.rate * 100) / 100) + '×'} word="Speed" on={Math.abs(state.rate - 1) > 0.005} onClick={() => setSheet('speed')}>
                <span className="np-tool-rate">{(Math.round(state.rate * 100) / 100).toFixed(Math.round(state.rate * 100) % 10 ? 2 : 1)}×</span>
              </Tool>
            )}
            <Tool label={sleepOn ? 'Sleep timer: ' + sleepWord : 'Sleep timer'} word={sleepWord} on={sleepOn} onClick={() => setSheet('sleep')}><MoonIcon /></Tool>
            <Tool label={'Up next' + (upcoming ? ', ' + upcoming + ' left' : '')} word="Up next" badge={restoring ? 0 : upcoming} onClick={() => setSheet('upnext')}><ListIcon /></Tool>
            {songId ? (
              keepOk ? (
                <Tool
                  label={kept ? songName + ' is on this phone' : keeping ? 'Keeping ' + songName + ' on this phone'
                    : online ? 'Keep ' + songName + ' on this phone' + (keepState && keepState.needBytes ? ' · ' + formatSongBytes(keepState.needBytes) : '')
                      : 'Keeping needs a connection · ' + songName}
                  word={kept ? 'On this phone' : keeping ? 'Keeping…' : 'Keep on phone'}
                  on={kept} haspopup={false} disabled={!kept && !keeping && !online}
                  onClick={() => { if (kept || keeping) return; void keep.keep([songId], 'keep-desk-' + songId); }}
                >{kept ? <KeptIcon /> : <KeepIcon />}</Tool>
              ) : null
            ) : (
              <Tool label="Read along" word="Read along" haspopup={false} disabled={!canRead} onClick={openReading}><BookIcon /></Tool>
            )}
          </div>
        </div>

        {sheet === 'speed' ? <SpeedSheet rate={state.rate} onClose={closeSheet} /> : null}
        {sheet === 'sleep' ? <SleepSheet state={state} noun={sleepNoun(current, !!songId)} onClose={closeSheet} /> : null}
        {sheet === 'voice' && voices ? <VoiceSheet voices={voices} title={heading || ''} needsConfirm={needsVoiceConfirm} single={single} onClose={closeSheet} /> : null}
        {sheet === 'upnext' ? <UpNextSheet state={state} onClose={closeSheet} /> : null}
        {sheet === 'versions' && fam ? (
          <ChoiceSheet
            eyebrow={fam.t} title="Versions" value={song.id}
            options={versions.map((s) => ({ id: s.id, label: s.v || 'Version', meta: songClock(s.d) }))}
            onChange={(id) => { if (id !== song.id) AudioPlayer.switchSongVersion(id); }} onClose={closeSheet}
          />
        ) : null}
      </section>
    </>,
    document.body
  );
}
