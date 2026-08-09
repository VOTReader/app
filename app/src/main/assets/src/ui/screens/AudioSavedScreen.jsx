/*
   AudioSavedScreen -- the full shelf of kept recordings.

   Split out of the Listening Library hub so the hub can stay a menu. The
   recording search lives HERE, where the list it filters actually is; the
   hub carries only the one row that leads to it.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioShelfRow, SearchIcon, audioLibraryStore, trackSearchText } from '../components/AudioShelf.jsx';

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenTrack: (track: any) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioSavedScreen({ onBack, backLabel = 'Listening Library', onOpenTrack, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const library = audioLibraryStore();
  React.useSyncExternalStore(
    React.useCallback((callback) => library && typeof library.subscribe === 'function' ? library.subscribe(callback) : () => {}, [library]),
    React.useCallback(() => library && typeof library.getVersion === 'function' ? library.getVersion() : 0, [library])
  );
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);

  const [query, setQuery] = React.useState('');
  const saved = library && typeof library.saved === 'function' ? library.saved() : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shown = normalizedQuery ? saved.filter((track) => trackSearchText(track).includes(normalizedQuery)) : saved;

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>Saved recordings</h1>
          <p className="audio-library-intro">The recordings you chose to keep — they travel with your VOTReader backup.</p>
          <div className="audio-library-search">
            <SearchIcon />
            <label>
              <span className="sr-only">Search saved recordings</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a recording" />
            </label>
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear recording search">Clear</button> : null}
          </div>
        </header>

        <section className="audio-library-section" aria-labelledby="audio-saved-list">
          <div className="audio-library-section-head">
            <div><span>Keep close</span><h2 id="audio-saved-list">Your shelf</h2><p>{saved.length ? 'Starred recordings, newest first.' : 'Your favorites will wait here.'}</p></div>
            <strong aria-label={saved.length + ' saved recordings'}>{shown.length}{normalizedQuery && shown.length !== saved.length ? <small> of {saved.length}</small> : null}</strong>
          </div>
          {shown.length ? (
            <div className="audio-library-list">{shown.map((track) => <AudioShelfRow key={track.url} track={track} source="saved" onOpenTrack={onOpenTrack} />)}</div>
          ) : (
            <div className="audio-library-empty">
              {normalizedQuery
                ? <>No saved recordings match <b>&ldquo;{query.trim()}&rdquo;</b>.</>
                : <>Use the star beside any recording to keep it here. Saved recordings travel with your VOTReader backup.</>}
            </div>
          )}
        </section>
      </div>
    </ScreenLayout>
  );
}
