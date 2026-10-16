/* SongsScreens - Songs of the Letters in v2 (zones v2p6 to design's dz14: 6d the hub, 6e a song's page).

   Main's screens (AudioSongsScreen, SongPage, ReadWithMusic) in the kit, in main's order and words. The hub: Shuffle all,
   Find, the style chips (two rows; More opens the rest), then New from the flock, Your songs, From the letters (the four
   biggest collections, then the rest), the shelves and Letters read with music; typing or a chip turns the shelves into
   main's results. A list ({ place: 'songs', list }) is Saved, Recent, Kept, New, a collection, a shelf or a letter's
   songs, with Play all, Shuffle and Keep. A song ({ place: 'song', family }) is main's SongPage: Play, Save, the keep
   row, its versions, the lyrics and more songs of its letter.

   Main's catalog, keep store, library and player are bundle-d globals, read here and never imported (songs-facts.js).
   A gate boot draws the view gate.js pinned and touches nothing. No ... on these pages (design: nothing to hold). */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { useVotCorpus } from '../corpus.js';
import { Sheet } from '../Sheet.jsx';
import { ChoiceSheet } from './SettingsPages.jsx';
import {
  HUB_TITLE, READINGS_TITLE, NEW_ON_HUB, TILES_FIRST, VERSIONS_SHOWN, LYRIC_PREVIEW, songCountLabel, songClock, hubView,
  listView, listTitle, songView, keepRow, familyRow, leadInStyle, readingLetters, styleChips, thumbUrl,
} from '../songs-facts.js';
import { sizeLabel } from '../settings-facts.js';
import { here } from '../settings-pages.js';

const g = /** @type {any} */ (globalThis);
const NO_SUB = () => () => {};
const ZERO = () => 0;

/** Re-renders when a bundle-d store says it changed (never on a gate boot). */
function useStore(store) {
  const live = !!(store && typeof store.subscribe === 'function' && typeof store.getVersion === 'function');
  React.useSyncExternalStore(live ? store.subscribe : NO_SUB, live ? store.getVersion : ZERO);
}

/** Main's song catalog, asked for once a Songs page is up. @returns {any} null on a gate boot or before bundle-d */
function useCatalog(gate) {
  const cat = gate ? null : g.SongCatalog || null;
  useStore(cat);
  React.useEffect(() => { if (cat && !cat.loaded && !cat.error) void cat.load(); }, [cat]);
  return cat;
}

/** false while the phone has no signal (main's NetStatus); a gate boot is online. */
function useOnline(gate) {
  const net = gate ? null : g.NetStatus || null;
  useStore(net);
  return !(net && typeof net.isOffline === 'function' && net.isOffline());
}

const playerMark = () => {
  const P = g.AudioPlayer;
  const st = P && typeof P.getState === 'function' ? P.getState() : null;
  const id = st && typeof g.currentSongId === 'function' ? g.currentSongId(st) : '';
  const on = st && typeof g.playerIsActive === 'function' ? g.playerIsActive(st) : false;
  return id + '|' + (on ? 'on' : 'off');
};

/** The song the player holds and whether it sounds (rows light it; its ▶ pauses it). Re-renders on those two only. */
function usePlaying(gate) {
  const P = gate ? null : g.AudioPlayer || null;
  const mark = React.useSyncExternalStore(P && typeof P.subscribe === 'function' ? P.subscribe : NO_SUB, P ? playerMark : () => '|off');
  const cut = mark.lastIndexOf('|');
  return { id: mark.slice(0, cut), active: mark.slice(cut + 1) === 'on' };
}

/** The player's song is one of this family's. */
const familyPlays = (famId, playingId) => !!playingId && (typeof g.familyIsPlaying === 'function'
  ? g.familyIsPlaying(famId, playingId) : !!(g.SongCatalog && (g.SongCatalog.songById(playingId) || {}).f === famId));

/** Plays through main's one player, unless this is a gate boot. */
function play(gate, opts) {
  if (gate || !g.AudioPlayer) return;
  g.AudioPlayer.playSongs(opts);
}
const toggle = () => { if (g.AudioPlayer) g.AudioPlayer.toggle(); };

/**
 * Ready once the page's covers are decoded (a gate picture would catch them blank), else at once: a cover that fails,
 * or jsdom (no decode()), never holds it.
 * @param {boolean} drawn the page's content is on it @param {() => void} onReady
 */
