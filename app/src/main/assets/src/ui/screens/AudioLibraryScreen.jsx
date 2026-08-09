/*
   AudioLibraryScreen -- the personal home for saved and recent recordings.

   The surface deliberately owns only discovery and lightweight actions. The
   AudioPlayer remains the single source of truth for transport and queues;
   screen-routes remains the source of truth for text destinations.
*/

import { AudioPlayer } from '../../utils/audio-player.js';

/** @returns {any | null} */
function libraryStore() { return /** @type {any} */ (globalThis).AudioLibraryStore || null; }

/** @param {number} value @returns {string} */
function clock(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return mins + ':' + (rest < 10 ? '0' : '') + rest;
}

/** @param {number} stamp @returns {string} */
function relativePlayedAt(stamp) {
  const delta = Math.max(0, Date.now() - (Number(stamp) || 0));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}

/** @param {any} track @returns {string} */
function trackName(track) { return (track && track.title) || 'Untitled recording'; }

/** @param {any} track @returns {string} */
function trackMeta(track) {
  return [track && track.sub, track && track.partLabel].filter(Boolean).join(' \u00b7 ') || 'The Volumes of Truth';
}

/** @param {any} track @returns {string} */
function trackSearchText(track) {
  return [trackName(track), track && track.sub, track && track.partLabel, track && track.readerCode]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

/** A text destination only exists for VOT collection tracks, not Bible audio. */
function hasTextDestination(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const divider = key.indexOf(':');
  return divider > 0 && typeof COL_BY_KEY !== 'undefined' && !!COL_BY_KEY.get(key.slice(0, divider));
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M7.2 4.4v15.2L19.4 12 7.2 4.4z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M6.6 4.5h4.2v15H6.6zM13.2 4.5h4.2v15h-4.2z" /></svg>;
}

function StarIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.7l2.55 5.17 5.71.83-4.13 4.03.98 5.69L12 16.74l-5.11 2.68.98-5.69-4.13-4.03 5.71-.83L12 3.7z" /></svg>;
}

function TextIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5h14v13H5z" /><path d="M8.5 9h7M8.5 12h7M8.5 15h4.5" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="5.8" /><path d="M15.2 15.2L20 20" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenCollection: (cardId: string) => void,
 *   onOpenTrack: (track: any) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioLibraryScreen({ onBack, backLabel = 'Volumes', onOpenCollection, onOpenTrack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const library = libraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);

  // The registry and manifest are lazy. Warming them here lets the collection
  // shelf name real available recordings without duplicating a catalog.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );

  const state = AudioPlayer.getState();
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const current = queue[state.qi] || null;
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  const recent = library && typeof library.recent === 'function' ? library.recent() : [];
  const collections = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((collection) => collection.cardId) : [];
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = React.useCallback((track) => !normalizedQuery || trackSearchText(track).includes(normalizedQuery), [normalizedQuery]);
  const shownSaved = normalizedQuery ? saved.filter(matchesQuery) : saved;
  const shownRecent = normalizedQuery ? recent.filter(matchesQuery) : recent;
  const isPlaying = state.status === 'playing';
  const isLoading = state.status === 'loading';
  const active = isPlaying || isLoading;
  const status = isPlaying ? 'Playing now' : isLoading ? 'Connecting...' : 'Paused';
  const currentSaved = !!(current && library && typeof library.isSaved === 'function' && library.isSaved(current));
  const progress = current && state.duration > 0 ? Math.min(100, Math.max(0, (state.time / state.duration) * 100)) : 0;

  const playTrack = (track) => {
    if (current && current.url === track.url) AudioPlayer.toggle();
    else AudioPlayer.playTrack(track);
  };
  const scrollToBrowse = () => {
    const target = typeof document !== 'undefined' ? document.getElementById('audio-library-browse') : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const renderRow = (track, source) => {
    const isCurrent = !!(current && current.url === track.url);
    const rowPlaying = isCurrent && active;
    const isSaved = source === 'saved' || !!(library && typeof library.isSaved === 'function' && library.isSaved(track));
    return (
      <article key={track.url} className={'audio-library-row' + (isCurrent ? ' is-current' : '')}>
        <button
          type="button"
          className={'audio-library-row-play' + (rowPlaying ? ' is-playing' : '')}
          onClick={() => playTrack(track)}
          aria-label={(rowPlaying ? 'Pause ' : 'Play ') + trackName(track)}
          aria-pressed={rowPlaying}
        >
          {rowPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="audio-library-row-copy">
          <strong>{trackName(track)}</strong>
          <small>{trackMeta(track)}</small>
        </div>
        <div className="audio-library-row-actions">
          {source === 'recent' ? <span title={new Date(track.playedAt).toLocaleString()}>{relativePlayedAt(track.playedAt)}</span> : <span>{isSaved ? 'Saved' : ''}</span>}
          {hasTextDestination(track) ? <button type="button" className="audio-library-icon-button" onClick={() => onOpenTrack(track)} aria-label={'Open text for ' + trackName(track)} title="Open text"><TextIcon /></button> : null}
          <button
            type="button"
            className={'audio-library-icon-button audio-library-save-button' + (isSaved ? ' is-saved' : '')}
            onClick={() => library && library.toggleSaved(track)}
            aria-label={isSaved ? 'Remove ' + trackName(track) + ' from saved recordings' : 'Save ' + trackName(track)}
            aria-pressed={isSaved}
            title={isSaved ? 'Remove from saved recordings' : 'Save recording'}
          >
            <StarIcon filled={isSaved} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Your listening shelf</div>
          <div className="audio-library-title-row">
            <div>
              <h1>Listening Library</h1>
              <p className="audio-library-intro">A quiet place for the recordings you return to, the ones you just heard, and every Volume waiting to be explored.</p>
            </div>
            <div className="audio-library-summary" aria-label="Listening Library summary">
              <span><b>{saved.length}</b> saved</span>
              <span><b>{recent.length}</b> recent</span>
            </div>
          </div>
          <div className="audio-library-search">
            <SearchIcon />
            <label>
              <span className="sr-only">Search saved and recent recordings</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a recording" />
            </label>
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear recording search">Clear</button> : null}
          </div>
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
              <button type="button" className="audio-library-primary-action" onClick={() => AudioPlayer.toggle()} aria-label={active ? 'Pause current recording' : 'Resume current recording'} aria-busy={isLoading}>
                {active ? <PauseIcon /> : <PlayIcon />}<span>{active ? 'Pause' : 'Resume'}</span>
              </button>
              <button type="button" className={'audio-library-icon-button audio-library-save-button' + (currentSaved ? ' is-saved' : '')} onClick={() => library && library.toggleSaved(current)} aria-label={currentSaved ? 'Remove current recording from saved recordings' : 'Save current recording'} aria-pressed={currentSaved} title={currentSaved ? 'Remove from saved recordings' : 'Save recording'}><StarIcon filled={currentSaved} /></button>
              {hasTextDestination(current) ? <button type="button" className="audio-library-icon-button" onClick={() => onOpenTrack(current)} aria-label="Open current recording text" title="Open text"><TextIcon /></button> : null}
            </div>
            <div className="audio-library-progress-wrap">
              <div className="audio-library-progress" role="progressbar" aria-label="Playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: progress + '%' }} /></div>
              <div className="audio-library-progress-time"><span>{clock(state.time)}</span><span>{state.duration ? clock(state.duration) : 'Streaming'}</span></div>
            </div>
          </section>
        ) : (
          <section className="audio-library-now audio-library-empty-now" aria-labelledby="audio-library-empty-title">
            <div className="audio-library-now-art" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <div className="audio-library-now-copy">
              <span>Ready when you are</span>
              <h2 id="audio-library-empty-title">Choose your next recording</h2>
              <small>{recent[0] ? 'Your last recording is ready to pick up again.' : 'Save a favorite or browse a collection to begin.'}</small>
            </div>
            <div className="audio-library-now-actions">
              <button type="button" className="audio-library-primary-action" onClick={() => recent[0] ? AudioPlayer.playTrack(recent[0]) : scrollToBrowse()}>{recent[0] ? <><PlayIcon /><span>Resume last</span></> : <><ArrowIcon /><span>Browse</span></>}</button>
            </div>
          </section>
        )}

        <section className="audio-library-section" aria-labelledby="audio-library-saved">
          <div className="audio-library-section-head">
            <div><span>Keep close</span><h2 id="audio-library-saved">Saved recordings</h2><p>{saved.length ? 'The recordings you chose to keep.' : 'Your favorites will wait here.'}</p></div>
            <strong aria-label={saved.length + ' saved recordings'}>{shownSaved.length}{normalizedQuery && shownSaved.length !== saved.length ? <small> of {saved.length}</small> : null}</strong>
          </div>
          {shownSaved.length ? <div className="audio-library-list">{shownSaved.map((track) => renderRow(track, 'saved'))}</div> : <div className="audio-library-empty">{normalizedQuery ? <>No saved recordings match <b>&ldquo;{query.trim()}&rdquo;</b>.</> : <>Use the star beside any recording to keep it here. Saved recordings travel with your VOTReader backup.</>}</div>}
        </section>

        <section className="audio-library-section" aria-labelledby="audio-library-recent">
          <div className="audio-library-section-head">
            <div><span>Pick up again</span><h2 id="audio-library-recent">Recently played</h2><p>{recent.length ? 'Your latest starts, newest first.' : 'Your listening trail will appear here.'}</p></div>
            {recent.length ? <button type="button" className="audio-library-clear" onClick={() => library && library.clearRecent()}>Clear history</button> : null}
          </div>
          {shownRecent.length ? <div className="audio-library-list">{shownRecent.map((track) => renderRow(track, 'recent'))}</div> : <div className="audio-library-empty">{normalizedQuery ? <>No recent recordings match <b>&ldquo;{query.trim()}&rdquo;</b>.</> : <>Start a recording and it will appear here, ready for an easy return.</>}</div>}
        </section>

        <section className="audio-library-section audio-library-browse" aria-labelledby="audio-library-browse">
          <div className="audio-library-section-head"><div><span>Explore the source</span><h2 id="audio-library-browse">Choose a collection</h2><p>Open a Volume to see every available recording in context.</p></div></div>
          <div className="audio-library-collections">
            {collections.map((collection) => {
              const available = AudioPlayer.collectionHasAudio(collection.volKey);
              return (
                <button key={collection.volKey} type="button" onClick={() => onOpenCollection(collection.cardId)}>
                  <span className="audio-library-collection-mark" aria-hidden="true">{available ? '♪' : '○'}</span>
                  <span className="audio-library-collection-copy"><strong>{collection.label}</strong><small>{available ? 'Recordings available' : 'Open collection'}</small></span>
                  <b aria-hidden="true"><ArrowIcon /></b>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}
