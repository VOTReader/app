/* CollectionScreen - one collection's page in v2 (picture 2a-collection; Back names Home): the overline and title, the
   count and years, Play all and Download, then the preface and every letter, each with its play button and its state
   (playing, finished, minutes left; collection-facts.js reads them from main's stores, read only).

   Listening goes through main's one engine (the AudioPlayer global), as main's volume index does: Play all queues the
   whole collection, a row's play queues it from that letter (the player picks up a saved place), the playing row's
   button pauses. Download hands the collection's recordings to main's downloads (OfflineAudio), shown only where this
   device can keep them. While any row is on its way a queue bar sticks above the rows ("Downloading 12 of 29", Pause),
   each row says where its recording stands (on this phone, downloading, couldn't download with Retry, waiting for
   Wi-Fi: offline-facts.js, zv1 4c), and with no connection a toast says the downloads go on later. A gate boot draws the
   same page and never touches the player or the downloads. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { collectionOf, useLettersLoad } from './LetterScreen.jsx';
import { CouldNotOpen } from './CouldNotOpen.jsx';
import { useNowPlaying } from '../now-playing.js';
import { LayerToast } from '../Sheet.jsx';
import {
  collectionHead, collectionEntries, collectionLede, rowWords, isPlayingRow, savedProgress, downloadList, coverageMark,
} from '../collection-facts.js';
import {
  rowItems, rowDownload, downloadQueue, queueWords, downloadWords, useOnline, OFFLINE_DOWNLOADS,
} from '../offline-facts.js';

const g = /** @type {any} */ (globalThis);

/** The playing row's bars, as drawn. */
const EQ = <span className="eq"><i style={{ height: 7 }} /><i style={{ height: 12 }} /><i style={{ height: 9 }} /></span>;

/** A row's download ring, filled to its percent (the picture's 2 px ring). @param {{ percent: number }} props */
function Ring({ percent }) {
  const c = 2 * Math.PI * 8;
  return (
    <svg className="ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="trk" cx="10" cy="10" r="8" />
      <circle className="arc" cx="10" cy="10" r="8" strokeDasharray={(c * percent) / 100 + ' ' + c} transform="rotate(-90 10 10)" />
    </svg>
  );
}

/** The download part of a row's line, with its icon; a failed row's Retry. */
function DownloadState({ d, onRetry }) {
  return (
    <span className={'st' + (d.bad ? ' bad' : '')}>
      {d.kind === 'saved' && <Icon name="checkCircle" />}
      {d.kind === 'downloading' && <Ring percent={d.percent} />}
      {d.kind === 'failed' && <Icon name="alert" />}
      {d.text}
      {d.kind === 'failed' && <>{' · '}<button type="button" className="retry" onClick={onRetry}>Retry</button></>}
    </span>
  );
}

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
 *   dl: any, onOpen: () => void, onPlay: (() => void) | null, onRetry: () => void }} props
 *   dl the download part of the line (dlWords); onPlay null: no recording, no Play
 */
function LetterRow({ e, playing, paused, words, dl, onOpen, onPlay, onRetry }) {
  const live = playing && !paused;
  // a row on its way or failed says only that (after Playing / Paused); otherwise its state follows the date
  const lead = dl && dl.alone ? (playing ? (paused ? 'Paused' : 'Playing') : '') : words;
  const line = (lead || dl) && (
    <span className="s">{live && EQ}{lead}{lead && dl ? ' · ' : ''}{dl && <DownloadState d={dl} onRetry={onRetry} />}</span>
  );
  return (
    <div className={'row num-row' + (playing ? ' playing' : '')} data-key={e.key}>
      <span className="no">{e.no}</span>
      {dl && dl.kind === 'failed' ? (
        // Retry is its own button, so the title alone opens the letter (no button inside a button)
        <div className="tx">
          <button type="button" className="tx-open" onClick={onOpen}><span className="t">{e.title}</span></button>
          {line}
        </div>
      ) : (
        <button type="button" className="tx" onClick={onOpen}>
          <span className="t">{e.title}</span>
          {line}
        </button>
      )}
      {onPlay && (
        <button type="button" className={'rp' + (playing ? ' on' : '')} aria-label={(live ? 'Pause ' : 'Play ') + e.title} onClick={onPlay}>
          <Icon name={live ? 'pause' : 'play'} size={16} />
        </button>
      )}
    </div>
  );
}

/** @param {import('../places.js').PlaceProps} props */
/**
 * A collection's page; the collection 'answers' (a route Home Recent or Search's Go to builds) has its own home
 * (AnswersScreens.jsx, 2g) and is turned into it. @param {import('../places.js').PlaceProps} props
 */
export function CollectionScreen(props) {
  const answers = props.route.collection === 'answers';
  const { replace } = props;
  React.useEffect(() => { if (answers && replace) replace({ place: 'answers' }); }, [answers, replace]);
  return answers ? null : <VolumeScreen {...props} />;
}

