/* CollectionScreen - one collection's page in v2 (picture 2a-collection; Back names Home): the overline and title, the
   count and years, Play all and Download, then the preface and every letter, each with its play button and its state
   (playing, finished, minutes left; collection-facts.js reads them from main's stores, read only).

   Listening goes through main's one engine (the AudioPlayer global), as main's volume index does: Play all queues the
   whole collection, a row's play queues it from that letter (the player picks up a saved place), the playing row's
   button pauses. Download hands the collection's recordings to main's downloads (OfflineAudio), shown only where this
   device can keep them. A gate boot draws the same page and never touches the player or the downloads. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { collectionOf, useLetters } from './LetterScreen.jsx';
import { useNowPlaying } from '../now-playing.js';
import {
  collectionHead, collectionEntries, collectionLede, rowWords, isPlayingRow, savedProgress, downloadList,
} from '../collection-facts.js';

const g = /** @type {any} */ (globalThis);

/** The playing row's bars, as drawn. */
const EQ = <span className="eq"><i style={{ height: 7 }} /><i style={{ height: 12 }} /><i style={{ height: 9 }} /></span>;

/** main's downloads where this device can keep recordings (the APK, or a browser that keeps them), else null. */
function useDownloads(gate) {
  const off = gate ? null : g.OfflineAudio;
  React.useSyncExternalStore(
    React.useCallback((cb) => (off && typeof off.subscribe === 'function' ? off.subscribe(cb) : () => {}), [off]),
    () => (off && typeof off.getVersion === 'function' ? off.getVersion() : 0),
  );
  return off && typeof off.available === 'function' && off.available() ? off : null;
}

/**
 * @param {{ e: import('../collection-facts.js').Entry, playing: boolean, paused: boolean, words: string,
 *   onOpen: () => void, onPlay: () => void }} props
 */
function LetterRow({ e, playing, paused, words, onOpen, onPlay }) {
  const live = playing && !paused;
  return (
    <div className={'row num-row' + (playing ? ' playing' : '')}>
      <span className="no">{e.no}</span>
      <button type="button" className="tx" onClick={onOpen}>
        <span className="t">{e.title}</span>
        {words && <span className="s">{live && EQ}{words}</span>}
      </button>
      <button type="button" className={'rp' + (playing ? ' on' : '')} aria-label={(live ? 'Pause ' : 'Play ') + e.title} onClick={onPlay}>
        <Icon name={live ? 'pause' : 'play'} size={16} />
      </button>
    </div>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function CollectionScreen({ route, gate, go, onReady }) {
  const col = collectionOf(route.collection);
  const letters = useLetters(col);
  const np = useNowPlaying(gate);
  const off = useDownloads(gate);
  const entries = React.useMemo(() => (letters ? collectionEntries(col) : []), [col, letters]);
  // the saved places move when the loaded recording changes, so they are read again then
  const progress = React.useMemo(
    () => (gate ? (gate.facts && gate.facts.progress) || {} : col ? savedProgress(col, entries) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate, col, entries, np],
  );
  const loaded = !!letters || !col;
  React.useEffect(() => { if (loaded) onReady(); }, [loaded, onReady]);
  if (!loaded) return null;
  if (!col) return <div className="empty"><div className="t">This collection could not be opened.</div></div>;

  const head = collectionHead(col);
  const player = gate ? null : g.AudioPlayer;
  const hasAudio = gate ? true : !!(player && typeof player.collectionHasAudio === 'function' && player.collectionHasAudio(col.volKey));
  const items = entries.map((e) => e.item);
  const play = (startId) => {
    if (!player) return;
    player.playCollection(startId ? { volKey: col.volKey, items, collectionLabel: col.label, startId }
      : { volKey: col.volKey, items, collectionLabel: col.label });
  };
  const open = (e) => () => go(e.preface ? { place: 'letter', collection: col.volKey, preface: true }
    : { place: 'letter', collection: col.volKey, n: e.n });
  const playRow = (e, current) => () => {
    if (!player) return;
    if (current) player.toggle();
    else play(e.id);
  };

  return (
    <>
      <div className="page-head g">
        {head.eyebrow && <span className="overline eyebrow">{head.eyebrow}</span>}
        <h1 className="display">{head.title}</h1>
        {entries.length > 0 && <p className="lede">{collectionLede(col, entries)}</p>}
        {entries.length > 0 && (hasAudio || gate || off) && (
          <div className="actions">
            {hasAudio && <button type="button" className="pill sm2" onClick={() => play(null)}><Icon name="play" size={20} />Play all</button>}
            {(gate || (off && hasAudio)) && (
              <button type="button" className="btn2" onClick={() => { if (off) off.download(downloadList(col, entries)); }}>
                <Icon name="downCircle" />Download
              </button>
            )}
          </div>
        )}
      </div>
      {entries.length === 0
        ? <div className="empty"><div className="t">These letters could not be loaded.</div></div>
        : (
          <div className="rows end">
            {entries.map((e) => {
              const current = isPlayingRow(e, np, col.volKey);
              const paused = current && !!(np && np.paused);
              return (
                <LetterRow key={e.key} e={e} playing={current} paused={paused}
                  words={rowWords(e, { playing: current, paused, progress: progress[e.key] || null })}
                  onOpen={open(e)} onPlay={playRow(e, current)} />
              );
            })}
          </div>
        )}
    </>
  );
}

const COLLECTION_ACTIONS = <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>;

definePlace('collection', {
  Screen: CollectionScreen,
  // Back on a letter says the collection's name
  title: (r) => {
    const col = collectionOf(r.collection);
    return col ? col.label : '';
  },
  actions: () => COLLECTION_ACTIONS,
});
