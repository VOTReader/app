/*
   AudioLibraryScreen -- the Listening Library hub.

   The surface owns discovery and lightweight actions only: what is playing
   now, the two personal shelves (saved -> its own screen, recent -> in
   place), and the way in to every source that has recordings. The
   AudioPlayer remains the single source of truth for transport and queues;
   screen-routes remains the source of truth for text destinations.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { BIBLE_AUDIO_EDITIONS } from '../../utils/audio-track.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import {
  ArrowIcon, AudioShelfRow, ChevronIcon, PauseIcon, PlayIcon, StarIcon, TextIcon,
  audioLibraryStore, hasTextDestination, trackMeta, trackName, useAudioPositions,
} from '../components/AudioShelf.jsx';
import { scrollBehavior } from '../../utils/reduced-motion.js';

/** Recent list disclosure state. Deliberately localStorage, not the tab state:
 *  it is a shelf preference, not a place the reader navigated to. */
const RECENT_OPEN_KEY = 'vot-audio-recent-open';
/** Rows shown before "Show all" — enough to recognize the trail, short enough
 *  that Browse stays reachable without a long scroll. */
const RECENT_PREVIEW = 8;

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
 *  than assumed to be 66 — a partial edition must not overstate itself. */
function bibleBookCount(volKey) {
  if (typeof BIBLE_AUDIO_MANIFEST === 'undefined' || !BIBLE_AUDIO_MANIFEST) return 0;
  const prefix = volKey + ':';
  let count = 0;
  for (const key in BIBLE_AUDIO_MANIFEST) {
    if (key.lastIndexOf(prefix, 0) === 0) count++;
  }
  return count;
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenCollection: (volKey: string) => void,
 *   onOpenVolumes: () => void,
 *   onOpenSaved: () => void,
 *   onOpenTrack: (track: any) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioLibraryScreen({ onBack, backLabel = 'Home', onOpenCollection, onOpenVolumes, onOpenSaved, onOpenTrack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);
  useAudioPositions();

  // The VOT registry and manifest are lazy. Warming them here lets the browse
  // shelf name real available recordings without duplicating a catalog. The
  // Bible editions ride bundle-a and are NEVER gated behind this.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );

  const [recentOpen, setRecentOpen] = React.useState(readRecentOpen);
  const [recentAll, setRecentAll] = React.useState(false);

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  const recent = library && typeof library.recent === 'function' ? library.recent() : [];
  const collections = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((collection) => collection.cardId) : [];
  const editions = Object.values(BIBLE_AUDIO_EDITIONS);
  const isPlaying = state.status === 'playing';
  const isLoading = state.status === 'loading';
  const active = isPlaying || isLoading;
  const status = isPlaying ? 'Playing now' : isLoading ? 'Connecting...' : 'Paused';
  const currentSaved = !!(current && library && typeof library.isSaved === 'function' && library.isSaved(current));
  // Same rule the mini-player bar applies: a queue of one keeps a real restart
  // control and hides next, rather than showing two dead skips.
  const single = queue.length < 2;
  const shownRecent = recentAll ? recent : recent.slice(0, RECENT_PREVIEW);

  const toggleRecent = () => {
    const next = !recentOpen;
    setRecentOpen(next);
    writeRecentOpen(next);
  };
  const scrollToBrowse = () => {
    const target = typeof document !== 'undefined' ? document.getElementById('audio-library-browse') : null;
    if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  };

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Your listening shelf</div>
          <h1>Listening Library</h1>
          <p className="audio-library-intro">A quiet place for the recordings you return to, the ones you just heard, and every source waiting to be explored.</p>
        </header>

        {current ? (
          <section className={'audio-library-now' + (active ? ' is-active' : '')} aria-labelledby="audio-library-now-title">
            <div className="audio-library-now-art" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <div className="audio-library-now-copy">
              <span>{status}</span>
              <h2 id="audio-library-now-title">{trackName(current)}</h2>
              <small>{trackMeta(current)}</small>
            </div>
            <div className="audio-library-now-actions">
              {/* Transport, not just a play button: the hub is where a listener
                  lands to pick something up, and stepping to the next chapter
                  from here should not require opening the desk. */}
              <button type="button" className="audio-library-icon-button audio-library-step" onClick={() => AudioPlayer.prev()} aria-label={single ? 'Restart current recording' : 'Previous recording'} title={single ? 'Restart' : 'Previous'}>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
              <button type="button" className="audio-library-primary-action" onClick={() => AudioPlayer.toggle()} aria-label={active ? 'Pause current recording' : 'Resume current recording'} aria-busy={isLoading}>
                {active ? <PauseIcon /> : <PlayIcon />}<span>{active ? 'Pause' : 'Resume'}</span>
              </button>
              {single ? null : (
                <button type="button" className="audio-library-icon-button audio-library-step" onClick={() => AudioPlayer.next()} aria-label="Next recording" title="Next">
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              )}
              <button type="button" className={'audio-library-icon-button audio-library-save-button' + (currentSaved ? ' is-saved' : '')} onClick={() => library && library.toggleSaved(current)} aria-label={currentSaved ? 'Remove current recording from saved recordings' : 'Save current recording'} aria-pressed={currentSaved} title={currentSaved ? 'Remove from saved recordings' : 'Save recording'}><StarIcon filled={currentSaved} /></button>
              {hasTextDestination(current) ? <button type="button" className="audio-library-icon-button" onClick={() => onOpenTrack(current)} aria-label="Open current recording text" title="Open text"><TextIcon /></button> : null}
            </div>
            <div className="audio-library-progress-wrap">
              {/* The ONE scrubber (AUDIO-MANAGER.md rule 6). The decorative
                  progressbar this replaces could be read but never moved. */}
              <AudioSeekSlider className="audio-library-seek" ariaLabel="Playback position" time={state.time} duration={state.duration} />
              <div className="audio-library-progress-time"><span>{clock(state.time)}</span><span>{state.duration ? clock(state.duration) : 'Streaming'}</span></div>
            </div>
          </section>
        ) : (
          <section className="audio-library-now audio-library-empty-now" aria-labelledby="audio-library-empty-title">
            <div className="audio-library-now-art" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <div className="audio-library-now-copy">
              <span>Ready when you are</span>
              <h2 id="audio-library-empty-title">Choose your next recording</h2>
              <small>{recent[0] ? 'Your last recording is ready to pick up again.' : 'Save a favorite or browse a source to begin.'}</small>
            </div>
            <div className="audio-library-now-actions">
              <button type="button" className="audio-library-primary-action" onClick={() => recent[0] ? AudioPlayer.playTrack(recent[0]) : scrollToBrowse()}>{recent[0] ? <><PlayIcon /><span>Resume last</span></> : <><ArrowIcon /><span>Browse</span></>}</button>
            </div>
          </section>
        )}

        <section className="audio-library-section audio-library-saved-row" aria-label="Saved recordings">
          <div className="audio-library-shelf">
            <button type="button" className="audio-library-shelf-row" onClick={() => onOpenSaved()}>
              <span className="audio-library-shelf-mark" aria-hidden="true"><StarIcon filled={saved.length > 0} /></span>
              <span className="audio-library-shelf-copy">
                <strong>Saved recordings</strong>
                <small>{saved.length ? saved.length + ' kept · travels with your backup' : 'Tap the star beside any recording to keep it'}</small>
              </span>
              <span className="audio-library-shelf-tail">
                <b>{saved.length}</b>
                <ArrowIcon />
              </span>
            </button>
          </div>
        </section>

        <section className="audio-library-section" aria-labelledby="audio-library-recent">
          <div className="audio-library-section-head">
            <div><span>Pick up again</span><h2 id="audio-library-recent">Recently played</h2><p>{recent.length ? 'Your latest starts, newest first.' : 'Your listening trail will appear here.'}</p></div>
            <div className="audio-library-section-tail">
              <strong aria-label={recent.length + ' recent recordings'}>{recent.length}</strong>
              {recent.length ? <button type="button" className="audio-library-clear" onClick={() => library && library.clearRecent()}>Clear history</button> : null}
              <button
                type="button"
                className={'audio-library-disclosure' + (recentOpen ? ' is-open' : '')}
                onClick={toggleRecent}
                aria-expanded={recentOpen}
                aria-controls="audio-library-recent-list"
                aria-label={recentOpen ? 'Collapse recently played' : 'Expand recently played'}
              >
                <ChevronIcon />
              </button>
            </div>
          </div>
          <div id="audio-library-recent-list">
            {recentOpen ? (
              shownRecent.length ? (
                <>
                  {/* Per-row × (owner directive 2026-08-09): one stray start no
                      longer needs the whole history cleared to be tidied away. */}
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

        <section className="audio-library-section audio-library-browse" aria-labelledby="audio-library-browse">
          <div className="audio-library-section-head"><div><span>Explore the source</span><h2 id="audio-library-browse">Browse the recordings</h2><p>Open a source to hear it letter by letter, or book by book.</p></div></div>

          {/* One doorway per source family (owner directive): the fourteen
              collections live one level in, the way the Scriptures do. */}
          <div className="audio-library-shelf">
            <button type="button" className="audio-library-shelf-row" onClick={() => onOpenVolumes()}>
              <span className="audio-library-shelf-mark" aria-hidden="true">♪</span>
              <span className="audio-library-shelf-copy">
                <strong>The Volumes of Truth</strong>
                <small>{collections.length ? collections.length + ' collections · the Letters read aloud' : 'The Letters read aloud'}</small>
              </span>
              <span className="audio-library-shelf-tail"><ArrowIcon /></span>
            </button>
            {editions.map((edition) => {
              const books = bibleBookCount(edition.volKey);
              return (
                <button key={edition.volKey} type="button" className="audio-library-shelf-row" onClick={() => onOpenCollection(edition.volKey)}>
                  <span className="audio-library-shelf-mark" aria-hidden="true">♪</span>
                  <span className="audio-library-shelf-copy">
                    <strong>{edition.label}</strong>
                    <small>{books ? books + ' books · chapter by chapter' : 'Read chapter by chapter'}</small>
                  </span>
                  <span className="audio-library-shelf-tail"><ArrowIcon /></span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}