/** @param {import('../places.js').PlaceProps} props */
function VolumeScreen({ route, gate, go, onReady }) {
  const col = collectionOf(route.collection);
  const { letters, failed: lettersFailed, retry: lettersRetry } = useLettersLoad(col);
  const np = useNowPlaying(gate);
  const off = useDownloads(gate);
  const online = useOnline(gate);
  const [toastGone, setToastGone] = React.useState(false);
  const entries = React.useMemo(() => (letters ? collectionEntries(col) : []), [col, letters]);
  // each row's recordings, as its own Play plays them (a gate boot asks nothing of the player)
  const items = React.useMemo(() => {
    /** @type {Record<string, Array<{ url: string, key: string, title: string }>>} */
    const out = {};
    if (!gate) for (const e of entries) out[e.key] = rowItems(col, e);
    return out;
  }, [gate, col, entries]);
  // the saved places move when the loaded recording changes, so they are read again then
  const progress = React.useMemo(
    () => (gate ? (gate.facts && gate.facts.progress) || {} : col ? savedProgress(col, entries) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate, col, entries, np],
  );
  const loaded = !!letters || !col;
  React.useEffect(() => { if (loaded) onReady(); }, [loaded, onReady]);
  if (!loaded) return null;
  if (!col || lettersFailed) return <CouldNotOpen what="collection" retry={lettersFailed ? lettersRetry : null} />;

  const head = collectionHead(col);
  const player = gate ? null : g.AudioPlayer;
  const hasAudio = gate ? true : !!(player && typeof player.collectionHasAudio === 'function' && player.collectionHasAudio(col.volKey));
  const letterItems = entries.map((e) => e.item);
  // a letter with no recording in a collection that has some says so and has no Play (dz16); a gate's are all recorded
  const unrecorded = (e) => !gate && hasAudio && !(items[e.key] || []).length;
  const letterRows = entries.filter((e) => !e.preface);
  const mark = hasAudio ? coverageMark(letterRows.filter((e) => !unrecorded(e)).length, letterRows.length) : null;
  const play = (startId) => {
    if (!player) return;
    player.playCollection(startId ? { volKey: col.volKey, items: letterItems, collectionLabel: col.label, startId }
      : { volKey: col.volKey, items: letterItems, collectionLabel: col.label });
  };
  // where each row's recording stands, and the queue across the page (a gate boot: its picture's)
  const gd = gate && gate.facts ? gate.facts.downloads : null;
  /** @type {Record<string, import('../offline-facts.js').RowDownload | null>} */
  const dls = {};
  for (const e of entries) {
    dls[e.key] = gd ? (gd.rows && gd.rows[e.key]) || null : off ? rowDownload(off, (items[e.key] || []).map((t) => t.url)) : null;
  }
  const queue = gd ? gd.queue || null : downloadQueue(entries.filter((e) => (items[e.key] || []).length).map((e) => dls[e.key]));
  // Pause stops what is still to come; Download picks it up again (what is on the phone is skipped)
  const pause = () => {
    if (!off) return;
    off.cancel(entries.flatMap((e) => (items[e.key] || []).map((t) => t.url))
      .filter((u) => { const st = off.statusOf(u); return st === 'downloading' || st === 'queued'; }));
  };
  const retry = (e) => () => { if (off) off.download(items[e.key] || []); };
  const toast = queue && !online && !toastGone ? OFFLINE_DOWNLOADS : null;
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
        {entries.length > 0 && (
          <p className="lede">
            {collectionLede(col, entries)}
            {mark && <>{' · '}<span className="st cov"><Icon name="readalong" />{mark}</span></>}
          </p>
        )}
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
      {queue && (
        <div className="g dl-head">
          <div className="dl-bar"><span>{queueWords(queue)}</span><button type="button" className="textbtn sm" onClick={pause}>Pause</button></div>
          <div className="dl-prog" role="progressbar" aria-label={queueWords(queue)} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={queue.percent}><i style={{ width: queue.percent + '%' }} /></div>
        </div>
      )}
      {entries.length === 0
        ? <div className="empty"><div className="t">These letters could not be loaded.</div></div>
        : (
          <div className="rows end">
            {entries.map((e) => {
              const current = isPlayingRow(e, np, col.volKey);
              const paused = current && !!(np && np.paused);
              const none = !current && unrecorded(e);
              return (
                <LetterRow key={e.key} e={e} playing={current} paused={paused}
                  words={rowWords(e, { playing: current, paused, progress: progress[e.key] || null, unrecorded: none })}
                  dl={dlWords(dls[e.key])} onOpen={open(e)} onPlay={none ? null : playRow(e, current)} onRetry={retry(e)} />
              );
            })}
          </div>
        )}
      <LayerToast text={toast} act="OK" onAct={() => setToastGone(true)} />
    </>
  );
}

/** downloadWords plus the ring's percent. @param {import('../offline-facts.js').RowDownload | null} d */
function dlWords(d) {
  const w = downloadWords(d);
  return w && d && d.kind === 'downloading' ? { ...w, percent: d.percent } : w;
}

definePlace('collection', {
  Screen: CollectionScreen,
  // Back on a letter says the collection's name as its page heads it ("Words To Live By" for either part, picture 1d)
  title: (r) => {
    const col = collectionOf(r.collection);
    return col ? collectionHead(col).title : '';
  },
});
