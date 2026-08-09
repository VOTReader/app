/*
   AudioVolumesScreen -- the Volumes of Truth as ONE listening source family.

   The hub's Browse offers one doorway per source (owner directive
   2026-08-09: the fourteen collections must not splay across the hub the way
   they briefly did — the Volumes enter like the Scriptures do). This screen
   is that doorway's inside: the collection list, each row opening its
   recordings screen.
*/

import { AudioPlayer } from '../../utils/audio-player.js';
import { ArrowIcon } from '../components/AudioShelf.jsx';

/** The VOT audio manifest rides the lazy corpus — until it lands, no
 *  collection can honestly claim to have (or lack) recordings. */
function votAudioReady() {
  return typeof AUDIO_MANIFEST !== 'undefined' && !!AUDIO_MANIFEST;
}

/**
 * @param {{
 *   onBack: () => void,
 *   backLabel?: string,
 *   onOpenCollection: (volKey: string) => void,
 *   onSearch: () => void,
 *   onHistory: () => void,
 *   onSettings: () => void,
 *   theme: any,
 *   onThemeChange: (theme: any) => void,
 * }} props
 */
export function AudioVolumesScreen({ onBack, backLabel = 'Listening Library', onOpenCollection, onSearch, onHistory, onSettings, theme, onThemeChange }) {
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getVersion);

  // Warm the lazy VOT corpus so the availability sub-lines can answer.
  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
  }, []);
  React.useSyncExternalStore(
    React.useCallback((callback) => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.subscribe(callback) : () => {}, []),
    () => typeof window.__votCorpus !== 'undefined' ? window.__votCorpus.getVersion() : 0
  );

  const collections = typeof COLLECTIONS !== 'undefined' ? COLLECTIONS.filter((collection) => collection.cardId) : [];
  const votReady = votAudioReady();

  return (
    <ScreenLayout
      navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}
    >
      <div className="audio-library-screen">
        <header className="audio-library-hero">
          <div className="audio-library-eyebrow">Listening Library</div>
          <h1>The Volumes of Truth</h1>
          <p className="audio-library-intro">Choose a collection to hear it letter by letter, in reading order.</p>
        </header>

        <section className="audio-library-section" aria-labelledby="audio-volumes-list">
          <div className="audio-library-section-head">
            <div><span>Collection by collection</span><h2 id="audio-volumes-list">Collections</h2></div>
            <strong aria-label={collections.length + ' collections'}>{collections.length}</strong>
          </div>
          <div className="audio-library-shelf">
            {collections.map((collection) => {
              const available = votReady && AudioPlayer.collectionHasAudio(collection.volKey);
              return (
                <button key={collection.volKey} type="button" className="audio-library-shelf-row" onClick={() => onOpenCollection(collection.volKey)}>
                  <span className="audio-library-shelf-mark" aria-hidden="true">{available ? '♪' : '○'}</span>
                  <span className="audio-library-shelf-copy">
                    <strong>{collection.label}</strong>
                    <small>{!votReady ? 'Loading recordings…' : available ? 'Recordings available' : 'No recordings yet'}</small>
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
