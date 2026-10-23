/*
   AudioVolumesScreen -- the Volumes of Truth as ONE listening source family.

   The hub's Browse offers one doorway per source (owner directive
   2026-08-09: the fourteen collections must not splay across the hub the way
   they briefly did — the Volumes enter like the Scriptures do). This screen
   is that doorway's inside: the collection list, each row opening its
   recordings screen.
*/

import { useOfflineAudio, useOnline } from '../components/OfflineAudioControls.jsx';
import { queueTime } from '../components/PlayerSheets.jsx';
import { lengthsReady, lengthsStore } from '../../utils/audio-lengths.js';
import { itemNoun, tracksSeconds } from './AudioCollectionScreen.jsx';

/* Cluster H (the Listening Library) - bundle-d since lz1 (2026-10-13); it
   rode lazy bundle-h from 2026-09-22, landing 24, and the player itself did
   NOT come along: AudioPlayer, the AudioShelf rows, icons
   and position hook, AudioSeekSlider, CoverageBadge and the audio tables stay
   in bundle-d, where AudioPlayerBar and AudioManagerSheet reach them on every
   screen. This file reads them as free globals at call time — one player, one
   shelf, one copy of each table. */

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
  // Not the 1 Hz clock: nothing here draws it (s18.3).
  React.useSyncExternalStore(AudioPlayer.subscribe, AudioPlayer.getShape);
  const online = useOnline();
  const off = useOfflineAudio();
  /** Recordings of this collection on the phone (counted by letter, as the rows are). @param {string} volKey */
  const onPhone = (volKey) => (off ? new Set(off.items().filter((it) => it.key.startsWith(volKey + ':')).map((it) => it.key)).size : 0);
  /** Its recordings, counted as its screen counts them (the preface and each letter once), or 0 when unknown. @param {any} col */
  const recorded = (col) => {
    if (typeof colLetterArr !== 'function' || typeof AudioPlayer.hasAudio !== 'function') return 0;
    const pre = typeof colPreface === 'function' ? colPreface(col) : null;
    return [pre, ...(colLetterArr(col) || [])].filter((it) => it && it.id && AudioPlayer.hasAudio(col.volKey, it.id)).length;
  };

  // Warm the lazy VOT corpus so the availability sub-lines can answer.
  /** U04.1: "30 letters · 6 h 10 min" from the baked lengths, '' until they are known. @param {any} col */
  const sizeLine = (col) => {
    if (typeof colLetterArr !== 'function' || typeof AudioPlayer.renditionsFor !== 'function') return '';
    const pre = typeof colPreface === 'function' ? colPreface(col) : null;
    const items = [pre, ...(colLetterArr(col) || [])].filter((it) => it && it.id && AudioPlayer.hasAudio(col.volKey, it.id));
    let total = 0;
    for (const it of items) {
      const s = tracksSeconds((AudioPlayer.renditionsFor(col.volKey, it, col.label)[0] || { tracks: [] }).tracks);
      if (!s) return '';
      total += s;
    }
    return items.length && total ? items.length + ' ' + itemNoun(col, items.length) + ' · ' + queueTime(total) : '';
  };

  React.useEffect(() => {
    if (typeof window.__loadVotCorpus === 'function') void window.__loadVotCorpus();
    void lengthsReady();
  }, []);
  React.useSyncExternalStore(lengthsStore.subscribe, lengthsStore.getVersion);
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
            <strong><span aria-hidden="true">{collections.length}</span><span className="sr-only">{collections.length + ' collections'}</span></strong>
          </div>
          <div className="audio-library-shelf">
            {collections.map((collection) => {
              const available = votReady && AudioPlayer.collectionHasAudio(collection.volKey);
              // With no signal only what is on the phone plays (RC.3; downloads brief section 7 item 16): the row says
              // how much of this collection that is, not "Recordings available" over rows that need a connection.
              // Online too, a collection with some of it on the phone says so (downloads brief 3h, picture 14's mark).
              const here = available ? onPhone(collection.volKey) : 0;
              const total = here ? recorded(collection) : 0;
              const held = !here ? '' : total && here >= total ? 'All ' + total + ' on this phone' : here + (total ? ' of ' + total : '') + ' on this phone';
              return (
                <button key={collection.volKey} type="button" className="audio-library-shelf-row" onClick={() => onOpenCollection(collection.volKey)}>
                  <span className="audio-library-shelf-mark" aria-hidden="true">{available ? '♪' : '○'}</span>
                  <span className="audio-library-shelf-copy">
                    <strong>{collection.label}</strong>
                    <small>{!votReady ? 'Loading recordings…' : !available ? 'No recordings yet'
                      : online ? held || sizeLine(collection) || 'Recordings available'
                        : here ? held + (total && here >= total ? '' : ' · the rest need a connection') : 'Needs a connection'}</small>
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
