/* JournalBlocks - what a journal entry's blocks look like on its page (mw9, design dz20 3n): a card (a letter, a chapter,
   an excerpt, a bookmark, a note, another entry, a notebook), the divider, a picture and a voice memo that plays in
   place. What each block says comes from journal-blocks.js (blockView); this file only draws it. Pictures and memos are
   main's JournalMediaStore blobs, held while shown (main's useMediaUrl); a gate boot reads facts.journalMedia instead. */
import { Icon } from '../Icon.jsx';
import { clock, waveBars } from '../journal-blocks.js';

const g = /** @type {any} */ (globalThis);

/**
 * A picture's or a memo's blob URL from main's JournalMediaStore, held while the block shows it (main's useMediaUrl, W17:
 * the store's cap never revokes a URL in use); `missing` only once the record or its blob is known to be gone. A gate
 * boot hands `gateMedia` ({ id: url }) and nothing is read.
 * @param {string | null} mediaId @param {Record<string, string> | null} gateMedia
 * @returns {{ url: string | null, missing: boolean }}
 */
export function useMediaUrl(mediaId, gateMedia = null) {
  const [state, setState] = React.useState(() => (gateMedia
    ? { url: (mediaId && gateMedia[mediaId]) || null, missing: !(mediaId && gateMedia[mediaId]) }
    : { url: null, missing: !mediaId }));
  const [dropped, setDropped] = React.useState(0);
  React.useEffect(() => {
    const S = g.JournalMediaStore;
    if (gateMedia || !mediaId || !S || typeof S.subscribeUrls !== 'function') return undefined;
    return S.subscribeUrls((ids) => { if (ids.indexOf(mediaId) >= 0) setDropped((n) => n + 1); });
  }, [mediaId, gateMedia]);
  React.useEffect(() => {
    if (gateMedia) return undefined;
    const S = g.JournalMediaStore;
    if (!mediaId) { setState({ url: null, missing: true }); return undefined; }
    if (!S) { setState({ url: null, missing: false }); return undefined; }
    let cancelled = false;
    setState({ url: null, missing: false });
    const holds = typeof S.acquireUrl === 'function' && typeof S.releaseUrl === 'function';
    Promise.resolve(holds ? S.acquireUrl(mediaId) : S.objectUrl(mediaId)).then((url) => {
      if (cancelled) return undefined;
      if (url) { setState({ url, missing: false }); return undefined; }
      return Promise.resolve(S.get(mediaId)).then((rec) => { if (!cancelled) setState({ url: null, missing: !rec || !rec.blob }); });
    }).catch(() => { if (!cancelled) setState({ url: null, missing: false }); });   // a database error says nothing about the blob
    return () => {
      cancelled = true;
      if (holds) S.releaseUrl(mediaId);
    };
  }, [mediaId, gateMedia, dropped]);
  return state;
}

/**
 * A card (3n): its overline, its title (with a chevron when it opens a page), its words cut at three lines, and where
 * it is. A tap (or Enter) opens the page.
 * @param {{ view: Record<string, any>, go: (...routes: any[]) => void }} props
 */
export function JournalCard({ view, go }) {
  const open = view.open;
  const act = open ? {
    role: 'button', tabIndex: 0, 'aria-label': view.eyebrow + ': ' + view.title,
    onClick: () => go(open),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(open); } },
  } : {};
  return (
    <div className="jcard" {...act}>
      <div className="je">{view.eyebrow}</div>
      <div className="jh"><span>{view.title}</span>{open && <Icon name="chev" />}</div>
      {view.missing ? <div className="jv jmiss">Verse text not available offline.</div>
        : view.words ? <div className="jv">{view.words}</div> : null}
      {view.meta && <div className="jm">{view.meta}</div>}
    </div>
  );
}

/**
 * A picture with its caption (main's image block); "Image missing" when its blob is gone.
 * @param {{ view: Record<string, any>, gateMedia: Record<string, string> | null, onLoaded?: () => void }} props
 */
