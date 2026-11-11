/*
   AudioLibraryScreen -- the Listening Library hub: the LISTEN tab's root since the layout pass (2026-11-10,
   mock listen.png).

   The surface owns discovery and lightweight actions only: what is playing
   now, the two personal shelves (saved -> its own screen, recent -> in
   place), and the way in to every source that has recordings. The
   AudioPlayer remains the single source of truth for transport and queues;
   screen-routes remains the source of truth for text destinations.
*/

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13); it
   rode lazy bundle-h from 2026-09-22, landing 24, and the player itself did
   NOT come along: AudioPlayer, the AudioShelf rows, icons
   and position hook, AudioSeekSlider, CoverageBadge and the audio tables stay
   in bundle-d, where AudioPlayerBar and AudioManagerSheet reach them on every
   screen. This file reads them as free globals at call time — one player, one
   shelf, one copy of each table. */

import { studiesSummary } from './AudioStudiesScreen.jsx';
import { useOfflineAudio, formatBytes, OfflineNote, useOnline } from '../components/OfflineAudioControls.jsx';
import { stripModel } from '../components/DownloadStrip.jsx';
import { showUndoToast } from '../../utils/toast.js';
import { secondsOf } from '../../utils/audio-lengths.js';
import { bibleEditionPartialDetail } from '../../utils/audio-coverage.js';
import { rootNavStart, RootGear } from '../components/RootNav.jsx';
import { SelectSheet } from '../components/SelectField.jsx';

/** Recent list disclosure state. Deliberately localStorage, not the tab state:
 *  it is a shelf preference, not a place the reader navigated to. */
const RECENT_OPEN_KEY = 'vot-audio-recent-open';
/** Rows shown before "Show all" — enough to recognize the trail, short enough
 *  that Browse stays reachable without a long scroll. */
const RECENT_PREVIEW = 8;

/**
 * The offline line counts what is on the phone (RC.2, UX re-check 2026-10-22): "Recordings on this phone still
 * play" over a phone with none on it promised what it could not keep.
 * @param {any} off the offline store, or null where recordings cannot be kept
 * @returns {string}
 */
function offlineShelfLine(off) {
  const n = off && typeof off.items === 'function' ? off.items().length : 0;
  if (!n) return 'You’re offline. No recordings are saved on this phone yet.';
  return 'You’re offline. ' + (n === 1 ? '1 recording on this phone still plays.' : n + ' recordings on this phone still play.');
}

/**
 * The length under the scrubber (RC.7): the recording's own once it loads, the build's baked length before that,
 * and offline with neither, why. Never 'Streaming', which is not a length.
 * @param {any} state @returns {string}
 */
export function lengthText(state) {
  if (state.duration) return clock(state.duration);
  const track = Array.isArray(state.queue) ? state.queue[state.qi] : null;
  const baked = track ? secondsOf(track.url) : null;
  if (baked) return clock(baked);
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'Needs a connection' : '–:––';
}

/** Clear history, with a 5 s Undo (s18.8: it emptied the list at one tap with no way back). @param {any} library */
function clearHistory(library) {
  if (!library) return;
  const gone = library.clearRecent();
  if (Array.isArray(gone) && gone.length && typeof library.restoreRecent === 'function') {
    showUndoToast('vot-toast-history-cleared', 'History cleared', () => library.restoreRecent(gone));
  }
}

/** @param {number} value @returns {string} */
function clock(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return mins + ':' + (rest < 10 ? '0' : '') + rest;
}

/** @returns {boolean} */
function readRecentOpen() {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(RECENT_OPEN_KEY) !== '0';
  } catch (_e) { return true; }   // private mode / blocked storage — default open
}

/** @param {boolean} open @returns {void} */
function writeRecentOpen(open) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECENT_OPEN_KEY, open ? '1' : '0');
  } catch (_e) { /* the disclosure still works for this session */ }
}

/** Books this Bible edition actually ships, counted off the manifest rather
 *  than assumed to be 66 — a partial edition must not overstate itself. @param {string} volKey */
function bibleBookCount(volKey) {
  if (typeof BIBLE_AUDIO_MANIFEST === 'undefined' || !BIBLE_AUDIO_MANIFEST) return 0;
  const prefix = volKey + ':';
  let count = 0;
  for (const key in BIBLE_AUDIO_MANIFEST) {
    if (key.lastIndexOf(prefix, 0) === 0) count++;
  }
  return count;
}