function useReadyWithCovers(drawn, onReady) {
  const ref = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  React.useEffect(() => {
    if (!drawn) return undefined;
    let live = true;
    const imgs = ref.current ? [...ref.current.querySelectorAll('img[src]')] : [];
    const waits = imgs.map((el) => (typeof (/** @type {any} */ (el)).decode === 'function' ? (/** @type {any} */ (el)).decode().catch(() => {}) : null)).filter(Boolean);
    if (!waits.length) { onReady(); return undefined; }
    // a slow network never holds the page: 4 s at most
    const cap = new Promise((res) => setTimeout(res, 4000));
    Promise.race([Promise.all(waits), cap]).then(() => { if (live) onReady(); });
    return () => { live = false; };
  }, [drawn, onReady]);
  return ref;
}

/* ── rows ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One song or family: cover, title, its italic line (or "N versions ›" to its page), length, round ▶. The row plays.
 * @param {{ row: import('../songs-facts.js').SongRow, current: boolean, playing: boolean, onPlay: () => void,
 *   onOpen?: () => void, onRemove?: () => void, where?: string }} props
 */
function SongRow({ row, current, playing, onPlay, onOpen, onRemove, where = 'this phone' }) {
  const tap = () => (current ? toggle() : onPlay());
  return (
    <div className={'row song' + (current ? ' on' : '')} onClick={tap}>
      <img className="sc" src={thumbUrl(row.id) || undefined} alt="" />
      <div className="tx">
        <div className="t">{row.title}</div>
        <div className="s">
          {row.versions > 1 && onOpen
            ? <button type="button" className="vers" onClick={(e) => { e.stopPropagation(); onOpen(); }}>{row.versions + ' versions'}<Icon name="chev" /></button>
            : row.line ? <i>{row.line}</i> : null}
        </div>
      </div>
      {row.len ? <span className="ln num">{row.len}</span> : null}
      {onRemove
        ? <button type="button" className="btn2 sm" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={'Remove ' + row.title + ' from ' + where}>Remove</button>
        : <button type="button" className="rp" aria-label={(playing ? 'Pause ' : 'Play ') + row.title} onClick={(e) => { e.stopPropagation(); tap(); }}>
          <Icon name={playing ? 'pause' : 'play'} size={16} /></button>}
    </div>
  );
}

/**
 * A row that opens a list: its icon in a ring (Your songs) or none (the shelves), its count, a chevron.
 * @param {{ icon?: string, t: string, n: string | number, onOpen: () => void }} props
 */
function OpenRow({ icon, t, n, onOpen }) {
  return (
    <button type="button" className={'row' + (icon ? ' mine' : '')} onClick={onOpen}>
      {icon ? <span className="lead"><Icon name={icon} /></span> : null}
      <span className="tx"><span className="t">{t}</span></span>
      <span className="cnt num">{n}</span>
      <span className="chev"><Icon name="chev" /></span>
    </button>
  );
}

/** The keep row (design's one hairline row; main's SongKeepCard states). */
function KeepRow({ k, onKeep, onCancel, onRemove }) {
  if (!k) return null;
  const act = k.act === 'Keep' ? onKeep : k.act === 'Cancel' ? onCancel : k.act === 'Remove' ? onRemove : null;
  return (
    <div className="g">
      <div className={'keep k-' + k.kind}>
        <Icon name={k.kind === 'kept' ? 'checkCircle' : 'downCircle'} />
        <div className="tx">
          <div className="t">{k.t}</div>
          <div className="s" role={k.kind === 'busy' ? 'status' : undefined}>{k.s}</div>
          {k.kind === 'busy' ? <span className="kbar" aria-hidden="true"><span style={{ width: k.pct + '%' }} /></span> : null}
          {k.note ? <div className="s kn">{k.note}</div> : null}
        </div>
        {act ? <button type="button" className={'btn2 sm' + (k.off ? ' disabled' : '')} disabled={!!k.off} onClick={act}>{k.act}</button> : null}
      </div>
    </div>
  );
}

/** The keep store's state for these songs (real boot), or the gate's. */
function useKeep(gate, ids, unit, device, canRemove = false) {
  const keep = gate ? null : g.SongKeep || null;
  useStore(keep);
  const online = useOnline(gate);
  if (gate) return { k: gate.facts && gate.facts.songs && gate.facts.songs.keep ? keepRow({ ...gate.facts.songs.keep, unit, online: true, waiting: false, device, canRemove }) : null, keep: null };
  if (!keep || !ids.length) return { k: null, keep };
  let avail = 'none';
  let p = null;
  try { avail = keep.availability(); p = keep.progressOf(ids); } catch (_e) { /* no keep here */ }
  const waiting = typeof keep.waiting === 'function' && !!keep.waiting();
  return { k: keepRow({ avail, p, unit, online, waiting, device, canRemove }), keep };
}

