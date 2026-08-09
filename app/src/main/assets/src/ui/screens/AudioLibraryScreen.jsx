/*
   AudioLibraryScreen — saved recordings, recent listening, and a single
   browse entry point into the existing Volumes hierarchy.

   It deliberately stores no corpus copy and owns no audio element. Corpus
   navigation remains in screen-routes; playback remains in AudioPlayer.
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

/**
 * @param {{
 *   onBack: () => void,
 *   onOpenCollection: (cardId: string) => void,
 *   onOpenTrack: (track: any) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioLibraryScreen({ onBack, onOpenCollection, onOpenTrack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const library = libraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);

  // The registry and manifest are lazy. Warming them here lets the collection
  // shelf name real available recordings without recreating a second catalog.
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
  const status = state.status === 'playing' ? 'Playing now' : state.status === 'loading' ? 'Connecting…' : 'Paused';

  const trackActions = (track, source) => (
    <div className="audio-library-row-actions">
      {track.key ? <button type="button" onClick={() => onOpenTrack(track)} aria-label={'Open text for ' + trackName(track)}>Text</button> : null}
      {source === 'saved' ? <button type="button" onClick={() => library && library.toggleSaved(track)} aria-label={'Remove ' + trackName(track) + ' from saved recordings'}>Remove</button> : null}
    </div>
  );

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel: 'Volumes', showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <div className="audio-library-eyebrow">Your listening shelf</div>
        <h1>Listening Library</h1>
        <p className="audio-library-intro">Pick up a recording, keep favorites close, and browse the Volumes without leaving the shared player behind.</p>

        {current ? (
          <section className="audio-library-now" aria-label="Current recording">
            <div className="audio-library-now-mark" aria-hidden="true">▶</div>
            <div>
              <span>{status}</span>
              <strong>{trackName(current)}</strong>
              <small>{[current.sub, current.partLabel].filter(Boolean).join(' · ') || 'The Volumes of Truth'}</small>
            </div>
            <button type="button" onClick={() => AudioPlayer.toggle()} aria-label={state.status === 'playing' ? 'Pause current recording' : 'Resume current recording'}>
              {state.status === 'playing' ? 'Pause' : 'Resume'}
            </button>
            {state.duration ? <em>{clock(state.time) + ' / ' + clock(state.duration)}</em> : null}
          </section>
        ) : (
          <section className="audio-library-now audio-library-empty-now">
            <div className="audio-library-now-mark" aria-hidden="true">♫</div>
            <div><span>Ready when you are</span><strong>No recording selected</strong><small>Choose a saved recording or browse a collection below.</small></div>
          </section>
        )}

        <section className="audio-library-section" aria-labelledby="audio-library-saved">
          <div className="audio-library-section-head">
            <div><span>Keep close</span><h2 id="audio-library-saved">Saved recordings</h2></div>
            <strong>{saved.length}</strong>
          </div>
          {saved.length ? (
            <div className="audio-library-list">
              {saved.map((track) => (
                <article key={track.url} className="audio-library-row">
                  <button type="button" className="audio-library-row-copy" onClick={() => AudioPlayer.playTrack(track)} aria-label={'Play ' + trackName(track)}>
                    <strong>{trackName(track)}</strong>
                    <small>{[track.sub, track.partLabel].filter(Boolean).join(' · ') || 'The Volumes of Truth'}</small>
                  </button>
                  {trackActions(track, 'saved')}
                </article>
              ))}
            </div>
          ) : <p className="audio-library-empty">Use Save in the listening controls to keep a recording here. Saved recordings are included in your VOTReader backup.</p>}
        </section>

        <section className="audio-library-section" aria-labelledby="audio-library-recent">
          <div className="audio-library-section-head">
            <div><span>Pick up again</span><h2 id="audio-library-recent">Recently played</h2></div>
            {recent.length ? <button type="button" onClick={() => library && library.clearRecent()}>Clear history</button> : null}
          </div>
          {recent.length ? (
            <div className="audio-library-list">
              {recent.map((track) => (
                <article key={track.url} className="audio-library-row">
                  <button type="button" className="audio-library-row-copy" onClick={() => AudioPlayer.playTrack(track)} aria-label={'Play ' + trackName(track)}>
                    <strong>{trackName(track)}</strong>
                    <small>{[track.sub, track.partLabel].filter(Boolean).join(' · ') || 'The Volumes of Truth'}</small>
                  </button>
                  <div className="audio-library-row-actions">
                    <span>{relativePlayedAt(track.playedAt)}</span>
                    {track.key ? <button type="button" onClick={() => onOpenTrack(track)} aria-label={'Open text for ' + trackName(track)}>Text</button> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="audio-library-empty">Recordings you start will appear here, with the latest one first.</p>}
        </section>

        <section className="audio-library-section audio-library-browse" aria-labelledby="audio-library-browse">
          <div className="audio-library-section-head"><div><span>Browse the source</span><h2 id="audio-library-browse">Collections</h2></div></div>
          <div className="audio-library-collections">
            {collections.map((collection) => {
              const available = AudioPlayer.collectionHasAudio(collection.volKey);
              return (
                <button key={collection.volKey} type="button" onClick={() => onOpenCollection(collection.cardId)}>
                  <span>{collection.label}</span>
                  <small>{available ? 'Browse recordings' : 'Browse collection'}</small>
                  <b aria-hidden="true">›</b>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}