/** The reader code the manifest carries for this edition's first row, or ''
 *  when it names none (the KJV/NKJV/WEB editions carry no code). @param {string} volKey */
function bibleReaderCode(volKey) {
  if (typeof BIBLE_AUDIO_MANIFEST === 'undefined' || !BIBLE_AUDIO_MANIFEST) return '';
  const prefix = volKey + ':';
  for (const key in BIBLE_AUDIO_MANIFEST) {
    if (key.lastIndexOf(prefix, 0) === 0) { const row = BIBLE_AUDIO_MANIFEST[key][0]; return row && row[1] ? String(row[1]) : ''; }
  }
  return '';
}

/**
 * An edition row's true second line (mt1, 2026-09-21): a noun that agrees with its count, the registry's
 * description where the edition has one, and the reader when the manifest names one (unless the label already
 * does: at 360 px the repeat pushed the line past its ellipsis). @param {any} edition @returns {string}
 */
export function editionLine(edition) {
  const books = bibleBookCount(edition.volKey);
  const description = edition.description || '';
  const parts = [books ? books + (books === 1 ? ' book' : ' books') : 'Read chapter by chapter'];
  if (description) parts.push(description);
  const reader = /read by/i.test(edition.label) ? null : audioReaderLabel(bibleReaderCode(edition.volKey));
  if (reader) parts.push(reader);
  else if (!description && books) parts.push('chapter by chapter');
  return parts.join(' · ');
}

/** The Downloads row's live line, the Downloads strip's own words (picture 02): 'Downloading · 3 of 30 recordings ·
 *  191 MB left', 'Paused · 3 of 30 recordings', 'Didn't download yet · 2 recordings'; then what is on the phone.
 *  A restored queue goes on by itself since dl-rework, so there is no 'closed' wait to name. @returns {string} */
function downloadsLine(/** @type {any} */ offline, /** @type {any} */ queueLine, /** @type {number} */ busy, /** @type {any[]} */ downloads) {
  if (queueLine) {
    return queueLine.line1 + (queueLine.reason == null && queueLine.leftBytes ? ' · ' + queueLine.leftBytes + ' left' : '');
  }
  if (busy) return 'Downloading · ' + (busy === 1 ? '1 recording' : busy + ' recordings') + ' to go';
  if (!downloads.length) return 'Download for offline listening';
  return downloads.length + ' on this phone · ' + formatBytes(offline.totalBytes());
}

/** The Letter Voice choices, one list for Settings > Listening and the Listen tab's row: Automatic, then every reader
 *  in the registry's rank (utils/audio-track.js AUDIO_READERS). @returns {{ id: string, label: string, desc: string }[]} */
export function letterVoiceOptions() {
  return [
    { id: 'auto', label: 'Automatic', desc: "Each recording's primary reading" },
    ...Object.entries(/** @type {any} */ (globalThis).AUDIO_READERS || {}).map(([id, label]) => ({
      id, label: String(label), desc: 'Prefer this reading wherever it exists',
    })),
  ];
}

/** The Letter voice row's value: the current choice in its own words. @param {string | undefined} code @returns {string} */
export function letterVoiceLabel(code) {
  if (!code || code === 'auto') return 'Automatic · each recording’s own reader';
  const readers = /** @type {any} */ (globalThis).AUDIO_READERS || {};
  return readers[code] ? String(readers[code]) : 'Automatic · each recording’s own reader';
}

/** A Bible edition's short name for The Bible row's line ("KJV · NKJV · WEB · Matthew"). @param {any} edition */
const editionShort = (edition) => String(edition.short || edition.label || '').split(' · ')[0];

/** The Continue card's title: the recording's name, with its part unless the name already says it (a per-chapter
 *  Bible edition titles "Genesis 1"; its "Chapter 1" would say it twice). @param {any} track @returns {string} */
export function continueTitle(track) {
  const name = trackName(track);
  const part = track && track.partLabel;
  const ch = part ? /^Chapter (\d+)$/.exec(part) : null;
  if (!part || (ch && name.endsWith(' ' + ch[1]))) return name;
  return name + ' · ' + part;
}