export function JournalImage({ view, gateMedia, onLoaded }) {
  const media = useMediaUrl(view.mediaId, gateMedia);
  return (
    <figure className="jimg">
      {media.url
        ? <img src={media.url} alt={view.caption || ''} onLoad={onLoaded} onError={onLoaded} />
        : <div className="jimg-none">{media.missing ? 'Image missing' : ''}</div>}
      {view.caption && <figcaption>{view.caption}</figcaption>}
    </figure>
  );
}

/** How many 3 px bars (2 px apart) fill the waveform's width; main's 40 before there is a width (and in jsdom). */
function useBarCount(ref) {
  const [count, setCount] = React.useState(40);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setCount(Math.max(8, Math.floor((w + 2) / 5)));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return count;
}

/**
 * A voice memo that plays in place (main's JournalAudioBlock): Play / Pause, the waveform lit up to the playhead (a
 * slider: a tap or the arrow keys seek), its caption and "0:18 / 1:12". "Recording missing" when its blob is gone. A
 * gate boot draws `gateMemo` ({ at }: playing, that many seconds in) and plays nothing.
 * @param {{ view: Record<string, any>, gateMedia: Record<string, string> | null, gateMemo: { at?: number } | null }} props
 */
export function JournalMemo({ view, gateMedia, gateMemo }) {
  const media = useMediaUrl(view.mediaId, gateMedia);
  const audioRef = React.useRef(/** @type {HTMLAudioElement | null} */ (null));
  const wavRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [playing, setPlaying] = React.useState(!!gateMemo);
  const [cur, setCur] = React.useState(gateMemo ? gateMemo.at || 0 : 0);
  const [metaDur, setMetaDur] = React.useState(0);
  const count = useBarCount(wavRef);
  const total = view.duration || metaDur || 0;
  const caption = view.caption || 'Voice memo';

  if (media.missing && !gateMemo) {
    return (
      <div className="jmemo">
        <div className="jmb">
          <div className="jmt"><span>{caption}</span>{total > 0 && <span className="num">{clock(total)}</span>}</div>
          <div className="jmiss">Recording missing</div>
        </div>
      </div>
    );
  }

  const toggle = () => {
    const a = audioRef.current;
    if (gateMemo || !a) return;
    if (playing) a.pause();
    else Promise.resolve(a.play()).catch(() => setPlaying(false));
  };
  const seekTo = (sec) => {
    const a = audioRef.current;
    if (gateMemo || !a || !(total > 0)) return;
    const t = Math.max(0, Math.min(total, sec));
    a.currentTime = t;
    setCur(t);
  };
  const onWaveClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) seekTo(((e.clientX - r.left) / r.width) * total);
  };
  const onWaveKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); seekTo(cur - 5); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); seekTo(cur + 5); }
  };
  const bars = waveBars(view.samples, count, total > 0 ? Math.min(1, cur / total) : 0);
  return (
    <div className="jmemo">
      <button type="button" className="jplay" aria-label={playing ? 'Pause' : 'Play'} disabled={!media.url && !gateMemo} onClick={toggle}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <div className="jmb">
        <div ref={wavRef} className="jwav" role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0}
          aria-valuemax={Math.round(total)} aria-valuenow={Math.round(cur)} aria-valuetext={clock(cur) + ' of ' + clock(total)}
          onClick={onWaveClick} onKeyDown={onWaveKey}>
          {bars.map((b, i) => <span key={i} className={b.played ? 'p' : undefined} style={{ height: b.h + 'px' }} />)}
        </div>
        <div className="jmt"><span>{caption}</span><span className="num">{clock(cur) + ' / ' + clock(total)}</span></div>
      </div>
      {media.url && !gateMemo && (
        <audio ref={audioRef} src={media.url} preload="metadata"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setMetaDur(d); }}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCur(0); }} />
      )}
    </div>
  );
}