/* ── the hub (6d) ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** @param {{ route: any, gate: any, go: (r: any) => void, replace: (r: any) => void, desktop: boolean, device: string, cat: any,
 *   onReady: () => void }} props */
function SongsHub({ route, gate, go, replace, desktop, device, cat, onReady }) {
  const library = gate ? null : g.AudioLibraryStore || null;
  useStore(library);
  useStore(gate ? null : g.SongKeep);
  const corpus = useVotCorpus();
  const now = usePlaying(gate);
  const [query, setQuery] = React.useState(route.q || '');
  const [style, setStyle] = React.useState(route.st || '');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [allTiles, setAllTiles] = React.useState(false);
  const loaded = !!gate || !!(cat && cat.loaded);
  const version = cat ? cat.getVersion() : 0;
  /** @type {import('../songs-facts.js').HubView | null} */
  const view = React.useMemo(() => (gate ? (gate.facts && gate.facts.songs && gate.facts.songs.hub) || null
    : loaded ? hubView(cat, { library }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the catalog, library, keep and letters' versions are what it reads
  [gate, loaded, version, corpus, library && library.getVersion ? library.getVersion() : 0, g.SongKeep && !gate ? g.SongKeep.getVersion() : 0]);
  const ref = useReadyWithCovers(!!view || !!(cat && cat.error), onReady);

  // the Find words and the chip live in the route as they change, so Back from a song returns to the same results
  React.useEffect(() => {
    if (gate || ((route.q || '') === query.trim() && (route.st || '') === style)) return undefined;
    const t = setTimeout(() => {
      const next = { place: 'songs' };
      if (query.trim()) next.q = query.trim();
      if (style) next.st = style;
      replace(next);
    }, 400);
    return () => clearTimeout(t);
  }, [query, style, route.q, route.st, gate, replace]);

  const chips = view ? view.chips : { primary: [], more: [] };
  const counts = React.useMemo(() => (!gate && loaded ? styleChips(cat).counts : {}), [gate, loaded, cat, version]);  // eslint-disable-line react-hooks/exhaustive-deps
  const words = query.trim();
  const filtering = !gate && loaded && !!(words || style);
  const results = filtering && typeof g.findSongFamilies === 'function' ? g.findSongFamilies(query, style) : [];
  const styleLabel = (key) => (chips.primary.concat(chips.more).find((c) => c.key === key) || { label: key }).label;
  const shuffleLabel = style ? 'Shuffle ' + styleLabel(style) + ' (' + (counts[style] || 0).toLocaleString('en-US') + ')' : 'Shuffle all songs';
  const shuffle = () => play(gate, { filter: style ? { style } : {}, shuffle: true, onePerFamily: true, label: style ? styleLabel(style) + ' songs' : HUB_TITLE });
  const open = (r) => { if (!gate) go(r); };
  const moreOn = chips.more.some((c) => c.key === style);

  const head = (
    <div className="page-head g">
      <span className="overline eyebrow">Sung by the flock</span>
      <h1 className="display">{HUB_TITLE}</h1>
      <p className="lede">Songs made by members of the flock with Suno, from the words of The Volumes of Truth.</p>
      {loaded ? (
        <>
          <div className="actions"><button type="button" className="pill sm2" onClick={shuffle}><Icon name="play" size={20} />{shuffleLabel}</button></div>
          <div className="field">
            <input className="q" type="search" value={query} placeholder="Find a song, a letter, or a maker" aria-label="Find a song"
              autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" readOnly={!!gate}
              onChange={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            {query ? <button type="button" className="clear" aria-label="Clear the song search" onClick={() => setQuery('')}><Icon name="close" /></button> : <Icon name="search" />}
          </div>
          <div className="chips wrap" role="group" aria-label="Styles">
            <button type="button" className={'chip' + (!style ? ' on' : '')} aria-pressed={!style} onClick={() => setStyle('')}>All</button>
            {chips.primary.map((c) => (
              <button key={c.key} type="button" className={'chip' + (style === c.key ? ' on' : '')} aria-pressed={style === c.key}
                onClick={() => setStyle(style === c.key ? '' : c.key)}>{c.label}</button>
            ))}
            {chips.more.length ? (
              <button type="button" className={'chip more' + (moreOn ? ' on' : '')} aria-haspopup="dialog" onClick={() => { if (!gate) setMoreOpen(true); }}>
                {moreOn ? styleLabel(style) : 'More'}<Icon name="chev" />
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );

  let body;
  if (!loaded) {
    body = cat && cat.error ? (
      <div className="g sg-state" role="status">
        <p className="lede">Songs need a connection the first time.</p>
        <button type="button" className="btn2" onClick={() => { void cat.load(); }}>Try again</button>
      </div>
    ) : (
      <div className="rows sg-sk" role="status" aria-label="Loading songs">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="row song"><span className="sc" /><span className="tx"><i /><i /></span></div>)}
      </div>
    );
  } else if (filtering) {
    const leads = results.map((fam) => leadInStyle(cat, fam, style));
    const playResult = (song) => play(gate, { ids: leads.filter(Boolean).map((s) => s.id), startId: song.id, label: HUB_TITLE });
    body = (
      <>
        <div className="sec g sec-a">
          <span className="label">{style && !words ? styleLabel(style) : 'Songs'}</span>
          <span className="cnt num" aria-live="polite">{songCountLabel(results.length)}</span>
        </div>
        {results.length ? (
          <div className="rows">
            {results.map((fam, i) => {
              const row = familyRow(cat, fam, leads[i]);
              if (!row) return null;
              const cur = familyPlays(fam.id, now.id);
              return <SongRow key={fam.id} row={row} current={cur} playing={cur && now.active} onPlay={() => playResult(leads[i])}
                onOpen={() => open({ place: 'song', family: fam.id })} />;
            })}
          </div>
        ) : <p className="g fine sg-empty">No song by that name. Try a word from the letter.</p>}
      </>
    );
  } else if (view) {
    const newest = view.newest;
    const tiles = allTiles ? view.tiles : view.tiles.slice(0, TILES_FIRST);
    body = (
      <>
        {newest.length ? (
          <>
            <div className="sec g sec-a">
              <span className="label">New from the flock</span>
              {newest.length > NEW_ON_HUB ? <button type="button" className="see" onClick={() => open({ place: 'songs', list: 'new' })}>See all<Icon name="chev" /></button> : null}
            </div>
            <div className="rows">
              {newest.slice(0, NEW_ON_HUB).map((row) => {
                const cur = now.id === row.id;
                return <SongRow key={row.id} row={row} current={cur} playing={cur && now.active}
                  onPlay={() => play(gate, { ids: newest.map((x) => x.id), startId: row.id, label: 'New from the flock' })}
                  onOpen={() => open({ place: 'song', family: row.fam })} />;
              })}
            </div>
          </>
        ) : null}
        <div className="sec g"><span className="label">Your songs</span></div>
        <div className="rows">
          <OpenRow icon="bookmark" t="Saved songs" n={view.saved} onOpen={() => open({ place: 'songs', list: 'saved' })} />
          <OpenRow icon="history" t="Recently played songs" n={view.recent} onOpen={() => open({ place: 'songs', list: 'recent' })} />
          {view.kept != null ? <OpenRow icon="downCircle" t={'Kept on ' + here(device)} n={view.kept} onOpen={() => open({ place: 'songs', list: 'kept' })} /> : null}
        </div>
        {view.tiles.length ? (
          <>
            <div className="sec g"><span className="label">From the letters</span></div>
            <div className="g">
              <div className="stiles">
                {tiles.map((t) => (
                  <button key={t.col} type="button" className="stile" onClick={() => open({ place: 'songs', list: 'col:' + t.col })}>
                    <span className="mos">{t.covers.map((c, i) => <img key={i} src={thumbUrl(c) || undefined} alt="" />)}</span>
                    <span className="tx"><span className="t">{t.label}</span><span className="s">{t.n}</span></span>
                  </button>
                ))}
              </div>
              {view.tiles.length > TILES_FIRST ? (
                <button type="button" className="see more-c" aria-expanded={allTiles} onClick={() => setAllTiles(!allTiles)}>
                  {allTiles ? 'Show fewer collections' : 'Show all ' + view.tiles.length + ' collections'}<Icon name="chev" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="rows end sg-shelves" aria-label="More songs">
          {view.shelves.map((s) => <OpenRow key={s.v} t={s.title} n={s.n} onOpen={() => open({ place: 'songs', list: s.v })} />)}
          {view.readings ? <OpenRow t={READINGS_TITLE} n={songCountLabel(view.readings, 'letter', 'letters')} onOpen={() => open({ place: 'songs', list: 'readings' })} /> : null}
        </div>
      </>
    );
  }

  return (
    <div ref={ref}>
      {head}
      <OfflineNote gate={gate} device={device} />
      {body}
      {moreOpen && (
        <ChoiceSheet title="More styles" value={style} desktop={desktop}
          options={chips.more.map((c) => ({ id: c.key, label: c.label, s: songCountLabel(c.n) }))}
          onPick={(id) => { setMoreOpen(false); setStyle(id); }} onClose={() => setMoreOpen(false)} />
      )}
    </div>
  );
}

/** Main's offline note on every Songs page. @param {{ gate: any, device: string }} props */
function OfflineNote({ gate, device }) {
  const online = useOnline(gate);
  return online ? null : <p className="g fine sg-off" role="status">{'You’re offline. Songs kept on ' + here(device) + ' still play.'}</p>;
}

/* ── a list ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** @param {{ route: any, gate: any, go: (r: any) => void, desktop: boolean, device: string, cat: any, onReady: () => void }} props */
function SongsList({ route, gate, go, desktop, device, cat, onReady }) {
  const library = gate ? null : g.AudioLibraryStore || null;
  useStore(library);
  useVotCorpus();
  const now = usePlaying(gate);
  const [asking, setAsking] = React.useState(false);
  const v = String(route.list);
  const loaded = !!(cat && cat.loaded);
  const keepStore = gate ? null : g.SongKeep || null;
  useStore(keepStore);
  const view = gate ? (gate.facts && gate.facts.songs && gate.facts.songs.list) || null : loaded ? listView(cat, v, { library, keep: keepStore, device }) : null;
  // "15 songs · 21 versions" keeps "All 21 versions"
  const unit = view && view.families && view.allIds.length > view.rows.length ? 'versions' : 'songs';
  const { k, keep } = useKeep(gate, view && v !== 'kept' ? view.allIds : [], unit, device);
  const ref = useReadyWithCovers(!!view || !!(cat && cat.error) || !!gate, onReady);
  const kept = v === 'kept';
  const missing = kept && keep ? keep.missing() || [] : [];
  const restore = useKeep(gate, missing, 'songs', device);
  const where = here(device);
  const playList = (startId, shuffle) => { if (view) play(gate, { ids: view.ids, startId, shuffle: !!shuffle, label: view.title }); };
  const open = (r) => { if (!gate) go(r); };
  const bytes = kept && keep && view ? Number(keep.bytesOf(view.ids)) || 0 : 0;

  if (!view) {
    return (
      <div ref={ref}>
        <div className="page-head g"><h1 className="display">{listTitle(cat, v, undefined, device)}</h1></div>
        {cat && cat.error ? (
          <div className="g sg-state" role="status">
            <p className="lede">Songs need a connection the first time.</p>
            <button type="button" className="btn2" onClick={() => { void cat.load(); }}>Try again</button>
          </div>
        ) : <div className="rows sg-sk" role="status" aria-label="Loading songs">{[0, 1, 2].map((i) => <div key={i} className="row song"><span className="sc" /></div>)}</div>}
      </div>
    );
  }
  return (
    <div ref={ref}>
      <div className="page-head g">
        <span className="overline eyebrow">{view.eyebrow}</span>
        <h1 className="display">{view.title}</h1>
        {view.line ? <p className="lede">{view.line}</p> : null}
        {view.ids.length ? (
          <div className="actions">
            <button type="button" className="pill sm2" onClick={() => playList(undefined, false)}><Icon name="play" size={20} />Play all</button>
            {view.ids.length > 1 ? <button type="button" className="btn2" onClick={() => playList(undefined, true)}>Shuffle</button> : null}
          </div>
        ) : null}
      </div>
      <OfflineNote gate={gate} device={device} />
      {!kept ? <KeepRow k={k} onKeep={() => keep && keep.keep(view.allIds, 'keep-list-' + v)} onCancel={() => keep && keep.cancel(view.allIds)}
        onRemove={() => keep && keep.remove(view.allIds)} /> : null}
      {kept && missing.length ? (
        <>
          <p className="g fine">{'Your backup lists ' + songCountLabel(missing.length) + ' kept on ' + where + ' that are not on it now.'}</p>
          <KeepRow k={restore.k} onKeep={() => keep && keep.keep(missing, 'keep-restore')} onCancel={() => keep && keep.cancel(missing)} onRemove={null} />
        </>
      ) : null}
      {kept && view.ids.length ? (
        <div className="g"><button type="button" className="see" onClick={() => setAsking(true)}>Remove all from {where}</button></div>
      ) : null}
      {view.rows.length ? (
        <div className="rows end">
          {view.rows.map((row) => {
            const cur = view.families ? familyPlays(row.fam, now.id) : now.id === row.id;
            return <SongRow key={row.fam + ':' + row.id} row={row} current={cur} playing={cur && now.active} onPlay={() => playList(row.id, false)}
              onOpen={() => open({ place: 'song', family: row.fam })} onRemove={kept ? () => keep && keep.remove([row.id]) : undefined} where={where} />;
          })}
        </div>
      ) : <p className="g fine sg-empty">{view.empty}</p>}
      {asking && (
        // the scrim, Escape and Back keep them (the safe answer)
        <Sheet kind="ask" label="Remove all kept songs" onClose={() => setAsking(false)} desktop={desktop}>
          <div className="sh">{'Remove all ' + songCountLabel(view.ids.length) + ' (' + sizeLabel(bytes) + ') from ' + where + '?'}</div>
          <p className="fine">They can be kept again.</p>
          <div className="stack">
            <button type="button" className="pill block danger" onClick={() => { setAsking(false); if (keep) void keep.removeAll(); }}><span>Yes, remove all</span></button>
            <button type="button" className="btn2 block" onClick={() => setAsking(false)}>Keep them</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ── Letters read with music ──────────────────────────────────────────────────────────────────────────────────────── */

const readingMark = () => {
  const P = g.AudioPlayer;
  const st = P && typeof P.getState === 'function' ? P.getState() : null;
  const cur = st && Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const on = st && typeof g.playerIsActive === 'function' ? g.playerIsActive(st) : false;
  return (cur ? cur.key + '|' + (cur.readerCode || '') : '|') + '|' + (on ? 'on' : 'off');
};

/** Main's ReadWithMusic: letters read over music (reader M); a row plays it, Read-along plays it and opens the letter. */
function Readings({ gate, go, cat, onReady }) {
  const corpus = useVotCorpus();
  const P = gate ? null : g.AudioPlayer || null;
  // the reading it holds and whether it sounds, as one string (the player notifies every second while it plays)
  React.useSyncExternalStore(P && P.subscribe ? P.subscribe : NO_SUB, P ? readingMark : () => '');
  const st = P ? P.getState() : null;
  const online = useOnline(gate);
  const rows = React.useMemo(() => readingLetters(cat), [cat, corpus, cat && cat.getVersion ? cat.getVersion() : 0]);  // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (corpus !== 'loading') onReady(); }, [corpus, onReady]);
  const cur = st && Array.isArray(st.queue) ? st.queue[st.qi] : null;
  const active = !!st && typeof g.playerIsActive === 'function' && g.playerIsActive(st);
  const playRow = (row) => {
    if (!P) return;
    if (cur && cur.key === row.key && cur.readerCode === 'M') { P.toggle(); return; }
    P.playLetter({ volKey: row.volKey, letter: { id: row.id, title: row.title }, collectionLabel: row.colLabel || null, reader: 'M' });
  };
  const readAlong = (row) => {
    if (!(cur && cur.key === row.key && cur.readerCode === 'M' && active)) playRow(row);
    const letters = typeof g.colLetterArr === 'function' && g.COL_BY_KEY ? g.colLetterArr(g.COL_BY_KEY.get(row.volKey)) || [] : [];
    const l = letters.find((x) => x && x.id === row.id);
    if (l && typeof l.num === 'number' && !gate) go({ place: 'letter', collection: row.volKey, n: l.num });
  };
  return (
    <>
      <div className="page-head g">
        <span className="overline eyebrow">Read with music</span>
        <h1 className="display">{READINGS_TITLE}</h1>
        <p className="lede">Letters of The Volumes, read aloud over music. The words light up as they are read.</p>
      </div>
      {rows.length ? (
        <div className="rows end">
          {rows.map((row) => {
            const here = !!(cur && cur.key === row.key && cur.readerCode === 'M');
            const off = !online && !here && !(P && typeof P.playableNow === 'function' && P.playableNow(row.volKey, row.id));
            return (
              <div key={row.key} className={'row song rd' + (here ? ' on' : '') + (off ? ' off' : '')}>
                <div className="tx"><div className="t">{row.title}</div><div className="s">{row.colLabel}</div></div>
                {row.d ? <span className="ln num">{songClock(row.d)}</span> : null}
                <button type="button" className="btn2 sm" disabled={off} onClick={() => readAlong(row)} aria-label={'Read along with ' + row.title}>Read-along</button>
                <button type="button" className="rp" disabled={off} aria-label={(here && active ? 'Pause ' : 'Play ') + row.title + ', read with music'} onClick={() => playRow(row)}>
                  <Icon name={here && active ? 'pause' : 'play'} size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : <p className="g fine sg-empty">The letters are still loading.</p>}
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function SongsScreen(props) {
  const cat = useCatalog(props.gate);
  if (props.route.list === 'readings') return <Readings gate={props.gate} go={props.go} cat={cat} onReady={props.onReady} />;
  if (props.route.list) return <SongsList route={props.route} gate={props.gate} go={props.go} desktop={props.desktop} device={props.device} cat={cat} onReady={props.onReady} />;
  return <SongsHub route={props.route} gate={props.gate} go={props.go} replace={props.replace} desktop={props.desktop} device={props.device} cat={cat} onReady={props.onReady} />;
}

/* ── a song (6e) ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The lyrics of the version with words: main's loader on a real boot (one fetch, cached by the browser), the gate's lines. */
function useLyrics(gate, cat, id) {
  const [lines, setLines] = React.useState(/** @type {Array<{ t: string }> | null} */ (null));
  React.useEffect(() => {
    if (gate || !id || !cat || typeof g.loadSongLyrics !== 'function') return undefined;
    let live = true;
    setLines(null);
    Promise.resolve(g.loadSongLyrics(cat.songById(id))).then((r) => { if (live) setLines(r && Array.isArray(r.lines) ? r.lines : []); }, () => { if (live) setLines([]); });
    return () => { live = false; };
  }, [gate, cat, id]);
  if (gate) return (gate.facts && gate.facts.songs && gate.facts.songs.lyrics || []).map((t) => ({ t }));
  return lines || [];
}

/** @param {import('../places.js').PlaceProps} props */
export function SongScreen({ route, gate, go, device, onReady }) {
  const cat = useCatalog(gate);
  const corpus = useVotCorpus();
  const library = gate ? null : g.AudioLibraryStore || null;
  useStore(library);
  const online = useOnline(gate);
  const now = usePlaying(gate);
  const [allVersions, setAllVersions] = React.useState(false);
  const [allLyrics, setAllLyrics] = React.useState(false);
  const loaded = !!gate || !!(cat && cat.loaded);
  const version = cat ? cat.getVersion() : 0;
  /** @type {import('../songs-facts.js').SongView | null} */
  const view = React.useMemo(() => (gate ? (gate.facts && gate.facts.songs && gate.facts.songs.song) || null : loaded ? songView(cat, route.family) : null),
    [gate, loaded, version, corpus, route.family]);  // eslint-disable-line react-hooks/exhaustive-deps
  const ids = view ? view.versions.map((x) => x.id) : [];
  const { k, keep } = useKeep(gate, ids, 'versions', device, true);
  const lines = useLyrics(gate, cat, view ? view.worded : '');
  const ref = useReadyWithCovers(loaded || !!(cat && cat.error), onReady);

  if (!loaded || !view) {
    return (
      <div ref={ref}>
        {cat && cat.error ? (
          <div className="page-head g sg-state" role="status">
            <p className="lede">Songs need a connection the first time.</p>
            <button type="button" className="btn2" onClick={() => { void cat.load(); }}>Try again</button>
          </div>
        ) : loaded ? <div className="page-head g"><p className="lede">This song is no longer shared.</p></div> : null}
      </div>
    );
  }
  const playing = familyPlays(view.fam, now.id);
  const savedIds = gate ? (gate.facts.songs && gate.facts.songs.saved ? [view.lead] : [])
    : library && typeof library.isSongSaved === 'function' ? ids.filter((id) => library.isSongSaved(id)) : [];
  const saved = savedIds.length > 0;
  const toggleSave = () => {
    if (gate || !library || typeof library.toggleSongSaved !== 'function') return;
    if (saved) { savedIds.forEach((id) => library.toggleSongSaved(id)); return; }
    // the desk saves the version playing, so the page saves the one playing here, else the one Play plays
    library.toggleSongSaved(playing && ids.indexOf(now.id) >= 0 ? now.id : view.lead);
  };
  const playVersion = (id) => {
    if (now.id === id) { toggle(); return; }
    play(gate, { filter: { family: view.fam }, startId: id, label: view.title });
  };
  const lit = playing && ids.indexOf(now.id) >= 0 ? now.id : view.lead;
  const shown = allVersions ? view.versions : view.versions.slice(0, VERSIONS_SHOWN);
  const kept = (id) => !!(g.SongKeep && !gate && g.SongKeep.isKept(id));
  return (
    <div ref={ref}>
      <div className="page-head g">
        <img className="sp-cover" src={thumbUrl(view.lead, 512) || undefined} alt="" />
        <span className="overline eyebrow">{view.eyebrow}</span>
        <h1 className="display">{view.title}</h1>
        {view.letter ? (
          <button type="button" className="sp-from" onClick={() => { if (!gate && view.letter && view.letter.route) go(view.letter.route); }}>
            {view.from + ' ' + (view.letter.title || 'Open the letter')}<Icon name="chev" />
          </button>
        ) : null}
        <p className="sp-meta">{view.shelf ? <>{view.shelf}<br /></> : null}{view.makers}</p>
        <div className="actions">
          <button type="button" className="pill sm2" onClick={() => (playing ? toggle() : playVersion(view.lead))}>
            <Icon name={playing && now.active ? 'pause' : 'play'} size={20} />{playing && now.active ? 'Pause' : 'Play'}
          </button>
          <button type="button" className={'btn2' + (saved ? ' pressed' : '')} aria-pressed={saved} onClick={toggleSave}>
            <Icon name="bookmark" on={saved} />{saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
      <OfflineNote gate={gate} device={device} />
      <KeepRow k={k} onKeep={() => keep && keep.keep(ids, 'keep-fam-' + view.fam)} onCancel={() => keep && keep.cancel(ids)} onRemove={() => keep && keep.remove(ids)} />
      {view.versions.length > 1 ? (
        <>
          <div className="sec g"><span className="label">Versions</span></div>
          <div className="rows">
            {shown.map((x) => {
              const now1 = now.id === x.id;
              // offline, a version not kept here cannot play; the one playing can always pause
              const off = !online && !now1 && !kept(x.id);
              return (
                <div key={x.id} className={'row ver' + (x.id === lit ? ' on' : '') + (off ? ' off' : '')} onClick={off ? undefined : () => playVersion(x.id)}>
                  <div className="tx"><div className="t">{x.label}</div></div>
                  <span className="ln num">{x.len}</span>
                  <button type="button" className="rp" disabled={off} aria-label={(now1 && now.active ? 'Pause ' : 'Play ') + x.label}
                    onClick={(e) => { e.stopPropagation(); playVersion(x.id); }}><Icon name={now1 && now.active ? 'pause' : 'play'} size={16} /></button>
                </div>
              );
            })}
          </div>
          {view.versions.length > VERSIONS_SHOWN && !allVersions ? (
            <div className="g"><button type="button" className="see" onClick={() => setAllVersions(true)}>{'Show all ' + view.versions.length + ' versions'}<Icon name="chev" /></button></div>
          ) : null}
        </>
      ) : null}
      {view.instrumental ? (
        <>
          <div className="sec g"><span className="label">Lyrics</span></div>
          <div className="g lyr"><p>Instrumental</p></div>
        </>
      ) : lines.length ? (
        <>
          <div className="sec g"><span className="label">Lyrics</span></div>
          <div className="g lyr">
            {(allLyrics ? lines : lines.slice(0, LYRIC_PREVIEW)).map((l, i) => <p key={i}>{l.t}</p>)}
            {lines.length > LYRIC_PREVIEW ? (
              <button type="button" className="see" aria-expanded={allLyrics} onClick={() => setAllLyrics(!allLyrics)}>{allLyrics ? 'Show less' : 'Show all lyrics'}<Icon name="chev" /></button>
            ) : null}
            <p className="fine">{view.foot}</p>
          </div>
        </>
      ) : null}
      {view.more.length ? (
        <>
          <div className="sec g"><span className="label">More songs from this letter</span></div>
          <div className="rows">
            {view.more.map((row) => {
              const cur = familyPlays(row.fam, now.id);
              return <SongRow key={row.fam} row={row} current={cur} playing={cur && now.active}
                onPlay={() => play(gate, { filter: { family: row.fam }, startId: row.id, label: row.title })}
                onOpen={() => { if (!gate) go({ place: 'song', family: row.fam }); }} />;
            })}
          </div>
          {view.moreAll > view.more.length + 1 && view.letter ? (
            <div className="g"><button type="button" className="see" onClick={() => { if (!gate && view.letter) go({ place: 'songs', list: 'letter:' + view.letter.key }); }}>
              {'All ' + view.moreAll + ' songs of this letter'}<Icon name="chev" /></button></div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** What Back says on the page above a Songs page (on the laptop, App's DESKTOP_QUERY, Kept is on this computer). */
function songsTitle(route) {
  if (!route.list) return HUB_TITLE;
  const wide = typeof g.matchMedia === 'function' && g.matchMedia('(min-width: 1024px)').matches;
  return listTitle(g.SongCatalog || null, String(route.list), g, wide ? 'computer' : 'phone');
}
function songTitle(route) {
  const cat = g.SongCatalog;
  const fam = cat && cat.loaded ? cat.familyById(route.family) : null;
  return (fam && fam.t) || 'Song';
}

definePlace('songs', { Screen: SongsScreen, title: songsTitle, contentClass: 'content songs' });
definePlace('song', { Screen: SongScreen, title: songTitle, contentClass: 'content songs sp' });