/** "12 min left", from the player's clock, or '' while the length is unknown. @param {any} state */
function minutesLeft(state) {
  if (!state || !state.duration) return '';
  const left = Math.max(0, Math.round((state.duration - (state.time || 0)) / 60));
  return left < 1 ? 'under a minute left' : left + ' min left';
}

/** The Continue listening card's progress line: the one part that moves every second, so the one that re-renders. */
function ContinueProgress() {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  const state = AudioPlayer.getState();
  const pct = state.duration ? Math.min(100, Math.max(0, (state.time / state.duration) * 100)) : 0;
  return (
    <div className="listen-progress" role="progressbar" aria-label="Playback position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: pct + '%' }} />
    </div>
  );
}

/** @param {{ icon: any, title: string, sub: string, count?: any, onClick: () => void, expanded?: boolean, className?: string, badge?: any }} props */
function ListRow({ icon, title, sub, count = null, onClick, expanded, className = '', badge = null }) {
  return (
    <button type="button" className={'root-row' + (className ? ' ' + className : '')} onClick={onClick} aria-expanded={expanded}>
      <span className="root-row-icon" aria-hidden="true">{icon}</span>
      <span className="root-row-text"><span className="root-row-title">{title}</span><span className="root-row-sub">{sub}</span>{badge}</span>
      {count != null ? <span className="root-row-count">{count}</span> : null}
      <span className={'root-row-chev' + (expanded ? ' is-open' : '')} aria-hidden="true">›</span>
    </button>
  );
}

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: /** @type {const} */ ('round'), strokeLinejoin: /** @type {const} */ ('round') };
const LETTERS_ICON = <svg {...ICON}><path d="M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4" /></svg>;
const BIBLE_ICON = <svg {...ICON}><path d="M12 6c-2-1.6-4.6-2-8-2v14c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2V4c-3.4 0-6 .4-8 2zM12 6v14" /></svg>;
const STUDIES_ICON = <svg {...ICON}><path d="M4 19V6l8-3 8 3v13M9 19v-6h6v6" /></svg>;
const SONGS_ICON = <svg {...ICON}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>;
const DOWNLOAD_ICON = <svg {...ICON}><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>;
const SAVED_ICON = <svg {...ICON}><path d="M12 3.7l2.55 5.17 5.71.83-4.13 4.03.98 5.69L12 16.74l-5.11 2.68.98-5.69-4.13-4.03 5.71-.83L12 3.7z" /></svg>;
const VOICE_ICON = <svg {...ICON}><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11v1a6 6 0 0012 0v-1M12 18v3" /></svg>;
const EDITION_ICON = <svg {...ICON}><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /></svg>;

/**
 * The LISTEN tab's root (the layout pass, 2026-11-10, mock listen.png): Continue listening; "Listen to": the
 * Volumes, the Bible (its editions open in place), Studies and Songs; "On this phone": Downloads with a live line,
 * Saved recordings with their count and the Letter voice setting with its value; then Recently played, as before.
 * Every destination the hub had is still one tap away; only the arrangement changed.
 * @param {{
 *   onOpenCollection: (volKey: string) => void,
 *   onOpenVolumes: () => void,
 *   onOpenSaved: () => void,
 *   onOpenStudies?: () => void,
 *   onOpenOffline?: () => void,
 *   onOpenSongs?: () => void,
 *   onOpenTrack: (track: any) => void,
 *   onSetLetterReader?: (code: string) => void,
 *   letterReader?: string,
 *   onSearch: () => void,
 *   onSettings: () => void,
 * }} props
 */
export function AudioLibraryScreen({ onOpenCollection, onOpenVolumes, onOpenSaved, onOpenStudies, onOpenOffline, onOpenSongs, onOpenTrack, onSetLetterReader, letterReader, onSearch, onSettings }) {
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  // Not the 1 Hz clock: only the card's progress line draws it, and it subscribes on its own (s18.3).
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getShape);
  useAudioPositions();

  // The VOT registry and manifest are lazy. Warming them here lets the rows name real available recordings
  // without duplicating a catalog. The Bible editions ride bundle-a and are NEVER gated behind this.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );
  // The studies are their own lazy file (bible-studies.js); re-render once the registry lands.
  const [, setStudiesLanded] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    const load = /** @type {any} */ (window).loadBibleStudies;
    if (typeof load === 'function') Promise.resolve(load()).then(() => { if (live) setStudiesLanded((n) => n + 1); }, () => {});
    return () => { live = false; };
  }, []);

  const [recentOpen, setRecentOpen] = React.useState(readRecentOpen);
  const [recentAll, setRecentAll] = React.useState(false);
  const [bibleOpen, setBibleOpen] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  const recent = library && typeof library.recent === 'function' ? library.recent() : [];
  const collections = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((collection) => collection.cardId) : [];
  // Every edition the registry OFFERS — one whose assets are not on the release is a row that opens onto 404s.
  const editions = Object.values(BIBLE_AUDIO_EDITIONS).filter(bibleAudioOffered);
  // One doorway for the Bible/Letter Studies, shown once a study has a recording: a row that opens onto nothing to
  // hear is a dead end.
  const studies = studiesSummary();
  // Downloads to the phone (item 8): wherever this app keeps recordings.
  const offline = useOfflineAudio();
  // Songs of the Letters (L2): the row names the real count once the catalog is in (fetched once per launch).
  const songs = typeof SongCatalog !== 'undefined' ? SongCatalog : null;
  React.useSyncExternalStore(
    React.useCallback((cb) => (songs ? songs.subscribe(cb) : () => {}), [songs]),
    React.useCallback(() => (songs ? songs.getVersion() : 0), [songs])
  );
  React.useEffect(() => { if (songs && !songs.loaded) void songs.load(); }, [songs]);
  const songTotal = songs && songs.loaded ? songs.songs().filter((s) => !s.hid && s.sh).length : 0;
  const downloads = offline ? offline.items() : [];
  const busy = offline && typeof offline.pending === 'function' ? offline.pending().busy : 0;
  const online = useOnline();
  const queueLine = offline ? stripModel(offline, online) : null;
  const isPlaying = state.status === 'playing';
  const isLoading = state.status === 'loading';
  const active = isPlaying || isLoading;
  const shownRecent = recentAll ? recent : recent.slice(0, RECENT_PREVIEW);
  // Continue listening: what is in the player, else the newest recording played.
  const resume = current || recent[0] || null;
  const left = current ? minutesLeft(state) : '';

  const toggleRecent = () => {
    const next = !recentOpen;
    setRecentOpen(next);
    writeRecentOpen(next);
  };

  return (
    <ScreenLayout root navChildren={rootNavStart({ title: 'Listen', onSearch })} navEnd={<RootGear onSettings={onSettings} />}>
      <div className="root-screen listen-root">
        <OfflineNote text={offlineShelfLine(offline)} />

        {resume ? (
          <section className={'listen-continue' + (active ? ' is-active' : '')} aria-labelledby="listen-continue-title">
            <div className="listen-continue-main">
              <button type="button" className="listen-art" disabled={!hasTextDestination(resume)} onClick={() => onOpenTrack(resume)}
                aria-label={'Open the text of ' + trackName(resume)} title="Open text">{BIBLE_ICON}</button>
              <div className="listen-continue-text">
                <span className="root-eyebrow">{current && isPlaying ? 'Now playing' : 'Continue listening'}</span>
                <h2 id="listen-continue-title" className="listen-continue-title">{continueTitle(resume)}</h2>
                <span className="listen-continue-meta">{[resume.sub || trackMeta(resume), left].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" className="listen-play" aria-busy={isLoading}
                aria-label={current ? (active ? 'Pause current recording' : 'Resume current recording') : 'Continue listening: ' + trackName(resume)}
                onClick={() => (current ? AudioPlayer.toggle() : AudioPlayer.playTrack(resume))}>
                {current && active ? <PauseIcon /> : <PlayIcon />}
              </button>
            </div>
            {current ? <ContinueProgress /> : null}
          </section>
        ) : null}

        <h2 className="root-section">Listen to</h2>
        <div className="root-list">
          <ListRow icon={LETTERS_ICON} title="The Volumes of Truth" onClick={() => onOpenVolumes()}
            sub={collections.length ? collections.length + (collections.length === 1 ? ' collection' : ' collections') + ' · the Letters read aloud' : 'The Letters read aloud'} />
          {editions.length ? (
            <ListRow icon={BIBLE_ICON} title="The Bible" expanded={bibleOpen} onClick={() => setBibleOpen((v) => !v)}
              sub={editions.map(editionShort).join(' · ')} />
          ) : null}
          {bibleOpen ? (
            <div className="root-sublist" role="group" aria-label="Bible recordings">
              {editions.map((edition) => (
                <ListRow key={edition.volKey} className="root-row-sub-item" icon={EDITION_ICON} title={edition.label}
                  sub={editionLine(edition)} onClick={() => onOpenCollection(edition.volKey)}
                  badge={<CoverageBadge state={bibleEditionCoverage(edition.volKey)} detail={bibleEditionPartialDetail(edition.volKey)} />} />
              ))}
            </div>
          ) : null}
          {studies.recorded > 0 ? (
            <ListRow icon={STUDIES_ICON} title="Studies" onClick={() => { if (onOpenStudies) onOpenStudies(); }}
              sub={studies.count + (studies.count === 1 ? ' study' : ' studies') + ' · ' + studies.recorded + ' with audio'} />
          ) : null}
          {onOpenSongs ? (
            <ListRow icon={SONGS_ICON} title="Songs of the Letters" onClick={() => onOpenSongs()}
              sub={songTotal ? songCountLabel(songTotal) + ' · sung by the flock' : 'Sung by the flock'} />
          ) : null}
        </div>

        <h2 className="root-section">On this phone</h2>
        <div className="root-list">
          {offline ? (
            <ListRow icon={DOWNLOAD_ICON} title="Downloads" className="listen-downloads" onClick={() => { if (onOpenOffline) onOpenOffline(); }}
              sub={downloadsLine(offline, queueLine, busy, downloads)} />
          ) : null}
          <ListRow icon={SAVED_ICON} title="Saved recordings" count={saved.length} onClick={() => onOpenSaved()}
            sub={saved.length ? 'Kept · travels with your backup' : 'Tap the star beside any recording to keep it'} />
          {onSetLetterReader ? (
            <ListRow icon={VOICE_ICON} title="Letter voice" onClick={() => setVoiceOpen(true)} sub={letterVoiceLabel(letterReader)} />
          ) : null}
        </div>

        {recent.length ? (
        <section className="listen-recent" aria-labelledby="audio-library-recent">
          <div className="root-section-row">
            <h2 className="root-section" id="audio-library-recent">Recently played</h2>
            {recent.length ? <button type="button" className="root-link" onClick={() => clearHistory(library)}>Clear history</button> : null}
            <button type="button" className={'audio-library-disclosure' + (recentOpen ? ' is-open' : '')} onClick={toggleRecent}
              aria-expanded={recentOpen} aria-controls="audio-library-recent-list"
              aria-label={recentOpen ? 'Collapse recently played' : 'Expand recently played'}>
              <ChevronIcon />
            </button>
          </div>
          <div id="audio-library-recent-list">
            {recentOpen ? (
              shownRecent.length ? (
                <>
                  {/* Per-row × (owner directive 2026-08-09): one stray start no longer needs the whole history cleared. */}
                  <div className="audio-library-list">{shownRecent.map((track) => <AudioShelfRow key={track.url} track={track} source="recent" onOpenTrack={onOpenTrack} onRemove={(item) => library && library.removeRecent(item.url)} />)}</div>
                  {recent.length > shownRecent.length ? (
                    <button type="button" className="audio-library-more" onClick={() => setRecentAll(true)}>Show all {recent.length}</button>
                  ) : null}
                </>
              ) : (
                <div className="audio-library-empty">Start a recording and it will appear here, ready for an easy return.</div>
              )
            ) : null}
          </div>
        </section>
        ) : null}
      </div>
      {/* The same choice as Settings > Listening > Letter Voice, picked here (the hub, 2026-11-10). */}
      {onSetLetterReader ? (
        <SelectSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} eyebrow="Listening" title="Letter Voice"
          value={letterReader || 'auto'} options={letterVoiceOptions()} onChange={onSetLetterReader} portal />
      ) : null}
    </ScreenLayout>
  );
}
